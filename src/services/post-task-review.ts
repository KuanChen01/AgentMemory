import { DatabaseManager, Observation, PostTaskReview } from './db';
import {
  decidePostTaskReviewPolicy,
  PostTaskReviewPolicyDecision,
} from './memory-policy';
import { resolveMemoryQuery } from './memory-query';

export interface AutomaticPostTaskReviewResult {
  decision: PostTaskReviewPolicyDecision;
  review: PostTaskReview | null;
}

export async function runAutomaticPostTaskReview(
  dbManager: DatabaseManager,
  observation: Observation
): Promise<AutomaticPostTaskReviewResult> {
  const decision = decidePostTaskReviewPolicy({
    observation,
    source: 'tool_log',
  });

  if (decision.action === 'skip') {
    return {
      decision,
      review: null,
    };
  }

  const queryResult = await resolveMemoryQuery(dbManager, {
    projectPath: observation.project_path,
    query: decision.queryText,
    limit: decision.observationLimit,
    mode: decision.mode,
    skillLimit: decision.skillLimit,
    windowCharBudget: decision.windowCharBudget,
  });

  const review = await dbManager.savePostTaskReview({
    project_path: observation.project_path,
    source_observation_id: observation.id,
    source_session_id: observation.session_id,
    source_agent_id: observation.agent_id,
    source_title: observation.title,
    query_text: decision.queryText,
    matched_skill_titles: queryResult.procedural_skills.map((skill) => skill.title),
    recommendation_states: queryResult.procedural_skills.map(
      (skill) => skill.recommendation_state || 'watch'
    ),
    bounded_context: queryResult.bounded_context,
    decision_trace: queryResult.decision_trace,
    temporal_diagnostics: queryResult.temporal_diagnostics,
    generated_at: queryResult.generated_at,
  });

  return {
    decision,
    review,
  };
}
