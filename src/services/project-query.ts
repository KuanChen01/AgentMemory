import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseManager } from './db';
import { isSensitiveFactKey, sanitizeText } from './pipeline-query';
import { orchestrateMemoryRead } from './memory-orchestrator';
import { renderCompactProjectContextView } from './context-view';
import { buildAdminSkillItems } from './skill-query';

const DAY_MS = 86_400_000;
const PREVIEW_LIMIT = 4096;
const STATE_FACTS_LIMIT = 50;
const RECENT_DIGESTS_LIMIT = 5;
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;
const Q_MAX = 200;
const PROJECT_PARAM_MAX = 4096;
const CURSOR_TOKEN = /^[A-Za-z0-9_-]+$/;
const FILTER_HASH = /^[0-9a-f]{12}$/;
const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):(\d{2}))?$/i;
const PROJECT_KEY_RE = /^p_[0-9a-f]{16}$/i;
const LIST_SORTS = ['last_activity', 'memories', 'name'] as const;
const DAY_WINDOWS = [7, 30, 90] as const;

type ListSort = typeof LIST_SORTS[number];
type DayWindow = typeof DAY_WINDOWS[number];

export interface ProjectQueryRuntime {
  nowMs?: number;
}

export interface AdminProjectListOptions {
  days?: number;
  q?: string;
  sort?: string;
  limit?: number;
  cursor?: string | null;
  tzOffsetMinutes?: number;
}

export interface AdminProjectDetailOptions {
  project?: string;
  days?: number;
  tzOffsetMinutes?: number;
}

export interface ProjectEntry {
  project_key: string;
  project_path: string;
  display_name: string;
  display_name_collision: boolean;
}

export interface ProjectCatalog {
  entries: ProjectEntry[];
  byKey: Map<string, ProjectEntry>;
  byLower: Map<string, ProjectEntry>;
}

interface OffsetCursor {
  o: number;
  f: string;
}

interface ParsedStamp {
  ms: number;
  hasTime: boolean;
  hasZone: boolean;
}

interface ProjectStats {
  memories_total: number;
  memories_in_range: number;
  last_activity_at: string | null;
  agents: Array<{ agent_id: string; count: number }>;
  state_facts_count: number;
  latest_digest_covered_day: string | null;
  digest_days_in_range: number;
  skills_count: number;
  candidates_count: number;
}

interface NormalizedList {
  days: DayWindow;
  q: string | null;
  sort: ListSort;
  offset: number;
  limit: number;
  cursor: OffsetCursor | null;
  filterHash: string;
}

function invalid(name: string, field: string): Error {
  return new Error(`Invalid ${name} request: ${field}`);
}

export function asciiLower(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : value[i];
  }
  return out;
}

export function projectKeyFor(projectPath: string): string {
  return `p_${createHash('sha256').update(asciiLower(projectPath), 'utf8').digest('hex').slice(0, 16)}`;
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

export function normalizeTimestamp(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = parseStamp(text);
  return parsed ? new Date(parsed.ms).toISOString() : null;
}

export function localDay(ms: number, offsetMinutes: number): string {
  return new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

export function localMidnightUtcMs(day: string, offsetMinutes: number): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) - offsetMinutes * 60_000;
}

export function nowMsOf(runtime: ProjectQueryRuntime | undefined): number {
  const value = runtime?.nowMs;
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

export function hashFilters(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
}

export function strictOffset(value: number | undefined, name: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -840 || value > 840) {
    throw invalid(name, 'tz_offset_minutes');
  }
  return value;
}

export function strictDays(value: number | undefined, name: string): DayWindow {
  if (value === undefined) return 30;
  if (!(DAY_WINDOWS as readonly number[]).includes(value)) throw invalid(name, 'days');
  return value as DayWindow;
}

export function strictLimit(value: number | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > LIST_LIMIT_MAX) {
    throw invalid(name, 'limit');
  }
  return value;
}

export function takeCursor(cursor: string | null | undefined, name: string): string | null {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  if (typeof cursor !== 'string') throw invalid(name, 'cursor');
  return cursor;
}

