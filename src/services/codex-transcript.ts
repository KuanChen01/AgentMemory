import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { DatabaseManager } from './db';
import { classifyToolEvent } from './event-classifier';
import { bufferEvent, freezeOpenTask, TaskTrigger } from './task-consolidation';

/**
 * Codex transcript reader. Codex writes each session to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 * We read it incrementally with a byte offset plus a content fingerprint (hash of the first line,
 * which never changes while the file grows), so a worker restart resumes exactly where it stopped,
 * a replaced/rotated file is detected and re-read from 0 (insert-once ids make that safe), and a file
 * moved to archived_sessions is found again by name + fingerprint.
 *
 * Task boundaries come from the transcript itself: every user message and every turn end.
 * Unknown formats are never guessed: the cursor is marked 'unsupported' and hook events stay the source.
 * Only paths the agent hook reports are read; nothing scans the user's sessions directory.
 */
export type TranscriptFormat = 'codex-rollout-v1' | 'codex-legacy' | 'unknown';
const ROLLOUT_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context', 'compacted']);
const LEGACY_TYPES = new Set(['message', 'function_call', 'function_call_output', 'reasoning', 'local_shell_call', 'custom_tool_call', 'custom_tool_call_output']);
const READ_CHUNK = 8 * 1024 * 1024;
const FINGERPRINT_MAX = 64 * 1024;

export function detectFormat(lines: string[]): TranscriptFormat {
  let rollout = 0, legacy = 0, parsed = 0;
  for (const line of lines.slice(0, 50)) {
    if (!line.trim()) continue;
    let value: any; try { value = JSON.parse(line); } catch { continue; }
    parsed++;
    if (ROLLOUT_TYPES.has(value?.type) && value.payload && typeof value.payload === 'object') rollout++;
    else if (LEGACY_TYPES.has(value?.type) || (value?.id && value?.timestamp && !value.type)) legacy++;
  }
  if (!parsed) return 'unknown';
  if (rollout && rollout >= parsed * 0.8) return 'codex-rollout-v1';
  if (legacy && legacy >= parsed * 0.8) return 'codex-legacy';
  return 'unknown';
}

function firstLine(filePath: string): { line: string; bytes: number } | null {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(FINGERPRINT_MAX);
    const n = fs.readSync(fd, buf, 0, FINGERPRINT_MAX, 0);
    const nl = buf.subarray(0, n).indexOf(0x0a);
    if (nl < 0) return null;
    return { line: buf.subarray(0, nl).toString('utf8'), bytes: nl + 1 };
  } finally { fs.closeSync(fd); }
}
export function fingerprintOf(filePath: string): string | null {
  const first = firstLine(filePath);
  return first ? createHash('sha256').update(first.line, 'utf8').digest('hex') : null;
}
function headLines(filePath: string, max = 50): string[] {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(256 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString('utf8'); const lines = text.split('\n');
    if (!text.endsWith('\n')) lines.pop();
    return lines.slice(0, max);
  } finally { fs.closeSync(fd); }
}

export function sessionUsesTranscript(db: DatabaseManager, sessionId: string): boolean {
  return !!db.sqlGet(`SELECT 1 FROM transcript_cursors WHERE session_id=? AND status IN ('active','missing') AND format != 'unknown' LIMIT 1`, [sessionId]);
}
export function activeTranscripts(db: DatabaseManager, sessionId?: string): { path: string; session_id: string }[] {
  return sessionId
    ? db.sqlAll(`SELECT path, session_id FROM transcript_cursors WHERE session_id=? AND status IN ('active','missing')`, [sessionId])
    : db.sqlAll(`SELECT path, session_id FROM transcript_cursors WHERE status IN ('active','missing')`);
}

/** Register the transcript the hook reported for a session. Unknown formats fall back to hook events. */
export async function registerTranscript(db: DatabaseManager, filePath: string, sessionId: string, projectPath: string) {
  const resolved = path.resolve(filePath);
  const existing = db.sqlGet(`SELECT * FROM transcript_cursors WHERE path=?`, [resolved]);
  if (existing) {
    if (!existing.session_id) await db.sqlWrite(sql => sql.run(`UPDATE transcript_cursors SET session_id=? WHERE path=?`, [sessionId, resolved]));
    return existing;
  }
  if (!fs.existsSync(resolved)) throw new Error('transcript file not found');
  const fingerprint = fingerprintOf(resolved) || '';
  const format = detectFormat(headLines(resolved));
  const size = fs.statSync(resolved).size;
  // Registered mid-session: earlier calls already arrived through hooks, so only read what comes next.
  const hookRows = db.sqlGet(`SELECT COUNT(*) AS n FROM task_event_buffer WHERE session_id=?`, [sessionId]).n;
  const offset = hookRows ? size : 0;
  await db.sqlWrite(sql => sql.run(`INSERT OR IGNORE INTO transcript_cursors (path,session_id,project_path,fingerprint,offset,size,format,status,updated_ms)
    VALUES (?,?,?,?,?,?,?,?,?)`, [resolved, sessionId, projectPath || null, fingerprint, offset, size, format,
      format === 'unknown' ? 'unsupported' : 'active', Date.now()]));
  return db.sqlGet(`SELECT * FROM transcript_cursors WHERE path=?`, [resolved]);
}

