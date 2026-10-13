import { createHash } from 'crypto';
import { skipRawToolLog, RawToolLog } from './tool-log-policy';

/**
 * Rule-based routing that runs BEFORE any model call or embedding.
 *  - drop:          mechanically empty/housekeeping or daily_review self-traffic.
 *  - evidence_only: read-only inspection; kept permanently as a tiny row, never sent to a model.
 *  - candidate:     may contain a result; buffered and consolidated once per task.
 */
export type EventRoute = 'drop' | 'evidence_only' | 'candidate';
export interface EventDecision { route: EventRoute; reason: string; }

const READ_TOOLS = new Set([
  'read', 'read_file', 'readfile', 'view', 'view_file', 'cat', 'glob', 'grep', 'search', 'list', 'ls', 'list_dir',
  'list_directory', 'find', 'find_files', 'search_files', 'codebase_search', 'file_search', 'web_search', 'websearch',
  'web_fetch', 'webfetch', 'fetch', 'get_file_contents', 'list_mcp_resources', 'read_mcp_resource', 'notebookread',
  'todoread', 'view_image', 'semantic_search', 'grep_search',
]);
const SHELL_TOOLS = new Set(['exec_command', 'shell', 'bash', 'run_terminal_cmd', 'powershell', 'local_shell',
  'run_command', 'terminal', 'run_shell_command', 'shell_command']);
const READ_ONLY_COMMAND = /^(?:ls|dir|tree|pwd|cd|cat|type|more|less|head|tail|wc|stat|file|du|df|which|where|whoami|echo|printf|rg|grep|egrep|fgrep|ag|find|fd|sed\s+-n|awk|sort|uniq|cut|jq|nl|diff|cmp|realpath|basename|dirname|date|env|printenv|git\s+(?:status|log|diff|show|branch|remote|rev-parse|ls-files|blame|describe|config\s+--get)|get-content|gc|get-childitem|gci|select-string|sls|get-item|get-location|test-path|resolve-path|measure-object|format-list|format-table|out-string|select-object|where-object)\b/i;

export function shortToolName(name: string): string {
  return String(name || '').toLowerCase().split(/[.:/]/).pop()?.replace(/^mcp__\w+__/, '') || '';
}

export function extractCommand(input: string): string {
  const text = String(input || '').trim();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    const value = parsed?.cmd ?? parsed?.command ?? parsed?.commandLine ?? parsed?.script;
    if (Array.isArray(value)) {
      // ["bash","-lc","..."] → last element is the script
      return String(value[value.length - 1] ?? '');
    }
    if (typeof value === 'string') return value;
  } catch { /* plain command text */ }
  return text;
}

export function isReadOnlyCommand(command: string): boolean {
  const script = command.replace(/\\\r?\n/g, ' ').trim();
  if (!script) return false;
  if (/(?:^|[^>])>{1,2}(?!&)\s*[^\s&|]|\btee\b|\bsed\s+-i|\bxargs\b|\$\(|`/.test(script)) return false;
  return script.split(/\s*(?:&&|\|\||;|\||\r?\n)\s*/).filter(Boolean).every(part => READ_ONLY_COMMAND.test(part.trim()));
}

export function classifyToolEvent(log: RawToolLog, sessionPurpose: string): EventDecision {
  if (sessionPurpose === 'daily_review') return { route: 'drop', reason: 'daily_review session self-traffic' };
  const mechanical = skipRawToolLog(log);
  if (mechanical) return { route: 'drop', reason: mechanical };
  if (!log.success) return { route: 'candidate', reason: 'tool failure is recovery evidence' };
  const name = shortToolName(log.tool_name);
  if (READ_TOOLS.has(name)) return { route: 'evidence_only', reason: 'read-only inspection tool' };
  if (SHELL_TOOLS.has(name) && isReadOnlyCommand(extractCommand(String(log.input ?? ''))))
    return { route: 'evidence_only', reason: 'read-only shell command' };
  return { route: 'candidate', reason: 'may change state or contain a result' };
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Stable content hash for dedup of summaries; whitespace/case-insensitive. */
export function summaryHash(projectPath: string, parts: { title?: string; narrative?: string; facts?: string[] }): string {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return sha256(JSON.stringify([norm(projectPath), norm(parts.title || ''), norm(parts.narrative || ''),
    [...(parts.facts || [])].map(norm).sort()]));
}
