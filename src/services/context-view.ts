import {
  DailyMemoryDigest,
  Observation,
  ProceduralSkill,
  ProceduralSkillFeedback,
  ProceduralSkillSearchResult,
  SearchResult,
  StateFact,
} from './db';

export interface ProjectContextSummaryBlock {
  title: string;
  created_at?: string;
  agent_id: string;
  lines: string[];
}

export interface ProjectContextRecentObservation {
  id: string;
  title: string;
  created_at?: string;
  agent_id: string;
}

export interface ProjectContextDailyDigest {
  id: string;
  local_date: string;
  status: string;
  summary: string;
  facts: string[];
  decisions: string[];
  next_actions: string[];
  source_count: number;
  confidence: number;
  generated_at: string;
}

export interface ProjectContextProceduralSkill {
  id: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  status: string;
  confidence: number;
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  created_at: string;
  source_digest_id: string | null;
  source_observation_count: number;
  status_effective_at: string | null;
  feedback_summary?: ProceduralSkillFeedbackSummary;
  feedback_history?: ProceduralSkillFeedback[];
  lifecycle_signal?: ProceduralSkillLifecycleSignal | null;
  recommendation_state?: string | null;
  recommendation_score?: number | null;
  recommendation_reasons?: string[];
}

export interface SlidingWindowEntry {
  content: string;
  created_at?: string;
  kind: 'digest' | 'observation' | 'skill' | 'state';
  layer: 'recent_summary' | 'observation_ledger' | 'procedural_memory' | 'structured_profile';
  source_id?: string;
  title: string;
  char_count: number;
  effective_at: string | null;
  recorded_at: string | null;
  priority: number;
}

export interface ProceduralSkillFeedbackSummary {
  failure: number;
  last_feedback_at: string | null;
  last_outcome: string | null;
  rejected: number;
  skipped: number;
  success: number;
  total: number;
}

export interface ProceduralSkillLifecycleSignal {
  reasons: string[];
  score: number;
  state: 'stable' | 'watch' | 'suppressed' | 'retire_candidate';
}

export interface BoundedContextLayerMetrics {
  char_count: number;
  entry_count: number;
}

export interface BoundedContextPackage {
  as_of: string | null;
  package_id: string;
  mode: string;
  query_text: string | null;
  boundary_notes: string[];
  char_budget_remaining: number;
  char_budget_used: number;
  host_responsibilities: string[];
  observation_budget: number;
  procedural_skill_budget: number;
  recent_summary_budget: number;
  recommended_char_budget: number;
  rendered_package: string;
  state_budget: number;
  trimmed_entry_count: number;
  trimming_order: string[];
  layer_metrics: {
    observation_ledger: BoundedContextLayerMetrics;
    procedural_memory: BoundedContextLayerMetrics;
    recent_summary: BoundedContextLayerMetrics;
    structured_profile: BoundedContextLayerMetrics;
  };
  window_entries: SlidingWindowEntry[];
}

export type SlidingWindowContract = BoundedContextPackage;

export interface TemporalLayerDiagnostics {
  applied_as_of: string | null;
  effective_time_field: string | null;
  included_count: number;
  layer: 'recent_summary' | 'observation_ledger' | 'procedural_memory' | 'structured_profile';
  notes: string[];
  recorded_time_field: string;
}

export interface TemporalSliceDiagnostics {
  as_of: string | null;
  future_protection: boolean;
  layer_diagnostics: TemporalLayerDiagnostics[];
  mode: 'historical' | 'latest';
}

export interface MemoryDecisionTraceStep {
  decision: string;
  details?: Record<string, unknown>;
  reasons: string[];
  step: string;
}

export interface MemoryDecisionTrace {
  as_of: string | null;
  generated_at: string;
  mode: string;
  query_text: string | null;
  steps: MemoryDecisionTraceStep[];
}

export interface ProjectContextMetadataLayer {
  as_of: string | null;
  generated_at: string;
  procedural_skill_count: number;
  project_path: string;
  recent_observation_count: number;
  state_fact_count: number;
  summary_block_count: number;
  daily_digest_count: number;
}

