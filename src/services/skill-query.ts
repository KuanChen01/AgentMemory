import { DatabaseManager } from './db';
import { sanitizeText } from './pipeline-query';
import {
  ProjectCatalog,
  ProjectEntry,
  ProjectQueryRuntime,
  asciiLower,
  asCount,
  clipSanitize,
  decodeOffsetCursor,
  encodeOffsetCursor,
  fourteenDates,
  hashFilters,
  loadProjectCatalog,
  localDay,
  normalizeTimestamp,
  nowMsOf,
  resolveProjectRef,
  sanitizeMultiline,
  strictDays,
  strictLimit,
  strictOffset,
  takeCursor,
} from './project-query';

const Q_MAX = 200;
const ID_MAX = 512;
const SUMMARY_LIMIT_DEFAULT = 100;
const RECENT_LIMIT = 10;
const SKILL_STATUSES = ['all', 'active', 'candidate', 'disabled', 'retired'] as const;
const SKILL_SORTS = ['matches', 'recent', 'name'] as const;
const STORED_TO_API: Record<string, SkillApiStatus> = {
  enabled: 'active',
  draft: 'candidate',
  disabled: 'disabled',
  retired: 'retired',
};

type SkillFilterStatus = typeof SKILL_STATUSES[number];
type SkillSort = typeof SKILL_SORTS[number];
type SkillApiStatus = 'active' | 'candidate' | 'disabled' | 'retired';

export interface AdminSkillsSummaryOptions {
  status?: string;
  project?: string;
  days?: number;
  q?: string;
  sort?: string;
  limit?: number;
  cursor?: string | null;
  tzOffsetMinutes?: number;
}

export interface AdminSkillDetailOptions {
  id?: string;
  days?: number;
  tzOffsetMinutes?: number;
}

export interface AdminSkillItem {
  id: string;
  kind: 'skill' | 'digest_candidate';
  name: string;
  summary: string | null;
  status: SkillApiStatus;
  stored_status: string | null;
  project_key: string;
  display_name: string;
  display_name_collision: boolean;
  project_path: string;
  source: 'digest_candidate' | 'manual';
  source_digest: { id: string; covered_day: string | null } | null;
  candidate_ref: { local_date: string; candidate_index: number } | null;
  confidence: number | null;
  steps_count: number;
  created_at: string | null;
  updated_at: string | null;
  match_count_in_range: number;
  last_matched_at: string | null;
  feedback_up: number;
  feedback_down: number;
  feedback: { success: number; failure: number; rejected: number; skipped: number };
  days: Array<{ date: string; matches: number }>;
}

export interface BuildAdminSkillItemsOptions {
  catalog?: ProjectCatalog;
  projectPath?: string;
  includeRetired?: boolean;
  days: number;
  tzOffsetMinutes: number;
  nowMs: number;
}

interface PendingCandidate {
  id: string;
  digestId: string;
  projectPath: string;
  localDate: string;
  generatedAt: string | null;
  index: number;
  title: string;
  summary: string | null;
  trigger: string | null;
  steps: string[];
  tags: string[];
  confidence: number | null;
}

interface TitleMatchAgg {
  countInRange: number;
  lastMs: number;
  lastIso: string | null;
  dayCounts: Map<string, number>;
  recent: AdminSkillMatch[];
}

export interface AdminSkillMatch {
  review_id: string;
  at: string | null;
  task: string | null;
  agent_id: string | null;
  recommendation_state: string | null;
  score: null;
}

interface SkillRecord {
  item: AdminSkillItem;
  trigger: string | null;
  steps: string[];
  tags: string[];
  titleLower: string;
  recentMatches: AdminSkillMatch[];
}

function invalid(name: string, field: string): Error {
  return new Error(`Invalid ${name} request: ${field}`);
}

function asConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(raw: unknown): string[] {
  return parseJsonArray(raw).map((value) => String(value));
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function catalogEntry(catalog: ProjectCatalog, projectPath: string): ProjectEntry | null {
  return catalog.byLower.get(asciiLower(projectPath)) ?? null;
}

function titleKey(projectKey: string, title: string): string {
  return `${projectKey}\0${asciiLower(title.trim())}`;
}

function emptyFeedback() {
  return { success: 0, failure: 0, rejected: 0, skipped: 0 };
}

function skillTitlesByProject(db: DatabaseManager, catalog: ProjectCatalog): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const row of db.sqlAll(`SELECT project_path, title FROM procedural_skills`)) {
    if (typeof row.title !== 'string' || !row.title.trim()) continue;
    const entry = catalogEntry(catalog, String(row.project_path || ''));
    if (!entry) continue;
    if (!out.has(entry.project_key)) out.set(entry.project_key, new Set());
    out.get(entry.project_key)!.add(asciiLower(row.title.trim()));
  }
  return out;
}

function loadPendingDigestCandidates(db: DatabaseManager, catalog: ProjectCatalog, projectPath?: string): PendingCandidate[] {
  const existing = skillTitlesByProject(db, catalog);
  const best = new Map<string, PendingCandidate>();
  const rows = projectPath
    ? db.sqlAll(
      `SELECT d.id AS digest_id, d.project_path, d.local_date, d.generated_at,
          CAST(j.key AS INTEGER) AS candidate_index, j.value AS candidate_json
       FROM daily_memory_digests d,
         json_each(
           CASE WHEN json_valid(d.digest_json) AND json_type(d.digest_json, '$.skill_candidates') = 'array'
             THEN json_extract(d.digest_json, '$.skill_candidates') ELSE '[]' END
         ) j
       WHERE d.status = 'success' AND d.project_path = ? COLLATE NOCASE`,
      [projectPath],
    )
    : db.sqlAll(
      `SELECT d.id AS digest_id, d.project_path, d.local_date, d.generated_at,
          CAST(j.key AS INTEGER) AS candidate_index, j.value AS candidate_json
       FROM daily_memory_digests d,
         json_each(
           CASE WHEN json_valid(d.digest_json) AND json_type(d.digest_json, '$.skill_candidates') = 'array'
             THEN json_extract(d.digest_json, '$.skill_candidates') ELSE '[]' END
         ) j
       WHERE d.status = 'success'`,
    );
  for (const row of rows) {
    const body = asObject(row.candidate_json);
    const title = String(body?.title ?? '').trim();
    if (!title) continue;
    const entry = catalogEntry(catalog, String(row.project_path || ''));
    if (!entry) continue;
    if (existing.get(entry.project_key)?.has(asciiLower(title))) continue;
    const index = asCount(row.candidate_index);
    const generatedAt = normalizeTimestamp(row.generated_at);
    const candidate: PendingCandidate = {
      id: `c_${row.digest_id}_${index}`,
      digestId: String(row.digest_id),
      projectPath: entry.project_path,
      localDate: String(row.local_date || ''),
      generatedAt,
      index,
      title,
      summary: typeof body?.summary === 'string' ? body.summary : body?.summary == null ? null : String(body.summary),
      trigger: String(body?.trigger_text || body?.trigger || '').trim() || null,
      steps: parseStringArray(body?.steps),
      tags: parseStringArray(body?.tags),
      confidence: asConfidence(body?.confidence),
    };
    const dedupeKey = titleKey(entry.project_key, title);
    const previous = best.get(dedupeKey);
    if (!previous) {
      best.set(dedupeKey, candidate);
      continue;
    }
    if (candidate.localDate > previous.localDate) {
      best.set(dedupeKey, candidate);
      continue;
    }
    if (candidate.localDate === previous.localDate) {
      const nextMs = candidate.generatedAt ? Date.parse(candidate.generatedAt) : 0;
      const prevMs = previous.generatedAt ? Date.parse(previous.generatedAt) : 0;
      if (nextMs > prevMs || (nextMs === prevMs && candidate.index > previous.index)) {
        best.set(dedupeKey, candidate);
      }
    }
  }
  return [...best.values()];
}

