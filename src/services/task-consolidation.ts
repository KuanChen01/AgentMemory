import { createHash } from 'node:crypto';
import { incompleteToolSource } from './tool-log-policy';
import { randomUUID } from 'crypto';
import { DatabaseManager, Observation } from './db';
import { boundedEnvInteger } from './llm-budget';
import { callLlmJson, llmAvailable, resolveLlmSettings } from './llm-client';
import { interpretWorkMemory, synthesizeEnglishWorkMemory, WORK_MEMORY_PROMPT } from './work-memory';
import { modifiedFiles, summaryHash, summaryHashV2 } from './event-classifier';
import { getEmbedding } from './embedding';
import { runAutomaticPostTaskReview } from './post-task-review';

/**
 * Simplified task pipeline (claude-mem style):
 *  - rules only drop whole tool classes (see event-classifier); everything else is buffered as-is;
 *  - hooks are the only capture source; a task is frozen at the next user prompt, session close or 20-min idle;
 *  - the whole task is sent to the model ONCE; very large tasks keep head + tail with an explicit
 *    "omitted N chars" marker (never segmented);
 *  - every tool call and every task has a unique id with insert-once semantics, so hook retries
 *    are idempotent;
 *  - an identical summary is linked, not saved twice, and flagged for human confirmation.
 */
export interface IncomingToolEvent {
  id: string; session_id: string; project_path: string; agent_id: string; tool_name: string;
  input: string; output: string; success: boolean; timestamp: number;
  /** Set only by the import path: `timestamp` is the original event time, not the arrival time. */
  imported?: boolean;
}
export type TaskTrigger = 'user_prompt' | 'turn_end' | 'session_close' | 'idle_timeout' | 'manual' | 'legacy_compaction';

export function taskIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  // AGENTMEM_TASK_IDLE_MS exists for bounded tests; users configure minutes (default 20).
  const ms = Number(env.AGENTMEM_TASK_IDLE_MS);
  if (env.AGENTMEM_TASK_IDLE_MS?.trim() && Number.isFinite(ms) && ms >= 100) return Math.trunc(ms);
  return boundedEnvInteger(env.AGENTMEM_TASK_IDLE_MINUTES, 20, 1, 24 * 60) * 60_000;
}
/** Character budget of the single per-task prompt body (head + tail beyond it). */
export function taskCharBudget(env: NodeJS.ProcessEnv = process.env): number {
  return boundedEnvInteger(env.AGENTMEM_TASK_PROMPT_CHARS ?? env.AGENTMEM_TASK_SEGMENT_CHARS, 24000, 4000, 200000);
}
export const MAX_TASK_ATTEMPTS = 5;
const EVENT_INPUT_MAX = 30000;
const EVENT_OUTPUT_MAX = 60000;

