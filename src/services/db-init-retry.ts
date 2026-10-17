export function isDatabaseLockedError(error: any): boolean {
  return String(error?.code || '').startsWith('SQLITE_BUSY') || /database is locked/i.test(String(error?.message || ''));
}

/** Retries a startup step while SQLite reports the database is locked (e.g. another worker is still closing). */
export async function initializeWithLockRetry<T>(init: () => Promise<T>, totalMs = Number(process.env.AGENTMEM_DB_INIT_RETRY_MS) || 10000, stepMs = 500): Promise<T> {
  const deadline = Date.now() + totalMs;
  for (;;) {
    try { return await init(); } catch (error) {
      if (!isDatabaseLockedError(error) || Date.now() + stepMs > deadline) throw error;
      console.warn(`[DB] database is locked during startup; retrying in ${stepMs}ms`);
      await new Promise(resolve => setTimeout(resolve, stepMs));
    }
  }
}