export function countPendingDigestCandidatesByProjectKey(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  projectPath?: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of loadPendingDigestCandidates(db, catalog, projectPath)) {
    const entry = catalogEntry(catalog, candidate.projectPath);
    if (!entry) continue;
    counts.set(entry.project_key, (counts.get(entry.project_key) || 0) + 1);
  }
  return counts;
}

function recState(states: unknown[], index: number): string | null {
  if (index < 0 || index >= states.length) return null;
  const value = states[index];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as any).state === 'string') return (value as any).state;
  return null;
}

function loadMatchIndex(
  db: DatabaseManager,
  catalog: ProjectCatalog,
  nowMs: number,
  days: number,
  tzOffset: number,
  projectPath?: string,
): Map<string, TitleMatchAgg> {
  const range = {
    fromMs: nowMs - days * 86_400_000,
    toMs: nowMs,
  };
  const barDates = fourteenDates(nowMs, tzOffset);
  const barSet = new Set(barDates);
  const out = new Map<string, TitleMatchAgg>();
  const rows = projectPath
    ? db.sqlAll(
      `SELECT id, project_path, generated_at, matched_skill_titles_json, recommendation_states_json,
          source_title, source_agent_id
       FROM post_task_reviews
       WHERE project_path = ? COLLATE NOCASE`,
      [projectPath],
    )
    : db.sqlAll(
      `SELECT id, project_path, generated_at, matched_skill_titles_json, recommendation_states_json,
          source_title, source_agent_id
       FROM post_task_reviews`,
    );
  const parsed = rows.map((row) => {
    const stamp = typeof row.generated_at === 'string' ? Date.parse(normalizeTimestamp(row.generated_at) || '') : NaN;
    return { row, ms: Number.isFinite(stamp) ? stamp : Number.NEGATIVE_INFINITY };
  }).sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms;
    return String(a.row.id) < String(b.row.id) ? 1 : String(a.row.id) > String(b.row.id) ? -1 : 0;
  });
  for (const { row, ms } of parsed) {
    const entry = catalogEntry(catalog, String(row.project_path || ''));
    if (!entry) continue;
    const titles = parseStringArray(row.matched_skill_titles_json);
    const states = parseJsonArray(row.recommendation_states_json);
    const at = Number.isFinite(ms) && ms > Number.NEGATIVE_INFINITY ? new Date(ms).toISOString() : normalizeTimestamp(row.generated_at);
    const day = Number.isFinite(ms) && ms > Number.NEGATIVE_INFINITY ? localDay(ms, tzOffset) : null;
    const inRange = Number.isFinite(ms) && ms >= range.fromMs && ms < range.toMs;
    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index]!.trim();
      if (!title) continue;
      const key = titleKey(entry.project_key, title);
      let agg = out.get(key);
      if (!agg) {
        agg = { countInRange: 0, lastMs: Number.NEGATIVE_INFINITY, lastIso: null, dayCounts: new Map(), recent: [] };
        out.set(key, agg);
      }
      if (inRange) agg.countInRange += 1;
      if (ms > agg.lastMs) {
        agg.lastMs = ms;
        agg.lastIso = at;
      }
      if (day && barSet.has(day)) agg.dayCounts.set(day, (agg.dayCounts.get(day) || 0) + 1);
      if (agg.recent.length < RECENT_LIMIT) {
        agg.recent.push({
          review_id: row.id,
          at,
          task: clipSanitize(row.source_title, 200),
          agent_id: typeof row.source_agent_id === 'string' ? row.source_agent_id : null,
          recommendation_state: recState(states, index),
          score: null,
        });
      }
    }
  }
  return out;
}

function loadFeedbackCounts(db: DatabaseManager): Map<string, { success: number; failure: number; rejected: number; skipped: number }> {
  const out = new Map<string, { success: number; failure: number; rejected: number; skipped: number }>();
  for (const row of db.sqlAll(
    `SELECT skill_id, outcome, COUNT(*) AS n FROM procedural_skill_feedback GROUP BY skill_id, outcome`,
  )) {
    const id = String(row.skill_id || '');
    if (!id) continue;
    if (!out.has(id)) out.set(id, emptyFeedback());
    const bucket = out.get(id)!;
    const outcome = String(row.outcome || '');
    if (outcome === 'success' || outcome === 'failure' || outcome === 'rejected' || outcome === 'skipped') {
      bucket[outcome] = asCount(row.n);
    }
  }
  return out;
}

