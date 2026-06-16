import {
  DailyMemoryDigest,
  DatabaseManager,
  ProceduralSkill,
  ProceduralSkillFeedback,
  ProceduralSkillFeedbackInput,
  ProceduralSkillSearchResult,
} from './db';
import { getEmbedding } from './embedding';
import { decideProceduralSkillPromotion } from './memory-policy';

export interface ProceduralRecommendationSignal {
  reasons: string[];
  score: number;
  state: 'recommended' | 'suppressed' | 'retire_candidate' | 'watch';
}

interface ProceduralFeedbackSummary {
  failure: number;
  last_feedback_at: string | null;
  last_outcome: string | null;
  rejected: number;
  skipped: number;
  success: number;
  total: number;
}

export interface PromoteProceduralSkillCandidateInput {
  candidate: unknown;
  dbManager: DatabaseManager;
  digest?: DailyMemoryDigest | null;
  projectPath: string;
  sourceObservationIds?: string[];
}

export async function promoteProceduralSkillCandidate(
  input: PromoteProceduralSkillCandidateInput
): Promise<ProceduralSkill> {
  const decision = decideProceduralSkillPromotion(input.candidate);
  if (decision.action !== 'promote_draft' || !decision.candidate) {
    throw new Error(decision.reasons[0] || 'Skill candidate cannot be promoted.');
  }

  const candidate = decision.candidate;
  const embedding = await getEmbedding(
    [candidate.title, candidate.summary, candidate.trigger_text, ...candidate.steps, ...candidate.tags].join(' ')
  );

  return input.dbManager.saveProceduralSkill({
    project_path: input.projectPath,
    title: candidate.title,
    summary: candidate.summary,
    trigger_text: candidate.trigger_text,
    steps: candidate.steps,
    tags: candidate.tags,
    confidence: candidate.confidence,
    status: 'draft',
    source_digest_id: input.digest?.id || null,
    source_observation_ids: input.sourceObservationIds || input.digest?.source_observation_ids || [],
    embedding,
  });
}

export async function recordProceduralSkillFeedback(
  dbManager: DatabaseManager,
  input: ProceduralSkillFeedbackInput
): Promise<ProceduralSkillFeedback> {
  return dbManager.recordProceduralSkillFeedback(input);
}

export async function enrichProceduralSkillForOps(
  dbManager: DatabaseManager,
  skill: ProceduralSkill,
  options: { asOf?: string; feedbackLimit?: number } = {}
): Promise<ProceduralSkill> {
  const feedbackHistory = await dbManager.listProceduralSkillFeedback({
    skillId: skill.id,
    projectPath: skill.project_path,
    asOf: options.asOf,
    limit: options.feedbackLimit || 5,
  });
  const feedbackSummary = skill.feedback_summary || summarizeProceduralFeedback(feedbackHistory);
  return {
    ...skill,
    feedback_history: feedbackHistory,
    feedback_summary: feedbackSummary,
    lifecycle_signal: deriveProceduralLifecycleSignal(skill, feedbackSummary),
  };
}

export async function enrichProceduralSkillSearchResults(
  dbManager: DatabaseManager,
  results: ProceduralSkillSearchResult[],
  options: { asOf?: string; feedbackLimit?: number } = {}
): Promise<ProceduralSkillSearchResult[]> {
  return Promise.all(
    results.map(async (skill) => {
      const feedbackHistory = await dbManager.listProceduralSkillFeedback({
        skillId: skill.id,
        projectPath: skill.project_path,
        asOf: options.asOf,
        limit: options.feedbackLimit || 5,
      });
      const feedbackSummary = skill.feedback_summary || summarizeProceduralFeedback(feedbackHistory);
      const lifecycleSignal = deriveProceduralLifecycleSignal(skill, feedbackSummary);
      const recommendation = deriveProceduralRecommendation(skill, feedbackSummary, lifecycleSignal);
      return {
        ...skill,
        feedback_history: feedbackHistory,
        feedback_summary: feedbackSummary,
        lifecycle_signal: lifecycleSignal,
        recommendation_state: recommendation.state,
        recommendation_score: recommendation.score,
        recommendation_reasons: recommendation.reasons,
      };
    })
  );
}

export function renderProceduralSkillForAgent(skill: ProceduralSkill): string {
  const steps = skill.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const tags = skill.tags.length > 0 ? skill.tags.join(', ') : 'none';
  return [
    `Skill: ${skill.title}`,
    `Status: ${skill.status}`,
    `Trigger: ${skill.trigger_text}`,
    `Summary: ${skill.summary}`,
    `Tags: ${tags}`,
    `Confidence: ${skill.confidence}`,
    `Success/Failure: ${skill.success_count}/${skill.failure_count}`,
    'Steps:',
    steps || '1. No steps recorded.',
  ].join('\n');
}