/** Buffer one tool call. Insert-once: a re-delivered call id (hook retry) is ignored. */
export async function bufferEvent(db: DatabaseManager, ev: IncomingToolEvent): Promise<boolean> {
  const input = String(ev.input ?? ''), output = String(ev.output ?? '');
  // Over-size at capture OR a tool's own truncation marker ('Warning: truncated output', ...) = incomplete source.
  const incomplete = incompleteToolSource(input, output, EVENT_INPUT_MAX, EVENT_OUTPUT_MAX);
  const values = [ev.id, ev.session_id, ev.project_path, ev.agent_id, ev.tool_name, ev.success ? 1 : 0,
    keepHeadTail(input, EVENT_INPUT_MAX), keepHeadTail(output, EVENT_OUTPUT_MAX), incomplete ? 1 : 0, ev.timestamp];
  // Imported events keep their original time in received_ms AND created_at (day bucketing, hash day); the wall-clock
  // arrival goes to import_arrival_ms, which only the idle sweep reads.
  const res: any = await db.sqlWrite(sql => ev.imported
    ? sql.run(`INSERT OR IGNORE INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,
      input,output,incomplete,received_ms,created_at,import_arrival_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...values, sqlTimeMs(ev.timestamp), Date.now()])
    : sql.run(`INSERT OR IGNORE INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,
      input,output,incomplete,received_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`, values));
  return (res?.changes || 0) > 0;
}
const CAPTURE_MARKER = /\[\.\.\. omitted (\d+) chars at capture \.\.\.\]/g;
/** Oversized text keeps its head (2/3) and tail (1/3): final results/verification at the end are never lost. */
export function keepHeadTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 2 / 3), tail = max - head;
  return `${text.slice(0, head)}\n[... omitted ${text.length - head - tail} chars at capture ...]\n${text.slice(text.length - tail)}`;
}
function captureOmitted(rows: any[]): number {
  let n = 0;
  for (const r of rows) for (const f of [r.input, r.output]) for (const m of String(f ?? '').matchAll(CAPTURE_MARKER)) n += Number(m[1]);
  return n;
}
/** Back-compat alias used by older callers/tests. */
export const bufferCandidate = bufferEvent;

/** After a crash, legacy in-flight claims become frozen tasks again (retried, never lost). */
export async function recoverInterruptedClaims(db: DatabaseManager): Promise<number> {
  return db.sqlWrite(sql => sql.run(`UPDATE task_event_buffer SET task_result_id='task:' || substr(task_result_id, 7)
    WHERE task_result_id LIKE 'claim:%'`).changes || 0);
}

/** SQLite CURRENT_TIMESTAMP format (UTC, second precision) for an epoch-ms instant. */
export function sqlTimeMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Sessions with open events whose last activity (including legacy evidence rows) is older than cutoff.
 * Imported events count by their wall-clock arrival, so an import in progress is never idle-closed because its
 * original times are old; the task's times still come from the events (see consolidateTask).
 */
export function openSessionsIdleSince(db: DatabaseManager, cutoffMs: number): string[] {
  return db.sqlAll(`SELECT session_id FROM (
      SELECT session_id, COALESCE(import_arrival_ms, received_ms) AS ms, (task_result_id IS NULL) AS open FROM task_event_buffer
      UNION ALL SELECT session_id, received_ms, (task_id IS NULL) FROM tool_evidence)
    GROUP BY session_id HAVING SUM(open) > 0 AND MAX(ms) <= ?`, [cutoffMs]).map(r => r.session_id);
}

/**
 * Whole-task completion. A task is complete when task_completions records it with a real
 * completion time. Rows backfilled by the aeb72af migration (completed_ms = 0) only count as
 * complete when nothing is left: no frozen events, legacy segmented rows all resolved, and either a saved
 * observation or (no legacy evidence and every result row is a deliberate skip).
 */
export const TASK_COMPLETE_SQL = (alias: string) => `EXISTS (SELECT 1 FROM task_completions c WHERE c.task_id = ${alias} AND (c.completed_ms > 0
  OR (NOT EXISTS (SELECT 1 FROM task_event_buffer b WHERE b.task_result_id = 'task:' || ${alias})
      AND NOT EXISTS (SELECT 1 FROM task_results r WHERE r.task_id = ${alias} AND r.segment_count > 1
        AND (r.observation_id IS NULL AND r.status NOT IN ('skipped','duplicate')))
      AND EXISTS (SELECT 1 FROM task_results r WHERE r.task_id = ${alias} AND r.observation_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM tool_evidence e WHERE e.task_id = ${alias} AND NOT EXISTS
        (SELECT 1 FROM task_results r WHERE r.task_id = ${alias} AND r.segment_count = 1 AND r.observation_id IS NOT NULL)))
  OR (NOT EXISTS (SELECT 1 FROM tool_evidence e WHERE e.task_id = ${alias})
      AND NOT EXISTS (SELECT 1 FROM task_event_buffer b WHERE b.task_result_id = 'task:' || ${alias})
      AND NOT EXISTS (SELECT 1 FROM task_results r WHERE r.task_id = ${alias} AND r.status NOT IN ('skipped','duplicate')))))`;

/** Frozen tasks waiting for (re)consolidation, excluding those that exhausted their attempts. */
export function frozenTasks(db: DatabaseManager): { task_id: string; session_id: string }[] {
  return db.sqlAll(`SELECT t.task_id, t.session_id FROM (
      SELECT DISTINCT substr(task_result_id, 6) AS task_id, session_id FROM task_event_buffer WHERE task_result_id LIKE 'task:%'
      UNION SELECT DISTINCT task_id, session_id FROM tool_evidence WHERE task_id IS NOT NULL
      UNION SELECT DISTINCT task_id, session_id FROM task_results WHERE source_kind = 'task') t
    LEFT JOIN task_attempts a ON a.task_id = t.task_id
    WHERE COALESCE(a.attempts, 0) < ? AND NOT ${TASK_COMPLETE_SQL('t.task_id')}`, [MAX_TASK_ATTEMPTS]);
}

const STUCK_FLOOR_MS = 24 * 60 * 60 * 1000;

/**
 * A task is stale only after it has been quiet longer than a real idle/retry cycle.
 * The floor is 24h, so a task still inside the idle window is never stale.
 */
export function stuckStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(STUCK_FLOOR_MS, 2 * taskIdleMs(env) + taskRetryMs(env));
}

export interface TaskPipelineSqlOpts {
  nowMs: number;
  /** JSON array of in-flight task ids. Bound once and read with json_each. */
  inflightJson: string;
  staleMs: number;
}

/**
 * Statement-level CTE body (no leading WITH) ending in `pipeline_tasks`: one lean row per task id with the
 * aggregate fields, `state`, `stuck_reason` and `partial`. Detail fields (trigger, observation, errors, title) are
 * looked up per page row by the caller. Task ids are a UNION of the four sources; each source is aggregated once
 * (GROUP BY) and LEFT JOINed, and every side table may be absent for a task. The only per-task correlated probe is
 * TASK_COMPLETE_SQL. Open/closed is never inferred by comparing completion time with result times.
 */
export function taskPipelineSql(opts: TaskPipelineSqlOpts): { sql: string; params: any[] } {
  const ms = (col: string) => `CAST(ROUND((julianday(${col}) - 2440587.5) * 86400000) AS INTEGER)`;
  // Partial: unfinished segment rows that will never be retried. Either the task is complete, or it was closed
  // (a task_completions row, even a backfilled 0) and frozenTasks cannot pick it up again. Never stuck.
  const partial = `(pending_segments > 0 AND (is_complete = 1 OR (is_closed = 1 AND is_retriable = 0)))`;
  const stale = `(updated_ms IS NOT NULL AND (? - updated_ms) > ?)`;
  const sql = `inflight_ids AS MATERIALIZED (SELECT DISTINCT value AS task_id FROM json_each(?)),
    buf_frozen AS MATERIALIZED (
      SELECT substr(task_result_id, 6) AS task_id, COUNT(*) AS n, MIN(received_ms) AS min_ms, MAX(received_ms) AS max_ms,
        session_id, project_path, agent_id
      FROM task_event_buffer WHERE task_result_id >= 'task:' AND task_result_id < 'task;' GROUP BY task_result_id
    ),
    buf_done AS MATERIALIZED (
      SELECT r.task_id, SUM(g.n) AS n, MIN(g.min_ms) AS min_ms, MAX(g.max_ms) AS max_ms
      FROM (SELECT task_result_id, COUNT(*) AS n, MIN(received_ms) AS min_ms, MAX(received_ms) AS max_ms FROM task_event_buffer
            WHERE task_result_id IS NOT NULL AND NOT (task_result_id >= 'task:' AND task_result_id < 'task;') GROUP BY task_result_id) g
      JOIN task_results r ON r.id = g.task_result_id GROUP BY r.task_id
    ),
    ev_agg AS MATERIALIZED (
      SELECT task_id, COUNT(*) AS n, MIN(received_ms) AS min_ms, MAX(received_ms) AS max_ms, session_id, project_path, agent_id
      FROM tool_evidence WHERE task_id IS NOT NULL GROUP BY task_id
    ),
    res_first AS MATERIALIZED (
      SELECT task_id, session_id, project_path, agent_id, MIN(segment_index) AS first_segment FROM task_results GROUP BY task_id
    ),
    res_agg AS MATERIALIZED (
      SELECT task_id, COUNT(*) AS result_rows, COALESCE(SUM(llm_calls), 0) AS llm_calls, COALESCE(MAX(segment_count), 0) AS segment_count,
        SUM(CASE WHEN status NOT IN ('saved', 'fallback', 'duplicate', 'skipped') THEN 1 ELSE 0 END) AS pending_segments,
        SUM(CASE WHEN status NOT IN ('saved', 'fallback', 'duplicate', 'skipped') AND TRIM(COALESCE(last_error, '')) <> '' THEN 1 ELSE 0 END) AS pending_errors,
        MAX(source_kind = 'legacy_compacted') AS any_legacy, MAX(source_kind = 'task') AS any_task_source,
        MAX(status = 'fallback') AS any_fallback, MAX(status = 'saved') AS any_saved, MAX(status = 'duplicate') AS any_duplicate,
        MIN(${ms('created_at')}) AS min_ms, MAX(${ms('created_at')}) AS max_ms
      FROM task_results GROUP BY task_id
    ),
    task_ids AS MATERIALIZED (
      SELECT task_id FROM buf_frozen UNION SELECT task_id FROM buf_done UNION SELECT task_id FROM ev_agg
      UNION SELECT task_id FROM res_agg UNION SELECT task_id FROM task_attempts
    ),
    pipeline_core AS (
      SELECT ids.task_id,
        COALESCE(rf.session_id, bf.session_id, ev.session_id, a.session_id) AS session_id,
        COALESCE(rf.project_path, bf.project_path, ev.project_path) AS project_path,
        COALESCE(rf.agent_id, bf.agent_id, ev.agent_id) AS agent_id,
        CASE WHEN res.any_legacy = 1 THEN 'legacy_compacted' ELSE 'task' END AS source_kind,
        NULLIF(MIN(COALESCE(bf.min_ms, 9e18), COALESCE(bd.min_ms, 9e18), COALESCE(ev.min_ms, 9e18), COALESCE(res.min_ms, 9e18)), 9e18) AS created_ms,
        NULLIF(MAX(COALESCE(bf.max_ms, -1), COALESCE(bd.max_ms, -1), COALESCE(ev.max_ms, -1), COALESCE(res.max_ms, -1),
          /* completed: its completion (imported: the original end); failed-attempt wall-clock time counts only while open */
          CASE WHEN c.completed_ms > 0 THEN c.completed_ms ELSE COALESCE(a.updated_ms, -1) END), -1) AS updated_ms,
        COALESCE(a.attempts, 0) AS attempts, COALESCE(res.llm_calls, 0) AS llm_calls, COALESCE(res.segment_count, 0) AS segment_count,
        COALESCE(res.result_rows, 0) AS result_rows,
        COALESCE(bf.n, 0) + COALESCE(bd.n, 0) + COALESCE(ev.n, 0) AS evidence_count,
        COALESCE(res.pending_segments, 0) AS pending_segments, COALESCE(res.pending_errors, 0) AS pending_errors,
        COALESCE(res.any_fallback, 0) AS any_fallback, COALESCE(res.any_saved, 0) AS any_saved, COALESCE(res.any_duplicate, 0) AS any_duplicate,
        TRIM(COALESCE(a.last_error, '')) <> '' AS attempt_error,
        CASE WHEN ${TASK_COMPLETE_SQL('ids.task_id')} THEN 1 ELSE 0 END AS is_complete,
        c.task_id IS NOT NULL AS is_closed,
        (bf.task_id IS NOT NULL OR ev.task_id IS NOT NULL OR COALESCE(res.any_task_source, 0) = 1) AS is_retriable,
        inf.task_id IS NOT NULL AS is_inflight
      FROM task_ids ids
      LEFT JOIN res_agg res ON res.task_id = ids.task_id
      LEFT JOIN res_first rf ON rf.task_id = ids.task_id
      LEFT JOIN buf_frozen bf ON bf.task_id = ids.task_id
      LEFT JOIN buf_done bd ON bd.task_id = ids.task_id
      LEFT JOIN ev_agg ev ON ev.task_id = ids.task_id
      LEFT JOIN task_attempts a ON a.task_id = ids.task_id
      LEFT JOIN task_completions c ON c.task_id = ids.task_id
      LEFT JOIN inflight_ids inf ON inf.task_id = ids.task_id
    ),
    pipeline_tasks AS (
      SELECT task_id, session_id, project_path, agent_id, source_kind, CAST(created_ms AS INTEGER) AS created_ms, CAST(updated_ms AS INTEGER) AS updated_ms,
        attempts, ${MAX_TASK_ATTEMPTS} AS max_attempts, llm_calls, segment_count, evidence_count, pending_segments,
        CASE WHEN segment_count > result_rows THEN segment_count - result_rows ELSE 0 END AS missing_segments,
        any_fallback AS fallback, CASE WHEN ${partial} THEN 1 ELSE 0 END AS partial,
        CASE
          WHEN ${partial} THEN 'failed'
          WHEN is_complete = 1 THEN CASE WHEN any_fallback = 1 THEN 'fallback' WHEN any_saved = 1 THEN 'saved'
            WHEN any_duplicate = 1 THEN 'duplicate' ELSE 'skipped' END
          WHEN is_inflight = 1 THEN 'processing'
          WHEN attempts >= ${MAX_TASK_ATTEMPTS} THEN 'stuck'
          WHEN ${stale} THEN 'stuck'
          WHEN attempts >= 1 OR pending_errors > 0 OR attempt_error = 1 THEN 'failed'
          ELSE 'queued'
        END AS state,
        CASE
          WHEN ${partial} OR is_complete = 1 OR is_inflight = 1 THEN NULL
          WHEN attempts >= ${MAX_TASK_ATTEMPTS} THEN 'exhausted'
          WHEN ${stale} THEN 'stale'
          ELSE NULL
        END AS stuck_reason
      FROM pipeline_core
    )`;
  return { sql, params: [opts.inflightJson, opts.nowMs, opts.staleMs, opts.nowMs, opts.staleMs] };
}

export interface StuckTaskCountOpts {
  nowMs?: number;
  inflight?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

/** Tasks in state `stuck` (exhausted or stale), same classifier as GET /admin/api/pipeline. */
export function stuckTaskCount(db: DatabaseManager, opts?: StuckTaskCountOpts): number {
  const env = opts?.env ?? process.env;
  const inflight = opts?.inflight ?? inflightTaskIds();
  const built = taskPipelineSql({
    nowMs: opts?.nowMs ?? Date.now(),
    inflightJson: JSON.stringify(inflight.map((id) => String(id))),
    staleMs: stuckStaleMs(env),
  });
  const row = db.sqlGet(`WITH ${built.sql} SELECT COUNT(*) AS n FROM pipeline_tasks WHERE state = 'stuck'`, built.params);
  return Number(row?.n || 0);
}

/**
 * Freeze the session's open events into a task at the moment the boundary arrives.
 * Events arriving later belong to the next task, even while this one is still queued.
 * An explicit taskId (e.g. derived from a transcript turn) makes freezing idempotent.
 */
export async function freezeOpenTask(db: DatabaseManager, sessionId: string, explicitTaskId?: string,
    boundaryMs?: number): Promise<string | null> {
  const taskId = explicitTaskId || randomUUID();
  const frozen = await db.sqlWrite(sql => {
    const a = sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE session_id=? AND task_result_id IS NULL`, ['task:' + taskId, sessionId]).changes || 0;
    const b = sql.run(`UPDATE tool_evidence SET task_id=? WHERE session_id=? AND task_id IS NULL`, [taskId, sessionId]).changes || 0;
    // Imported boundary: its original time bounds the task's end (never the wall clock).
    if (a + b && boundaryMs !== undefined) sql.run(`INSERT OR IGNORE INTO task_import_times (task_id, boundary_ms) VALUES (?, ?)`, [taskId, boundaryMs]);
    return a + b;
  });
  return frozen ? taskId : null;
}

