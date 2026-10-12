import fs from 'fs';
import os from 'os';
import path from 'path';

export type LlmTask = 'observation' | 'daily_digest' | 'query_rewrite' | 'connection_test';

export const MIN_OUTPUT_BUDGET = 256;
export const MAX_OUTPUT_BUDGET = 8192;

export function readLlmBudgetConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    outputBudgetEnabled: String(env.AGENTMEM_OUTPUT_BUDGET_ENABLED || 'false').toLowerCase() === 'true',
    observationMaxTokens: boundedEnvInteger(env.AGENTMEM_OBSERVATION_MAX_TOKENS, 1024, MIN_OUTPUT_BUDGET, MAX_OUTPUT_BUDGET),
    digestMaxTokens: boundedEnvInteger(env.AGENTMEM_DIGEST_MAX_TOKENS, 3072, MIN_OUTPUT_BUDGET, MAX_OUTPUT_BUDGET),
  };
}

export function boundedEnvInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= min
    ? Math.min(max, Math.trunc(parsed)) : fallback;
}

// Provider extensions must not leak into other OpenAI-compatible APIs.
export function llmBudgetOptions(apiUrl: string, model: string, task: LlmTask, env: NodeJS.ProcessEnv = process.env) {
  const budget = readLlmBudgetConfig(env);
  const max_tokens = task === 'observation' || task === 'daily_digest'
    ? (budget.outputBudgetEnabled ? (task === 'daily_digest' ? budget.digestMaxTokens : budget.observationMaxTokens) : undefined)
    : task === 'query_rewrite' ? 80 : 8;
  let officialDeepSeek = false;
  try { officialDeepSeek = new URL(apiUrl).hostname === 'api.deepseek.com'; } catch { /* Invalid URL handled by caller. */ }
  return {
    ...(max_tokens === undefined ? {} : { max_tokens }),
    ...(officialDeepSeek && /^deepseek-(?:flash|chat|reasoner|v4-)/i.test(model)
      ? { thinking: { type: 'disabled' as const } } : {}),
  };
}

// Retain both command context and final results, with an explicit truncation marker.
export function boundToolText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = '\n[... truncated by AgentMemory ...]\n';
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available / 2);
  return text.slice(0, head) + marker + text.slice(-(available - head));
}

// Record metering only: never prompts, generated text, credentials or custom headers.
export function recordLlmUsage(task: LlmTask, payload: any, latencyMs: number, env: NodeJS.ProcessEnv = process.env) {
  const usage = payload?.usage;
  if (!usage) return;
  const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const timestamp = new Date().toISOString();
  const row = {
    timestamp, machine: os.hostname(), task, model: payload.model || null, latency_ms: latencyMs,
    prompt_tokens: count(usage.prompt_tokens), completion_tokens: count(usage.completion_tokens),
    total_tokens: count(usage.total_tokens),
    cache_hit_tokens: count(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens),
    cache_miss_tokens: count(usage.prompt_cache_miss_tokens),
    reasoning_tokens: count(usage.completion_tokens_details?.reasoning_tokens),
    finish_reason: payload.choices?.[0]?.finish_reason || null,
  };
  try {
    const dir = path.join(env.AGENTMEM_RUNTIME_DIR || path.join(os.homedir(), '.agentmem'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `llm-usage-${timestamp.slice(0, 10)}.jsonl`), JSON.stringify(row) + '\n', 'utf8');
  } catch { /* Diagnostics must not prevent memory writes. */ }
}
