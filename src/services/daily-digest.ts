import {
  DailyMemoryDigest,
  DailyMemoryDigestPayload,
  DatabaseManager,
  Observation,
} from './db';
import {
  DigestObservationSelection,
  selectDigestObservations,
} from './memory-policy';

export const DAILY_DIGEST_PROMPT_VERSION = 'daily-digest-v1';
const DEFAULT_DIGEST_TIME_ZONE = 'Asia/Shanghai';

export interface DailyDigestLlmConfig {
  apiKey: string;
  apiUrl: string;
  disableJsonMode: boolean;
  headers: Record<string, string>;
  model: string;
}

export interface DailyDigestChatMessage {
  content: string;
  role: 'system' | 'user';
}

export interface DailyDigestChatRequest {
  messages: DailyDigestChatMessage[];
  model: string;
  response_format?: { type: 'json_object' };
  temperature: number;
}

export interface RunDailyMemoryDigestInput {
  completeChat?: (request: DailyDigestChatRequest) => Promise<string>;
  dbManager: DatabaseManager;
  llmConfig?: DailyDigestLlmConfig;
  localDate?: string;
  projectPath: string;
  timeZone?: string;
}

export interface RunDailyMemoryDigestResult {
  digest: DailyMemoryDigest;
  localDate: string;
  selection: DigestObservationSelection;
}