function renderOne(row: any): string {
  return `## ${row.tool_name} (${row.success ? 'success' : 'FAILURE'})${row.incomplete || row.truncated ? ' [source abbreviated at capture]' : ''}
[INPUT]
${String(row.input ?? '')}
[OUTPUT]
${String(row.output ?? '')}`;
}

/**
 * Render a whole task. Over budget: keep the head and the tail and put an explicit marker with
 * the exact number of omitted characters in between. One string, one model call.
 */
export function renderTask(rows: any[], budget = taskCharBudget()): { text: string; truncated: boolean; omitted: number; chars: number } {
  const pieces = rows.map(renderOne);
  const chars = pieces.reduce((n, p) => n + p.length + 2, 0);
  const captureAbbreviated = rows.some(r => r.incomplete || r.truncated
    || incompleteToolSource(String(r.input ?? ''), String(r.output ?? ''), Infinity, Infinity));
  if (chars <= budget) return { text: pieces.join('\n\n'), truncated: captureAbbreviated, omitted: 0, chars };
  let omitted = 0;
  // 1) No single call may dominate: keep its head and tail.
  const perCall = Math.max(1000, Math.floor(budget / 4));
  const cuts = pieces.map(() => 0);
  const bounded = pieces.map((p, k) => {
    if (p.length <= perCall) return p;
    const head = Math.floor(perCall * 0.7), tail = perCall - head, cut = p.length - head - tail;
    omitted += cut; cuts[k] = cut;
    return `${p.slice(0, head)}\n[... omitted ${cut} chars of this call ...]\n${p.slice(p.length - tail)}`;
  });
  // 2) Keep whole calls from the start (60%) and from the end (40%); one marker for the dropped middle.
  const size = (list: string[]) => list.reduce((n, p) => n + p.length + 2, 0);
  if (size(bounded) <= budget) return { text: bounded.join('\n\n'), truncated: true, omitted, chars };
  const head: string[] = [], tail: string[] = [];
  let i = 0, j = bounded.length - 1;
  while (i <= j && size(head) + bounded[i].length + 2 <= budget * 0.6) head.push(bounded[i++]);
  while (j >= i && size(tail) + bounded[j].length + 2 <= budget * 0.4) tail.unshift(bounded[j--]);
  const dropped = bounded.slice(i, j + 1);
  // Count SOURCE characters: a dropped call that was already cut adds only what stage 1 had not counted yet,
  // and stage-1 marker text (not source) is never counted.
  let droppedChars = 0;
  for (let k = i; k <= j; k++) droppedChars += pieces[k].length + 2;
  for (let k = i; k <= j; k++) omitted += pieces[k].length + 2 - cuts[k];
  const marker = dropped.length ? [`[... omitted ${droppedChars} chars: ${dropped.length} tool call(s) in the middle of this task ...]`] : [];
  return { text: [...head, ...marker, ...tail].join('\n\n'), truncated: true, omitted, chars };
}

