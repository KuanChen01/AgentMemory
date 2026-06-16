// @ts-ignore
import { Database } from 'node-sqlite3-wasm';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  compareTimestamps,
  isTimestampOnOrBefore,
  timestampsEqual,
} from './timestamps';

// Type definitions
export interface Observation {
  id: string;
  session_id: string;
  project_path: string;
  agent_id: string;
  title: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
  embedding: number[];
  created_at?: string;
}

export interface Session {
  id: string;
  project_path: string;
  agent_id: string;
  status: 'active' | 'completed';
  created_at?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  files_modified: string[];
  agent_id: string;
  fts_score: number;
  vector_score: number;
  hybrid_score: number;
  created_at: string;
}

export interface RuntimeMemoryPolicy {
  readEnabled: boolean;
  writeEnabled: boolean;
  updatedAt: string;
}

export interface DailyDigestSchedulerConfig {
  enabled: boolean;
  lookback_days: number;
  schedule_hour: number;
  schedule_minute: number;
  schedule_time: string;
  time_zone: string;
  updatedAt: string;
}

export interface DailyDigestSchedulerConfigInput {
  enabled?: boolean;
  lookback_days?: number;
  schedule_time?: string;
  time_zone?: string;
}

export interface ObservationListFilters {
  agent?: string;
  page?: number;
  pageSize?: number;
  project?: string;
  query?: string;
}

export interface ObservationListResult {
  records: Observation[];
  total: number;
}

export interface StateFact {
  id: string;
  project_path: string;
  entity_type: string;
  entity_key: string;
  fact_key: string;
  value: unknown;
  value_json: string;
  effective_at: string;
  recorded_at: string;
  superseded_at: string | null;
}

export interface StateFactInput {
  project_path: string;
  entity_type?: string;
  entity_key?: string;
  fact_key: string;
  value: unknown;
  effective_at?: string;
}

export interface StateFactQuery {
  projectPath: string;
  entityType?: string;
  entityKey?: string;
  factKey?: string;
  asOf?: string;
}

export type DailyMemoryDigestStatus =
  | 'success'
  | 'skipped_missing_llm'
  | 'skipped_no_observations'
  | 'failed';

export interface DailyMemoryDigestPayload {
  summary: string;
  facts: string[];
  decisions: string[];
  verified_commands: string[];
  open_questions: string[];
  next_actions: string[];
  state_fact_candidates: unknown[];
  skill_candidates: unknown[];
  low_signal_patterns: string[];
  confidence: number;
}

export interface DailyMemoryDigest {
  id: string;
  project_path: string;
  local_date: string;
  status: DailyMemoryDigestStatus;
  digest: DailyMemoryDigestPayload | null;
  digest_json: string | null;
  source_observation_ids: string[];
  source_count: number;
  model: string | null;
  prompt_version: string;
  generated_at: string;
  reviewed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyMemoryDigestInput {
  project_path: string;
  local_date: string;
  status: DailyMemoryDigestStatus;
  digest: DailyMemoryDigestPayload | null;
  source_observation_ids: string[];
  source_count?: number;
  model?: string | null;
  prompt_version: string;
  generated_at?: string;
  reviewed_at?: string | null;
  last_error?: string | null;
}

export interface DailyMemoryDigestQuery {
  projectPath?: string;
  localDate?: string;
  status?: DailyMemoryDigestStatus;
  limit?: number;
  generatedBefore?: string;
}

export type ProceduralSkillStatus = 'draft' | 'enabled' | 'disabled' | 'retired';

export interface ProceduralSkill {
  id: string;
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags: string[];
  status: ProceduralSkillStatus;
  confidence: number;
  source_digest_id: string | null;
  source_observation_ids: string[];
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  embedding: number[];
  created_at: string;
  updated_at: string;
  retired_at: string | null;
  status_effective_at?: string | null;
  feedback_summary?: {
    failure: number;
    last_feedback_at: string | null;
    last_outcome: string | null;
    rejected: number;
    skipped: number;
    success: number;
    total: number;
  };
  feedback_history?: ProceduralSkillFeedback[];
  lifecycle_signal?: {
    reasons: string[];
    score: number;
    state: 'stable' | 'watch' | 'suppressed' | 'retire_candidate';
  } | null;
  recommendation_state?: string | null;
  recommendation_score?: number | null;
  recommendation_reasons?: string[];
}

export interface ProceduralSkillInput {
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags?: string[];
  status?: ProceduralSkillStatus;
  confidence?: number;
  source_digest_id?: string | null;
  source_observation_ids?: string[];
  embedding?: number[];
}

export interface ProceduralSkillQuery {
  projectPath: string;
  statuses?: ProceduralSkillStatus[];
  limit?: number;
  asOf?: string;
}

export type ProceduralSkillFeedbackOutcome = 'success' | 'failure' | 'rejected' | 'skipped';

export interface ProceduralSkillFeedback {
  id: string;
  skill_id: string;
  project_path: string;
  outcome: ProceduralSkillFeedbackOutcome;
  task_text: string;
  notes: string;
  created_at: string;
}

export interface ProceduralSkillFeedbackInput {
  skill_id: string;
  project_path: string;
  outcome: ProceduralSkillFeedbackOutcome;
  task_text?: string;
  notes?: string;
}

export interface ProceduralSkillFeedbackQuery {
  asOf?: string;
  limit?: number;
  projectPath?: string;
  skillId: string;
}

export interface PostTaskReview {
  id: string;
  project_path: string;
  source_observation_id: string;
  source_session_id: string;
  source_agent_id: string;
  source_title: string;
  query_text: string;
  status: 'open';
  matched_skill_titles: string[];
  recommendation_states: string[];
  bounded_context: unknown;
  decision_trace: unknown;
  temporal_diagnostics: unknown;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface PostTaskReviewInput {
  project_path: string;
  source_observation_id: string;
  source_session_id: string;
  source_agent_id: string;
  source_title: string;
  query_text: string;
  matched_skill_titles: string[];
  recommendation_states: string[];
  bounded_context: unknown;
  decision_trace: unknown;
  temporal_diagnostics: unknown;
  generated_at?: string;
}

export interface PostTaskReviewQuery {
  limit?: number;
  projectPath: string;
  sourceObservationId?: string;
  status?: 'open';
}

export interface ProceduralSkillSearchResult {
  id: string;
  project_path: string;
  title: string;
  summary: string;
  trigger_text: string;
  steps: string[];
  tags: string[];
  status: ProceduralSkillStatus;
  confidence: number;
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  created_at: string;
  source_observation_count?: number;
  lexical_score: number;
  vector_score: number;
  hybrid_score: number;
  status_effective_at?: string | null;
  feedback_summary?: ProceduralSkill['feedback_summary'];
  feedback_history?: ProceduralSkillFeedback[];
  lifecycle_signal?: ProceduralSkill['lifecycle_signal'];
  recommendation_state?: string | null;
  recommendation_score?: number | null;
  recommendation_reasons?: string[];
}

interface ProceduralSkillStatusEvent {
  effective_at: string;
  status: ProceduralSkillStatus;
}

const DAILY_DIGEST_SCHEDULER_CONFIG_KEY = 'daily_digest_scheduler_config';
const RUNTIME_MEMORY_POLICY_KEY = 'runtime_memory_policy';

function getDefaultDailyDigestSchedulerConfig(): Omit<DailyDigestSchedulerConfig, 'updatedAt'> {
  return {
    enabled: process.env.AGENTMEM_DAILY_DIGEST_DISABLED !== 'true',
    lookback_days: 2,
    schedule_hour: 23,
    schedule_minute: 50,
    schedule_time: '23:50',
    time_zone: 'Asia/Shanghai',
  };
}

function normalizeDailyDigestSchedulerConfig(
  input: DailyDigestSchedulerConfigInput
): Omit<DailyDigestSchedulerConfig, 'updatedAt'> {
  const schedule = parseScheduleTime(input.schedule_time || '23:50');
  const timeZone = normalizeTimeZone(input.time_zone || 'Asia/Shanghai');
  const lookback = Number(input.lookback_days);

  return {
    enabled: input.enabled !== false,
    lookback_days: Number.isFinite(lookback)
      ? Math.max(1, Math.min(14, Math.trunc(lookback)))
      : 2,
    schedule_hour: schedule.hour,
    schedule_minute: schedule.minute,
    schedule_time: schedule.value,
    time_zone: timeZone,
  };
}

function parseScheduleTime(value: string): { hour: number; minute: number; value: string } {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error('Daily digest schedule_time must use HH:mm format.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Daily digest schedule_time must be between 00:00 and 23:59.');
  }

