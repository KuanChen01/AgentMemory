import { createHash } from 'node:crypto';
import { incompleteToolSource } from './tool-log-policy';
import { randomUUID } from 'crypto';
import { DatabaseManager, Observation } from './db';
import { boundedEnvInteger } from './llm-budget';
import { callLlmJson, llmAvailable, resolveLlmSettings } from './llm-client';
import { interpretWorkMemory, WORK_MEMORY_PROMPT } from './work-memory';
import { modifiedFiles, summaryHash } from './event-classifier';
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
  const res: any = await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,
    input,output,incomplete,received_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [ev.id, ev.session_id, ev.project_path, ev.agent_id, ev.tool_name, ev.success ? 1 : 0,
      keepHeadTail(input, EVENT_INPUT_MAX), keepHeadTail(output, EVENT_OUTPUT_MAX), incomplete ? 1 : 0, ev.timestamp]));
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

/** Sessions with open events whose last activity (including legacy evidence rows) is older than cutoff. */
export function openSessionsIdleSince(db: DatabaseManager, cutoffMs: number): string[] {
  return db.sqlAll(`SELECT session_id FROM (
      SELECT session_id, received_ms AS ms, (task_result_id IS NULL) AS open FROM task_event_buffer
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

/** Tasks that exhausted their retries and are not complete (partial results included). */
export function stuckTaskCount(db: DatabaseManager): number {
  return db.sqlGet(`SELECT COUNT(*) AS n FROM task_attempts a WHERE a.attempts >= ? AND NOT ${TASK_COMPLETE_SQL('a.task_id')}`,
    [MAX_TASK_ATTEMPTS]).n;
}

/**
 * Freeze the session's open events into a task at the moment the boundary arrives.
 * Events arriving later belong to the next task, even while this one is still queued.
 * An explicit taskId (e.g. derived from a transcript turn) makes freezing idempotent.
 */
export async function freezeOpenTask(db: DatabaseManager, sessionId: string, explicitTaskId?: string): Promise<string | null> {
  const taskId = explicitTaskId || randomUUID();
  const frozen = await db.sqlWrite(sql => {
    const a = sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE session_id=? AND task_result_id IS NULL`, ['task:' + taskId, sessionId]).changes || 0;
    const b = sql.run(`UPDATE tool_evidence SET task_id=? WHERE session_id=? AND task_id IS NULL`, [taskId, sessionId]).changes || 0;
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

async function markTaskComplete(db: DatabaseManager, taskId: string) {
  await db.sqlWrite(sql => sql.run(`INSERT INTO task_completions (task_id, completed_ms) VALUES (?, ?)
    ON CONFLICT(task_id) DO UPDATE SET completed_ms = excluded.completed_ms WHERE task_completions.completed_ms = 0`, [taskId, Date.now()]));
}

/** Rows of a task: buffered calls plus legacy evidence rows frozen by earlier revisions (read-only). */
function taskRows(db: DatabaseManager, taskId: string): any[] {
  const buffered = db.sqlAll(`SELECT id,session_id,project_path,agent_id,tool_name,success,input,output,incomplete,received_ms,created_at
    FROM task_event_buffer WHERE task_result_id=? OR task_result_id IN (SELECT id FROM task_results WHERE task_id=?)`, ['task:' + taskId, taskId]);
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
    // A task left by the segmented pipeline (segment_count > 1) is never finished by its first segment:
    // its whole remaining content gets a new whole-task result; the legacy rows stay untouched as history.
    const legacy = db.sqlGet(`SELECT 1 AS x FROM task_results WHERE task_id=? AND segment_count > 1 AND id <> ? LIMIT 1`, [taskId, `${taskId}-whole`]);
    const resultId = legacy ? `${taskId}-whole` : `${taskId}-0`;
    const segmentIndex = legacy ? 1000 : 0;
    const prior = db.sqlGet(`SELECT * FROM task_results WHERE id=?`, [resultId]);
    if (prior && (prior.observation_id || ['skipped', 'duplicate'].includes(prior.status))) {
      // Result already recorded (crash between result and completion marker): finish without a model call.
      if (prior.observation_id) result.observations.push(prior.observation_id);
      await markTaskComplete(db, taskId);
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
      contentHash = summaryHash(existing.project_path, existing, hashDay);
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
          parsed = interpretWorkMemory(await callLlmJson('observation', TASK_SYSTEM_PROMPT, user, settings), !anyFailure);
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
        };
        if ((rendered.omitted || atCapture) && !fallback) obs.narrative += `\n(${rendered.omitted + atCapture} chars of the task were omitted before synthesis; source incomplete.)`;
        contentHash = summaryHash(obs.project_path, obs, hashDay);
        // One transaction: link to an EXISTING observation with this hash, or save observation + hash together.
        const known = db.sqlGet(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id=h.observation_id
          WHERE h.project_path=? AND h.sha256=? AND h.observation_id<>?`, [obs.project_path, contentHash, obs.id]);
        if (!known) obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')} ${obs.concepts.join(' ')}`);
        const saved = await db.saveObservationDeduped(obs, contentHash, { id: `dup-${taskId}`, taskId });
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
        source_ids,trigger,status,observation_id,content_sha256,llm_calls,last_error,evidence_count) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,0)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status, observation_id=excluded.observation_id, content_sha256=excluded.content_sha256,
          llm_calls=task_results.llm_calls+excluded.llm_calls, last_error=excluded.last_error, created_at=CURRENT_TIMESTAMP`,
        [resultId, taskId, sessionId, first.project_path, first.agent_id, segmentIndex, rows.length, JSON.stringify(rows.map(r => r.id)), trigger,
          status, observationId, contentHash, result.llm_calls, lastError]);
      sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE task_result_id=?`, [resultId, 'task:' + taskId]);
    });
    await markTaskComplete(db, taskId);
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