const TASK_SYSTEM_PROMPT = `You are a developer memory synthesis assistant.
${WORK_MEMORY_PROMPT}
You receive the whole record of ONE agent task: every tool call with its input and output, in order.
A very large task is shown as head and tail with an explicit "[... omitted N chars ...]" marker; never invent what the omitted part contained.
Decide whether the task produced anything worth remembering (a change, verification, decision, diagnosis or lesson).
If it did not (pure routine browsing with no finding), return record_kind "skip".
Otherwise produce ONE consolidated JSON record of the task's result. Merge repeated steps; do not list every command.
Keep the narrative under 180 words, facts and concepts to at most 6 each, file lists to at most 15 each.
Only record evidence present in the events. Failures are recovery evidence.

You MUST respond with a valid JSON object ONLY.
JSON Schema:
{"record_kind":"outcome | context | skip","title":"...","narrative":"...","facts":[],"concepts":[],"files_read":[],"files_modified":[]}`;

export interface ConsolidationResult { task_id: string | null; llm_calls: number; observations: string[]; duplicates: number;
  skipped: number; failed: number; prompt_chars: number; omitted_chars: number; segments: number; }

const inflight = new Set<string>();
export function isTaskInFlight(taskId: string) { return inflight.has(taskId); }
/** Task ids currently inside consolidateTask in this process. */
export function inflightTaskIds(): string[] { return [...inflight]; }