export interface ProjectContextMemoryLayers {
  metadata: ProjectContextMetadataLayer;
  observation_ledger: {
    recent_observations: ProjectContextRecentObservation[];
  };
  procedural_memory: {
    skills: ProjectContextProceduralSkill[];
  };
  recent_summary: {
    daily_digests: ProjectContextDailyDigest[];
    summary_blocks: ProjectContextSummaryBlock[];
  };
  sliding_window: SlidingWindowContract;
  structured_profile: {
    state_facts: StateFact[];
  };
}

export interface ProjectContextView {
  project_path: string;
  as_of: string | null;
  current_state: StateFact[];
  daily_digests: ProjectContextDailyDigest[];
  procedural_skills: ProjectContextProceduralSkill[];
  summary_blocks: ProjectContextSummaryBlock[];
  recent_observations: ProjectContextRecentObservation[];
  sliding_window: SlidingWindowContract;
  bounded_context: BoundedContextPackage;
  temporal_diagnostics: TemporalSliceDiagnostics | null;
  decision_trace: MemoryDecisionTrace | null;
  memory_layers: ProjectContextMemoryLayers;
  generated_at: string;
  disabled?: boolean;
  message?: string;
}

export interface ProjectContextViewOptions {
  asOf?: string;
  boundedContext?: BoundedContextPackage;
  decisionTrace?: MemoryDecisionTrace | null;
  mode?: string;
  proceduralSkills?: ProceduralSkill[];
  queryText?: string | null;
  temporalDiagnostics?: TemporalSliceDiagnostics | null;
  windowCharBudget?: number;
}

const DEFAULT_WINDOW_CHAR_BUDGET = 1800;

export function createProjectContextView(
  projectPath: string,
  stateFacts: StateFact[],
  recentObservations: Observation[],
  limit: number = recentObservations.length,
  dailyDigests: DailyMemoryDigest[] = [],
  options: ProjectContextViewOptions = {}
): ProjectContextView {
  const curatedObservations = selectProjectContextObservations(recentObservations, limit);
  const digestEntries = dailyDigests
    .filter((digest) => digest.status === 'success' && digest.digest)
    .map(toProjectContextDailyDigest);
  const summaryBlocks = curatedObservations.map((observation) => ({
    title: observation.title,
    created_at: observation.created_at,
    agent_id: observation.agent_id,
    lines: buildSummaryLines(observation),
  }));
  const recentObservationEntries = curatedObservations.map((observation) => ({
    id: observation.id,
    title: observation.title,
    created_at: observation.created_at,
    agent_id: observation.agent_id,
  }));
  const proceduralSkills = (options.proceduralSkills || []).map(toProjectContextProceduralSkill);
  const generatedAt = new Date().toISOString();
  const boundedContext =
    options.boundedContext ||
    createBoundedContextPackage({
      asOf: options.asOf || null,
      currentState: stateFacts,
      dailyDigests: digestEntries,
      mode: options.mode || 'startup',
      proceduralSkills,
      queryText: options.queryText || null,
      recommendedCharBudget: options.windowCharBudget || DEFAULT_WINDOW_CHAR_BUDGET,
      summaryBlocks,
    });

  const memoryLayers: ProjectContextMemoryLayers = {
    metadata: {
      as_of: options.asOf || null,
      generated_at: generatedAt,
      procedural_skill_count: proceduralSkills.length,
      project_path: projectPath,
      recent_observation_count: recentObservationEntries.length,
      state_fact_count: stateFacts.length,
      summary_block_count: summaryBlocks.length,
      daily_digest_count: digestEntries.length,
    },
    structured_profile: {
      state_facts: stateFacts,
    },
    recent_summary: {
      daily_digests: digestEntries,
      summary_blocks: summaryBlocks,
    },
    observation_ledger: {
      recent_observations: recentObservationEntries,
    },
    procedural_memory: {
      skills: proceduralSkills,
    },
    sliding_window: boundedContext,
  };

  return {
    project_path: projectPath,
    as_of: options.asOf || null,
    current_state: stateFacts,
    daily_digests: digestEntries,
    procedural_skills: proceduralSkills,
    summary_blocks: summaryBlocks,
    recent_observations: recentObservationEntries,
    sliding_window: boundedContext,
    bounded_context: boundedContext,
    temporal_diagnostics: options.temporalDiagnostics || null,
    decision_trace: options.decisionTrace || null,
    memory_layers: memoryLayers,
    generated_at: generatedAt,
  };
}

