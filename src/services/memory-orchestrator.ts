import {
  attachProjectContextDiagnostics,
  BoundedContextPackage,
  createBoundedContextPackage,
  MemoryDecisionTrace,
  ProjectContextView,
  TemporalSliceDiagnostics,
} from './context-view';
import { DatabaseManager, ProceduralSkillSearchResult, SearchResult } from './db';
import { getEmbedding } from './embedding';
import {
  decideMemoryReadPolicy,
  MemoryReadMode,
  MemoryReadPolicyDecision,
} from './memory-policy';
import { loadProjectContextView } from './project-context';
import { enrichProceduralSkillSearchResults } from './procedural-memory';

export interface MemoryOrchestrationRequest {
  asOf?: string;
  limit?: number;
  mode?: MemoryReadMode;
  projectPath: string;
  queryText?: string;
  skillLimit?: number;
  windowCharBudget?: number;
}

export interface MemoryOrchestrationResult {
  bounded_context: BoundedContextPackage;
  decision_trace: MemoryDecisionTrace;
  generated_at: string;
  policy: MemoryReadPolicyDecision;
  procedural_skills: ProceduralSkillSearchResult[];
  project_context: ProjectContextView;
  search_results: SearchResult[];
  temporal_diagnostics: TemporalSliceDiagnostics;
}

export async function orchestrateMemoryRead(
  dbManager: DatabaseManager,
  request: MemoryOrchestrationRequest
): Promise<MemoryOrchestrationResult> {
  const normalizedQuery = String(request.queryText || '').trim();
  const mode = request.mode || 'task_query';
  const policy = decideMemoryReadPolicy({
    asOf: request.asOf,
    mode,
    queryText: normalizedQuery,
    requestedLimit: request.limit,
    requestedSkillLimit: request.skillLimit,
    requestedWindowChars: request.windowCharBudget,
  });

  if (policy.action === 'skip') {
    throw new Error('Memory orchestration cannot proceed when the read policy action is skip.');
  }

  const queryVector =
    normalizedQuery && (policy.shouldUseObservationSearch || policy.shouldUseProceduralSkills)
      ? await getEmbedding(normalizedQuery)
      : undefined;

  const projectContext = await loadProjectContextView(dbManager, request.projectPath, policy.observationLimit, {
    asOf: request.asOf,
    includeProceduralSkills: true,
    mode,
    proceduralSkillLimit: policy.skillLimit,
    queryText: normalizedQuery || null,
    windowCharBudget: policy.windowCharBudget,
  });

  const [searchResults, rawProceduralSkills] = await Promise.all([
    policy.shouldUseObservationSearch && normalizedQuery
      ? dbManager.searchHybrid(
          request.projectPath,
          normalizedQuery,
          queryVector,
          policy.observationLimit,
          { asOf: request.asOf }
        )
      : Promise.resolve([]),
    policy.shouldUseProceduralSkills && normalizedQuery
      ? dbManager.searchProceduralSkills(
          request.projectPath,
          normalizedQuery,
          queryVector,
          policy.skillLimit,
          { asOf: request.asOf, statuses: ['enabled', 'draft'] }
        )
      : Promise.resolve([]),
  ]);

  const proceduralSkills = await enrichProceduralSkillSearchResults(dbManager, rawProceduralSkills, {
    asOf: request.asOf,
  });
  const boundedContext = createBoundedContextPackage({
    asOf: request.asOf || null,
    currentState: projectContext.current_state,
    dailyDigests: projectContext.daily_digests,
    matchedObservations: searchResults,
    mode,
    proceduralSkills:
      proceduralSkills.length > 0 ? proceduralSkills : projectContext.procedural_skills,
    queryText: normalizedQuery || null,
    recommendedCharBudget: policy.windowCharBudget,
    summaryBlocks: projectContext.summary_blocks,
  });
  const temporalDiagnostics = buildTemporalSliceDiagnostics({
    asOf: request.asOf || null,
    mode,
    projectContext,
    searchResults,
  });
  const decisionTrace = buildDecisionTrace({
    asOf: request.asOf || null,
    boundedContext,
    generatedAt: new Date().toISOString(),
    mode,
    policy,
    proceduralSkills,
    projectContext,
    queryText: normalizedQuery || null,
    searchResults,
    temporalDiagnostics,
  });

  attachProjectContextDiagnostics(projectContext, {
    boundedContext,
    decisionTrace,
    temporalDiagnostics,
  });

  return {
    bounded_context: boundedContext,
    decision_trace: decisionTrace,
    generated_at: decisionTrace.generated_at,
    policy,
    procedural_skills: proceduralSkills,
    project_context: projectContext,
    search_results: searchResults,
    temporal_diagnostics: temporalDiagnostics,
  };
}

