import { DailyMemoryDigest, Observation, ProceduralSkill, StateFact } from './db';

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
}

export interface SlidingWindowEntry {
  content: string;
  created_at?: string;
  kind: 'digest' | 'observation' | 'skill' | 'state';
  source_id?: string;
  title: string;
}

export interface SlidingWindowContract {
  as_of: string | null;
  boundary_notes: string[];
  host_responsibilities: string[];
  observation_budget: number;
  procedural_skill_budget: number;
  recent_summary_budget: number;
  recommended_char_budget: number;
  window_entries: SlidingWindowEntry[];
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
  memory_layers: ProjectContextMemoryLayers;
  generated_at: string;
  disabled?: boolean;
  message?: string;
}

export interface ProjectContextViewOptions {
  asOf?: string;
  proceduralSkills?: ProceduralSkill[];
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
  const slidingWindow = buildSlidingWindowContract({
    asOf: options.asOf || null,
    currentState: stateFacts,
    dailyDigests: digestEntries,
    proceduralSkills,
    summaryBlocks,
    recommendedCharBudget: options.windowCharBudget || DEFAULT_WINDOW_CHAR_BUDGET,
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
    sliding_window: slidingWindow,
  };

  return {
    project_path: projectPath,
    as_of: options.asOf || null,
    current_state: stateFacts,
    daily_digests: digestEntries,
    procedural_skills: proceduralSkills,
    summary_blocks: summaryBlocks,
    recent_observations: recentObservationEntries,
    sliding_window: slidingWindow,
    memory_layers: memoryLayers,
    generated_at: generatedAt,
  };
}

export function createDisabledProjectContextView(
  projectPath: string,
  message: string
): ProjectContextView {
  const generatedAt = new Date().toISOString();
  const emptyWindow: SlidingWindowContract = {
    as_of: null,
    boundary_notes: [],
    host_responsibilities: [],
    observation_budget: 0,
    procedural_skill_budget: 0,
    recent_summary_budget: 0,
    recommended_char_budget: 0,
    window_entries: [],
  };

  return {
    project_path: projectPath,
    as_of: null,
    current_state: [],
    daily_digests: [],
    procedural_skills: [],
    summary_blocks: [],
    recent_observations: [],
    sliding_window: emptyWindow,
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
        )} (effective ${formatTimestamp(fact.effective_at)})`
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
        )}`
      );
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

  if (view.sliding_window.window_entries.length > 0) {
    sections.push('\nSliding window contract:');
    sections.push(
      `- recommended_char_budget=${view.sliding_window.recommended_char_budget}, recent_summary_budget=${view.sliding_window.recent_summary_budget}, observation_budget=${view.sliding_window.observation_budget}, procedural_skill_budget=${view.sliding_window.procedural_skill_budget}`
    );
    for (const note of view.sliding_window.boundary_notes) {
      sections.push(`- note: ${note}`);
    }
    for (const responsibility of view.sliding_window.host_responsibilities) {
      sections.push(`- host: ${responsibility}`);
    }
    for (const entry of view.sliding_window.window_entries) {
      sections.push(
        `- [${entry.kind}] ${entry.title}: ${trimSummary(entry.content, 140)}`
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

function buildSlidingWindowContract(input: {
  asOf: string | null;
  currentState: StateFact[];
  dailyDigests: ProjectContextDailyDigest[];
  proceduralSkills: ProjectContextProceduralSkill[];
  summaryBlocks: ProjectContextSummaryBlock[];
  recommendedCharBudget: number;
}): SlidingWindowContract {
  const entries: SlidingWindowEntry[] = [];
  const budget = Math.max(400, input.recommendedCharBudget);
  let remaining = budget;

  const pushEntry = (entry: SlidingWindowEntry) => {
    const estimated = entry.content.length + entry.title.length + 24;
    if (remaining < estimated && entries.length > 0) {
      return;
    }
    entries.push(entry);
    remaining = Math.max(0, remaining - estimated);
  };

  for (const digest of input.dailyDigests.slice(0, 2)) {
    pushEntry({
      kind: 'digest',
      source_id: digest.id,
      title: digest.local_date,
      content: [digest.summary, ...digest.facts.slice(0, 2), ...digest.next_actions.slice(0, 1)].join(' '),
      created_at: digest.generated_at,
    });
  }

  for (const skill of input.proceduralSkills.slice(0, 2)) {
    pushEntry({
      kind: 'skill',
      source_id: skill.id,
      title: skill.title,
      content: `${skill.trigger_text}. ${skill.steps.slice(0, 2).join(' -> ')}`,
      created_at: skill.last_used_at || undefined,
    });
  }

  for (const block of input.summaryBlocks.slice(0, 2)) {
    pushEntry({
      kind: 'observation',
      title: block.title,
      content: block.lines.join(' '),
      created_at: block.created_at,
    });
  }

  for (const fact of input.currentState.slice(0, 2)) {
    pushEntry({
      kind: 'state',
      title: fact.fact_key,
      content: formatStateFactValue(fact.value),
      created_at: fact.effective_at,
    });
  }

  return {
    as_of: input.asOf,
    recommended_char_budget: budget,
    recent_summary_budget: Math.round(budget * 0.45),
    observation_budget: Math.round(budget * 0.3),
    procedural_skill_budget: Math.round(budget * 0.25),
    boundary_notes: [
      'Sliding window only carries recent stitched context and does not replace long-term storage.',
      'Hosts should keep authoritative token budgeting outside AgentMemory and treat this payload as a bounded input contract.',
    ],
    host_responsibilities: [
      'Inject window entries in order and trim from the end when the host token budget is smaller than the suggested budget.',
      'Treat procedural skills as optional reusable steps, not auto-executed commands.',
      'Use as_of when reconstructing historical truth instead of mixing current and past layers.',
    ],
    window_entries: entries,
  };
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