export function createDisabledProjectContextView(
  projectPath: string,
  message: string
): ProjectContextView {
  const generatedAt = new Date().toISOString();
  const emptyWindow: SlidingWindowContract = createEmptyBoundedContextPackage();

  return {
    project_path: projectPath,
    as_of: null,
    current_state: [],
    daily_digests: [],
    procedural_skills: [],
    summary_blocks: [],
    recent_observations: [],
    sliding_window: emptyWindow,
    bounded_context: emptyWindow,
    temporal_diagnostics: null,
    decision_trace: null,
    memory_layers: {
      metadata: {
        as_of: null,
        generated_at: generatedAt,
        procedural_skill_count: 0,
        project_path: projectPath,
        recent_observation_count: 0,
        state_fact_count: 0,
        summary_block_count: 0,
        daily_digest_count: 0,
      },
      structured_profile: { state_facts: [] },
      recent_summary: { daily_digests: [], summary_blocks: [] },
      observation_ledger: { recent_observations: [] },
      procedural_memory: { skills: [] },
      sliding_window: emptyWindow,
    },
    generated_at: generatedAt,
    disabled: true,
    message,
  };
}

export function attachProjectContextDiagnostics(
  view: ProjectContextView,
  diagnostics: {
    boundedContext?: BoundedContextPackage;
    decisionTrace?: MemoryDecisionTrace | null;
    temporalDiagnostics?: TemporalSliceDiagnostics | null;
  }
) {
  if (diagnostics.boundedContext) {
    view.sliding_window = diagnostics.boundedContext;
    view.bounded_context = diagnostics.boundedContext;
    view.memory_layers.sliding_window = diagnostics.boundedContext;
  }
  if (Object.prototype.hasOwnProperty.call(diagnostics, 'decisionTrace')) {
    view.decision_trace = diagnostics.decisionTrace || null;
  }
  if (Object.prototype.hasOwnProperty.call(diagnostics, 'temporalDiagnostics')) {
    view.temporal_diagnostics = diagnostics.temporalDiagnostics || null;
  }
}

export function hasProjectContextData(view: ProjectContextView): boolean {
  return (
    (Array.isArray(view.current_state) && view.current_state.length > 0) ||
    (Array.isArray(view.daily_digests) && view.daily_digests.length > 0) ||
    (Array.isArray(view.procedural_skills) && view.procedural_skills.length > 0) ||
    (Array.isArray(view.summary_blocks) && view.summary_blocks.length > 0) ||
    (Array.isArray(view.recent_observations) && view.recent_observations.length > 0)
  );
}

