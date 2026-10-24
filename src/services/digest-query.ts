import { createHash } from 'node:crypto';
import { DatabaseManager } from './db';
import { agentMatchSql, presentAgentIds } from './agent-id';
import { sanitizeLastError, sanitizeText } from './pipeline-query';

const DIGEST_STATUSES = ['succeeded', 'skipped', 'failed'] as const;
type DigestStatus = typeof DIGEST_STATUSES[number];

const COUNT_KEYS = [
  'facts', 'decisions', 'next_actions', 'open_questions',
  'skill_candidates', 'verified_commands', 'state_fact_candidates',
] as const;

const DAY_MS = 86_400_000;
const READS_MAX_WINDOW_MS = 31 * DAY_MS;
const VAULT_RUN_LIMIT = 20;
const SOURCE_LIMIT = 50;
const VAULT_ENTITY_KEYS = ['obsidian-vault-daily-review', 'automation/obsidian-vault-daily-review'];

const CURSOR_TOKEN = /^[A-Za-z0-9_-]+$/;
const FILTER_HASH = /^[0-9a-f]{12}$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// Date, optional time, optional Z or numeric offset. Stored rows also use 'YYYY-MM-DD HH:MM:SS'.
const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):(\d{2}))?$/i;

export interface DigestQueryRuntime {
  nowMs?: number;
}

export interface AdminDigestListOptions {
  project?: string;
  status?: string;
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
  limit?: number;
  cursor?: string | null;
  stats?: boolean;
  /** Digests have no agent column: matches digests with at least one source memory from this agent. */
  agent?: string;
}

export interface AdminDigestDetailOptions {
  id?: string;
}

export interface AdminVaultReviewsOptions {
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
  limit?: number;
  cursor?: string | null;
  readsFrom?: string;
  readsTo?: string;
  stats?: boolean;
}

interface DigestCursor {
  d: string;
  k: string;
  f: string;
}

interface VaultCursor {
  t: string;
  k: string;
  f: string;
}

interface ParsedStamp {
  ms: number;
  hasTime: boolean;
  hasZone: boolean;
}

interface NormalizedDigestList {
  project?: string;
  agent?: string;
  statuses: DigestStatus[];
  fromDay: string | null;
  toDay: string | null;
  offset: number;
  limit: number;
  cursor: DigestCursor | null;
  stats: boolean;
  filterHash: string;
}

interface NormalizedVault {
  fromMs: number | null;
  toMs: number | null;
  fromIso: string | null;
  toIso: string | null;
  offset: number;
  limit: number;
  cursor: VaultCursor | null;
  readsFromMs: number;
  readsToMs: number;
  readsFromIso: string;
  readsToIso: string;
  stats: boolean;
  filterHash: string;
}

function invalid(name: string, field: string): Error {
  return new Error(`Invalid ${name} request: ${field}`);
}

function isRealUtcDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function parseStamp(value: string): ParsedStamp | null {
  const text = value.trim();
  const match = STAMP_RE.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealUtcDay(year, month, day)) return null;
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : 0;
  const minute = hasTime ? Number(match[5]) : 0;
  const second = hasTime ? Number(match[6]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const frac = match[7] || '';
  const millis = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;
  if (!Number.isInteger(millis)) return null;
  let ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  if (match[8]) {
    const offHour = Number(match[9]);
    const offMinute = Number(match[10]);
    if (offHour > 23 || offMinute > 59) return null;
    const sign = match[8] === '-' ? -1 : 1;
    ms -= sign * (offHour * 60 + offMinute) * 60_000;
  }
  if (!Number.isFinite(ms)) return null;
  return { ms, hasTime, hasZone: /(?:Z|[+-]\d{2}:\d{2})$/i.test(text) };
}

/** Stored timestamps: ISO Z, numeric offset (microseconds allowed), or 'YYYY-MM-DD HH:MM:SS' (UTC). */
function normalizeTimestamp(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = parseStamp(text);
  return parsed ? new Date(parsed.ms).toISOString() : null;
}

function localDay(ms: number, offsetMinutes: number): string {
  return new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function isLocalMidnight(ms: number, offsetMinutes: number): boolean {
  const shifted = ms + offsetMinutes * 60_000;
  return ((shifted % DAY_MS) + DAY_MS) % DAY_MS === 0;
}

function addDays(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

function localMidnightUtcMs(day: string, offsetMinutes: number): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) - offsetMinutes * 60_000;
}

