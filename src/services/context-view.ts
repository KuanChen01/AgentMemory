import { Observation, StateFact } from './db';

export interface ProjectContextSummaryBlock {
  title: string;
  created_at?: string;
  agent_id: string;
  lines: string[];
}

export interface ProjectContextView {
  project_path: string;
  current_state: StateFact[];
  summary_blocks: ProjectContextSummaryBlock[];
  recent_observations: Observation[];
  generated_at: string;
  disabled?: boolean;
  message?: string;
}

export function createProjectContextView(
  projectPath: string,
  stateFacts: StateFact[],
  recentObservations: Observation[]
): ProjectContextView {
  return {
    project_path: projectPath,
    current_state: stateFacts,
    summary_blocks: recentObservations.map((observation) => ({
      title: observation.title,
      created_at: observation.created_at,
      agent_id: observation.agent_id,
      lines: buildSummaryLines(observation),
    })),
    recent_observations: recentObservations,
    generated_at: new Date().toISOString(),
  };
}

export function createDisabledProjectContextView(
  projectPath: string,
  message: string
): ProjectContextView {
  return {
    project_path: projectPath,
    current_state: [],
    summary_blocks: [],
    recent_observations: [],
    generated_at: new Date().toISOString(),
    disabled: true,
    message,
  };
}

export function hasProjectContextData(view: ProjectContextView): boolean {
  return (
    (Array.isArray(view.current_state) && view.current_state.length > 0) ||
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
