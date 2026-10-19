import { createHash } from 'node:crypto';
import { DatabaseManager } from './db';
import { stuckStaleMs, taskPipelineSql } from './task-consolidation';

const PIPELINE_STATES = ['queued', 'processing', 'saved', 'skipped', 'duplicate', 'fallback', 'failed', 'stuck'] as const;
type PipelineState = typeof PIPELINE_STATES[number];

const PIPELINE_CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface AdminPipelineOptions {
  project?: string;
  agent?: string;
  state?: string;
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
  limit?: number;
  cursor?: string | null;
  stats?: boolean;
  /** When true, items are tasks that have a duplicate_flags row in status needs_confirmation. Stages stay unfiltered. */
  flagged?: boolean;
}

export interface PipelineRuntime {
  inflight: readonly string[];
  consolidating: number;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}

interface PipelineCursor {
  t: string | null;
  k: string;
  f: string;
}

interface NormalizedAdminPipeline {
  project?: string;
  agent?: string;
  states: PipelineState[];
  fromIso: string | null;
  toIso: string | null;
  offset: number;
  limit: number;
  cursor: PipelineCursor | null;
  stats: boolean;
  flagged: boolean;
  filterHash: string;
}

const PIPELINE_FACET_CAP = 200;

function invalidPipeline(detail: string): Error {
  return new Error(`Invalid pipeline request: ${detail}`);
}

function pipelineExact(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalidPipeline(label);
  return value;
}

function pipelineOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -840 || value > 840) {
    throw invalidPipeline('tz_offset_minutes');
  }
  return value;
}

function pipelineLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw invalidPipeline('limit');
  }
  return value;
}

function pipelineStatsFlag(value: boolean | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw invalidPipeline('stats');
  return value;
}

function pipelineInstant(value: string | undefined, label: 'from' | 'to'): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') throw invalidPipeline(label);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalidPipeline(label);
  return new Date(ms).toISOString();
}

function pipelineStateList(value: string | undefined): PipelineState[] {
  if (value === undefined) return [...PIPELINE_STATES];
  if (typeof value !== 'string') throw invalidPipeline('state');
  const trimmed = value.trim();
  if (trimmed === '') return [...PIPELINE_STATES];
  const selected = new Set<PipelineState>();
  for (const token of trimmed.split(',')) {
    const state = token.trim();
    if (!(PIPELINE_STATES as readonly string[]).includes(state)) throw invalidPipeline('state');
    selected.add(state as PipelineState);
  }
  return PIPELINE_STATES.filter((state) => selected.has(state));
}

function pipelineFlagged(value: boolean | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw invalidPipeline('flagged');
  return value;
}

function pipelineFilterHash(filters: {
  project: string | null; agent: string | null; state: PipelineState[]; from: string | null; to: string | null; flagged: boolean;
}): string {
  return createHash('sha1').update(JSON.stringify({
    project: filters.project,
    agent: filters.agent,
    state: [...filters.state].sort(),
    from: filters.from,
    to: filters.to,
    flagged: filters.flagged,
  })).digest('hex').slice(0, 12);
}

function decodePipelineCursor(cursor: string): PipelineCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalidPipeline('cursor');
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidPipeline('cursor');
  }
  const t = parsed?.t;
  const k = parsed?.k;
  const f = parsed?.f;
  if (t !== null && (typeof t !== 'string' || !PIPELINE_CURSOR_TIME.test(t))) throw invalidPipeline('cursor');
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== t) throw invalidPipeline('cursor');
  }
  if (typeof k !== 'string' || k.length === 0) throw invalidPipeline('cursor');
  if (typeof f !== 'string' || !/^[0-9a-f]{12}$/.test(f)) throw invalidPipeline('cursor');
  return { t, k, f };
}