function daysDescending(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  for (let day = toDay; day >= fromDay; day = addDays(day, -1)) days.push(day);
  return days;
}

function nowMsOf(runtime: DigestQueryRuntime | undefined): number {
  const value = runtime?.nowMs;
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function hashFilters(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
}

function strictOffset(value: number | undefined, name: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -840 || value > 840) {
    throw invalid(name, 'tz_offset_minutes');
  }
  return value;
}

function strictLimit(value: number | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw invalid(name, 'limit');
  }
  return value;
}

function strictStats(value: boolean | undefined, name: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw invalid(name, 'stats');
  return value;
}

function exactText(value: string | undefined, name: string, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalid(name, field);
  return value;
}

function queryInstantMs(value: string, name: string, field: string): number {
  const parsed = parseStamp(value.trim());
  if (!parsed || !parsed.hasTime || !parsed.hasZone) throw invalid(name, field);
  return parsed.ms;
}

function digestStatusList(value: string | undefined): DigestStatus[] {
  if (value === undefined) return [...DIGEST_STATUSES];
  if (typeof value !== 'string') throw invalid('digest-list', 'status');
  const trimmed = value.trim();
  if (trimmed === '') return [...DIGEST_STATUSES];
  const selected = new Set<DigestStatus>();
  for (const token of trimmed.split(',')) {
    const status = token.trim();
    if (!(DIGEST_STATUSES as readonly string[]).includes(status)) throw invalid('digest-list', 'status');
    selected.add(status as DigestStatus);
  }
  return DIGEST_STATUSES.filter((status) => selected.has(status));
}

/**
 * Covered-day bound. A bare YYYY-MM-DD is used as-is (to is exclusive).
 * An instant's from is the local day that contains it. Its to is that local day
 * when the instant is exactly local midnight, and the next day otherwise,
 * so a time after midnight still includes its own covered day.
 */
function digestBound(value: string | undefined, field: 'from' | 'to', offset: number): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw invalid('digest-list', field);
  const text = value.trim();
  if (text === '') throw invalid('digest-list', field);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = parseStamp(text);
    if (!parsed || parsed.hasTime) throw invalid('digest-list', field);
    return text;
  }
  const ms = queryInstantMs(text, 'digest-list', field);
  const day = localDay(ms, offset);
  if (field === 'from') return day;
  return isLocalMidnight(ms, offset) ? day : addDays(day, 1);
}

function decodeCursor(cursor: string, name: string): any {
  if (typeof cursor !== 'string' || !CURSOR_TOKEN.test(cursor)) throw invalid(name, 'cursor');
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid(name, 'cursor');
  }
}

function decodeDigestCursor(cursor: string): DigestCursor {
  const parsed = decodeCursor(cursor, 'digest-list');
  const day = parsed?.d;
  const key = parsed?.k;
  const hash = parsed?.f;
  if (typeof day !== 'string' || !parseStamp(day) || parseStamp(day)?.hasTime) throw invalid('digest-list', 'cursor');
  if (typeof key !== 'string' || key.length < 1 || key.length > 512) throw invalid('digest-list', 'cursor');
  if (typeof hash !== 'string' || !FILTER_HASH.test(hash)) throw invalid('digest-list', 'cursor');
  return { d: day, k: key, f: hash };
}

function decodeVaultCursor(cursor: string): VaultCursor {
  const parsed = decodeCursor(cursor, 'vault-reviews');
  const time = parsed?.t;
  const key = parsed?.k;
  const hash = parsed?.f;
  if (typeof time !== 'string' || !ISO_MS.test(time)) throw invalid('vault-reviews', 'cursor');
  const ms = Date.parse(time);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== time) throw invalid('vault-reviews', 'cursor');
  if (typeof key !== 'string' || key.length < 1 || key.length > 512) throw invalid('vault-reviews', 'cursor');
  if (typeof hash !== 'string' || !FILTER_HASH.test(hash)) throw invalid('vault-reviews', 'cursor');
  return { t: time, k: key, f: hash };
}

function takeCursor(cursor: string | null | undefined, name: string): string | null {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  if (typeof cursor !== 'string') throw invalid(name, 'cursor');
  return cursor;
}

