import { Observation } from './db';
import { isLowSignalTitle, normalizeTitleKey } from './context-view';

export type DigestExclusionReason =
  | 'duplicate_title'
  | 'limit_exceeded'
  | 'low_signal_content'
  | 'low_signal_title';

export interface DigestObservationExclusion {
  id: string;
  reason: DigestExclusionReason;
  title: string;
}

export interface DigestObservationSelection {
  excluded: DigestObservationExclusion[];
  lowSignalPatterns: string[];
  selected: Observation[];
}

export interface DigestObservationSelectionOptions {
  limit?: number;
}

export type MemoryReadMode = 'startup' | 'task_query' | 'drill_down' | 'post_task';

export type MemoryLayerName =
  | 'metadata'
  | 'structured_profile'
  | 'recent_summary'
  | 'observation_ledger'
  | 'procedural_memory'
  | 'sliding_window';

export interface MemoryReadPolicyInput {
  asOf?: string;
  mode?: MemoryReadMode;
  queryText?: string;
  requestedLimit?: number;
  requestedSkillLimit?: number;
  requestedWindowChars?: number;
}

export interface MemoryReadPolicyDecision {
  action: 'read' | 'skip';
  mode: MemoryReadMode;
  layers: MemoryLayerName[];
  reasons: string[];
  includeHistoricalSlice: boolean;
  observationLimit: number;
  digestLimit: number;
  skillLimit: number;
  windowCharBudget: number;
  shouldUseDailyDigests: boolean;
  shouldUseObservationSearch: boolean;
  shouldUseProceduralSkills: boolean;
  shouldUseSlidingWindow: boolean;
  shouldUseStateFacts: boolean;
}

export interface ObservationWritePolicyInput {
  observation: Pick<Observation, 'title' | 'narrative' | 'facts' | 'files_modified'>;
  source: 'manual' | 'mcp_record' | 'tool_log';
}

export interface ObservationWritePolicyDecision {
  action: 'record' | 'record_low_signal' | 'skip';
  reasons: string[];
}

export interface PostTaskReviewPolicyInput {
  observation: Pick<Observation, 'facts' | 'files_modified' | 'narrative' | 'title'>;
  source: 'tool_log';
}

export interface PostTaskReviewPolicyDecision {
  action: 'review' | 'skip';
  mode: 'post_task';
  observationLimit: number;
  reasons: string[];
  skillLimit: number;
  queryText: string;
  windowCharBudget: number;
}

export interface ProceduralSkillCandidate {
  confidence: number;
  steps: string[];
  summary: string;
  tags: string[];
  title: string;
  trigger_text: string;
}

export interface ProceduralSkillPromotionDecision {
  action: 'promote_draft' | 'skip';
  candidate: ProceduralSkillCandidate | null;
  reasons: string[];
}

const DEFAULT_DIGEST_OBSERVATION_LIMIT = 40;
const DEFAULT_MEMORY_OBSERVATION_LIMIT = 5;
const DEFAULT_MEMORY_DIGEST_LIMIT = 3;
const DEFAULT_MEMORY_SKILL_LIMIT = 3;
const DEFAULT_WINDOW_CHAR_BUDGET = 1800;

const STATE_KEYWORDS = /\b(current|latest|status|state|mode|config|fact|owner|port|goal|setting)\b/i;
const PROCEDURE_KEYWORDS = /\b(how|steps|procedure|workflow|run|bootstrap|install|release|diagnose|debug|fix|use)\b/i;
const SUMMARY_KEYWORDS = /\b(summary|digest|overview|recent|what happened|context)\b/i;
const HISTORY_KEYWORDS = /\b(previous|history|before|earlier|yesterday|last|as of|timeline)\b/i;
const SUBSTANTIVE_OBSERVATION_KEYWORDS = /\b(pass(?:ed|es)?|fail(?:ed|ure)?|error|exception|warn(?:ing)?|verified|validated|confirmed|found|detected|discovered|revealed|resolved|fixed|regression|root cause|decision|risk|blocked|unsupported|mismatch|deprecated|removed|created|updated|changed|missing|corrupt(?:ed|ion)?|vulnerab(?:le|ility)|no matches?|no results?|not found|clean working tree|working tree (?:was|is) clean)\b|通过|失败|错误|异常|警告|验证|确认|发现|修复|回归|根因|决策|风险|阻塞|不支持|不匹配|缺失|损坏|漏洞|无匹配|未发现|工作区(?:是|为)?干净/i;

