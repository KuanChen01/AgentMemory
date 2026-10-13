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

const EVIDENCE_HEAD = 400;

/** evidence_only: tiny permanent row, no model call, no embedding. */
export async function saveToolEvidence(db: DatabaseManager, ev: IncomingToolEvent, decision: EventDecision) {
  await db.sqlWrite(sql => sql.run(`INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,
    route_reason,input_head,output_head,input_bytes,output_bytes,source_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ev.id, ev.session_id, ev.project_path, ev.agent_id, ev.tool_name, ev.success ? 1 : 0, decision.reason,
      boundToolText(ev.input, EVIDENCE_HEAD), boundToolText(ev.output, EVIDENCE_HEAD),
      Buffer.byteLength(ev.input), Buffer.byteLength(ev.output), sha256(ev.input + '\u0000' + ev.output)]));
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

/** After a crash, unfinished claims return to the open buffer (nothing is lost or re-summarized twice). */
export async function recoverInterruptedClaims(db: DatabaseManager): Promise<number> {
  return db.sqlWrite(sql => sql.run(`UPDATE task_event_buffer SET task_result_id=NULL WHERE task_result_id LIKE 'claim:%'`).changes || 0);
}

export function openSessionsIdleSince(db: DatabaseManager, cutoffMs: number): string[] {
  return db.sqlAll(`SELECT session_id FROM task_event_buffer WHERE task_result_id IS NULL
    GROUP BY session_id HAVING MAX(received_ms) <= ?`, [cutoffMs]).map(r => r.session_id);
}

function renderEvent(row: any): string {
  return `## ${row.tool_name} (${row.success ? 'success' : 'FAILURE'})${row.incomplete ? ' [source abbreviated]' : ''}
[INPUT]
${boundToolText(row.input, 3000)}
[OUTPUT]
${boundToolText(row.output, 6000)}`;
}

/** Split a task's events into segments under the char budget (never splits one event). */
export function segmentEvents(rows: any[], budget = segmentCharBudget()): any[][] {
  const segments: any[][] = []; let current: any[] = []; let size = 0;
  for (const row of rows) {
    const len = renderEvent(row).length;
    if (current.length && size + len > budget) { segments.push(current); current = []; size = 0; }
    current.push(row); size += len;
  }
  if (current.length) segments.push(current);
  return segments;
}

const TASK_SYSTEM_PROMPT = `You are a developer memory synthesis assistant.
${WORK_MEMORY_PROMPT}
You receive ALL tool events of ONE agent task (or one segment of a very large task).
Produce ONE consolidated JSON record describing the task's result: what was changed, verified, decided or learned.
Merge repeated steps; do not list every command. Keep the narrative under 180 words, facts and concepts to at most 6 each, file lists to at most 15 each.
Only record evidence present in the events. Do not infer completed changes from intentions. Failures are recovery evidence.

You MUST respond with a valid JSON object ONLY.
JSON Schema:
{"record_kind":"outcome | context | skip","title":"...","narrative":"...","facts":[],"concepts":[],"files_read":[],"files_modified":[]}`;

export interface ConsolidationResult { task_id: string | null; segments: number; llm_calls: number; observations: string[]; duplicates: number; skipped: number; failed: number; }

const locks = new Set<string>();

/**
 * Consolidate every open buffered event of a session into task-level results:
 * one model call per segment (normally exactly one per task), one embedding per
 * saved result, one post-task review per task. Source rows are kept and linked.
 */
export async function consolidateSession(db: DatabaseManager, sessionId: string, trigger: TaskTrigger): Promise<ConsolidationResult> {
  const empty: ConsolidationResult = { task_id: null, segments: 0, llm_calls: 0, observations: [], duplicates: 0, skipped: 0, failed: 0 };
  if (locks.has(sessionId)) return empty;
  locks.add(sessionId);
  try {
    const taskId = randomUUID();
    // Claim atomically so concurrent triggers cannot summarize the same events twice.
    const rows = await db.sqlWrite(sql => {
      const open = sql.all(`SELECT * FROM task_event_buffer WHERE session_id=? AND task_result_id IS NULL ORDER BY received_ms, rowid`, [sessionId]);
      for (const r of open) sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE id=? AND task_result_id IS NULL`, ['claim:' + taskId, r.id]);
      return open;
    });
    if (!rows.length) return empty;
    const segments = segmentEvents(rows);
    const result: ConsolidationResult = { ...empty, task_id: taskId, segments: segments.length };
    const purpose = await db.getSessionPurpose(sessionId);
    const settings = resolveLlmSettings();
    let lastObservation: Observation | null = null;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]; const first = seg[0];
      const resultId = randomUUID();
      const sourceIds = seg.map(r => r.id);
      let status = 'saved', observationId: string | null = null, contentHash: string | null = null, lastError: string | null = null, calls = 0;
      let parsed: ReturnType<typeof interpretWorkMemory> | null = null;
      const anyFailure = seg.some(r => !r.success), anyIncomplete = seg.some(r => r.incomplete);
      if (purpose === 'daily_review') { status = 'skipped'; lastError = 'daily_review session'; }
      else if (!llmAvailable(settings)) { lastError = 'Missing LLM API credentials'; }
      else {
        try {
          calls++; result.llm_calls++;
          const user = `Session purpose: ${purpose}\nProject: ${first.project_path}\nAgent: ${first.agent_id}\nTrigger: ${trigger}\nSegment ${i + 1} of ${segments.length}, ${seg.length} events\n\n${seg.map(renderEvent).join('\n\n')}`;
          parsed = interpretWorkMemory(await callLlmJson('observation', TASK_SYSTEM_PROMPT, user, settings), !anyFailure);
        } catch (err: any) { lastError = err.message; }
      }
      if (status !== 'skipped') {
        if (parsed?.skip && (anyFailure || anyIncomplete)) { parsed.skip = false; parsed.kind = anyFailure ? 'outcome' : 'context'; }
        if (parsed?.skip) { status = 'skipped'; result.skipped++; }
        else {
          const fallback = !parsed;
          const tools = [...new Set(seg.map(r => r.tool_name))].join(', ');
          const obs: Observation = {
            id: resultId, session_id: sessionId, project_path: first.project_path, agent_id: first.agent_id,
            title: parsed?.title || `Task capture incomplete: ${tools}`,
            narrative: parsed?.narrative || `Memory synthesis unavailable; classification unknown. ${String(lastError || '').slice(0, 300)}\n` +
              seg.slice(-5).map(r => `${r.tool_name}: ${boundToolText(r.input, 300)} => ${boundToolText(r.output, 600)}`).join('\n'),
            facts: parsed?.facts || [`${seg.length} tool events (${tools})`], concepts: parsed?.concepts || ['task'],
            files_read: parsed?.files_read || [], files_modified: parsed?.files_modified || [], embedding: [],
            record_kind: fallback ? (anyFailure ? 'outcome' : 'context') : parsed!.kind, source_kind: 'task',
          };
          if (anyIncomplete && !fallback) obs.narrative += '\nSome source was abbreviated before synthesis; unshown content remains unknown.';
          if (segments.length > 1) obs.title = `${obs.title} (part ${i + 1}/${segments.length})`;
          contentHash = summaryHash(obs.project_path, obs);
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
          source_ids,trigger,status,observation_id,content_sha256,llm_calls,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [resultId, taskId, sessionId, first.project_path, first.agent_id, i, segments.length, seg.length,
            JSON.stringify(sourceIds), trigger, status, observationId, contentHash, calls, lastError]);
        sql.run(`UPDATE task_event_buffer SET task_result_id=? WHERE id IN (${sourceIds.map(() => '?').join(',')})`, [resultId, ...sourceIds]);
      });
    }
    // Post-task review runs once per task, never per observation.
    if (lastObservation) await runAutomaticPostTaskReview(db, lastObservation).catch(err =>
      console.error(`[Memory] Post-task review failed after task capture: ${err.message}`));
    return result;
  } finally { locks.delete(sessionId); }
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
    planned_chars: plan.reduce((n, p) => n + p.segments.flat().reduce((m: number, e: any) => m + renderEvent(e).length, 0), 0),
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
        `Legacy per-step records of one session, segment ${i + 1}/${p.segments.length}\nProject: ${first.project_path}\n\n${seg.map(renderEvent).join('\n\n')}`, settings), true);
      let observationId: string | null = null; let status = 'skipped';
      if (!parsed.skip) {
        const obs: Observation = { id: resultId, session_id: p.session, project_path: first.project_path, agent_id: first.agent_id,
          title: parsed.title || 'Compacted legacy session', narrative: parsed.narrative, facts: parsed.facts, concepts: parsed.concepts,
          files_read: parsed.files_read, files_modified: parsed.files_modified, embedding: [], record_kind: parsed.kind,
          source_kind: 'legacy_compacted', created_at: seg[seg.length - 1].created_at };
        const hash = summaryHash(obs.project_path, obs);
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
