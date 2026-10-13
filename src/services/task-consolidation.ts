import { randomUUID } from 'crypto';
import { DatabaseManager, Observation } from './db';
import { boundToolText, boundedEnvInteger } from './llm-budget';
import { callLlmJson, llmAvailable, resolveLlmSettings } from './llm-client';
import { interpretWorkMemory, WORK_MEMORY_PROMPT } from './work-memory';
import { EventDecision, sha256, summaryHash } from './event-classifier';
import { incompleteToolSource } from './tool-log-policy';
import { getEmbedding } from './embedding';
import { runAutomaticPostTaskReview } from './post-task-review';

export interface IncomingToolEvent {
  id: string; session_id: string; project_path: string; agent_id: string; tool_name: string;
  input: string; output: string; success: boolean; timestamp: number;
}
export type TaskTrigger = 'user_prompt' | 'session_close' | 'idle_timeout' | 'manual' | 'legacy_compaction';

export function taskIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  // AGENTMEM_TASK_IDLE_MS exists for bounded tests; users configure minutes (default 20).
  const ms = Number(env.AGENTMEM_TASK_IDLE_MS);
  if (env.AGENTMEM_TASK_IDLE_MS?.trim() && Number.isFinite(ms) && ms >= 100) return Math.trunc(ms);
  return boundedEnvInteger(env.AGENTMEM_TASK_IDLE_MINUTES, 20, 1, 24 * 60) * 60_000;
}
export function segmentCharBudget(env: NodeJS.ProcessEnv = process.env): number {
  return boundedEnvInteger(env.AGENTMEM_TASK_SEGMENT_CHARS, 24000, 4000, 120000);
}

const EVIDENCE_INPUT_MAX = 2000;
const EVIDENCE_OUTPUT_MAX = 20000;
const RENDER_INPUT_MAX = 3000;
const RENDER_OUTPUT_MAX = 6000;
export const MAX_TASK_ATTEMPTS = 5;

/** evidence_only: permanent row (bounded, full sha256), no model call, no embedding; linked to its task. */
export async function saveToolEvidence(db: DatabaseManager, ev: IncomingToolEvent, decision: EventDecision) {
  const truncated = ev.input.length > EVIDENCE_INPUT_MAX || ev.output.length > EVIDENCE_OUTPUT_MAX;
  await db.sqlWrite(sql => sql.run(`INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,
    route_reason,input,output,input_bytes,output_bytes,truncated,source_sha256,received_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ev.id, ev.session_id, ev.project_path, ev.agent_id, ev.tool_name, ev.success ? 1 : 0, decision.reason,
      boundToolText(ev.input, EVIDENCE_INPUT_MAX), boundToolText(ev.output, EVIDENCE_OUTPUT_MAX),
      Buffer.byteLength(ev.input), Buffer.byteLength(ev.output), truncated ? 1 : 0, sha256(ev.input + '\u0000' + ev.output), ev.timestamp]));
}

/** candidate: buffered until the task boundary. */
export async function bufferCandidate(db: DatabaseManager, ev: IncomingToolEvent) {
  const inputLimit = boundedEnvInteger(process.env.AGENTMEM_TOOL_INPUT_MAX_CHARS, 10000, 1000, 30000);
  const outputLimit = boundedEnvInteger(process.env.AGENTMEM_TOOL_OUTPUT_MAX_CHARS, 20000, 1000, 60000);
  const incomplete = incompleteToolSource(ev.input, ev.output, inputLimit, outputLimit);
  await db.sqlWrite(sql => sql.run(`INSERT INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,
    input,output,incomplete,received_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [ev.id, ev.session_id, ev.project_path, ev.agent_id, ev.tool_name, ev.success ? 1 : 0,
      boundToolText(ev.input, inputLimit), boundToolText(ev.output, outputLimit), incomplete ? 1 : 0, ev.timestamp]));
}

/** After a crash, legacy in-flight claims become frozen tasks again (retried, never lost). */
export async function recoverInterruptedClaims(db: DatabaseManager): Promise<number> {
  return db.sqlWrite(sql => sql.run(`UPDATE task_event_buffer SET task_result_id='task:' || substr(task_result_id, 7)
    WHERE task_result_id LIKE 'claim:%'`).changes || 0);
}

/** Sessions with open (unfrozen) activity whose LAST activity of any kind (candidate or evidence) is older than cutoff. */
export function openSessionsIdleSince(db: DatabaseManager, cutoffMs: number): string[] {
  return db.sqlAll(`SELECT session_id FROM (
      SELECT session_id, received_ms AS ms, (task_result_id IS NULL) AS open FROM task_event_buffer
      UNION ALL SELECT session_id, received_ms, (task_id IS NULL) FROM tool_evidence)
    GROUP BY session_id HAVING SUM(open) > 0 AND MAX(ms) <= ?`, [cutoffMs]).map(r => r.session_id);
}