  return {
    hour,
    minute,
    value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function normalizeTimeZone(value: string): string {
  const timeZone = String(value || '').trim() || 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch (_error) {
    throw new Error(`Invalid daily digest time_zone: ${timeZone}`);
  }
  return timeZone;
}

export class DatabaseManager {
  private dbPath: string;
  private db: any = null;

  constructor() {
    const customPath = process.env.AGENTMEM_DB_PATH;
    if (customPath) {
      this.dbPath = path.resolve(customPath);
    } else {
      const homeDir = os.homedir();
      const vaultDir = path.join(homeDir, '.agentmem');
      if (!fs.existsSync(vaultDir)) {
        fs.mkdirSync(vaultDir, { recursive: true });
      }
      this.dbPath = path.join(vaultDir, 'agentmemory.db');
    }
  }

  // Open connection and run migrations
  public async initialize(): Promise<void> {
    try {
      this.db = new Database(this.dbPath);
      // Enable WAL mode
      this.db.run('PRAGMA journal_mode = WAL;');
      await this.runMigrations();
    } catch (err: any) {
      this.close();
      throw new Error(`Database initialization failed: ${err.message}`);
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 1. Sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Observations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        narrative TEXT NOT NULL,
        facts TEXT NOT NULL,          -- Stored as JSON string
        concepts TEXT NOT NULL,       -- Stored as JSON string
        files_read TEXT NOT NULL,     -- Stored as JSON string
        files_modified TEXT NOT NULL, -- Stored as JSON string
        embedding TEXT NOT NULL,      -- Stored as JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. FTS5 Virtual Table for full-text search
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
        observation_id UNINDEXED,
        title,
        narrative,
        facts,
        concepts,
        files_modified
      )
    `);

    // 4. App settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. State facts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS state_facts (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        superseded_at TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_state_facts_lookup
      ON state_facts (project_path, entity_type, entity_key, fact_key, effective_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_state_facts_current
      ON state_facts (project_path, superseded_at)
    `);

    // 6. Daily derived memory digests table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS daily_memory_digests (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL,
        digest_json TEXT,
        source_observation_ids TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        model TEXT,
        prompt_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        reviewed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_path, local_date)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_daily_memory_digests_project_date
      ON daily_memory_digests (project_path, local_date DESC)
    `);

    // 7. Procedural skills table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skills (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence REAL NOT NULL,
        source_digest_id TEXT,
        source_observation_ids TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        embedding TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        retired_at TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skills_project_status
      ON procedural_skills (project_path, status, updated_at DESC)
    `);

    // 8. Procedural skill feedback table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skill_feedback (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        outcome TEXT NOT NULL,
        task_text TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skill_feedback_skill
      ON procedural_skill_feedback (skill_id, created_at DESC)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedural_skill_status_events (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        status TEXT NOT NULL,
        effective_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_skill_status_events_skill_time
      ON procedural_skill_status_events (skill_id, effective_at DESC)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS post_task_reviews (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        source_observation_id TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        source_title TEXT NOT NULL,
        query_text TEXT NOT NULL,
        status TEXT NOT NULL,
        matched_skill_titles_json TEXT NOT NULL,
        recommendation_states_json TEXT NOT NULL,
        bounded_context_json TEXT NOT NULL,
        decision_trace_json TEXT NOT NULL,
        temporal_diagnostics_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_observation_id)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_post_task_reviews_project_generated
      ON post_task_reviews (project_path, generated_at DESC)
    `);
  }

  // Create or update a session
  public async saveSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT INTO sessions (id, project_path, agent_id, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status`,
      [session.id, session.project_path, session.agent_id, session.status]
    );
  }

  // Save observation
  public async saveObservation(obs: Observation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const factsStr = JSON.stringify(obs.facts);
    const conceptsStr = JSON.stringify(obs.concepts);
    const filesReadStr = JSON.stringify(obs.files_read);
    const filesModStr = JSON.stringify(obs.files_modified);
    const embeddingStr = JSON.stringify(obs.embedding);

    // Insert into primary table
    if (obs.created_at) {
      this.db.run(
        `INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          obs.id,
          obs.session_id,
          obs.project_path,
          obs.agent_id,
          obs.title,
          obs.narrative,
          factsStr,
          conceptsStr,
          filesReadStr,
          filesModStr,
          embeddingStr,
          obs.created_at,
        ]
      );
    } else {
      this.db.run(
        `INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          obs.id,
          obs.session_id,
          obs.project_path,
          obs.agent_id,
          obs.title,
          obs.narrative,
          factsStr,
          conceptsStr,
          filesReadStr,
          filesModStr,
          embeddingStr,
        ]
      );
    }