function zeroDays(nowMs: number, tzOffset: number): Array<{ date: string; matches: number }> {
  return fourteenDates(nowMs, tzOffset).map((date) => ({ date, matches: 0 }));
}

function daysFromAgg(agg: TitleMatchAgg | undefined, nowMs: number, tzOffset: number): Array<{ date: string; matches: number }> {
  const dates = fourteenDates(nowMs, tzOffset);
  return dates.map((date) => ({ date, matches: agg?.dayCounts.get(date) || 0 }));
}

function attachProject(entry: ProjectEntry) {
  return {
    project_key: entry.project_key,
    display_name: entry.display_name,
    display_name_collision: entry.display_name_collision,
    project_path: entry.project_path,
  };
}

function digestDaysById(db: DatabaseManager): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of db.sqlAll(`SELECT id, local_date FROM daily_memory_digests`)) {
    if (typeof row.id === 'string' && typeof row.local_date === 'string') out.set(row.id, row.local_date);
  }
  return out;
}

function loadSkillRecords(
  db: DatabaseManager,
  options: BuildAdminSkillItemsOptions,
): SkillRecord[] {
  const catalog = options.catalog || loadProjectCatalog(db);
  const nowMs = options.nowMs;
  const tzOffset = options.tzOffsetMinutes;
  const projectFilter = options.projectPath ? catalogEntry(catalog, options.projectPath) : null;
  const matchIndex = loadMatchIndex(db, catalog, nowMs, options.days, tzOffset, projectFilter?.project_path);
  const feedback = loadFeedbackCounts(db);
  const pending = loadPendingDigestCandidates(db, catalog, projectFilter?.project_path);
  const digestDays = digestDaysById(db);
  const records: SkillRecord[] = [];

  const skillRows = projectFilter
    ? db.sqlAll(
      `SELECT id, project_path, title, summary, trigger_text, steps_json, tags_json, status, confidence,
          source_digest_id, created_at, updated_at
       FROM procedural_skills
       WHERE project_path = ? COLLATE NOCASE`,
      [projectFilter.project_path],
    )
    : db.sqlAll(
      `SELECT id, project_path, title, summary, trigger_text, steps_json, tags_json, status, confidence,
          source_digest_id, created_at, updated_at
       FROM procedural_skills`,
    );
  for (const row of skillRows) {
    const stored = String(row.status || '');
    if (!options.includeRetired && stored === 'retired') continue;
    const entry = catalogEntry(catalog, String(row.project_path || ''));
    if (!entry) continue;
    if (projectFilter && entry.project_key !== projectFilter.project_key) continue;
    const title = String(row.title || '');
    const agg = matchIndex.get(titleKey(entry.project_key, title));
    const fb = feedback.get(String(row.id)) || emptyFeedback();
    const steps = parseStringArray(row.steps_json);
    const tags = parseStringArray(row.tags_json);
    const sourceDigestId = typeof row.source_digest_id === 'string' && row.source_digest_id ? row.source_digest_id : null;
    const coveredDay = sourceDigestId ? digestDays.get(sourceDigestId) ?? null : null;
    const item: AdminSkillItem = {
      id: String(row.id),
      kind: 'skill',
      name: sanitizeText(title) || '(unnamed)',
      summary: clipSanitize(row.summary, 200),
      status: STORED_TO_API[stored] || 'disabled',
      stored_status: stored || null,
      ...attachProject(entry),
      source: sourceDigestId ? 'digest_candidate' : 'manual',
      source_digest: sourceDigestId ? { id: sourceDigestId, covered_day: coveredDay } : null,
      candidate_ref: null,
      confidence: asConfidence(row.confidence),
      steps_count: steps.length,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
      match_count_in_range: agg?.countInRange || 0,
      last_matched_at: agg?.lastIso ?? null,
      feedback_up: fb.success,
      feedback_down: fb.failure + fb.rejected,
      feedback: { ...fb },
      days: daysFromAgg(agg, nowMs, tzOffset),
    };
    records.push({
      item,
      trigger: sanitizeText(row.trigger_text),
      steps: steps.map((step) => sanitizeMultiline(String(step))),
      tags: tags.map((tag) => sanitizeText(tag) || '').filter(Boolean),
      titleLower: asciiLower(title.trim()),
      recentMatches: (agg?.recent || []).slice(0, RECENT_LIMIT),
    });
  }

  for (const candidate of pending) {
    const entry = catalogEntry(catalog, candidate.projectPath);
    if (!entry) continue;
    if (projectFilter && entry.project_key !== projectFilter.project_key) continue;
    const item: AdminSkillItem = {
      id: candidate.id,
      kind: 'digest_candidate',
      name: sanitizeText(candidate.title) || '(unnamed)',
      summary: clipSanitize(candidate.summary, 200),
      status: 'candidate',
      stored_status: null,
      ...attachProject(entry),
      source: 'digest_candidate',
      source_digest: { id: candidate.digestId, covered_day: candidate.localDate },
      candidate_ref: { local_date: candidate.localDate, candidate_index: candidate.index },
      confidence: candidate.confidence,
      steps_count: candidate.steps.length,
      created_at: candidate.generatedAt,
      updated_at: null,
      match_count_in_range: 0,
      last_matched_at: null,
      feedback_up: 0,
      feedback_down: 0,
      feedback: emptyFeedback(),
      days: zeroDays(nowMs, tzOffset),
    };
    records.push({
      item,
      trigger: candidate.trigger ? sanitizeText(candidate.trigger) : null,
      steps: candidate.steps.map((step) => sanitizeMultiline(String(step))),
      tags: candidate.tags.map((tag) => sanitizeText(tag) || '').filter(Boolean),
      titleLower: asciiLower(candidate.title.trim()),
      recentMatches: [],
    });
  }
  return records;
}