export function selectDigestObservations(
  observations: Observation[],
  options: DigestObservationSelectionOptions = {}
): DigestObservationSelection {
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(options.limit || DEFAULT_DIGEST_OBSERVATION_LIMIT))));
  const excluded: DigestObservationExclusion[] = [];
  const lowSignalPatterns: string[] = [];
  const selected: Observation[] = [];
  const seenTitles = new Set<string>();

  for (const observation of observations) {
    const titleKey = normalizeTitleKey(observation.title);

    if (titleKey && seenTitles.has(titleKey)) {
      excluded.push(toExclusion(observation, 'duplicate_title'));
      continue;
    }

    if (isLowSignalTitle(observation.title)) {
      excluded.push(toExclusion(observation, 'low_signal_title'));
      addLowSignalPattern(lowSignalPatterns, observation.title);
      if (titleKey) {
        seenTitles.add(titleKey);
      }
      continue;
    }

    if (!hasDigestSignal(observation)) {
      excluded.push(toExclusion(observation, 'low_signal_content'));
      addLowSignalPattern(lowSignalPatterns, observation.title);
      if (titleKey) {
        seenTitles.add(titleKey);
      }
      continue;
    }

    if (selected.length >= limit) {
      excluded.push(toExclusion(observation, 'limit_exceeded'));
      continue;
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }
    selected.push(observation);
  }

  return {
    excluded,
    lowSignalPatterns,
    selected,
  };
}

export function decideMemoryReadPolicy(
  input: MemoryReadPolicyInput = {}
): MemoryReadPolicyDecision {
  const mode = input.mode || 'task_query';
  const queryText = String(input.queryText || '').trim();
  const includeHistoricalSlice = Boolean(input.asOf) || HISTORY_KEYWORDS.test(queryText);
  const reasons: string[] = [];

  if (!queryText && mode !== 'startup') {
    return {
      action: 'skip',
      mode,
      layers: [],
      reasons: ['No task query was provided for a non-startup memory read.'],
      includeHistoricalSlice,
      observationLimit: 0,
      digestLimit: 0,
      skillLimit: 0,
      windowCharBudget: 0,
      shouldUseDailyDigests: false,
      shouldUseObservationSearch: false,
      shouldUseProceduralSkills: false,
      shouldUseSlidingWindow: false,
      shouldUseStateFacts: false,
    };
  }

  const layers = new Set<MemoryLayerName>(['metadata', 'structured_profile']);
  let shouldUseDailyDigests = mode === 'startup' || mode === 'post_task';
  let shouldUseObservationSearch = mode === 'task_query' || mode === 'drill_down';
  let shouldUseProceduralSkills = mode === 'startup' || mode === 'post_task';
  let shouldUseSlidingWindow = true;

  if (mode === 'startup') {
    layers.add('recent_summary');
    layers.add('observation_ledger');
    layers.add('sliding_window');
    reasons.push('Startup mode always hydrates layered context for host agents.');
  }

  if (mode === 'post_task') {
    layers.add('recent_summary');
    layers.add('procedural_memory');
    layers.add('sliding_window');
    reasons.push('Post-task mode prepares reviewable follow-up context without forcing a new observation search.');
  }

  if (STATE_KEYWORDS.test(queryText)) {
    reasons.push('Query looks like a current-state lookup, so structured profile should be included.');
    layers.add('structured_profile');
  }

  if (SUMMARY_KEYWORDS.test(queryText) || mode === 'startup') {
    shouldUseDailyDigests = true;
    layers.add('recent_summary');
    reasons.push('Recent summary context is relevant for this request.');
  }

  if (PROCEDURE_KEYWORDS.test(queryText) || /\b(skill|playbook|recipe)\b/i.test(queryText)) {
    shouldUseProceduralSkills = true;
    layers.add('procedural_memory');
    reasons.push('Task wording implies reusable steps, so procedural memory should be consulted.');
  }

  if (!STATE_KEYWORDS.test(queryText) && !SUMMARY_KEYWORDS.test(queryText) && mode !== 'startup') {
    shouldUseObservationSearch = true;
    layers.add('observation_ledger');
    reasons.push('Direct memory search is needed to answer the task-specific query.');
  }

  if (includeHistoricalSlice) {
    shouldUseDailyDigests = true;
    shouldUseObservationSearch = true;
    layers.add('recent_summary');
    layers.add('observation_ledger');
    reasons.push('Historical lookup requires time-sliced summaries and ledger events.');
  }

  layers.add('sliding_window');

  return {
    action: 'read',
    mode,
    layers: Array.from(layers),
    reasons,
    includeHistoricalSlice,
    observationLimit: clampPositiveInt(input.requestedLimit, DEFAULT_MEMORY_OBSERVATION_LIMIT, 20),
    digestLimit: clampPositiveInt(input.requestedLimit, DEFAULT_MEMORY_DIGEST_LIMIT, 7),
    skillLimit: clampPositiveInt(input.requestedSkillLimit, DEFAULT_MEMORY_SKILL_LIMIT, 10),
    windowCharBudget: clampPositiveInt(input.requestedWindowChars, DEFAULT_WINDOW_CHAR_BUDGET, 6000),
    shouldUseDailyDigests,
    shouldUseObservationSearch,
    shouldUseProceduralSkills,
    shouldUseSlidingWindow,
    shouldUseStateFacts: true,
  };
}