export function renderProceduralSkillSearchResults(results: ProceduralSkillSearchResult[]): string {
  if (results.length === 0) {
    return 'No procedural skills matched this query.';
  }

  return results
    .map((skill) => {
      return [
        `- ${skill.title} [${skill.status}] score=${skill.hybrid_score.toFixed(2)} recommendation=${skill.recommendation_state || 'watch'}(${formatSignalScore(skill.recommendation_score)})`,
        `  Trigger: ${skill.trigger_text}`,
        `  Summary: ${skill.summary}`,
        `  Success/Failure: ${skill.success_count}/${skill.failure_count}`,
        `  Evidence: source_obs=${skill.source_observation_count || 0}; last_feedback=${skill.feedback_summary?.last_feedback_at || 'never'}`,
      ].join('\n');
    })
    .join('\n');
}

export function summarizeProceduralFeedback(feedbackHistory: ProceduralSkillFeedback[]) {
  const summary: ProceduralFeedbackSummary = {
    success: 0,
    failure: 0,
    rejected: 0,
    skipped: 0,
    total: feedbackHistory.length,
    last_feedback_at: feedbackHistory[0]?.created_at || null,
    last_outcome: feedbackHistory[0]?.outcome || null,
  };

  for (const feedback of feedbackHistory) {
    summary[feedback.outcome] += 1;
  }

  return summary;
}

export function deriveProceduralLifecycleSignal(
  skill: Pick<ProceduralSkill, 'confidence' | 'failure_count' | 'success_count'> & {
    source_observation_count?: number;
    source_observation_ids?: string[];
  },
  feedbackSummary: ProceduralFeedbackSummary
) {
  const evidenceCount = Array.isArray(skill.source_observation_ids)
    ? skill.source_observation_ids.length
    : Number(skill.source_observation_count || 0);
  const successCount = feedbackSummary.success || skill.success_count || 0;
  const failureCount = feedbackSummary.failure || skill.failure_count || 0;
  const rejectedCount = feedbackSummary.rejected || 0;
  const score = Math.max(
    0,
    Math.min(
      1,
      skill.confidence * 0.45 +
        Math.min(successCount, 4) * 0.12 +
        Math.min(evidenceCount, 4) * 0.05 -
        Math.min(failureCount, 4) * 0.16 -
        Math.min(rejectedCount, 3) * 0.08
    )
  );
  const reasons: string[] = [];

  if (successCount > 0) {
    reasons.push(`Observed ${successCount} successful feedback event(s).`);
  }
  if (evidenceCount > 0) {
    reasons.push(`Backed by ${evidenceCount} source observation(s).`);
  }
  if (failureCount > 0) {
    reasons.push(`Observed ${failureCount} failure feedback event(s).`);
  }
  if (rejectedCount > 0) {
    reasons.push(`Observed ${rejectedCount} rejected feedback event(s).`);
  }

  if (failureCount >= 2 && failureCount > successCount) {
    return {
      state: 'retire_candidate' as const,
      score,
      reasons: reasons.length ? reasons : ['Failure pressure is higher than successful reuse.'],
    };
  }

  if (feedbackSummary.skipped >= 2 && successCount === 0) {
    return {
      state: 'suppressed' as const,
      score,
      reasons: reasons.length ? reasons : ['The skill is repeatedly skipped without successful reuse.'],
    };
  }

  if (successCount >= 1 || score >= 0.55) {
    return {
      state: 'stable' as const,
      score,
      reasons: reasons.length ? reasons : ['The skill has enough evidence to stay enabled.'],
    };
  }

  return {
    state: 'watch' as const,
    score,
    reasons: reasons.length ? reasons : ['The skill has limited evidence and should stay reviewable.'],
  };
}

export function deriveProceduralRecommendation(
  skill: Pick<
    ProceduralSkillSearchResult,
    'confidence' | 'hybrid_score' | 'lexical_score' | 'success_count' | 'failure_count' | 'vector_score'
  >,
  feedbackSummary: ProceduralFeedbackSummary,
  lifecycleSignal: ReturnType<typeof deriveProceduralLifecycleSignal>
): ProceduralRecommendationSignal {
  const successCount = feedbackSummary.success || skill.success_count || 0;
  const failureCount = feedbackSummary.failure || skill.failure_count || 0;
  const score = Math.max(
    0,
    Math.min(
      1,
      skill.hybrid_score * 0.45 +
        skill.vector_score * 0.15 +
        skill.lexical_score * 0.1 +
        skill.confidence * 0.15 +
        Math.min(successCount, 4) * 0.05 -
        Math.min(failureCount, 4) * 0.08
    )
  );
  const reasons = [
    `Hybrid relevance ${skill.hybrid_score.toFixed(2)} combines lexical ${skill.lexical_score.toFixed(2)} and vector ${skill.vector_score.toFixed(2)} matching.`,
    ...lifecycleSignal.reasons,
  ];

  if (lifecycleSignal.state === 'retire_candidate') {
    return {
      state: 'retire_candidate',
      score,
      reasons,
    };
  }

  if (score >= 0.52) {
    return {
      state: 'recommended',
      score,
      reasons,
    };
  }

  if (lifecycleSignal.state === 'suppressed' || score < 0.25) {
    return {
      state: 'suppressed',
      score,
      reasons,
    };
  }

  return {
    state: 'watch',
    score,
    reasons,
  };
}

function formatSignalScore(score: number | null | undefined) {
  return typeof score === 'number' ? score.toFixed(2) : 'n/a';
}
