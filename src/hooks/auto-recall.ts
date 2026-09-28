import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fetchAgentMemoryWorker } from './worker-client';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;
const MIN_SCORE = 0.25;
const MAX_CONTEXT_CHARS = 900;
const RECALL_DEADLINE_MS = 5000;

interface MemoryHit {
  id: string;
  title: string;
  narrative: string;
  facts: string[];
  created_at: string;
  hybrid_score: number;
}

interface TurnState {
  turnId: string;
  prompt: string;
  context: string;
  delivered: boolean;
  errorSignature: string;
  errorCount: number;
  stuckInjected: boolean;
}

function statePath(sessionKey: string): string {
  const root = process.env.AGENTMEM_RUNTIME_DIR || path.join(os.homedir(), '.agentmem');
  const hash = createHash('sha256').update(sessionKey).digest('hex');
  return path.join(root, 'auto-recall', `${hash}.json`);
}

function readState(sessionKey: string): TurnState | null {
  try { return JSON.parse(fs.readFileSync(statePath(sessionKey), 'utf8')); }
  catch { return null; }
}

export function hasRecallTurn(sessionKey: string, turnId: string): boolean {
  return readState(sessionKey)?.turnId === turnId;
}

export function activeRecallTurn(sessionKey: string): string {
  return readState(sessionKey)?.turnId || '';
}

export function clearRecallSession(sessionKey: string): void {
  try { fs.unlinkSync(statePath(sessionKey)); } catch { /* No state to clear. */ }
}

function saveState(sessionKey: string, state: TurnState): void {
  try {
    const target = statePath(sessionKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(state)}\n`, 'utf8');
  } catch { /* Memory must never block the host. */ }
}

export function isSubstantivePrompt(prompt: string): boolean {
  const value = prompt.replace(/<[^>]+>/g, ' ').trim();
  if (!value) return false;
  return !/^(?:好(?:的|了)?|嗯|收到|谢谢|多谢|ok|okay|thanks|thank you|搞好没(?:有)?|好了吗|进展如何|是不是卡住了|直接回答)(?:[!！?.？。\s]*)$/i.test(value);
}

export function latestAntigravityPrompt(transcriptPath?: string): { prompt: string; turnId: string } | null {
  if (!transcriptPath) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (!lines[index]) continue;
      let event: any;
      try { event = JSON.parse(lines[index]); } catch { continue; }
      if (event.source !== 'USER_EXPLICIT' || event.type !== 'USER_INPUT') continue;
      const content = String(event.content || '');
      const prompt = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/)?.[1] || content;
      return { prompt: prompt.trim(), turnId: String(event.step_index ?? index) };
    }
  } catch { /* The transcript may be unavailable or incomplete. */ }
  return null;
}

export function beginRecallTurn(sessionKey: string, turnId: string, prompt: string, context = ''): void {
  const previous = readState(sessionKey);
  if (previous?.turnId === turnId) return;
  saveState(sessionKey, {
    turnId, prompt, context, delivered: false,
    errorSignature: '', errorCount: 0, stuckInjected: false,
  });
}

export function takePreparedRecall(sessionKey: string, turnId: string): string {
  const state = readState(sessionKey);
  if (!state || state.turnId !== turnId || state.delivered) return '';
  state.delivered = true;
  saveState(sessionKey, state);
  return state.context;
}

export function setPreparedRecall(sessionKey: string, turnId: string, context: string): void {
  const state = readState(sessionKey);
  if (!state || state.turnId !== turnId || !context) return;
  state.context = context;
  state.delivered = false;
  saveState(sessionKey, state);
}

export function noteToolFailure(sessionKey: string, turnId: string, success: boolean, output: unknown): string {
  const state = readState(sessionKey);
  if (!state || state.turnId !== turnId || state.stuckInjected) return '';
  if (success) {
    state.errorSignature = '';
    state.errorCount = 0;
    saveState(sessionKey, state);
    return '';
  }
  const signature = String(output || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 180);
  if (!signature) return '';
  state.errorCount = signature === state.errorSignature ? state.errorCount + 1 : 1;
  state.errorSignature = signature;
  saveState(sessionKey, state);
  return state.errorCount >= 2 ? `${state.prompt}\nError: ${String(output).slice(0, 350)}` : '';
}

export function markStuckRecall(sessionKey: string, turnId: string): void {
  const state = readState(sessionKey);
  if (!state || state.turnId !== turnId) return;
  state.stuckInjected = true;
  saveState(sessionKey, state);
}

async function query(projectPath: string, prompt: string, limit: number, timeoutMs: number): Promise<MemoryHit[]> {
  const response = await fetchAgentMemoryWorker(PORT, '/memory/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_path: projectPath, query: prompt, mode: 'task_query', limit, window_char_budget: 900 }),
  }, timeoutMs, false);
  if (!response?.ok) return [];
  const data: any = await response.json();
  if (data?.disabled) return [];
  return Array.isArray(data?.search_results) ? data.search_results : [];
}

async function rewriteChineseQuery(prompt: string, timeoutMs: number): Promise<string> {
  const key = process.env.AGENTMEM_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key || timeoutMs < 300) return '';
  const baseUrl = (process.env.AGENTMEM_LLM_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AGENTMEM_LLM_MODEL || 'deepseek-chat',
        temperature: 0,
        max_tokens: 80,
        messages: [
          { role: 'system', content: 'Convert this task into concise English search terms for coding activity memory. Output only terms, no explanation.' },
          { role: 'user', content: prompt.slice(0, 1000) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return '';
    const data: any = await response.json();
    return String(data?.choices?.[0]?.message?.content || '').trim().slice(0, 300);
  } catch { return ''; }
}

async function recallWithinDeadline(projectPath: string, prompt: string, maxHits: number): Promise<string> {
  if (!isSubstantivePrompt(prompt)) return '';
  const deadline = Date.now() + RECALL_DEADLINE_MS;
  let hits = await query(projectPath, prompt, Math.max(3, maxHits), Math.min(1800, deadline - Date.now()));
  if ((!hits[0] || Number(hits[0].hybrid_score) < MIN_SCORE) && /[\u3400-\u9fff]/.test(prompt)) {
    const rewritten = await rewriteChineseQuery(prompt, Math.min(2000, deadline - Date.now()));
    if (rewritten) hits = await query(projectPath, rewritten, Math.max(3, maxHits), Math.max(100, deadline - Date.now()));
  }
  const selected = hits.filter((hit) => Number(hit.hybrid_score) >= MIN_SCORE).slice(0, maxHits);
  if (!selected.length) return '';
  const lines = ['AgentMemory found possibly relevant working memory for this task:'];
  for (const hit of selected) {
    const detail = (hit.facts || []).slice(0, 2).join('; ') || hit.narrative;
    lines.push(`- ${hit.title} [ID: ${hit.id}, ${hit.created_at}]: ${String(detail || '').slice(0, 420)}`);
  }
  lines.push('Verify these leads against current files and tool results before using them. Search AgentMemory again if deeper history is needed.');
  return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}

export async function recallForTask(projectPath: string, prompt: string, maxHits = 1): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      recallWithinDeadline(projectPath, prompt, maxHits),
      new Promise<string>((resolve) => { timer = setTimeout(() => resolve(''), RECALL_DEADLINE_MS); }),
    ]);
  } catch { return ''; }
  finally { if (timer) clearTimeout(timer); }
}