function buildTemporalSliceDiagnostics(input: {
  asOf: string | null;
  mode: MemoryReadMode;
  projectContext: ProjectContextView;
  searchResults: SearchResult[];
}): TemporalSliceDiagnostics {
  return {
    as_of: input.asOf,
    future_protection: true,
    mode: input.asOf ? 'historical' : 'latest',
    layer_diagnostics: [
      {
        applied_as_of: input.asOf,
        effective_time_field: 'effective_at',
        included_count: input.projectContext.current_state.length,
        layer: 'structured_profile',
        notes: [
          input.asOf
            ? 'State facts are visible only when effective_at <= as_of and superseded_at remains after the slice.'
            : 'Latest state facts are resolved from active rows only.',
        ],
        recorded_time_field: 'recorded_at',
      },
      {
        applied_as_of: input.asOf,
        effective_time_field: null,
        included_count: input.projectContext.daily_digests.length,
        layer: 'recent_summary',
        notes: [
          input.asOf
            ? 'Daily digests are filtered by generated_at <= as_of.'
            : 'Recent successful daily digests are shown in recency order.',
        ],
        recorded_time_field: 'generated_at',
      },
      {
        applied_as_of: input.asOf,
        effective_time_field: null,
        included_count:
          input.mode === 'startup'
            ? input.projectContext.recent_observations.length
            : input.searchResults.length,
        layer: 'observation_ledger',
        notes: [
          input.asOf
            ? 'Observation reads compare created_at against as_of to prevent future leakage.'
            : 'Recent observation evidence is ordered by recency and query match.',
        ],
        recorded_time_field: 'created_at',
      },
      {
        applied_as_of: input.asOf,
        effective_time_field: 'status_effective_at',
        included_count: input.projectContext.procedural_skills.length,
        layer: 'procedural_memory',
        notes: [
          input.asOf
            ? 'Skill status is replayed from status events and feedback history is rebuilt only up to as_of.'
            : 'Current skill status uses the latest status event and cumulative feedback history.',
        ],
        recorded_time_field: 'created_at + feedback.created_at',
      },
    ],
  };
}

function buildDecisionTrace(input: {
  asOf: string | null;
  boundedContext: BoundedContextPackage;
  generatedAt: string;
  mode: MemoryReadMode;
  policy: MemoryReadPolicyDecision;
  proceduralSkills: ProceduralSkillSearchResult[];
  projectContext: ProjectContextView;
  queryText: string | null;
  searchResults: SearchResult[];
  temporalDiagnostics: TemporalSliceDiagnostics;
}): MemoryDecisionTrace {
  const recommendedCount = input.proceduralSkills.filter(
    (skill) => skill.recommendation_state === 'recommended'
  ).length;
  const retireCandidateCount = input.proceduralSkills.filter(
    (skill) => skill.recommendation_state === 'retire_candidate'
  ).length;

  return {
    as_of: input.asOf,
    generated_at: input.generatedAt,
    mode: input.mode,
    query_text: input.queryText,
    steps: [
      {
        step: 'policy',
        decision: `${input.policy.action} ${input.policy.layers.join(', ') || '(none)'}`,
        reasons: input.policy.reasons,
        details: {
          observation_limit: input.policy.observationLimit,
          skill_limit: input.policy.skillLimit,
          window_budget: input.policy.windowCharBudget,
        },
      },
      {
        step: 'temporal_slice',
        decision: input.temporalDiagnostics.as_of
          ? `historical slice at ${input.temporalDiagnostics.as_of}`
          : 'latest truth slice',
        reasons: input.temporalDiagnostics.layer_diagnostics.map(
          (layer) => `${layer.layer} uses recorded=${layer.recorded_time_field}`
        ),
      },
      {
        step: 'procedural_recommendation',
        decision: `${input.proceduralSkills.length} matched skills; ${recommendedCount} recommended; ${retireCandidateCount} retire candidate`,
        reasons:
          input.proceduralSkills.length > 0
            ? input.proceduralSkills
                .slice(0, 3)
                .map(
                  (skill) =>
                    `${skill.title}: ${skill.recommendation_state || 'watch'} ${String(
                      skill.recommendation_reasons?.[0] || 'No evidence reason recorded.'
                    )}`
                )
            : ['No procedural skills were matched for this request.'],
      },
      {
        step: 'bounded_context',
        decision: `${input.boundedContext.window_entries.length} entries packaged with ${input.boundedContext.char_budget_used}/${input.boundedContext.recommended_char_budget} chars`,
        reasons: [
          `Trimming order: ${input.boundedContext.trimming_order.join(' -> ')}`,
          `Observation hits packaged: ${input.searchResults.length}; startup observations visible: ${input.projectContext.recent_observations.length}`,
        ],
      },
    ],
  };
}
