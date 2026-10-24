export const GROK_BUILD_AGENT_ID = 'grok-build';
export const GROK_BOT_AGENT_ID = 'grok-bot';

const GROK_BUILD_LABEL = 'Grok Build';
const GROK_BOT_LABEL = 'Grok Bot';

function foldAgentToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isGrokBuildToken(folded: string): boolean {
  return folded === 'grok' || folded === 'grok-build' || folded === 'grok build';
}

function isGrokBotToken(folded: string): boolean {
  return folded === 'grok-bot' || folded === 'grok bot';
}

/** Display name for an agent id. `grok` and `grok-build` share "Grok Build"; `grok-bot` stays separate. */
export function agentDisplayName(id: unknown): string {
  const raw = String(id ?? '');
  const folded = foldAgentToken(raw);
  if (isGrokBuildToken(folded)) return GROK_BUILD_LABEL;
  if (isGrokBotToken(folded)) return GROK_BOT_LABEL;
  return raw;
}

/**
 * Lowercased ids a filter value should match.
 * `grok`, `grok-build`, and "Grok Build" match both stored spellings.
 * `grok-bot` / "Grok Bot" match only `grok-bot`.
 */
export function agentAliasIds(id: unknown): string[] {
  const folded = foldAgentToken(id);
  if (!folded) return [];
  if (isGrokBuildToken(folded)) return ['grok', GROK_BUILD_AGENT_ID];
  if (isGrokBotToken(folded)) return [GROK_BOT_AGENT_ID];
  return [folded];
}

/** Case-insensitive agent equality that also expands the Grok Build alias. The column expression is a trusted SQL fragment. */
export function agentMatchSql(columnExpr: string, value: unknown): { sql: string; params: string[] } {
  const ids = agentAliasIds(value);
  if (!ids.length) return { sql: '1=0', params: [] };
  return {
    sql: `LOWER(${columnExpr}) IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

export interface AgentOption {
  agent_id: string;
  agent_label: string;
}

/** Facet/option ids. Grok Build aliases collapse to `grok-build`; other spellings stay as stored. */
export function presentAgentIds(ids: readonly string[]): AgentOption[] {
  const seen = new Map<string, string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id === '') continue;
    const folded = foldAgentToken(id);
    const alias = isGrokBuildToken(folded)
      ? GROK_BUILD_AGENT_ID
      : isGrokBotToken(folded)
        ? GROK_BOT_AGENT_ID
        : null;
    const key = alias || id;
    if (!seen.has(key)) seen.set(key, alias || id);
  }
  return [...seen.values()]
    .map((agent_id) => ({ agent_id, agent_label: agentDisplayName(agent_id) }))
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id, 'en', { sensitivity: 'base' }));
}

/**
 * Merge Grok Build alias rows in a summary list. Counts named in `sum` are added.
 * Other ids stay on their own row. `groupBy` keeps rows apart (for example per project).
 */
export function collapseListedAgents<T extends { agent_id: string }>(
  rows: readonly T[],
  options: { groupBy?: (row: NoInfer<T>) => string; sum?: readonly string[] } = {},
): Array<T & { agent_label: string }> {
  const sumFields = options.sum || [];
  const groups = new Map<string, T & { agent_label: string }>();
  for (const row of rows) {
    const raw = String(row.agent_id ?? '');
    const folded = foldAgentToken(raw);
    const alias = isGrokBuildToken(folded)
      ? GROK_BUILD_AGENT_ID
      : isGrokBotToken(folded)
        ? GROK_BOT_AGENT_ID
        : null;
    const agent_id = alias || raw;
    const extra = options.groupBy ? options.groupBy(row) : '';
    const key = `${extra}\0${alias || raw}`;
    const existing = groups.get(key);
    if (!existing) {
      const next = { ...row, agent_id, agent_label: agentDisplayName(agent_id) } as T & { agent_label: string };
      for (const field of sumFields) (next as any)[field] = Number((row as any)[field]) || 0;
      groups.set(key, next);
      continue;
    }
    for (const field of sumFields) {
      (existing as any)[field] = (Number((existing as any)[field]) || 0) + (Number((row as any)[field]) || 0);
    }
  }
  return [...groups.values()];
}

export function normalizeAgentId(agentId: string): string {
  const raw = String(agentId || '').trim();
  if (!raw) return raw;

  const lower = raw.toLowerCase().replace(/\\/g, '/');
  const basename = lower.split('/').pop() || lower;

  if (
    lower.includes('antigravity') ||
    basename === 'agy.exe' ||
    basename === 'agy' ||
    /(^|[-_\s])antigravity([-_\s]?cli)?$/i.test(raw)
  ) {
    return 'antigravity';
  }

  // Display names written by a client become the canonical id. Stored `grok` is left unchanged.
  const folded = foldAgentToken(raw);
  if (folded === 'grok build') return GROK_BUILD_AGENT_ID;
  if (folded === 'grok bot') return GROK_BOT_AGENT_ID;

  return raw;
}

export function resolveAgentId(
  requestedAgentId?: unknown,
  configuredAgentId: unknown = process.env.AGENTMEM_AGENT_ID
): string {
  const requested = String(requestedAgentId || '').trim();
  if (requested) {
    return normalizeAgentId(requested);
  }

  const configured = String(configuredAgentId || '').trim();
  if (configured) {
    return normalizeAgentId(configured);
  }

  return 'mcp-client';
}