function normalizeDigestList(options: AdminDigestListOptions): NormalizedDigestList {
  const offset = strictOffset(options.tzOffsetMinutes, 'digest-list');
  const fromDay = digestBound(options.from, 'from', offset);
  const toDay = digestBound(options.to, 'to', offset);
  if (fromDay && toDay && fromDay >= toDay) throw invalid('digest-list', 'from');
  const project = exactText(options.project, 'digest-list', 'project');
  const agent = exactText(options.agent, 'digest-list', 'agent');
  const statuses = digestStatusList(options.status);
  const filterHash = hashFilters({
    project: project ?? null,
    agent: agent ?? null,
    status: [...statuses].sort(),
    from: fromDay,
    to: toDay,
  });
  let cursor: DigestCursor | null = null;
  const rawCursor = takeCursor(options.cursor, 'digest-list');
  if (rawCursor) {
    cursor = decodeDigestCursor(rawCursor);
    if (cursor.f !== filterHash) throw invalid('digest-list', 'cursor');
  }
  return {
    project,
    agent,
    statuses,
    fromDay,
    toDay,
    offset,
    limit: strictLimit(options.limit, 'digest-list', 50),
    cursor,
    stats: strictStats(options.stats, 'digest-list'),
    filterHash,
  };
}

function mapDigestStatus(stored: unknown): DigestStatus {
  const status = String(stored ?? '');
  if (status === 'success') return 'succeeded';
  if (status.startsWith('skipped_')) return 'skipped';
  return 'failed';
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function asCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface DigestScope {
  project?: string;
  agent?: string;
  fromDay: string | null;
  toDay: string | null;
  statuses: DigestStatus[] | null;
  cursor: { d: string; k: string } | null;
}

function digestScopeSql(scope: DigestScope): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  if (scope.project !== undefined) {
    parts.push('LOWER(project_path) = LOWER(?)');
    params.push(scope.project);
  }
  if (scope.agent !== undefined) {
    const match = agentMatchSql('o.agent_id', scope.agent);
    parts.push(`EXISTS (SELECT 1 FROM json_each(${SOURCE_IDS_JSON}) j JOIN observations o ON o.id = j.value
      WHERE ${match.sql})`);
    params.push(...match.params);
  }
  if (scope.fromDay) {
    parts.push('local_date >= ?');
    params.push(scope.fromDay);
  }
  if (scope.toDay) {
    parts.push('local_date < ?');
    params.push(scope.toDay);
  }
  const statuses = scope.statuses;
  if (statuses && statuses.length < DIGEST_STATUSES.length) {
    const ors: string[] = [];
    if (statuses.includes('succeeded')) ors.push(`status = 'success'`);
    if (statuses.includes('skipped')) ors.push(`status GLOB 'skipped_*'`);
    if (statuses.includes('failed')) ors.push(`(status != 'success' AND status NOT GLOB 'skipped_*')`);
    parts.push(ors.length === 1 ? ors[0]! : `(${ors.join(' OR ')})`);
  }
  if (scope.cursor) {
    parts.push('(local_date < ? OR (local_date = ? AND id < ?))');
    params.push(scope.cursor.d, scope.cursor.d, scope.cursor.k);
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

const SOURCE_IDS_JSON = `CASE WHEN json_valid(source_observation_ids) AND json_type(source_observation_ids) = 'array' THEN source_observation_ids ELSE '[]' END`;

/** Distinct source-memory agents per digest id (case-insensitive dedupe, first spelling wins, sorted). */
function digestAgents(db: DatabaseManager, ids: string[] | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const where = ids ? `WHERE d.id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = db.sqlAll(`SELECT d.id AS id, MIN(o.agent_id) AS agent_id FROM daily_memory_digests d, json_each(
      CASE WHEN json_valid(d.source_observation_ids) AND json_type(d.source_observation_ids) = 'array' THEN d.source_observation_ids ELSE '[]' END) j
    JOIN observations o ON o.id = j.value ${where} GROUP BY d.id, LOWER(o.agent_id)`, ids || []);
  for (const row of rows) {
    if (typeof row.agent_id !== 'string' || !row.agent_id) continue;
    if (!out.has(row.id)) out.set(row.id, []);
    out.get(row.id)!.push(row.agent_id);
  }
  for (const list of out.values()) list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return out;
}

function countSelect(key: string): string {
  return `CASE WHEN json_valid(digest_json) AND json_type(digest_json, '$.${key}') = 'array' THEN json_array_length(digest_json, '$.${key}') ELSE 0 END AS n_${key}`;
}

const DIGEST_JSON_SELECT = [
  'id',
  'COALESCE(length(CAST(digest_json AS BLOB)), 0) AS size_bytes',
  `CASE WHEN json_valid(digest_json) AND json_type(digest_json, '$.summary') = 'text' THEN json_extract(digest_json, '$.summary') ELSE NULL END AS summary_text`,
  `CASE WHEN json_valid(digest_json) AND json_type(digest_json, '$.confidence') IN ('integer', 'real') THEN json_extract(digest_json, '$.confidence') ELSE NULL END AS confidence_value`,
  ...COUNT_KEYS.map(countSelect),
].join(', ');

function facetProjects(rows: any[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const value = row.project_path;
    if (typeof value !== 'string' || value === '') continue;
    const key = value.toLowerCase();
    const previous = byKey.get(key);
    if (previous === undefined || value < previous) byKey.set(key, value);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function latestGeneratedAt(rows: any[]): string | null {
  let bestMs = Number.NEGATIVE_INFINITY;
  let best: string | null = null;
  for (const row of rows) {
    const text = row?.generated_at;
    if (typeof text !== 'string') continue;
    const parsed = parseStamp(text.trim());
    if (!parsed || parsed.ms < bestMs) continue;
    bestMs = parsed.ms;
    best = new Date(parsed.ms).toISOString();
  }
  return best;
}

/**
 * Read-only digest list. Stats and day buckets are column aggregates.
 * Summary, counts, confidence and size are read only for the page rows.
 */
export function getAdminDigestList(db: DatabaseManager, options: AdminDigestListOptions = {}, runtime: DigestQueryRuntime = {}) {
  const normalized = normalizeDigestList(options);
  const nowMs = nowMsOf(runtime);
  const baseScope: DigestScope = {
    project: normalized.project,
    agent: normalized.agent,
    fromDay: normalized.fromDay,
    toDay: normalized.toDay,
    statuses: null,
    cursor: null,
  };
  const pageScope: DigestScope = {
    ...baseScope,
    statuses: normalized.statuses,
    cursor: normalized.cursor,
  };
  const pageWhere = digestScopeSql(pageScope);
  const scanned = db.sqlAll(
    `SELECT id, project_path, local_date, generated_at, status, model, last_error, source_count
     FROM daily_memory_digests
     ${pageWhere.sql}
     ORDER BY local_date DESC, id DESC
     LIMIT ?`,
    [...pageWhere.params, normalized.limit + 1],
  );
  const hasMore = scanned.length > normalized.limit;
  const pageRows = hasMore ? scanned.slice(0, normalized.limit) : scanned;
  const jsonById = new Map<string, any>();
  if (pageRows.length) {
    const marks = pageRows.map(() => '?').join(',');
    for (const row of db.sqlAll(
      `SELECT ${DIGEST_JSON_SELECT} FROM daily_memory_digests WHERE id IN (${marks})`,
      pageRows.map((row) => row.id),
    )) jsonById.set(row.id, row);
  }

  const agentsById = pageRows.length ? digestAgents(db, pageRows.map((row) => row.id)) : new Map<string, string[]>();
  const items = pageRows.map((row) => {
    const extra = jsonById.get(row.id) || {};
    const counts: { [key: string]: number } = {};
    for (const key of COUNT_KEYS) counts[key] = asCount(extra[`n_${key}`]);
    return {
      id: row.id,
      project_path: row.project_path,
      agents: agentsById.get(row.id) || [],
      covered_day: row.local_date,
      generated_at: normalizeTimestamp(row.generated_at),
      status: mapDigestStatus(row.status),
      status_detail: row.status ?? null,
      summary: clip(sanitizeText(extra.summary_text), 200),
      counts,
      source_count: asCount(row.source_count),
      confidence: asConfidence(extra.confidence_value),
      model: row.model ?? null,
      size_bytes: asCount(extra.size_bytes),
      last_error: sanitizeLastError(row.last_error),
    };
  });
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ d: last.covered_day, k: last.id, f: normalized.filterHash })).toString('base64url')
    : null;

  const touched = [...new Set(items.map((item) => item.covered_day).filter((day): day is string => !!day))];
  let days: Array<{ day: string; total: number; succeeded: number; skipped: number; failed: number }> = [];
  if (touched.length) {
    const dayWhere = digestScopeSql({ ...pageScope, cursor: null });
    const marks = touched.map(() => '?').join(',');
    const grouped = db.sqlAll(
      `SELECT local_date AS day,
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS succeeded,
         COALESCE(SUM(CASE WHEN status GLOB 'skipped_*' THEN 1 ELSE 0 END), 0) AS skipped,
         COALESCE(SUM(CASE WHEN status != 'success' AND status NOT GLOB 'skipped_*' THEN 1 ELSE 0 END), 0) AS failed
       FROM daily_memory_digests
       ${dayWhere.sql}${dayWhere.sql ? ' AND' : 'WHERE'} local_date IN (${marks})
       GROUP BY local_date
       ORDER BY local_date DESC`,
      [...dayWhere.params, ...touched],
    );
    days = grouped.map((row) => ({
      day: row.day,
      total: asCount(row.total),
      succeeded: asCount(row.succeeded),
      skipped: asCount(row.skipped),
      failed: asCount(row.failed),
    }));
  }

  const wantStats = !normalized.cursor && normalized.stats;
  let stats: {
    total: number; succeeded: number; skipped: number; failed: number;
    latest_covered_day: string | null; latest_covered_day_projects: string[]; latest_generated_at: string | null;
  } | null = null;
  let facets: { projects: string[]; agents: Array<{ agent_id: string; agent_label: string }> } | null = null;
  if (wantStats) {
    const statsWhere = digestScopeSql(baseScope);
    const totals = db.sqlGet(
      `SELECT COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS succeeded,
         COALESCE(SUM(CASE WHEN status GLOB 'skipped_*' THEN 1 ELSE 0 END), 0) AS skipped,
         COALESCE(SUM(CASE WHEN status != 'success' AND status NOT GLOB 'skipped_*' THEN 1 ELSE 0 END), 0) AS failed,
         MAX(local_date) AS latest_covered_day
       FROM daily_memory_digests
       ${statsWhere.sql}`,
      statsWhere.params,
    ) || {};
    const generated = db.sqlAll(
      `SELECT generated_at FROM daily_memory_digests ${statsWhere.sql}`,
      statsWhere.params,
    );
    const latestDay = totals.latest_covered_day ?? null;
    const latestProjects = latestDay
      ? facetProjects(db.sqlAll(`SELECT project_path FROM daily_memory_digests ${statsWhere.sql}${statsWhere.sql ? ' AND' : 'WHERE'} local_date = ?`,
        [...statsWhere.params, latestDay]))
      : [];
    stats = {
      total: asCount(totals.total),
      succeeded: asCount(totals.succeeded),
      skipped: asCount(totals.skipped),
      failed: asCount(totals.failed),
      latest_covered_day: latestDay,
      latest_covered_day_projects: latestProjects,
      latest_generated_at: latestGeneratedAt(generated),
    };
    const agentKeys = new Map<string, string>();
    for (const list of digestAgents(db, null).values()) for (const agent of list) {
      const key = agent.toLowerCase(); const prev = agentKeys.get(key);
      if (prev === undefined || agent < prev) agentKeys.set(key, agent);
    }
    facets = {
      projects: facetProjects(db.sqlAll(`SELECT project_path FROM daily_memory_digests`)),
      agents: presentAgentIds([...agentKeys.values()]),
    };
  }

  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    filters: {
      project: normalized.project ?? null,
      agent: normalized.agent ?? null,
      status: normalized.statuses,
      from: normalized.fromDay,
      to: normalized.toDay,
      tz_offset_minutes: normalized.offset,
    },
    items,
    next_cursor: nextCursor,
    days,
    stats,
    facets,
  };
}

function sourceIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function parseDigestBody(raw: unknown): { body: any; bodyError: 'invalid_json' | null } {
  if (typeof raw !== 'string' || raw.trim() === '') return { body: null, bodyError: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { body: null, bodyError: 'invalid_json' };
    return { body: parsed, bodyError: null };
  } catch {
    return { body: null, bodyError: 'invalid_json' };
  }
}

/** Parsed digest plus the first 50 source observations. Unknown id returns null. */
export function getAdminDigestDetail(db: DatabaseManager, options: AdminDigestDetailOptions = {}, _runtime: DigestQueryRuntime = {}) {
  const id = options.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > 512) throw invalid('digest-detail', 'id');
  const row = db.sqlGet(
    `SELECT id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
       model, prompt_version, generated_at, reviewed_at, last_error,
       COALESCE(length(CAST(digest_json AS BLOB)), 0) AS size_bytes
     FROM daily_memory_digests WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  const parsed = parseDigestBody(row.digest_json);
  const ids = sourceIds(row.source_observation_ids);
  const truncated = ids.length > SOURCE_LIMIT;
  const page = ids.slice(0, SOURCE_LIMIT);
  const found = new Map<string, { title: string | null; created_at: string | null }>();
  if (page.length) {
    const marks = page.map(() => '?').join(',');
    for (const source of db.sqlAll(
      `SELECT id, title, created_at FROM observations WHERE id IN (${marks})`,
      page,
    )) {
      found.set(source.id, {
        title: source.title ?? null,
        created_at: normalizeTimestamp(source.created_at) ?? (source.created_at ?? null),
      });
    }
  }
  const sources = page.map((sourceId) => {
    const source = found.get(sourceId);
    if (!source) return { id: sourceId, title: null, created_at: null, missing: true };
    return { id: sourceId, title: source.title, created_at: source.created_at, missing: false };
  });
  const confidence = parsed.body && typeof parsed.body.confidence === 'number' && Number.isFinite(parsed.body.confidence)
    ? parsed.body.confidence
    : null;
  return {
    status: 'ok' as const,
    disabled: false,
    digest: {
      id: row.id,
      project_path: row.project_path,
      covered_day: row.local_date,
      generated_at: normalizeTimestamp(row.generated_at),
      status: mapDigestStatus(row.status),
      status_detail: row.status ?? null,
      model: row.model ?? null,
      prompt_version: row.prompt_version ?? null,
      source_count: asCount(row.source_count),
      confidence,
      size_bytes: asCount(row.size_bytes),
      last_error: sanitizeLastError(row.last_error),
      reviewed_at: normalizeTimestamp(row.reviewed_at),
      body: parsed.body,
      body_error: parsed.bodyError,
    },
    sources,
    sources_truncated: truncated,
  };
}

function vaultInstant(value: string | undefined, field: 'from' | 'to' | 'reads_from' | 'reads_to'): number | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw invalid('vault-reviews', field);
  const text = value.trim();
  if (text === '') throw invalid('vault-reviews', field);
  return queryInstantMs(text, 'vault-reviews', field);
}

function normalizeVault(options: AdminVaultReviewsOptions, nowMs: number): NormalizedVault {
  const offset = strictOffset(options.tzOffsetMinutes, 'vault-reviews');
  const fromMs = vaultInstant(options.from, 'from');
  const toMs = vaultInstant(options.to, 'to');
  if (fromMs !== null && toMs !== null && !(toMs > fromMs)) throw invalid('vault-reviews', 'from');
  const readsFromGiven = options.readsFrom !== undefined;
  const readsToGiven = options.readsTo !== undefined;
  let readsFromMs: number;
  let readsToMs: number;
  if (!readsFromGiven && !readsToGiven) {
    const today = localDay(nowMs, offset);
    readsFromMs = localMidnightUtcMs(addDays(today, -13), offset);
    readsToMs = localMidnightUtcMs(addDays(today, 1), offset);
  } else {
    if (!readsFromGiven) throw invalid('vault-reviews', 'reads_from');
    if (!readsToGiven) throw invalid('vault-reviews', 'reads_to');
    const from = vaultInstant(options.readsFrom, 'reads_from');
    const to = vaultInstant(options.readsTo, 'reads_to');
    if (from === null || to === null || !(to > from)) throw invalid('vault-reviews', 'reads_from');
    if (to - from > READS_MAX_WINDOW_MS) throw invalid('vault-reviews', 'reads_to');
    readsFromMs = from;
    readsToMs = to;
  }
  const fromIso = fromMs === null ? null : new Date(fromMs).toISOString();
  const toIso = toMs === null ? null : new Date(toMs).toISOString();
  const filterHash = hashFilters({ from: fromIso, to: toIso });
  let cursor: VaultCursor | null = null;
  const rawCursor = takeCursor(options.cursor, 'vault-reviews');
  if (rawCursor) {
    cursor = decodeVaultCursor(rawCursor);
    if (cursor.f !== filterHash) throw invalid('vault-reviews', 'cursor');
  }
  return {
    fromMs,
    toMs,
    fromIso,
    toIso,
    offset,
    limit: strictLimit(options.limit, 'vault-reviews', 20),
    cursor,
    readsFromMs,
    readsToMs,
    readsFromIso: new Date(readsFromMs).toISOString(),
    readsToIso: new Date(readsToMs).toISOString(),
    stats: strictStats(options.stats, 'vault-reviews'),
    filterHash,
  };
}

function valueRaw(valueJson: unknown): string | null {
  if (valueJson == null) return null;
  const text = String(valueJson);
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : text;
  } catch {
    return text;
  }
}