/**
 * Shared by task and legacy consolidation: what an interrupted earlier attempt already saved for this result
 * (its own observation, or the duplicate link it recorded). A retry reuses it and never calls the model again.
 */
export function savedResult(db: DatabaseManager, resultId: string, duplicateFlagId: string): { observationId: string; status: 'saved' | 'duplicate' } | null {
  if (db.sqlGet(`SELECT id FROM observations WHERE id=?`, [resultId])) return { observationId: resultId, status: 'saved' };
  const flag = db.sqlGet(`SELECT observation_id FROM duplicate_flags WHERE id=?`, [duplicateFlagId]);
  return flag ? { observationId: flag.observation_id, status: 'duplicate' } : null;
}

/** Shared skip policy: failures, edits and abbreviated (truncated/incomplete) sources may never end as 'skipped'. */
export function skipRefusal(rendered: { truncated: boolean; omitted: number; chars: number }, anyFailure = false, touched = 0): string | null {
  if (anyFailure) return 'task contains failed tool calls';
  if (touched) return 'task modified files';
  if (rendered.truncated) return `source truncated/incomplete (${rendered.omitted} of ${rendered.chars} chars omitted)`;
  return null;
}

/** files_modified of a legacy observation row (JSON text or array); unparsable text counts as one entry. */
function legacyFilesModified(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  const t = String(v ?? '').trim(); if (!t || t === '[]') return [];
  try { const a = JSON.parse(t); return Array.isArray(a) ? a.filter(Boolean).map(String) : [t]; } catch { return [t]; }
}

async function markTaskComplete(db: DatabaseManager, taskId: string, endMs?: number | null) {
  await db.sqlWrite(sql => sql.run(`INSERT INTO task_completions (task_id, completed_ms) VALUES (?, ?)
    ON CONFLICT(task_id) DO UPDATE SET completed_ms = excluded.completed_ms WHERE task_completions.completed_ms = 0`, [taskId, endMs || Date.now()]));
}

/**
 * End time of an imported task: its last event or its imported boundary, whichever is later. Null for a live task
 * (live tasks keep server time). A task containing any imported event is treated as imported.
 */
export function importedTaskEndMs(db: DatabaseManager, taskId: string, rows: any[]): number | null {
  if (!rows.some(r => r.import_arrival_ms !== null && r.import_arrival_ms !== undefined)) return null;
  const last = Math.max(...rows.map(r => Number(r.received_ms) || 0));
  const boundary = Number(db.sqlGet(`SELECT boundary_ms FROM task_import_times WHERE task_id=?`, [taskId])?.boundary_ms || 0);
  return Math.max(last, boundary);
}