function decodeCursor(cursor: string, name: string): any {
  if (typeof cursor !== 'string' || !CURSOR_TOKEN.test(cursor)) throw invalid(name, 'cursor');
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid(name, 'cursor');
  }
}

export function decodeOffsetCursor(cursor: string, name: string): OffsetCursor {
  const parsed = decodeCursor(cursor, name);
  const offset = parsed?.o;
  const hash = parsed?.f;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) throw invalid(name, 'cursor');
  if (typeof hash !== 'string' || !FILTER_HASH.test(hash)) throw invalid(name, 'cursor');
  return { o: offset, f: hash };
}

export function encodeOffsetCursor(offset: number, filterHash: string): string {
  return Buffer.from(JSON.stringify({ o: offset, f: filterHash })).toString('base64url');
}

export function asCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Cut raw text to at most rawMax chars on a whitespace boundary before sanitizing, so the
 * redaction regexes never run over very long strings and never see half a path or email.
 * A first token longer than rawMax is dropped rather than cut.
 */
export function preClip(value: unknown, rawMax: number): unknown {
  if (typeof value !== 'string' || value.length <= rawMax) return value;
  const head = value.slice(0, rawMax + 1);
  const cut = head.search(/\s\S*$/);
  return cut > 0 ? value.slice(0, cut) : '';
}

export function clipSanitize(value: unknown, max: number): string | null {
  return clip(sanitizeText(preClip(value, max * 3)), max);
}

export function sanitizeMultiline(value: string): string {
  return value.split('\n').map((line) => sanitizeText(line) ?? '').join('\n');
}

function lastSegment(projectPath: string): string {
  const parts = projectPath.split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

function displayNameFor(projectPath: string): string {
  const sanitized = sanitizeText(lastSegment(projectPath));
  return sanitized && sanitized.length > 0 ? sanitized : '(unnamed)';
}

function applyDisplayNames(entries: Array<{ project_key: string; project_path: string }>): ProjectEntry[] {
  const names = entries.map((entry) => ({
    ...entry,
    baseName: displayNameFor(entry.project_path),
  }));
  const counts = new Map<string, number>();
  for (const row of names) counts.set(row.baseName, (counts.get(row.baseName) || 0) + 1);
  return names.map((row) => {
    const collision = (counts.get(row.baseName) || 0) > 1;
    return {
      project_key: row.project_key,
      project_path: row.project_path,
      display_name: collision ? `${row.baseName} · ${row.project_key.slice(2, 6)}` : row.baseName,
      display_name_collision: collision,
    };
  });
}

function mergeCanonical(into: Map<string, string>, projectPath: unknown) {
  if (typeof projectPath !== 'string' || projectPath === '') return;
  const key = asciiLower(projectPath);
  const previous = into.get(key);
  if (previous === undefined || projectPath < previous) into.set(key, projectPath);
}

export function loadProjectCatalog(db: DatabaseManager): ProjectCatalog {
  const byLowerPath = new Map<string, string>();
  for (const table of ['observations', 'state_facts', 'daily_memory_digests', 'procedural_skills']) {
    for (const row of db.sqlAll(
      `SELECT MIN(project_path) AS project_path FROM ${table} GROUP BY project_path COLLATE NOCASE`,
    )) mergeCanonical(byLowerPath, row.project_path);
  }
  const raw = [...byLowerPath.values()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((project_path) => ({ project_path, project_key: projectKeyFor(project_path) }));
  const entries = applyDisplayNames(raw);
  const byKey = new Map<string, ProjectEntry>();
  const byLower = new Map<string, ProjectEntry>();
  for (const entry of entries) {
    byKey.set(entry.project_key, entry);
    byLower.set(asciiLower(entry.project_path), entry);
  }
  return { entries, byKey, byLower };
}

export function resolveProjectRef(catalog: ProjectCatalog, raw: string): ProjectEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (PROJECT_KEY_RE.test(trimmed)) return catalog.byKey.get(asciiLower(trimmed)) ?? null;
  const direct = catalog.byLower.get(asciiLower(trimmed));
  if (direct) return direct;
  const resolved = path.resolve(trimmed).replace(/\\/g, '/');
  return catalog.byLower.get(asciiLower(resolved)) ?? null;
}

function rangeIso(nowMs: number, days: number): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(nowMs - days * DAY_MS).toISOString(),
    toIso: new Date(nowMs).toISOString(),
  };
}

