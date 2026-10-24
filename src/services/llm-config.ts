import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { llmBudgetOptions, recordLlmUsage, readLlmBudgetConfig, MIN_OUTPUT_BUDGET, MAX_OUTPUT_BUDGET } from './llm-budget';

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
  outputBudgetEnabled: boolean;
  observationMaxTokens: number;
  digestMaxTokens: number;
}

export interface LlmConfigUpdate {
  apiKey?: string;
  apiUrl?: string;
  disableJsonMode?: boolean;
  headers?: string;
  model?: string;
  outputBudgetEnabled?: boolean;
  observationMaxTokens?: number;
  digestMaxTokens?: number;
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
  const parsed = dotenv.parse(text);
  const lastValues = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) lastValues.set(match[1], match[2]);
  }
  for (const [key, rawValue] of lastValues) {
    if (!rawValue.startsWith('"') || !rawValue.endsWith('"')) continue;
    try { parsed[key] = JSON.parse(rawValue); } catch { /* Retain dotenv syntax for non-JSON quoting. */ }
  }
  return parsed;
}

// Read the JSON-quoted values written by this module the same way at startup
// and in the admin API. Preserve explicit environment overrides; also repair
// values inherited from a launcher which already loaded this file via dotenv.
export function loadAgentMemoryEnv(env: NodeJS.ProcessEnv = process.env): void {
  const text = readEnvText(getAgentMemoryEnvPath(env));
  const original = dotenv.parse(text);
  const parsed = parseEnvText(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined || (env[key] === original[key] && value !== original[key])) {
      env[key] = value;
    }
  }
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

function applyConfigToProcessEnv(snapshot: Pick<LlmConfigSnapshot, 'apiUrl' | 'disableJsonMode' | 'headers' | 'model' | 'outputBudgetEnabled' | 'observationMaxTokens' | 'digestMaxTokens'> & { apiKey?: string }) {
  if (snapshot.apiKey !== undefined) {
    process.env.AGENTMEM_LLM_API_KEY = snapshot.apiKey;
  }
  process.env.AGENTMEM_LLM_API_URL = snapshot.apiUrl;
  process.env.AGENTMEM_LLM_MODEL = snapshot.model;
  process.env.AGENTMEM_LLM_DISABLE_JSON_MODE = snapshot.disableJsonMode ? 'true' : 'false';
  process.env.AGENTMEM_OUTPUT_BUDGET_ENABLED = String(snapshot.outputBudgetEnabled);
  process.env.AGENTMEM_OBSERVATION_MAX_TOKENS = String(snapshot.observationMaxTokens);
  process.env.AGENTMEM_DIGEST_MAX_TOKENS = String(snapshot.digestMaxTokens);
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
    ...readLlmBudgetConfig({ ...env, ...parsed }),
  };
}

export function saveLlmConfig(update: LlmConfigUpdate): LlmConfigSnapshot {
  const envPath = getAgentMemoryEnvPath();
  const currentText = readEnvText(envPath);
  const current = parseEnvText(currentText);
  const nextApiUrl = normalizeApiUrl(update.apiUrl ?? current.AGENTMEM_LLM_API_URL ?? process.env.AGENTMEM_LLM_API_URL);
  const nextModel = normalizeModel(update.model ?? current.AGENTMEM_LLM_MODEL ?? process.env.AGENTMEM_LLM_MODEL);
  const nextHeaders = normalizeHeaders(update.headers ?? current.AGENTMEM_LLM_HEADERS ?? process.env.AGENTMEM_LLM_HEADERS);
  const nextDisableJsonMode = update.disableJsonMode ?? String(current.AGENTMEM_LLM_DISABLE_JSON_MODE ?? process.env.AGENTMEM_LLM_DISABLE_JSON_MODE ?? 'false').toLowerCase() === 'true';
  const currentBudget = readLlmBudgetConfig({ ...process.env, ...current });
  if (update.outputBudgetEnabled !== undefined && typeof update.outputBudgetEnabled !== 'boolean') {
    throw new Error('outputBudgetEnabled must be a boolean.');
  }
  const validateBudget = (value: number | undefined, fallback: number, label: string) => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < MIN_OUTPUT_BUDGET || value > MAX_OUTPUT_BUDGET) {
      throw new Error(`${label} must be an integer from ${MIN_OUTPUT_BUDGET} to ${MAX_OUTPUT_BUDGET}.`);
    }
    return value;
  };
  const nextBudget = {
    outputBudgetEnabled: update.outputBudgetEnabled ?? currentBudget.outputBudgetEnabled,
    observationMaxTokens: validateBudget(update.observationMaxTokens, currentBudget.observationMaxTokens, 'observationMaxTokens'),
    digestMaxTokens: validateBudget(update.digestMaxTokens, currentBudget.digestMaxTokens, 'digestMaxTokens'),
  };
  const nextApiKey = typeof update.apiKey === 'string' && update.apiKey.trim()
    ? update.apiKey.trim()
    : current.AGENTMEM_LLM_API_KEY || process.env.AGENTMEM_LLM_API_KEY || '';
  parseCustomHeaders(nextHeaders);

  const updates: Record<string, string | undefined> = {
    AGENTMEM_LLM_API_URL: nextApiUrl,
    AGENTMEM_LLM_MODEL: nextModel,
    AGENTMEM_LLM_DISABLE_JSON_MODE: nextDisableJsonMode ? 'true' : 'false',
    AGENTMEM_OUTPUT_BUDGET_ENABLED: String(nextBudget.outputBudgetEnabled),
    AGENTMEM_OBSERVATION_MAX_TOKENS: String(nextBudget.observationMaxTokens),
    AGENTMEM_DIGEST_MAX_TOKENS: String(nextBudget.digestMaxTokens),
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
    ...nextBudget,
  });

  return readLlmConfig();
}

function buildChatCompletionsUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/chat/completions`;
}

// The key a connection test actually sends: a nonempty typed key, otherwise the saved env key.
export function effectiveLlmTestApiKey(apiKey?: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim();
  return env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || '';
}

// Replace every occurrence of a nonempty key. Length does not matter: a short typed key is still a secret.
export function redactLlmSecret(text: string, secret?: string): string {
  const raw = String(text ?? '');
  const key = String(secret ?? '');
  if (!key || raw.indexOf(key) < 0) return raw;
  return raw.split(key).join('••••');
}

const LLM_TEST_REDACTED_FIELDS = ['error', 'message', 'detail', 'contentPreview', 'requestUrl'] as const;

export function redactLlmTestPayload<T extends Record<string, any>>(
  payload: T,
  apiKey?: unknown,
  env: NodeJS.ProcessEnv = process.env,
  extraSecrets: string[] = [],
): T {
  const secrets = [effectiveLlmTestApiKey(apiKey, env), ...extraSecrets]
    .filter((s) => typeof s === 'string' && s.length > 0)
    // Longest first, so a key that contains another key is replaced whole.
    .sort((a, b) => b.length - a.length);
  if (secrets.length === 0 || !payload || typeof payload !== 'object') return payload;
  const next: Record<string, any> = { ...payload };
  for (const field of LLM_TEST_REDACTED_FIELDS) {
    if (typeof next[field] !== 'string') continue;
    let text = next[field] as string;
    for (const secret of secrets) text = redactLlmSecret(text, secret);
    next[field] = text;
  }
  return next as T;
}

const LLM_AUTH_HEADER = /auth|key|token|secret|cookie|session|signature|password/i;

/** Secret values carried by outgoing auth headers: the whole value and, for "Bearer x" / "Basic x", the credential part. */
export function llmHeaderSecrets(headers: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (!LLM_AUTH_HEADER.test(name)) continue;
    const text = String(value ?? '').trim();
    if (!text) continue;
    out.push(text);
    const scheme = /^\S+\s+(\S.*)$/.exec(text);
    if (scheme) out.push(scheme[1].trim());
  }
  return out;
}

/** Redact first, then clip, so a clip can never leave a partial secret behind. */
function redactThenClip(text: string, max: number, secrets: string[]): string {
  let out = String(text ?? '');
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) out = redactLlmSecret(out, secret);
  return out.slice(0, max);
}

function parseCustomHeaders(headersText: string): Record<string, string> {
  if (!headersText) return {};
  let parsed: any;
  try {
    parsed = JSON.parse(headersText);
  } catch {
    // The engine's parse message quotes the input, which may hold a credential.
    throw new Error('AGENTMEM_LLM_HEADERS must be valid JSON.');
  }
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
  const apiKey = effectiveLlmTestApiKey(override.apiKey);
  const headersText = normalizeHeaders(override.headers ?? saved.headers);
  const requestUrl = buildChatCompletionsUrl(apiUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let headerSecrets: string[] = [];
  const seal = (result: LlmConnectionTestResult): LlmConnectionTestResult =>
    redactLlmTestPayload(result, apiKey, process.env, headerSecrets);

  try {
    if (!apiKey && !isLocalEndpoint(apiUrl)) {
      return seal({
        error: 'AGENTMEM_LLM_API_KEY is required for non-local endpoints.',
        latencyMs: Date.now() - startedAt,
        model,
        ok: false,
        requestUrl,
        testedAt: new Date().toISOString(),
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...parseCustomHeaders(headersText),
    };
    if (!headers.Authorization && !headers.authorization && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    headerSecrets = llmHeaderSecrets(headers);
    const allSecrets = [apiKey, ...headerSecrets];

    const response = await fetch(requestUrl, {
      body: JSON.stringify({
        ...llmBudgetOptions(apiUrl, model, 'connection_test'),
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
      return seal({
        error: redactThenClip(text, 500, allSecrets) || response.statusText,
        latencyMs,
        model,
        ok: false,
        requestUrl,
        status: response.status,
        testedAt: new Date().toISOString(),
      });
    }

    let contentPreview = redactThenClip(text, 160, allSecrets);
    try {
      const payload = JSON.parse(text);
      recordLlmUsage('connection_test', payload, latencyMs);
      contentPreview = redactThenClip(String(payload.choices?.[0]?.message?.content || contentPreview), 160, allSecrets);
    } catch (_error) {
      // Keep the raw preview when the provider returns non-JSON success content.
    }

    return seal({
      contentPreview,
      latencyMs,
      model,
      ok: true,
      requestUrl,
      status: response.status,
      testedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return seal({
      error: error.name === 'AbortError' ? 'Connection test timed out after 15 seconds.' : error.message,
      latencyMs: Date.now() - startedAt,
      model,
      ok: false,
      requestUrl,
      testedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timeout);
  }
}
