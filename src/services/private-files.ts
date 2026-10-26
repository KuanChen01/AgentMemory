import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ~/.agentmem holds the LLM key, the worker token, prompts and config backups: only the owner may read them.
// POSIX: directories 0700, files 0600. Windows: a directory inside the user profile keeps the profile's
// owner-only ACL (tools may have granted themselves access there on purpose); a directory outside the
// profile gets its inherited ACL replaced by the current user, SYSTEM and Administrators.

const restrictedWindowsDirs = new Set<string>();

function insideHomeDir(target: string): boolean {
  const home = path.resolve(os.homedir()).toLowerCase();
  const resolved = path.resolve(target).toLowerCase();
  return resolved === home || resolved.startsWith(home.endsWith(path.sep) ? home : `${home}${path.sep}`);
}

function restrictWindowsDir(dir: string): void {
  const resolved = path.resolve(dir);
  if (restrictedWindowsDirs.has(resolved) || insideHomeDir(resolved)) return;
  restrictedWindowsDirs.add(resolved);
  const user = os.userInfo().username;
  const principal = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${user}` : user;
  // icacls changes nothing when a principal cannot be resolved, so a failure leaves the old ACL in place.
  spawnSync('icacls', [resolved, '/inheritance:r', '/grant:r', `${principal}:(OI)(CI)F`,
    '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '/Q'], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
}

/** Restricts an existing file (0600) or directory (0700) to its owner. Best effort; never throws. */
export function restrictToOwner(target: string, isDirectory: boolean): void {
  try {
    if (process.platform === 'win32') {
      if (isDirectory) restrictWindowsDir(target);
      return;
    }
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
