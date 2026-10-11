import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';

export const SQLITE_BUSY_TIMEOUT_MS = 100;
export const SQLITE_WRITE_ATTEMPTS = 4;

// Retry whole synchronous operations, after SQLite has rolled back any failed
// transaction. Waiting between attempts yields to HTTP and shutdown handlers.
export async function retrySqliteBusy<T>(operation: () => T): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error: any) {
      if (!String(error?.code || '').startsWith('SQLITE_BUSY') || attempt >= SQLITE_WRITE_ATTEMPTS - 1) {
        throw error;
      }
      const delay = 25 * (2 ** attempt) + Math.floor(Math.random() * 10);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Small compatibility surface for DatabaseManager's existing SQL statements. */
export class Database {
  private connection: BetterSqlite3.Database;

  constructor(filename: string) {
    if (Number(process.versions.node.split('.')[0]) < 22) {
      throw new Error(`AgentMemory requires Node.js 22 or newer (current: ${process.version}).`);
    }
    if (fs.existsSync(`${filename}.lock`)) {
      throw new Error('Legacy SQLite .lock detected. Stop all older AgentMemory Worker/MCP processes and follow the native SQLite migration guide before opening this database.');
    }
    this.connection = new BetterSqlite3(filename, { timeout: SQLITE_BUSY_TIMEOUT_MS });
  }

  configure(): void {
    const current = this.connection.pragma('journal_mode', { simple: true });
    const mode = current === 'wal' ? current : this.connection.pragma('journal_mode = WAL', { simple: true });
    if (mode !== 'wal') {
      throw new Error(`SQLite WAL could not be enabled (journal_mode=${mode}).`);
    }
    this.connection.pragma('foreign_keys = ON');
  }

  run(sql: string, values: any[] = []): BetterSqlite3.RunResult {
    return this.connection.prepare(sql).run(...values);
  }

  get(sql: string, values: any[] = []): any {
    return this.connection.prepare(sql).get(...values) ?? null;
  }

  all(sql: string, values: any[] = []): any[] {
    return this.connection.prepare(sql).all(...values);
  }

  // Callbacks must stay synchronous: network requests belong outside transactions.
  transaction<T>(operation: () => T): T {
    return this.connection.transaction(operation).immediate();
  }

  diagnostics() {
    return {
      driver: 'better-sqlite3',
      sqlite_version: this.get('SELECT sqlite_version() AS version').version,
      journal_mode: this.connection.pragma('journal_mode', { simple: true }),
      schema_version: this.connection.pragma('user_version', { simple: true }),
      busy_timeout_ms: SQLITE_BUSY_TIMEOUT_MS,
      write_attempts: SQLITE_WRITE_ATTEMPTS,
    };
  }

  close(): void {
    this.connection.close();
  }
}
