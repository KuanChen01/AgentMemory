import fs from 'fs';
import os from 'os';
import path from 'path';

export const DEFAULT_LLM_API_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_LLM_MODEL = 'deepseek-chat';
const AGENTMEM_ENV_FILE = path.join('.agentmem', '.env');

export interface LlmConfigSnapshot {
  apiKeyMasked: string;
  apiUrl: string;
  disableJsonMode: boolean;
  envPath: string;
  exists: boolean;
  hasApiKey: boolean;
  headers: string;
  isLocalEndpoint: boolean;
  model: string;
}

export interface LlmConfigUpdate {
  apiKey?: string;
  apiUrl?: string;
  disableJsonMode?: boolean;
  headers?: string;
  model?: string;
}

export interface LlmConnectionTestResult {
  contentPreview?: string;
  error?: string;
  latencyMs: number;
  model: string;
  ok: boolean;
  requestUrl: string;
  status?: number;
  testedAt: string;
}

export function getAgentMemoryEnvPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENTMEM_ENV_PATH || path.join(os.homedir(), AGENTMEM_ENV_FILE);
}

function maskApiKey(apiKey?: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return 'set';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function normalizeApiUrl(value?: string): string {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_LLM_API_URL;
}

function normalizeModel(value?: string): string {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_LLM_MODEL;
}

function normalizeHeaders(value?: string): string {
  return String(value || '').trim();
}

function isLocalEndpoint(apiUrl: string): boolean {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])/i.test(apiUrl);
}

function readEnvText(envPath: string): string {
  try {
    return fs.readFileSync(envPath, 'utf8');
  } catch (error: any) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function parseEnvText(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    parsed[key] = rawValue.replace(/^"(.*)"$/, '$1');
  }
  return parsed;
}

function formatEnvValue(value: string): string {
  if (!/[#\s"'\\]/.test(value)) return value;
  return JSON.stringify(value);
}

function upsertEnvText(text: string, updates: Record<string, string | undefined>): string {
  const touched = new Set<string>();
  const lines = text ? text.split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    touched.add(key);
    return `${key}=${formatEnvValue(String(updates[key] || ''))}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!touched.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(String(value || ''))}`);
    }
  }

  return `${nextLines.join('\n').replace(/\n*$/, '')}\n`;
}

function applyConfigToProcessEnv(snapshot: Pick<LlmConfigSnapshot, 'apiUrl' | 'disableJsonMode' | 'headers' | 'model'> & { apiKey?: string }) {
  if (snapshot.apiKey !== undefined) {
    process.env.AGENTMEM_LLM_API_KEY = snapshot.apiKey;
  }
  process.env.AGENTMEM_LLM_API_URL = snapshot.apiUrl;
  process.env.AGENTMEM_LLM_MODEL = snapshot.model;
  process.env.AGENTMEM_LLM_DISABLE_JSON_MODE = snapshot.disableJsonMode ? 'true' : 'false';
  if (snapshot.headers) {
    process.env.AGENTMEM_LLM_HEADERS = snapshot.headers;
  } else {
    delete process.env.AGENTMEM_LLM_HEADERS;
  }
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfigSnapshot {
  const envPath = getAgentMemoryEnvPath(env);
  const text = readEnvText(envPath);
  const parsed = parseEnvText(text);
  const apiKey = parsed.AGENTMEM_LLM_API_KEY || env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || '';
  const apiUrl = normalizeApiUrl(parsed.AGENTMEM_LLM_API_URL || env.AGENTMEM_LLM_API_URL || env.DEEPSEEK_API_URL);
  const model = normalizeModel(parsed.AGENTMEM_LLM_MODEL || env.AGENTMEM_LLM_MODEL);
  const headers = normalizeHeaders(parsed.AGENTMEM_LLM_HEADERS || env.AGENTMEM_LLM_HEADERS);
  const disableJsonMode = String(
    parsed.AGENTMEM_LLM_DISABLE_JSON_MODE ?? env.AGENTMEM_LLM_DISABLE_JSON_MODE ?? 'false'
  ).toLowerCase() === 'true';

  return {
    apiKeyMasked: maskApiKey(apiKey),
    apiUrl,
    disableJsonMode,
    envPath,
    exists: Boolean(text),
    hasApiKey: Boolean(apiKey),
    headers,
    isLocalEndpoint: isLocalEndpoint(apiUrl),
    model,
  };
}

export function saveLlmConfig(update: LlmConfigUpdate): LlmConfigSnapshot {
  const envPath = getAgentMemoryEnvPath();
  const currentText = readEnvText(envPath);
  const current = parseEnvText(currentText);
  const nextApiUrl = normalizeApiUrl(update.apiUrl ?? current.AGENTMEM_LLM_API_URL ?? process.env.AGENTMEM_LLM_API_URL);
  const nextModel = normalizeModel(update.model ?? current.AGENTMEM_LLM_MODEL ?? process.env.AGENTMEM_LLM_MODEL);
  const nextHeaders = normalizeHeaders(update.headers ?? current.AGENTMEM_LLM_HEADERS ?? process.env.AGENTMEM_LLM_HEADERS);
  const nextDisableJsonMode = Boolean(update.disableJsonMode);
  const nextApiKey = typeof update.apiKey === 'string' && update.apiKey.trim()
    ? update.apiKey.trim()
    : current.AGENTMEM_LLM_API_KEY || process.env.AGENTMEM_LLM_API_KEY || '';
  parseCustomHeaders(nextHeaders);

  const updates: Record<string, string | undefined> = {
    AGENTMEM_LLM_API_URL: nextApiUrl,
    AGENTMEM_LLM_MODEL: nextModel,
    AGENTMEM_LLM_DISABLE_JSON_MODE: nextDisableJsonMode ? 'true' : 'false',
  };
  if (nextApiKey) {
    updates.AGENTMEM_LLM_API_KEY = nextApiKey;
  }
  updates.AGENTMEM_LLM_HEADERS = nextHeaders;

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, upsertEnvText(currentText, updates), 'utf8');
  applyConfigToProcessEnv({
    apiKey: nextApiKey || undefined,
    apiUrl: nextApiUrl,
    disableJsonMode: nextDisableJsonMode,
    headers: nextHeaders,
    model: nextModel,
  });

  return readLlmConfig();
}

function buildChatCompletionsUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/chat/completions`;
}

function parseCustomHeaders(headersText: string): Record<string, string> {
  if (!headersText) return {};
  const parsed = JSON.parse(headersText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AGENTMEM_LLM_HEADERS must be a JSON object.');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)])
  );
}

export async function testLlmConnection(
  override: LlmConfigUpdate = {}
): Promise<LlmConnectionTestResult> {
  const saved = readLlmConfig();
  const apiUrl = normalizeApiUrl(override.apiUrl || saved.apiUrl);
  const model = normalizeModel(override.model || saved.model);
  const apiKey = typeof override.apiKey === 'string' && override.apiKey.trim()
    ? override.apiKey.trim()
    : process.env.AGENTMEM_LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const headersText = normalizeHeaders(override.headers ?? saved.headers);
  const requestUrl = buildChatCompletionsUrl(apiUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    if (!apiKey && !isLocalEndpoint(apiUrl)) {
      return {
        error: 'AGENTMEM_LLM_API_KEY is required for non-local endpoints.',
        latencyMs: Date.now() - startedAt,
        model,
        ok: false,
        requestUrl,
        testedAt: new Date().toISOString(),
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...parseCustomHeaders(headersText),
    };
    if (!headers.Authorization && !headers.authorization && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(requestUrl, {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [
          { role: 'system', content: 'Reply with exactly: ok' },
          { role: 'user', content: 'Connection test.' },
        ],
        model,
        temperature: 0,
      }),
      headers,
      method: 'POST',
      signal: controller.signal,
    });

    const text = await response.text();
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        error: text.slice(0, 500) || response.statusText,
        latencyMs,
        model,
        ok: false,
        requestUrl,
        status: response.status,
        testedAt: new Date().toISOString(),
      };
    }

    let contentPreview = text.slice(0, 160);
    try {
      const payload = JSON.parse(text);
      contentPreview = String(payload.choices?.[0]?.message?.content || contentPreview).slice(0, 160);
    } catch (_error) {
      // Keep the raw preview when the provider returns non-JSON success content.
    }

    return {
      contentPreview,
      latencyMs,
      model,
      ok: true,
      requestUrl,
      status: response.status,
      testedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      error: error.name === 'AbortError' ? 'Connection test timed out after 15 seconds.' : error.message,
      latencyMs: Date.now() - startedAt,
      model,
      ok: false,
      requestUrl,
      testedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