export function decideObservationWritePolicy(
  input: ObservationWritePolicyInput
): ObservationWritePolicyDecision {
  const observation = input.observation;
  const reasons: string[] = [];
  const hasFacts = Array.isArray(observation.facts) && observation.facts.length > 0;
  const hasFiles = Array.isArray(observation.files_modified) && observation.files_modified.length > 0;
  const hasNarrative = String(observation.narrative || '').trim().length >= 24;
  const lowSignalTitle = isLowSignalTitle(observation.title);
  const evidenceText = [
    observation.title,
    observation.narrative,
    ...(Array.isArray(observation.facts) ? observation.facts : []),
  ].join('\n');
  const hasSubstantiveOutcome = SUBSTANTIVE_OBSERVATION_KEYWORDS.test(evidenceText);

  if (!String(observation.title || '').trim()) {
    return {
      action: 'skip',
      reasons: ['Observation title is empty, so the ledger entry would not be actionable.'],
    };
  }

  if (input.source === 'manual' || input.source === 'mcp_record') {
    return {
      action: 'record',
      reasons: ['Explicit user- or MCP-driven writes bypass heuristic filtering.'],
    };
  }

  if (lowSignalTitle && !hasFiles && !hasSubstantiveOutcome) {
    return {
      action: 'skip',
      reasons: ['Routine read, status, search, view, run, or raw-execution activity has no modified files or substantive outcome.'],
    };
  }

  if (hasFacts || hasFiles || hasNarrative) {
    reasons.push('Observation has enough signal to remain in the append-only ledger.');
    return {
      action: 'record',
      reasons,
    };
  }

  return {
    action: 'skip',
    reasons: ['Observation has no durable signal after summarization.'],
  };
}

