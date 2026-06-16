import {
  BoundedContextPackage,
  MemoryDecisionTrace,
  ProjectContextView,
  renderProjectContextView,
  TemporalSliceDiagnostics,
} from './context-view';
import {
  DatabaseManager,
  ProceduralSkillSearchResult,
  SearchResult,
} from './db';
import {
  decideMemoryReadPolicy,
  MemoryReadMode,
  MemoryReadPolicyDecision,
} from './memory-policy';
import { orchestrateMemoryRead } from './memory-orchestrator';
import { renderProceduralSkillSearchResults } from './procedural-memory';

export interface MemoryQueryRequest {
  asOf?: string;
  limit?: number;
  mode?: MemoryReadMode;
  projectPath: string;
  query: string;
  skillLimit?: number;
  windowCharBudget?: number;
}

export interface MemoryQueryResult {
  as_of: string | null;
  bounded_context: BoundedContextPackage | null;
  decision_trace: MemoryDecisionTrace | null;
  generated_at: string;
  policy: MemoryReadPolicyDecision;
  procedural_skills: ProceduralSkillSearchResult[];
  project_context: ProjectContextView | null;
  project_path: string;
  query: string;
  rendered: string;
  search_results: SearchResult[];
  temporal_diagnostics: TemporalSliceDiagnostics | null;
}

export async function resolveMemoryQuery(
  dbManager: DatabaseManager,
  request: MemoryQueryRequest
): Promise<MemoryQueryResult> {
  const policy = decideMemoryReadPolicy({
    asOf: request.asOf,
    mode: request.mode,
    queryText: request.query,
    requestedLimit: request.limit,
    requestedSkillLimit: request.skillLimit,
    requestedWindowChars: request.windowCharBudget,
  });

  if (policy.action === 'skip') {
    return {
      as_of: request.asOf || null,
      bounded_context: null,
      decision_trace: null,
      generated_at: new Date().toISOString(),
      policy,
      procedural_skills: [],
      project_context: null,
      project_path: request.projectPath,
      query: request.query,
      rendered: renderSkippedMemoryQuery(request.projectPath, request.query, policy),
      search_results: [],
      temporal_diagnostics: null,
    };
  }

  const orchestrated = await orchestrateMemoryRead(dbManager, {
    asOf: request.asOf,
    limit: request.limit,
    mode: request.mode,
    projectPath: request.projectPath,
    queryText: request.query,
    skillLimit: request.skillLimit,
    windowCharBudget: request.windowCharBudget,
  });

  const baseResult = {
    as_of: request.asOf || null,
    bounded_context: orchestrated.bounded_context,
    decision_trace: orchestrated.decision_trace,
    generated_at: orchestrated.generated_at,
    policy: orchestrated.policy,
    procedural_skills: orchestrated.procedural_skills,
    project_context: orchestrated.project_context,
    project_path: request.projectPath,
    query: request.query,
    search_results: orchestrated.search_results,
    temporal_diagnostics: orchestrated.temporal_diagnostics,
  };
  return {
    ...baseResult,
    rendered: renderMemoryQueryResult({
      ...baseResult,
      rendered: '',
    }),
  };
}

export function renderMemoryQueryResult(result: MemoryQueryResult): string {
  const lines: string[] = [
    '=== AgentMemory: Policy Resolution ===',
    `Project: ${result.project_path}`,
    `Query: ${result.query}`,
  ];

  if (result.as_of) {
    lines.push(`As of: ${result.as_of}`);
  }

  lines.push(`Action: ${result.policy.action}`);
  lines.push(`Layers: ${result.policy.layers.join(', ') || '(none)'}`);
  lines.push(`Reasons: ${result.policy.reasons.join(' | ') || 'No reasons provided.'}`);
  lines.push(
    `Observation limit=${result.policy.observationLimit}; skill limit=${result.policy.skillLimit}; window budget=${result.policy.windowCharBudget}`
  );

  if (result.temporal_diagnostics) {
    lines.push(
      `Temporal: mode=${result.temporal_diagnostics.mode}; future_protection=${result.temporal_diagnostics.future_protection}`
    );
  }

  if (result.procedural_skills.length > 0) {
    lines.push('\nMatched procedural skills:');
    lines.push(renderProceduralSkillSearchResults(result.procedural_skills));
  }

  if (result.search_results.length > 0) {
    lines.push('\nMatched observations:');
    for (const record of result.search_results) {
      lines.push(
        `- ${record.title} [score=${record.hybrid_score.toFixed(2)}] (${record.created_at})`
      );
      lines.push(`  Facts: ${record.facts.slice(0, 2).join('; ') || trimText(record.narrative, 120)}`);
    }
  }

  if (result.decision_trace?.steps.length) {
    lines.push('\nDecision trace:');
    for (const step of result.decision_trace.steps) {
      lines.push(`- ${step.step}: ${step.decision}`);
      for (const reason of step.reasons) {
        lines.push(`  Reason: ${reason}`);
      }
    }
  }

  if (result.project_context) {
    lines.push(renderProjectContextView(result.project_context).trimEnd());
  }

  lines.push('======================================');
  return lines.join('\n');
}

function renderSkippedMemoryQuery(
  projectPath: string,
  query: string,
  policy: MemoryReadPolicyDecision
): string {
  return [
    '=== AgentMemory: Policy Resolution ===',
    `Project: ${projectPath}`,
    `Query: ${query || '(empty)'}`,
    `Action: ${policy.action}`,
    `Reasons: ${policy.reasons.join(' | ') || 'No reasons provided.'}`,
    '======================================',
  ].join('\n');
}

function trimText(text: string, maxLength: number): string {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return 'No narrative available.';
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}
