import { createHash } from 'crypto';
import { Database, retrySqliteBusy } from './sqlite';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  compareTimestamps,
  isTimestampOnOrBefore,
  timestampsEqual,
} from './timestamps';
import { agentMatchSql, collapseListedAgents, normalizeAgentId, presentAgentIds } from './agent-id';
import { sanitizeText } from './redact';
import { knownSecrets, redactSecrets } from './secret-redaction';

// Stored errors can echo provider responses: redact the whole text first, then clip.
function clipRedacted(value: unknown, max: number): string | null {
  const text = sanitizeText(value);
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}
import { cjkOverlapScore, extractCjkBigrams } from './cjk';

// Type definitions
export interface Observation {
  id: string;
  session_id: string;
  project_path: string;
  agent_id: string;
  title: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
  embedding: number[];
  created_at?: string;
  record_kind?: 'outcome' | 'context';
  source_kind?: 'tool' | 'explicit' | 'task' | 'legacy_compacted';
}

export interface Session {
  id: string;
  project_path: string;
  agent_id: string;
  status: 'active' | 'completed';
  created_at?: string;
  purpose?: 'work' | 'daily_review';
}

export interface SearchResult {
  id: string;
  title: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  files_modified: string[];
  agent_id: string;
  fts_score: number;
  vector_score: number;
  hybrid_score: number;
  created_at: string;
}

export interface RuntimeMemoryPolicy {
  readEnabled: boolean;
  writeEnabled: boolean;
  updatedAt: string;
}

export interface DailyDigestSchedulerConfig {
  enabled: boolean;
  lookback_days: number;
  schedule_hour: number;
  schedule_minute: number;
  schedule_time: string;
  time_zone: string;
  updatedAt: string;
}

export interface DailyDigestSchedulerConfigInput {
  enabled?: boolean;
  lookback_days?: number;
  schedule_time?: string;
  time_zone?: string;
}

export interface ObservationListFilters {
  agent?: string;
  page?: number;
  pageSize?: number;
  project?: string;
  query?: string;
}

export interface ObservationListResult {
  records: Observation[];
  total: number;
}

export interface StateFact {
  id: string;
  project_path: string;
  entity_type: string;
  entity_key: string;
  fact_key: string;
  value: unknown;
  value_json: string;
  effective_at: string;
  recorded_at: string;
  superseded_at: string | null;
}

export interface StateFactInput {
  project_path: string;
  entity_type?: string;
  entity_key?: string;
  fact_key: string;
  value: unknown;
  effective_at?: string;
}

export interface StateFactQuery {
  projectPath: string;
  entityType?: string;
  entityKey?: string;
  factKey?: string;
  asOf?: string;
}

export type DailyMemoryDigestStatus =
  | 'success'
  | 'skipped_missing_llm'
  | 'skipped_no_observations'
  | 'failed';

export interface DailyMemoryDigestPayload {
  summary: string;
  facts: string[];
  decisions: string[];
  verified_commands: string[];
  open_questions: string[];
  next_actions: string[];
  state_fact_candidates: unknown[];
  skill_candidates: unknown[];
  low_signal_patterns: string[];
  confidence: number;
}

export interface DailyMemoryDigest {
  id: string;
  project_path: string;
  local_date: string;
  status: DailyMemoryDigestStatus;
  digest: DailyMemoryDigestPayload | null;
  digest_json: string | null;
  source_observation_ids: string[];
  source_count: number;
  model: string | null;
  prompt_version: string;
  generated_at: string;
  reviewed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyMemoryDigestInput {
  project_path: string;
  local_date: string;
  status: DailyMemoryDigestStatus;
  digest: DailyMemoryDigestPayload | null;
  source_observation_ids: string[];
  source_count?: number;
  model?: string | null;
  prompt_version: string;
  generated_at?: string;
  reviewed_at?: string | null;
  last_error?: string | null;
}

export interface DailyMemoryDigestQuery {
  projectPath?: string;
  localDate?: string;
  status?: DailyMemoryDigestStatus;
  limit?: number;
  generatedBefore?: string;
}

export type ProceduralSkillStatus = 'draft' | 'enabled' | 'disabled' | 'retired';

export interface ProceduralSkill {
  id: string;
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags: string[];
  status: ProceduralSkillStatus;
  confidence: number;
  source_digest_id: string | null;
  source_observation_ids: string[];
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  embedding: number[];
  created_at: string;
  updated_at: string;
  retired_at: string | null;
  status_effective_at?: string | null;
  feedback_summary?: {
    failure: number;
    last_feedback_at: string | null;
    last_outcome: string | null;
    rejected: number;
    skipped: number;
    success: number;
    total: number;
  };
  feedback_history?: ProceduralSkillFeedback[];
  lifecycle_signal?: {
    reasons: string[];
    score: number;
    state: 'stable' | 'watch' | 'suppressed' | 'retire_candidate';
  } | null;
  recommendation_state?: string | null;
  recommendation_score?: number | null;
  recommendation_reasons?: string[];
}

export interface ProceduralSkillInput {
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags?: string[];
  status?: ProceduralSkillStatus;
  confidence?: number;
  source_digest_id?: string | null;
  source_observation_ids?: string[];
  embedding?: number[];
}

export interface ProceduralSkillQuery {
  projectPath: string;
  statuses?: ProceduralSkillStatus[];
  limit?: number;
  asOf?: string;
}

export type ProceduralSkillFeedbackOutcome = 'success' | 'failure' | 'rejected' | 'skipped';

export interface ProceduralSkillFeedback {
  id: string;
  skill_id: string;
  project_path: string;
  outcome: ProceduralSkillFeedbackOutcome;
  task_text: string;
  notes: string;
  created_at: string;
}

export interface ProceduralSkillFeedbackInput {
  skill_id: string;
  project_path: string;
  outcome: ProceduralSkillFeedbackOutcome;
  task_text?: string;
  notes?: string;
}

export interface ProceduralSkillFeedbackQuery {
  asOf?: string;
  limit?: number;
  projectPath?: string;
  skillId: string;
}

export interface PostTaskReview {
  id: string;
  project_path: string;
  source_observation_id: string;
  source_session_id: string;
  source_agent_id: string;
  source_title: string;
  query_text: string;
  status: 'open';
  matched_skill_titles: string[];
  recommendation_states: string[];
  bounded_context: unknown;
  decision_trace: unknown;
  temporal_diagnostics: unknown;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface PostTaskReviewInput {
  project_path: string;
  source_observation_id: string;
  source_session_id: string;
  source_agent_id: string;
  source_title: string;
  query_text: string;
  matched_skill_titles: string[];
  recommendation_states: string[];
  bounded_context: unknown;
  decision_trace: unknown;
  temporal_diagnostics: unknown;
  generated_at?: string;
}

export interface PostTaskReviewQuery {
  limit?: number;
  projectPath: string;
  sourceObservationId?: string;
  status?: 'open';
}

export interface ProceduralSkillSearchResult {
  id: string;
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags: string[];
  status: ProceduralSkillStatus;
  confidence: number;
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  created_at: string;
  source_observation_count?: number;
  lexical_score: number;
  vector_score: number;
  hybrid_score: number;
  status_effective_at?: string | null;
  feedback_summary?: ProceduralSkill['feedback_summary'];
  feedback_history?: ProceduralSkillFeedback[];
  lifecycle_signal?: ProceduralSkill['lifecycle_signal'];
  recommendation_state?: string | null;
  recommendation_score?: number | null;
  recommendation_reasons?: string[];
}

interface ProceduralSkillStatusEvent {
  effective_at: string;
  status: ProceduralSkillStatus;
}

const DAILY_DIGEST_SCHEDULER_CONFIG_KEY = 'daily_digest_scheduler_config';
const RUNTIME_MEMORY_POLICY_KEY = 'runtime_memory_policy';

function getDefaultDailyDigestSchedulerConfig(): Omit<DailyDigestSchedulerConfig, 'updatedAt'> {
  return {
    enabled: process.env.AGENTMEM_DAILY_DIGEST_DISABLED !== 'true',
    lookback_days: 2,
    schedule_hour: 23,
    schedule_minute: 50,
    schedule_time: '23:50',
    time_zone: 'Asia/Shanghai',
  };
}

function normalizeDailyDigestSchedulerConfig(
  input: DailyDigestSchedulerConfigInput
): Omit<DailyDigestSchedulerConfig, 'updatedAt'> {
  const schedule = parseScheduleTime(input.schedule_time || '23:50');
  const timeZone = normalizeTimeZone(input.time_zone || 'Asia/Shanghai');
  const lookback = Number(input.lookback_days);

  return {
    enabled: input.enabled !== false,
    lookback_days: Number.isFinite(lookback)
      ? Math.max(1, Math.min(14, Math.trunc(lookback)))
      : 2,
    schedule_hour: schedule.hour,
    schedule_minute: schedule.minute,
    schedule_time: schedule.value,
    time_zone: timeZone,
  };
}

function parseScheduleTime(value: string): { hour: number; minute: number; value: string } {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error('Daily digest schedule_time must use HH:mm format.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Daily digest schedule_time must be between 00:00 and 23:59.');
  }

  return {
    hour,
    minute,
    value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function normalizeTimeZone(value: string): string {
  const timeZone = String(value || '').trim() || 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch (_error) {
    throw new Error(`Invalid daily digest time_zone: ${timeZone}`);
  }
  return timeZone;
}

const reviewList = (v: any): any[] => Array.isArray(v) ? v : (typeof v === 'string' && v ? JSON.parse(v) : []);
/** Canonical review shape of one memory; overview items and detail reads share this version identity. */
export function reviewItem(row: any): any {
  return { id: row.id, project_path: row.project_path, session_id: row.session_id, agent_id: row.agent_id,
    created_at: row.created_at, kind: row.record_kind || 'legacy', source: row.source_kind || 'legacy',
    title: row.title, narrative: row.narrative, facts: reviewList(row.facts), concepts: reviewList(row.concepts),
    files_modified: reviewList(row.files_modified), files_read: reviewList(row.files_read),
    // A deduplicated summary shared by several tasks changes version when new linked evidence arrives,
    // so later reviews rediscover it (single-task items keep their existing hash).
    ...(Number(row.evidence_tasks) > 1 ? { evidence_tasks: Number(row.evidence_tasks), evidence_items: Number(row.evidence_items) } : {}) };
}
const EVIDENCE_LINK_COLUMNS = `(SELECT COUNT(DISTINCT r.task_id) FROM task_results r WHERE r.observation_id=o.id) AS evidence_tasks,
  ((SELECT COUNT(*) FROM tool_evidence e WHERE e.task_id IN (SELECT r.task_id FROM task_results r WHERE r.observation_id=o.id))
   + (SELECT COUNT(*) FROM task_event_buffer b WHERE b.task_result_id IN (SELECT r.id FROM task_results r WHERE r.observation_id=o.id))) AS evidence_items`;
export function reviewItemHash(row: any): string {
  return createHash('sha256').update(JSON.stringify(reviewItem(row)), 'utf8').digest('hex');
}

/** Bump whenever ensureTaskTables() adds a table, index or column (round 9: dedup is transactional, claims unused). */
const TASK_SCHEMA_REVISION = 12;

type ActivityEra = 'v2.1' | 'legacy' | 'mixed' | null;

const ACTIVITY_MAX_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;
const ACTIVITY_CURSOR_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

interface NormalizedAdminActivity {
  fromIso: string;
  toIso: string;
  fromSql: string;
  toSql: string;
  fromMs: number;
  toMs: number;
  offset: number;
  shift: string;
  project?: string;
  agent?: string;
  kind: 'typed' | 'legacy' | 'all';
  limit: number;
  cursor: { t: string; r: number } | null;
}

interface ActivityQuery {
  name: string;
  sql: string;
  params: any[];
}

function invalidActivity(detail: string): Error {
  return new Error(`Invalid activity request: ${detail}`);
}

function activitySqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function activityInstant(value: string, label: 'from' | 'to'): Date {
  if (typeof value !== 'string' || value.trim() === '') throw invalidActivity(`${label} is required`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalidActivity(label);
  return new Date(ms);
}

function activityOffset(value: number | undefined, invalid: (detail: string) => Error = invalidActivity): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -840 || value > 840) {
    throw invalid('tz_offset_minutes');
  }
  return value;
}

function activityLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw invalidActivity('limit');
  }
  return value;
}

function activityKind(value: string | undefined): 'typed' | 'legacy' | 'all' {
  if (value === undefined || value === '') return 'typed';
  if (value === 'typed' || value === 'legacy' || value === 'all') return value;
  throw invalidActivity('kind');
}

function activityExact(value: string | undefined, label: string, invalid: (detail: string) => Error = invalidActivity): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalid(label);
  return value;
}

function decodeActivityCursor(cursor: string, invalid: (detail: string) => Error = invalidActivity): { t: string; r: number } {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid('cursor');
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid('cursor');
  }
  const t = parsed?.t;
  const r = parsed?.r;
  if (typeof t !== 'string' || !ACTIVITY_CURSOR_TIME.test(t) || !Number.isSafeInteger(r)) throw invalid('cursor');
  const ms = Date.parse(`${t.replace(' ', 'T')}Z`);
  if (!Number.isFinite(ms) || activitySqlTime(new Date(ms)) !== t) throw invalid('cursor');
  return { t, r };
}

function normalizeAdminActivity(options: {
  from: string; to: string; tzOffsetMinutes?: number; project?: string; agent?: string;
  kind?: 'typed' | 'legacy' | 'all'; limit?: number; cursor?: string | null;
}): NormalizedAdminActivity {
  const from = activityInstant(options.from, 'from');
  const to = activityInstant(options.to, 'to');
  if (!(to.getTime() > from.getTime())) throw invalidActivity('to must be after from');
  if (to.getTime() - from.getTime() > ACTIVITY_MAX_WINDOW_MS) throw invalidActivity('window exceeds 120 days');
  const offset = activityOffset(options.tzOffsetMinutes);
  let cursor: { t: string; r: number } | null = null;
  if (options.cursor !== undefined && options.cursor !== null && options.cursor !== '') {
    if (typeof options.cursor !== 'string') throw invalidActivity('cursor');
    cursor = decodeActivityCursor(options.cursor);
  }
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromSql: activitySqlTime(from),
    toSql: activitySqlTime(to),
    fromMs: from.getTime(),
    toMs: to.getTime(),
    offset,
    shift: `${offset >= 0 ? '+' : ''}${offset} minutes`,
    project: activityExact(options.project, 'project'),
    agent: activityExact(options.agent, 'agent'),
    kind: activityKind(options.kind as string | undefined),
    limit: activityLimit(options.limit),
    cursor,
  };
}

