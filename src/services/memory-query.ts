import { ProjectContextView, renderProjectContextView } from './context-view';
import {
  DatabaseManager,
  ProceduralSkillSearchResult,
  SearchResult,
} from './db';
import { getEmbedding } from './embedding';
import {
  decideMemoryReadPolicy,
  MemoryReadMode,
  MemoryReadPolicyDecision,
} from './memory-policy';
import { loadProjectContextView } from './project-context';
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
  generated_at: string;
  policy: MemoryReadPolicyDecision;
  procedural_skills: ProceduralSkillSearchResult[];
  project_context: ProjectContextView | null;
  project_path: string;
  query: string;
  rendered: string;
  search_results: SearchResult[];
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
      generated_at: new Date().toISOString(),
      policy,
      procedural_skills: [],
      project_context: null,
      project_path: request.projectPath,
      query: request.query,
      rendered: renderSkippedMemoryQuery(request.projectPath, request.query, policy),
      search_results: [],
    };
  }

  const queryVector = policy.shouldUseObservationSearch || policy.shouldUseProceduralSkills
    ? await getEmbedding(request.query)
    : undefined;

  const [projectContext, searchResults, proceduralSkills] = await Promise.all([
    loadProjectContextView(dbManager, request.projectPath, policy.observationLimit, {
      asOf: request.asOf,
      includeProceduralSkills: true,
      proceduralSkillLimit: policy.skillLimit,
      windowCharBudget: policy.windowCharBudget,
    }),
    policy.shouldUseObservationSearch
      ? dbManager.searchHybrid(
          request.projectPath,
          request.query,
          queryVector,
          policy.observationLimit,
          { asOf: request.asOf }
        )
      : Promise.resolve([]),
    policy.shouldUseProceduralSkills
      ? dbManager.searchProceduralSkills(
          request.projectPath,
          request.query,
          queryVector,
          policy.skillLimit,
          { asOf: request.asOf, statuses: ['enabled', 'draft'] }
        )
      : Promise.resolve([]),
  ]);

  const generatedAt = new Date().toISOString();
  const baseResult = {
    as_of: request.asOf || null,
    generated_at: generatedAt,
    policy,
    procedural_skills: proceduralSkills,
    project_context: projectContext,
    project_path: request.projectPath,
    query: request.query,
    search_results: searchResults,
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
