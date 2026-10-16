import { llmBudgetOptions, recordLlmUsage } from './llm-budget';

export interface LlmSettings { apiKey: string; apiUrl: string; model: string; headers: Record<string, string>; disableJsonMode: boolean; }

export function resolveLlmSettings(env: NodeJS.ProcessEnv = process.env): LlmSettings {
  const headers = env.AGENTMEM_LLM_HEADERS ? JSON.parse(env.AGENTMEM_LLM_HEADERS) : {};
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

export function parseJsonContent(rawText: string): any {
  const trimmed = rawText.trim();
  try { return JSON.parse(trimmed); } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse JSON response from LLM');
  }
}

/** One chat completion returning parsed JSON. Exactly one HTTP request per call. */
export async function callLlmJson(kind: 'observation' | 'daily_digest', system: string, user: string, settings = resolveLlmSettings()): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...settings.headers };
  if (!headers.Authorization && !headers.authorization && settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const body: any = { model: settings.model, temperature: 0.1,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...llmBudgetOptions(settings.apiUrl, settings.model, kind) };
  if (!settings.disableJsonMode) body.response_format = { type: 'json_object' };
  const startedAt = Date.now();
  const response = await fetch(`${settings.apiUrl}/chat/completions`, { method: 'POST', headers,
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`LLM API error: ${response.status} - ${(await response.text()).slice(0, 500)}`);
  const data: any = await response.json();
  recordLlmUsage(kind, data, Date.now() - startedAt);
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error(`${kind} exceeded output token budget`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from LLM API');
  return parseJsonContent(String(content));
}
