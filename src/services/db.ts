// @ts-ignore
import { Database } from 'node-sqlite3-wasm';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';

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
    this.db.run(
      `INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [obs.id, obs.session_id, obs.project_path, obs.agent_id, obs.title, obs.narrative, factsStr, conceptsStr, filesReadStr, filesModStr, embeddingStr]
    );

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
      ['runtime_memory_policy']
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
       FROM observations
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
    limit: number = 10
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedPath = this.normalizeProjectPath(projectPath);
    const cleanQuery = queryText.replace(/[^a-zA-Z0-9\s_\-\.]/g, ' ');

    let ftsRows: any[] = [];
    try {
      ftsRows = this.db.all(
        `SELECT o.*, fts.bm25Score
         FROM observations o
         INNER JOIN (
           SELECT observation_id, bm25(observations_fts) as bm25Score
           FROM observations_fts
           WHERE observations_fts MATCH ?
         ) fts ON o.id = fts.observation_id
         WHERE LOWER(o.project_path) = LOWER(?)`,
        [cleanQuery ? `${cleanQuery}*` : '*', normalizedPath]
      ) as any[];
    } catch (e) {
      // Fallback if FTS search fails or has syntax errors
    }

    const allRows = this.db.all(
      `SELECT * FROM observations WHERE LOWER(project_path) = LOWER(?)`,
      [normalizedPath]
    ) as any[];

    return this.scoreResults(allRows, ftsRows, queryVector, limit);
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
        'runtime_memory_policy',
        JSON.stringify({
          readEnabled: policy.readEnabled,
          writeEnabled: policy.writeEnabled,
        }),
      ]
    );

    const row = this.db.get(
      `SELECT value, updated_at FROM app_settings WHERE key = ?`,
      ['runtime_memory_policy']
    ) as any;
    const parsed = JSON.parse(row.value);

    return {
      readEnabled: parsed.readEnabled !== false,
      writeEnabled: parsed.writeEnabled !== false,
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

  private normalizeProjectPath(projectPath: string): string {
    return path.resolve(projectPath).replace(/\\/g, '/');
  }

  private escapeLike(input: string): string {
    return input.replace(/[\\%_]/g, '\\$&');
  }
}