export function fourteenDates(nowMs: number, offset: number): string[] {
  const today = localDay(nowMs, offset);
  const days: string[] = [];
  for (let i = 13; i >= 0; i -= 1) days.push(addDays(today, -i));
  return days;
}

export function localRangeBounds(nowMs: number, offset: number, dayCount: number): { fromDay: string; toDay: string; fromIso: string; toIso: string } {
  const today = localDay(nowMs, offset);
  const fromDay = addDays(today, -(dayCount - 1));
  return {
    fromDay,
    toDay: today,
    fromIso: new Date(localMidnightUtcMs(fromDay, offset)).toISOString(),
    toIso: new Date(localMidnightUtcMs(addDays(today, 1), offset)).toISOString(),
  };
}

function emptyStats(): ProjectStats {
  return {
    memories_total: 0,
    memories_in_range: 0,
    last_activity_at: null,
    agents: [],
    state_facts_count: 0,
    latest_digest_covered_day: null,
    digest_days_in_range: 0,
    skills_count: 0,
    candidates_count: 0,
  };
}

function statsMap(catalog: ProjectCatalog): Map<string, ProjectStats> {
  const out = new Map<string, ProjectStats>();
  for (const entry of catalog.entries) out.set(entry.project_key, emptyStats());
  return out;
}

function keyOf(catalog: ProjectCatalog, projectPath: unknown): string | null {
  if (typeof projectPath !== 'string' || projectPath === '') return null;
  return catalog.byLower.get(asciiLower(projectPath))?.project_key ?? null;
}

function loadObservationStats(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  stats: Map<string, ProjectStats>,
  fromIso: string,
  toIso: string,
) {
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path,
        COUNT(*) AS memories_total,
        MAX(datetime(created_at)) AS last_dt
     FROM observations
     GROUP BY project_path COLLATE NOCASE`,
  )) {
    const key = keyOf(catalog, row.project_path);
    if (!key) continue;
    const item = stats.get(key)!;
    item.memories_total = asCount(row.memories_total);
    item.last_activity_at = normalizeTimestamp(row.last_dt);
  }
  const agents = new Map<string, Array<{ agent_id: string; count: number }>>();
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path, agent_id, COUNT(*) AS n
     FROM observations
     WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
     GROUP BY project_path COLLATE NOCASE, agent_id`,
    [fromIso, toIso],
  )) {
    const key = keyOf(catalog, row.project_path);
    if (!key || typeof row.agent_id !== 'string' || row.agent_id === '') continue;
    const count = asCount(row.n);
    const item = stats.get(key)!;
    item.memories_in_range += count;
    if (!agents.has(key)) agents.set(key, []);
    agents.get(key)!.push({ agent_id: row.agent_id, count });
  }
  for (const [key, list] of agents) {
    list.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0;
    });
    stats.get(key)!.agents = list;
  }
}

