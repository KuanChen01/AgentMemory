import { createHash } from 'crypto';
import { skipRawToolLog, RawToolLog } from './tool-log-policy';

/**
 * Rules keep only certain signals and run BEFORE any model call or embedding:
 *  - drop whole tool classes by tool name (todo/plan, skill loading, questions to the user),
 *    mechanically empty/housekeeping logs, and daily_review session self-traffic;
 *  - everything else is buffered unchanged for its task; the model decides value once per task.
 * There is deliberately no per-command read/write classification any more.
 */
export type EventRoute = 'drop' | 'task';
export interface EventDecision { route: EventRoute; reason: string; }

const SKIP_TOOL_CLASSES: { pattern: RegExp; reason: string }[] = [
  { pattern: /^(todo(_?write|_?read|_?list)?|update_plan|plan|exit_plan_mode|write_todos)$/, reason: 'todo/plan bookkeeping tool' },
  { pattern: /^(skill|load_skill|use_skill|read_skill|list_skills)$/, reason: 'skill loading tool' },
  { pattern: /^(ask_?user(_?question)?|askuserquestion|request_user_input(_?async)?|question|ask_followup_question)$/, reason: 'question to the user' },
];

export function shortToolName(name: string): string {
  return String(name || '').toLowerCase().split(/[.:/]/).pop()?.replace(/^mcp__\w+__/, '') || '';
}

export function classifyToolEvent(log: RawToolLog, sessionPurpose: string): EventDecision {
  if (sessionPurpose === 'daily_review') return { route: 'drop', reason: 'daily_review session self-traffic' };
  const mechanical = skipRawToolLog(log);
  if (mechanical) return { route: 'drop', reason: mechanical };
  const name = shortToolName(log.tool_name);
  const cls = SKIP_TOOL_CLASSES.find(c => c.pattern.test(name));
  if (cls && log.success) return { route: 'drop', reason: cls.reason };
  return { route: 'task', reason: 'buffered for whole-task synthesis' };
}

function patchTexts(input: string): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === 'string') { if (v.includes('*** ')) out.push(v); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  try { visit(JSON.parse(input)); } catch { /* not JSON */ }
  return out.length ? out : [input];
}

const EDIT_TOOLS = /^(apply_patch|edit|multiedit|multi_edit|write|write_file|create_file|str_replace|str_replace_editor|edit_file|replace|notebookedit)$/;

/** The "modified files" signal: paths named by edit tools (apply_patch headers or path arguments). */
export function modifiedFiles(toolName: string, input: string): string[] {
  const name = shortToolName(toolName);
  const files = new Set<string>();
  // Patch text may arrive raw or JSON-encoded; decode first so Windows paths (E:\\App\\x.ts) keep their backslashes.
  for (const text of patchTexts(String(input || ''))) {
    for (const m of text.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+?)\s*$/gm)) files.add(m[1].trim());
    for (const m of text.matchAll(/^\*\*\* Move to: (.+?)\s*$/gm)) files.add(m[1].trim());
  }
  if (EDIT_TOOLS.test(name)) {
    try {
      const parsed = JSON.parse(input);
      for (const key of ['file_path', 'path', 'filePath', 'notebook_path', 'target_file']) if (typeof parsed?.[key] === 'string') files.add(parsed[key]);
    } catch { /* plain patch text */ }
  }
  return [...files].filter(Boolean);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Stable content hash for dedup of summaries: content, file lists and local date. */
export function summaryHash(projectPath: string, parts: { title?: string; narrative?: string; facts?: string[];
  files_modified?: string[]; files_read?: string[] }, date = ''): string {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const list = (v?: string[]) => [...(v || [])].map(norm).sort();
  return sha256(JSON.stringify([norm(projectPath), norm(parts.title || ''), norm(parts.narrative || ''),
    list(parts.facts), list(parts.files_modified), list(parts.files_read), date]));
}
