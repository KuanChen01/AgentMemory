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
        `- ${skill.title} [${skill.status}] score=${skill.hybrid_score.toFixed(2)}`,
        `  Trigger: ${skill.trigger_text}`,
        `  Summary: ${skill.summary}`,
        `  Success/Failure: ${skill.success_count}/${skill.failure_count}`,
      ].join('\n');
    })
    .join('\n');
}
