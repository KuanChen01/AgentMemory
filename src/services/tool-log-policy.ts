import { shouldSkipAgentMemoryToolLog } from '../hooks/agentmem-tool-filter';

export interface RawToolLog { tool_name: string; input?: unknown; output?: unknown; success: boolean; }

export function normalizeToolLogText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value) ?? '';
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