/** Skill cards shared by skills-summary and project-detail. Pending digest candidates are included. */
export function buildAdminSkillItems(
  db: DatabaseManager,
  options: BuildAdminSkillItemsOptions,
): AdminSkillItem[] {
  return loadSkillRecords(db, options).map((record) => record.item);
}

function reviewSummary(db: DatabaseManager, project: ProjectEntry | null, nowMs: number, days: number) {
  const fromIso = new Date(nowMs - days * 86_400_000).toISOString();
  const toIso = new Date(nowMs).toISOString();
  const scope = project
    ? `WHERE datetime(generated_at) >= datetime(?) AND datetime(generated_at) < datetime(?) AND project_path = ? COLLATE NOCASE`
    : `WHERE datetime(generated_at) >= datetime(?) AND datetime(generated_at) < datetime(?)`;
  const params = project ? [fromIso, toIso, project.project_path] : [fromIso, toIso];
  const row = db.sqlGet(
    `SELECT COUNT(*) AS reviews_in_range,
        COALESCE(SUM(CASE WHEN json_valid(matched_skill_titles_json) AND json_type(matched_skill_titles_json) = 'array'
          AND json_array_length(matched_skill_titles_json) > 0 THEN 1 ELSE 0 END), 0) AS reviews_with_match,
        COALESCE(SUM(CASE WHEN json_valid(matched_skill_titles_json) AND json_type(matched_skill_titles_json) = 'array'
          THEN json_array_length(matched_skill_titles_json) ELSE 0 END), 0) AS matches_in_range
     FROM post_task_reviews
     ${scope}`,
    params,
  ) || {};
  const reviewsInRange = asCount(row.reviews_in_range);
  const reviewsWithMatch = asCount(row.reviews_with_match);
  return {
    matches_in_range: asCount(row.matches_in_range),
    reviews_in_range: reviewsInRange,
    reviews_with_match_in_range: reviewsWithMatch,
    hit_rate: reviewsInRange === 0 ? null : reviewsWithMatch / reviewsInRange,
  };
}

