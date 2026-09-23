import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type BaselineStatus = 'pristine' | 'legacy-no-pristine-baseline';

export type ManagedTargetKind =
  | 'claude-settings'
  | 'claude-global'
  | 'codex-config'
  | 'codex-hooks'
  | 'grok-config'
  | 'grok-hooks'
  | 'grok-profile'
  | 'grok-rules'
  | 'opencode-config'
  | 'opencode-displaced-json'
  | 'opencode-plugin'
  | 'antigravity-config'
  | 'antigravity-guidance'
  | 'antigravity-plugins-config'
  | 'antigravity-plugin-manifest'
  | 'antigravity-plugin-hooks'
  | 'antigravity-plugin-mcp'
  | 'antigravity-plugin-rule';

export interface InstallStateRecord {
  baselineBackupPath?: string;
  baselineStatus: BaselineStatus;
  existedBeforeInstall: boolean;
  kind: ManagedTargetKind;
  lastAppliedSha256?: string | null;
  path: string;
}

export interface InstallStateManifest {
  targets: Record<string, InstallStateRecord>;
  version: 1;
}

export interface PrepareManagedTargetOptions {
  currentText?: string;
  homeDir: string;
  isLegacyManaged: boolean;
  kind: ManagedTargetKind;
  targetPath: string;
}

const STATE_VERSION = 1;

function ensureAgentMemDir(homeDir: string) {
  fs.mkdirSync(path.join(homeDir, '.agentmem'), { recursive: true });
}

function getBackupsDir(homeDir: string): string {
  return path.join(homeDir, '.agentmem', 'backups');
}

export function getInstallStatePath(homeDir: string): string {
  return path.join(homeDir, '.agentmem', 'install-state.json');
}

export function loadInstallState(homeDir: string): InstallStateManifest {
  const statePath = getInstallStatePath(homeDir);
  if (!fs.existsSync(statePath)) {
    return {
      version: STATE_VERSION,
      targets: {},
    };
  }

  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  return {
    version: STATE_VERSION,
    targets: typeof parsed.targets === 'object' && parsed.targets ? parsed.targets : {},
  };
}

export function saveInstallState(homeDir: string, state: InstallStateManifest) {
  ensureAgentMemDir(homeDir);
  fs.writeFileSync(
    getInstallStatePath(homeDir),
    `${JSON.stringify({ version: STATE_VERSION, targets: state.targets }, null, 2)}\n`,
    'utf8'
  );
}

export function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildBackupPath(homeDir: string, targetPath: string): string {
  const backupsDir = getBackupsDir(homeDir);
  fs.mkdirSync(backupsDir, { recursive: true });

  const baseName = path.basename(targetPath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const suffix = crypto.createHash('sha1').update(path.resolve(targetPath)).digest('hex').slice(0, 12);
  return path.join(backupsDir, `${baseName}-${suffix}.bak`);
}

export function prepareManagedTarget(
  state: InstallStateManifest,
  options: PrepareManagedTargetOptions
): { record: InstallStateRecord; warnings: string[] } {
  const absolutePath = path.resolve(options.targetPath);
  const existingRecord = state.targets[absolutePath];
  if (existingRecord) {
    if (existingRecord.kind !== options.kind) {
      existingRecord.kind = options.kind;
    }

    return {
      record: existingRecord,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const existedBeforeInstall = typeof options.currentText === 'string';
  const record: InstallStateRecord = {
    baselineStatus: 'pristine',
    existedBeforeInstall,
    kind: options.kind,
    path: absolutePath,
  };

  if (existedBeforeInstall) {
    if (options.isLegacyManaged) {
      record.baselineStatus = 'legacy-no-pristine-baseline';
      warnings.push(
        `No pristine baseline was captured for legacy AgentMemory-managed file: ${absolutePath}`
      );
    } else {
      const backupPath = buildBackupPath(options.homeDir, absolutePath);
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, options.currentText || '', 'utf8');
      }
      record.baselineBackupPath = backupPath;
    }
  }

  state.targets[absolutePath] = record;
  return { record, warnings };
}

export function markManagedTargetApplied(
  state: InstallStateManifest,
  targetPath: string,
  appliedText: string | null
) {
  const record = state.targets[path.resolve(targetPath)];
  if (!record) {
    throw new Error(`Cannot update unmanaged target state for ${targetPath}`);
  }

  record.lastAppliedSha256 = appliedText === null ? null : sha256Text(appliedText);
}

export function matchesManagedTargetState(
  record: InstallStateRecord | undefined,
  currentText?: string
): boolean {
  if (!record) {
    return false;
  }

  if (record.lastAppliedSha256 === null) {
    return typeof currentText !== 'string';
  }

  if (typeof record.lastAppliedSha256 !== 'string' || typeof currentText !== 'string') {
    return false;
  }

  return sha256Text(currentText) === record.lastAppliedSha256;
}

export function purgeInstallStateArtifacts(homeDir: string) {
  const statePath = getInstallStatePath(homeDir);
  const backupsDir = getBackupsDir(homeDir);

  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
  if (fs.existsSync(backupsDir)) {
    fs.rmSync(backupsDir, { recursive: true, force: true });
  }
}