export function renderProjectContextView(view: ProjectContextView): string {
  if (view.disabled) {
    return `\n=== AgentMemory: Context Disabled ===\n${view.message || 'Context access is disabled.'}\n`;
  }

  if (!hasProjectContextData(view)) {
    return '';
  }

  const sections: string[] = [
    '\n=== AgentMemory: Structured Context ===',
    `Project: ${view.project_path}`,
  ];

  if (view.as_of) {
    sections.push(`As of: ${view.as_of}`);
  }

  sections.push(
    '\nMemory layers:',
    `- metadata: state_facts=${view.memory_layers.metadata.state_fact_count}, daily_digests=${view.memory_layers.metadata.daily_digest_count}, procedural_skills=${view.memory_layers.metadata.procedural_skill_count}`,
    `- structured_profile: ${view.current_state.length} facts`,
    `- recent_summary: ${view.daily_digests.length} digests, ${view.summary_blocks.length} summary blocks`,
    `- observation_ledger: ${view.recent_observations.length} recent observations`,
    `- sliding_window: ${view.sliding_window.window_entries.length} entries, budget=${view.sliding_window.recommended_char_budget} chars`
  );

  if (view.current_state.length > 0) {
    sections.push('\nCurrent structured state:');
    for (const fact of view.current_state) {
      sections.push(
        `- [${fact.entity_type}:${fact.entity_key}] ${fact.fact_key} = ${formatStateFactValue(
          fact.value
        )} (effective ${formatTimestamp(fact.effective_at)}; recorded ${formatTimestamp(
          fact.recorded_at
        )})`
      );
    }
  }

  if (view.daily_digests.length > 0) {
    sections.push('\nRecent daily digests:');
    for (const digest of view.daily_digests) {
      sections.push(
        `- ${digest.local_date}: ${digest.summary} (${formatTimestamp(digest.generated_at)})`
      );
      if (digest.facts.length > 0) {
        sections.push(`  Facts: ${digest.facts.slice(0, 3).join('; ')}`);
      }
      if (digest.decisions.length > 0) {
        sections.push(`  Decisions: ${digest.decisions.slice(0, 2).join('; ')}`);
      }
      if (digest.next_actions.length > 0) {
        sections.push(`  Next actions: ${digest.next_actions.slice(0, 2).join('; ')}`);
      }
      sections.push(`  Source observations: ${digest.source_count}; confidence: ${digest.confidence}`);
    }
  }

  if (view.procedural_skills.length > 0) {
    sections.push('\nProcedural memory:');
    for (const skill of view.procedural_skills) {
      sections.push(
        `- ${skill.title} [${skill.status}] trigger="${skill.trigger_text}" confidence=${skill.confidence}`
      );
      sections.push(`  Summary: ${skill.summary}`);
      sections.push(
        `  Success/Failure: ${skill.success_count}/${skill.failure_count}; last_used_at=${formatTimestamp(
          skill.last_used_at || undefined
        )}; status_effective_at=${formatTimestamp(skill.status_effective_at || undefined)}`
      );
      if (skill.lifecycle_signal) {
        sections.push(
          `  Lifecycle: ${skill.lifecycle_signal.state} score=${skill.lifecycle_signal.score.toFixed(2)}`
        );
      }
      if (skill.steps.length > 0) {
        sections.push(`  Steps: ${skill.steps.slice(0, 3).join(' -> ')}`);
      }
    }
  }

  if (view.summary_blocks.length > 0) {
    sections.push('\nRecent summary blocks:');
    for (const block of view.summary_blocks) {
      sections.push(
        `- ${block.title} [${block.agent_id}] (${formatTimestamp(block.created_at)})`
      );
      for (const line of block.lines) {
        sections.push(`  ${line}`);
      }
    }
  }

  if (view.temporal_diagnostics) {
    sections.push('\nTemporal slice diagnostics:');
    sections.push(
      `- mode=${view.temporal_diagnostics.mode}; future_protection=${view.temporal_diagnostics.future_protection}; as_of=${view.temporal_diagnostics.as_of || 'latest'}`
    );
    for (const layer of view.temporal_diagnostics.layer_diagnostics) {
      sections.push(
        `- ${layer.layer}: effective=${layer.effective_time_field || 'n/a'}, recorded=${layer.recorded_time_field}, count=${layer.included_count}`
      );
      for (const note of layer.notes) {
        sections.push(`  Note: ${note}`);
      }
    }
  }

  if (view.decision_trace?.steps.length) {
    sections.push('\nPolicy decision trace:');
    for (const step of view.decision_trace.steps) {
      sections.push(`- ${step.step}: ${step.decision}`);
      for (const reason of step.reasons) {
        sections.push(`  Reason: ${reason}`);
      }
    }
  }

  if (view.bounded_context.window_entries.length > 0) {
    sections.push('\nSliding window contract:');
    sections.push('- compatibility_alias=bounded_context');
    sections.push('\nBounded context package:');
    sections.push(
      `- mode=${view.bounded_context.mode}; budget=${view.bounded_context.recommended_char_budget}; used=${view.bounded_context.char_budget_used}; remaining=${view.bounded_context.char_budget_remaining}; trimmed=${view.bounded_context.trimmed_entry_count}`
    );
    sections.push(
      `- recent_summary_budget=${view.bounded_context.recent_summary_budget}, observation_budget=${view.bounded_context.observation_budget}, procedural_skill_budget=${view.bounded_context.procedural_skill_budget}, state_budget=${view.bounded_context.state_budget}`
    );
    for (const note of view.bounded_context.boundary_notes) {
      sections.push(`- note: ${note}`);
    }
    for (const responsibility of view.bounded_context.host_responsibilities) {
      sections.push(`- host: ${responsibility}`);
    }
    for (const entry of view.bounded_context.window_entries) {
      sections.push(
        `- [${entry.kind}/${entry.layer}] ${entry.title}: ${trimSummary(entry.content, 140)}`
      );
    }
  }

  if (view.recent_observations.length > 0) {
    sections.push('\nRecent observations:');
    for (const observation of view.recent_observations) {
      sections.push(
        `- ${observation.title} (${formatTimestamp(observation.created_at)} · ${observation.agent_id})`
      );
    }
  }

  sections.push('======================================\n');
  return sections.join('\n');
}

