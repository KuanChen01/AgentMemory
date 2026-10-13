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
// Command + argument rules. Anything not explicitly recognised as read-only is a candidate.
type ArgRule = (args: string[]) => boolean;
const any: ArgRule = () => true;
const noFlags = (...bad: RegExp[]): ArgRule => args => !args.some(a => bad.some(b => b.test(a)));
const READ_ONLY: Record<string, ArgRule> = {
  ls: any, dir: any, pwd: any, cd: any, cat: any, type: any, more: any, less: any, head: any, tail: noFlags(/^-f$|^--follow/),
  wc: any, stat: any, file: any, du: any, df: any, which: any, where: any, whoami: any, echo: any, printf: any,
  realpath: any, basename: any, dirname: any, printenv: any, nl: any, cut: any, jq: any, cmp: any,
  tree: noFlags(/^-o$/, /^--output/),
  diff: noFlags(/^--output/), grep: any, egrep: any, fgrep: any, ag: any,
  rg: noFlags(/^--pre(=|$)/),
  sort: noFlags(/^-o/, /^--output/),
  uniq: args => args.filter(a => !a.startsWith('-')).length <= 1,
  find: noFlags(/^-(delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/),
  fd: noFlags(/^-x$|^-X$|^--exec/),
  sed: args => args.includes('-n') && !args.some(a => /^-i|^--in-place|^-f$|^--file/.test(a)) && sedScripts(args).every(sedScriptIsReadOnly),
  'get-content': any, gc: any, 'get-childitem': any, gci: any, 'select-string': any, sls: any, 'get-item': any,
  'get-location': any, 'test-path': any, 'resolve-path': any, 'measure-object': any, 'format-list': any, 'format-table': any,
  'out-string': any, 'select-object': any,
};
/** All sed scripts: every -e/--expression argument, otherwise the first operand. */
function sedScripts(args: string[]): string[] {
  const scripts: string[] = []; let explicit = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-e' || args[i] === '--expression') { explicit = true; scripts.push(args[++i] ?? ''); }
    else if (args[i].startsWith('--expression=')) { explicit = true; scripts.push(args[i].slice(13)); }
    else if (/^-e./.test(args[i])) { explicit = true; scripts.push(args[i].slice(2)); }
  }
  if (!explicit) { const first = args.find(a => !a.startsWith('-')); if (first !== undefined) scripts.push(first); }
  return scripts;
}
function sedScriptIsReadOnly(script: string): boolean {
  // w/W (write file), e (execute), and s///w|e flags are side effects.
  return !/(^|[;\s{}0-9$\/,!])[wWe](\s|$)/.test(script) && !/\/[gpIiMm0-9]*[we]/.test(script.replace(/^[^s]*s/, 's'));
}

const GIT_READ_ONLY: Record<string, ArgRule> = {
  status: any, log: noFlags(/^--output/), show: noFlags(/^--output/), diff: noFlags(/^--output/), 'rev-parse': any,
  'ls-files': any, blame: any, describe: any, shortlog: any, 'cat-file': any, 'ls-tree': any, 'rev-list': any,
  branch: args => args.every(a => /^(-a|-r|-v|-vv|--all|--remotes|--list|--show-current|--no-color|--color|--contains|--merged|--no-merged)$/.test(a) || (!a.startsWith('-') && args.some(b => /^(--list|--contains|--merged|--no-merged)$/.test(b)))),
  remote: args => args.length === 0 || (args.length === 1 && /^(-v|--verbose)$/.test(args[0])) || args[0] === 'show' || args[0] === 'get-url',
  config: args => args.length >= 1 && /^(--get|--get-all|--list|-l|--get-regexp)$/.test(args[0]),
  tag: args => args.length === 0 || args.every(a => /^(-l|--list|-n\d*)$/.test(a)),
  stash: args => args[0] === 'list' || args[0] === 'show',
};

/** Shell-like tokenizer honouring single/double quotes. */
export function tokenize(segment: string): string[] {
  const tokens: string[] = []; let current = ''; let quote: string | null = null; let has = false;
  for (const ch of segment) {
    if (quote) { if (ch === quote) quote = null; else current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has || current) tokens.push(current); current = ''; has = false; continue; }
    current += ch;
  }
  if (has || current) tokens.push(current);
  return tokens;
}

/** Split on && || ; | and newlines outside quotes. */
function splitSegments(script: string): string[] {
  const parts: string[] = []; let current = ''; let quote: string | null = null;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && script[i + 1] === '&')) {
      parts.push(current); current = '';
      if ((ch === '|' && script[i + 1] === '|') || ch === '&') i++;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

function segmentIsReadOnly(segment: string): boolean {
  const tokens = tokenize(segment);
  if (!tokens.length) return true;
  const [rawCmd, ...args] = tokens;
  const cmd = rawCmd.toLowerCase().replace(/\.exe$/, '');
  if (cmd === 'git') {
    let i = 0;
    while (i < args.length && /^(-C|-c|--git-dir|--work-tree)$/.test(args[i])) i += 2;
    while (i < args.length && /^--no-pager$|^-P$/.test(args[i])) i++;
    const sub = args[i]; const rule = sub && GIT_READ_ONLY[sub];
    return !!rule && rule(args.slice(i + 1));
  }
  const rule = READ_ONLY[cmd];
  return !!rule && rule(args);
}

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
  // Single quotes are literal in bash and PowerShell; double quotes still expand $(...), backticks and
  // PowerShell subexpressions, so substitution checks only strip single-quoted text.
  const unsingle = script.replace(/'[^']*'/g, "''");
  if (/\$\(|`|<\(|\[[\w.]+\]::/.test(unsingle)) return false;
  const unquoted = unsingle.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if (/\btee\b|\bxargs\b/.test(unquoted)) return false;
  // Any redirection to a file (including 2>file) is a write; only fd duplication and null sinks are allowed.
  for (const m of unquoted.matchAll(/\d*>>?\s*(&\d|[^\s;&|]*)/g)) {
    if (!/^(&\d|\/dev\/null|\$null|nul)$/i.test(m[1])) return false;
  }
  if (/\b(remove|set|new|move|copy|rename|clear|add|start|stop|invoke|out-file|export|import)-[a-z]/i.test(script)) return false;
  return splitSegments(script).every(segmentIsReadOnly);
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

/** Stable content hash for dedup of summaries: content, file lists and local date. */
export function summaryHash(projectPath: string, parts: { title?: string; narrative?: string; facts?: string[];
  files_modified?: string[]; files_read?: string[] }, date = ''): string {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const list = (v?: string[]) => [...(v || [])].map(norm).sort();
  return sha256(JSON.stringify([norm(projectPath), norm(parts.title || ''), norm(parts.narrative || ''),
    list(parts.facts), list(parts.files_modified), list(parts.files_read), date]));
}