function activityDayList(fromMs: number, toMs: number, offsetMinutes: number): string[] {
  const localDay = (ms: number) => new Date(ms + offsetMinutes * 60000).toISOString().slice(0, 10);
  const startMs = Date.parse(`${localDay(fromMs)}T00:00:00.000Z`);
  const endMs = Date.parse(`${localDay(toMs - 1)}T00:00:00.000Z`);
  const days: string[] = [];
  for (let ms = startMs; ms <= endMs && days.length <= 121; ms += 86400000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

function activityCard(row: any) {
  return {
    id: row.id,
    created_at: row.created_at,
    day: row.day,
    kind: row.kind,
    source: row.source ?? null,
    fallback: Number(row.fallback) === 1,
    title: row.title,
    project_path: row.project_path,
    agent_id: row.agent_id,
    files_count: Number(row.files_count) || 0,
    files_modified_count: Number(row.files_modified_count) || 0,
    facts_count: Number(row.facts_count) || 0,
    task_count: Number(row.task_count) || 0,
    has_review: Number(row.has_review) === 1,
  };
}

const ACTIVITY_JOINS = `FROM observations o
    LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
    LEFT JOIN task_results r ON r.id=o.id`;
const ACTIVITY_OUTCOME = `SUM(CASE WHEN m.record_kind='outcome' THEN 1 ELSE 0 END)`;
const ACTIVITY_CONTEXT = `SUM(CASE WHEN m.record_kind='context' THEN 1 ELSE 0 END)`;
const ACTIVITY_FALLBACK = `SUM(CASE WHEN m.record_kind IN ('outcome','context') AND r.status='fallback' THEN 1 ELSE 0 END)`;
const ACTIVITY_LEGACY = `SUM(CASE WHEN m.record_kind IS NULL OR m.record_kind NOT IN ('outcome','context') THEN 1 ELSE 0 END)`;
const ACTIVITY_NATIVE = `SUM(CASE WHEN m.record_kind IN ('outcome','context') AND IFNULL(m.source_kind,'')!='legacy_compacted' THEN 1 ELSE 0 END)`;
// WHEN matches only TRUE, so a missing metadata row (NULL kind) falls through and counts as old.
const ACTIVITY_OLD = `SUM(CASE WHEN m.record_kind IN ('outcome','context') AND IFNULL(m.source_kind,'')!='legacy_compacted' THEN 0 ELSE 1 END)`;
const ACTIVITY_FILES_READ = `CASE WHEN json_valid(o.files_read) AND json_type(o.files_read)='array' THEN o.files_read ELSE '[]' END`;
const ACTIVITY_FILES_MOD = `CASE WHEN json_valid(o.files_modified) AND json_type(o.files_modified)='array' THEN o.files_modified ELSE '[]' END`;
// Shared card columns. The day's `?` is the tz shift and stays the first bound parameter.
const ADMIN_CARD_COLUMNS = `o.id, o.created_at, o.rowid AS cursor_rowid, datetime(o.created_at) AS cursor_time,
        date(datetime(o.created_at), ?) AS day,
        CASE WHEN m.record_kind IN ('outcome','context') THEN m.record_kind ELSE 'legacy' END AS kind,
        m.source_kind AS source,
        CASE WHEN m.record_kind IN ('outcome','context') AND r.status='fallback' THEN 1 ELSE 0 END AS fallback,
        substr(o.title, 1, 200) AS title,
        o.project_path, o.agent_id,
        (SELECT COUNT(DISTINCT value) FROM (
          SELECT value FROM json_each(${ACTIVITY_FILES_READ})
          UNION ALL
          SELECT value FROM json_each(${ACTIVITY_FILES_MOD})
        )) AS files_count,
        CASE WHEN json_valid(o.files_modified) AND json_type(o.files_modified)='array' THEN json_array_length(o.files_modified) ELSE 0 END AS files_modified_count,
        CASE WHEN json_valid(o.facts) AND json_type(o.facts)='array' THEN json_array_length(o.facts) ELSE 0 END AS facts_count,
        (SELECT COUNT(*) FROM task_results t WHERE t.observation_id=o.id) AS task_count,
        EXISTS(SELECT 1 FROM post_task_reviews p WHERE p.source_observation_id=o.id) AS has_review`;

function activityScope(project?: string, agent?: string): { sql: string; params: any[] } {
  const params: any[] = [];
  let sql = '';
  if (project !== undefined) {
    sql += ' AND LOWER(o.project_path)=LOWER(?)';
    params.push(project);
  }
  if (agent !== undefined) {
    const match = agentMatchSql('o.agent_id', agent);
    sql += ` AND ${match.sql}`;
    params.push(...match.params);
  }
  return { sql, params };
}

function activityKindSql(kind: 'typed' | 'legacy' | 'all'): string {
  if (kind === 'typed') return ` AND m.record_kind IN ('outcome','context')`;
  if (kind === 'legacy') return ` AND (m.record_kind IS NULL OR m.record_kind NOT IN ('outcome','context'))`;
  return '';
}

function buildAdminActivityQueries(input: NormalizedAdminActivity): ActivityQuery[] {
  const windowSql = 'datetime(o.created_at) >= ? AND datetime(o.created_at) < ?';
  const scope = activityScope(input.project, input.agent);
  const queries: ActivityQuery[] = [
    {
      name: 'breakdown',
      sql: `SELECT o.project_path, o.agent_id,
          ${ACTIVITY_OUTCOME} AS outcome,
          ${ACTIVITY_CONTEXT} AS context,
          ${ACTIVITY_FALLBACK} AS fallback,
          ${ACTIVITY_LEGACY} AS legacy
        ${ACTIVITY_JOINS}
        WHERE ${windowSql}
        GROUP BY o.project_path, o.agent_id
        ORDER BY (outcome + context + legacy) DESC, o.project_path, o.agent_id
        LIMIT 200`,
      params: [input.fromSql, input.toSql],
    },
    {
      name: 'days',
      sql: `SELECT date(datetime(o.created_at), ?) AS day,
          ${ACTIVITY_OUTCOME} AS outcome,
          ${ACTIVITY_CONTEXT} AS context,
          ${ACTIVITY_FALLBACK} AS fallback,
          ${ACTIVITY_LEGACY} AS legacy,
          ${ACTIVITY_NATIVE} AS native,
          ${ACTIVITY_OLD} AS old
        ${ACTIVITY_JOINS}
        WHERE ${windowSql}${scope.sql}
        GROUP BY day`,
      params: [input.shift, input.fromSql, input.toSql, ...scope.params],
    },
  ];
  if (input.limit <= 0) return queries;

  // A cursor inside the window becomes the index range's upper bound, so a later page starts its index scan at the
  // cursor instead of walking (and discarding) every newer row of the window first.
  const params: any[] = [input.shift, input.fromSql];
  let cardsWindowSql = windowSql;
  let cursorSql = '';
  if (input.cursor && input.cursor.t < input.toSql) {
    cardsWindowSql = 'datetime(o.created_at) >= ? AND datetime(o.created_at) <= ?';
    cursorSql = ' AND (datetime(o.created_at) < ? OR o.rowid < ?)';
    params.push(input.cursor.t, input.cursor.t, input.cursor.r);
  } else if (input.cursor) {
    cursorSql = ' AND (datetime(o.created_at) < ? OR (datetime(o.created_at) = ? AND o.rowid < ?))';
    params.push(input.toSql, input.cursor.t, input.cursor.t, input.cursor.r);
  } else {
    params.push(input.toSql);
  }
  params.push(...scope.params, input.limit + 1);
  // DISTINCT over UNION ALL matches the distinct union of the two file arrays. Plain UNION
  // plans as a sorter and reports USE TEMP B-TREE FOR ORDER BY on the cards query.
  queries.push({
    name: 'cards',
    sql: `SELECT ${ADMIN_CARD_COLUMNS}
      ${ACTIVITY_JOINS}
      WHERE ${cardsWindowSql}${cursorSql}${scope.sql}${activityKindSql(input.kind)}
      ORDER BY datetime(o.created_at) DESC, o.rowid DESC
      LIMIT ?`,
    params,
  });
  return queries;
}

type MemoryKind = 'outcome' | 'context' | 'legacy';
type MemorySource = 'task' | 'tool' | 'explicit' | 'legacy_compacted';
type MemoriesCardMode = 'skip' | 'index' | 'scan';

const MEMORIES_KINDS: MemoryKind[] = ['outcome', 'context', 'legacy'];
const MEMORIES_SOURCES: MemorySource[] = ['task', 'tool', 'explicit', 'legacy_compacted'];
const MEMORIES_STATS_CACHE_MAX = 32;
const MEMORIES_STATS_CACHE_TTL_MS = 60000;
// Title, narrative, project and agent match the raw text. facts, concepts, files_read and
// files_modified are JSON, so those four are matched again against the JSON-escaped query.
const MEMORIES_LIKE_SQL = `(
        o.title LIKE ? ESCAPE '\\'
        OR o.narrative LIKE ? ESCAPE '\\'
        OR o.facts LIKE ? ESCAPE '\\'
        OR o.concepts LIKE ? ESCAPE '\\'
        OR o.files_read LIKE ? ESCAPE '\\'
        OR o.files_modified LIKE ? ESCAPE '\\'
        OR o.project_path LIKE ? ESCAPE '\\'
        OR o.agent_id LIKE ? ESCAPE '\\'
        OR o.facts LIKE ? ESCAPE '\\'
        OR o.concepts LIKE ? ESCAPE '\\'
        OR o.files_read LIKE ? ESCAPE '\\'
        OR o.files_modified LIKE ? ESCAPE '\\'
      )`;
const MEMORIES_JOINS_SCAN = `FROM observations o NOT INDEXED
    LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
    LEFT JOIN task_results r ON r.id=o.id`;

interface AdminMemoriesOptions {
  query?: string;
  project?: string;
  agent?: string;
  kind?: string;
  source?: string;
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
  limit?: number;
  cursor?: string | null;
  stats?: boolean;
}

interface NormalizedAdminMemories {
  query: string | null;
  project?: string;
  agent?: string;
  kind: MemoryKind[];
  source: MemorySource[] | null;
  fromIso: string | null;
  toIso: string | null;
  fromSql: string | null;
  toSql: string | null;
  offset: number;
  shift: string;
  limit: number;
  cursor: { t: string; r: number; f: string } | null;
  stats: boolean;
  filterHash: string;
}

interface AdminMemoriesStats {
  total: number;
  kinds: { outcome: number; context: number; legacy: number; fallback: number };
  top_projects: Array<{ project_path: string; count: number }>;
  cached: boolean;
}

interface MemoriesStatsCacheEntry {
  at: number;
  value: AdminMemoriesStats;
}

interface MemoriesQueryChoice {
  stats: boolean;
  cards: MemoriesCardMode;
  dayRange: { start: string; end: string } | null;
}

function invalidMemories(detail: string): Error {
  return new Error(`Invalid memories request: ${detail}`);
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function memoriesQueryText(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw invalidMemories('query');
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (codePointLength(trimmed) > 200) throw invalidMemories('query');
  return trimmed;
}

function memoriesKindList(value: string | undefined): MemoryKind[] {
  if (value === undefined) return ['outcome', 'context'];
  if (typeof value !== 'string') throw invalidMemories('kind');
  const trimmed = value.trim();
  if (trimmed === '') return ['outcome', 'context'];
  if (trimmed === 'all') return ['outcome', 'context', 'legacy'];
  const selected = new Set<MemoryKind>();
  for (const token of trimmed.split(',')) {
    const kind = token.trim();
    if (kind !== 'outcome' && kind !== 'context' && kind !== 'legacy') throw invalidMemories('kind');
    selected.add(kind);
  }
  return MEMORIES_KINDS.filter((kind) => selected.has(kind));
}

function memoriesSourceList(value: string | undefined): MemorySource[] | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw invalidMemories('source');
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const selected = new Set<MemorySource>();
  for (const token of trimmed.split(',')) {
    const source = token.trim();
    if (source !== 'task' && source !== 'tool' && source !== 'explicit' && source !== 'legacy_compacted') {
      throw invalidMemories('source');
    }
    selected.add(source);
  }
  return MEMORIES_SOURCES.filter((source) => selected.has(source));
}

function memoriesInstant(value: string | undefined, label: 'from' | 'to'): { iso: string; sql: string } | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') throw invalidMemories(label);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalidMemories(label);
  const date = new Date(ms);
  return { iso: date.toISOString(), sql: activitySqlTime(date) };
}

function memoriesLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) throw invalidMemories('limit');
  return value;
}

function memoriesStatsFlag(value: boolean | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw invalidMemories('stats');
  return value;
}

function memoriesFilterHash(filters: {
  query: string | null; project: string | null; agent: string | null;
  kind: MemoryKind[]; source: MemorySource[] | null; from: string | null; to: string | null;
}): string {
  return createHash('sha1').update(JSON.stringify({
    query: filters.query,
    project: filters.project,
    agent: filters.agent,
    kind: [...filters.kind].sort(),
    source: filters.source ? [...filters.source].sort() : null,
    from: filters.from,
    to: filters.to,
  })).digest('hex').slice(0, 12);
}

function decodeMemoriesCursor(cursor: string): { t: string; r: number; f: string } {
  const { t, r } = decodeActivityCursor(cursor, invalidMemories);
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidMemories('cursor');
  }
  const f = parsed?.f;
  if (typeof f !== 'string' || !/^[0-9a-f]{12}$/.test(f)) throw invalidMemories('cursor');
  return { t, r, f };
}

function normalizeAdminMemories(options: AdminMemoriesOptions): NormalizedAdminMemories {
  const from = memoriesInstant(options.from, 'from');
  const to = memoriesInstant(options.to, 'to');
  if (from && to && !(Date.parse(to.iso) > Date.parse(from.iso))) throw invalidMemories('to must be after from');
  const offset = activityOffset(options.tzOffsetMinutes, invalidMemories);
  const query = memoriesQueryText(options.query);
  const project = activityExact(options.project, 'project', invalidMemories);
  const agent = activityExact(options.agent, 'agent', invalidMemories);
  const kind = memoriesKindList(options.kind);
  const source = memoriesSourceList(options.source);
  const filterHash = memoriesFilterHash({
    query,
    project: project ?? null,
    agent: agent ?? null,
    kind,
    source,
    from: from ? from.iso : null,
    to: to ? to.iso : null,
  });
  let cursor: { t: string; r: number; f: string } | null = null;
  if (options.cursor !== undefined && options.cursor !== null && options.cursor !== '') {
    if (typeof options.cursor !== 'string') throw invalidMemories('cursor');
    cursor = decodeMemoriesCursor(options.cursor);
    if (cursor.f !== filterHash) throw invalidMemories('cursor does not match filters');
  }
  return {
    query,
    project,
    agent,
    kind,
    source,
    fromIso: from ? from.iso : null,
    toIso: to ? to.iso : null,
    fromSql: from ? from.sql : null,
    toSql: to ? to.sql : null,
    offset,
    shift: `${offset >= 0 ? '+' : ''}${offset} minutes`,
    limit: memoriesLimit(options.limit),
    cursor,
    stats: memoriesStatsFlag(options.stats),
    filterHash,
  };
}

function memoriesKindParts(kinds: MemoryKind[]): string[] {
  const parts: string[] = [];
  const typed = kinds.filter((kind) => kind === 'outcome' || kind === 'context');
  if (typed.length) parts.push(`m.record_kind IN (${typed.map((kind) => `'${kind}'`).join(',')})`);
  if (kinds.includes('legacy')) parts.push(`(m.record_kind IS NULL OR m.record_kind NOT IN ('outcome','context'))`);
  return parts;
}

function memoriesKindSql(kinds: MemoryKind[]): string {
  if (kinds.length >= 3) return '';
  const parts = memoriesKindParts(kinds);
  if (parts.length === 1) return ` AND ${parts[0]}`;
  return ` AND (${parts.join(' OR ')})`;
}