/** Frozen tasks waiting for (re)consolidation, excluding those that exhausted their attempts.
 * Eligibility is whole-task: a task is done only once task_completions records it, not when any segment row exists. */
export function frozenTasks(db: DatabaseManager): { task_id: string; session_id: string }[] {
  return db.sqlAll(`SELECT t.task_id, t.session_id FROM (
      SELECT DISTINCT substr(task_result_id, 6) AS task_id, session_id FROM task_event_buffer WHERE task_result_id LIKE 'task:%'
      UNION SELECT DISTINCT task_id, session_id FROM tool_evidence e WHERE task_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM task_completions c WHERE c.task_id = e.task_id)) t
    LEFT JOIN task_attempts a ON a.task_id = t.task_id WHERE COALESCE(a.attempts, 0) < ?`, [MAX_TASK_ATTEMPTS]);
}

/**
 * Freeze the session's open events into a task at the moment the boundary arrives.
 * Events arriving later belong to the next task, even while this one is still queued.
 */
export async function freezeOpenTask(db: DatabaseManager, sessionId: string): Promise<string | null> {
  const taskId = randomUUID();
  const frozen = await db.sqlWrite(sql => {
    const a = sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE session_id=? AND task_result_id IS NULL`, ['task:' + taskId, sessionId]).changes || 0;
    const b = sql.run(`UPDATE tool_evidence SET task_id=? WHERE session_id=? AND task_id IS NULL`, [taskId, sessionId]).changes || 0;
    return a + b;
  });
  return frozen ? taskId : null;
}

export function renderEvent(row: any): { text: string; truncated: boolean } {
  const input = String(row.input ?? ''), output = String(row.output ?? '');
  const truncated = input.length > RENDER_INPUT_MAX || output.length > RENDER_OUTPUT_MAX;
  return { truncated, text: `## ${row.tool_name} (${row.success ? 'success' : 'FAILURE'})${row.incomplete || truncated ? ' [source abbreviated]' : ''}
[INPUT]
${boundToolText(input, RENDER_INPUT_MAX)}
[OUTPUT]
${boundToolText(output, RENDER_OUTPUT_MAX)}` };
}

/** Split a task's events into segments under the char budget (never splits one event). */
export function segmentEvents(rows: any[], budget = segmentCharBudget()): any[][] {
  const segments: any[][] = []; let current: any[] = []; let size = 0;
  for (const row of rows) {
    const len = renderEvent(row).text.length;
    if (current.length && size + len > budget) { segments.push(current); current = []; size = 0; }
    current.push(row); size += len;
  }
  if (current.length) segments.push(current);
  return segments;
}

const TASK_SYSTEM_PROMPT = `You are a developer memory synthesis assistant.
${WORK_MEMORY_PROMPT}
You receive ALL state-changing tool events of ONE agent task (or one segment of a very large task), plus an index of read-only inspections.
Produce ONE consolidated JSON record describing the task's result: what was changed, verified, decided, diagnosed or learned.
Merge repeated steps; do not list every command. Keep the narrative under 180 words, facts and concepts to at most 6 each, file lists to at most 15 each.
Only record evidence present in the events. Do not infer completed changes from intentions. Failures are recovery evidence.

You MUST respond with a valid JSON object ONLY.
JSON Schema:
{"record_kind":"outcome | context | skip","title":"...","narrative":"...","facts":[],"concepts":[],"files_read":[],"files_modified":[]}`;

export interface ConsolidationResult { task_id: string | null; segments: number; llm_calls: number; observations: string[]; duplicates: number; skipped: number; failed: number; }

const inflight = new Set<string>();
export function isTaskInFlight(taskId: string) { return inflight.has(taskId); }

function localDate(createdAt: string): string { return String(createdAt || '').slice(0, 10); }

/**
 * Consolidate one frozen task: one model call per segment (normally exactly one), one embedding per
 * saved result, one post-task review per task. Segments already saved are skipped on retry. Any
 * exception leaves the task frozen (not claimed) so it is retried; attempts are counted.
 */
export async function consolidateTask(db: DatabaseManager, taskId: string, trigger: TaskTrigger): Promise<ConsolidationResult> {
  const result: ConsolidationResult = { task_id: taskId, segments: 0, llm_calls: 0, observations: [], duplicates: 0, skipped: 0, failed: 0 };
  if (inflight.has(taskId)) return { ...result, task_id: null };
  inflight.add(taskId);
  try {
    // Segment over the task's full frozen event set (pending rows plus rows already attached to a saved
    // segment of this task) so segment indexes are stable across retries; a retry never renumbers.
    const rows = db.sqlAll(`SELECT * FROM task_event_buffer WHERE task_result_id=? OR task_result_id IN
      (SELECT id FROM task_results WHERE task_id=?) ORDER BY received_ms, rowid`, ['task:' + taskId, taskId]);
    const evidence = db.sqlAll(`SELECT id,session_id,project_path,agent_id,tool_name,success,input,created_at FROM tool_evidence
      WHERE task_id=? ORDER BY received_ms, rowid`, [taskId]);
    const done = new Set(db.sqlAll(`SELECT segment_index FROM task_results WHERE task_id=?`, [taskId]).map(r => r.segment_index));
    if (!rows.length && !evidence.length) return { ...result, task_id: null };
    const sessionId = (rows[0] || evidence[0]).session_id;
    const purpose = await db.getSessionPurpose(sessionId);
    let lastObservation: Observation | null = null;

    if (!rows.length) {
      // Investigation-only task: discoverable context result built from evidence, no model call.
      if (done.has(0)) { await markTaskComplete(db, taskId); return result; }
      await saveInvestigation(db, taskId, 0, sessionId, evidence, purpose, trigger, result);
      await markTaskComplete(db, taskId);
      return result;
    }

    const segments = segmentEvents(rows);
    result.segments = segments.length;
    const settings = resolveLlmSettings();
    const evidenceIndex = evidence.length ? `\n\n[READ-ONLY INSPECTIONS — ${evidence.length}, outputs kept as evidence]\n` +
      boundToolText(evidence.map(e => `- ${e.tool_name}: ${boundToolText(String(e.input), 120)}`).join('\n'), 2000) : '';
    for (let i = 0; i < segments.length; i++) {
      if (done.has(i)) continue;
      const seg = segments[i]; const first = seg[0];
      const resultId = `${taskId}-${i}`;
      const sourceIds = seg.map(r => r.id);
      const rendered = seg.map(renderEvent);
      let status = 'saved', observationId: string | null = null, contentHash: string | null = null, lastError: string | null = null, calls = 0;
      let parsed: ReturnType<typeof interpretWorkMemory> | null = null;
      const anyFailure = seg.some(r => !r.success);
      const anyIncomplete = seg.some(r => r.incomplete) || rendered.some(r => r.truncated);
      const existing = (await db.getObservationsByIds([resultId]))[0];
      if (existing) { observationId = existing.id; lastObservation = existing; result.observations.push(existing.id); }
      else if (purpose === 'daily_review') { status = 'skipped'; lastError = 'daily_review session'; }
      else {
        if (!llmAvailable(settings)) lastError = 'Missing LLM API credentials';
        else {
          try {
            calls++; result.llm_calls++;
            const user = `Session purpose: ${purpose}\nProject: ${first.project_path}\nAgent: ${first.agent_id}\nTrigger: ${trigger}\nSegment ${i + 1} of ${segments.length}, ${seg.length} events${anyIncomplete ? '\nNOTE: some event text below is abbreviated.' : ''}\n\n${rendered.map(r => r.text).join('\n\n')}${i === segments.length - 1 ? evidenceIndex : ''}`;
            parsed = interpretWorkMemory(await callLlmJson('observation', TASK_SYSTEM_PROMPT, user, settings), !anyFailure);
          } catch (err: any) { lastError = err.message; }
        }
        // An abbreviated or failing source can never be proven routine: no silent skip.
        if (parsed?.skip && (anyFailure || anyIncomplete)) {
          parsed.skip = false; parsed.kind = anyFailure ? 'outcome' : 'context';
          parsed.title ||= `Task with abbreviated source: ${[...new Set(seg.map(r => r.tool_name))].join(', ')}`;
        }
        if (parsed?.skip) { status = 'skipped'; result.skipped++; }
        else {
          const fallback = !parsed;
          const tools = [...new Set(seg.map(r => r.tool_name))].join(', ');
          const obs: Observation = {
            id: resultId, session_id: first.session_id, project_path: first.project_path, agent_id: first.agent_id,
            title: parsed?.title || `Task capture incomplete: ${tools}`,
            narrative: parsed?.narrative || `Memory synthesis unavailable; classification unknown. ${String(lastError || '').slice(0, 300)}\n` +
              seg.slice(-5).map(r => `${r.tool_name}: ${boundToolText(r.input, 300)} => ${boundToolText(r.output, 600)}`).join('\n'),
            facts: parsed?.facts || [`${seg.length} tool events (${tools})`], concepts: parsed?.concepts || ['task'],
            files_read: parsed?.files_read || [], files_modified: parsed?.files_modified || [], embedding: [],
            record_kind: fallback ? (anyFailure ? 'outcome' : 'context') : parsed!.kind, source_kind: 'task',
          };
          if (anyIncomplete && !fallback) obs.narrative += '\nSome source was abbreviated before synthesis; unshown content remains unknown.';
          if (segments.length > 1) obs.title = `${obs.title} (part ${i + 1}/${segments.length})`;
          contentHash = summaryHash(obs.project_path, obs, localDate(seg[seg.length - 1].created_at));
          const dup = db.sqlGet(`SELECT observation_id FROM observation_content_hashes WHERE project_path=? AND sha256=?`, [obs.project_path, contentHash]);
          if (dup) { status = 'duplicate'; observationId = dup.observation_id; result.duplicates++; }
          else {
            obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')} ${obs.concepts.join(' ')}`);
            await db.saveObservation(obs);
            await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO observation_content_hashes VALUES (?,?,?)`, [obs.id, obs.project_path, contentHash]));
            observationId = obs.id; lastObservation = obs; result.observations.push(obs.id);
            if (fallback) { status = 'fallback'; result.failed++; }
          }
        }
      }
      await db.sqlWrite(sql => {
        sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,
          source_ids,trigger,status,observation_id,content_sha256,llm_calls,last_error,evidence_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [resultId, taskId, first.session_id, first.project_path, first.agent_id, i, segments.length, seg.length,
            JSON.stringify(sourceIds), trigger, status, observationId, contentHash, calls, lastError, i === segments.length - 1 ? evidence.length : 0]);
        sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE id IN (${sourceIds.map(() => '?').join(',')})`, [resultId, ...sourceIds]);
      });
    }
    // Mixed task whose candidate segments were all skipped: keep the read-only evidence discoverable.
    const evidenceIndexSlot = segments.length;
    if (evidence.length && !result.observations.length && !done.has(evidenceIndexSlot)
        && !db.sqlGet(`SELECT 1 FROM task_results WHERE task_id=? AND observation_id IS NOT NULL LIMIT 1`, [taskId])) {
      await saveInvestigation(db, taskId, evidenceIndexSlot, sessionId, evidence, purpose, trigger, result);
    }
    await markTaskComplete(db, taskId);
    // Post-task review runs once per task, never per observation.
    if (lastObservation) await runAutomaticPostTaskReview(db, lastObservation).catch(err =>
      console.error(`[Memory] Post-task review failed after task capture: ${err.message}`));
    return result;
  } catch (err: any) {
    // Task stays frozen ('task:<id>'), so it is retried; attempts are bounded and visible.
    const sid = db.sqlGet(`SELECT session_id FROM task_event_buffer WHERE task_result_id=? LIMIT 1`, ['task:' + taskId])?.session_id
      || db.sqlGet(`SELECT session_id FROM tool_evidence WHERE task_id=? LIMIT 1`, [taskId])?.session_id || '';
    await db.sqlWrite(sql => sql.run(`INSERT INTO task_attempts (task_id,session_id,attempts,last_error,updated_ms) VALUES (?,?,1,?,?)
      ON CONFLICT(task_id) DO UPDATE SET attempts=attempts+1, last_error=excluded.last_error, updated_ms=excluded.updated_ms`,
      [taskId, sid, String(err.message).slice(0, 500), Date.now()])).catch(() => undefined);
    throw err;
  } finally { inflight.delete(taskId); }
}

