import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DailyDigestSchedulerConfig,
  DatabaseManager,
  Observation,
  ObservationListFilters,
  ProceduralSkillFeedbackInput,
  Session,
  StateFactInput,
} from './db';
import { v4 as uuidv4 } from 'uuid';
import { renderAdminPageHtml } from './admin-ui';
import {
  buildAdminProjectContextPayload,
  toAdminSearchResult,
} from './admin-workbench';
import {
  createDisabledProjectContextView,
} from './context-view';
import { getEmbedding } from './embedding';
import { resolveMemoryQuery } from './memory-query';
import { orchestrateMemoryRead } from './memory-orchestrator';
import { decideObservationWritePolicy } from './memory-policy';
import {
  parseProjectContextLimit,
} from './project-context';
import {
  enrichProceduralSkillForOps,
  promoteProceduralSkillCandidate,
  recordProceduralSkillFeedback,
} from './procedural-memory';
import { runAutomaticPostTaskReview } from './post-task-review';
import {
  normalizeRuntimePolicy,
  READ_DISABLED_MESSAGE,
  WRITE_DISABLED_MESSAGE,
} from './runtime-policy';
import {
  getAgentMemoryEnvPath,
  readLlmConfig,
  saveLlmConfig,
  testLlmConnection,
} from './llm-config';
import { buildReleaseManifest } from './release';
import { checkLatestRelease } from './release-check';
import { runDailyMemoryDigest } from './daily-digest';
import {
  DailyDigestSchedulerHandle,
  millisecondsUntilNextLocalDigestRun,
  startDailyDigestScheduler,
} from './daily-digest-scheduler';

// Load environment variables
dotenv.config({ path: getAgentMemoryEnvPath() });

const app = express();
app.use(express.json({ limit: '10mb' })); // Support large logs

const PORT = process.env.AGENTMEM_PORT || 38888;
const dbManager = new DatabaseManager();
let dailyDigestScheduler: DailyDigestSchedulerHandle | null = null;
const workerRuntimeDir = process.env.AGENTMEM_RUNTIME_DIR || path.join(os.homedir(), '.agentmem');
const workerPidPath = path.join(workerRuntimeDir, 'worker.pid');
const workerStatusPath = path.join(workerRuntimeDir, 'worker-status.json');
let workerStartedAt = '';
let workerRuntimeRegistered = false;

// Queue to process tool executions sequentially in the background
interface QueuedToolLog {
  id: string;
  session_id: string;
  project_path: string;
  agent_id: string;
  tool_name: string;
  input: string;
  output: string;
  success: boolean;
  timestamp: number;
}

const logQueue: QueuedToolLog[] = [];
let isProcessingQueue = false;
const ADMIN_HTML = renderAdminPageHtml(5000);