function loadStateFactCounts(db: DatabaseManager, catalog: ProjectCatalog, stats: Map<string, ProjectStats>) {
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path, COUNT(*) AS n
     FROM state_facts
     WHERE superseded_at IS NULL
     GROUP BY project_path COLLATE NOCASE`,
  )) {
    const key = keyOf(catalog, row.project_path);
    if (key) stats.get(key)!.state_facts_count = asCount(row.n);
  }
}

function loadDigestStats(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  stats: Map<string, ProjectStats>,
  fromDay: string,
  toDay: string,
) {
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path, MAX(local_date) AS latest_day
     FROM daily_memory_digests
     WHERE status = 'success'
     GROUP BY project_path COLLATE NOCASE`,
  )) {
    const key = keyOf(catalog, row.project_path);
    if (key) stats.get(key)!.latest_digest_covered_day = typeof row.latest_day === 'string' ? row.latest_day : null;
  }
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path, COUNT(DISTINCT local_date) AS n
     FROM daily_memory_digests
     WHERE status = 'success' AND local_date >= ? AND local_date <= ?
     GROUP BY project_path COLLATE NOCASE`,
    [fromDay, toDay],
  )) {
    const key = keyOf(catalog, row.project_path);
    if (key) stats.get(key)!.digest_days_in_range = asCount(row.n);
  }
}

function loadSkillCounts(db: DatabaseManager, catalog: ProjectCatalog, stats: Map<string, ProjectStats>) {
  for (const row of db.sqlAll(
    `SELECT MIN(project_path) AS project_path,
        COALESCE(SUM(CASE WHEN status = 'enabled' THEN 1 ELSE 0 END), 0) AS enabled_n,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_n
     FROM procedural_skills
     GROUP BY project_path COLLATE NOCASE`,
  )) {
    const key = keyOf(catalog, row.project_path);
    if (!key) continue;
    const item = stats.get(key)!;
    item.skills_count = asCount(row.enabled_n);
    item.candidates_count = asCount(row.draft_n);
  }
}

function addPendingCandidateCounts(catalog: ProjectCatalog, stats: Map<string, ProjectStats>, pending: Map<string, number>) {
  for (const [key, count] of pending) {
    const item = stats.get(key);
    if (item) item.candidates_count += count;
  }
}

function toListItem(entry: ProjectEntry, stats: ProjectStats) {
  return {
    project_key: entry.project_key,
    display_name: entry.display_name,
    display_name_collision: entry.display_name_collision,
    project_path: entry.project_path,
    memories_total: stats.memories_total,
    memories_in_range: stats.memories_in_range,
    last_activity_at: stats.last_activity_at,
    agents: stats.agents,
    state_facts_count: stats.state_facts_count,
    latest_digest_covered_day: stats.latest_digest_covered_day,
    digest_days_in_range: stats.digest_days_in_range,
    skills_count: stats.skills_count,
    candidates_count: stats.candidates_count,
    startup_context_tokens: null as null,
  };
}

function sortItems(
  items: ReturnType<typeof toListItem>[],
  sort: ListSort,
): ReturnType<typeof toListItem>[] {
  const ranked = items.slice();
  ranked.sort((a, b) => {
    if (sort === 'last_activity') {
      const am = a.last_activity_at ? Date.parse(a.last_activity_at) : Number.NEGATIVE_INFINITY;
      const bm = b.last_activity_at ? Date.parse(b.last_activity_at) : Number.NEGATIVE_INFINITY;
      if (am !== bm) return bm - am;
    } else if (sort === 'memories') {
      if (a.memories_in_range !== b.memories_in_range) return b.memories_in_range - a.memories_in_range;
      if (a.memories_total !== b.memories_total) return b.memories_total - a.memories_total;
    } else if (a.display_name !== b.display_name) {
      return a.display_name.localeCompare(b.display_name, 'en', { sensitivity: 'base' });
    }
    return a.project_key < b.project_key ? -1 : a.project_key > b.project_key ? 1 : 0;
  });
  return ranked;
}

function normalizeList(options: AdminProjectListOptions): NormalizedList {
  const days = strictDays(options.days, 'project-list');
  const offset = strictOffset(options.tzOffsetMinutes, 'project-list');
  let q: string | null = null;
  if (options.q !== undefined && options.q !== '') {
    if (typeof options.q !== 'string') throw invalid('project-list', 'q');
    if (options.q.length > Q_MAX) throw invalid('project-list', 'q');
    q = options.q;
  }
  let sort: ListSort = 'last_activity';
  if (options.sort !== undefined && options.sort !== '') {
    if (typeof options.sort !== 'string' || !(LIST_SORTS as readonly string[]).includes(options.sort)) {
      throw invalid('project-list', 'sort');
    }
    sort = options.sort as ListSort;
  }
  const filterHash = hashFilters({ days, q, sort, tz_offset_minutes: offset });
  let cursor: OffsetCursor | null = null;
  const rawCursor = takeCursor(options.cursor, 'project-list');
  if (rawCursor) {
    cursor = decodeOffsetCursor(rawCursor, 'project-list');
    if (cursor.f !== filterHash) throw invalid('project-list', 'cursor');
  }
  return {
    days,
    q,
    sort,
    offset,
    limit: strictLimit(options.limit, 'project-list', LIST_LIMIT_DEFAULT),
    cursor,
    filterHash,
  };
}

function pendingCountsByKey(db: DatabaseManager, catalog: ProjectCatalog, projectPath?: string): Map<string, number> {
  const { countPendingDigestCandidatesByProjectKey } = require('./skill-query') as typeof import('./skill-query');
  return countPendingDigestCandidatesByProjectKey(db, catalog, projectPath);
}

function loadAllStats(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  nowMs: number,
  days: number,
  tzOffset: number,
): Map<string, ProjectStats> {
  const stats = statsMap(catalog);
  const range = rangeIso(nowMs, days);
  const local = localRangeBounds(nowMs, tzOffset, days);
  loadObservationStats(db, catalog, stats, range.fromIso, range.toIso);
  loadStateFactCounts(db, catalog, stats);
  loadDigestStats(db, catalog, stats, local.fromDay, local.toDay);
  loadSkillCounts(db, catalog, stats);
  addPendingCandidateCounts(catalog, stats, pendingCountsByKey(db, catalog));
  return stats;
}

function loadOneProjectStats(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  entry: ProjectEntry,
  nowMs: number,
  days: number,
  tzOffset: number,
): ProjectStats {
  const stats = emptyStats();
  const range = rangeIso(nowMs, days);
  const local = localRangeBounds(nowMs, tzOffset, days);
  const totals = db.sqlGet(
    `SELECT COUNT(*) AS memories_total, MAX(datetime(created_at)) AS last_dt
     FROM observations WHERE project_path = ? COLLATE NOCASE`,
    [entry.project_path],
  ) || {};
  stats.memories_total = asCount(totals.memories_total);
  stats.last_activity_at = normalizeTimestamp(totals.last_dt);
  const agents: Array<{ agent_id: string; count: number }> = [];
  for (const row of db.sqlAll(
    `SELECT agent_id, COUNT(*) AS n FROM observations
     WHERE project_path = ? COLLATE NOCASE
       AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
     GROUP BY agent_id`,
    [entry.project_path, range.fromIso, range.toIso],
  )) {
    if (typeof row.agent_id !== 'string' || row.agent_id === '') continue;
    const count = asCount(row.n);
    stats.memories_in_range += count;
    agents.push({ agent_id: row.agent_id, count });
  }
  agents.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0;
  });
  stats.agents = agents;
  const facts = db.sqlGet(
    `SELECT COUNT(*) AS n FROM state_facts
     WHERE project_path = ? COLLATE NOCASE AND superseded_at IS NULL`,
    [entry.project_path],
  );
  stats.state_facts_count = asCount(facts?.n);
  const latest = db.sqlGet(
    `SELECT MAX(local_date) AS latest_day FROM daily_memory_digests
     WHERE project_path = ? COLLATE NOCASE AND status = 'success'`,
    [entry.project_path],
  );
  stats.latest_digest_covered_day = typeof latest?.latest_day === 'string' ? latest.latest_day : null;
  const digestDays = db.sqlGet(
    `SELECT COUNT(DISTINCT local_date) AS n FROM daily_memory_digests
     WHERE project_path = ? COLLATE NOCASE AND status = 'success' AND local_date >= ? AND local_date <= ?`,
    [entry.project_path, local.fromDay, local.toDay],
  );
  stats.digest_days_in_range = asCount(digestDays?.n);
  const skills = db.sqlGet(
    `SELECT
        COALESCE(SUM(CASE WHEN status = 'enabled' THEN 1 ELSE 0 END), 0) AS enabled_n,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_n
     FROM procedural_skills WHERE project_path = ? COLLATE NOCASE`,
    [entry.project_path],
  ) || {};
  stats.skills_count = asCount(skills.enabled_n);
  stats.candidates_count = asCount(skills.draft_n);
  const pending = pendingCountsByKey(db, catalog, entry.project_path);
  stats.candidates_count += pending.get(entry.project_key) || 0;
  return stats;
}

function mapDigestStatus(stored: unknown): 'succeeded' | 'skipped' | 'failed' {
  const status = String(stored ?? '');
  if (status === 'success') return 'succeeded';
  if (status.startsWith('skipped_')) return 'skipped';
  return 'failed';
}

function firstSentence(value: unknown): string | null {
  const sanitized = sanitizeText(preClip(value, 1200));
  if (!sanitized) return null;
  const match = sanitized.match(/^(.+?[.!?])(?:\s|$)/);
  return clip(match ? match[1] : sanitized, 200);
}

function memoryBars(
  db: DatabaseManager,
  projectPath: string,
  nowMs: number,
  tzOffset: number,
): Array<{ date: string; memories: number }> {
  const dates = fourteenDates(nowMs, tzOffset);
  const bounds = localRangeBounds(nowMs, tzOffset, 14);
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, 0);
  for (const row of db.sqlAll(
    `SELECT created_at FROM observations
     WHERE project_path = ? COLLATE NOCASE
       AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`,
    [projectPath, bounds.fromIso, bounds.toIso],
  )) {
    const parsed = typeof row.created_at === 'string' ? parseStamp(row.created_at) : null;
    if (!parsed) continue;
    const day = localDay(parsed.ms, tzOffset);
    if (counts.has(day)) counts.set(day, (counts.get(day) || 0) + 1);
  }
  return dates.map((date) => ({ date, memories: counts.get(date) || 0 }));
}

function currentStateFacts(db: DatabaseManager, projectPath: string) {
  const totalRow = db.sqlGet(
    `SELECT COUNT(*) AS n FROM state_facts
     WHERE project_path = ? COLLATE NOCASE AND superseded_at IS NULL`,
    [projectPath],
  );
  const rows = db.sqlAll(
    `SELECT entity_type, entity_key, fact_key, value_json, effective_at, recorded_at
     FROM state_facts
     WHERE project_path = ? COLLATE NOCASE AND superseded_at IS NULL
     ORDER BY datetime(recorded_at) DESC, id DESC
     LIMIT ?`,
    [projectPath, STATE_FACTS_LIMIT],
  );
  return {
    state_facts_total: asCount(totalRow?.n),
    state_facts: rows.map((row) => ({
      entity_type: row.entity_type ?? null,
      entity_key: sanitizeText(row.entity_key),
      fact_key: row.fact_key ?? null,
      value: isSensitiveFactKey(row.fact_key) ? '<redacted>' : clipSanitize(row.value_json, 200),
      effective_at: normalizeTimestamp(row.effective_at),
      updated_at: normalizeTimestamp(row.recorded_at),
    })),
  };
}

function recentDigests(db: DatabaseManager, projectPath: string) {
  const rows = db.sqlAll(
    `SELECT id, local_date, status,
        CASE WHEN json_valid(digest_json) AND json_type(digest_json, '$.summary') = 'text'
          THEN json_extract(digest_json, '$.summary') ELSE NULL END AS summary_text
     FROM daily_memory_digests
     WHERE project_path = ? COLLATE NOCASE
     ORDER BY local_date DESC, id DESC
     LIMIT ?`,
    [projectPath, RECENT_DIGESTS_LIMIT],
  );
  return rows.map((row) => ({
    id: row.id,
    covered_day: row.local_date ?? null,
    status: mapDigestStatus(row.status),
    summary_first_sentence: firstSentence(row.summary_text),
  }));
}

async function buildStartupContext(db: DatabaseManager, projectPath: string) {
  const generatedAt = new Date().toISOString();
  const orchestrated = await orchestrateMemoryRead(db, {
    limit: 10,
    mode: 'startup',
    projectPath,
    queryText: '',
    skillLimit: 6,
  });
  const view = orchestrated.project_context;
  const compact = renderCompactProjectContextView(view);
  const sanitized = sanitizeMultiline(compact);
  const chars = sanitized.length;
  const truncated = chars > PREVIEW_LIMIT;
  return {
    preview: truncated ? sanitized.slice(0, PREVIEW_LIMIT) : sanitized,
    truncated,
    chars,
    item_count:
      (view.current_state?.length || 0)
      + (view.summary_blocks?.length || 0)
      + (view.daily_digests?.length || 0)
      + (view.procedural_skills?.length || 0),
    generated_at: generatedAt,
    tokens: null as null,
  };
}

/**
 * Read-only project list. Per-project aggregates are SQL GROUP BYs; sort/page stay in JS.
 */
export function getAdminProjectList(
  db: DatabaseManager,
  options: AdminProjectListOptions = {},
  runtime: ProjectQueryRuntime = {},
) {
  const normalized = normalizeList(options);
  const nowMs = nowMsOf(runtime);
  const catalog = loadProjectCatalog(db);
  const stats = loadAllStats(db, catalog, nowMs, normalized.days, normalized.offset);
  const allItems = catalog.entries.map((entry) => toListItem(entry, stats.get(entry.project_key)!));
  const qNeedle = normalized.q ? asciiLower(normalized.q) : null;
  const filtered = qNeedle
    ? allItems.filter((item) => asciiLower(item.display_name).includes(qNeedle))
    : allItems;
  const sorted = sortItems(filtered, normalized.sort);
  const start = normalized.cursor?.o ?? 0;
  const page = sorted.slice(start, start + normalized.limit);
  const nextCursor = sorted.length > start + normalized.limit
    ? encodeOffsetCursor(start + normalized.limit, normalized.filterHash)
    : null;
  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    filters: {
      days: normalized.days,
      q: normalized.q,
      sort: normalized.sort,
      tz_offset_minutes: normalized.offset,
    },
    summary: {
      projects_total: catalog.entries.length,
      active_in_range: allItems.filter((item) => item.memories_in_range > 0).length,
    },
    items: page,
    next_cursor: nextCursor,
  };
}

function normalizeDetail(options: AdminProjectDetailOptions) {
  const project = options.project;
  if (typeof project !== 'string' || project.length < 1 || project.length > PROJECT_PARAM_MAX) {
    throw invalid('project-detail', 'project');
  }
  return {
    project,
    days: strictDays(options.days, 'project-detail'),
    offset: strictOffset(options.tzOffsetMinutes, 'project-detail'),
  };
}

/** Compact startup context plus current facts, recent digests, skills, and 14-day bars. Unknown project returns null. */
export async function getAdminProjectDetail(
  db: DatabaseManager,
  options: AdminProjectDetailOptions = {},
  runtime: ProjectQueryRuntime = {},
) {
  const normalized = normalizeDetail(options);
  const nowMs = nowMsOf(runtime);
  const catalog = loadProjectCatalog(db);
  const entry = resolveProjectRef(catalog, normalized.project);
  if (!entry) return null;
  const stats = loadOneProjectStats(db, catalog, entry, nowMs, normalized.days, normalized.offset);
  const project = toListItem(entry, stats);
  const facts = currentStateFacts(db, entry.project_path);
  const skills = buildAdminSkillItems(db, {
    catalog,
    projectPath: entry.project_path,
    includeRetired: false,
    days: normalized.days,
    tzOffsetMinutes: normalized.offset,
    nowMs,
  }).sort((a, b) => {
    const order: Record<string, number> = { active: 0, candidate: 1, disabled: 2, retired: 3 };
    const left = order[a.status] ?? 9;
    const right = order[b.status] ?? 9;
    if (left !== right) return left - right;
    if (a.match_count_in_range !== b.match_count_in_range) return b.match_count_in_range - a.match_count_in_range;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    project,
    startup_context: await buildStartupContext(db, entry.project_path),
    state_facts: facts.state_facts,
    state_facts_total: facts.state_facts_total,
    recent_digests: recentDigests(db, entry.project_path),
    skills,
    days: memoryBars(db, entry.project_path, nowMs, normalized.offset),
  };
}