export function decidePostTaskReviewPolicy(
  input: PostTaskReviewPolicyInput
): PostTaskReviewPolicyDecision {
  const observation = input.observation;
  const title = String(observation.title || '').trim();
  const facts = Array.isArray(observation.facts)
    ? observation.facts.map((fact) => String(fact).trim()).filter(Boolean)
    : [];
  const filesModified = Array.isArray(observation.files_modified)
    ? observation.files_modified.map((file) => String(file).trim()).filter(Boolean)
    : [];
  const narrative = String(observation.narrative || '').trim();
  const reasons: string[] = [];
  const hasFiles = filesModified.length > 0;
  const hasFacts = facts.length > 0;
  const hasNarrative = narrative.length >= 48;
  const lowSignalTitle = isLowSignalTitle(title);
  const rawExecutionTitle = /^raw execution:/i.test(title);

  if (!title) {
    return {
      action: 'skip',
      mode: 'post_task',
      observationLimit: 0,
      reasons: ['Post-task review needs a source title to produce a traceable follow-up artifact.'],
      skillLimit: 0,
      queryText: '',
      windowCharBudget: 0,
    };
  }

  if (rawExecutionTitle && !hasFiles) {
    return {
      action: 'skip',
      mode: 'post_task',
      observationLimit: 0,
      reasons: ['Fallback raw execution entries stay in the ledger but do not automatically create review artifacts.'],
      skillLimit: 0,
      queryText: '',
      windowCharBudget: 0,
    };
  }

  if (lowSignalTitle && !hasFiles && !hasFacts) {
    return {
      action: 'skip',
      mode: 'post_task',
      observationLimit: 0,
      reasons: ['Low-signal observations without durable evidence do not trigger automatic post-task review.'],
      skillLimit: 0,
      queryText: '',
      windowCharBudget: 0,
    };
  }

  if (!hasFiles && !hasFacts && !hasNarrative) {
    return {
      action: 'skip',
      mode: 'post_task',
      observationLimit: 0,
      reasons: ['Post-task review runs only when the observation contains durable task evidence.'],
      skillLimit: 0,
      queryText: '',
      windowCharBudget: 0,
    };
  }

  if (hasFiles) {
    reasons.push('Modified files imply durable task output worth a reviewable post-task package.');
  }
  if (hasFacts) {
    reasons.push('Structured facts provide enough signal to drive procedural recommendation and context packaging.');
  }
  if (hasNarrative) {
    reasons.push('Narrative context is long enough to justify automatic post-task review.');
  }

  const queryParts = [
    `After finishing "${title}", what procedures, rollout state, and bounded context should be reviewed next?`,
  ];

  if (facts.length > 0) {
    queryParts.push(`Facts: ${facts.slice(0, 3).join('; ')}`);
  }

  if (filesModified.length > 0) {
    queryParts.push(`Files modified: ${filesModified.slice(0, 4).join(', ')}`);
  }

  return {
    action: 'review',
    mode: 'post_task',
    observationLimit: 4,
    reasons,
    skillLimit: 4,
    queryText: queryParts.join(' '),
    windowCharBudget: 1500,
  };
}

export function decideProceduralSkillPromotion(candidate: unknown): ProceduralSkillPromotionDecision {
  const normalized = normalizeProceduralSkillCandidate(candidate);
  const reasons: string[] = [];

  if (!normalized) {
    return {
      action: 'skip',
      candidate: null,
      reasons: ['Skill candidate is missing required fields.'],
    };
  }

  if (normalized.steps.length === 0) {
    return {
      action: 'skip',
      candidate: normalized,
      reasons: ['Procedural skills need at least one concrete step.'],
    };
  }

  if (normalized.confidence < 0.35) {
    return {
      action: 'skip',
      candidate: normalized,
      reasons: ['Confidence is below the minimum review threshold for draft promotion.'],
    };
  }

  reasons.push('Candidate meets the minimum shape for explicit reviewable promotion.');
  return {
    action: 'promote_draft',
    candidate: normalized,
    reasons,
  };
}

function normalizeProceduralSkillCandidate(candidate: unknown): ProceduralSkillCandidate | null {
  const value = candidate as Record<string, unknown>;
  const title = String(value?.title || '').trim();
  const summary = String(value?.summary || '').trim();
  const triggerText = String(value?.trigger_text || value?.trigger || '').trim();
  const steps = Array.isArray(value?.steps)
    ? value.steps.map((step) => String(step).trim()).filter(Boolean)
    : [];
  const tags = Array.isArray(value?.tags)
    ? value.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const confidence = normalizeConfidence(value?.confidence);

  if (!title || !summary || !triggerText) {
    return null;
  }

  return {
    title,
    summary,
    trigger_text: triggerText,
    steps,
    tags,
    confidence,
  };
}

function hasDigestSignal(observation: Observation): boolean {
  return (
    observation.files_modified.length > 0 ||
    observation.facts.length > 0 ||
    observation.narrative.trim().length > 40 ||
    /\b(fixed|implemented|released|validated|decided|designed|planned)\b/i.test(observation.title)
  );
}

function toExclusion(
  observation: Observation,
  reason: DigestExclusionReason
): DigestObservationExclusion {
  return {
    id: observation.id,
    reason,
    title: observation.title,
  };
}

function addLowSignalPattern(patterns: string[], title: string) {
  if (!patterns.includes(title)) {
    patterns.push(title);
  }
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}
