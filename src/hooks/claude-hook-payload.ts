import { toolResponseSucceeded } from '../services/tool-log-policy';

export interface ClaudeToolLogPayload {
  session_id: string;
  project_path: string;
  agent_id: 'claudecode';
  tool_name: string;
  call_id?: string;
  input: unknown;
  output: unknown;
  success: boolean;
}

/**
 * Maps a Claude Code PostToolUse hook payload (documented fields: session_id, cwd,
 * tool_name, tool_input, tool_response, tool_use_id) to the worker /tools body.
 * Older ad-hoc field names are kept as fallbacks.
 */
export function buildClaudeToolLog(payload: Record<string, any>, fallbackCwd = process.cwd()): ClaudeToolLogPayload {
  const toolName = String(firstDefined(payload.tool_name, payload.toolName, payload.tool, 'unknown-tool'));
  const input = firstDefined(payload.tool_input, payload.input, payload.arguments, payload.args, {});
  const output = firstDefined(payload.tool_response, payload.output, payload.result, payload.response, '');
  const reported = payload.success !== false && payload.isError !== true && payload.is_error !== true;
  const success = isObject(output) && output.is_error === true ? false : toolResponseSucceeded(output, reported);
  const cwd = typeof payload.cwd === 'string' && payload.cwd.trim() ? payload.cwd : fallbackCwd;
  const callId = firstDefined(payload.tool_use_id, payload.toolUseId, payload.call_id);
  const body: ClaudeToolLogPayload = {
    session_id: String(firstDefined(payload.session_id, payload.sessionId, payload.uuid, 'global-session')),
    project_path: String(cwd).replace(/\\/g, '/'),
    agent_id: 'claudecode',
    tool_name: toolName,
    input,
    output,
    success,
  };
  if (callId !== undefined) body.call_id = String(callId);
  return body;
}

function firstDefined(...values: unknown[]): any {
  return values.find((value) => value !== undefined && value !== null);
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