export function formatLocalDate(value: string | Date | undefined, timeZone: string = DEFAULT_DIGEST_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp for local date: ${String(value)}`);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to format local date for time zone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

export function resolveDailyDigestLlmConfig(env: NodeJS.ProcessEnv = process.env): DailyDigestLlmConfig {
  return {
    apiKey: env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || '',
    apiUrl: (env.AGENTMEM_LLM_API_URL || env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    disableJsonMode: String(env.AGENTMEM_LLM_DISABLE_JSON_MODE || 'false').toLowerCase() === 'true',
    headers: parseHeaders(env.AGENTMEM_LLM_HEADERS || ''),
    model: env.AGENTMEM_LLM_MODEL || 'deepseek-chat',
  };
}

export async function runDailyMemoryDigest(
  input: RunDailyMemoryDigestInput
): Promise<RunDailyMemoryDigestResult> {
  const timeZone = input.timeZone || process.env.AGENTMEM_DIGEST_TIME_ZONE || DEFAULT_DIGEST_TIME_ZONE;
  const localDate = input.localDate || formatLocalDate(new Date(), timeZone);
  const llmConfig = input.llmConfig || resolveDailyDigestLlmConfig();
  const observations = (await input.dbManager.getTimeline(input.projectPath)).filter(
    (observation) => formatLocalDate(observation.created_at, timeZone) === localDate
  );
  const selection = selectDigestObservations(observations);
  const selectedIds = selection.selected.map((observation) => observation.id);

  if (selection.selected.length === 0) {
    const digest = await input.dbManager.saveDailyMemoryDigest({
      project_path: input.projectPath,
      local_date: localDate,
      status: 'skipped_no_observations',
      digest: null,
      source_observation_ids: [],
      source_count: 0,
      model: llmConfig.model,
      prompt_version: DAILY_DIGEST_PROMPT_VERSION,
      last_error: 'No high-signal observations were available for this project and local date.',
    });
    return { digest, localDate, selection };
  }

  if (!hasUsableLlmCredentials(llmConfig)) {
    const digest = await input.dbManager.saveDailyMemoryDigest({
      project_path: input.projectPath,
      local_date: localDate,
      status: 'skipped_missing_llm',
      digest: null,
      source_observation_ids: selectedIds,
      source_count: selectedIds.length,
      model: llmConfig.model,
      prompt_version: DAILY_DIGEST_PROMPT_VERSION,
      last_error: 'AGENTMEM_LLM_API_KEY is required for daily digest generation with non-local endpoints.',
    });
    return { digest, localDate, selection };
  }

  try {
    const request = buildDailyDigestChatRequest(
      input.projectPath,
      localDate,
      selection,
      llmConfig
    );
    const rawContent = await (input.completeChat || ((chatRequest) => callDailyDigestLlm(chatRequest, llmConfig)))(request);
    const payload = normalizeDigestPayload(parseJSONContent(rawContent), selection.lowSignalPatterns);
    const digest = await input.dbManager.saveDailyMemoryDigest({
      project_path: input.projectPath,
      local_date: localDate,
      status: 'success',
      digest: payload,
      source_observation_ids: selectedIds,
      source_count: selectedIds.length,
      model: llmConfig.model,
      prompt_version: DAILY_DIGEST_PROMPT_VERSION,
    });
    return { digest, localDate, selection };
  } catch (error: any) {
    const digest = await input.dbManager.saveDailyMemoryDigest({
      project_path: input.projectPath,
      local_date: localDate,
      status: 'failed',
      digest: null,
      source_observation_ids: selectedIds,
      source_count: selectedIds.length,
      model: llmConfig.model,
      prompt_version: DAILY_DIGEST_PROMPT_VERSION,
      last_error: error.message,
    });
    return { digest, localDate, selection };
  }
}

function buildDailyDigestChatRequest(
  projectPath: string,
  localDate: string,
  selection: DigestObservationSelection,
  llmConfig: DailyDigestLlmConfig
): DailyDigestChatRequest {
  const request: DailyDigestChatRequest = {
    messages: [
      {
        role: 'system',
        content: `You are a developer memory synthesis assistant.
Create one concise daily memory digest from selected AgentMemory observations.
Return valid JSON only. Do not auto-promote facts into state; list them as candidates.
Schema:
{
  "summary": "string",
  "facts": ["string"],
  "decisions": ["string"],
  "verified_commands": ["string"],
  "open_questions": ["string"],
  "next_actions": ["string"],
  "state_fact_candidates": [{"entity_type":"project","entity_key":"string","fact_key":"string","value":{},"confidence":0.0,"reason":"string"}],
  "skill_candidates": [{"title":"string","summary":"string","trigger":"string","steps":["string"],"confidence":0.0}],
  "low_signal_patterns": ["string"],
  "confidence": 0.0
}`,
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            local_date: localDate,
            project_path: projectPath,
            prompt_version: DAILY_DIGEST_PROMPT_VERSION,
            selected_observations: selection.selected.map(toPromptObservation),
          },
          null,
          2
        ),
      },
    ],
    model: llmConfig.model,
    temperature: 0.1,
  };

  if (!llmConfig.disableJsonMode) {
    request.response_format = { type: 'json_object' };
  }

  return request;
}

async function callDailyDigestLlm(
  request: DailyDigestChatRequest,
  llmConfig: DailyDigestLlmConfig
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...llmConfig.headers,
  };
  if (!headers.Authorization && !headers.authorization && llmConfig.apiKey) {
    headers.Authorization = `Bearer ${llmConfig.apiKey}`;
  }

  const response = await fetch(`${llmConfig.apiUrl.replace(/\/+$/, '')}/chat/completions`, {
    body: JSON.stringify(request),
    headers,
    method: 'POST',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} - ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM API');
  }
  return String(content);
}

function parseJSONContent(rawText: string): any {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse JSON response from LLM');
  }
}

function normalizeDigestPayload(raw: any, lowSignalPatterns: string[]): DailyMemoryDigestPayload {
  return {
    summary: String(raw?.summary || '').trim(),
    facts: toStringArray(raw?.facts),
    decisions: toStringArray(raw?.decisions),
    verified_commands: toStringArray(raw?.verified_commands),
    open_questions: toStringArray(raw?.open_questions),
    next_actions: toStringArray(raw?.next_actions),
    state_fact_candidates: Array.isArray(raw?.state_fact_candidates) ? raw.state_fact_candidates : [],
    skill_candidates: Array.isArray(raw?.skill_candidates) ? raw.skill_candidates : [],
    low_signal_patterns: mergeStringArrays(toStringArray(raw?.low_signal_patterns), lowSignalPatterns),
    confidence: normalizeConfidence(raw?.confidence),
  };
}

function toPromptObservation(observation: Observation) {
  return {
    id: observation.id,
    agent_id: observation.agent_id,
    concepts: observation.concepts,
    created_at: observation.created_at,
    facts: observation.facts,
    files_modified: observation.files_modified,
    narrative: observation.narrative,
    title: observation.title,
  };
}

function hasUsableLlmCredentials(config: DailyDigestLlmConfig): boolean {
  return Boolean(config.apiKey) || /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])/i.test(config.apiUrl);
}

function parseHeaders(headersText: string): Record<string, string> {
  const trimmed = headersText.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AGENTMEM_LLM_HEADERS must be a JSON object.');
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function mergeStringArrays(first: string[], second: string[]): string[] {
  const values: string[] = [];
  for (const entry of [...first, ...second]) {
    if (entry && !values.includes(entry)) {
      values.push(entry);
    }
  }
  return values;
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}
