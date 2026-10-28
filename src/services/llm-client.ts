import { llmBudgetOptions, recordLlmUsage } from './llm-budget';
import { llmErrorExcerpt } from './llm-config';

export interface LlmSettings { apiKey: string; apiUrl: string; model: string; headers: Record<string, string>; disableJsonMode: boolean; }

export function resolveLlmSettings(env: NodeJS.ProcessEnv = process.env): LlmSettings {
  let headers = {};
  try {
    headers = env.AGENTMEM_LLM_HEADERS ? JSON.parse(env.AGENTMEM_LLM_HEADERS) : {};
  } catch {
    // The engine's parse message quotes the input, which may hold a credential.
    throw new Error('AGENTMEM_LLM_HEADERS must be valid JSON.');
  }
  return {
    apiKey: env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || '',
    apiUrl: (env.AGENTMEM_LLM_API_URL || env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').trim().replace(/\/+$/, ''),
    model: env.AGENTMEM_LLM_MODEL || 'deepseek-chat',
    headers, disableJsonMode: env.AGENTMEM_LLM_DISABLE_JSON_MODE === 'true',
  };
}

export function llmAvailable(settings: LlmSettings): boolean {
  return Boolean(settings.apiKey) || /localhost|127\.0\.0\.1|\[::1\]/.test(settings.apiUrl);
}

/** Returns the first balanced {...} object in text (string-aware), or null. */
function firstJsonObject(text: string): string | null {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { break; }
      }
    }
  }
  return null;
}

export function parseJsonContent(rawText: string): any {
  const trimmed = String(rawText ?? '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  try { return JSON.parse(body); } catch {
    const object = firstJsonObject(body);
    if (object) return JSON.parse(object);
    throw new Error('Failed to parse JSON response from LLM');
  }
}

const TRANSIENT_CODES = /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR_\w+)$/;
export function isTransientFetchError(error: any): boolean {
  for (let e = error, depth = 0; e && depth < 4; e = e.cause, depth++) {
    // A timed-out attempt is not retried: a hung provider would otherwise block the serial queue 3x longer.
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return false;
    if (TRANSIENT_CODES.test(String(e.code || ''))) return true;
    if (/fetch failed|terminated|socket hang up|other side closed/i.test(String(e.message || ''))) return true;
  }
  return false;
}

function urlOrigin(value: string): string {
  try { return new URL(value).origin; } catch { return ''; }
}

function redirectTarget(requestUrl: string, response: Response): string | undefined {
  if (![301, 302, 303, 307, 308].includes(response.status)) return;
  const location = response.headers.get('location');
  if (!location) return;
  try { return new URL(location, requestUrl).href; } catch { return; }
}

// Cross-origin redirects must not carry Authorization or custom auth headers (fetch would forward custom headers).
async function fetchFollowingSameOrigin(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let current = url;
  for (let hops = 0; ; hops++) {
    const response = await fetch(current, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const next = redirectTarget(current, response);
    if (!next) return response;
    await response.body?.cancel().catch(() => undefined);
    if (hops >= 5) throw new Error('LLM request exceeded the redirect limit');
    const fromOrigin = urlOrigin(current);
    const toOrigin = urlOrigin(next);
    if (!fromOrigin || !toOrigin || fromOrigin !== toOrigin) {
      throw new Error(`LLM request was redirected to a different origin (${toOrigin || 'invalid'}); the API key and custom headers were not forwarded`);
    }
    current = next;
  }
}

export interface RetryOptions { timeoutMs: number; retries?: number; baseDelayMs?: number; }
/** fetch with a per-attempt timeout; retries transient network errors and HTTP 429/5xx with exponential backoff. */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions): Promise<Response> {
  const retries = opts.retries ?? 2;
  const envBase = Number(process.env.AGENTMEM_LLM_RETRY_BASE_MS);
  const baseDelayMs = opts.baseDelayMs ?? (Number.isFinite(envBase) && envBase >= 0 ? envBase : 1000);
  for (let attempt = 0; ; attempt++) {
    let failure: any;
    try {
      const response = await fetchFollowingSameOrigin(url, init, opts.timeoutMs);
      if (response.ok || attempt >= retries || !(response.status === 429 || response.status >= 500)) return response;
      await response.body?.cancel().catch(() => undefined);
      failure = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt >= retries || !isTransientFetchError(error)) throw error;
      failure = error;
    }
    console.warn(`[LLM] attempt ${attempt + 1} failed (${failure?.message || failure}); retrying`);
    await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** attempt));
  }
}

/** One chat completion returning parsed JSON. Transient network/5xx failures are retried inside fetchWithRetry;
 *  unparseable content gets exactly one re-ask before the error propagates. */
export async function callLlmJson(kind: 'observation' | 'daily_digest', system: string, user: string, settings = resolveLlmSettings()): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...settings.headers };
  if (!headers.Authorization && !headers.authorization && settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const body: any = { model: settings.model, temperature: 0.1,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...llmBudgetOptions(settings.apiUrl, settings.model, kind) };
  if (!settings.disableJsonMode) body.response_format = { type: 'json_object' };
  for (let attempt = 0; ; attempt++) {
    const startedAt = Date.now();
    const response = await fetchWithRetry(`${settings.apiUrl}/chat/completions`, { method: 'POST', headers,
      body: JSON.stringify(body) }, { timeoutMs: 90000 });
    if (!response.ok) throw new Error(`LLM API error: ${response.status} - ${llmErrorExcerpt(await response.text(), headers, settings.apiKey)}`);
    const data: any = await response.json();
    recordLlmUsage(kind, data, Date.now() - startedAt);
    if (data.choices?.[0]?.finish_reason === 'length') throw new Error(`${kind} exceeded output token budget`);
    const content = data.choices?.[0]?.message?.content;
    try {
      if (!content) throw new Error('Empty response from LLM API');
      return parseJsonContent(String(content));
    } catch (error: any) {
      if (attempt >= 1) throw error;
      console.warn(`[LLM] ${kind} response unusable (${error.message}); asking once more`);
      body.messages.push({ role: 'assistant', content: String(content || '').slice(0, 2000) },
        { role: 'user', content: 'That was not a valid JSON object. Reply with the JSON object only, following the schema.' });
    }
  }
}