export interface CompactLegacyOptions { days: number; apply: boolean; now?: Date; }

/**
 * Compress legacy per-step observations (no work metadata) of the last N days into
 * task-level results. Never deletes or edits legacy rows; links them instead.
 * Idempotent: already linked legacy rows are not compacted again.
 */
export async function compactLegacy(db: DatabaseManager, options: CompactLegacyOptions) {
  const since = new Date((options.now || new Date()).getTime() - options.days * 86400_000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.sqlAll(`SELECT o.* FROM observations o
    LEFT JOIN observation_work_metadata m ON m.observation_id=o.id
    LEFT JOIN legacy_compaction_links l ON l.legacy_observation_id=o.id
    WHERE m.observation_id IS NULL AND l.legacy_observation_id IS NULL AND datetime(o.created_at) >= datetime(?)
    ORDER BY o.session_id, o.rowid`, [since]);
  const bySession = new Map<string, any[]>();
  for (const r of rows) { if (!bySession.has(r.session_id)) bySession.set(r.session_id, []); bySession.get(r.session_id)!.push(r); }
  const plan = [...bySession.entries()].map(([session, items]) => {
    const asEvents = items.map(r => ({ ...r, tool_name: 'legacy:' + r.title, success: 1, incomplete: 0,
      input: '', output: `${r.title}\n${r.narrative}\nfacts: ${r.facts}\nfiles_modified: ${r.files_modified}` }));
    return { session, items, segments: [asEvents] };  // one call per session, head+tail bounded
  });
  const summary = { mode: options.apply ? 'apply' : 'dry-run', days: options.days, since, legacy_rows: rows.length,
    sessions: plan.length, planned_llm_calls: plan.reduce((n, p) => n + p.segments.length, 0),
    planned_chars: plan.reduce((n, p) => n + renderTask(p.segments[0]).text.length, 0),
    llm_calls: 0, results_saved: 0, reused: 0, pending: 0, rows_deleted: 0 };
  if (!options.apply) return summary;
  const settings = resolveLlmSettings();
  if (!llmAvailable(settings)) throw new Error('compact-legacy --apply requires LLM credentials');
  for (const p of plan) {
    // Deterministic ids from the session's legacy row ids: an interrupted run retried later reuses the same result
    // instead of creating a second observation. Legacy rows are never edited or deleted.
    const key = createHash('sha256').update(p.session + '\n' + p.items.map((r: any) => r.id).sort().join('\n')).digest('hex').slice(0, 24);
    const taskId = `legacy-task-${key}`;
    for (let i = 0; i < p.segments.length; i++) {
      const seg = p.segments[i]; const first = seg[0]; const resultId = `legacy-${key}-${i}`;
      const rendered = renderTask(seg);
      // Retry of an interrupted run: reuse what was already saved for this session key; no new model call.
      const prior = db.sqlGet(`SELECT status, observation_id FROM task_results WHERE id=?`, [resultId]);
      const reusedResult = savedResult(db, resultId, `dup-${resultId}`);
      let observationId: string | null = null; let status = 'skipped'; let reason: string | null = null;
      let parsed: any = null;
      if (reusedResult) { observationId = reusedResult.observationId; status = reusedResult.status; summary.reused++; }
      else if (prior?.status === 'pending') { status = 'pending'; summary.reused++; }
      else {
        summary.llm_calls++;
        parsed = interpretWorkMemory(await callLlmJson('observation', TASK_SYSTEM_PROMPT,
          `Legacy per-step records of one session\nProject: ${first.project_path}\n` +
          `${rendered.omitted ? `NOTE: ${rendered.omitted} chars were omitted for the prompt budget; the source is incomplete.\n` : ''}\n${rendered.text}`, settings), true);
        const refusal = parsed.skip ? skipRefusal(rendered) : null;
        if (refusal) {
          // An abbreviated source is never dropped as "skipped": keep it pending with the reason; legacy rows stay unlinked.
          status = 'pending';
          reason = `legacy ${refusal}; model skip not accepted`;
        }
      }
      if (status === 'pending') { summary.pending++; reason ||= 'legacy source truncated; kept pending'; }
      else if (parsed && !parsed.skip) {
        const obs: Observation = { id: resultId, session_id: p.session, project_path: first.project_path, agent_id: first.agent_id,
          title: parsed.title || 'Compacted legacy session', narrative: parsed.narrative, facts: parsed.facts, concepts: parsed.concepts,
          files_read: parsed.files_read, files_modified: parsed.files_modified, embedding: [], record_kind: parsed.kind,
          source_kind: 'legacy_compacted', created_at: seg[seg.length - 1].created_at };
        const hash = summaryHash(obs.project_path, obs, String(obs.created_at || '').slice(0, 10));
        const known = db.sqlGet(`SELECT h.observation_id FROM observation_content_hashes h JOIN observations o ON o.id=h.observation_id
          WHERE h.project_path=? AND h.sha256=? AND h.observation_id<>?`, [obs.project_path, hash, obs.id]);
        if (!known) obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')}`);
        // Same atomic path as task results: link + flag a look-alike, or save observation + hash together.
        const saved = await db.saveObservationDeduped(obs, hash, { id: `dup-${resultId}`, taskId });
        if (saved.duplicateOf) { observationId = saved.duplicateOf; status = 'duplicate'; }
        else { observationId = obs.id; status = 'saved'; summary.results_saved++; }
      }
      const called = parsed ? 1 : 0;
      await db.sqlWrite(sql => {
        sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,
          source_ids,trigger,status,observation_id,llm_calls,source_kind,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'legacy_compacted',?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, observation_id=excluded.observation_id,
            llm_calls=task_results.llm_calls+excluded.llm_calls, last_error=COALESCE(excluded.last_error, task_results.last_error)`,
          [resultId, taskId, p.session, first.project_path, first.agent_id, i, p.segments.length, seg.length,
            JSON.stringify(seg.map((r: any) => r.id)), 'legacy_compaction', status, observationId, called, reason]);
        // A pending (truncated) source stays unlinked, so it remains visible as not-yet-compacted.
        if (status !== 'pending') for (const r of seg) sql.run(`INSERT OR IGNORE INTO legacy_compaction_links VALUES (?,?)`, [r.id, resultId]);
      });
      if (status !== 'pending') await markTaskComplete(db, taskId);
    }
  }
  return summary;
}