function normalizeAdminPipeline(options: AdminPipelineOptions): NormalizedAdminPipeline {
  const fromIso = pipelineInstant(options.from, 'from');
  const toIso = pipelineInstant(options.to, 'to');
  if (fromIso && toIso && !(Date.parse(toIso) > Date.parse(fromIso))) throw invalidPipeline('from');
  const project = pipelineExact(options.project, 'project');
  const agent = pipelineExact(options.agent, 'agent');
  const states = pipelineStateList(options.state);
  const flagged = pipelineFlagged(options.flagged);
  const filterHash = pipelineFilterHash({
    project: project ?? null,
    agent: agent ?? null,
    state: states,
    from: fromIso,
    to: toIso,
    flagged,
  });
  let cursor: PipelineCursor | null = null;
  if (options.cursor !== undefined && options.cursor !== null && options.cursor !== '') {
    if (typeof options.cursor !== 'string') throw invalidPipeline('cursor');
    cursor = decodePipelineCursor(options.cursor);
    if (cursor.f !== filterHash) throw invalidPipeline('cursor');
  }
  return {
    project,
    agent,
    states,
    fromIso,
    toIso,
    offset: pipelineOffset(options.tzOffsetMinutes),
    limit: pipelineLimit(options.limit),
    cursor,
    stats: pipelineStatsFlag(options.stats),
    flagged,
    filterHash,
  };
}

/**
 * Strip absolute paths, emails, and credential-shaped tokens from a task error.
 * Empty after cleaning becomes null. The result is at most 200 characters.
 */
export function sanitizeLastError(value: unknown): string | null {
  const text = sanitizeText(value);
  if (!text) return null;
  return text.length > 200 ? text.slice(0, 200) : text;
}

/** Path/email/token redaction shared by last_error, title and summary. */
export function sanitizeText(value: unknown): string | null {
  if (value == null) return null;
  let text = String(value);
  if (text.trim() === '') return null;
  text = text.replace(/\b(?:bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '<redacted>');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '<redacted>');
  text = text.replace(/\b(?:api[_-]?key|secret|password|key|token)\s*=\s*[^\s&;,]+/gi, '<redacted>');
  // A quoted absolute path may contain spaces ("C:\Users\Jane Roe\private.txt", '\\server\share\...', `/work/a b`).
  // Take the whole quoted span before the unquoted rules, which stop at the first space.
  text = text.replace(/(["'`])([^"'`]*)\1/g, (full, quote: string, inner: string) => {
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/\/|\/)/.test(inner)) return `${quote}<path>${quote}`;
    return full;
  });
  text = text.replace(/(?:\\\\|\/\/)[^\s\\/]+[\\/][^\s]*/g, '<path>');
  text = text.replace(/[A-Za-z]:[\\/][^\s]*/g, '<path>');
  text = text.replace(/(^|[\s"'`(=:<>])(\/[^\s"'`)<>]+)/g, '$1<path>');
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
  text = text.replace(/\b[a-fA-F0-9]{32,}\b/g, '<redacted>');
  text = text.replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '<redacted>');
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}

function clip(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function isoMs(ms: number | null): string | null {
  return ms === null || ms === undefined || !Number.isFinite(Number(ms)) ? null : new Date(Number(ms)).toISOString();
}

function localDay(ms: number | null, offset: number): string | null {
  return ms === null || ms === undefined ? null : new Date(Number(ms) + offset * 60_000).toISOString().slice(0, 10);
}

interface PipelineDetail {
  trigger: string | null; observation_id: string | null; duplicate_of: string | null;
  result_error: string | null; attempt_error: string | null;
}

const STATE_SET = new Set<string>(PIPELINE_STATES);

/** Detail fields for the page rows only: a few indexed lookups instead of window functions over every task. */
function pipelineDetails(db: DatabaseManager, taskIds: string[]): Map<string, PipelineDetail> {
  const details = new Map<string, PipelineDetail>();
  for (const id of taskIds) details.set(id, { trigger: null, observation_id: null, duplicate_of: null, result_error: null, attempt_error: null });
  if (!taskIds.length) return details;
  const marks = taskIds.map(() => '?').join(',');
  // Newest first: datetime(created_at), then rowid. Rows are rewritten on every result upsert.
  const rows = db.sqlAll(`SELECT task_id, trigger, status, observation_id, last_error FROM task_results WHERE task_id IN (${marks})
    ORDER BY task_id, julianday(created_at) DESC, rowid DESC`, taskIds);
  for (const row of rows) {
    const d = details.get(row.task_id)!;
    if (d.trigger === null && row.trigger) d.trigger = row.trigger;
    if (d.observation_id === null && row.observation_id && (row.status === 'saved' || row.status === 'fallback')) d.observation_id = row.observation_id;
    if (d.duplicate_of === null && row.observation_id && row.status === 'duplicate') d.duplicate_of = row.observation_id;
    if (d.result_error === null && String(row.last_error ?? '').trim()) d.result_error = row.last_error;
  }
  for (const row of db.sqlAll(`SELECT task_id, last_error FROM task_attempts WHERE task_id IN (${marks})`, taskIds)) {
    if (String(row.last_error ?? '').trim()) details.get(row.task_id)!.attempt_error = row.last_error;
  }
  return details;
}

function compareDesc(a: any, b: any): number {
  // created_at DESC with NULL last, then task_id DESC.
  const at = a.created_ms ?? null, bt = b.created_ms ?? null;
  if (at !== bt) {
    if (at === null) return 1;
    if (bt === null) return -1;
    return bt - at;
  }
  return a.task_id < b.task_id ? 1 : a.task_id > b.task_id ? -1 : 0;
}

function afterCursor(row: any, cursor: PipelineCursor): boolean {
  const t = cursor.t === null ? null : Date.parse(cursor.t);
  const rt = row.created_ms ?? null;
  if (t === null) return rt === null && row.task_id < cursor.k;
  if (rt === null) return true;
  return rt < t || (rt === t && row.task_id < cursor.k);
}

function encodePipelineCursor(t: string | null, k: string, f: string): string {
  return Buffer.from(JSON.stringify({ t, k, f })).toString('base64url');
}

function emptyStages(consolidating: number) {
  return { queued: 0, processing: 0, consolidating, saved: 0, skipped: 0, duplicate: 0, fallback: 0, failed: 0, stuck: 0 };
}

/** Distinct non-empty values, case-insensitive sort, capped. Exact spelling is kept. */
function facetValues(rows: any[], field: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })).slice(0, PIPELINE_FACET_CAP);
}