function writeWorkerRuntimeStatus(state: 'running' | 'stopped', exitCode?: number) {
  try {
    fs.mkdirSync(workerRuntimeDir, { recursive: true });
    fs.writeFileSync(
      workerStatusPath,
      `${JSON.stringify({
        exitCode,
        pid: process.pid,
        port: Number(PORT),
        repoRoot: path.resolve(__dirname, '../..'),
        startedAt: workerStartedAt,
        state,
        updatedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      'utf8'
    );
  } catch {
    // Runtime diagnostics must not prevent the worker from serving requests.
  }
}

function registerWorkerRuntime() {
  workerStartedAt = new Date().toISOString();
  fs.mkdirSync(workerRuntimeDir, { recursive: true });
  fs.writeFileSync(workerPidPath, `${process.pid}\n`, 'utf8');
  writeWorkerRuntimeStatus('running');
  workerRuntimeRegistered = true;
}

function unregisterWorkerRuntime(exitCode: number = 0) {
  if (!workerRuntimeRegistered) return;
  try {
    if (fs.existsSync(workerPidPath) && fs.readFileSync(workerPidPath, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(workerPidPath);
    }
  } catch {
    // A stale PID file is reported by the CLI status command on the next run.
  }
  writeWorkerRuntimeStatus('stopped', exitCode);
  workerRuntimeRegistered = false;
}

process.on('exit', (exitCode) => unregisterWorkerRuntime(exitCode));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    dailyDigestScheduler?.stop();
    dbManager.close();
    unregisterWorkerRuntime(0);
    process.exit(0);
  });
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace('::ffff:', '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

function adminOnlyGuard(req: Request, res: Response, next: express.NextFunction) {
  const remoteAddress = req.socket.remoteAddress || req.ip;
  if (!isLoopbackAddress(remoteAddress)) {
    res.status(403).json({
      error: 'AgentMemory admin routes are only available from loopback addresses.',
    });
    return;
  }
  next();
}

async function isReadEnabled(): Promise<boolean> {
  const policy = await dbManager.getRuntimePolicy();
  return policy.readEnabled;
}

async function isWriteEnabled(): Promise<boolean> {
  const policy = await dbManager.getRuntimePolicy();
  return policy.writeEnabled;
}

function sendReadDisabled(res: Response, key: string) {
  res.json({
    disabled: true,
    message: READ_DISABLED_MESSAGE,
    [key]: [],
  });
}

function sendWriteDisabled(res: Response) {
  res.json({
    success: false,
    disabled: true,
    message: WRITE_DISABLED_MESSAGE,
  });
}

function toAdminObservation(observation: Observation) {
  return {
    id: observation.id,
    session_id: observation.session_id,
    project_path: observation.project_path,
    agent_id: observation.agent_id,
    title: observation.title,
    narrative: observation.narrative,
    facts: observation.facts,
    concepts: observation.concepts,
    files_read: observation.files_read,
    files_modified: observation.files_modified,
    created_at: observation.created_at,
  };
}

function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath).replace(/\\/g, '/');
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function buildProjectContext(projectPath: string, limit: number, asOf?: string) {
  const orchestrated = await orchestrateMemoryRead(dbManager, {
    asOf,
    limit,
    mode: 'startup',
    projectPath,
    queryText: '',
    skillLimit: Math.max(3, Math.min(limit, 6)),
  });
  return orchestrated.project_context;
}

function sendContextReadDisabled(res: Response, projectPath: string) {
  res.json(createDisabledProjectContextView(projectPath, READ_DISABLED_MESSAGE));
}

function sendStateReadDisabled(res: Response, projectPath: string, asOf?: string) {
  res.json({
    disabled: true,
    message: READ_DISABLED_MESSAGE,
    project_path: projectPath,
    as_of: asOf || null,
    facts: [],
  });
}

function normalizeStateInput(body: any): StateFactInput {
  return {
    project_path: normalizeProjectPath(String(body.project_path)),
    entity_type: body.entity_type ? String(body.entity_type) : undefined,
    entity_key: body.entity_key ? String(body.entity_key) : undefined,
    fact_key: String(body.fact_key),
    value: body.value,
    effective_at: body.effective_at ? String(body.effective_at) : undefined,
  };
}

function parseSearchLimit(rawLimit: unknown, fallback: number = 10): number {
  const value = Number(rawLimit);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.min(Math.trunc(value), 50);
}

function parseWindowCharBudget(rawValue: unknown, fallback: number = 1800): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 200) {
    return fallback;
  }

  return Math.min(Math.trunc(value), 12000);
}

function normalizeSkillStatuses(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const rawValues = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
  return rawValues.map((entry) => String(entry));
}

function applyDailyDigestSchedulerConfig(config: DailyDigestSchedulerConfig) {
  dailyDigestScheduler?.stop();
  dailyDigestScheduler = null;
  if (!config.enabled) {
    return;
  }

  dailyDigestScheduler = startDailyDigestScheduler(dbManager, {
    lookbackDays: config.lookback_days,
    scheduleHour: config.schedule_hour,
    scheduleMinute: config.schedule_minute,
    timeZone: config.time_zone,
  });
}

function buildDailyDigestSchedulerPayload(config: DailyDigestSchedulerConfig) {
  const active = !!dailyDigestScheduler;
  const delayMs = active
    ? millisecondsUntilNextLocalDigestRun(
        new Date(),
        config.schedule_hour,
        config.schedule_minute,
        config.time_zone
      )
    : null;

  return {
    config,
    runtime: {
      active,
      next_run_at: delayMs === null ? null : new Date(Date.now() + delayMs).toISOString(),
      next_run_delay_ms: delayMs,
    },
  };
}

function normalizeDailyDigestSchedulerBody(body: any) {
  return {
    enabled: Object.prototype.hasOwnProperty.call(body, 'enabled') ? !!body.enabled : undefined,
    lookback_days: Object.prototype.hasOwnProperty.call(body, 'lookback_days')
      ? Number(body.lookback_days)
      : undefined,
    schedule_time: typeof body.schedule_time === 'string' ? body.schedule_time : undefined,
    time_zone: typeof body.time_zone === 'string' ? body.time_zone : undefined,
  };
}

// Initialize database before starting the server
async function startServer() {
  await dbManager.initialize();
  console.log('AgentMemory SQLite database initialized.');
  applyDailyDigestSchedulerConfig(await dbManager.getDailyDigestSchedulerConfig());

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, () => {
      registerWorkerRuntime();
      console.log(`AgentMemory worker service running on port ${PORT}`);
      resolve();
    });
    server.once('error', reject);
  });
}

app.get('/admin', adminOnlyGuard, async (_req, res) => {
  res.type('html').send(ADMIN_HTML);
});

app.get('/admin/api/overview', adminOnlyGuard, async (_req, res) => {
  try {
    const [policy, observations, sessions, projects, agents, currentStateFacts, dailyDigests, proceduralSkills, postTaskReviews] = await Promise.all([
      dbManager.getRuntimePolicy(),
      dbManager.countObservations(),
      dbManager.countSessions(),
      dbManager.listDistinctProjects(),
      dbManager.listDistinctAgents(),
      dbManager.countCurrentStateFacts(),
      dbManager.countDailyMemoryDigests(),
      dbManager.countProceduralSkills(),
      dbManager.countPostTaskReviews(),
    ]);

    res.json({
      policy,
      stats: {
        observations,
        sessions,
        projects: projects.length,
        agents: agents.length,
        currentStateFacts,
        dailyDigests,
        proceduralSkills,
        postTaskReviews,
      },
      release: buildReleaseManifest(),
      projects,
      agents,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching admin overview:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/release-check', adminOnlyGuard, async (_req, res) => {
  try {
    res.json(await checkLatestRelease());
  } catch (err: any) {
    console.error('Error fetching admin release check:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/records', adminOnlyGuard, async (req, res) => {
  try {
    const filters: ObservationListFilters = {
      page: parseInt((req.query.page as string) || '1', 10),
      pageSize: parseInt((req.query.pageSize as string) || '25', 10),
      project: (req.query.project as string) || undefined,
      agent: (req.query.agent as string) || undefined,
      query: (req.query.query as string) || undefined,
    };

    const result = await dbManager.listObservations(filters);
    res.json({
      page: filters.page || 1,
      pageSize: filters.pageSize || 25,
      total: result.total,
      records: result.records.map((record) => toAdminObservation(record)),
    });
  } catch (err: any) {
    console.error('Error fetching admin records:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/settings', adminOnlyGuard, async (req, res) => {
  try {
    const body = req.body || {};
    const updates: { readEnabled?: boolean; writeEnabled?: boolean } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'readEnabled')) {
      updates.readEnabled = !!body.readEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'writeEnabled')) {
      updates.writeEnabled = !!body.writeEnabled;
    }

    const normalized =
      Object.keys(updates).length === 0 ? normalizeRuntimePolicy({}) : updates;
    const policy = await dbManager.updateRuntimePolicy(normalized);
    res.json({ success: true, policy });
  } catch (err: any) {
    console.error('Error updating runtime policy:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/context', adminOnlyGuard, async (req, res) => {
  const projectPath = req.query.project_path as string;
  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);
  const limit = parseProjectContextLimit(req.query.limit as string | undefined);
  const asOf = normalizeOptionalString(req.query.as_of);

  try {
    const view = !(await isReadEnabled())
      ? createDisabledProjectContextView(normalizedProjectPath, READ_DISABLED_MESSAGE)
      : await buildProjectContext(normalizedProjectPath, limit, asOf);
    res.json(buildAdminProjectContextPayload(view));
  } catch (err: any) {
    console.error('Error fetching admin context:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/state', adminOnlyGuard, async (req, res) => {
  const projectPath = req.query.project_path as string;
  const entityType = (req.query.entity_type as string) || undefined;
  const rawEntityKey = (req.query.entity_key as string) || undefined;
  const factKey = (req.query.fact_key as string) || undefined;
  const asOf = (req.query.as_of as string) || undefined;

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);
  const entityKey =
    entityType === 'project' && rawEntityKey ? normalizeProjectPath(rawEntityKey) : rawEntityKey;

  try {
    if (!(await isReadEnabled())) {
      return sendStateReadDisabled(res, normalizedProjectPath, asOf);
    }

    const facts = await dbManager.getStateFacts({
      projectPath: normalizedProjectPath,
      entityType,
      entityKey,
      factKey,
      asOf,
    });

    res.json({
      project_path: normalizedProjectPath,
      as_of: asOf || null,
      facts,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching admin state:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/state', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  if (!body.project_path || !body.fact_key || !Object.prototype.hasOwnProperty.call(body, 'value')) {
    return res.status(400).json({
      error: 'Missing required state parameters: project_path, fact_key, and value',
    });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const fact = await dbManager.saveStateFact(normalizeStateInput(body));
    res.json({ success: true, fact });
  } catch (err: any) {
    console.error('Error writing admin state:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/search', adminOnlyGuard, async (req, res) => {
  const { project_path, query, limit, as_of } = req.body || {};
  if (!project_path || !query) {
    return res.status(400).json({ error: 'Missing project_path or query' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendReadDisabled(res, 'results');
    }

    const normalizedProjectPath = normalizeProjectPath(String(project_path));
    const queryVector = await getEmbedding(String(query));
    const results = await dbManager.searchHybrid(
      normalizedProjectPath,
      String(query),
      queryVector,
      parseSearchLimit(limit, 10),
      { asOf: normalizeOptionalString(as_of) }
    );

    res.json({
      project_path: normalizedProjectPath,
      query: String(query),
      as_of: normalizeOptionalString(as_of) || null,
      results: results.map((result) => toAdminSearchResult(result)),
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error running admin search diagnostics:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/memory/query', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  if (!body.project_path || !body.query) {
    return res.status(400).json({ error: 'Missing project_path or query' });
  }

  try {
    if (!(await isReadEnabled())) {
      return res.json({
        disabled: true,
        message: READ_DISABLED_MESSAGE,
        project_context: null,
        procedural_skills: [],
        search_results: [],
      });
    }

    const result = await resolveMemoryQuery(dbManager, {
      projectPath: normalizeProjectPath(String(body.project_path)),
      query: String(body.query),
      asOf: normalizeOptionalString(body.as_of),
      limit: parseSearchLimit(body.limit, 5),
      mode: normalizeOptionalString(body.mode) as any,
      skillLimit: parseSearchLimit(body.skill_limit, 3),
      windowCharBudget: parseWindowCharBudget(body.window_char_budget, 1800),
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error resolving admin memory query:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/skills', adminOnlyGuard, async (req, res) => {
  const projectPath = req.query.project_path as string;
  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendReadDisabled(res, 'skills');
    }

    const skillRows = await dbManager.listProceduralSkills({
      projectPath: normalizeProjectPath(projectPath),
      statuses: normalizeSkillStatuses(req.query.status) as any,
      limit: parseSearchLimit(req.query.limit, 10),
      asOf: normalizeOptionalString(req.query.as_of),
    });
    const skills = await Promise.all(
      skillRows.map((skill) =>
        enrichProceduralSkillForOps(dbManager, skill, {
          asOf: normalizeOptionalString(req.query.as_of),
        })
      )
    );
    res.json({
      project_path: normalizeProjectPath(projectPath),
      skills,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error listing admin procedural skills:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/post-task-reviews', adminOnlyGuard, async (req, res) => {
  const projectPath = req.query.project_path as string;
  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendReadDisabled(res, 'reviews');
    }

    const reviews = await dbManager.listPostTaskReviews({
      projectPath: normalizeProjectPath(projectPath),
      limit: parseSearchLimit(req.query.limit, 8),
    });
    res.json({
      project_path: normalizeProjectPath(projectPath),
      reviews,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error listing admin post-task reviews:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/skills/promote-candidate', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  if (!body.project_path) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const projectPath = normalizeProjectPath(String(body.project_path));
    let digest = null;
    let candidate = body.candidate;

    if (candidate === undefined) {
      const localDate = normalizeOptionalString(body.local_date);
      const candidateIndex = Number(body.candidate_index);
      if (!localDate || !Number.isInteger(candidateIndex) || candidateIndex < 0) {
        return res.status(400).json({
          error: 'Provide either candidate or local_date + candidate_index.',
        });
      }

      digest = await dbManager.getDailyMemoryDigest({
        projectPath,
        localDate,
      });
      candidate = digest?.digest?.skill_candidates?.[candidateIndex];
      if (!candidate) {
        return res.status(404).json({ error: 'Skill candidate not found for that digest entry.' });
      }
    }

    const skill = await promoteProceduralSkillCandidate({
      candidate,
      dbManager,
      digest,
      projectPath,
    });
    res.json({ success: true, skill });
  } catch (err: any) {
    console.error('Error promoting admin procedural skill candidate:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/skills/status', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  if (!body.skill_id || !body.status) {
    return res.status(400).json({ error: 'Missing skill_id or status' });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const skill = await dbManager.setProceduralSkillStatus(String(body.skill_id), String(body.status) as any);
    res.json({ success: true, skill });
  } catch (err: any) {
    console.error('Error updating admin procedural skill status:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/skills/feedback', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  if (!body.skill_id || !body.project_path || !body.outcome) {
    return res.status(400).json({ error: 'Missing skill_id, project_path, or outcome' });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const feedback = await recordProceduralSkillFeedback(dbManager, {
      skill_id: String(body.skill_id),
      project_path: normalizeProjectPath(String(body.project_path)),
      outcome: String(body.outcome) as ProceduralSkillFeedbackInput['outcome'],
      task_text: normalizeOptionalString(body.task_text),
      notes: normalizeOptionalString(body.notes),
    });
    res.json({ success: true, feedback });
  } catch (err: any) {
    console.error('Error recording admin procedural skill feedback:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/digests', adminOnlyGuard, async (req, res) => {
  const projectPath = req.query.project_path as string;
  const limit = parseSearchLimit(req.query.limit, 10);

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);
  try {
    if (!(await isReadEnabled())) {
      return res.json({
        disabled: true,
        message: READ_DISABLED_MESSAGE,
        project_path: normalizedProjectPath,
        latest: null,
        digests: [],
      });
    }

    const digests = await dbManager.listDailyMemoryDigests({
      projectPath: normalizedProjectPath,
      limit,
    });
    res.json({
      project_path: normalizedProjectPath,
      latest: digests[0] || null,
      digests,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching admin daily digests:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/digest-scheduler', adminOnlyGuard, async (_req, res) => {
  try {
    const config = await dbManager.getDailyDigestSchedulerConfig();
    res.json(buildDailyDigestSchedulerPayload(config));
  } catch (err: any) {
    console.error('Error fetching admin daily digest scheduler config:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/digest-scheduler', adminOnlyGuard, async (req, res) => {
  try {
    const config = await dbManager.updateDailyDigestSchedulerConfig(
      normalizeDailyDigestSchedulerBody(req.body || {})
    );
    applyDailyDigestSchedulerConfig(config);
    res.json({
      success: true,
      ...buildDailyDigestSchedulerPayload(config),
    });
  } catch (err: any) {
    console.error('Error updating admin daily digest scheduler config:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/digests/run', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};

  if (!body.project_path) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const result = await runDailyMemoryDigest({
      dbManager,
      localDate: body.local_date ? String(body.local_date) : undefined,
      projectPath: normalizeProjectPath(String(body.project_path)),
      timeZone: body.time_zone ? String(body.time_zone) : undefined,
    });

    res.json({
      success: true,
      digest: result.digest,
      local_date: result.localDate,
      selection: result.selection,
    });
  } catch (err: any) {
    console.error('Error running admin daily digest:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/llm-config', adminOnlyGuard, async (_req, res) => {
  try {
    res.json({
      config: readLlmConfig(),
      refreshedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching LLM config:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/llm-config', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  try {
    const config = saveLlmConfig({
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      apiUrl: typeof body.apiUrl === 'string' ? body.apiUrl : undefined,
      disableJsonMode: !!body.disableJsonMode,
      headers: typeof body.headers === 'string' ? body.headers : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
    });
    res.json({
      success: true,
      config,
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error saving LLM config:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/llm-test', adminOnlyGuard, async (req, res) => {
  const body = req.body || {};
  try {
    const result = await testLlmConnection({
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      apiUrl: typeof body.apiUrl === 'string' ? body.apiUrl : undefined,
      headers: typeof body.headers === 'string' ? body.headers : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error testing LLM connection:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. Get Project Memory Context (For Session Initialization)
app.get('/context', async (req, res) => {
  const projectPath = req.query.project_path as string;
  const normalizedProjectPath = projectPath ? normalizeProjectPath(projectPath) : '';
  const limit = parseProjectContextLimit(req.query.limit as string | undefined);
  const asOf = normalizeOptionalString(req.query.as_of);

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendContextReadDisabled(res, normalizedProjectPath);
    }

    res.json(await buildProjectContext(normalizedProjectPath, limit, asOf));
  } catch (err: any) {
    console.error('Error fetching context:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/state', async (req, res) => {
  const projectPath = req.query.project_path as string;
  const entityType = (req.query.entity_type as string) || undefined;
  const rawEntityKey = (req.query.entity_key as string) || undefined;
  const factKey = (req.query.fact_key as string) || undefined;
  const asOf = (req.query.as_of as string) || undefined;

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);
  const entityKey =
    entityType === 'project' && rawEntityKey ? normalizeProjectPath(rawEntityKey) : rawEntityKey;

  try {
    if (!(await isReadEnabled())) {
      return sendStateReadDisabled(res, normalizedProjectPath, asOf);
    }

    const facts = await dbManager.getStateFacts({
      projectPath: normalizedProjectPath,
      entityType,
      entityKey,
      factKey,
      asOf,
    });

    res.json({
      project_path: normalizedProjectPath,
      as_of: asOf || null,
      facts,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching state:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/state', async (req, res) => {
  const body = req.body || {};

  if (!body.project_path || !body.fact_key || !Object.prototype.hasOwnProperty.call(body, 'value')) {
    return res.status(400).json({
      error: 'Missing required state parameters: project_path, fact_key, and value',
    });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const fact = await dbManager.saveStateFact(normalizeStateInput(body));
    res.json({ success: true, fact });
  } catch (err: any) {
    console.error('Error writing state:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Start/Update Session
app.post('/sessions', async (req, res) => {
  const { id, project_path, agent_id, status } = req.body;
  if (!id || !project_path || !agent_id) {
    return res.status(400).json({ error: 'Missing required session parameters' });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const normalizedPath = normalizeProjectPath(project_path);
    const session: Session = {
      id,
      project_path: normalizedPath,
      agent_id,
      status: status || 'active'
    };

    await dbManager.saveSession(session);
    console.log(`[Session] Registered session ${id} for agent ${agent_id} on ${normalizedPath}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Ingest Hook Logs (Tool Execution Event)
app.post('/tools', async (req, res) => {
  const { session_id, project_path, agent_id, tool_name, input, output, success } = req.body;

  if (!session_id || !project_path || !agent_id || !tool_name) {
    return res.status(400).json({ error: 'Missing required tool payload fields' });
  }

  if (!(await isWriteEnabled())) {
    return sendWriteDisabled(res);
  }

  const logEntry: QueuedToolLog = {
    id: uuidv4(),
    session_id,
    project_path: normalizeProjectPath(project_path),
    agent_id,
    tool_name,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    output: typeof output === 'string' ? output : JSON.stringify(output),
    success: !!success,
    timestamp: Date.now()
  };

  logQueue.push(logEntry);
  res.json({ success: true, queueLength: logQueue.length });

  // Trigger queue processing asynchronously
  processQueue();
});

// 4. Force Session Summary on Close
app.post('/sessions/close', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing session ID' });

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    await dbManager.saveSession({
      id,
      project_path: '',
      agent_id: '',
      status: 'completed'
    });
    console.log(`[Session] Closed session ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Search Memory Endpoint (Helper for testing and non-MCP clients)
app.post('/search', async (req, res) => {
  const { project_path, query, limit, as_of } = req.body;
  if (!project_path || !query) {
    return res.status(400).json({ error: 'Missing project_path or query' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendReadDisabled(res, 'results');
    }

    const queryVector = await getEmbedding(query);
    const results = await dbManager.searchHybrid(
      project_path,
      query,
      queryVector,
      limit || 5,
      { asOf: normalizeOptionalString(as_of) }
    );
    res.json({
      project_path: normalizeProjectPath(project_path),
      query,
      as_of: normalizeOptionalString(as_of) || null,
      results,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/memory/query', async (req, res) => {
  const body = req.body || {};
  if (!body.project_path || !body.query) {
    return res.status(400).json({ error: 'Missing project_path or query' });
  }

  try {
    if (!(await isReadEnabled())) {
      return res.json({
        disabled: true,
        message: READ_DISABLED_MESSAGE,
        project_context: null,
        procedural_skills: [],
        search_results: [],
      });
    }

    const result = await resolveMemoryQuery(dbManager, {
      projectPath: normalizeProjectPath(String(body.project_path)),
      query: String(body.query),
      asOf: normalizeOptionalString(body.as_of),
      limit: parseSearchLimit(body.limit, 5),
      mode: normalizeOptionalString(body.mode) as any,
      skillLimit: parseSearchLimit(body.skill_limit, 3),
      windowCharBudget: parseWindowCharBudget(body.window_char_budget, 1800),
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error resolving memory query:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Shutdown Worker Endpoint
app.post('/shutdown', (req, res) => {
  res.json({ success: true, message: 'Shutting down AgentMemory worker...' });
  console.log('Shutdown request received. Exiting...');
  setTimeout(() => {
    dailyDigestScheduler?.stop();
    dbManager.close();
    process.exit(0);
  }, 500);
});

// Queue Processing Loop
async function processQueue() {
  if (isProcessingQueue || logQueue.length === 0) return;
  isProcessingQueue = true;

  try {
    while (logQueue.length > 0) {
      const nextLog = logQueue.shift();
      if (nextLog) {
        await handleSummarization(nextLog);
      }
    }
  } catch (err) {
    console.error('Error processing queue item:', err);
  } finally {
    isProcessingQueue = false;
  }
}

// Highly resilient JSON extractor that works even if LLMs return markdown code blocks
function parseJSONContent(rawText: string): any {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        // Fall through to throw error
      }
    }
    throw new Error('Failed to parse JSON response from LLM');
  }
}

// Generalized LLM API Summarization Logic
async function handleSummarization(log: QueuedToolLog) {
  const apiKey = process.env.AGENTMEM_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const rawApiUrl = process.env.AGENTMEM_LLM_API_URL || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
  const modelName = process.env.AGENTMEM_LLM_MODEL || 'deepseek-chat';

  // If no API key is specified and it is not a local Ollama setup (which doesn't require a key), save raw observation
  const isLocalOllama = rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1');
  if (!apiKey && !isLocalOllama) {
    console.warn('[Warning] LLM API credentials not found in environment. Saving raw observation without LLM summarization.');
    await saveMockObservation(log, 'Missing LLM API credentials. Running in Raw Mode.');
    return;
  }

  const requestUrl = `${rawApiUrl.trim()}/chat/completions`;

  // Parse custom headers if configured (will fail loudly if invalid JSON)
  let customHeaders: Record<string, string> = {};
  if (process.env.AGENTMEM_LLM_HEADERS) {
    customHeaders = JSON.parse(process.env.AGENTMEM_LLM_HEADERS);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (!headers['Authorization'] && !headers['authorization'] && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Build the summarization prompt
  const systemPrompt = `You are a developer memory synthesis assistant.
Your task is to analyze a raw tool execution log and compress it into a clean, structured JSON "Observation".
Extract the architectural decisions, bug fixes, files read/modified, and key learnings.

You MUST respond with a valid JSON object ONLY. Do not write any markdown blocks or reasoning steps.
JSON Schema:
{
  "title": "Short title describing the main action or fix",
  "narrative": "A descriptive paragraph explaining the context, problem encountered, reasoning, and resolution.",
  "facts": ["Fact 1", "Fact 2"],
  "concepts": ["Key concept/technology/framework 1", "2"],
  "files_read": ["file1.ts", "file2.json"],
  "files_modified": ["file1.ts"]
}`;

  const userPrompt = `Tool Name: ${log.tool_name}
Status: ${log.success ? 'Success' : 'Failure'}
Project Location: ${log.project_path}
Agent: ${log.agent_id}

[TOOL INPUT]
${log.input.substring(0, 10000)}

[TOOL OUTPUT]
${log.output.substring(0, 20000)}
`;

  try {
    const requestBody: any = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1
    };

    // Only send response_format if JSON Mode is not explicitly disabled
    const disableJsonMode = process.env.AGENTMEM_LLM_DISABLE_JSON_MODE === 'true';
    if (!disableJsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM API');

    // Resilient parsing of JSON content
    const parsedObs = parseJSONContent(content);

    // Compute embedding for vector search
    const textToEmbed = `${parsedObs.title} ${parsedObs.narrative} ${parsedObs.facts.join(' ')} ${parsedObs.concepts.join(' ')}`;
    const embedding = await getEmbedding(textToEmbed);

    const observation: Observation = {
      id: log.id,
      session_id: log.session_id,
      project_path: log.project_path,
      agent_id: log.agent_id,
      title: parsedObs.title || `Ran ${log.tool_name}`,
      narrative: parsedObs.narrative || `Executed tool ${log.tool_name} in workspace.`,
      facts: parsedObs.facts || [],
      concepts: parsedObs.concepts || [],
      files_read: parsedObs.files_read || [],
      files_modified: parsedObs.files_modified || [],
      embedding
    };

    const writeDecision = decideObservationWritePolicy({
      observation,
      source: 'tool_log',
    });

    if (writeDecision.action === 'skip') {
      console.log(`[Memory] Skipped observation for session ${log.session_id}: ${writeDecision.reasons.join(' | ')}`);
      return;
    }

    await dbManager.saveObservation(observation);
    const postTaskResult = await runAutomaticPostTaskReview(dbManager, observation);
    console.log(
      `[Memory] Successfully recorded observation for session ${log.session_id}: "${observation.title}" (${writeDecision.action})`
    );
    if (postTaskResult.review) {
      console.log(
        `[Memory] Saved post-task review for observation ${observation.id}: "${observation.title}"`
      );
    } else {
      console.log(
        `[Memory] Skipped post-task review for observation ${observation.id}: ${postTaskResult.decision.reasons.join(' | ')}`
      );
    }

  } catch (err: any) {
    console.error(`[Error] Failed LLM summarization: ${err.message}. Falling back to raw save.`);
    await saveMockObservation(log, `Summarization failed: ${err.message}`);
  }
}

// Fallback logic if LLM fails or API keys are missing
async function saveMockObservation(log: QueuedToolLog, reason: string) {
  // Without a summary, successful raw executions contain no extracted outcome
  // or file evidence. A summarizer diagnostic must not promote them into memory.
  if (log.success) return;

  const textToEmbed = `Raw observation for ${log.tool_name}. ${reason}`;
  const embedding = await getEmbedding(textToEmbed);
  const failedOutput = log.output.trim().slice(0, 500);

  const observation: Observation = {
    id: log.id,
    session_id: log.session_id,
    project_path: log.project_path,
    agent_id: log.agent_id,
    title: `Tool failure: ${log.tool_name}`,
    narrative: `Tool execution failed while memory summarization was unavailable. ${reason}.${failedOutput ? ` Output: ${failedOutput}` : ''}`,
    facts: [`Executed ${log.tool_name}`, `Success status: ${log.success}`],
    concepts: ['tool_execution'],
    files_read: [],
    files_modified: [],
    embedding
  };

  const writeDecision = decideObservationWritePolicy({
    observation,
    source: 'tool_log',
  });
  if (writeDecision.action !== 'skip') {
    await dbManager.saveObservation(observation);
    const postTaskResult = await runAutomaticPostTaskReview(dbManager, observation);
    if (postTaskResult.review) {
      console.log(
        `[Memory] Saved fallback post-task review for observation ${observation.id}: "${observation.title}"`
      );
    }
  }
}

// Run server
startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
