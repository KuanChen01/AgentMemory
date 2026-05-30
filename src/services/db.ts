// @ts-ignore
import { Database } from 'node-sqlite3-wasm';
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
    
    const normalizedPath = path.resolve(projectPath).replace(/\\/g, '/');
    const rows = this.db.all(
      `SELECT * FROM observations 
       WHERE LOWER(project_path) = LOWER(?)
       ORDER BY created_at DESC`,
      [normalizedPath]
    ) as any[];

    return rows.map((row) => ({
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
    }));
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

    return rows.map((row) => ({
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
    }));
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

    const normalizedPath = path.resolve(projectPath).replace(/\\/g, '/');
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
}