function memoriesKindCase(kinds: MemoryKind[]): string {
  if (kinds.length >= 3) return '1';
  const parts = memoriesKindParts(kinds);
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' OR ')})`;
}

function memoriesSourceSql(sources: MemorySource[] | null): string {
  if (!sources || !sources.length) return '';
  return ` AND m.source_kind IN (${sources.map((source) => `'${source}'`).join(',')})`;
}

function memoriesPlainRange(fromSql: string | null, toSql: string | null): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  if (fromSql !== null) {
    parts.push('datetime(o.created_at) >= ?');
    params.push(fromSql);
  }
  if (toSql !== null) {
    parts.push('datetime(o.created_at) < ?');
    params.push(toSql);
  }
  return { sql: parts.join(' AND '), params };
}

function memoriesCursorRange(input: NormalizedAdminMemories): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  const cursor = input.cursor;
  if (cursor && (input.toSql === null || cursor.t < input.toSql)) {
    if (input.fromSql !== null) {
      parts.push('datetime(o.created_at) >= ?');
      params.push(input.fromSql);
    }
    parts.push('datetime(o.created_at) <= ?');
    params.push(cursor.t);
    parts.push('(datetime(o.created_at) < ? OR o.rowid < ?)');
    params.push(cursor.t, cursor.r);
  } else if (cursor && input.toSql !== null) {
    if (input.fromSql !== null) {
      parts.push('datetime(o.created_at) >= ?');
      params.push(input.fromSql);
    }
    parts.push('datetime(o.created_at) < ?');
    params.push(input.toSql);
    parts.push('(datetime(o.created_at) < ? OR (datetime(o.created_at) = ? AND o.rowid < ?))');
    params.push(cursor.t, cursor.t, cursor.r);
  } else {
    if (input.fromSql !== null) {
      parts.push('datetime(o.created_at) >= ?');
      params.push(input.fromSql);
    }
    if (input.toSql !== null) {
      parts.push('datetime(o.created_at) < ?');
      params.push(input.toSql);
    }
  }
  return { sql: parts.join(' AND '), params };
}

function memoriesWhere(
  range: { sql: string; params: any[] },
  scope: { sql: string; params: any[] },
  kindSql: string,
  sourceSql: string,
  query: string | null,
): { sql: string; params: any[] } {
  const params = [...range.params, ...scope.params];
  let querySql = '';
  if (query) {
    querySql = ` AND ${MEMORIES_LIKE_SQL}`;
    const pattern = `%${escapeLikePattern(query)}%`;
    // JSON.stringify wraps the query in quotes; the stored text has the escaped interior only.
    const jsonPattern = `%${escapeLikePattern(JSON.stringify(query).slice(1, -1))}%`;
    for (let i = 0; i < 8; i += 1) params.push(pattern);
    for (let i = 0; i < 4; i += 1) params.push(jsonPattern);
  }
  return { sql: `${range.sql.length ? range.sql : '1=1'}${scope.sql}${kindSql}${sourceSql}${querySql}`, params };
}

function memoriesStatsQuery(input: NormalizedAdminMemories): ActivityQuery {
  const where = memoriesWhere(
    memoriesPlainRange(input.fromSql, input.toSql),
    activityScope(input.project, input.agent),
    '',
    memoriesSourceSql(input.source),
    input.query,
  );
  return {
    name: 'stats',
    sql: `SELECT
        COALESCE(SUM(CASE WHEN ${memoriesKindCase(input.kind)} THEN 1 ELSE 0 END), 0) AS total,
        COALESCE(${ACTIVITY_OUTCOME}, 0) AS outcome,
        COALESCE(${ACTIVITY_CONTEXT}, 0) AS context,
        COALESCE(${ACTIVITY_LEGACY}, 0) AS legacy,
        COALESCE(${ACTIVITY_FALLBACK}, 0) AS fallback
      ${ACTIVITY_JOINS}
      WHERE ${where.sql}`,
    params: where.params,
  };
}

// Grouped with COLLATE NOCASE (the same ASCII folding as LOWER()) rather than LOWER(project_path): grouping by the
// indexed expression makes the planner walk idx_observations_project_dt and fetch every row out of order, which is
// several times slower than driving from observation_work_metadata or one sequential scan.
function memoriesTopProjectsQuery(input: NormalizedAdminMemories): ActivityQuery {
  const typedOnly = !input.kind.includes('legacy');
  const where = memoriesWhere(
    memoriesPlainRange(input.fromSql, input.toSql),
    activityScope(undefined, input.agent),
    memoriesKindSql(input.kind),
    memoriesSourceSql(input.source),
    input.query,
  );
  // Outcome/context-only or a source filter needs a metadata row, so an inner join lets the planner start from it.
  const join = typedOnly || input.source ? 'JOIN' : 'LEFT JOIN';
  return {
    name: 'top_projects',
    sql: `SELECT MIN(o.project_path) AS project_path, COUNT(*) AS count
      FROM observations o ${join} observation_work_metadata m ON m.observation_id=o.id
      WHERE ${where.sql}
      GROUP BY o.project_path COLLATE NOCASE
      ORDER BY count DESC, LOWER(MIN(o.project_path))
      LIMIT 5`,
    params: where.params,
  };
}

// With a search every row is read anyway, so total, kinds and top projects come from one grouped scan instead of
// two full LIKE scans. Filters exclude kind and project; each group says whether it is the selected project.
function memoriesGroupedStatsQuery(input: NormalizedAdminMemories): ActivityQuery {
  const where = memoriesWhere(
    memoriesPlainRange(input.fromSql, input.toSql),
    activityScope(undefined, input.agent),
    '',
    memoriesSourceSql(input.source),
    input.query,
  );
  return {
    name: 'grouped_stats',
    sql: `SELECT MIN(o.project_path) AS project_path,
        LOWER(MIN(o.project_path)) = LOWER(?) AS selected,
        COALESCE(${ACTIVITY_OUTCOME}, 0) AS outcome,
        COALESCE(${ACTIVITY_CONTEXT}, 0) AS context,
        COALESCE(${ACTIVITY_LEGACY}, 0) AS legacy,
        COALESCE(${ACTIVITY_FALLBACK}, 0) AS fallback
      ${ACTIVITY_JOINS}
      WHERE ${where.sql}
      GROUP BY o.project_path COLLATE NOCASE`,
    params: [input.project ?? '', ...where.params],
  };
}

function memoriesCardsQuery(input: NormalizedAdminMemories, notIndexed: boolean): ActivityQuery {
  const where = memoriesWhere(
    memoriesCursorRange(input),
    activityScope(input.project, input.agent),
    memoriesKindSql(input.kind),
    memoriesSourceSql(input.source),
    input.query,
  );
  return {
    name: 'cards',
    sql: `SELECT ${ADMIN_CARD_COLUMNS},
        substr(o.narrative,1,140) AS preview_raw, length(o.narrative) > 140 AS preview_truncated
      ${notIndexed ? MEMORIES_JOINS_SCAN : ACTIVITY_JOINS}
      WHERE ${where.sql}
      ORDER BY datetime(o.created_at) DESC, o.rowid DESC
      LIMIT ?`,
    params: [input.shift, ...where.params, input.limit + 1],
  };
}

function memoriesDaysQuery(input: NormalizedAdminMemories, range: { start: string; end: string }): ActivityQuery {
  const where = memoriesWhere(
    { sql: 'datetime(o.created_at) >= ? AND datetime(o.created_at) < ?', params: [range.start, range.end] },
    activityScope(input.project, input.agent),
    memoriesKindSql(input.kind),
    memoriesSourceSql(input.source),
    input.query,
  );
  return {
    name: 'days',
    sql: `SELECT date(datetime(o.created_at), ?) AS day, COUNT(*) AS count
      ${ACTIVITY_JOINS}
      WHERE ${where.sql}
      GROUP BY day
      ORDER BY day DESC`,
    params: [input.shift, ...where.params],
  };
}

function buildAdminMemoriesQueries(input: NormalizedAdminMemories, choice: MemoriesQueryChoice): ActivityQuery[] {
  const queries: ActivityQuery[] = [];
  if (choice.stats && input.query) {
    queries.push(memoriesGroupedStatsQuery(input));
  } else if (choice.stats) {
    queries.push(memoriesStatsQuery(input));
    queries.push(memoriesTopProjectsQuery(input));
  }
  if (choice.cards !== 'skip') queries.push(memoriesCardsQuery(input, choice.cards === 'scan'));
  if (choice.dayRange) queries.push(memoriesDaysQuery(input, choice.dayRange));
  return queries;
}

function memoriesQueryByName(queries: ActivityQuery[], name: string): ActivityQuery {
  const found = queries.find((query) => query.name === name);
  if (!found) throw new Error(`Missing memories query: ${name}`);
  return found;
}

function memoriesCardMode(input: NormalizedAdminMemories, total: number | null): MemoriesCardMode {
  if (input.cursor || total === null) return 'index';
  if (total === 0) return 'skip';
  if (input.query && total <= input.limit) return 'scan';
  return 'index';
}

function memoriesSqlClock(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function memoriesPageDayRange(items: Array<{ day: string }>, input: NormalizedAdminMemories): { start: string; end: string } | null {
  if (!items.length) return null;
  const newest = items[0].day;
  const oldest = items[items.length - 1].day;
  const shiftMs = input.offset * 60000;
  let start = memoriesSqlClock(Date.parse(`${oldest}T00:00:00.000Z`) - shiftMs);
  let end = memoriesSqlClock(Date.parse(`${newest}T00:00:00.000Z`) + 86400000 - shiftMs);
  if (input.fromSql !== null && start < input.fromSql) start = input.fromSql;
  if (input.toSql !== null && input.toSql < end) end = input.toSql;
  if (start >= end) return null;
  return { start, end };
}

function memoriesItem(row: any) {
  return {
    ...activityCard(row),
    preview: String(row.preview_raw ?? '').replace(/\s+/g, ' ').trim(),
    preview_truncated: Number(row.preview_truncated) === 1,
  };
}

function cloneMemoriesStats(stats: AdminMemoriesStats, cached: boolean): AdminMemoriesStats {
  return {
    total: stats.total,
    kinds: {
      outcome: stats.kinds.outcome,
      context: stats.kinds.context,
      legacy: stats.kinds.legacy,
      fallback: stats.kinds.fallback,
    },
    top_projects: stats.top_projects.map((row) => ({ project_path: row.project_path, count: row.count })),
    cached,
  };
}

/** Task rows for one memory. getAdminMemoryDetail and its EXPLAIN test share this text. */
export const ADMIN_MEMORY_DETAIL_TASKS_SQL =
  `SELECT id, task_id, segment_index, segment_count, event_count, evidence_count, status, trigger, llm_calls, source_kind, substr(COALESCE(last_error,''),1,4000) AS last_error, created_at FROM task_results WHERE observation_id=? ORDER BY rowid`;

const ADMIN_MEMORY_DETAIL_TRACE_BYTES = 64 * 1024;

export interface AdminMemoryDetail {
  memory: {
    id: string;
    session_id: string;
    project_path: string;
    agent_id: string;
    created_at: string;
    kind: 'outcome' | 'context' | 'legacy';
    source: string | null;
    fallback: boolean;
    title: string;
    narrative: string;
    facts: unknown[];
    concepts: unknown[];
    files_read: unknown[];
    files_modified: unknown[];
  };
  tasks: Array<{
    id: string;
    task_id: string;
    segment_index: number;
    segment_count: number;
    event_count: number;
    evidence_count: number;
    status: string;
    trigger: string;
    llm_calls: number;
    source_kind: string;
    last_error: string | null;
    created_at: string;
  }>;
  duplicate_flags: Array<{
    id: string;
    task_id: string;
    status: string;
    reason: string | null;
  }>;
  review: null | {
    id: string;
    status: string;
    query_text: string;
    matched_skill_titles: unknown[];
    recommendation_states: unknown[];
    generated_at: string;
    bounded_context?: unknown;
    decision_trace?: unknown;
    temporal_diagnostics?: unknown;
  };
  compacted_into: string | null;
  evidence_available: boolean;
}

function parseJsonArrayOrEmpty(text: unknown): unknown[] {
  if (typeof text !== 'string') return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Prefix of at most maxBytes UTF-8 bytes that never splits a code point. */
function utf8Prefix(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  // A continuation byte is 10xxxxxx. Walk back onto the leading byte and drop that code point.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString('utf8');
}

function boundedJsonText(text: unknown): unknown {
  const raw = typeof text === 'string' ? text : '';
  const totalBytes = Buffer.byteLength(raw, 'utf8');
  if (totalBytes <= ADMIN_MEMORY_DETAIL_TRACE_BYTES) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return {
    truncated: true,
    total_bytes: totalBytes,
    text: utf8Prefix(raw, ADMIN_MEMORY_DETAIL_TRACE_BYTES),
  };
}

export class DatabaseManager {
  private dbPath: string;
  private db: any = null;
  private memoriesStatsCache = new Map<string, MemoriesStatsCacheEntry>();

  constructor() {
    const customPath = process.env.AGENTMEM_DB_PATH;
    if (customPath) {
      this.dbPath = path.resolve(customPath);
    } else {
      const homeDir = os.homedir();
      const vaultDir = path.join(homeDir, '.agentmem');
      if (!fs.existsSync(vaultDir)) {
        fs.mkdirSync(vaultDir, { recursive: true });
      }
      this.dbPath = path.join(vaultDir, 'agentmemory.db');
    }
  }

  // Open connection and run migrations
  public async initialize(): Promise<void> {
    if (this.db) return;
    try {
      this.db = new Database(this.dbPath);
      const version = await retrySqliteBusy(() => this.db.get('PRAGMA user_version').user_version);
      if (version > 1) throw new Error(`Unsupported database schema version: ${version}`);
      await retrySqliteBusy(() => this.db.configure());
      if (version < 1) {
        await this.write(() => {
          // A different process may have migrated while we waited for the lock.
          const currentVersion = this.db.get('PRAGMA user_version').user_version;
          if (currentVersion > 1) throw new Error(`Unsupported database schema version: ${currentVersion}`);
          if (currentVersion < 1) {
            this.runMigrations();
            this.db.run('PRAGMA user_version = 1');
          }
        });
      }
      // Additive side tables preserve old observation bytes and schema-version
      // compatibility. No historical inference/reclassification is performed.
      const workTables = this.db.all(`SELECT name FROM sqlite_master WHERE type='table'
        AND name IN ('observation_work_metadata','session_purposes')`);
      if (workTables.length !== 2) await this.write(() => {
        this.db.run(`CREATE TABLE IF NOT EXISTS observation_work_metadata (
          observation_id TEXT PRIMARY KEY, record_kind TEXT NOT NULL,
          source_kind TEXT NOT NULL)`);
        this.db.run(`CREATE TABLE IF NOT EXISTS session_purposes (
          session_id TEXT PRIMARY KEY, purpose TEXT NOT NULL)`);
      });
      await this.ensureTaskTables();
    } catch (err: any) {
      this.close();
      throw new Error(`Database initialization failed: ${err.message}`);
    }
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 1. Sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Observations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        narrative TEXT NOT NULL,
        facts TEXT NOT NULL,          -- Stored as JSON string
        concepts TEXT NOT NULL,       -- Stored as JSON string
        files_read TEXT NOT NULL,     -- Stored as JSON string
        files_modified TEXT NOT NULL, -- Stored as JSON string
        embedding TEXT NOT NULL,      -- Stored as JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. FTS5 Virtual Table for full-text search
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
        observation_id UNINDEXED,
        title,
        narrative,
        facts,
        concepts,
        files_modified
      )
    `);

    // 4. App settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. State facts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS state_facts (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        superseded_at TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_state_facts_lookup
      ON state_facts (project_path, entity_type, entity_key, fact_key, effective_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_state_facts_current
      ON state_facts (project_path, superseded_at)
    `);

    // 6. Daily derived memory digests table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS daily_memory_digests (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL,
        digest_json TEXT,
        source_observation_ids TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        model TEXT,
        prompt_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        reviewed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_path, local_date)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_daily_memory_digests_project_date
      ON daily_memory_digests (project_path, local_date DESC)
    `);

    // 7. Procedural skills table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skills (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence REAL NOT NULL,
        source_digest_id TEXT,
        source_observation_ids TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        embedding TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        retired_at TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skills_project_status
      ON procedural_skills (project_path, status, updated_at DESC)
    `);

    // 8. Procedural skill feedback table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skill_feedback (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        outcome TEXT NOT NULL,
        task_text TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skill_feedback_skill
      ON procedural_skill_feedback (skill_id, created_at DESC)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skill_status_events (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        status TEXT NOT NULL,
        effective_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skill_status_events_skill_time
      ON procedural_skill_status_events (skill_id, effective_at DESC)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS post_task_reviews (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        source_observation_id TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        source_title TEXT NOT NULL,
        query_text TEXT NOT NULL,
        status TEXT NOT NULL,
        matched_skill_titles_json TEXT NOT NULL,
        recommendation_states_json TEXT NOT NULL,
        bounded_context_json TEXT NOT NULL,
        decision_trace_json TEXT NOT NULL,
        temporal_diagnostics_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_observation_id)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_post_task_reviews_project_generated
      ON post_task_reviews (project_path, generated_at DESC)
    `);
  }

  // Create or update a session
  public async saveSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalizedAgentId = normalizeAgentId(session.agent_id);
      this.db.run(
        `INSERT INTO sessions (id, project_path, agent_id, status)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status`,
        [session.id, session.project_path, normalizedAgentId, session.status]
      );
      if (session.purpose) {
        if (!['work', 'daily_review'].includes(session.purpose)) throw new Error('Invalid session purpose');
        this.db.run(`INSERT INTO session_purposes VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET purpose=excluded.purpose`,
          [session.id, session.purpose]);
      }
    });
  }

  // Save observation
  public async saveObservation(obs: Observation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.validateObservation(obs);

    return this.write(() => this.insertObservationRows(obs));
  }

  private validateObservation(obs: Observation): void {
    if (obs.record_kind && !['outcome', 'context'].includes(obs.record_kind)) throw new Error('Invalid work-memory kind');
    if (obs.source_kind && !['tool', 'explicit', 'task', 'legacy_compacted'].includes(obs.source_kind)) throw new Error('Invalid work-memory source');
  }

  /** Synchronous: callers run it inside a write transaction. */
  private insertObservationRows(source: Observation): void {
      // Every memory write passes here: a model or caller that echoed a credential does not store it.
      const known = knownSecrets();
      const clean = (value: unknown) => redactSecrets(String(value ?? ''), known);
      const obs: Observation = {
        ...source,
        title: clean(source.title),
        narrative: clean(source.narrative),
        facts: (source.facts || []).map(clean),
        concepts: (source.concepts || []).map(clean),
      };
      const factsStr = JSON.stringify(obs.facts);
      const conceptsStr = JSON.stringify(obs.concepts);
      const filesReadStr = JSON.stringify(obs.files_read);
      const filesModStr = JSON.stringify(obs.files_modified);
      const embeddingStr = JSON.stringify(obs.embedding);
      const normalizedAgentId = normalizeAgentId(obs.agent_id);

      // Insert into primary table
      if (obs.created_at) {
        this.db.run(
          `INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            obs.id,
            obs.session_id,
            obs.project_path,
            normalizedAgentId,
            obs.title,
            obs.narrative,
            factsStr,
            conceptsStr,
            filesReadStr,
            filesModStr,
            embeddingStr,
            obs.created_at,
          ]
        );
      } else {
        this.db.run(
          `INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            obs.id,
            obs.session_id,
            obs.project_path,
            normalizedAgentId,
            obs.title,
            obs.narrative,
            factsStr,
            conceptsStr,
            filesReadStr,
            filesModStr,
            embeddingStr,
          ]
        );
      }

      // Insert into FTS virtual table
      this.db.run(
        `INSERT INTO observations_fts (observation_id, title, narrative, facts, concepts, files_modified)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [obs.id, obs.title, obs.narrative, factsStr, conceptsStr, filesModStr]
      );
      if (obs.record_kind) this.db.run(`INSERT INTO observation_work_metadata VALUES (?, ?, ?)`,
        [obs.id, obs.record_kind, obs.source_kind || 'explicit']);
  }

  /**
   * Atomic content dedup (one BEGIN IMMEDIATE transaction across connections): if an observation that EXISTS already
   * carries this (project, content hash), link + flag `obs` as its duplicate; otherwise insert the observation and its
   * hash together. Commit or roll back together, so a duplicate can only ever point to a real observation.
   */
  public async saveObservationDeduped(obs: Observation, hashes: { v2: string; v1: string }, flag: { id: string; taskId: string }):
      Promise<{ duplicateOf: string | null }> {
    if (!this.db) throw new Error('Database not initialized');
    this.validateObservation(obs);
    return this.write(() => {
      // Exact (v2) match: link and flag as a duplicate.
      const owner = this.db.get(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id = h.observation_id
        WHERE h.project_path=? AND h.sha256=? AND h.hash_version=2 AND h.observation_id<>? ORDER BY h.rowid LIMIT 1`,
        [obs.project_path, hashes.v2, obs.id]);
      if (owner) {
        this.db.run(`INSERT OR IGNORE INTO duplicate_flags (id,task_id,observation_id,matched_sha256,status,created_ms,reason)
          VALUES (?,?,?,?,'needs_confirmation',?,'exact content match')`, [flag.id, flag.taskId, owner.observation_id, hashes.v2, Date.now()]);
        return { duplicateOf: owner.observation_id as string };
      }
      if (!this.db.get(`SELECT 1 AS x FROM observations WHERE id=?`, [obs.id])) this.insertObservationRows(obs);
      this.db.run(`INSERT OR IGNORE INTO observation_content_hashes (observation_id, project_path, sha256, hash_version) VALUES (?,?,?,2)`,
        [obs.id, obs.project_path, hashes.v2]);
      // A match only under the legacy case-insensitive v1 hash may be a different result: keep the new observation
      // and flag the pair for a human. Old rows are never rewritten.
      const legacy = this.db.get(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id = h.observation_id
        WHERE h.project_path=? AND h.sha256=? AND h.hash_version=1 AND h.observation_id<>? ORDER BY h.rowid LIMIT 1`,
        [obs.project_path, hashes.v1, obs.id]);
      if (legacy) this.db.run(`INSERT OR IGNORE INTO duplicate_flags (id,task_id,observation_id,matched_sha256,status,created_ms,reason)
        VALUES (?,?,?,?,'needs_confirmation',?,'legacy case-insensitive match')`, [`v1-${flag.id}`, flag.taskId, legacy.observation_id, hashes.v1, Date.now()]);
      return { duplicateOf: null };
    });
  }

  /** Crash recovery: record the hash of an observation that exists (no-op otherwise). */
  public async ensureContentHash(observationId: string, projectPath: string, sha256: string): Promise<void> {
    await this.write(() => this.db.run(`INSERT OR IGNORE INTO observation_content_hashes (observation_id, project_path, sha256, hash_version)
      SELECT id, ?, ?, 2 FROM observations WHERE id=?`, [projectPath, sha256, observationId]));
  }

  public async getSessionPurpose(id: string): Promise<string> {
    return this.db.get('SELECT purpose FROM session_purposes WHERE session_id=?', [id])?.purpose || 'work';
  }

  public async getWorkOverview(since: string, until: string, cursor?: string, reader?: string) {
    if (!this.db) throw new Error('Database not initialized');
    const start = new Date(since), end = new Date(until);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)
      throw new Error('Overview requires valid since < until timestamps');
    // SQLite legacy timestamps have second precision: replay the boundary
    // second, then let durable notes/outcome tasks handle idempotency.
    const from = start.toISOString().slice(0, 19).replace('T', ' ');
    const to = end.toISOString().slice(0, 19).replace('T', ' ');
    const observedHigh = this.db.get('SELECT COALESCE(MAX(rowid),0) AS n FROM observations').n;
    const sessionHigh = this.db.get('SELECT COALESCE(MAX(rowid),0) AS n FROM sessions').n;
    let position: any = { version: 3, since, until, high: observedHigh, sessionHigh,
      catalog: 0, after: 0, legacy: 0, legacyAfter: 0, digests: 0 };
    if (cursor) {
      let saved: any;
      try { saved = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new Error('Invalid overview cursor'); }
      // A version-2 cursor (samples-only legacy) continues with the complete legacy listing from its start.
      if (saved && saved.version === 2) saved = { ...saved, version: 3, legacyAfter: 0, digests: 0 };
      if (!saved || saved.version !== 3 || saved.since !== since || saved.until !== until
          || !['high','sessionHigh','catalog','after','legacy','legacyAfter','digests'].every(k => Number.isSafeInteger(saved[k]) && saved[k] >= 0)
          || saved.high > observedHigh || saved.sessionHigh > sessionHigh || saved.after > saved.high || saved.legacy > 5
          || saved.legacyAfter > saved.high)
        throw new Error('Overview cursor conflicts with interval');
      position = saved;
    }
    const { high } = position;
    const where = `o.rowid <= ? AND datetime(o.created_at) >= datetime(?) AND datetime(o.created_at) <= datetime(?)`;
    // A memory that gains a newly linked task (deduplicated summary) inside the window is in the window too,
    // so evidence linked after the checkpoint is rediscovered (its version hash changes with the link).
    const linkedWhere = `o.rowid <= ? AND ((datetime(o.created_at) >= datetime(?) AND datetime(o.created_at) <= datetime(?))
      OR EXISTS (SELECT 1 FROM task_results lr WHERE lr.observation_id=o.id AND datetime(lr.created_at) >= datetime(?) AND datetime(lr.created_at) <= datetime(?)))`;
    // Window activity includes session starts even if no observation was saved.
    // Existing dormant sessions are not claimed as activity in this interval.
    const catalog = this.db.all(`WITH activity AS (
      SELECT o.project_path,o.agent_id,o.session_id,1 AS observation,m.record_kind FROM observations o
      LEFT JOIN observation_work_metadata m ON m.observation_id=o.id WHERE ${where}
      UNION ALL
      SELECT s.project_path,s.agent_id,s.id,0,NULL FROM sessions s WHERE s.rowid <= ?
        AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)
      ) SELECT project_path,agent_id,COUNT(DISTINCT session_id) AS sessions,
        SUM(observation) AS observations, SUM(observation=1 AND record_kind='outcome') AS outcomes,
        SUM(observation=1 AND record_kind='context') AS contexts,
        SUM(observation=1 AND record_kind IS NULL) AS legacy
      FROM activity GROUP BY project_path,agent_id ORDER BY project_path,agent_id LIMIT 21 OFFSET ?`,
      [high,from,to,position.sessionHigh,from,to,position.catalog]);
    const payload: any = { version: 1, coverage: 2, since, until, projects: [], memories: [], legacy_samples: [], legacy_items: [],
      daily_digests: [], next_cursor: null, source_high_water: high, session_high_water: position.sessionHigh,
      discovery_hint: 'Paged catalog of session starts and saved observations in this interval. Every observation of the interval is delivered: typed memories in full, legacy (untyped) observations as title stubs in legacy_items (read the whole one with details). daily_digests are model summaries per project and local day: routing clues only, never proof of inactivity. Verify promoted claims.' };
    // Budget the entire encoded response, not just memories. Reserve cursor
    // space so a large catalog cannot strand the client on an oversized page.
    const add = (key: string, item: any) => {
      payload[key].push(item);
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') + 2048 > 12 * 1024) {
        payload[key].pop(); return false;
      }
      return true;
    };
    let catalogDelivered = 0;
    for (const row of catalog.slice(0,20)) {
      if (!add('projects',row)) break;
      catalogDelivered++; position.catalog++;
    }
    let more = catalogDelivered < catalog.length;
    const memory = (row: any) => {
      const item = reviewItem(row);
      const itemSha = reviewItemHash(row);
      if (reader) {
        const seen = this.db.get('SELECT sha256 FROM review_reads WHERE reader=? AND item_id=?', [reader, row.id]);
        // Unchanged items were already verified by this reader: never resend their text.
        if (seen?.sha256 === itemSha) return { id: row.id, kind: item.kind, sha256: itemSha, unchanged: true,
          project_path: row.project_path, agent_id: row.agent_id, created_at: row.created_at };
      }
      item.sha256 = itemSha;
      return Buffer.byteLength(JSON.stringify(item), 'utf8') <= (item.kind === 'legacy' ? 2048 : 4096) ? item : {
        id: row.id, kind: item.kind, detail_required: true, sha256: itemSha,
        project_path: row.project_path, agent_id: row.agent_id, created_at: row.created_at,
        // Round 30: the title (bounded like a legacy stub) lets a reader tell an outcome before opening the whole memory.
        title: String(row.title ?? '').slice(0, 200),
        reason: 'Whole memory exceeds overview size; no excerpt used to decide inactivity' };
    };
    const legacyStub = (row: any) => {
      const sha256 = reviewItemHash(row);
      const base: any = { id: row.id, kind: 'legacy', project_path: row.project_path, agent_id: row.agent_id,
        session_id: row.session_id, created_at: row.created_at, sha256 };
      if (reader && this.db.get('SELECT sha256 FROM review_reads WHERE reader=? AND item_id=?', [reader, row.id])?.sha256 === sha256)
        return { ...base, unchanged: true };
      return { ...base, title_only: true, title: String(row.title ?? '').slice(0, 200),
        ...(row.compacted_into ? { compacted_into: row.compacted_into } : {}) };
    };
    if (!more) {
      const rows = this.db.all(`SELECT o.*,o.rowid AS position,m.record_kind,m.source_kind,${EVIDENCE_LINK_COLUMNS} FROM observations o
        JOIN observation_work_metadata m ON m.observation_id=o.id WHERE ${linkedWhere} AND o.rowid > ?
        ORDER BY o.rowid LIMIT 20`, [high,from,to,from,to,position.after]);
      for (const row of rows) {
        if (!add('memories',memory(row))) break;
        position.after = row.position;
      }
      more = !!this.db.get(`SELECT 1 FROM observations o JOIN observation_work_metadata m ON m.observation_id=o.id
        WHERE ${linkedWhere} AND o.rowid > ? LIMIT 1`, [high,from,to,from,to,position.after]);
    }
    if (!more) {
      // Every legacy (untyped) observation of the interval, as a title stub with its version hash (whole text via details).
      const rows = this.db.all(`SELECT o.*,o.rowid AS position,m.record_kind,m.source_kind,${EVIDENCE_LINK_COLUMNS},
          (SELECT r.observation_id FROM legacy_compaction_links l JOIN task_results r ON r.id=l.task_result_id
            WHERE l.legacy_observation_id=o.id AND r.observation_id IS NOT NULL LIMIT 1) AS compacted_into
        FROM observations o LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
        WHERE ${where} AND m.record_kind IS NULL AND o.rowid > ? ORDER BY o.rowid LIMIT 40`, [high,from,to,position.legacyAfter]);
      for (const row of rows) {
        if (!add('legacy_items', legacyStub(row))) break;
        position.legacyAfter = row.position;
      }
      more = !!this.db.get(`SELECT 1 FROM observations o LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
        WHERE ${where} AND m.record_kind IS NULL AND o.rowid > ? LIMIT 1`, [high,from,to,position.legacyAfter]);
    }
    if (!more) {
      // Daily model summaries of the local days this interval touches: routing clues, read with work-digest.
      const digests = this.db.all(`SELECT id,project_path,local_date,status,source_count,digest_json FROM daily_memory_digests
        WHERE local_date BETWEEN date(?, '-1 day') AND date(?, '+1 day') ORDER BY local_date,project_path,id LIMIT 50 OFFSET ?`,
        [from,to,position.digests]);
      for (const d of digests) {
        if (!add('daily_digests', { id: d.id, project_path: d.project_path, local_date: d.local_date, status: d.status,
          source_count: d.source_count, sha256: createHash('sha256').update(String(d.digest_json ?? ''), 'utf8').digest('hex') })) break;
        position.digests++;
      }
      more = !!this.db.get(`SELECT 1 FROM daily_memory_digests WHERE local_date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
        LIMIT 1 OFFSET ?`, [from,to,position.digests]);
    }
    if (more) payload.next_cursor = Buffer.from(JSON.stringify(position)).toString('base64url');
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 12 * 1024
        || (more && !payload.projects.length && !payload.memories.length && !payload.legacy_items.length && !payload.daily_digests.length))
      throw new Error('Overview routing metadata exceeds page budget; source requires inspection');
    return payload;
  }

  // Get project timeline (chronological observations)
  public async getTimeline(projectPath: string): Promise<Observation[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const normalizedPath = this.normalizeProjectPath(projectPath);
    const rows = this.db.all(
      `SELECT * FROM observations 
       WHERE LOWER(project_path) = LOWER(?)
       ORDER BY created_at DESC`,
      [normalizedPath]
    ) as any[];

    return rows.map((row) => this.parseObservation(row));
  }

  // Get multiple observations by their IDs
  /** Overview version hash of one memory, computed from the raw row exactly like getWorkOverview. */
  public reviewHashById(id: string): string | null {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT o.*,m.record_kind,m.source_kind,${EVIDENCE_LINK_COLUMNS} FROM observations o
      LEFT JOIN observation_work_metadata m ON m.observation_id=o.id WHERE o.id=?`, [id]);
    return row ? reviewItemHash(row) : null;
  }

  public async getObservationsByIds(ids: string[]): Promise<Observation[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return [];
    
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.all(
      `SELECT * FROM observations WHERE id IN (${placeholders})`,
      ids
    ) as any[];

    return rows.map((row) => this.parseObservation(row));
  }

  public async getRuntimePolicy(): Promise<RuntimeMemoryPolicy> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [RUNTIME_MEMORY_POLICY_KEY]
    ) as any;

    if (!row) {
      return this.persistRuntimePolicy({
        readEnabled: true,
        writeEnabled: true,
      });
    }

    const parsed = JSON.parse(row.value);
    return {
      readEnabled: parsed.readEnabled !== false,
      writeEnabled: parsed.writeEnabled !== false,
      updatedAt: row.updated_at,
    };
  }

  public async updateRuntimePolicy(
    partialPolicy: Partial<Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'>>
  ): Promise<RuntimeMemoryPolicy> {
    const current = await this.getRuntimePolicy();
    return this.persistRuntimePolicy({
      readEnabled: partialPolicy.readEnabled ?? current.readEnabled,
      writeEnabled: partialPolicy.writeEnabled ?? current.writeEnabled,
    });
  }

  public async getDailyDigestSchedulerConfig(): Promise<DailyDigestSchedulerConfig> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [DAILY_DIGEST_SCHEDULER_CONFIG_KEY]
    ) as any;

    if (!row) {
      return this.persistDailyDigestSchedulerConfig(getDefaultDailyDigestSchedulerConfig());
    }

    return this.parseDailyDigestSchedulerConfigRow(row);
  }

  public async updateDailyDigestSchedulerConfig(
    input: DailyDigestSchedulerConfigInput
  ): Promise<DailyDigestSchedulerConfig> {
    const current = await this.getDailyDigestSchedulerConfig();
    const normalized = normalizeDailyDigestSchedulerConfig({
      enabled: input.enabled ?? current.enabled,
      lookback_days: input.lookback_days ?? current.lookback_days,
      schedule_time: input.schedule_time ?? current.schedule_time,
      time_zone: input.time_zone ?? current.time_zone,
    });
    return this.persistDailyDigestSchedulerConfig(normalized);
  }

  public async listObservations(filters: ObservationListFilters = {}): Promise<ObservationListResult> {
    if (!this.db) throw new Error('Database not initialized');

    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 25)));
    const offset = (page - 1) * pageSize;

    const whereParts: string[] = [];
    const params: any[] = [];

    if (filters.project) {
      whereParts.push(`LOWER(project_path) = LOWER(?)`);
      params.push(filters.project);
    }

    if (filters.agent) {
      const match = agentMatchSql('agent_id', filters.agent);
      whereParts.push(match.sql);
      params.push(...match.params);
    }

    if (filters.query) {
      const wildcard = `%${this.escapeLike(filters.query)}%`;
      whereParts.push(`(
        title LIKE ? ESCAPE '\\'
        OR narrative LIKE ? ESCAPE '\\'
        OR facts LIKE ? ESCAPE '\\'
        OR concepts LIKE ? ESCAPE '\\'
        OR files_read LIKE ? ESCAPE '\\'
        OR files_modified LIKE ? ESCAPE '\\'
        OR project_path LIKE ? ESCAPE '\\'
        OR agent_id LIKE ? ESCAPE '\\'
      )`);
      for (let i = 0; i < 8; i++) {
        params.push(wildcard);
      }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const totalRow = this.db.get(
      `SELECT COUNT(*) as total FROM observations ${whereClause}`,
      params
    ) as any;

    const rows = this.db.all(
      `SELECT * FROM observations
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ) as any[];

    return {
      total: Number(totalRow?.total || 0),
      records: rows.map((row) => this.parseObservation(row)),
    };
  }

  public async countObservations(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT COUNT(*) as total FROM observations`) as any;
    return Number(row?.total || 0);
  }

  public async countSessions(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT COUNT(*) as total FROM sessions`) as any;
    return Number(row?.total || 0);
  }

  public async saveDailyMemoryDigest(input: DailyMemoryDigestInput): Promise<DailyMemoryDigest> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
      const id = randomUUID();
      const generatedAt = input.generated_at || new Date().toISOString();
      const sourceObservationIds = JSON.stringify(input.source_observation_ids);
      const digestJson = input.digest === null ? null : JSON.stringify(input.digest);
      const sourceCount = input.source_count ?? input.source_observation_ids.length;

      this.db.run(
        `INSERT INTO daily_memory_digests (
          id,
          project_path,
          local_date,
          status,
          digest_json,
          source_observation_ids,
          source_count,
          model,
          prompt_version,
          generated_at,
          reviewed_at,
          last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_path, local_date) DO UPDATE SET
          status = excluded.status,
          digest_json = excluded.digest_json,
          source_observation_ids = excluded.source_observation_ids,
          source_count = excluded.source_count,
          model = excluded.model,
          prompt_version = excluded.prompt_version,
          generated_at = excluded.generated_at,
          reviewed_at = excluded.reviewed_at,
          last_error = excluded.last_error,
          updated_at = CURRENT_TIMESTAMP`,
        [
          id,
          normalizedProjectPath,
          input.local_date,
          input.status,
          digestJson,
          sourceObservationIds,
          sourceCount,
          input.model ?? null,
          input.prompt_version,
          generatedAt,
          input.reviewed_at ?? null,
          input.last_error ?? null,
        ]
      );

      const digestRow = this.db.get('SELECT * FROM daily_memory_digests WHERE project_path = ? AND local_date = ?', [normalizedProjectPath, input.local_date]);
      const digest = digestRow ? this.parseDailyMemoryDigest(digestRow) : null;
      if (!digest) {
        throw new Error('Daily memory digest was not saved');
      }
      return digest;
    });
  }

  public async getDailyMemoryDigest(
    query: Required<Pick<DailyMemoryDigestQuery, 'projectPath' | 'localDate'>>
  ): Promise<DailyMemoryDigest | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT *
       FROM daily_memory_digests
       WHERE LOWER(project_path) = LOWER(?)
         AND local_date = ?
       LIMIT 1`,
      [this.normalizeProjectPath(query.projectPath), query.localDate]
    ) as any;

    return row ? this.parseDailyMemoryDigest(row) : null;
  }

  public async listDailyMemoryDigests(
    query: DailyMemoryDigestQuery = {}
  ): Promise<DailyMemoryDigest[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts: string[] = [];
    const params: any[] = [];

    if (query.projectPath) {
      whereParts.push(`LOWER(project_path) = LOWER(?)`);
      params.push(this.normalizeProjectPath(query.projectPath));
    }

    if (query.localDate) {
      whereParts.push(`local_date = ?`);
      params.push(query.localDate);
    }

    if (query.status) {
      whereParts.push(`status = ?`);
      params.push(query.status);
    }

    if (query.generatedBefore) {
      whereParts.push(`generated_at <= ?`);
      params.push(query.generatedBefore);
    }

    const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit || 10))));
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const rows = this.db.all(
      `SELECT *
       FROM daily_memory_digests
       ${whereClause}
       ORDER BY local_date DESC, generated_at DESC, updated_at DESC
       LIMIT ?`,
      [...params, limit]
    ) as any[];

    return rows.map((row) => this.parseDailyMemoryDigest(row));
  }

  public async countDailyMemoryDigests(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM daily_memory_digests
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM daily_memory_digests`) as any;
    return Number(row?.total || 0);
  }

  public async saveProceduralSkill(input: ProceduralSkillInput): Promise<ProceduralSkill> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
      const id = randomUUID();
      const status = normalizeProceduralSkillStatus(input.status);
      const confidence = normalizeConfidence(input.confidence);
      const sourceObservationIds = JSON.stringify(input.source_observation_ids || []);
      const stepsJson = JSON.stringify((input.steps || []).map((step) => String(step)).filter(Boolean));
      const tagsJson = JSON.stringify((input.tags || []).map((tag) => String(tag)).filter(Boolean));
      const embeddingJson = JSON.stringify(Array.isArray(input.embedding) ? input.embedding : []);
      const createdAt = new Date().toISOString();

      this.db.run(
        `INSERT INTO procedural_skills (
          id,
          project_path,
          title,
          summary,
          trigger_text,
          steps_json,
          tags_json,
          status,
          confidence,
          source_digest_id,
          source_observation_ids,
          embedding,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          normalizedProjectPath,
          input.title,
          input.summary,
          input.trigger_text,
          stepsJson,
          tagsJson,
          status,
          confidence,
          input.source_digest_id ?? null,
          sourceObservationIds,
          embeddingJson,
          createdAt,
          createdAt,
        ]
      );

      this.recordProceduralSkillStatusEvent(id, normalizedProjectPath, status, createdAt);

      const row = this.db.get(`SELECT * FROM procedural_skills WHERE id = ?`, [id]) as any;
      return this.parseProceduralSkill(row);
    });
  }

  public async getProceduralSkillById(id: string): Promise<ProceduralSkill | null> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT * FROM procedural_skills WHERE id = ? LIMIT 1`, [id]) as any;
    return row ? this.parseProceduralSkill(row) : null;
  }

  public async listProceduralSkills(query: ProceduralSkillQuery): Promise<ProceduralSkill[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [this.normalizeProjectPath(query.projectPath)];

    if (!query.asOf && query.statuses && query.statuses.length > 0) {
      whereParts.push(`status IN (${query.statuses.map(() => '?').join(', ')})`);
      params.push(...query.statuses.map((status) => normalizeProceduralSkillStatus(status)));
    }

    const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit || 20))));
    const rows = this.db.all(
      `SELECT *
       FROM procedural_skills
        WHERE ${whereParts.join(' AND ')}
        ORDER BY updated_at DESC, created_at DESC`,
      params
    ) as any[];

    const skills = rows.map((row) => this.parseProceduralSkill(row));
    const statusEvents = this.getProceduralSkillStatusEventMap(skills.map((skill) => skill.id));
    if (!query.asOf) {
      const currentSkills = skills
        .sort((left, right) => compareProceduralSkillsByRecency(left, right))
        .slice(0, limit);
      return Promise.all(
        currentSkills.map((skill) =>
          this.hydrateProceduralSkillFeedbackState(
            {
              ...skill,
              status_effective_at: this.getLatestProceduralSkillStatusEffectiveAt(
                statusEvents.get(skill.id) || [],
                skill
              ),
            },
            undefined
          )
        )
      );
    }

    const statuses = query.statuses?.map((status) => normalizeProceduralSkillStatus(status)) || null;
    const historicalSkills: ProceduralSkill[] = [];
    for (const skill of skills) {
      const resolvedStatus = this.resolveProceduralSkillStatusAsOf(
        skill,
        statusEvents.get(skill.id) || [],
        query.asOf as string
      );
      if (!resolvedStatus) {
        continue;
      }

      const shouldInclude = statuses
        ? statuses.includes(resolvedStatus.status)
        : resolvedStatus.status !== 'retired';
      if (!shouldInclude) {
        continue;
      }

      historicalSkills.push({
        ...skill,
        status: resolvedStatus.status,
        status_effective_at: resolvedStatus.effective_at,
        retired_at: resolvedStatus.status === 'retired'
          ? skill.retired_at || (query.asOf as string)
          : null,
      });
    }

    historicalSkills
      .sort((left, right) => compareProceduralSkillsByRecency(left, right));

    const limitedHistoricalSkills = historicalSkills.slice(0, limit);

    return Promise.all(
      limitedHistoricalSkills.map((skill) => this.hydrateProceduralSkillFeedbackState(skill, query.asOf))
    );
  }

  public async setProceduralSkillStatus(id: string, status: ProceduralSkillStatus): Promise<ProceduralSkill> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const existingRow = this.db.get('SELECT * FROM procedural_skills WHERE id = ?', [id]);
      const existing = existingRow ? this.parseProceduralSkill(existingRow) : null;
      if (!existing) {
        throw new Error(`Procedural skill not found: ${id}`);
      }

      const normalizedStatus = normalizeProceduralSkillStatus(status);
      if (
        existing.status === normalizedStatus &&
        ((normalizedStatus === 'retired' && existing.retired_at) || normalizedStatus !== 'retired')
      ) {
        return existing;
      }

      const statusChangedAt = new Date().toISOString();
      const retiredAt = normalizedStatus === 'retired' ? statusChangedAt : null;
      this.db.run(
        `UPDATE procedural_skills
         SET status = ?,
             retired_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [normalizedStatus, retiredAt, statusChangedAt, id]
      );
      this.recordProceduralSkillStatusEvent(id, existing.project_path, normalizedStatus, statusChangedAt);

      const skillRow = this.db.get('SELECT * FROM procedural_skills WHERE id = ?', [id]);
      const skill = skillRow ? this.parseProceduralSkill(skillRow) : null;
      if (!skill) {
        throw new Error(`Procedural skill not found: ${id}`);
      }
      return skill;
    });
  }

  public async recordProceduralSkillFeedback(
    input: ProceduralSkillFeedbackInput
  ): Promise<ProceduralSkillFeedback> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const skillRow = this.db.get('SELECT * FROM procedural_skills WHERE id = ?', [input.skill_id]);
      const skill = skillRow ? this.parseProceduralSkill(skillRow) : null;
      if (!skill) {
        throw new Error(`Procedural skill not found: ${input.skill_id}`);
      }

      const id = randomUUID();
      const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
      if (this.normalizeProjectPath(skill.project_path) !== normalizedProjectPath) {
        throw new Error(
          `Procedural skill ${skill.id} belongs to ${skill.project_path}, not ${normalizedProjectPath}.`
        );
      }

      const outcome = normalizeProceduralSkillFeedbackOutcome(input.outcome);
      const feedbackCreatedAt = new Date().toISOString();
      this.db.run(
        `INSERT INTO procedural_skill_feedback (
          id,
          skill_id,
          project_path,
          outcome,
          task_text,
          notes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.skill_id,
          normalizedProjectPath,
          outcome,
          input.task_text || '',
          input.notes || '',
          feedbackCreatedAt,
        ]
      );

      const countField = outcome === 'success' ? 'success_count' : outcome === 'failure' ? 'failure_count' : null;
      if (countField) {
        this.db.run(
          `UPDATE procedural_skills
           SET ${countField} = ${countField} + 1,
               last_used_at = ?,
               updated_at = ?
           WHERE id = ?`,
          [feedbackCreatedAt, feedbackCreatedAt, input.skill_id]
        );
      } else {
        this.db.run(
          `UPDATE procedural_skills
           SET last_used_at = ?,
               updated_at = ?
           WHERE id = ?`,
          [feedbackCreatedAt, feedbackCreatedAt, input.skill_id]
        );
      }

      const row = this.db.get(`SELECT * FROM procedural_skill_feedback WHERE id = ?`, [id]) as any;
      return this.parseProceduralSkillFeedback(row);
    });
  }

  public async listProceduralSkillFeedback(
    query: ProceduralSkillFeedbackQuery
  ): Promise<ProceduralSkillFeedback[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = ['skill_id = ?'];
    const params: any[] = [query.skillId];

    if (query.projectPath) {
      whereParts.push('LOWER(project_path) = LOWER(?)');
      params.push(this.normalizeProjectPath(query.projectPath));
    }

    if (query.asOf) {
      whereParts.push('created_at <= ?');
      params.push(query.asOf);
    }

    const limit = query.limit
      ? Math.max(1, Math.min(200, Math.trunc(Number(query.limit))))
      : null;

    const rows = this.db.all(
      `SELECT *
       FROM procedural_skill_feedback
       WHERE ${whereParts.join(' AND ')}
       ORDER BY created_at DESC${limit ? ' LIMIT ?' : ''}`,
      limit ? [...params, limit] : params
    ) as any[];

    return rows.map((row) => this.parseProceduralSkillFeedback(row));
  }

  public async searchProceduralSkills(
    projectPath: string,
    queryText: string,
    queryVector?: number[],
    limit: number = 5,
    options: { asOf?: string; statuses?: ProceduralSkillStatus[] } = {}
  ): Promise<ProceduralSkillSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.listProceduralSkills({
      projectPath,
      statuses: options.statuses,
      limit: Math.max(limit * 3, limit),
      asOf: options.asOf,
    });

    const queryTokens = tokenizeForOverlap(queryText);
    return rows
      .map((skill) => {
        const lexicalScore = calculateTokenOverlapScore(
          queryTokens,
          tokenizeForOverlap([skill.title, skill.summary, skill.trigger_text, ...skill.tags].join(' '))
        );
        const vectorScore = queryVector && skill.embedding.length > 0
          ? this.calculateCosineSimilarity(queryVector, skill.embedding)
          : 0;
        const hybridScore = queryVector
          ? lexicalScore * 0.35 + vectorScore * 0.65
          : lexicalScore;

        return {
          id: skill.id,
          project_path: skill.project_path,
          title: skill.title,
          summary: skill.summary,
          trigger_text: skill.trigger_text,
          steps: skill.steps,
          tags: skill.tags,
          status: skill.status,
          confidence: skill.confidence,
          success_count: skill.success_count,
          failure_count: skill.failure_count,
          last_used_at: skill.last_used_at,
          created_at: skill.created_at,
          source_observation_count: Array.isArray(skill.source_observation_ids)
            ? skill.source_observation_ids.length
            : 0,
          status_effective_at: skill.status_effective_at || null,
          feedback_summary: skill.feedback_summary,
          feedback_history: skill.feedback_history,
          lifecycle_signal: skill.lifecycle_signal || null,
          recommendation_state: skill.recommendation_state || null,
          recommendation_score:
            typeof skill.recommendation_score === 'number' ? skill.recommendation_score : null,
          recommendation_reasons: skill.recommendation_reasons || [],
          lexical_score: lexicalScore,
          vector_score: vectorScore,
          hybrid_score: hybridScore,
        };
      })
      .filter((skill) => skill.hybrid_score > 0 || rows.length <= limit)
      .sort((left, right) => right.hybrid_score - left.hybrid_score)
      .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))));
  }

  public async countProceduralSkills(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM procedural_skills
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM procedural_skills`) as any;
    return Number(row?.total || 0);
  }

  public async savePostTaskReview(input: PostTaskReviewInput): Promise<PostTaskReview> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
      const generatedAt = input.generated_at || new Date().toISOString();

      this.db.run(
        `INSERT INTO post_task_reviews (
          id,
          project_path,
          source_observation_id,
          source_session_id,
          source_agent_id,
          source_title,
          query_text,
          status,
          matched_skill_titles_json,
          recommendation_states_json,
          bounded_context_json,
          decision_trace_json,
          temporal_diagnostics_json,
          generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_observation_id) DO UPDATE SET
          query_text = excluded.query_text,
          matched_skill_titles_json = excluded.matched_skill_titles_json,
          recommendation_states_json = excluded.recommendation_states_json,
          bounded_context_json = excluded.bounded_context_json,
          decision_trace_json = excluded.decision_trace_json,
          temporal_diagnostics_json = excluded.temporal_diagnostics_json,
          generated_at = excluded.generated_at,
          updated_at = CURRENT_TIMESTAMP`,
        [
          randomUUID(),
          normalizedProjectPath,
          input.source_observation_id,
          input.source_session_id,
          normalizeAgentId(input.source_agent_id),
          input.source_title,
          input.query_text,
          'open',
          JSON.stringify(input.matched_skill_titles || []),
          JSON.stringify(input.recommendation_states || []),
          JSON.stringify(input.bounded_context ?? null),
          JSON.stringify(input.decision_trace ?? null),
          JSON.stringify(input.temporal_diagnostics ?? null),
          generatedAt,
        ]
      );

      const row = this.db.get(
        `SELECT *
         FROM post_task_reviews
         WHERE source_observation_id = ?
         LIMIT 1`,
        [input.source_observation_id]
      ) as any;

      if (!row) {
        throw new Error('Post-task review was not saved');
      }

      return this.parsePostTaskReview(row);
    });
  }

  public async listPostTaskReviews(query: PostTaskReviewQuery): Promise<PostTaskReview[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [this.normalizeProjectPath(query.projectPath)];

    if (query.status) {
      whereParts.push(`status = ?`);
      params.push(query.status);
    }

    if (query.sourceObservationId) {
      whereParts.push(`source_observation_id = ?`);
      params.push(query.sourceObservationId);
    }

    const rows = this.db.all(
      `SELECT *
       FROM post_task_reviews
       WHERE ${whereParts.join(' AND ')}
       ORDER BY generated_at DESC, updated_at DESC
       LIMIT ?`,
      [...params, Math.max(1, Math.min(50, Math.trunc(Number(query.limit || 10))))]
    ) as any[];

    return rows.map((row) => this.parsePostTaskReview(row));
  }

  public async countPostTaskReviews(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM post_task_reviews
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM post_task_reviews`) as any;
    return Number(row?.total || 0);
  }

  public async saveStateFact(input: StateFactInput): Promise<StateFact> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
      const entityType = input.entity_type || 'project';
      const entityKey = input.entity_key || normalizedProjectPath;
      const factKey = input.fact_key;
      const effectiveAt = input.effective_at || new Date().toISOString();
      const recordedAt = new Date().toISOString();
      const valueJson = JSON.stringify(input.value);

      const previousActive = this.db.get(
        `SELECT id
         FROM state_facts
         WHERE LOWER(project_path) = LOWER(?)
           AND LOWER(entity_type) = LOWER(?)
           AND LOWER(entity_key) = LOWER(?)
           AND LOWER(fact_key) = LOWER(?)
           AND effective_at <= ?
           AND (superseded_at IS NULL OR superseded_at > ?)
         ORDER BY effective_at DESC, recorded_at DESC
         LIMIT 1`,
        [normalizedProjectPath, entityType, entityKey, factKey, effectiveAt, effectiveAt]
      ) as any;

      const nextActive = this.db.get(
        `SELECT effective_at
         FROM state_facts
         WHERE LOWER(project_path) = LOWER(?)
           AND LOWER(entity_type) = LOWER(?)
           AND LOWER(entity_key) = LOWER(?)
           AND LOWER(fact_key) = LOWER(?)
           AND effective_at > ?
         ORDER BY effective_at ASC, recorded_at ASC
         LIMIT 1`,
        [normalizedProjectPath, entityType, entityKey, factKey, effectiveAt]
      ) as any;

      const id = randomUUID();
      this.db.run(
        `INSERT INTO state_facts (
          id,
          project_path,
          entity_type,
          entity_key,
          fact_key,
          value_json,
          effective_at,
          recorded_at,
          superseded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          normalizedProjectPath,
          entityType,
          entityKey,
          factKey,
          valueJson,
          effectiveAt,
          recordedAt,
          nextActive?.effective_at || null,
        ]
      );

      if (previousActive?.id) {
        this.db.run(
          `UPDATE state_facts
           SET superseded_at = ?
           WHERE id = ?`,
          [effectiveAt, previousActive.id]
        );
      }

      const row = this.db.get(`SELECT * FROM state_facts WHERE id = ?`, [id]) as any;
      return this.parseStateFact(row);
    });
  }

  public async getStateFacts(query: StateFactQuery): Promise<StateFact[]> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(query.projectPath);
    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [normalizedProjectPath];

    if (query.entityType) {
      whereParts.push(`LOWER(entity_type) = LOWER(?)`);
      params.push(query.entityType);
    }

    if (query.entityKey) {
      whereParts.push(`LOWER(entity_key) = LOWER(?)`);
      params.push(query.entityKey);
    }

    if (query.factKey) {
      whereParts.push(`LOWER(fact_key) = LOWER(?)`);
      params.push(query.factKey);
    }

    if (query.asOf) {
      whereParts.push(`effective_at <= ?`);
      whereParts.push(`(superseded_at IS NULL OR superseded_at > ?)`);
      params.push(query.asOf, query.asOf);
    } else {
      whereParts.push(`superseded_at IS NULL`);
    }

    const rows = this.db.all(
      `SELECT *
       FROM state_facts
       WHERE ${whereParts.join(' AND ')}
       ORDER BY entity_type COLLATE NOCASE ASC,
                entity_key COLLATE NOCASE ASC,
                fact_key COLLATE NOCASE ASC,
                effective_at DESC,
                recorded_at DESC`,
      params
    ) as any[];

    return rows.map((row) => this.parseStateFact(row));
  }

  public async getProjectStateFacts(projectPath: string, asOf?: string): Promise<StateFact[]> {
    return this.getStateFacts({
      projectPath,
      asOf,
    });
  }

  public async countCurrentStateFacts(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(
      `SELECT COUNT(*) as total
       FROM state_facts
       WHERE superseded_at IS NULL`
    ) as any;
    return Number(row?.total || 0);
  }

  public async listDistinctProjects(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.all(
      `SELECT DISTINCT project_path
       FROM (
         SELECT project_path FROM observations
         UNION
         SELECT project_path FROM state_facts
         UNION
         SELECT project_path FROM daily_memory_digests
         UNION
         SELECT project_path FROM procedural_skills
       )
       WHERE project_path != ''
       ORDER BY project_path COLLATE NOCASE ASC`
    ) as any[];
    return rows.map((row) => row.project_path as string);
  }

  public async listDistinctAgents(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.all(
      `SELECT DISTINCT agent_id
       FROM observations
       WHERE agent_id != ''
       ORDER BY agent_id COLLATE NOCASE ASC`
    ) as any[];
    return presentAgentIds(rows.map((row) => row.agent_id as string)).map((agent) => agent.agent_id);
  }

  // Cosine similarity in pure TS
  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Hybrid Search: Combined FTS5 + Vector Cosine Similarity
  public async searchHybrid(
    projectPath: string,
    queryText: string,
    queryVector?: number[],
    limit: number = 10,
    options: { asOf?: string } = {}
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedPath = this.normalizeProjectPath(projectPath);
    // Trimmed so a stripped CJK tail cannot leave a dangling `*` that FTS5 rejects as a syntax error.
    const cleanQuery = queryText.replace(/[^a-zA-Z0-9\s_\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
    const cjkBigrams = extractCjkBigrams(queryText);
    const asOf = options.asOf;

    let ftsRows: any[] = [];
    if (cleanQuery) {
      try {
        const ftsQuery = `SELECT o.*, fts.bm25Score
           FROM observations o
           INNER JOIN (
             SELECT observation_id, bm25(observations_fts) as bm25Score
             FROM observations_fts
             WHERE observations_fts MATCH ?
           ) fts ON o.id = fts.observation_id
           WHERE LOWER(o.project_path) = LOWER(?)`;
        const ftsParams = [`${cleanQuery}*`, normalizedPath];
        ftsRows = this.db.all(ftsQuery, ftsParams) as any[];
      } catch (e) {
        // Fallback if FTS search fails or has syntax errors
      }
    }

    const allRows = this.db.all(
      `SELECT * FROM observations WHERE LOWER(project_path) = LOWER(?)`,
      [normalizedPath]
    ) as any[];

    const filteredRows = asOf
      ? allRows.filter((row) => isTimestampOnOrBefore(row.created_at, asOf))
      : allRows;
    const filteredFtsRows = asOf
      ? ftsRows.filter((row) => isTimestampOnOrBefore(row.created_at, asOf))
      : ftsRows;

    const asciiTermCount = cleanQuery ? cleanQuery.split(' ').length : 0;
    return this.scoreResults(filteredRows, filteredFtsRows, queryVector, limit, {
      cjkBigrams,
      asciiTermCount,
    });
  }

  private scoreResults(
    allRows: any[],
    ftsRows: any[],
    queryVector?: number[],
    limit: number = 10,
    lexical: { cjkBigrams: string[]; asciiTermCount: number } = { cjkBigrams: [], asciiTermCount: 0 }
  ): SearchResult[] {
    const ftsMap = new Map<string, number>();
    ftsRows.forEach((row) => {
      // bm25 score is negative, lower is better. Convert it to a positive relative score.
      ftsMap.set(row.id || row.observation_id, -(row.bm25Score || 0));
    });

    let maxFts = 0.0001;
    ftsMap.forEach((score) => {
      if (score > maxFts) maxFts = score;
    });

    let lexicalHit = false;
    const results: SearchResult[] = allRows.map((row) => {
      const id = row.id;
      const embedding: number[] = JSON.parse(row.embedding);
      
      let vectorScore = 0.0;
      if (queryVector && embedding.length > 0) {
        vectorScore = this.calculateCosineSimilarity(queryVector, embedding);
      }

      const rawFts = ftsMap.get(id) || 0.0;
      const asciiScore = rawFts / maxFts;
      // FTS5 cannot see CJK terms, so they are scored by bigram overlap and blended with the ASCII
      // FTS score in proportion to how much of the query each side carries.
      const cjkCount = lexical.cjkBigrams.length;
      const ftsScore = cjkCount > 0
        ? (asciiScore * lexical.asciiTermCount + cjkOverlapScore(lexical.cjkBigrams, [
            row.title, row.narrative, row.facts, row.concepts,
          ].join('\n')) * cjkCount) / (lexical.asciiTermCount + cjkCount)
        : asciiScore;
      if (ftsScore > 0) lexicalHit = true;

      const hybridScore = queryVector 
        ? (0.4 * ftsScore + 0.6 * vectorScore)
        : ftsScore;

      return {
        id,
        title: row.title,
        narrative: row.narrative,
        facts: JSON.parse(row.facts),
        concepts: JSON.parse(row.concepts),
        files_modified: JSON.parse(row.files_modified),
        agent_id: row.agent_id,
        fts_score: ftsScore,
        vector_score: vectorScore,
        hybrid_score: hybridScore,
        created_at: row.created_at,
      };
    });

    return results
      .filter((r) => r.hybrid_score > 0.01 || !lexicalHit)
      .sort((a, b) => b.hybrid_score - a.hybrid_score)
      .slice(0, limit);
  }

  // Additive-only tables for rule routing, task consolidation and review reads.
  // Nothing here deletes or rewrites existing rows; there is no TTL cleanup.
  private async ensureTaskTables(): Promise<void> {
    const wanted = ['tool_evidence', 'task_event_buffer', 'task_results', 'observation_content_hashes',
      'review_reads', 'review_runs', 'legacy_compaction_links', 'task_attempts', 'task_completions', 'duplicate_flags',
      'task_import_times'];
    // Quick-skip only when the stored schema revision is current AND every table and index exists. Any change to the
    // block below must bump TASK_SCHEMA_REVISION, so a database from an older revision always runs the (idempotent) upgrade.
    const indexes = ['idx_tool_evidence_session', 'idx_tool_evidence_task', 'idx_task_event_buffer_open',
      'idx_task_event_buffer_result', 'idx_task_results_task',
      'idx_task_results_observation', 'idx_observation_content_hash', 'idx_review_runs_interval', 'idx_observations_created_dt',
      'idx_observations_project_dt'];
    const have = this.db.all(`SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name IN (${[...wanted, ...indexes].map(() => '?').join(',')})`,
      [...wanted, ...indexes]);
    const revision = this.columnsOf('task_schema_meta').size
      ? Number(this.db.get(`SELECT value FROM task_schema_meta WHERE key='revision'`)?.value || 0) : 0;
    if (revision === TASK_SCHEMA_REVISION && have.length === wanted.length + indexes.length && !this.taskTablesNeedMigration()) return;
    await this.write(() => {
      this.migrateTaskTablesFromV1();
      this.repairV1TruncationFlags();
      this.db.run(`CREATE TABLE IF NOT EXISTS tool_evidence (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, route_reason TEXT NOT NULL,
        input TEXT NOT NULL, output TEXT NOT NULL, input_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0, source_sha256 TEXT NOT NULL, task_id TEXT, received_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tool_evidence_session ON tool_evidence(session_id, task_id, received_ms)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tool_evidence_task ON tool_evidence(task_id)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS task_event_buffer (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL,
        incomplete INTEGER NOT NULL DEFAULT 0, task_result_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, received_ms INTEGER NOT NULL)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_event_buffer_open ON task_event_buffer(session_id, task_result_id, received_ms)`);
      // Revision 12 (additive): imported events keep their original time in received_ms/created_at; the wall-clock
      // arrival (idle sweep only) is import_arrival_ms, NULL for live capture. Older releases ignore both.
      if (!this.columnsOf('task_event_buffer').has('import_arrival_ms'))
        this.db.run(`ALTER TABLE task_event_buffer ADD COLUMN import_arrival_ms INTEGER`);
      this.db.run(`CREATE TABLE IF NOT EXISTS task_import_times (task_id TEXT PRIMARY KEY, boundary_ms INTEGER NOT NULL)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS task_results (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL, project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL, segment_index INTEGER NOT NULL, segment_count INTEGER NOT NULL,
        event_count INTEGER NOT NULL, source_ids TEXT NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL,
        observation_id TEXT, content_sha256 TEXT, llm_calls INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        source_kind TEXT NOT NULL DEFAULT 'task', evidence_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(task_id, segment_index))`);
      this.db.run(`CREATE TABLE IF NOT EXISTS task_attempts (
        task_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        updated_ms INTEGER NOT NULL)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_results_task ON task_results(task_id, segment_index)`);
      // Activity cards count tasks per memory and memory-detail lists them; additive, older releases ignore it.
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_results_observation ON task_results(observation_id)`);
      // TASK_COMPLETE_SQL and the pipeline list look up / group task_event_buffer by task_result_id (covering received_ms).
      // idx_task_event_buffer_open leads with session_id, so it cannot serve that probe.
      // A missing index alone re-enters this block; the schema revision stays 11.
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_event_buffer_result ON task_event_buffer(task_result_id, received_ms)`);
      // Whole-task completion marker (additive). Tasks already finished by an earlier revision are backfilled
      // from task_results that have no frozen rows left, so they are not re-run.
      const hadCompletions = this.columnsOf('task_completions').size > 0;
      this.db.run(`CREATE TABLE IF NOT EXISTS task_completions (task_id TEXT PRIMARY KEY, completed_ms INTEGER NOT NULL)`);
      if (!hadCompletions) this.db.run(`INSERT OR IGNORE INTO task_completions (task_id, completed_ms)
        SELECT DISTINCT r.task_id, 0 FROM task_results r WHERE NOT EXISTS
          (SELECT 1 FROM task_event_buffer b WHERE b.task_result_id = 'task:' || r.task_id)`);
      // Duplicate-looking summaries are linked and flagged for a human; never deleted automatically.
      this.db.run(`CREATE TABLE IF NOT EXISTS duplicate_flags (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, observation_id TEXT NOT NULL, matched_sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'needs_confirmation', created_ms INTEGER NOT NULL)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS observation_content_hashes (
        observation_id TEXT PRIMARY KEY, project_path TEXT NOT NULL, sha256 TEXT NOT NULL)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_observation_content_hash ON observation_content_hashes(project_path, sha256)`);
      // Revision 10 (additive): hash version (existing rows are v1, case-insensitive) and a flag reason.
      if (!this.columnsOf('observation_content_hashes').has('hash_version'))
        this.db.run(`ALTER TABLE observation_content_hashes ADD COLUMN hash_version INTEGER NOT NULL DEFAULT 1`);
      if (!this.columnsOf('duplicate_flags').has('reason')) this.db.run(`ALTER TABLE duplicate_flags ADD COLUMN reason TEXT`);
      // content_hash_claims (f2afea2 only) is no longer used; an existing table is left in place untouched.
      this.db.run(`CREATE TABLE IF NOT EXISTS review_reads (
        reader TEXT NOT NULL, item_id TEXT NOT NULL, sha256 TEXT NOT NULL, run_id TEXT,
        read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(reader, item_id))`);
      this.db.run(`CREATE TABLE IF NOT EXISTS review_runs (
        run_id TEXT PRIMARY KEY, reader TEXT NOT NULL, since TEXT NOT NULL, until TEXT NOT NULL,
        cursor TEXT, status TEXT NOT NULL, metrics_json TEXT,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_review_runs_interval ON review_runs(reader, since, until, status)`);
      // Admin Home aggregates filter and sort by datetime(created_at) (mixed stored formats), so index that expression.
      // Additive only: a missing index alone triggers this idempotent block, and older releases simply ignore it.
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_observations_created_dt ON observations(datetime(created_at))`);
      // Memory lists and Activity with a project filter walk LOWER(project_path), then datetime(created_at).
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_observations_project_dt ON observations(LOWER(project_path), datetime(created_at))`);
      this.db.run(`CREATE TABLE IF NOT EXISTS legacy_compaction_links (
        legacy_observation_id TEXT PRIMARY KEY, task_result_id TEXT NOT NULL)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS task_schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      this.db.run(`INSERT INTO task_schema_meta (key, value) VALUES ('revision', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [String(TASK_SCHEMA_REVISION)]);
    });
  }

  private columnsOf(table: string): Set<string> {
    return new Set(this.db.all(`PRAGMA table_info(${table})`).map((c: any) => c.name));
  }

  private taskTablesNeedMigration(): boolean {
    const evidence = this.columnsOf('tool_evidence');
    const results = this.columnsOf('task_results');
    const hashes = this.columnsOf('observation_content_hashes'); const flags = this.columnsOf('duplicate_flags');
    const buffer = this.columnsOf('task_event_buffer');
    return (buffer.size > 0 && !buffer.has('import_arrival_ms')) || (evidence.size > 0 && !evidence.has('task_id')) || (results.size > 0 && !results.has('evidence_count'))
      || (hashes.size > 0 && !hashes.has('hash_version')) || (flags.size > 0 && !flags.has('reason'));
  }

  /**
   * Explicit, additive migration for databases created by the first PR #3 revision (f28a49d).
   * tool_evidence v1 (input_head/output_head NOT NULL, no task_id) is renamed to tool_evidence_v1 and kept
   * intact; its rows are copied into the new table. task_results gains evidence_count and a unique
   * (task_id, segment_index) index. Nothing is deleted.
   */
  /**
   * Revision 11 repair (idempotent, flags only): databases migrated from v1 before the byte-length fix compared UTF-8
   * byte counts with character counts, so complete non-ASCII evidence was flagged truncated. Clear the flag only for
   * rows whose kept v1 source shows the full text was stored and whose migrated text is still that exact text.
   * No evidence text is changed and nothing is deleted; really cut rows keep truncated=1.
   */
  private repairV1TruncationFlags(): void {
    if (!this.columnsOf('tool_evidence').has('truncated')) return;
    const backups = this.db.all(`SELECT name FROM sqlite_master WHERE type='table' AND (name='tool_evidence_v1' OR name LIKE 'tool_evidence_v1_%')`);
    let repaired = 0;
    for (const { name } of backups) {
      if (!/^tool_evidence_v1(_\d+)?$/.test(name)) continue;
      const before = Number(this.db.get(`SELECT COUNT(*) AS n FROM tool_evidence WHERE truncated=1`)?.n || 0);
      this.db.run(`UPDATE tool_evidence SET truncated=0 WHERE truncated=1 AND id IN (
        SELECT b.id FROM ${name} b WHERE b.id = tool_evidence.id
          AND b.input_bytes <= length(CAST(b.input_head AS BLOB)) AND b.output_bytes <= length(CAST(b.output_head AS BLOB))
          AND tool_evidence.input = b.input_head AND tool_evidence.output = b.output_head)`);
      repaired += before - Number(this.db.get(`SELECT COUNT(*) AS n FROM tool_evidence WHERE truncated=1`)?.n || 0);
    }
    if (repaired) console.error(`[Memory] cleared a wrong truncated flag on ${repaired} complete v1 evidence row(s); evidence unchanged.`);
  }

  private migrateTaskTablesFromV1(): void {
    const evidence = this.columnsOf('tool_evidence');
    if (evidence.size > 0 && !evidence.has('task_id')) {
      const backup = this.columnsOf('tool_evidence_v1').size ? `tool_evidence_v1_${Date.now()}` : 'tool_evidence_v1';
      this.db.run(`DROP INDEX IF EXISTS idx_tool_evidence_session`);
      this.db.run(`ALTER TABLE tool_evidence RENAME TO ${backup}`);
      this.db.run(`CREATE TABLE tool_evidence (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, route_reason TEXT NOT NULL,
        input TEXT NOT NULL, output TEXT NOT NULL, input_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0, source_sha256 TEXT NOT NULL, task_id TEXT, received_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      this.db.run(`INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,route_reason,input,output,
        input_bytes,output_bytes,truncated,source_sha256,task_id,received_ms,created_at)
        SELECT id,session_id,project_path,agent_id,tool_name,success,route_reason,input_head,output_head,input_bytes,output_bytes,
        CASE WHEN input_bytes > length(CAST(input_head AS BLOB)) OR output_bytes > length(CAST(output_head AS BLOB)) THEN 1 ELSE 0 END,
        source_sha256,NULL,CAST(strftime('%s', created_at) AS INTEGER) * 1000,created_at FROM ${backup}`);
    }
    const results = this.columnsOf('task_results');
    if (results.size > 0 && !results.has('evidence_count')) {
      this.db.run(`ALTER TABLE task_results ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 0`);
    }
    if (results.size > 0) {
      const dupes = this.db.get(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM task_results GROUP BY task_id, segment_index HAVING COUNT(*) > 1)`);
      if (!dupes?.n) this.db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_task_results_segment ON task_results(task_id, segment_index)`);
      else console.error('[Memory] task_results has duplicate (task_id, segment_index) rows; unique index not created, rows kept.');
    }
  }

  /**
   * Read-only aggregates for the admin Home screen. Local days use the caller's UTC offset
   * (minutes east of UTC); every number is derived from existing tables, nothing is written.
   */
  public async getAdminHomeSummary(options: { tzOffsetMinutes?: number; days?: number; now?: Date } = {}) {
    if (!this.db) throw new Error('Database not initialized');
    const offset = Math.max(-840, Math.min(840, Math.trunc(Number(options.tzOffsetMinutes) || 0)));
    const days = Math.max(1, Math.min(90, Math.trunc(Number(options.days) || 30)));
    const nowMs = (options.now || new Date()).getTime();
    const shift = `${offset >= 0 ? '+' : ''}${offset} minutes`;
    const localDay = (ms: number) => new Date(ms + offset * 60000).toISOString().slice(0, 10);
    const utcStartOf = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - offset * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');
    const dayList = Array.from({ length: days }, (_, i) => localDay(nowMs - (days - 1 - i) * 86400000));
    const today = dayList[dayList.length - 1];
    const windowStart = utcStartOf(dayList[0]);
    const todayStart = utcStartOf(today);

    const byDay = new Map(dayList.map(day => [day, { day, outcome: 0, context: 0, legacy: 0 }]));
    for (const row of this.db.all(`SELECT date(datetime(o.created_at), ?) AS day, m.record_kind AS kind, COUNT(*) AS n
      FROM observations o LEFT JOIN observation_work_metadata m ON m.observation_id = o.id
      WHERE datetime(o.created_at) >= datetime(?) GROUP BY day, kind`, [shift, windowStart])) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      const kind = row.kind === 'outcome' || row.kind === 'context' ? row.kind : 'legacy';
      bucket[kind as 'outcome' | 'context' | 'legacy'] += Number(row.n) || 0;
    }
    const daily = dayList.map(day => byDay.get(day)!);
    const todayCounts = daily[daily.length - 1];

    const agentRows: Array<{ agent_id: string; n: number }> = this.db.all(`SELECT agent_id, COUNT(*) AS n FROM observations
        WHERE datetime(created_at) >= datetime(?) GROUP BY agent_id`, [todayStart]).map((row: any) => ({
        agent_id: String(row.agent_id ?? ''),
        n: Number(row.n) || 0,
      }));
    const agents = collapseListedAgents(agentRows, { sum: ['n'] })
      .sort((a, b) => b.n - a.n || (a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0))
      .slice(0, 6);
    const projects = this.db.all(`SELECT project_path, COUNT(*) AS n FROM observations
      WHERE datetime(created_at) >= datetime(?) GROUP BY project_path ORDER BY n DESC, project_path LIMIT 4`, [todayStart]);
    const recent = this.db.all(`SELECT o.id, o.created_at, o.agent_id, o.project_path, substr(o.title, 1, 200) AS title,
        m.record_kind, m.source_kind
      FROM observations o LEFT JOIN observation_work_metadata m ON m.observation_id = o.id
      ORDER BY datetime(o.created_at) DESC, o.rowid DESC LIMIT 10`).map((row: any) => ({
      ...row, record_kind: row.record_kind || null, source_kind: row.source_kind || null,
    }));

    const tasksToday = { total: 0, saved: 0, skipped: 0, fallback: 0, duplicate: 0, other: 0, llm_calls: 0 };
    for (const row of this.db.all(`SELECT status, COUNT(*) AS n, COALESCE(SUM(llm_calls), 0) AS calls FROM task_results
      WHERE datetime(created_at) >= datetime(?) GROUP BY status`, [todayStart])) {
      const n = Number(row.n) || 0;
      const key = ['saved', 'skipped', 'fallback', 'duplicate'].includes(row.status) ? row.status : 'other';
      (tasksToday as any)[key] += n;
      tasksToday.total += n;
      tasksToday.llm_calls += Number(row.calls) || 0;
    }

    const latestDigest = this.db.get(`SELECT project_path, local_date, status, generated_at FROM daily_memory_digests
      ORDER BY generated_at DESC, local_date DESC LIMIT 1`) || null;
    const latestDayProjects = latestDigest
      ? Number(this.db.get(`SELECT COUNT(*) AS n FROM daily_memory_digests WHERE local_date = ?`, [latestDigest.local_date]).n) || 0
      : 0;
    // Failed rows are rewritten in place by a successful re-run (unique per project and day), so these are still open.
    const failedDigests = this.db.all(`SELECT project_path, local_date, substr(COALESCE(last_error, ''), 1, 4000) AS last_error
      FROM daily_memory_digests WHERE status = 'failed' AND local_date >= ? ORDER BY local_date DESC, project_path LIMIT 5`,
    [localDay(nowMs - 86400000)]);

    const vaultRow = this.db.get(`SELECT value_json, effective_at FROM state_facts
      WHERE LOWER(entity_key) IN ('obsidian-vault-daily-review', 'automation/obsidian-vault-daily-review')
        AND fact_key = 'last_successful_review_at' AND superseded_at IS NULL
      ORDER BY effective_at DESC LIMIT 1`);
    let vaultValue: string | null = null;
    if (vaultRow) {
      try {
        const parsed = JSON.parse(vaultRow.value_json);
        vaultValue = typeof parsed === 'string' && parsed.trim() ? parsed : null;
      } catch { /* fall back to the fact's effective time */ }
      vaultValue = vaultValue || vaultRow.effective_at || null;
    }

    return {
      generated_at: new Date(nowMs).toISOString(),
      tz_offset_minutes: offset,
      days,
      today: {
        date: today,
        total: todayCounts.outcome + todayCounts.context + todayCounts.legacy,
        outcome: todayCounts.outcome,
        context: todayCounts.context,
        legacy: todayCounts.legacy,
        agents,
        projects,
      },
      daily,
      recent,
      tasks_today: tasksToday,
      digests: { latest: latestDigest, latest_day_projects: latestDayProjects, failed_recent: failedDigests.map((row: any) => ({ ...row, last_error: clipRedacted(row.last_error, 300) })) },
      vault_review: { last_successful_review_at: vaultValue },
    };
  }

  /**
   * Read-only Activity aggregates. The window is half-open on datetime(created_at)
   * so idx_observations_created_dt can drive every scan. Nothing is written.
   */
  public async getAdminActivity(options: {
    from: string; to: string; tzOffsetMinutes?: number; project?: string; agent?: string;
    kind?: 'typed' | 'legacy' | 'all'; limit?: number; cursor?: string | null;
  }) {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = normalizeAdminActivity(options);
    const queries = buildAdminActivityQueries(normalized);
    const rowsOf = (name: string) => {
      const query = queries.find((item) => item.name === name);
      return query ? this.db.all(query.sql, query.params) : [];
    };

    const dayList = activityDayList(normalized.fromMs, normalized.toMs, normalized.offset);
    const byDay = new Map(dayList.map((day) => [day, {
      day, outcome: 0, context: 0, fallback: 0, legacy: 0, era: null as ActivityEra,
    }]));
    const totals = { memories: 0, outcome: 0, context: 0, fallback: 0, legacy: 0 };
    for (const row of rowsOf('days')) {
      const outcome = Number(row.outcome) || 0;
      const context = Number(row.context) || 0;
      const fallback = Number(row.fallback) || 0;
      const legacy = Number(row.legacy) || 0;
      const native = Number(row.native) || 0;
      const old = Number(row.old) || 0;
      totals.outcome += outcome;
      totals.context += context;
      totals.fallback += fallback;
      totals.legacy += legacy;
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      bucket.outcome = outcome;
      bucket.context = context;
      bucket.fallback = fallback;
      bucket.legacy = legacy;
      bucket.era = native && old ? 'mixed' : native ? 'v2.1' : old ? 'legacy' : null;
    }
    totals.memories = totals.outcome + totals.context;

    let cards: any[] = [];
    let nextCursor: string | null = null;
    if (normalized.limit > 0) {
      const fetched = rowsOf('cards');
      const page = fetched.length > normalized.limit ? fetched.slice(0, normalized.limit) : fetched;
      cards = page.map(activityCard);
      if (fetched.length > normalized.limit && page.length) {
        const last = page[page.length - 1];
        nextCursor = Buffer.from(JSON.stringify({ t: last.cursor_time, r: Number(last.cursor_rowid) })).toString('base64url');
      }
    }

    const breakdownRows: Array<{
      project_path: string; agent_id: string; outcome: number; context: number; fallback: number; legacy: number;
    }> = rowsOf('breakdown').map((row: any) => ({
      project_path: String(row.project_path ?? ''),
      agent_id: String(row.agent_id ?? ''),
      outcome: Number(row.outcome) || 0,
      context: Number(row.context) || 0,
      fallback: Number(row.fallback) || 0,
      legacy: Number(row.legacy) || 0,
    }));
    const breakdown = collapseListedAgents(breakdownRows, {
      groupBy: (row) => row.project_path,
      sum: ['outcome', 'context', 'fallback', 'legacy'],
    }).sort((a, b) => {
      const left = a.outcome + a.context + a.legacy;
      const right = b.outcome + b.context + b.legacy;
      if (left !== right) return right - left;
      if (a.project_path !== b.project_path) return a.project_path < b.project_path ? -1 : 1;
      return a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0;
    });

    return {
      from: normalized.fromIso,
      to: normalized.toIso,
      tz_offset_minutes: normalized.offset,
      totals,
      breakdown,
      days: dayList.map((day) => byDay.get(day)!),
      cards,
      next_cursor: nextCursor,
    };
  }

  /** EXPLAIN QUERY PLAN of each getAdminActivity query, using that method's SQL. */
  public explainAdminActivity(options: {
    from: string; to: string; tzOffsetMinutes?: number; project?: string; agent?: string;
    kind?: 'typed' | 'legacy' | 'all'; limit?: number; cursor?: string | null;
  }): { name: string; plan: string }[] {
    if (!this.db) throw new Error('Database not initialized');
    const queries = buildAdminActivityQueries(normalizeAdminActivity(options));
    return queries.map((query) => ({
      name: query.name,
      plan: this.db.all(`EXPLAIN QUERY PLAN ${query.sql}`, query.params).map((row: any) => row.detail).join('\n'),
    }));
  }

  /**
   * Read-only Memory list. Cards share Activity's column list. Stats are the first page only
   * and are cached per process until the observation or task_results rowid moves.
   */
  public async getAdminMemories(options: AdminMemoriesOptions = {}) {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = normalizeAdminMemories(options);
    const wantStats = !normalized.cursor && normalized.stats;
    const stats = wantStats ? this.loadAdminMemoriesStats(normalized) : null;
    const cards = memoriesCardMode(normalized, stats ? stats.total : null);
    let items: any[] = [];
    let nextCursor: string | null = null;
    if (cards !== 'skip') {
      const cardQuery = memoriesQueryByName(
        buildAdminMemoriesQueries(normalized, { stats: false, cards, dayRange: null }),
        'cards',
      );
      const fetched = this.db.all(cardQuery.sql, cardQuery.params);
      const page = fetched.length > normalized.limit ? fetched.slice(0, normalized.limit) : fetched;
      items = page.map(memoriesItem);
      if (fetched.length > normalized.limit && page.length) {
        const last = page[page.length - 1];
        nextCursor = Buffer.from(JSON.stringify({
          t: last.cursor_time,
          r: Number(last.cursor_rowid),
          f: normalized.filterHash,
        })).toString('base64url');
      }
    }
    let days: Array<{ day: string; count: number }> = [];
    if (items.length && !normalized.cursor && !nextCursor) {
      // The first page holds every match, so its own items are the whole-day counts; skip the range query.
      const counts = new Map<string, number>();
      for (const item of items) counts.set(item.day, (counts.get(item.day) || 0) + 1);
      days = [...counts].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    } else if (items.length) {
      const dayRange = memoriesPageDayRange(items, normalized);
      if (dayRange) {
        const dayQuery = memoriesQueryByName(
          buildAdminMemoriesQueries(normalized, { stats: false, cards: 'skip', dayRange }),
          'days',
        );
        days = this.db.all(dayQuery.sql, dayQuery.params).map((row: any) => ({
          day: row.day,
          count: Number(row.count) || 0,
        }));
      }
    }
    return {
      status: 'ok' as const,
      disabled: false,
      generated_at: new Date().toISOString(),
      filters: {
        query: normalized.query,
        project: normalized.project ?? null,
        agent: normalized.agent ?? null,
        kind: normalized.kind,
        source: normalized.source,
        from: normalized.fromIso,
        to: normalized.toIso,
        tz_offset_minutes: normalized.offset,
      },
      items,
      next_cursor: nextCursor,
      days,
      stats,
    };
  }

  /** EXPLAIN QUERY PLAN of the SQL getAdminMemories would run, including the card-plan choice. */
  public explainAdminMemories(options: AdminMemoriesOptions = {}): { name: string; plan: string }[] {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = normalizeAdminMemories(options);
    const wantStats = !normalized.cursor && normalized.stats;
    const total = wantStats ? this.computeAdminMemoriesStats(normalized).total : null;
    const queries = buildAdminMemoriesQueries(normalized, {
      stats: wantStats,
      cards: memoriesCardMode(normalized, wantStats ? total : null),
      dayRange: null,
    });
    return queries.map((query) => ({
      name: query.name,
      plan: this.db.all(`EXPLAIN QUERY PLAN ${query.sql}`, query.params).map((row: any) => row.detail).join('\n'),
    }));
  }

  private loadAdminMemoriesStats(input: NormalizedAdminMemories): AdminMemoriesStats {
    const obsMax = this.db.get(`SELECT MAX(rowid) AS n FROM observations`)?.n ?? null;
    const taskMax = this.db.get(`SELECT MAX(rowid) AS n FROM task_results`)?.n ?? null;
    const key = `${input.filterHash}:${obsMax}:${taskMax}`;
    const cached = this.takeMemoriesStats(key);
    if (cached) return cached;
    const stats = this.computeAdminMemoriesStats(input);
    this.storeMemoriesStats(key, stats);
    return cloneMemoriesStats(stats, false);
  }

  private computeAdminMemoriesStats(input: NormalizedAdminMemories): AdminMemoriesStats {
    const queries = buildAdminMemoriesQueries(input, { stats: true, cards: 'skip', dayRange: null });
    if (input.query) {
      const groupedQuery = memoriesQueryByName(queries, 'grouped_stats');
      const grouped = this.db.all(groupedQuery.sql, groupedQuery.params);
      const kinds = { outcome: 0, context: 0, legacy: 0, fallback: 0 };
      const projects: Array<{ project_path: string; count: number }> = [];
      const chosen = (row: any) => input.kind.reduce((n, kind) => n + (Number(row[kind]) || 0), 0);
      let total = 0;
      for (const row of grouped) {
        if (!input.project || Number(row.selected) === 1) {
          kinds.outcome += Number(row.outcome) || 0;
          kinds.context += Number(row.context) || 0;
          kinds.legacy += Number(row.legacy) || 0;
          kinds.fallback += Number(row.fallback) || 0;
          total += chosen(row);
        }
        const count = chosen(row);
        if (count > 0) projects.push({ project_path: row.project_path, count });
      }
      projects.sort((a, b) => b.count - a.count
        || (a.project_path.toLowerCase() < b.project_path.toLowerCase() ? -1 : a.project_path.toLowerCase() > b.project_path.toLowerCase() ? 1 : 0));
      return { total, kinds, top_projects: projects.slice(0, 5), cached: false };
    }
    const totals = memoriesQueryByName(queries, 'stats');
    const projects = memoriesQueryByName(queries, 'top_projects');
    const row = this.db.get(totals.sql, totals.params) || {};
    return {
      total: Number(row.total) || 0,
      kinds: {
        outcome: Number(row.outcome) || 0,
        context: Number(row.context) || 0,
        legacy: Number(row.legacy) || 0,
        fallback: Number(row.fallback) || 0,
      },
      top_projects: this.db.all(projects.sql, projects.params).map((item: any) => ({
        project_path: item.project_path,
        count: Number(item.count) || 0,
      })),
      cached: false,
    };
  }

  private takeMemoriesStats(key: string): AdminMemoriesStats | null {
    const entry = this.memoriesStatsCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at >= MEMORIES_STATS_CACHE_TTL_MS) {
      this.memoriesStatsCache.delete(key);
      return null;
    }
    this.memoriesStatsCache.delete(key);
    this.memoriesStatsCache.set(key, entry);
    return cloneMemoriesStats(entry.value, true);
  }

  private storeMemoriesStats(key: string, stats: AdminMemoriesStats): void {
    if (this.memoriesStatsCache.has(key)) this.memoriesStatsCache.delete(key);
    this.memoriesStatsCache.set(key, { at: Date.now(), value: stats });
    while (this.memoriesStatsCache.size > MEMORIES_STATS_CACHE_MAX) {
      const oldest = this.memoriesStatsCache.keys().next().value;
      if (oldest === undefined) break;
      this.memoriesStatsCache.delete(oldest);
    }
  }

  /**
   * Read-only Activity detail for one memory. Null when no observation has this id.
   * Review trace documents are selected only when includeTrace is set, and each is capped at 64 KiB.
   */
  public async getAdminMemoryDetail(id: string, options: { includeTrace?: boolean } = {}): Promise<AdminMemoryDetail | null> {
    if (!this.db) throw new Error('Database not initialized');
    const includeTrace = options.includeTrace === true;
    // fb is not named r: the compacted_into subquery is the getWorkOverview text and owns alias r.
    const row = this.db.get(
      `SELECT o.id, o.session_id, o.project_path, o.agent_id, o.created_at, o.title, o.narrative,
          o.facts, o.concepts, o.files_read, o.files_modified,
          CASE WHEN m.record_kind IN ('outcome','context') THEN m.record_kind ELSE 'legacy' END AS kind,
          m.source_kind AS source,
          CASE WHEN m.record_kind IN ('outcome','context') AND fb.status='fallback' THEN 1 ELSE 0 END AS fallback,
          (SELECT r.observation_id FROM legacy_compaction_links l JOIN task_results r ON r.id=l.task_result_id
            WHERE l.legacy_observation_id=o.id AND r.observation_id IS NOT NULL LIMIT 1) AS compacted_into
        FROM observations o
        LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
        LEFT JOIN task_results fb ON fb.id=o.id
        WHERE o.id=?`,
      [id],
    );
    if (!row) return null;

    const tasks = this.db.all(ADMIN_MEMORY_DETAIL_TASKS_SQL, [id]).map((task: any) => ({
      id: task.id,
      task_id: task.task_id,
      segment_index: Number(task.segment_index),
      segment_count: Number(task.segment_count),
      event_count: Number(task.event_count),
      evidence_count: Number(task.evidence_count),
      status: task.status,
      trigger: task.trigger,
      llm_calls: Number(task.llm_calls),
      source_kind: task.source_kind,
      // Redact the whole stored error, then clip, so a clip never leaves part of a credential.
      last_error: clipRedacted(task.last_error, 300),
      created_at: task.created_at,
    }));
    const duplicateFlags = this.db.all(
      `SELECT id, task_id, status, reason FROM duplicate_flags WHERE observation_id=? ORDER BY created_ms, id LIMIT 100`,
      [id],
    ).map((flag: any) => ({
      id: flag.id,
      task_id: flag.task_id,
      status: flag.status,
      reason: flag.reason ?? null,
    }));
    const reviewRow = this.db.get(
      includeTrace
        ? `SELECT id, status, query_text, matched_skill_titles_json, recommendation_states_json, generated_at,
              bounded_context_json, decision_trace_json, temporal_diagnostics_json
            FROM post_task_reviews WHERE source_observation_id=?`
        : `SELECT id, status, query_text, matched_skill_titles_json, recommendation_states_json, generated_at
            FROM post_task_reviews WHERE source_observation_id=?`,
      [id],
    );
    let review: AdminMemoryDetail['review'] = null;
    if (reviewRow) {
      review = {
        id: reviewRow.id,
        status: reviewRow.status,
        query_text: reviewRow.query_text,
        matched_skill_titles: parseJsonArrayOrEmpty(reviewRow.matched_skill_titles_json),
        recommendation_states: parseJsonArrayOrEmpty(reviewRow.recommendation_states_json),
        generated_at: reviewRow.generated_at,
      };
      if (includeTrace) {
        review.bounded_context = boundedJsonText(reviewRow.bounded_context_json);
        review.decision_trace = boundedJsonText(reviewRow.decision_trace_json);
        review.temporal_diagnostics = boundedJsonText(reviewRow.temporal_diagnostics_json);
      }
    }

    const kind = row.kind === 'outcome' || row.kind === 'context' ? row.kind : 'legacy';
    return {
      memory: {
        id: row.id,
        session_id: row.session_id,
        project_path: row.project_path,
        agent_id: row.agent_id,
        created_at: row.created_at,
        kind,
        source: row.source ?? null,
        fallback: Number(row.fallback) === 1,
        title: row.title,
        narrative: row.narrative,
        facts: parseJsonArrayOrEmpty(row.facts),
        concepts: parseJsonArrayOrEmpty(row.concepts),
        files_read: parseJsonArrayOrEmpty(row.files_read),
        files_modified: parseJsonArrayOrEmpty(row.files_modified),
      },
      tasks,
      duplicate_flags: duplicateFlags,
      review,
      compacted_into: row.compacted_into ?? null,
      evidence_available: tasks.length > 0,
    };
  }

  /** Read-only SQL access for additive task/review stores. */
  public sqlAll(sql: string, values: any[] = []): any[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.all(sql, values);
  }
  public sqlGet(sql: string, values: any[] = []): any {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.get(sql, values);
  }
  /** Serialized write transaction for additive task/review stores. */
  public async sqlWrite<T>(operation: (db: { run: (sql: string, values?: any[]) => any; get: (sql: string, values?: any[]) => any; all: (sql: string, values?: any[]) => any[] }) => T): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    return this.write(() => operation(this.db));
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public getDatabaseDiagnostics() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.diagnostics();
  }

  private async write<T>(operation: () => T): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    return retrySqliteBusy(() => this.db.transaction(operation));
  }

  private async persistRuntimePolicy(
    policy: Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'>
  ): Promise<RuntimeMemoryPolicy> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      this.db.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
        [
          RUNTIME_MEMORY_POLICY_KEY,
          JSON.stringify({
            readEnabled: policy.readEnabled,
            writeEnabled: policy.writeEnabled,
          }),
        ]
      );

      const row = this.db.get(
        `SELECT value, updated_at FROM app_settings WHERE key = ?`,
        [RUNTIME_MEMORY_POLICY_KEY]
      ) as any;
      const parsed = JSON.parse(row.value);

      return {
        readEnabled: parsed.readEnabled !== false,
        writeEnabled: parsed.writeEnabled !== false,
        updatedAt: row.updated_at,
      };
    });
  }

  private async persistDailyDigestSchedulerConfig(
    config: Omit<DailyDigestSchedulerConfig, 'updatedAt'>
  ): Promise<DailyDigestSchedulerConfig> {
    if (!this.db) throw new Error('Database not initialized');

    return this.write(() => {
      const normalized = normalizeDailyDigestSchedulerConfig(config);

      this.db.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
        [
          DAILY_DIGEST_SCHEDULER_CONFIG_KEY,
          JSON.stringify({
            enabled: normalized.enabled,
            lookback_days: normalized.lookback_days,
            schedule_time: normalized.schedule_time,
            time_zone: normalized.time_zone,
          }),
        ]
      );

      const row = this.db.get(
        `SELECT value, updated_at FROM app_settings WHERE key = ?`,
        [DAILY_DIGEST_SCHEDULER_CONFIG_KEY]
      ) as any;

      return this.parseDailyDigestSchedulerConfigRow(row);
    });
  }

  private parseDailyDigestSchedulerConfigRow(row: any): DailyDigestSchedulerConfig {
    const parsed = JSON.parse(row.value);
    const normalized = normalizeDailyDigestSchedulerConfig({
      enabled: parsed.enabled !== false,
      lookback_days: parsed.lookback_days,
      schedule_time: parsed.schedule_time,
      time_zone: parsed.time_zone,
    });

    return {
      ...normalized,
      updatedAt: row.updated_at,
    };
  }

  private parseObservation(row: any): Observation {
    return {
      id: row.id,
      session_id: row.session_id,
      project_path: row.project_path,
      agent_id: row.agent_id,
      title: row.title,
      narrative: row.narrative,
      facts: JSON.parse(row.facts),
      concepts: JSON.parse(row.concepts),
      files_read: JSON.parse(row.files_read),
      files_modified: JSON.parse(row.files_modified),
      embedding: JSON.parse(row.embedding),
      created_at: row.created_at,
    };
  }

  private parseStateFact(row: any): StateFact {
    return {
      id: row.id,
      project_path: row.project_path,
      entity_type: row.entity_type,
      entity_key: row.entity_key,
      fact_key: row.fact_key,
      value: JSON.parse(row.value_json),
      value_json: row.value_json,
      effective_at: row.effective_at,
      recorded_at: row.recorded_at,
      superseded_at: row.superseded_at,
    };
  }

  private parseDailyMemoryDigest(row: any): DailyMemoryDigest {
    return {
      id: row.id,
      project_path: row.project_path,
      local_date: row.local_date,
      status: row.status,
      digest: row.digest_json ? JSON.parse(row.digest_json) : null,
      digest_json: row.digest_json,
      source_observation_ids: JSON.parse(row.source_observation_ids),
      source_count: Number(row.source_count || 0),
      model: row.model,
      prompt_version: row.prompt_version,
      generated_at: row.generated_at,
      reviewed_at: row.reviewed_at,
      last_error: row.last_error,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private parseProceduralSkill(row: any): ProceduralSkill {
    return {
      id: row.id,
      project_path: row.project_path,
      title: row.title,
      summary: row.summary,
      trigger_text: row.trigger_text,
      steps: JSON.parse(row.steps_json),
      tags: JSON.parse(row.tags_json),
      status: normalizeProceduralSkillStatus(row.status),
      confidence: normalizeConfidence(row.confidence),
      source_digest_id: row.source_digest_id,
      source_observation_ids: JSON.parse(row.source_observation_ids),
      success_count: Number(row.success_count || 0),
      failure_count: Number(row.failure_count || 0),
      last_used_at: row.last_used_at,
      embedding: JSON.parse(row.embedding),
      created_at: row.created_at,
      updated_at: row.updated_at,
      retired_at: row.retired_at,
    };
  }

  private parseProceduralSkillFeedback(row: any): ProceduralSkillFeedback {
    return {
      id: row.id,
      skill_id: row.skill_id,
      project_path: row.project_path,
      outcome: normalizeProceduralSkillFeedbackOutcome(row.outcome),
      task_text: row.task_text,
      notes: row.notes,
      created_at: row.created_at,
    };
  }

  private parsePostTaskReview(row: any): PostTaskReview {
    return {
      id: row.id,
      project_path: row.project_path,
      source_observation_id: row.source_observation_id,
      source_session_id: row.source_session_id,
      source_agent_id: row.source_agent_id,
      source_title: row.source_title,
      query_text: row.query_text,
      status: 'open',
      matched_skill_titles: JSON.parse(row.matched_skill_titles_json),
      recommendation_states: JSON.parse(row.recommendation_states_json),
      bounded_context: JSON.parse(row.bounded_context_json),
      decision_trace: JSON.parse(row.decision_trace_json),
      temporal_diagnostics: JSON.parse(row.temporal_diagnostics_json),
      generated_at: row.generated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async hydrateProceduralSkillFeedbackState(
    skill: ProceduralSkill,
    asOf?: string
  ): Promise<ProceduralSkill> {
    const feedbackRows = await this.listProceduralSkillFeedback({
      skillId: skill.id,
      projectPath: skill.project_path,
      asOf,
    });
    const feedbackSummary = this.summarizeProceduralSkillFeedback(feedbackRows);

    return {
      ...skill,
      success_count: feedbackSummary.success,
      failure_count: feedbackSummary.failure,
      last_used_at: feedbackSummary.last_feedback_at,
      feedback_summary: feedbackSummary,
      feedback_history: feedbackRows.slice(0, 5),
    };
  }

  private summarizeProceduralSkillFeedback(feedbackRows: ProceduralSkillFeedback[]) {
    const summary = {
      success: 0,
      failure: 0,
      rejected: 0,
      skipped: 0,
      total: feedbackRows.length,
      last_feedback_at: feedbackRows[0]?.created_at || null,
      last_outcome: feedbackRows[0]?.outcome || null,
    };

    for (const row of feedbackRows) {
      summary[row.outcome] += 1;
    }

    return summary;
  }

  private recordProceduralSkillStatusEvent(
    skillId: string,
    projectPath: string,
    status: ProceduralSkillStatus,
    effectiveAt: string
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO procedural_skill_status_events (
        id,
        skill_id,
        project_path,
        status,
        effective_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), skillId, projectPath, status, effectiveAt]
    );
  }

  private getProceduralSkillStatusEventMap(skillIds: string[]): Map<string, ProceduralSkillStatusEvent[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (skillIds.length === 0) {
      return new Map();
    }

    const placeholders = skillIds.map(() => '?').join(', ');
    const rows = this.db.all(
      `SELECT skill_id, status, effective_at
       FROM procedural_skill_status_events
       WHERE skill_id IN (${placeholders})
       ORDER BY effective_at ASC`,
      skillIds
    ) as any[];

    const events = new Map<string, ProceduralSkillStatusEvent[]>();
    for (const row of rows) {
      const skillEvents = events.get(row.skill_id) || [];
      skillEvents.push({
        effective_at: row.effective_at,
        status: normalizeProceduralSkillStatus(row.status),
      });
      events.set(row.skill_id, skillEvents);
    }
    return events;
  }

  private resolveProceduralSkillStatusAsOf(
    skill: ProceduralSkill,
    events: ProceduralSkillStatusEvent[],
    asOf: string
  ): { effective_at: string | null; status: ProceduralSkillStatus } | null {
    if (!isTimestampOnOrBefore(skill.created_at, asOf)) {
      return null;
    }

    let resolvedStatus: ProceduralSkillStatus | null = null;
    let resolvedEffectiveAt: string | null = null;
    for (const event of events) {
      if (isTimestampOnOrBefore(event.effective_at, asOf)) {
        resolvedStatus = event.status;
        resolvedEffectiveAt = event.effective_at;
      }
    }

    if (resolvedStatus) {
      return {
        status: resolvedStatus,
        effective_at: resolvedEffectiveAt,
      };
    }

    return this.canTrustProceduralSkillWithoutStatusHistory(skill)
      ? {
          status: skill.status,
          effective_at: skill.created_at,
        }
      : null;
  }

  private getLatestProceduralSkillStatusEffectiveAt(
    events: ProceduralSkillStatusEvent[],
    skill: ProceduralSkill
  ): string {
    if (events.length === 0) {
      return skill.created_at;
    }
    return events[events.length - 1].effective_at;
  }

  private canTrustProceduralSkillWithoutStatusHistory(skill: ProceduralSkill): boolean {
    return (
      timestampsEqual(skill.created_at, skill.updated_at) &&
      skill.last_used_at === null &&
      skill.retired_at === null
    );
  }

  private normalizeProjectPath(projectPath: string): string {
    return path.resolve(projectPath).replace(/\\/g, '/');
  }

  private escapeLike(input: string): string {
    return escapeLikePattern(input);
  }
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeProceduralSkillStatus(value: unknown): ProceduralSkillStatus {
  const normalized = String(value || 'draft').toLowerCase();
  switch (normalized) {
    case 'enabled':
    case 'disabled':
    case 'retired':
      return normalized;
    default:
      return 'draft';
  }
}

function normalizeProceduralSkillFeedbackOutcome(value: unknown): ProceduralSkillFeedbackOutcome {
  const normalized = String(value || 'skipped').toLowerCase();
  switch (normalized) {
    case 'success':
    case 'failure':
    case 'rejected':
      return normalized;
    default:
      return 'skipped';
  }
}

function tokenizeForOverlap(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function calculateTokenOverlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) {
      matches += 1;
    }
  }
  return matches / queryTokens.length;
}

function compareProceduralSkillsByRecency(left: ProceduralSkill, right: ProceduralSkill): number {
  const updatedComparison = compareTimestamps(right.updated_at, left.updated_at);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return compareTimestamps(right.created_at, left.created_at);
}