    // Insert into FTS virtual table
    this.db.run(
      `INSERT INTO observations_fts (observation_id, title, narrative, facts, concepts, files_modified)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [obs.id, obs.title, obs.narrative, factsStr, conceptsStr, filesModStr]
    );
  }

  // Get project timeline (chronological observations)
  public async getTimeline(projectPath: string): Promise<Observation[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const normalizedPath = this.normalizeProjectPath(projectPath);
    const rows = this.db.all(
      `SELECT * FROM observations 
       WHERE LOWER(project_path) = LOWER(?)
       ORDER BY created_at DESC`,
      [normalizedPath]
    ) as any[];

    return rows.map((row) => this.parseObservation(row));
  }

  // Get multiple observations by their IDs
  public async getObservationsByIds(ids: string[]): Promise<Observation[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return [];
    
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.all(
      `SELECT * FROM observations WHERE id IN (${placeholders})`,
      ids
    ) as any[];

    return rows.map((row) => this.parseObservation(row));
  }

  public async getRuntimePolicy(): Promise<RuntimeMemoryPolicy> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [RUNTIME_MEMORY_POLICY_KEY]
    ) as any;

    if (!row) {
      return this.persistRuntimePolicy({
        readEnabled: true,
        writeEnabled: true,
      });
    }

    const parsed = JSON.parse(row.value);
    return {
      readEnabled: parsed.readEnabled !== false,
      writeEnabled: parsed.writeEnabled !== false,
      updatedAt: row.updated_at,
    };
  }

  public async updateRuntimePolicy(
    partialPolicy: Partial<Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'>>
  ): Promise<RuntimeMemoryPolicy> {
    const current = await this.getRuntimePolicy();
    return this.persistRuntimePolicy({
      readEnabled: partialPolicy.readEnabled ?? current.readEnabled,
      writeEnabled: partialPolicy.writeEnabled ?? current.writeEnabled,
    });
  }

  public async getDailyDigestSchedulerConfig(): Promise<DailyDigestSchedulerConfig> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [DAILY_DIGEST_SCHEDULER_CONFIG_KEY]
    ) as any;

    if (!row) {
      return this.persistDailyDigestSchedulerConfig(getDefaultDailyDigestSchedulerConfig());
    }

    return this.parseDailyDigestSchedulerConfigRow(row);
  }

  public async updateDailyDigestSchedulerConfig(
    input: DailyDigestSchedulerConfigInput
  ): Promise<DailyDigestSchedulerConfig> {
    const current = await this.getDailyDigestSchedulerConfig();
    const normalized = normalizeDailyDigestSchedulerConfig({
      enabled: input.enabled ?? current.enabled,
      lookback_days: input.lookback_days ?? current.lookback_days,
      schedule_time: input.schedule_time ?? current.schedule_time,
      time_zone: input.time_zone ?? current.time_zone,
    });
    return this.persistDailyDigestSchedulerConfig(normalized);
  }

  public async listObservations(filters: ObservationListFilters = {}): Promise<ObservationListResult> {
    if (!this.db) throw new Error('Database not initialized');

    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 25)));
    const offset = (page - 1) * pageSize;

    const whereParts: string[] = [];
    const params: any[] = [];

    if (filters.project) {
      whereParts.push(`LOWER(project_path) = LOWER(?)`);
      params.push(filters.project);
    }

    if (filters.agent) {
      whereParts.push(`LOWER(agent_id) = LOWER(?)`);
      params.push(filters.agent);
    }

    if (filters.query) {
      const wildcard = `%${this.escapeLike(filters.query)}%`;
      whereParts.push(`(
        title LIKE ? ESCAPE '\\'
        OR narrative LIKE ? ESCAPE '\\'
        OR facts LIKE ? ESCAPE '\\'
        OR concepts LIKE ? ESCAPE '\\'
        OR files_read LIKE ? ESCAPE '\\'
        OR files_modified LIKE ? ESCAPE '\\'
        OR project_path LIKE ? ESCAPE '\\'
        OR agent_id LIKE ? ESCAPE '\\'
      )`);
      for (let i = 0; i < 8; i++) {
        params.push(wildcard);
      }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const totalRow = this.db.get(
      `SELECT COUNT(*) as total FROM observations ${whereClause}`,
      params
    ) as any;

    const rows = this.db.all(
      `SELECT * FROM observations
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ) as any[];

