import { randomBytes } from 'crypto';
import fs from 'fs';

// ~/.agentmem holds the LLM key, prompts and config backups: only the owner may read them.
// POSIX: directories 0700, files 0600. Windows: atomic writes with no ACL changes.

/** Restricts an existing file (0600) or directory (0700) to its owner. Best effort; never throws. */
export function restrictToOwner(target: string, isDirectory: boolean): void {
  try {
    if (process.platform === 'win32') return;
    fs.chmodSync(target, isDirectory ? 0o700 : 0o600);
  } catch { /* A filesystem without permissions (FAT, some network shares) keeps its defaults. */ }
}

/** Creates a directory owner-only. An existing directory is tightened only when it is AgentMemory's own. */
export function ensurePrivateDir(dir: string, tightenExisting = false): void {
  const existed = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!existed || tightenExisting) restrictToOwner(dir, true);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Writes an owner-only (0600) file atomically: a temp file in the same directory is fully written and
 * flushed, then renamed over the target, so an interrupted write never leaves a truncated file behind.
 */
export function writePrivateFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    // Windows refuses the rename while another process briefly holds the target open.
    for (let attempt = 0; ; attempt += 1) {
      try {
        fs.renameSync(tempPath, filePath);
        break;
      } catch (error: any) {
        if (attempt >= 9 || !['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) throw error;
        sleepSync(50);
      }
    }
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* Already gone. */ }
    throw error;
  }
  restrictToOwner(filePath, false);
}
