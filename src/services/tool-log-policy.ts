import { shouldSkipAgentMemoryToolLog } from '../hooks/agentmem-tool-filter';

export interface RawToolLog { tool_name: string; input?: unknown; output?: unknown; success: boolean; }

export function normalizeToolLogText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value) ?? '';
}

/** Transport evidence takes precedence over a caller's optimistic success flag. */
export function toolResponseSucceeded(response: unknown, reported = true): boolean {
  let value: any = response;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return reported; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reported;
  if (value.isError === true || value.success === false) return false;
  const exitCode = value.exit_code ?? value.exitCode;
  if (typeof exitCode === 'number' && exitCode !== 0) return false;
  if (typeof value.status === 'string' && /fail|error|cancel/i.test(value.status)) return false;
  return reported;
}

export function incompleteToolSource(input: string, output: string, inputLimit: number, outputLimit: number): boolean {
  const marker = /\[\.\.\. truncated by AgentMemory \.\.\.\]|Warning: truncated output \(original token count:|Total output (?:lines|tokens):[^\n]*\n[\s\S]*?(?:tokens truncated|output truncated)|\[.*?\b(?:tokens|characters|chars) truncated.*?\]/i;
  return input.length > inputLimit || output.length > outputLimit || marker.test(input) || marker.test(output);
}

// Only mechanically empty/housekeeping events are filtered before spending tokens.
// Reads and searches can contain useful discoveries; failures always retain evidence.
export function skipRawToolLog(log: RawToolLog): string | null {
  if (shouldSkipAgentMemoryToolLog(log.tool_name)) return 'AgentMemory self-recording';
  if (!log.success) return null;
  const name = String(log.tool_name || '').toLowerCase().split(/[.:/]/).pop() || '';
  if (/^(?:wait_agent|sleep|curr_time|clock__curr_time|update_plan)$/.test(name)) return 'housekeeping event';
  const empty = (value: unknown) => {
    const text = normalizeToolLogText(value).trim();
    return !text || /^(?:null|undefined|\{\}|\[\])$/.test(text);
  };
  if (empty(log.input) && empty(log.output)) return 'empty successful event';
  return null;
}