    return {
      total: Number(totalRow?.total || 0),
      records: rows.map((row) => this.parseObservation(row)),
    };
  }

  public async countObservations(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT COUNT(*) as total FROM observations`) as any;
    return Number(row?.total || 0);
  }

  public async countSessions(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT COUNT(*) as total FROM sessions`) as any;
    return Number(row?.total || 0);
  }

  public async saveDailyMemoryDigest(input: DailyMemoryDigestInput): Promise<DailyMemoryDigest> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
    const id = randomUUID();
    const generatedAt = input.generated_at || new Date().toISOString();
    const sourceObservationIds = JSON.stringify(input.source_observation_ids);
    const digestJson = input.digest === null ? null : JSON.stringify(input.digest);
    const sourceCount = input.source_count ?? input.source_observation_ids.length;

    this.db.run(
      `INSERT INTO daily_memory_digests (
        id,
        project_path,
        local_date,
        status,
        digest_json,
        source_observation_ids,
        source_count,
        model,
        prompt_version,
        generated_at,
        reviewed_at,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path, local_date) DO UPDATE SET
        status = excluded.status,
        digest_json = excluded.digest_json,
        source_observation_ids = excluded.source_observation_ids,
        source_count = excluded.source_count,
        model = excluded.model,
        prompt_version = excluded.prompt_version,
        generated_at = excluded.generated_at,
        reviewed_at = excluded.reviewed_at,
        last_error = excluded.last_error,
        updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        normalizedProjectPath,
        input.local_date,
        input.status,
        digestJson,
        sourceObservationIds,
        sourceCount,
        input.model ?? null,
        input.prompt_version,
        generatedAt,
        input.reviewed_at ?? null,
        input.last_error ?? null,
      ]
    );

    const digest = await this.getDailyMemoryDigest({
      projectPath: normalizedProjectPath,
      localDate: input.local_date,
    });
    if (!digest) {
      throw new Error('Daily memory digest was not saved');
    }
    return digest;
  }

  public async getDailyMemoryDigest(
    query: Required<Pick<DailyMemoryDigestQuery, 'projectPath' | 'localDate'>>
  ): Promise<DailyMemoryDigest | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.get(
      `SELECT *
       FROM daily_memory_digests
       WHERE LOWER(project_path) = LOWER(?)
         AND local_date = ?
       LIMIT 1`,
      [this.normalizeProjectPath(query.projectPath), query.localDate]
    ) as any;

    return row ? this.parseDailyMemoryDigest(row) : null;
  }

  public async listDailyMemoryDigests(
    query: DailyMemoryDigestQuery = {}
  ): Promise<DailyMemoryDigest[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts: string[] = [];
    const params: any[] = [];

    if (query.projectPath) {
      whereParts.push(`LOWER(project_path) = LOWER(?)`);
      params.push(this.normalizeProjectPath(query.projectPath));
    }

    if (query.localDate) {
      whereParts.push(`local_date = ?`);
      params.push(query.localDate);
    }

    if (query.status) {
      whereParts.push(`status = ?`);
      params.push(query.status);
    }

    if (query.generatedBefore) {
      whereParts.push(`generated_at <= ?`);
      params.push(query.generatedBefore);
    }

    const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit || 10))));
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const rows = this.db.all(
      `SELECT *
       FROM daily_memory_digests
       ${whereClause}
       ORDER BY local_date DESC, generated_at DESC, updated_at DESC
       LIMIT ?`,
      [...params, limit]
    ) as any[];

    return rows.map((row) => this.parseDailyMemoryDigest(row));
  }

  public async countDailyMemoryDigests(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM daily_memory_digests
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM daily_memory_digests`) as any;
    return Number(row?.total || 0);
  }

  public async saveProceduralSkill(input: ProceduralSkillInput): Promise<ProceduralSkill> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
    const id = randomUUID();
    const status = normalizeProceduralSkillStatus(input.status);
    const confidence = normalizeConfidence(input.confidence);
    const sourceObservationIds = JSON.stringify(input.source_observation_ids || []);
    const stepsJson = JSON.stringify((input.steps || []).map((step) => String(step)).filter(Boolean));
    const tagsJson = JSON.stringify((input.tags || []).map((tag) => String(tag)).filter(Boolean));
    const embeddingJson = JSON.stringify(Array.isArray(input.embedding) ? input.embedding : []);
    const createdAt = new Date().toISOString();

    this.db.run(
      `INSERT INTO procedural_skills (
        id,
        project_path,
        title,
        summary,
        trigger_text,
        steps_json,
        tags_json,
        status,
        confidence,
        source_digest_id,
        source_observation_ids,
        embedding,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normalizedProjectPath,
        input.title,
        input.summary,
        input.trigger_text,
        stepsJson,
        tagsJson,
        status,
        confidence,
        input.source_digest_id ?? null,
        sourceObservationIds,
        embeddingJson,
        createdAt,
        createdAt,
      ]
    );

    this.recordProceduralSkillStatusEvent(id, normalizedProjectPath, status, createdAt);

    const row = this.db.get(`SELECT * FROM procedural_skills WHERE id = ?`, [id]) as any;
    return this.parseProceduralSkill(row);
  }

  public async getProceduralSkillById(id: string): Promise<ProceduralSkill | null> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(`SELECT * FROM procedural_skills WHERE id = ? LIMIT 1`, [id]) as any;
    return row ? this.parseProceduralSkill(row) : null;
  }

  public async listProceduralSkills(query: ProceduralSkillQuery): Promise<ProceduralSkill[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [this.normalizeProjectPath(query.projectPath)];

    if (!query.asOf && query.statuses && query.statuses.length > 0) {
      whereParts.push(`status IN (${query.statuses.map(() => '?').join(', ')})`);
      params.push(...query.statuses.map((status) => normalizeProceduralSkillStatus(status)));
    }

    const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit || 20))));
    const rows = this.db.all(
      `SELECT *
       FROM procedural_skills
        WHERE ${whereParts.join(' AND ')}
        ORDER BY updated_at DESC, created_at DESC`,
      params
    ) as any[];

    const skills = rows.map((row) => this.parseProceduralSkill(row));
    const statusEvents = this.getProceduralSkillStatusEventMap(skills.map((skill) => skill.id));
    if (!query.asOf) {
      const currentSkills = skills
        .sort((left, right) => compareProceduralSkillsByRecency(left, right))
        .slice(0, limit);
      return Promise.all(
        currentSkills.map((skill) =>
          this.hydrateProceduralSkillFeedbackState(
            {
              ...skill,
              status_effective_at: this.getLatestProceduralSkillStatusEffectiveAt(
                statusEvents.get(skill.id) || [],
                skill
              ),
            },
            undefined
          )
        )
      );
    }

    const statuses = query.statuses?.map((status) => normalizeProceduralSkillStatus(status)) || null;
    const historicalSkills: ProceduralSkill[] = [];
    for (const skill of skills) {
      const resolvedStatus = this.resolveProceduralSkillStatusAsOf(
        skill,
        statusEvents.get(skill.id) || [],
        query.asOf as string
      );
      if (!resolvedStatus) {
        continue;
      }

      const shouldInclude = statuses
        ? statuses.includes(resolvedStatus.status)
        : resolvedStatus.status !== 'retired';
      if (!shouldInclude) {
        continue;
      }

      historicalSkills.push({
        ...skill,
        status: resolvedStatus.status,
        status_effective_at: resolvedStatus.effective_at,
        retired_at: resolvedStatus.status === 'retired'
          ? skill.retired_at || (query.asOf as string)
          : null,
      });
    }

    historicalSkills
      .sort((left, right) => compareProceduralSkillsByRecency(left, right));

    const limitedHistoricalSkills = historicalSkills.slice(0, limit);

    return Promise.all(
      limitedHistoricalSkills.map((skill) => this.hydrateProceduralSkillFeedbackState(skill, query.asOf))
    );
  }

  public async setProceduralSkillStatus(id: string, status: ProceduralSkillStatus): Promise<ProceduralSkill> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getProceduralSkillById(id);
    if (!existing) {
      throw new Error(`Procedural skill not found: ${id}`);
    }

    const normalizedStatus = normalizeProceduralSkillStatus(status);
    if (
      existing.status === normalizedStatus &&
      ((normalizedStatus === 'retired' && existing.retired_at) || normalizedStatus !== 'retired')
    ) {
      return existing;
    }

    const statusChangedAt = new Date().toISOString();
    const retiredAt = normalizedStatus === 'retired' ? statusChangedAt : null;
    this.db.run(
      `UPDATE procedural_skills
       SET status = ?,
           retired_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [normalizedStatus, retiredAt, statusChangedAt, id]
    );
    this.recordProceduralSkillStatusEvent(id, existing.project_path, normalizedStatus, statusChangedAt);

    const skill = await this.getProceduralSkillById(id);
    if (!skill) {
      throw new Error(`Procedural skill not found: ${id}`);
    }
    return skill;
  }

  public async recordProceduralSkillFeedback(
    input: ProceduralSkillFeedbackInput
  ): Promise<ProceduralSkillFeedback> {
    if (!this.db) throw new Error('Database not initialized');

    const skill = await this.getProceduralSkillById(input.skill_id);
    if (!skill) {
      throw new Error(`Procedural skill not found: ${input.skill_id}`);
    }

    const id = randomUUID();
    const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
    if (this.normalizeProjectPath(skill.project_path) !== normalizedProjectPath) {
      throw new Error(
        `Procedural skill ${skill.id} belongs to ${skill.project_path}, not ${normalizedProjectPath}.`
      );
    }

    const outcome = normalizeProceduralSkillFeedbackOutcome(input.outcome);
    const feedbackCreatedAt = new Date().toISOString();
    this.db.run(
      `INSERT INTO procedural_skill_feedback (
        id,
        skill_id,
        project_path,
        outcome,
        task_text,
        notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.skill_id,
        normalizedProjectPath,
        outcome,
        input.task_text || '',
        input.notes || '',
        feedbackCreatedAt,
      ]
    );

    const countField = outcome === 'success' ? 'success_count' : outcome === 'failure' ? 'failure_count' : null;
    if (countField) {
      this.db.run(
        `UPDATE procedural_skills
         SET ${countField} = ${countField} + 1,
             last_used_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [feedbackCreatedAt, feedbackCreatedAt, input.skill_id]
      );
    } else {
      this.db.run(
        `UPDATE procedural_skills
         SET last_used_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [feedbackCreatedAt, feedbackCreatedAt, input.skill_id]
      );
    }

    const row = this.db.get(`SELECT * FROM procedural_skill_feedback WHERE id = ?`, [id]) as any;
    return this.parseProceduralSkillFeedback(row);
  }

  public async listProceduralSkillFeedback(
    query: ProceduralSkillFeedbackQuery
  ): Promise<ProceduralSkillFeedback[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = ['skill_id = ?'];
    const params: any[] = [query.skillId];

    if (query.projectPath) {
      whereParts.push('LOWER(project_path) = LOWER(?)');
      params.push(this.normalizeProjectPath(query.projectPath));
    }

    if (query.asOf) {
      whereParts.push('created_at <= ?');
      params.push(query.asOf);
    }

    const limit = query.limit
      ? Math.max(1, Math.min(200, Math.trunc(Number(query.limit))))
      : null;

    const rows = this.db.all(
      `SELECT *
       FROM procedural_skill_feedback
       WHERE ${whereParts.join(' AND ')}
       ORDER BY created_at DESC${limit ? ' LIMIT ?' : ''}`,
      limit ? [...params, limit] : params
    ) as any[];

    return rows.map((row) => this.parseProceduralSkillFeedback(row));
  }

  public async searchProceduralSkills(
    projectPath: string,
    queryText: string,
    queryVector?: number[],
    limit: number = 5,
    options: { asOf?: string; statuses?: ProceduralSkillStatus[] } = {}
  ): Promise<ProceduralSkillSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.listProceduralSkills({
      projectPath,
      statuses: options.statuses,
      limit: Math.max(limit * 3, limit),
      asOf: options.asOf,
    });

    const queryTokens = tokenizeForOverlap(queryText);
    return rows
      .map((skill) => {
        const lexicalScore = calculateTokenOverlapScore(
          queryTokens,
          tokenizeForOverlap([skill.title, skill.summary, skill.trigger_text, ...skill.tags].join(' '))
        );
        const vectorScore = queryVector && skill.embedding.length > 0
          ? this.calculateCosineSimilarity(queryVector, skill.embedding)
          : 0;
        const hybridScore = queryVector
          ? lexicalScore * 0.35 + vectorScore * 0.65
          : lexicalScore;

        return {
          id: skill.id,
          project_path: skill.project_path,
          title: skill.title,
          summary: skill.summary,
          trigger_text: skill.trigger_text,
          steps: skill.steps,
          tags: skill.tags,
          status: skill.status,
          confidence: skill.confidence,
          success_count: skill.success_count,
          failure_count: skill.failure_count,
          last_used_at: skill.last_used_at,
          created_at: skill.created_at,
          source_observation_count: Array.isArray(skill.source_observation_ids)
            ? skill.source_observation_ids.length
            : 0,
          status_effective_at: skill.status_effective_at || null,
          feedback_summary: skill.feedback_summary,
          feedback_history: skill.feedback_history,
          lifecycle_signal: skill.lifecycle_signal || null,
          recommendation_state: skill.recommendation_state || null,
          recommendation_score:
            typeof skill.recommendation_score === 'number' ? skill.recommendation_score : null,
          recommendation_reasons: skill.recommendation_reasons || [],
          lexical_score: lexicalScore,
          vector_score: vectorScore,
          hybrid_score: hybridScore,
        };
      })
      .filter((skill) => skill.hybrid_score > 0 || rows.length <= limit)
      .sort((left, right) => right.hybrid_score - left.hybrid_score)
      .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))));
  }

  public async countProceduralSkills(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM procedural_skills
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM procedural_skills`) as any;
    return Number(row?.total || 0);
  }

  public async savePostTaskReview(input: PostTaskReviewInput): Promise<PostTaskReview> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
    const generatedAt = input.generated_at || new Date().toISOString();

    this.db.run(
      `INSERT INTO post_task_reviews (
        id,
        project_path,
        source_observation_id,
        source_session_id,
        source_agent_id,
        source_title,
        query_text,
        status,
        matched_skill_titles_json,
        recommendation_states_json,
        bounded_context_json,
        decision_trace_json,
        temporal_diagnostics_json,
        generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_observation_id) DO UPDATE SET
        query_text = excluded.query_text,
        matched_skill_titles_json = excluded.matched_skill_titles_json,
        recommendation_states_json = excluded.recommendation_states_json,
        bounded_context_json = excluded.bounded_context_json,
        decision_trace_json = excluded.decision_trace_json,
        temporal_diagnostics_json = excluded.temporal_diagnostics_json,
        generated_at = excluded.generated_at,
        updated_at = CURRENT_TIMESTAMP`,
      [
        randomUUID(),
        normalizedProjectPath,
        input.source_observation_id,
        input.source_session_id,
        input.source_agent_id,
        input.source_title,
        input.query_text,
        'open',
        JSON.stringify(input.matched_skill_titles || []),
        JSON.stringify(input.recommendation_states || []),
        JSON.stringify(input.bounded_context ?? null),
        JSON.stringify(input.decision_trace ?? null),
        JSON.stringify(input.temporal_diagnostics ?? null),
        generatedAt,
      ]
    );

    const row = this.db.get(
      `SELECT *
       FROM post_task_reviews
       WHERE source_observation_id = ?
       LIMIT 1`,
      [input.source_observation_id]
    ) as any;

    if (!row) {
      throw new Error('Post-task review was not saved');
    }

    return this.parsePostTaskReview(row);
  }

  public async listPostTaskReviews(query: PostTaskReviewQuery): Promise<PostTaskReview[]> {
    if (!this.db) throw new Error('Database not initialized');

    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [this.normalizeProjectPath(query.projectPath)];

    if (query.status) {
      whereParts.push(`status = ?`);
      params.push(query.status);
    }

    if (query.sourceObservationId) {
      whereParts.push(`source_observation_id = ?`);
      params.push(query.sourceObservationId);
    }

    const rows = this.db.all(
      `SELECT *
       FROM post_task_reviews
       WHERE ${whereParts.join(' AND ')}
       ORDER BY generated_at DESC, updated_at DESC
       LIMIT ?`,
      [...params, Math.max(1, Math.min(50, Math.trunc(Number(query.limit || 10))))]
    ) as any[];

    return rows.map((row) => this.parsePostTaskReview(row));
  }

  public async countPostTaskReviews(projectPath?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (projectPath) {
      const row = this.db.get(
        `SELECT COUNT(*) as total
         FROM post_task_reviews
         WHERE LOWER(project_path) = LOWER(?)`,
        [this.normalizeProjectPath(projectPath)]
      ) as any;
      return Number(row?.total || 0);
    }

    const row = this.db.get(`SELECT COUNT(*) as total FROM post_task_reviews`) as any;
    return Number(row?.total || 0);
  }

  public async saveStateFact(input: StateFactInput): Promise<StateFact> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(input.project_path);
    const entityType = input.entity_type || 'project';
    const entityKey = input.entity_key || normalizedProjectPath;
    const factKey = input.fact_key;
    const effectiveAt = input.effective_at || new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const valueJson = JSON.stringify(input.value);

    const previousActive = this.db.get(
      `SELECT id
       FROM state_facts
       WHERE LOWER(project_path) = LOWER(?)
         AND LOWER(entity_type) = LOWER(?)
         AND LOWER(entity_key) = LOWER(?)
         AND LOWER(fact_key) = LOWER(?)
         AND effective_at <= ?
         AND (superseded_at IS NULL OR superseded_at > ?)
       ORDER BY effective_at DESC, recorded_at DESC
       LIMIT 1`,
      [normalizedProjectPath, entityType, entityKey, factKey, effectiveAt, effectiveAt]
    ) as any;

    const nextActive = this.db.get(
      `SELECT effective_at
       FROM state_facts
       WHERE LOWER(project_path) = LOWER(?)
         AND LOWER(entity_type) = LOWER(?)
         AND LOWER(entity_key) = LOWER(?)
         AND LOWER(fact_key) = LOWER(?)
         AND effective_at > ?
       ORDER BY effective_at ASC, recorded_at ASC
       LIMIT 1`,
      [normalizedProjectPath, entityType, entityKey, factKey, effectiveAt]
    ) as any;

    const id = randomUUID();
    this.db.run(
      `INSERT INTO state_facts (
        id,
        project_path,
        entity_type,
        entity_key,
        fact_key,
        value_json,
        effective_at,
        recorded_at,
        superseded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normalizedProjectPath,
        entityType,
        entityKey,
        factKey,
        valueJson,
        effectiveAt,
        recordedAt,
        nextActive?.effective_at || null,
      ]
    );

    if (previousActive?.id) {
      this.db.run(
        `UPDATE state_facts
         SET superseded_at = ?
         WHERE id = ?`,
        [effectiveAt, previousActive.id]
      );
    }

    const row = this.db.get(`SELECT * FROM state_facts WHERE id = ?`, [id]) as any;
    return this.parseStateFact(row);
  }

  public async getStateFacts(query: StateFactQuery): Promise<StateFact[]> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedProjectPath = this.normalizeProjectPath(query.projectPath);
    const whereParts = [`LOWER(project_path) = LOWER(?)`];
    const params: any[] = [normalizedProjectPath];

    if (query.entityType) {
      whereParts.push(`LOWER(entity_type) = LOWER(?)`);
      params.push(query.entityType);
    }

    if (query.entityKey) {
      whereParts.push(`LOWER(entity_key) = LOWER(?)`);
      params.push(query.entityKey);
    }

    if (query.factKey) {
      whereParts.push(`LOWER(fact_key) = LOWER(?)`);
      params.push(query.factKey);
    }

    if (query.asOf) {
      whereParts.push(`effective_at <= ?`);
      whereParts.push(`(superseded_at IS NULL OR superseded_at > ?)`);
      params.push(query.asOf, query.asOf);
    } else {
      whereParts.push(`superseded_at IS NULL`);
    }

    const rows = this.db.all(
      `SELECT *
       FROM state_facts
       WHERE ${whereParts.join(' AND ')}
       ORDER BY entity_type COLLATE NOCASE ASC,
                entity_key COLLATE NOCASE ASC,
                fact_key COLLATE NOCASE ASC,
                effective_at DESC,
                recorded_at DESC`,
      params
    ) as any[];

    return rows.map((row) => this.parseStateFact(row));
  }

  public async getProjectStateFacts(projectPath: string, asOf?: string): Promise<StateFact[]> {
    return this.getStateFacts({
      projectPath,
      asOf,
    });
  }

  public async countCurrentStateFacts(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.get(
      `SELECT COUNT(*) as total
       FROM state_facts
       WHERE superseded_at IS NULL`
    ) as any;
    return Number(row?.total || 0);
  }

  public async listDistinctProjects(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.all(
      `SELECT DISTINCT project_path
       FROM (
         SELECT project_path FROM observations
         UNION
         SELECT project_path FROM state_facts
         UNION
         SELECT project_path FROM daily_memory_digests
         UNION
         SELECT project_path FROM procedural_skills
       )
       WHERE project_path != ''
       ORDER BY project_path COLLATE NOCASE ASC`
    ) as any[];
    return rows.map((row) => row.project_path as string);
  }

  public async listDistinctAgents(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.all(
      `SELECT DISTINCT agent_id
       FROM observations
       WHERE agent_id != ''
       ORDER BY agent_id COLLATE NOCASE ASC`
    ) as any[];
    return rows.map((row) => row.agent_id as string);
  }

  // Cosine similarity in pure TS
  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Hybrid Search: Combined FTS5 + Vector Cosine Similarity
  public async searchHybrid(
    projectPath: string,
    queryText: string,
    queryVector?: number[],
    limit: number = 10,
    options: { asOf?: string } = {}
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedPath = this.normalizeProjectPath(projectPath);
    const cleanQuery = queryText.replace(/[^a-zA-Z0-9\s_\-\.]/g, ' ');
    const asOf = options.asOf;

    let ftsRows: any[] = [];
    try {
      const ftsQuery = `SELECT o.*, fts.bm25Score
         FROM observations o
         INNER JOIN (
           SELECT observation_id, bm25(observations_fts) as bm25Score
           FROM observations_fts
           WHERE observations_fts MATCH ?
         ) fts ON o.id = fts.observation_id
         WHERE LOWER(o.project_path) = LOWER(?)`;
      const ftsParams = [cleanQuery ? `${cleanQuery}*` : '*', normalizedPath];
      ftsRows = this.db.all(ftsQuery, ftsParams) as any[];
    } catch (e) {
      // Fallback if FTS search fails or has syntax errors
    }

    const allRows = this.db.all(
      `SELECT * FROM observations WHERE LOWER(project_path) = LOWER(?)`,
      [normalizedPath]
    ) as any[];

    const filteredRows = asOf
      ? allRows.filter((row) => isTimestampOnOrBefore(row.created_at, asOf))
      : allRows;
    const filteredFtsRows = asOf
      ? ftsRows.filter((row) => isTimestampOnOrBefore(row.created_at, asOf))
      : ftsRows;

    return this.scoreResults(filteredRows, filteredFtsRows, queryVector, limit);
  }

  private scoreResults(
    allRows: any[],
    ftsRows: any[],
    queryVector?: number[],
    limit: number = 10
  ): SearchResult[] {
    const ftsMap = new Map<string, number>();
    ftsRows.forEach((row) => {
      // bm25 score is negative, lower is better. Convert it to a positive relative score.
      ftsMap.set(row.id || row.observation_id, -(row.bm25Score || 0));
    });

    let maxFts = 0.0001;
    ftsMap.forEach((score) => {
      if (score > maxFts) maxFts = score;
    });

    const results: SearchResult[] = allRows.map((row) => {
      const id = row.id;
      const embedding: number[] = JSON.parse(row.embedding);
      
      let vectorScore = 0.0;
      if (queryVector && embedding.length > 0) {
        vectorScore = this.calculateCosineSimilarity(queryVector, embedding);
      }

      const rawFts = ftsMap.get(id) || 0.0;
      const ftsScore = rawFts / maxFts;

      const hybridScore = queryVector 
        ? (0.4 * ftsScore + 0.6 * vectorScore)
        : ftsScore;

      return {
        id,
        title: row.title,
        narrative: row.narrative,
        facts: JSON.parse(row.facts),
        concepts: JSON.parse(row.concepts),
        files_modified: JSON.parse(row.files_modified),
        agent_id: row.agent_id,
        fts_score: ftsScore,
        vector_score: vectorScore,
        hybrid_score: hybridScore,
        created_at: row.created_at,
      };
    });

    return results
      .filter((r) => r.hybrid_score > 0.01 || ftsRows.length === 0)
      .sort((a, b) => b.hybrid_score - a.hybrid_score)
      .slice(0, limit);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async persistRuntimePolicy(
    policy: Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'>
  ): Promise<RuntimeMemoryPolicy> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
      [
        RUNTIME_MEMORY_POLICY_KEY,
        JSON.stringify({
          readEnabled: policy.readEnabled,
          writeEnabled: policy.writeEnabled,
        }),
      ]
    );

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [RUNTIME_MEMORY_POLICY_KEY]
    ) as any;
    const parsed = JSON.parse(row.value);

    return {
      readEnabled: parsed.readEnabled !== false,
      writeEnabled: parsed.writeEnabled !== false,
      updatedAt: row.updated_at,
    };
  }

  private async persistDailyDigestSchedulerConfig(
    config: Omit<DailyDigestSchedulerConfig, 'updatedAt'>
  ): Promise<DailyDigestSchedulerConfig> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = normalizeDailyDigestSchedulerConfig(config);

    this.db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
      [
        DAILY_DIGEST_SCHEDULER_CONFIG_KEY,
        JSON.stringify({
          enabled: normalized.enabled,
          lookback_days: normalized.lookback_days,
          schedule_time: normalized.schedule_time,
          time_zone: normalized.time_zone,
        }),
      ]
    );

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      [DAILY_DIGEST_SCHEDULER_CONFIG_KEY]
    ) as any;

    return this.parseDailyDigestSchedulerConfigRow(row);
  }

  private parseDailyDigestSchedulerConfigRow(row: any): DailyDigestSchedulerConfig {
    const parsed = JSON.parse(row.value);
    const normalized = normalizeDailyDigestSchedulerConfig({
      enabled: parsed.enabled !== false,
      lookback_days: parsed.lookback_days,
      schedule_time: parsed.schedule_time,
      time_zone: parsed.time_zone,
    });

    return {
      ...normalized,
      updatedAt: row.updated_at,
    };
  }

  private parseObservation(row: any): Observation {
    return {
      id: row.id,
      session_id: row.session_id,
      project_path: row.project_path,
      agent_id: row.agent_id,
      title: row.title,
      narrative: row.narrative,
      facts: JSON.parse(row.facts),
      concepts: JSON.parse(row.concepts),
      files_read: JSON.parse(row.files_read),
      files_modified: JSON.parse(row.files_modified),
      embedding: JSON.parse(row.embedding),
      created_at: row.created_at,
    };
  }

  private parseStateFact(row: any): StateFact {
    return {
      id: row.id,
      project_path: row.project_path,
      entity_type: row.entity_type,
      entity_key: row.entity_key,
      fact_key: row.fact_key,
      value: JSON.parse(row.value_json),
      value_json: row.value_json,
      effective_at: row.effective_at,
      recorded_at: row.recorded_at,
      superseded_at: row.superseded_at,
    };
  }

  private parseDailyMemoryDigest(row: any): DailyMemoryDigest {
    return {
      id: row.id,
      project_path: row.project_path,
      local_date: row.local_date,
      status: row.status,
      digest: row.digest_json ? JSON.parse(row.digest_json) : null,
      digest_json: row.digest_json,
      source_observation_ids: JSON.parse(row.source_observation_ids),
      source_count: Number(row.source_count || 0),
      model: row.model,
      prompt_version: row.prompt_version,
      generated_at: row.generated_at,
      reviewed_at: row.reviewed_at,
      last_error: row.last_error,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private parseProceduralSkill(row: any): ProceduralSkill {
    return {
      id: row.id,
      project_path: row.project_path,
      title: row.title,
      summary: row.summary,
      trigger_text: row.trigger_text,
      steps: JSON.parse(row.steps_json),
      tags: JSON.parse(row.tags_json),
      status: normalizeProceduralSkillStatus(row.status),
      confidence: normalizeConfidence(row.confidence),
      source_digest_id: row.source_digest_id,
      source_observation_ids: JSON.parse(row.source_observation_ids),
      success_count: Number(row.success_count || 0),
      failure_count: Number(row.failure_count || 0),
      last_used_at: row.last_used_at,
      embedding: JSON.parse(row.embedding),
      created_at: row.created_at,
      updated_at: row.updated_at,
      retired_at: row.retired_at,
    };
  }

  private parseProceduralSkillFeedback(row: any): ProceduralSkillFeedback {
    return {
      id: row.id,
      skill_id: row.skill_id,
      project_path: row.project_path,
      outcome: normalizeProceduralSkillFeedbackOutcome(row.outcome),
      task_text: row.task_text,
      notes: row.notes,
      created_at: row.created_at,
    };
  }

  private parsePostTaskReview(row: any): PostTaskReview {
    return {
      id: row.id,
      project_path: row.project_path,
      source_observation_id: row.source_observation_id,
      source_session_id: row.source_session_id,
      source_agent_id: row.source_agent_id,
      source_title: row.source_title,
      query_text: row.query_text,
      status: 'open',
      matched_skill_titles: JSON.parse(row.matched_skill_titles_json),
      recommendation_states: JSON.parse(row.recommendation_states_json),
      bounded_context: JSON.parse(row.bounded_context_json),
      decision_trace: JSON.parse(row.decision_trace_json),
      temporal_diagnostics: JSON.parse(row.temporal_diagnostics_json),
      generated_at: row.generated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async hydrateProceduralSkillFeedbackState(
    skill: ProceduralSkill,
    asOf?: string
  ): Promise<ProceduralSkill> {
    const feedbackRows = await this.listProceduralSkillFeedback({
      skillId: skill.id,
      projectPath: skill.project_path,
      asOf,
    });
    const feedbackSummary = this.summarizeProceduralSkillFeedback(feedbackRows);

    return {
      ...skill,
      success_count: feedbackSummary.success,
      failure_count: feedbackSummary.failure,
      last_used_at: feedbackSummary.last_feedback_at,
      feedback_summary: feedbackSummary,
      feedback_history: feedbackRows.slice(0, 5),
    };
  }

  private summarizeProceduralSkillFeedback(feedbackRows: ProceduralSkillFeedback[]) {
    const summary = {
      success: 0,
      failure: 0,
      rejected: 0,
      skipped: 0,
      total: feedbackRows.length,
      last_feedback_at: feedbackRows[0]?.created_at || null,
      last_outcome: feedbackRows[0]?.outcome || null,
    };

    for (const row of feedbackRows) {
      summary[row.outcome] += 1;
    }

    return summary;
  }

  private recordProceduralSkillStatusEvent(
    skillId: string,
    projectPath: string,
    status: ProceduralSkillStatus,
    effectiveAt: string
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO procedural_skill_status_events (
        id,
        skill_id,
        project_path,
        status,
        effective_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), skillId, projectPath, status, effectiveAt]
    );
  }

  private getProceduralSkillStatusEventMap(skillIds: string[]): Map<string, ProceduralSkillStatusEvent[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (skillIds.length === 0) {
      return new Map();
    }

    const placeholders = skillIds.map(() => '?').join(', ');
    const rows = this.db.all(
      `SELECT skill_id, status, effective_at
       FROM procedural_skill_status_events
       WHERE skill_id IN (${placeholders})
       ORDER BY effective_at ASC`,
      skillIds
    ) as any[];

    const events = new Map<string, ProceduralSkillStatusEvent[]>();
    for (const row of rows) {
      const skillEvents = events.get(row.skill_id) || [];
      skillEvents.push({
        effective_at: row.effective_at,
        status: normalizeProceduralSkillStatus(row.status),
      });
      events.set(row.skill_id, skillEvents);
    }
    return events;
  }

  private resolveProceduralSkillStatusAsOf(
    skill: ProceduralSkill,
    events: ProceduralSkillStatusEvent[],
    asOf: string
  ): { effective_at: string | null; status: ProceduralSkillStatus } | null {
    if (!isTimestampOnOrBefore(skill.created_at, asOf)) {
      return null;
    }

    let resolvedStatus: ProceduralSkillStatus | null = null;
    let resolvedEffectiveAt: string | null = null;
    for (const event of events) {
      if (isTimestampOnOrBefore(event.effective_at, asOf)) {
        resolvedStatus = event.status;
        resolvedEffectiveAt = event.effective_at;
      }
    }

    if (resolvedStatus) {
      return {
        status: resolvedStatus,
        effective_at: resolvedEffectiveAt,
      };
    }

    return this.canTrustProceduralSkillWithoutStatusHistory(skill)
      ? {
          status: skill.status,
          effective_at: skill.created_at,
        }
      : null;
  }

  private getLatestProceduralSkillStatusEffectiveAt(
    events: ProceduralSkillStatusEvent[],
    skill: ProceduralSkill
  ): string {
    if (events.length === 0) {
      return skill.created_at;
    }
    return events[events.length - 1].effective_at;
  }

  private canTrustProceduralSkillWithoutStatusHistory(skill: ProceduralSkill): boolean {
    return (
      timestampsEqual(skill.created_at, skill.updated_at) &&
      skill.last_used_at === null &&
      skill.retired_at === null
    );
  }

  private normalizeProjectPath(projectPath: string): string {
    return path.resolve(projectPath).replace(/\\/g, '/');
  }

  private escapeLike(input: string): string {
    return input.replace(/[\\%_]/g, '\\$&');
  }
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeProceduralSkillStatus(value: unknown): ProceduralSkillStatus {
  const normalized = String(value || 'draft').toLowerCase();
  switch (normalized) {
    case 'enabled':
    case 'disabled':
    case 'retired':
      return normalized;
    default:
      return 'draft';
  }
}

function normalizeProceduralSkillFeedbackOutcome(value: unknown): ProceduralSkillFeedbackOutcome {
  const normalized = String(value || 'skipped').toLowerCase();
  switch (normalized) {
    case 'success':
    case 'failure':
    case 'rejected':
      return normalized;
    default:
      return 'skipped';
  }
}

function tokenizeForOverlap(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function calculateTokenOverlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) {
      matches += 1;
    }
  }
  return matches / queryTokens.length;
}

function compareProceduralSkillsByRecency(left: ProceduralSkill, right: ProceduralSkill): number {
  const updatedComparison = compareTimestamps(right.updated_at, left.updated_at);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return compareTimestamps(right.created_at, left.created_at);
}