/** Rows of a task: buffered calls plus legacy evidence rows frozen by earlier revisions (read-only). */
function taskRows(db: DatabaseManager, taskId: string): any[] {
  const buffered = db.sqlAll(`SELECT id,session_id,project_path,agent_id,tool_name,success,input,output,incomplete,received_ms,created_at,
    import_arrival_ms FROM task_event_buffer WHERE task_result_id=? OR task_result_id IN (SELECT id FROM task_results WHERE task_id=?)`, ['task:' + taskId, taskId]);
  const legacy = db.sqlAll(`SELECT id,session_id,project_path,agent_id,tool_name,success,input,output,truncated,received_ms,created_at
    FROM tool_evidence WHERE task_id=?`, [taskId]);
  return [...buffered, ...legacy].sort((a, b) => (a.received_ms - b.received_ms) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Consolidate one frozen task with exactly one model call. Insert-once: the task's result id is
 * `${taskId}-0`; a retry after a crash reuses whatever was already saved. Any exception leaves the
 * task frozen and counts an attempt.
 */
export async function consolidateTask(db: DatabaseManager, taskId: string, trigger: TaskTrigger): Promise<ConsolidationResult> {
  const result: ConsolidationResult = { task_id: taskId, llm_calls: 0, observations: [], duplicates: 0, skipped: 0, failed: 0,
    prompt_chars: 0, omitted_chars: 0, segments: 1 };
  if (inflight.has(taskId)) return { ...result, task_id: null, segments: 0 };
  inflight.add(taskId);
  try {
    const rows = taskRows(db, taskId);
    if (!rows.length) return { ...result, task_id: null, segments: 0 };
    const first = rows[0]; const sessionId = first.session_id;
    const importedEnd = importedTaskEndMs(db, taskId, rows);
    // A task left by the segmented pipeline (segment_count > 1) is never finished by its first segment:
    // its whole remaining content gets a new whole-task result; the legacy rows stay untouched as history.
    const legacy = db.sqlGet(`SELECT 1 AS x FROM task_results WHERE task_id=? AND segment_count > 1 AND id <> ? LIMIT 1`, [taskId, `${taskId}-whole`]);
    const resultId = legacy ? `${taskId}-whole` : `${taskId}-0`;
    const segmentIndex = legacy ? 1000 : 0;
    const prior = db.sqlGet(`SELECT * FROM task_results WHERE id=?`, [resultId]);
    if (prior && (prior.observation_id || ['skipped', 'duplicate'].includes(prior.status))) {
      // Result already recorded (crash between result and completion marker): finish without a model call.
      if (prior.observation_id) result.observations.push(prior.observation_id);
      await markTaskComplete(db, taskId, importedEnd);
      return result;
    }
    const purpose = await db.getSessionPurpose(sessionId);
    const rendered = renderTask(rows);
    const atCapture = captureOmitted(rows);
    result.prompt_chars = rendered.text.length; result.omitted_chars = rendered.omitted + atCapture;
    const touched = [...new Set(rows.flatMap(r => modifiedFiles(r.tool_name, String(r.input ?? ''))))];
    const anyFailure = rows.some(r => !r.success);
    let status = 'saved', observationId: string | null = null, contentHash: string | null = null, lastError: string | null = null;
    let lastObservation: Observation | null = null; let parsed: ReturnType<typeof interpretWorkMemory> | null = null;
    const existing = (await db.getObservationsByIds([resultId]))[0];
    const reused = existing ? null : savedResult(db, resultId, `dup-${taskId}`);
    const hashDay = String(rows[rows.length - 1].created_at || '').slice(0, 10);
    if (existing) {
      // Crash recovery: the observation was saved but the run stopped before finishing; restore its hash claim
      // so later identical results still deduplicate.
      observationId = existing.id; lastObservation = existing;
      contentHash = summaryHashV2(existing.project_path, existing, hashDay);
      await db.ensureContentHash(existing.id, existing.project_path, contentHash);
    }
    else if (reused?.status === 'duplicate') {
      // Interrupted after the duplicate link was recorded: reuse it, no model call.
      status = 'duplicate'; observationId = reused.observationId; result.duplicates++;
    }
    else if (purpose === 'daily_review') { status = 'skipped'; lastError = 'daily_review session'; result.skipped++; }
    else {
      const settings = resolveLlmSettings();
      if (!llmAvailable(settings)) lastError = 'Missing LLM API credentials';
      else {
        try {
          result.llm_calls++;
          const user = `Session purpose: ${purpose}\nProject: ${first.project_path}\nAgent: ${first.agent_id}\nTrigger: ${trigger}\n` +
            `Tool calls: ${rows.length}${touched.length ? `\nFiles modified (from edit tools): ${touched.slice(0, 30).join(', ')}` : ''}` +
            `${rendered.omitted || atCapture ? `\nNOTE: ${rendered.omitted + atCapture} chars were omitted (${atCapture} at capture, ${rendered.omitted} for the prompt budget); the source is incomplete.` : ''}\n\n${rendered.text}`;
          const synth = await synthesizeEnglishWorkMemory(system => callLlmJson('observation', system, user, settings), TASK_SYSTEM_PROMPT);
          result.llm_calls += synth.calls - 1;
          parsed = interpretWorkMemory(synth.raw, !anyFailure);
        } catch (err: any) { lastError = err.message; }
      }
      // Failures, edits and abbreviated sources are never silently skipped.
      if (parsed?.skip && skipRefusal(rendered, anyFailure, touched.length)) {
        parsed.skip = false; parsed.kind = anyFailure || touched.length ? 'outcome' : 'context';
        parsed.title ||= `Task: ${[...new Set(rows.map(r => r.tool_name))].slice(0, 6).join(', ')}`;
      }
      if (parsed?.skip) { status = 'skipped'; result.skipped++; }
      else {
        const fallback = !parsed;
        const tools = [...new Set(rows.map(r => r.tool_name))].join(', ');
        const obs: Observation = {
          id: resultId, session_id: sessionId, project_path: first.project_path, agent_id: first.agent_id,
          title: parsed?.title || `Task capture incomplete: ${tools}`.slice(0, 200),
          narrative: parsed?.narrative || `Memory synthesis unavailable; classification unknown. ${String(lastError || '').slice(0, 300)}\n` +
            rows.slice(-5).map(r => `${r.tool_name}: ${String(r.input).slice(0, 300)} => ${String(r.output).slice(0, 600)}`).join('\n'),
          facts: parsed?.facts || [`${rows.length} tool calls (${tools})`], concepts: parsed?.concepts || ['task'],
          files_read: parsed?.files_read || [], files_modified: [...new Set([...(parsed?.files_modified || []), ...touched])].slice(0, 30),
          embedding: [], record_kind: fallback ? (anyFailure || touched.length ? 'outcome' : 'context') : parsed!.kind, source_kind: 'task',
          ...(importedEnd ? { created_at: sqlTimeMs(importedEnd) } : {}),
        };
        if ((rendered.omitted || atCapture) && !fallback) obs.narrative += `\n(${rendered.omitted + atCapture} chars of the task were omitted before synthesis; source incomplete.)`;
        contentHash = summaryHashV2(obs.project_path, obs, hashDay);
        // One transaction: link to an EXISTING observation with this hash, or save observation + hash together.
        const known = db.sqlGet(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id=h.observation_id
          WHERE h.project_path=? AND h.sha256=? AND h.hash_version=2 AND h.observation_id<>?`, [obs.project_path, contentHash, obs.id]);
        if (!known) obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')} ${obs.concepts.join(' ')}`);
        const saved = await db.saveObservationDeduped(obs, { v2: contentHash, v1: summaryHash(obs.project_path, obs, hashDay) }, { id: `dup-${taskId}`, taskId });
        if (saved.duplicateOf) {
          // Duplicate-looking content: link to the existing memory and flag it for a human; nothing is deleted.
          status = 'duplicate'; observationId = saved.duplicateOf; result.duplicates++;
        } else {
          observationId = obs.id; lastObservation = obs;
          if (fallback) { status = 'fallback'; result.failed++; }
        }
      }
    }
    if (observationId) result.observations.push(observationId);
    await db.sqlWrite(sql => {
      sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,
        source_ids,trigger,status,observation_id,content_sha256,llm_calls,last_error,evidence_count,created_at)
        VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,0,COALESCE(?,CURRENT_TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET status=excluded.status, observation_id=excluded.observation_id, content_sha256=excluded.content_sha256,
          llm_calls=task_results.llm_calls+excluded.llm_calls, last_error=excluded.last_error, created_at=excluded.created_at`,
        [resultId, taskId, sessionId, first.project_path, first.agent_id, segmentIndex, rows.length, JSON.stringify(rows.map(r => r.id)), trigger,
          status, observationId, contentHash, result.llm_calls, lastError, importedEnd ? sqlTimeMs(importedEnd) : null]);
      sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE task_result_id=?`, [resultId, 'task:' + taskId]);
    });
    await markTaskComplete(db, taskId, importedEnd);
    // Post-task review runs once per task, never per observation.
    if (lastObservation) await runAutomaticPostTaskReview(db, lastObservation).catch(err =>
      console.error(`[Memory] Post-task review failed after task capture: ${err.message}`));
    return result;
  } catch (err: any) {
    const sid = db.sqlGet(`SELECT session_id FROM task_event_buffer WHERE task_result_id=? LIMIT 1`, ['task:' + taskId])?.session_id
      || db.sqlGet(`SELECT session_id FROM tool_evidence WHERE task_id=? LIMIT 1`, [taskId])?.session_id || '';
    await db.sqlWrite(sql => sql.run(`INSERT INTO task_attempts (task_id,session_id,attempts,last_error,updated_ms) VALUES (?,?,1,?,?)
      ON CONFLICT(task_id) DO UPDATE SET attempts=attempts+1, last_error=excluded.last_error, updated_ms=excluded.updated_ms`,
      [taskId, sid, String(err.message).slice(0, 500), Date.now()])).catch(() => undefined);
    throw err;
  } finally { inflight.delete(taskId); }
}

/** Freeze then consolidate whatever is open for a session (convenience for tests/CLI). */
export async function consolidateSession(db: DatabaseManager, sessionId: string, trigger: TaskTrigger): Promise<ConsolidationResult> {
  const taskId = await freezeOpenTask(db, sessionId);
  if (!taskId) return { task_id: null, llm_calls: 0, observations: [], duplicates: 0, skipped: 0, failed: 0, prompt_chars: 0, omitted_chars: 0, segments: 0 };
  return consolidateTask(db, taskId, trigger);
}

export function taskRetryMs(env: NodeJS.ProcessEnv = process.env): number {
  const ms = Number(env.AGENTMEM_TASK_RETRY_MS);
  return env.AGENTMEM_TASK_RETRY_MS?.trim() && Number.isFinite(ms) && ms >= 100 ? Math.trunc(ms) : 60_000;
}

export interface CompactLegacyOptions { days: number; apply: boolean; now?: Date; since?: string; until?: string; }

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

/** Split one session's legacy rows (in rowid order) into consecutive segments that each render within the budget. */
export function legacySegments(events: any[], budget = taskCharBudget()): any[][] {
  const segments: any[][] = []; let current: any[] = [];
  for (const e of events) {
    if (current.length && renderTask([...current, e], Infinity).chars > budget) { segments.push(current); current = []; }
    current.push(e);
  }
  if (current.length) segments.push(current);
  return segments;
}

/**
 * Compress legacy per-step observations (no work metadata) of the last N days, or of an explicit
 * [since, until] window, into task-level results. Never deletes or edits legacy rows; links them instead.
 * A large session is split into consecutive segments that each fit the prompt budget (one model call each),
 * so the middle of a long session is never dropped; a single row larger than the budget is kept pending (never
 * summarized from a truncated prompt). Idempotent: only unlinked rows are segmented, and each result id derives from
 * that segment's own source ids; an existing result is reused only when its recorded source ids are exactly the same.
 */
export async function compactLegacy(db: DatabaseManager, options: CompactLegacyOptions) {
  const until = options.until ? new Date(options.until) : null;
  const sinceDate = options.since ? new Date(options.since)
    : new Date((options.now || new Date()).getTime() - options.days * 86400_000);
  if (!Number.isFinite(sinceDate.getTime()) || (until && (!Number.isFinite(until.getTime()) || until <= sinceDate)))
    throw new Error('compact-legacy requires a valid since < until window');
  const since = sqlTime(sinceDate); const to = until ? sqlTime(until) : null;
  const rows = db.sqlAll(`SELECT o.*, l.legacy_observation_id AS linked FROM observations o
    LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
    LEFT JOIN legacy_compaction_links l ON l.legacy_observation_id=o.id
    WHERE m.observation_id IS NULL AND datetime(o.created_at) >= datetime(?)${to ? ' AND datetime(o.created_at) <= datetime(?)' : ''}
    GROUP BY o.id ORDER BY o.session_id, o.rowid`, to ? [since, to] : [since]);
  const bySession = new Map<string, any[]>();
  for (const r of rows) { if (!bySession.has(r.session_id)) bySession.set(r.session_id, []); bySession.get(r.session_id)!.push(r); }
  const plan = [...bySession.entries()].map(([session, items]) => {
    const asEvents = items.map(r => ({ ...r, tool_name: 'legacy:' + r.title, success: 1, incomplete: 0,
      input: '', output: `${r.title}\n${r.narrative}\nfacts: ${r.facts}\nfiles_modified: ${r.files_modified}` }));

    // Only rows not yet linked are segmented (an interrupted run continues where it stopped; a linked row is never
    // summarized twice). Each segment's result id derives from ITS OWN source ids, so a re-run with another prompt
    // budget can never reuse a result that covered different rows.
    const all = legacySegments(asEvents.filter((r: any) => !r.linked));
    const segments = all.map((seg, index) => ({ seg, index, ids: seg.map((r: any) => r.id) }));
    // The task is this exact segment plan over the rows still unlinked now: a retry after a partial run, or a run with
    // another prompt budget, is a new task (its own task_id, segment_index 0..n-1); the same plan keeps its task.
    const key = createHash('sha256').update(session + '\n' + segments.map(x => x.ids.join(',')).join('\n')).digest('hex').slice(0, 24);
    return { session, items: items.filter((r: any) => !r.linked), key, segments, total: all.length };
  }).filter(p => p.segments.length);
  const summary = { mode: options.apply ? 'apply' : 'dry-run', days: options.since ? null : options.days, since, until: to,
    legacy_rows: plan.reduce((n, p) => n + p.items.length, 0),
    sessions: plan.length, planned_llm_calls: plan.reduce((n, p) => n + p.segments.length, 0),
    planned_chars: plan.reduce((n, p) => n + p.segments.reduce((m, x) => m + renderTask(x.seg).text.length, 0), 0),
    llm_calls: 0, results_saved: 0, reused: 0, pending: 0, truncated: 0, duplicates: 0, skipped: 0, rows_deleted: 0,
    pending_reasons: [] as string[] };
  if (!options.apply) return summary;
  const settings = resolveLlmSettings();
  if (!llmAvailable(settings)) throw new Error('compact-legacy --apply requires LLM credentials');
  for (const p of plan) {
    // Deterministic ids from the session's legacy row ids: an interrupted run retried later reuses the same result
    // instead of creating a second observation. Legacy rows are never edited or deleted.
    const key = p.key;
    const taskId = `legacy-task-${key}`;
    for (const { seg, index: i, ids } of p.segments) {
      const first = seg[0];
      const resultId = 'legacy-' + createHash('sha256').update(p.session + '\n' + [...ids].sort().join('\n')).digest('hex').slice(0, 32);
      const rendered = renderTask(seg);
      // Retry of an interrupted run: reuse only a result whose recorded source ids are exactly this segment's rows.
      const prior = db.sqlGet(`SELECT status, observation_id, source_ids FROM task_results WHERE id=?`, [resultId]);
      let priorIds: string[] | null = null;
      try { priorIds = prior ? JSON.parse(prior.source_ids || '[]').map(String).sort() : null; } catch { priorIds = []; }
      const sameSource = !!prior && JSON.stringify(priorIds) === JSON.stringify([...ids].sort());
      if (prior && !sameSource) throw new Error(`compact-legacy: result ${resultId} exists but covers other source rows; refusing to reuse it`);
      const reusedResult = (!prior || sameSource) ? savedResult(db, resultId, `dup-${resultId}`) : null;
      let observationId: string | null = null; let status = 'skipped'; let reason: string | null = null;
      let parsed: any = null;
      if (reusedResult) { observationId = reusedResult.observationId; status = reusedResult.status; summary.reused++; }
      // A pending result is reused only while its reason still holds under THIS plan/budget (the row still does not fit
      // whole); once it fits, the model is called and the result follows the new plan (round 27).
      else if (prior?.status === 'pending' && rendered.omitted > 0) { status = 'pending'; summary.reused++;
        reason = `legacy source truncated (${rendered.omitted} of ${rendered.chars} chars omitted); not compacted, read the original rows`; }
      else if (rendered.omitted > 0) {
        // A single row larger than the prompt budget cannot be summarized whole: never compact a truncated source.
        // It stays pending and unlinked (still delivered to the daily review as a legacy observation), no model call.
        status = 'pending';
        reason = `legacy source truncated (${rendered.omitted} of ${rendered.chars} chars omitted); not compacted, read the original rows`;
        summary.truncated++;
      }
      else {
        summary.llm_calls++;
        const legacyUser = `Legacy per-step records of one session\nProject: ${first.project_path}\n` +
          `${rendered.omitted ? `NOTE: ${rendered.omitted} chars were omitted for the prompt budget; the source is incomplete.\n` : ''}\n${rendered.text}`;
        const synth = await synthesizeEnglishWorkMemory(system => callLlmJson('observation', system, legacyUser, settings), TASK_SYSTEM_PROMPT);
        summary.llm_calls += synth.calls - 1;
        parsed = interpretWorkMemory(synth.raw, true);
        // Same shared policy as task results: legacy rows that recorded modified files may not end as 'skipped'.
        const legacyTouched = seg.reduce((n: number, r: any) => n + legacyFilesModified(r.files_modified).length, 0);
        const refusal = parsed.skip ? skipRefusal(rendered, false, legacyTouched) : null;
        if (refusal) {
          // An abbreviated source is never dropped as "skipped": keep it pending with the reason; legacy rows stay unlinked.
          status = 'pending';
          reason = `legacy ${refusal}; model skip not accepted`;
        }
      }
      if (status === 'pending') { summary.pending++; reason ||= 'legacy source truncated; kept pending'; summary.pending_reasons.push(`${resultId}: ${reason}`); }
      else if (parsed && !parsed.skip) {
        const obs: Observation = { id: resultId, session_id: p.session, project_path: first.project_path, agent_id: first.agent_id,
          title: parsed.title || 'Compacted legacy session', narrative: parsed.narrative, facts: parsed.facts, concepts: parsed.concepts,
          files_read: parsed.files_read, files_modified: parsed.files_modified, embedding: [], record_kind: parsed.kind,
          source_kind: 'legacy_compacted', created_at: seg[seg.length - 1].created_at };
        const day = String(obs.created_at || '').slice(0, 10); const hash = summaryHashV2(obs.project_path, obs, day);
        const known = db.sqlGet(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id=h.observation_id
          WHERE h.project_path=? AND h.sha256=? AND h.hash_version=2 AND h.observation_id<>?`, [obs.project_path, hash, obs.id]);
        if (!known) obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')}`);
        // Same atomic path as task results: link + flag a look-alike, or save observation + hash together.
        const saved = await db.saveObservationDeduped(obs, { v2: hash, v1: summaryHash(obs.project_path, obs, day) }, { id: `dup-${resultId}`, taskId });
        if (saved.duplicateOf) { observationId = saved.duplicateOf; status = 'duplicate'; summary.duplicates++; }
        else { observationId = obs.id; status = 'saved'; summary.results_saved++; }
      }
      if (status === 'skipped') summary.skipped++;
      const called = parsed ? 1 : 0;
      await db.sqlWrite(sql => {
        sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,
          source_ids,trigger,status,observation_id,llm_calls,source_kind,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'legacy_compacted',?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, observation_id=excluded.observation_id,
            task_id=excluded.task_id, segment_index=excluded.segment_index, segment_count=excluded.segment_count,
            llm_calls=task_results.llm_calls+excluded.llm_calls,
            last_error=CASE WHEN excluded.status='pending' THEN COALESCE(excluded.last_error, task_results.last_error) ELSE excluded.last_error END`,
          [resultId, taskId, p.session, first.project_path, first.agent_id, i, p.total, seg.length,
            JSON.stringify(ids), 'legacy_compaction', status, observationId, called, reason]);
        // A pending (truncated) source stays unlinked, so it remains visible as not-yet-compacted.
        if (status !== 'pending') for (const r of seg) sql.run(`INSERT OR IGNORE INTO legacy_compaction_links VALUES (?,?)`, [r.id, resultId]);
      });
      if (status !== 'pending') await markTaskComplete(db, taskId);
    }
  }
  return summary;
}