function locateMoved(cursorPath: string, fingerprint: string, roots: string[]): string | null {
  const name = path.basename(cursorPath);
  const walk = (dir: string, depth: number): string | null => {
    let entries: fs.Dirent[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === name && fingerprintOf(full) === fingerprint) return full;
      if (e.isDirectory() && depth > 0) { const hit = walk(full, depth - 1); if (hit) return hit; }
    }
    return null;
  };
  for (const root of roots) { const hit = walk(root, 4); if (hit) return hit; }
  return null;
}

function outputSucceeded(output: any): { text: string; success: boolean } {
  if (output && typeof output === 'object') {
    const text = typeof output.content === 'string' ? output.content : JSON.stringify(output);
    return { text, success: output.success !== false };
  }
  const text = String(output ?? '');
  try {
    const parsed = JSON.parse(text);
    const code = parsed?.metadata?.exit_code;
    if (typeof parsed?.output === 'string') return { text: parsed.output, success: code === undefined || code === 0 };
  } catch { /* plain text */ }
  return { text, success: !/^(error|failed|exec error)/i.test(text.trim()) };
}

interface ParseState { pending: Record<string, { name: string; input: string; ts: number }>; session_id: string; project_path: string; turn: number; }
type Step = { kind: 'call'; id: string; name: string; input: string; output: string; success: boolean; ts: number }
  | { kind: 'boundary'; trigger: TaskTrigger } | { kind: 'meta'; session_id?: string; project_path?: string } | { kind: 'other' };

function parseLine(value: any, format: TranscriptFormat, st: ParseState): Step {
  const ts = Date.parse(value?.timestamp) || Date.now();
  const item = format === 'codex-rollout-v1' ? (value?.type === 'response_item' ? value.payload : null) : value;
  if (format === 'codex-rollout-v1') {
    if (value?.type === 'session_meta') return { kind: 'meta', session_id: value.payload?.id, project_path: value.payload?.cwd };
    if (value?.type === 'event_msg') {
      const t = value.payload?.type;
      if (t === 'user_message') return { kind: 'boundary', trigger: 'user_prompt' };
      if (t === 'task_complete' || t === 'turn_complete' || t === 'turn_aborted') return { kind: 'boundary', trigger: 'turn_end' };
      return { kind: 'other' };
    }
  } else if (value?.type === 'message' && value.role === 'user') {
    const text = JSON.stringify(value.content || '');
    if (!/<environment_context>|<user_instructions>/.test(text)) return { kind: 'boundary', trigger: 'user_prompt' };
  }
  if (!item) return { kind: 'other' };
  if (item.type === 'function_call' || item.type === 'custom_tool_call' || item.type === 'local_shell_call') {
    const id = String(item.call_id || item.id || '');
    if (id) st.pending[id] = { name: String(item.name || (item.type === 'local_shell_call' ? 'local_shell' : 'tool')),
      input: typeof item.arguments === 'string' ? item.arguments : typeof item.input === 'string' ? item.input : JSON.stringify(item.arguments ?? item.input ?? item.action ?? ''), ts };
    return { kind: 'other' };
  }
  if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
    const id = String(item.call_id || '');
    const call = st.pending[id]; if (!call) return { kind: 'other' };
    delete st.pending[id];
    const out = outputSucceeded(item.output);
    return { kind: 'call', id, name: call.name, input: call.input, output: out.text, success: out.success, ts: call.ts };
  }
  return { kind: 'other' };
}

export interface SyncResult { path: string; status: string; format: TranscriptFormat; read_bytes: number; events: number;
  duplicates: number; boundaries: number; frozen_tasks: { task_id: string; session_id: string; trigger: TaskTrigger }[]; }