export function formatStateFactValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function buildSummaryLines(observation: Observation): string[] {
  const lines: string[] = [];

  if (observation.facts.length > 0) {
    lines.push(`Facts: ${observation.facts.slice(0, 3).join('; ')}`);
  }

  if (observation.files_modified.length > 0) {
    lines.push(`Files modified: ${observation.files_modified.join(', ')}`);
  }

  if (lines.length === 0) {
    lines.push(trimSummary(observation.narrative));
  }

  return lines;
}

function toProjectContextDailyDigest(digest: DailyMemoryDigest): ProjectContextDailyDigest {
  return {
    id: digest.id,
    local_date: digest.local_date,
    status: digest.status,
    summary: digest.digest?.summary || '',
    facts: digest.digest?.facts.slice(0, 5) || [],
    decisions: digest.digest?.decisions.slice(0, 3) || [],
    next_actions: digest.digest?.next_actions.slice(0, 3) || [],
    source_count: digest.source_count,
    confidence: digest.digest?.confidence || 0,
    generated_at: digest.generated_at,
  };
}

function toProjectContextProceduralSkill(skill: ProceduralSkill): ProjectContextProceduralSkill {
  return {
    id: skill.id,
    title: skill.title,
    summary: skill.summary,
    trigger_text: skill.trigger_text,
    steps: skill.steps,
    status: skill.status,
    confidence: skill.confidence,
    success_count: skill.success_count,
    failure_count: skill.failure_count,
    last_used_at: skill.last_used_at,
    created_at: skill.created_at,
    source_digest_id: skill.source_digest_id,
    source_observation_count: Array.isArray(skill.source_observation_ids)
      ? skill.source_observation_ids.length
      : 0,
    status_effective_at: skill.status_effective_at || skill.created_at,
    feedback_summary: skill.feedback_summary,
    feedback_history: skill.feedback_history,
    lifecycle_signal: skill.lifecycle_signal || null,
    recommendation_state: skill.recommendation_state || null,
    recommendation_score:
      typeof skill.recommendation_score === 'number' ? skill.recommendation_score : null,
    recommendation_reasons: skill.recommendation_reasons || [],
  };
}

function selectProjectContextObservations(
  observations: Observation[],
  limit: number
): Observation[] {
  if (limit < 1 || observations.length === 0) {
    return [];
  }

  const curated = collectContextObservations(observations, limit, {
    allowLowSignal: false,
  });

  if (curated.length > 0) {
    return curated;
  }

  return collectContextObservations(observations, limit, {
    allowLowSignal: true,
  });
}

