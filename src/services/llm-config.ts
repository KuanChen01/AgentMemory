import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { readLlmBudgetConfig, MIN_OUTPUT_BUDGET, MAX_OUTPUT_BUDGET } from './llm-budget';
import { ensurePrivateDir, writePrivateFileAtomic } from './private-files';
import { sanitizeText } from './redact';

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

/** User-input mistakes on save (URL-change rule, budget, headers). The admin route maps this to HTTP 400. */
export class LlmConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigValidationError';
  }
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

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

// Same endpoint: scheme/host compared case-insensitively, trailing slashes ignored.
function canonicalApiUrl(value: string): string {
  const normalized = stripTrailingSlashes(normalizeApiUrl(value));
  try {
    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${path}${url.search}${url.hash}`;
  } catch {
    return normalized.toLowerCase();
  }
}

function llmApiUrlChanged(updateUrl: string | undefined, currentUrl: string): boolean {
  if (updateUrl === undefined) return false;
  return canonicalApiUrl(updateUrl) !== canonicalApiUrl(currentUrl);
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

// Saved custom header values (gateway credentials) never leave the worker: the admin API shows this
// placeholder instead, and a placeholder sent back means "keep the saved value". It cannot be a real
// value: fetch rejects non-Latin-1 header values.
export const SAVED_HEADER_PLACEHOLDER = '••••';

function maskHeaderValues(headersText: string): string {
  if (!headersText) return '';
  try {
    const parsed = parseCustomHeaders(headersText);
    return JSON.stringify(Object.fromEntries(Object.keys(parsed).map((name) => [name, SAVED_HEADER_PLACEHOLDER])));
  } catch {
    return SAVED_HEADER_PLACEHOLDER;
  }
}

/** Puts the saved value back for every header the client sent as the placeholder. */
export function restoreSavedHeaderValues(headersText: string, savedText: string): string {
  if (!headersText.includes(SAVED_HEADER_PLACEHOLDER)) return headersText;
  if (headersText === SAVED_HEADER_PLACEHOLDER) return savedText;
  let saved: Record<string, string> = {};
  try { saved = parseCustomHeaders(savedText); } catch { /* Nothing saved to keep. */ }
  const next = parseCustomHeaders(headersText);
  for (const [name, value] of Object.entries(next)) {
    if (value !== SAVED_HEADER_PLACEHOLDER) continue;
    const savedName = Object.keys(saved).find((key) => key.toLowerCase() === name.toLowerCase());
    if (savedName === undefined) throw new LlmConfigValidationError(`Enter a value for the ${name} header: there is no saved value to keep.`);
    next[name] = saved[savedName];
  }
  return JSON.stringify(next);
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfigSnapshot {
  const envPath = getAgentMemoryEnvPath(env);
  const text = readEnvText(envPath);
  const parsed = parseEnvText(text);
  const apiKey = parsed.AGENTMEM_LLM_API_KEY || env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || '';
  const apiUrl = normalizeApiUrl(parsed.AGENTMEM_LLM_API_URL || env.AGENTMEM_LLM_API_URL || env.DEEPSEEK_API_URL);
  const model = normalizeModel(parsed.AGENTMEM_LLM_MODEL || env.AGENTMEM_LLM_MODEL);
  const headers = maskHeaderValues(normalizeHeaders(parsed.AGENTMEM_LLM_HEADERS || env.AGENTMEM_LLM_HEADERS));
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
  const currentApiUrl = normalizeApiUrl(current.AGENTMEM_LLM_API_URL ?? process.env.AGENTMEM_LLM_API_URL);
  const urlChanged = llmApiUrlChanged(update.apiUrl, currentApiUrl);
  const currentApiKey = current.AGENTMEM_LLM_API_KEY || process.env.AGENTMEM_LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const submittedKey = typeof update.apiKey === 'string' ? update.apiKey.trim() : '';
  if (urlChanged && currentApiKey && !submittedKey) {
    throw new LlmConfigValidationError(
      'Changing the API URL requires entering the API key again, so the saved key is never sent to a new address. The saved configuration was not changed.'
    );
  }
  const savedHeaders = normalizeHeaders(current.AGENTMEM_LLM_HEADERS ?? process.env.AGENTMEM_LLM_HEADERS);
  if (urlChanged) {
    const submittedHeaders = update.headers;
    if (typeof submittedHeaders === 'string' && submittedHeaders.includes(SAVED_HEADER_PLACEHOLDER)) {
      throw new LlmConfigValidationError('Changing the API URL requires entering the custom header values again.');
    }
    if (submittedHeaders === undefined && savedHeaders) {
      throw new LlmConfigValidationError('Changing the API URL requires entering the custom header values again.');
    }
  }
  const nextApiUrl = normalizeApiUrl(update.apiUrl ?? current.AGENTMEM_LLM_API_URL ?? process.env.AGENTMEM_LLM_API_URL);
  const nextModel = normalizeModel(update.model ?? current.AGENTMEM_LLM_MODEL ?? process.env.AGENTMEM_LLM_MODEL);
  const nextHeaders = urlChanged
    ? normalizeHeaders(update.headers ?? '')
    : restoreSavedHeaderValues(
        normalizeHeaders(update.headers ?? current.AGENTMEM_LLM_HEADERS ?? process.env.AGENTMEM_LLM_HEADERS),
        savedHeaders);
  const nextDisableJsonMode = update.disableJsonMode ?? String(current.AGENTMEM_LLM_DISABLE_JSON_MODE ?? process.env.AGENTMEM_LLM_DISABLE_JSON_MODE ?? 'false').toLowerCase() === 'true';
  const currentBudget = readLlmBudgetConfig({ ...process.env, ...current });
  if (update.outputBudgetEnabled !== undefined && typeof update.outputBudgetEnabled !== 'boolean') {
    throw new LlmConfigValidationError('outputBudgetEnabled must be a boolean.');
  }
  const validateBudget = (value: number | undefined, fallback: number, label: string) => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < MIN_OUTPUT_BUDGET || value > MAX_OUTPUT_BUDGET) {
      throw new LlmConfigValidationError(`${label} must be an integer from ${MIN_OUTPUT_BUDGET} to ${MAX_OUTPUT_BUDGET}.`);
    }
    return value;
  };
  const nextBudget = {
    outputBudgetEnabled: update.outputBudgetEnabled ?? currentBudget.outputBudgetEnabled,
    observationMaxTokens: validateBudget(update.observationMaxTokens, currentBudget.observationMaxTokens, 'observationMaxTokens'),
    digestMaxTokens: validateBudget(update.digestMaxTokens, currentBudget.digestMaxTokens, 'digestMaxTokens'),
  };
  const nextApiKey = submittedKey
    ? submittedKey
    : (urlChanged ? '' : current.AGENTMEM_LLM_API_KEY || process.env.AGENTMEM_LLM_API_KEY || '');
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

  ensurePrivateDir(path.dirname(envPath));
  writePrivateFileAtomic(envPath, upsertEnvText(currentText, updates));
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

// Replace every occurrence of a nonempty key. Length does not matter: a short typed key is still a secret.
export function redactLlmSecret(text: string, secret?: string): string {
  const raw = String(text ?? '');
  const key = String(secret ?? '');
  if (!key || raw.indexOf(key) < 0) return raw;
  return raw.split(key).join('••••');
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

/**
 * Error text from an LLM gateway, safe to store or log: the key, header values and credential-shaped
 * tokens are removed, then it is clipped, so an echoed request or credential does not travel on.
 */
export function llmErrorExcerpt(text: string, headers: Record<string, string>, apiKey = ''): string {
  const headerValues = Object.entries(headers)
    .filter(([name, value]) => name.toLowerCase() !== 'content-type' && String(value ?? '').trim().length >= 6)
    .map(([, value]) => String(value).trim());
  const redacted = redactThenClip(text, 4000, [apiKey, ...llmHeaderSecrets(headers), ...headerValues]);
  return (sanitizeText(redacted) || '').slice(0, 300);
}

function parseCustomHeaders(headersText: string): Record<string, string> {
  if (!headersText) return {};
  let parsed: any;
  try {
    parsed = JSON.parse(headersText);
  } catch {
    // The engine's parse message quotes the input, which may hold a credential.
    throw new LlmConfigValidationError('AGENTMEM_LLM_HEADERS must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LlmConfigValidationError('AGENTMEM_LLM_HEADERS must be a JSON object.');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)])
  );
}