/**
 * Read-only admin task list. `runtime.inflight` is the worker's in-flight set for this instant;
 * `runtime.consolidating` is the worker's active consolidation count (global, not filtered).
 * The classifier runs over the project/agent/from/to scope; stages, the state filter, paging and
 * day counts are derived from those lean rows, and only the page rows get detail lookups.
 * `flagged` narrows items (not stages) to tasks with a needs_confirmation duplicate_flags row.
 * Page 1 with stats also returns `facets`: distinct project and agent values over the whole task universe.
 */
export function getAdminPipeline(db: DatabaseManager, options: AdminPipelineOptions = {}, runtime: PipelineRuntime) {
  const normalized = normalizeAdminPipeline(options);
  const nowMs = runtime?.nowMs ?? Date.now();
  const inflight = Array.isArray(runtime?.inflight) ? runtime.inflight.map((id) => String(id)) : [];
  const consolidating = Number.isFinite(runtime?.consolidating) ? runtime.consolidating : 0;
  const built = taskPipelineSql({ nowMs, inflightJson: JSON.stringify(inflight), staleMs: stuckStaleMs(runtime?.env ?? process.env) });
  const where: string[] = []; const params: any[] = [];
  if (normalized.project !== undefined) { where.push('LOWER(project_path) = LOWER(?)'); params.push(normalized.project); }
  if (normalized.agent !== undefined) { where.push('LOWER(agent_id) = LOWER(?)'); params.push(normalized.agent); }
  if (normalized.fromIso) { where.push('created_ms >= ?'); params.push(Date.parse(normalized.fromIso)); }
  if (normalized.toIso) { where.push('created_ms < ?'); params.push(Date.parse(normalized.toIso)); }
  const scoped = db.sqlAll(`WITH ${built.sql} SELECT * FROM pipeline_tasks${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    [...built.params, ...params]);

  const wantStages = !normalized.cursor && normalized.stats;
  const stages = wantStages ? emptyStages(consolidating) : null;
  if (stages) for (const row of scoped) if (STATE_SET.has(row.state)) (stages as any)[row.state]++;

  // Facets ignore every filter, including flagged and state. A second pass is only needed when the list itself is scoped.
  let facets: { projects: string[]; agents: string[] } | undefined;
  if (wantStages) {
    const universe = where.length
      ? db.sqlAll(`WITH ${built.sql} SELECT project_path, agent_id FROM pipeline_tasks`, built.params)
      : scoped;
    facets = { projects: facetValues(universe, 'project_path'), agents: facetValues(universe, 'agent_id') };
  }

  const allStates = normalized.states.length === PIPELINE_STATES.length;
  const wanted = new Set<string>(normalized.states);
  const stateMatched = allStates ? scoped : scoped.filter((row) => wanted.has(row.state));
  const flaggedIds = normalized.flagged
    ? new Set(db.sqlAll(`SELECT DISTINCT task_id FROM duplicate_flags WHERE status = 'needs_confirmation'`).map((row) => String(row.task_id)))
    : null;
  const matching = (flaggedIds ? stateMatched.filter((row) => flaggedIds.has(String(row.task_id))) : stateMatched).sort(compareDesc);
  const cursor = normalized.cursor;
  const start = cursor ? matching.findIndex((row) => afterCursor(row, cursor)) : 0;
  const rest = start < 0 ? [] : matching.slice(start);
  const pageRows = rest.slice(0, normalized.limit);
  const nextCursor = rest.length > normalized.limit && pageRows.length
    ? encodePipelineCursor(isoMs(pageRows[pageRows.length - 1].created_ms), pageRows[pageRows.length - 1].task_id, normalized.filterHash)
    : null;

  const details = pipelineDetails(db, pageRows.map((row) => row.task_id));
  const obsIds = [...new Set([...details.values()].map((d) => d.observation_id || d.duplicate_of).filter((id): id is string => !!id))];
  const observations = new Map<string, { title: string; preview: string }>();
  if (obsIds.length) {
    for (const row of db.sqlAll(`SELECT id, title, substr(narrative, 1, 400) AS preview FROM observations WHERE id IN (${obsIds.map(() => '?').join(',')})`, obsIds)) {
      observations.set(row.id, { title: row.title, preview: row.preview });
    }
  }
  const items = pageRows.map((row) => {
    const d = details.get(row.task_id)!;
    const obs = observations.get(d.observation_id || d.duplicate_of || '');
    const lastError = sanitizeLastError(d.attempt_error ?? d.result_error);
    const staleHours = row.stuck_reason === 'stale' && row.updated_ms !== null
      ? Math.floor((nowMs - Number(row.updated_ms)) / 3_600_000) : null;
    return {
      task_id: row.task_id,
      session_id: row.session_id ?? null,
      project_path: row.project_path ?? null,
      agent_id: row.agent_id ?? null,
      trigger: d.trigger,
      source_kind: row.source_kind ?? 'task',
      // No user prompt text is stored with buffered tool events, so there is no cheap prompt snippet; null then.
      title: obs ? clip(obs.title, 120) : null,
      summary: obs ? clip(sanitizeText(obs.preview), 140) : clip(lastError, 140),
      state: row.state,
      stuck_reason: row.stuck_reason ?? null,
      stale_hours: staleHours,
      partial: Number(row.partial) === 1,
      created_at: isoMs(row.created_ms),
      day: localDay(row.created_ms, normalized.offset),
      updated_at: isoMs(row.updated_ms),
      attempts: Number(row.attempts) || 0,
      max_attempts: Number(row.max_attempts) || 0,
      llm_calls: Number(row.llm_calls) || 0,
      segment_count: Number(row.segment_count) || 0,
      pending_segments: Number(row.pending_segments) || 0,
      missing_segments: Number(row.missing_segments) || 0,
      evidence_count: Number(row.evidence_count) || 0,
      observation_id: d.observation_id,
      duplicate_of: d.duplicate_of,
      fallback: Number(row.fallback) === 1,
      last_error: lastError,
    };
  });

  let days: Array<{ day: string; count: number }> = [];
  const touched = new Set(items.map((item) => item.day).filter((day): day is string => !!day));
  if (touched.size) {
    const counts = new Map<string, number>();
    for (const row of matching) {
      const day = localDay(row.created_ms, normalized.offset);
      if (day && touched.has(day)) counts.set(day, (counts.get(day) || 0) + 1);
    }
    days = [...counts].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }

  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    filters: {
      project: normalized.project ?? null,
      agent: normalized.agent ?? null,
      state: normalized.states,
      from: normalized.fromIso,
      to: normalized.toIso,
      tz_offset_minutes: normalized.offset,
    },
    stages,
    ...(facets ? { facets } : {}),
    items,
    next_cursor: nextCursor,
    days,
  };
}