/** Read new complete lines of one registered transcript and turn them into buffered calls and frozen tasks. */
export async function syncTranscript(db: DatabaseManager, filePath: string, opts: { archiveRoots?: string[] } = {}): Promise<SyncResult> {
  let cursor = db.sqlGet(`SELECT * FROM transcript_cursors WHERE path=?`, [path.resolve(filePath)]);
  if (!cursor) throw new Error('transcript not registered');
  const out: SyncResult = { path: cursor.path, status: cursor.status, format: cursor.format, read_bytes: 0, events: 0, duplicates: 0, boundaries: 0, frozen_tasks: [] };
  if (cursor.format === 'unknown' || !['active', 'missing'].includes(cursor.status)) return out;
  if (!fs.existsSync(cursor.path)) {
    const moved = locateMoved(cursor.path, cursor.fingerprint, opts.archiveRoots || []);
    if (!moved) {
      await db.sqlWrite(sql => sql.run(`UPDATE transcript_cursors SET status='missing', updated_ms=? WHERE path=?`, [Date.now(), cursor.path]));
      out.status = 'missing'; return out;
    }
    // Archived/moved: continue at the same offset under the new path; the old row is kept as history.
    await db.sqlWrite(sql => {
      sql.run(`INSERT OR IGNORE INTO transcript_cursors (path,session_id,project_path,fingerprint,offset,size,format,status,pending_json,turn,moved_from,updated_ms)
        VALUES (?,?,?,?,?,?,?,'active',?,?,?,?)`, [moved, cursor.session_id, cursor.project_path, cursor.fingerprint, cursor.offset, cursor.size,
          cursor.format, cursor.pending_json, cursor.turn, cursor.path, Date.now()]);
      sql.run(`UPDATE transcript_cursors SET status='moved', updated_ms=? WHERE path=?`, [Date.now(), cursor.path]);
    });
    cursor = db.sqlGet(`SELECT * FROM transcript_cursors WHERE path=?`, [moved]);
    out.path = moved;
  }
  const fp = fingerprintOf(cursor.path);
  if (!fp) return out;                                     // first line not complete yet
  let offset = Number(cursor.offset) || 0;
  let pending = JSON.parse(cursor.pending_json || '{}');
  let turn = Number(cursor.turn) || 0;
  const size = fs.statSync(cursor.path).size;
  if (cursor.fingerprint && fp !== cursor.fingerprint) {   // replaced by a different file: re-read from 0
    offset = 0; pending = {};
    await db.sqlWrite(sql => sql.run(`UPDATE transcript_cursors SET fingerprint=?, moved_from=? WHERE path=?`, [fp, 'replaced:' + cursor.fingerprint, cursor.path]));
  } else if (size < offset) { offset = 0; pending = {}; }  // truncated/rotated in place
  const st: ParseState = { pending, session_id: cursor.session_id || '', project_path: cursor.project_path || '', turn };
  const fd = fs.openSync(cursor.path, 'r');
  let unknownLines = 0, knownLines = 0;
  try {
    while (offset < size) {
      const len = Math.min(READ_CHUNK, size - offset);
      const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, offset);
      const lastNl = buf.lastIndexOf(0x0a);
      if (lastNl < 0) break;                               // only a partial line: wait for more
      const lines = buf.subarray(0, lastNl + 1).toString('utf8').split('\n'); lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let value: any; try { value = JSON.parse(line); } catch { unknownLines++; continue; }
        const step = parseLine(value, cursor.format, st);
        if (step.kind === 'other' && !(ROLLOUT_TYPES.has(value?.type) || LEGACY_TYPES.has(value?.type) || (value?.id && value?.timestamp))) unknownLines++;
        else knownLines++;
        if (step.kind === 'meta') { st.session_id ||= step.session_id || ''; st.project_path ||= step.project_path || ''; }
        if (step.kind === 'call' && st.session_id) {
          const ev = { id: `codex:${st.session_id}:${step.id}`, session_id: st.session_id, project_path: st.project_path || 'unknown',
            agent_id: 'codex', tool_name: step.name, input: step.input, output: step.output, success: step.success, timestamp: step.ts };
          const purpose = await db.getSessionPurpose(st.session_id);
          if (classifyToolEvent(ev, purpose).route === 'drop') continue;
          if (await bufferEvent(db, ev)) out.events++; else out.duplicates++;
        }
        if (step.kind === 'boundary' && st.session_id) {
          out.boundaries++;
          const taskId = `codex-${createHash('sha256').update(`${cursor.fingerprint || fp}:${st.turn}`).digest('hex').slice(0, 24)}`;
          st.turn++;
          const frozen = await freezeOpenTask(db, st.session_id, taskId);
          if (frozen) out.frozen_tasks.push({ task_id: frozen, session_id: st.session_id, trigger: step.trigger });
        }
      }
      offset += lastNl + 1; out.read_bytes += lastNl + 1;
    }
  } finally { fs.closeSync(fd); }
  // Format drift: if most new lines are unrecognised, stop trusting the transcript and fall back to hooks.
  const status = unknownLines > 10 && unknownLines > knownLines ? 'unsupported' : 'active';
  await db.sqlWrite(sql => sql.run(`UPDATE transcript_cursors SET offset=?, size=?, pending_json=?, turn=?, status=?, session_id=COALESCE(session_id, ?),
    project_path=COALESCE(project_path, ?), updated_ms=? WHERE path=?`,
    [offset, size, JSON.stringify(st.pending), st.turn, status, st.session_id || null, st.project_path || null, Date.now(), cursor.path]));
  out.status = status;
  return out;
}