function collectContextObservations(
  observations: Observation[],
  limit: number,
  options: { allowLowSignal: boolean }
): Observation[] {
  const selected: Observation[] = [];
  const seenTitles = new Set<string>();

  for (const observation of observations) {
    const titleKey = normalizeTitleKey(observation.title);
    if (!titleKey || seenTitles.has(titleKey)) {
      continue;
    }

    if (!options.allowLowSignal && isLowSignalTitle(observation.title)) {
      continue;
    }

    seenTitles.add(titleKey);
    selected.push(observation);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function createBoundedContextPackage(input: {
  asOf: string | null;
  currentState: StateFact[];
  dailyDigests: ProjectContextDailyDigest[];
  matchedObservations?: SearchResult[];
  mode: string;
  proceduralSkills: Array<ProjectContextProceduralSkill | ProceduralSkillSearchResult>;
  queryText?: string | null;
  recommendedCharBudget: number;
  summaryBlocks: ProjectContextSummaryBlock[];
}): BoundedContextPackage {
  const budget = Math.max(400, input.recommendedCharBudget);
  const mode = String(input.mode || 'task_query');
  const entries: SlidingWindowEntry[] = [];
  const layerMetrics = {
    observation_ledger: { char_count: 0, entry_count: 0 },
    procedural_memory: { char_count: 0, entry_count: 0 },
    recent_summary: { char_count: 0, entry_count: 0 },
    structured_profile: { char_count: 0, entry_count: 0 },
  };
  let remaining = budget;
  let trimmedEntryCount = 0;

  const budgetRatio =
    mode === 'startup'
      ? { recent: 0.35, observation: 0.2, skill: 0.2, state: 0.25 }
      : { recent: 0.25, observation: 0.3, skill: 0.25, state: 0.2 };

  const pushEntry = (entry: SlidingWindowEntry) => {
    const estimated = entry.content.length + entry.title.length + 24;
    if (remaining < estimated && entries.length > 0) {
      trimmedEntryCount += 1;
      return;
    }
    entries.push({
      ...entry,
      char_count: estimated,
    });
    layerMetrics[entry.layer].char_count += estimated;
    layerMetrics[entry.layer].entry_count += 1;
    remaining = Math.max(0, remaining - estimated);
  };

  const ordering = buildBoundedContextOrdering(mode);
  for (const layer of ordering) {
    if (layer === 'structured_profile') {
      for (const fact of input.currentState.slice(0, 2)) {
        pushEntry({
          kind: 'state',
          layer: 'structured_profile',
          source_id: fact.id,
          title: fact.fact_key,
          content: formatStateFactValue(fact.value),
          created_at: fact.effective_at,
          effective_at: fact.effective_at,
          recorded_at: fact.recorded_at,
          priority: 10,
          char_count: 0,
        });
      }
      continue;
    }

    if (layer === 'recent_summary') {
      for (const digest of input.dailyDigests.slice(0, 2)) {
        pushEntry({
          kind: 'digest',
          layer: 'recent_summary',
          source_id: digest.id,
          title: digest.local_date,
          content: [digest.summary, ...digest.facts.slice(0, 2), ...digest.next_actions.slice(0, 1)].join(' '),
          created_at: digest.generated_at,
          effective_at: null,
          recorded_at: digest.generated_at,
          priority: 20,
          char_count: 0,
        });
      }
      continue;
    }

    if (layer === 'procedural_memory') {
      for (const skill of input.proceduralSkills.slice(0, 2)) {
        const skillSummary = [skill.summary, skill.trigger_text, skill.steps.slice(0, 2).join(' -> ')]
          .filter(Boolean)
          .join(' ');
        pushEntry({
          kind: 'skill',
          layer: 'procedural_memory',
          source_id: skill.id,
          title: skill.title,
          content: skillSummary,
          created_at: skill.last_used_at || skill.created_at || undefined,
          effective_at: skill.status_effective_at || skill.created_at || null,
          recorded_at: skill.created_at || null,
          priority: 30,
          char_count: 0,
        });
      }
      continue;
    }

    const observationSource = (input.matchedObservations && input.matchedObservations.length > 0)
      ? input.matchedObservations
      : input.summaryBlocks.map((block) => ({
          id: block.title,
          title: block.title,
          narrative: block.lines.join(' '),
          facts: [],
          concepts: [],
          files_modified: [],
          agent_id: block.agent_id,
          fts_score: 0,
          vector_score: 0,
          hybrid_score: 0,
          created_at: block.created_at || '',
        }));
    for (const observation of observationSource.slice(0, 2)) {
      pushEntry({
        kind: 'observation',
        layer: 'observation_ledger',
        source_id: observation.id,
        title: observation.title,
        content:
          Array.isArray(observation.facts) && observation.facts.length > 0
            ? observation.facts.slice(0, 2).join('; ')
            : trimSummary(observation.narrative || ''),
        created_at: observation.created_at,
        effective_at: null,
        recorded_at: observation.created_at || null,
        priority: 40,
        char_count: 0,
      });
    }
  }

  const renderedPackage = entries
    .map((entry) => `- [${entry.layer}] ${entry.title}: ${trimSummary(entry.content, 160)}`)
    .join('\n');

  return {
    as_of: input.asOf,
    package_id: `bounded-context:${mode}:${input.asOf || 'latest'}`,
    mode,
    query_text: input.queryText || null,
    recommended_char_budget: budget,
    char_budget_used: budget - remaining,
    char_budget_remaining: remaining,
    recent_summary_budget: Math.round(budget * budgetRatio.recent),
    observation_budget: Math.round(budget * budgetRatio.observation),
    procedural_skill_budget: Math.round(budget * budgetRatio.skill),
    state_budget: Math.round(budget * budgetRatio.state),
    trimmed_entry_count: trimmedEntryCount,
    trimming_order: ordering,
    layer_metrics: layerMetrics,
    boundary_notes: [
      'Bounded context packages are the short-horizon input layer and do not replace long-term memory storage.',
      'The startup/query host path may inject this package directly, but operators can still inspect the full layered context separately.',
    ],
    host_responsibilities: [
      'Inject entries in order and trim from the end when the host token budget is smaller than the suggested package budget.',
      'Treat procedural skills as recommendations with evidence, not silent auto-execution.',
      'Carry the as_of slice through the entire host request instead of mixing latest and historical truth.',
    ],
    rendered_package: renderedPackage,
    window_entries: entries,
  };
}

function createEmptyBoundedContextPackage(): BoundedContextPackage {
  return {
    as_of: null,
    package_id: 'bounded-context:empty',
    mode: 'disabled',
    query_text: null,
    boundary_notes: [],
    char_budget_remaining: 0,
    char_budget_used: 0,
    host_responsibilities: [],
    observation_budget: 0,
    procedural_skill_budget: 0,
    recent_summary_budget: 0,
    recommended_char_budget: 0,
    rendered_package: '',
    state_budget: 0,
    trimmed_entry_count: 0,
    trimming_order: [],
    layer_metrics: {
      observation_ledger: { char_count: 0, entry_count: 0 },
      procedural_memory: { char_count: 0, entry_count: 0 },
      recent_summary: { char_count: 0, entry_count: 0 },
      structured_profile: { char_count: 0, entry_count: 0 },
    },
    window_entries: [],
  };
}

function buildBoundedContextOrdering(mode: string): Array<
  'structured_profile' | 'recent_summary' | 'procedural_memory' | 'observation_ledger'
> {
  switch (mode) {
    case 'startup':
      return ['structured_profile', 'recent_summary', 'procedural_memory', 'observation_ledger'];
    case 'drill_down':
      return ['observation_ledger', 'structured_profile', 'procedural_memory', 'recent_summary'];
    default:
      return ['structured_profile', 'procedural_memory', 'observation_ledger', 'recent_summary'];
  }
}

export function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

export function isLowSignalTitle(title: string): boolean {
  return /^(read|checked|check|list|listed|search|viewed|view|raw execution:|run)\b/i.test(
    title.trim()
  );
}

function trimSummary(text: string, maxLength: number = 180): string {
  const normalized = text.trim();
  if (!normalized) {
    return 'No narrative available.';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'unknown';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}