function countByStatus(items: AdminSkillItem[]) {
  const summary = { active: 0, candidates: 0, disabled: 0, retired: 0 };
  for (const item of items) {
    if (item.status === 'active') summary.active += 1;
    else if (item.status === 'candidate') summary.candidates += 1;
    else if (item.status === 'disabled') summary.disabled += 1;
    else if (item.status === 'retired') summary.retired += 1;
  }
  return summary;
}

function sortSkillItems(items: AdminSkillItem[], sort: SkillSort): AdminSkillItem[] {
  const ranked = items.slice();
  ranked.sort((a, b) => {
    if (sort === 'matches') {
      if (a.match_count_in_range !== b.match_count_in_range) return b.match_count_in_range - a.match_count_in_range;
    } else if (sort === 'recent') {
      const am = a.last_matched_at ? Date.parse(a.last_matched_at) : Number.NEGATIVE_INFINITY;
      const bm = b.last_matched_at ? Date.parse(b.last_matched_at) : Number.NEGATIVE_INFINITY;
      if (am !== bm) return bm - am;
    } else if (a.name !== b.name) {
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return ranked;
}

interface NormalizedSummary {
  status: SkillFilterStatus;
  project: string | null;
  days: number;
  q: string | null;
  sort: SkillSort;
  offset: number;
  limit: number;
  cursor: { o: number; f: string } | null;
  filterHash: string;
}

function normalizeSummary(options: AdminSkillsSummaryOptions): NormalizedSummary {
  const offset = strictOffset(options.tzOffsetMinutes, 'skills-summary');
  const days = strictDays(options.days, 'skills-summary');
  let status: SkillFilterStatus = 'all';
  if (options.status !== undefined && options.status !== '') {
    if (typeof options.status !== 'string' || !(SKILL_STATUSES as readonly string[]).includes(options.status)) {
      throw invalid('skills-summary', 'status');
    }
    status = options.status as SkillFilterStatus;
  }
  let project: string | null = null;
  if (options.project !== undefined && options.project !== '') {
    if (typeof options.project !== 'string') throw invalid('skills-summary', 'project');
    if (options.project.length > 4096) throw invalid('skills-summary', 'project');
    project = options.project;
  }
  let q: string | null = null;
  if (options.q !== undefined && options.q !== '') {
    if (typeof options.q !== 'string') throw invalid('skills-summary', 'q');
    if (options.q.length > Q_MAX) throw invalid('skills-summary', 'q');
    q = options.q;
  }
  let sort: SkillSort = 'matches';
  if (options.sort !== undefined && options.sort !== '') {
    if (typeof options.sort !== 'string' || !(SKILL_SORTS as readonly string[]).includes(options.sort)) {
      throw invalid('skills-summary', 'sort');
    }
    sort = options.sort as SkillSort;
  }
  const filterHash = hashFilters({
    status,
    project,
    days,
    q,
    sort,
    tz_offset_minutes: offset,
  });
  let cursor: { o: number; f: string } | null = null;
  const rawCursor = takeCursor(options.cursor, 'skills-summary');
  if (rawCursor) {
    cursor = decodeOffsetCursor(rawCursor, 'skills-summary');
    if (cursor.f !== filterHash) throw invalid('skills-summary', 'cursor');
  }
  return {
    status,
    project,
    days,
    q,
    sort,
    offset,
    limit: strictLimit(options.limit, 'skills-summary', SUMMARY_LIMIT_DEFAULT),
    cursor,
    filterHash,
  };
}

/**
 * Read-only skill list. Stored skills plus pending digest candidates; matches are title-based.
 */
export function getAdminSkillsSummary(
  db: DatabaseManager,
  options: AdminSkillsSummaryOptions = {},
  runtime: ProjectQueryRuntime = {},
) {
  const normalized = normalizeSummary(options);
  const nowMs = nowMsOf(runtime);
  const catalog = loadProjectCatalog(db);
  const projectEntry = normalized.project ? resolveProjectRef(catalog, normalized.project) : null;
  if (normalized.project && !projectEntry) {
    return {
      status: 'ok' as const,
      disabled: false,
      generated_at: new Date(nowMs).toISOString(),
      filters: {
        status: normalized.status,
        project: normalized.project,
        days: normalized.days,
        q: normalized.q,
        sort: normalized.sort,
        tz_offset_minutes: normalized.offset,
      },
      summary: {
        active: 0,
        candidates: 0,
        disabled: 0,
        retired: 0,
        matches_in_range: 0,
        reviews_in_range: 0,
        reviews_with_match_in_range: 0,
        hit_rate: null as null,
      },
      items: [] as AdminSkillItem[],
      next_cursor: null as null,
    };
  }
  const records = loadSkillRecords(db, {
    catalog,
    projectPath: projectEntry?.project_path,
    includeRetired: true,
    days: normalized.days,
    tzOffsetMinutes: normalized.offset,
    nowMs,
  });
  const allItems = records.map((record) => record.item);
  const statusCounts = countByStatus(allItems);
  const reviews = reviewSummary(db, projectEntry, nowMs, normalized.days);
  const qNeedle = normalized.q ? asciiLower(normalized.q) : null;
  let filtered = allItems;
  if (normalized.status !== 'all') {
    filtered = filtered.filter((item) => item.status === normalized.status);
  }
  if (qNeedle) filtered = filtered.filter((item) => asciiLower(item.name).includes(qNeedle));
  const sorted = sortSkillItems(filtered, normalized.sort);
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
      status: normalized.status,
      project: normalized.project,
      days: normalized.days,
      q: normalized.q,
      sort: normalized.sort,
      tz_offset_minutes: normalized.offset,
    },
    summary: {
      ...statusCounts,
      ...reviews,
    },
    items: page,
    next_cursor: nextCursor,
  };
}

function recentFeedback(db: DatabaseManager, skillId: string) {
  const rows = db.sqlAll(
    `SELECT outcome, created_at, task_text, notes
     FROM procedural_skill_feedback
     WHERE skill_id = ?
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT ?`,
    [skillId, RECENT_LIMIT],
  );
  return rows.map((row) => ({
    outcome: row.outcome ?? null,
    at: normalizeTimestamp(row.created_at),
    task: clipSanitize(row.task_text, 200),
    notes: clipSanitize(row.notes, 200),
  }));
}

/** Full skill or pending-candidate card. Unknown id returns null. */
export function getAdminSkillDetail(
  db: DatabaseManager,
  options: AdminSkillDetailOptions = {},
  runtime: ProjectQueryRuntime = {},
) {
  const id = options.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > ID_MAX) throw invalid('skill-detail', 'id');
  const nowMs = nowMsOf(runtime);
  const days = strictDays(options.days, 'skill-detail');
  const tzOffset = strictOffset(options.tzOffsetMinutes, 'skill-detail');
  const catalog = loadProjectCatalog(db);
  const skillRow = db.sqlGet(`SELECT project_path FROM procedural_skills WHERE id = ?`, [id]);
  let projectPath: string | undefined;
  if (skillRow && typeof skillRow.project_path === 'string') {
    projectPath = skillRow.project_path;
  } else {
    const parsed = /^c_(.+)_(\d+)$/.exec(id);
    if (parsed) {
      const digest = db.sqlGet(`SELECT project_path FROM daily_memory_digests WHERE id = ?`, [parsed[1]]);
      if (digest && typeof digest.project_path === 'string') projectPath = digest.project_path;
    }
  }
  if (!projectPath) return null;
  const records = loadSkillRecords(db, {
    catalog,
    projectPath,
    includeRetired: true,
    days,
    tzOffsetMinutes: tzOffset,
    nowMs,
  });
  const record = records.find((row) => row.item.id === id);
  if (!record) return null;
  const recent_matches = record.recentMatches;
  return {
    status: 'ok' as const,
    disabled: false,
    generated_at: new Date(nowMs).toISOString(),
    skill: {
      ...record.item,
      trigger: record.trigger,
      steps: record.steps,
      tags: record.tags,
    },
    recent_matches,
    recent_feedback: record.item.kind === 'skill' ? recentFeedback(db, record.item.id) : [],
  };
}