async function markTaskComplete(db: DatabaseManager, taskId: string) {
  await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO task_completions (task_id, completed_ms) VALUES (?, ?)`, [taskId, Date.now()]));
}

async function saveInvestigation(db: DatabaseManager, taskId: string, index: number, sessionId: string, evidence: any[],
  purpose: string, trigger: TaskTrigger, result: ConsolidationResult): Promise<void> {
  const first = evidence[0]; const resultId = `${taskId}-${index}`;
  const tools = [...new Set(evidence.map(e => e.tool_name))].join(', ');
  const obs: Observation = { id: resultId, session_id: sessionId, project_path: first.project_path, agent_id: first.agent_id,
    title: `Read-only investigation: ${evidence.length} inspection(s) (${tools})`.slice(0, 200),
    narrative: 'Read-only inspections; outcome not synthesized. Full bounded evidence via work-evidence.\n' +
      evidence.slice(0, 20).map(e => `${e.tool_name}: ${boundToolText(String(e.input), 160)}`).join('\n'),
    facts: [`${evidence.length} read-only inspections`], concepts: ['investigation'], files_read: [], files_modified: [], embedding: [],
    record_kind: 'context', source_kind: 'task' };
  const existing = (await db.getObservationsByIds([resultId]))[0];
  if (!existing && purpose !== 'daily_review') {
    obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative}`);
    await db.saveObservation(obs);
  }
  await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,
    segment_count,event_count,source_ids,trigger,status,observation_id,llm_calls,evidence_count) VALUES (?,?,?,?,?,?,?,0,'[]',?,?,?,0,?)`,
    [resultId, taskId, sessionId, first.project_path, first.agent_id, index, index + 1, trigger,
      purpose === 'daily_review' ? 'skipped' : 'evidence_only', purpose === 'daily_review' ? null : resultId, evidence.length]));
  result.segments = Math.max(result.segments, index + 1);
  if (purpose !== 'daily_review') result.observations.push(resultId);
}

/** Freeze then consolidate whatever is open for a session (convenience for tests/CLI). */
export async function consolidateSession(db: DatabaseManager, sessionId: string, trigger: TaskTrigger): Promise<ConsolidationResult> {
  const taskId = await freezeOpenTask(db, sessionId);
  if (!taskId) return { task_id: null, segments: 0, llm_calls: 0, observations: [], duplicates: 0, skipped: 0, failed: 0 };
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
    return { session, items, segments: segmentEvents(asEvents) };
  });
  const summary = { mode: options.apply ? 'apply' : 'dry-run', days: options.days, since, legacy_rows: rows.length,
    sessions: plan.length, planned_llm_calls: plan.reduce((n, p) => n + p.segments.length, 0),
    planned_chars: plan.reduce((n, p) => n + p.segments.flat().reduce((m: number, e: any) => m + renderEvent(e).text.length, 0), 0),
    llm_calls: 0, results_saved: 0, rows_deleted: 0 };
  if (!options.apply) return summary;
  const settings = resolveLlmSettings();
  if (!llmAvailable(settings)) throw new Error('compact-legacy --apply requires LLM credentials');
  for (const p of plan) {
    const taskId = randomUUID();
    for (let i = 0; i < p.segments.length; i++) {
      const seg = p.segments[i]; const first = seg[0]; const resultId = randomUUID();
      summary.llm_calls++;
      const parsed = interpretWorkMemory(await callLlmJson('observation', TASK_SYSTEM_PROMPT,
        `Legacy per-step records of one session, segment ${i + 1}/${p.segments.length}\nProject: ${first.project_path}\n\n${seg.map(e => renderEvent(e).text).join('\n\n')}`, settings), true);
      let observationId: string | null = null; let status = 'skipped';
      if (!parsed.skip) {
        const obs: Observation = { id: resultId, session_id: p.session, project_path: first.project_path, agent_id: first.agent_id,
          title: parsed.title || 'Compacted legacy session', narrative: parsed.narrative, facts: parsed.facts, concepts: parsed.concepts,
          files_read: parsed.files_read, files_modified: parsed.files_modified, embedding: [], record_kind: parsed.kind,
          source_kind: 'legacy_compacted', created_at: seg[seg.length - 1].created_at };
        const hash = summaryHash(obs.project_path, obs, String(obs.created_at || '').slice(0, 10));
        const dup = db.sqlGet(`SELECT observation_id FROM observation_content_hashes WHERE project_path=? AND sha256=?`, [obs.project_path, hash]);
        if (dup) { observationId = dup.observation_id; status = 'duplicate'; }
        else {
          obs.embedding = await getEmbedding(`${obs.title} ${obs.narrative} ${obs.facts.join(' ')}`);
          await db.saveObservation(obs);
          await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO observation_content_hashes VALUES (?,?,?)`, [obs.id, obs.project_path, hash]));
          observationId = obs.id; status = 'saved'; summary.results_saved++;
        }
      }
      await db.sqlWrite(sql => {
        sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,
          source_ids,trigger,status,observation_id,llm_calls,source_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'legacy_compacted')`,
          [resultId, taskId, p.session, first.project_path, first.agent_id, i, p.segments.length, seg.length,
            JSON.stringify(seg.map((r: any) => r.id)), 'legacy_compaction', status, observationId]);
        for (const r of seg) sql.run(`INSERT OR IGNORE INTO legacy_compaction_links VALUES (?,?)`, [r.id, resultId]);
      });
    }
  }
  return summary;
}
