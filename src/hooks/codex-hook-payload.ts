import path from 'path';
import { toolResponseSucceeded } from '../services/tool-log-policy';

export interface CodexToolLogPayload {
  input: unknown;
  output: string;
  projectPath: string;
  sessionId: string;
  success: boolean;
  toolName: string;
}

export function parseCodexPostToolPayload(
  payload: Record<string, any>,
  fallbackCwd = process.cwd()
): CodexToolLogPayload {
  const input = firstDefined(
    payload.tool_input,
    payload.command,
    payload.input,
    payload.arguments,
    payload.args,
    {}
  );
  const response = firstDefined(
    payload.tool_response,
    payload.tool_output,
    payload.output,
    payload.result,
    payload.response,
    ''
  );

  return {
    toolName: String(firstDefined(payload.tool_name, payload.toolName, payload.tool, 'unknown-tool')),
    input,
    output: typeof response === 'string' ? response : JSON.stringify(response),
    success: resolveSuccess(payload, response),
    sessionId: String(firstDefined(payload.session_id, payload.sessionId, payload.uuid, 'global-session')),
    projectPath: path.resolve(payload.cwd || fallbackCwd).replace(/\\/g, '/'),
  };
}

function firstDefined(...values: unknown[]): any {
  return values.find((value) => value !== undefined && value !== null);
}

function resolveSuccess(payload: Record<string, any>, response: any): boolean {
  return toolResponseSucceeded(response, payload.success !== false && payload.isError !== true);
}