interface VaultCheckpoint {
  id: string;
  checkpoint_at: string | null;
  ms: number | null;
  day: string | null;
  value_raw: string | null;
  effective_at: string | null;
  recorded_at: string | null;
  superseded_at: string | null;
  current: boolean;
  project_path: string;
}

function loadCheckpoints(db: DatabaseManager, offset: number): VaultCheckpoint[] {
  const marks = VAULT_ENTITY_KEYS.map(() => '?').join(',');
  const rows = db.sqlAll(
    `SELECT id, project_path, value_json, effective_at, recorded_at, superseded_at
     FROM state_facts
     WHERE LOWER(entity_key) IN (${marks})
       AND fact_key = 'last_successful_review_at'`,
    VAULT_ENTITY_KEYS,
  );
  return rows.map((row) => {
    const raw = valueRaw(row.value_json);
    const fromValue = raw ? parseStamp(raw.trim()) : null;
    const fromEffective = parseStamp(String(row.effective_at ?? '').trim());
    const ms = fromValue?.ms ?? fromEffective?.ms ?? null;
    return {
      id: row.id,
      checkpoint_at: ms === null ? null : new Date(ms).toISOString(),
      ms,
      day: ms === null ? null : localDay(ms, offset),
      value_raw: raw,
      effective_at: normalizeTimestamp(row.effective_at),
      recorded_at: normalizeTimestamp(row.recorded_at),
      superseded_at: row.superseded_at == null ? null : normalizeTimestamp(row.superseded_at),
      current: row.superseded_at == null,
      project_path: row.project_path,
    };
  }).sort((a, b) => {
    const am = a.ms ?? Number.NEGATIVE_INFINITY;
    const bm = b.ms ?? Number.NEGATIVE_INFINITY;
    if (am !== bm) return bm - am;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Day dots for the Vault card: one entry per local day of the window, oldest first. */
function vaultDays(db: DatabaseManager, checkpoints: VaultCheckpoint[], fromMs: number, toMs: number, offset: number) {
  const start = localDay(fromMs, offset);
  const end = localDay(toMs - 1, offset);
  const dayList = daysDescending(start, end).reverse();
  const buckets = new Map<string, { runs: number; reads: number; readers: Set<string> }>();
  for (const day of dayList) buckets.set(day, { runs: 0, reads: 0, readers: new Set() });
  // Every checkpoint row (current or superseded) is one successful run.
  for (const row of checkpoints) {
    if (row.ms === null || row.ms < fromMs || row.ms >= toMs) continue;
    const bucket = buckets.get(localDay(row.ms, offset));
    if (bucket) bucket.runs += 1;
  }
  // One row per (reader, item): a re-read moves read_at, so a day counts items whose latest read fell that day.
  // read_at is CURRENT_TIMESTAMP (UTC); the SQL prefilter keeps the scan to the window (one day of slack for odd formats).
  for (const row of db.sqlAll(`SELECT reader, read_at FROM review_reads WHERE julianday(read_at) >= julianday(?) - 1 AND julianday(read_at) < julianday(?) + 1`,
    [new Date(fromMs).toISOString(), new Date(toMs).toISOString()])) {
    const parsed = parseStamp(String(row.read_at ?? '').trim());
    if (!parsed || parsed.ms < fromMs || parsed.ms >= toMs) continue;
    const bucket = buckets.get(localDay(parsed.ms, offset));
    if (!bucket) continue;
    bucket.reads += 1;
    bucket.readers.add(String(row.reader));
  }
  const days = dayList.map((day) => {
    const bucket = buckets.get(day)!;
    return { day, ran: bucket.runs > 0, runs: bucket.runs, reads: bucket.reads, readers: bucket.readers.size };
  });
  return { days, reads_total: days.reduce((sum, day) => sum + day.reads, 0) };
}

function reviewRuns(db: DatabaseManager) {
  const rows = db.sqlAll(
    `SELECT run_id, reader, since, until, status, started_at, updated_at FROM review_runs`,
  );
  return rows.map((row) => {
    const parsed = parseStamp(String(row.started_at ?? '').trim());
    return { row, ms: parsed ? parsed.ms : Number.NEGATIVE_INFINITY };
  }).sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms;
    return a.row.run_id < b.row.run_id ? 1 : a.row.run_id > b.row.run_id ? -1 : 0;
  }).slice(0, VAULT_RUN_LIMIT).map(({ row }) => ({
    run_id: row.run_id,
    reader: row.reader,
    since: row.since ?? null,
    until: row.until ?? null,
    status: row.status ?? null,
    started_at: normalizeTimestamp(row.started_at),
    updated_at: normalizeTimestamp(row.updated_at),
  }));
}

/**
 * Vault review checkpoints (including superseded history), read counts, and review runs.
 * The Vault job is an external automation, so schedule is always null.
 */
export function getAdminVaultReviews(db: DatabaseManager, options: AdminVaultReviewsOptions = {}, runtime: DigestQueryRuntime = {}) {
  const nowMs = nowMsOf(runtime);
  const normalized = normalizeVault(options, nowMs);
  const all = loadCheckpoints(db, normalized.offset);
  const latestRow = all.find((row) => row.ms !== null) || null;
  const filtered = all.filter((row) => {
    if (row.ms === null) return normalized.fromMs === null && normalized.toMs === null;
    if (normalized.fromMs !== null && row.ms < normalized.fromMs) return false;
    if (normalized.toMs !== null && row.ms >= normalized.toMs) return false;
    return true;
  });
  const start = normalized.cursor
    ? filtered.findIndex((row) => {
      const time = row.checkpoint_at;
      if (time === null) return false;
      return time < normalized.cursor!.t || (time === normalized.cursor!.t && row.id < normalized.cursor!.k);
    })
    : 0;
  const rest = start < 0 ? [] : filtered.slice(start);
  const page = rest.slice(0, normalized.limit);
  const last = page[page.length - 1];
  const nextCursor = rest.length > normalized.limit && last?.checkpoint_at
    ? Buffer.from(JSON.stringify({ t: last.checkpoint_at, k: last.id, f: normalized.filterHash })).toString('base64url')
    : null;
  const wantStats = !normalized.cursor && normalized.stats;
  const dayInfo = wantStats ? vaultDays(db, all, normalized.readsFromMs, normalized.readsToMs, normalized.offset) : null;
  const checkpoints = page.map((row) => ({
    id: row.id,
    checkpoint_at: row.checkpoint_at,
    day: row.day,
    value_raw: row.value_raw,
    effective_at: row.effective_at,
    recorded_at: row.recorded_at,
    superseded_at: row.superseded_at,
    current: row.current,
    project_path: row.project_path,
  }));
  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    filters: {
      from: normalized.fromIso,
      to: normalized.toIso,
      tz_offset_minutes: normalized.offset,
      reads_from: normalized.readsFromIso,
      reads_to: normalized.readsToIso,
    },
    checkpoints,
    next_cursor: nextCursor,
    last_checkpoint_at: wantStats ? latestRow?.checkpoint_at ?? null : null,
    last_checkpoint_age_ms: wantStats && latestRow ? nowMs - (latestRow.ms as number) : null,
    days: dayInfo ? dayInfo.days : null,
    reads_total: dayInfo ? dayInfo.reads_total : null,
    runs: wantStats ? reviewRuns(db) : null,
    schedule: null,
  };
}
