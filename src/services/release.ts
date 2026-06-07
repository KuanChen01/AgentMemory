import fs from 'fs';
import path from 'path';

export type ReleaseIncrement = 'patch' | 'minor' | 'major';

export interface ReleaseManifest {
  distributionChannel: 'github-release-source';
  latestReleaseApiUrl: string;
  productName: string;
  releasesUrl: string;
  sourceRepoUrl: string;
  stableBranch: string;
  tagName: string;
  tagPrefix: 'v';
  verificationCommands: string[];
  version: string;
  versioning: 'semver';
  windowsBootstrapCommand: string;
  windowsUpdateCommands: string[];
}

export interface ReleasePlan {
  currentVersion: string;
  distributionSummary: string;
  manualSteps: string[];
  manifest: ReleaseManifest;
  nextVersion: string;
}

const PRODUCT_NAME = 'AgentMemory';
const STABLE_BRANCH = 'master';
const TAG_PREFIX = 'v';
const SOURCE_REPO_URL = 'https://github.com/KuanChen01/AgentMemory.git';
const RELEASES_URL = 'https://github.com/KuanChen01/AgentMemory/releases';
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/KuanChen01/AgentMemory/releases/latest';
const VERIFICATION_COMMANDS = ['npm run build', 'node --test tests/*.test.cjs'];
const WINDOWS_BOOTSTRAP_COMMAND = '.\\bootstrap-second-machine.cmd';
const WINDOWS_UPDATE_COMMANDS = ['git pull', '.\\bootstrap-second-machine.cmd'];
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function ensureSemVer(version: string): string {
  const normalized = String(version || '').trim();
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`Expected a strict SemVer version like 1.2.3, received "${version}".`);
  }

  return normalized;
}

function readJsonFile(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readReleaseEnvOverride(key: string, fallback: string): string {
  const value = String(process.env[key] || '').trim();
  return value || fallback;
}

export function resolveProjectRoot(fromDir: string = __dirname): string {
  return path.resolve(fromDir, '..', '..');
}

export function resolvePackageJsonPath(fromDir: string = __dirname): string {
  return path.join(resolveProjectRoot(fromDir), 'package.json');
}

export function resolvePackageLockPath(fromDir: string = __dirname): string {
  return path.join(resolveProjectRoot(fromDir), 'package-lock.json');
}

export function readPackageVersion(packageJsonPath: string = resolvePackageJsonPath()): string {
  const parsed = readJsonFile(packageJsonPath);
  return ensureSemVer(parsed.version);
}

export function bumpSemVer(version: string, increment: ReleaseIncrement): string {
  const match = ensureSemVer(version).match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Unable to parse version "${version}".`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  switch (increment) {
    case 'patch':
      patch += 1;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    default:
      throw new Error(`Unsupported release increment "${increment}".`);
  }

  return `${major}.${minor}.${patch}`;
}

export function updatePackageJsonVersionText(text: string, nextVersion: string): string {
  const parsed = JSON.parse(text);
  parsed.version = ensureSemVer(nextVersion);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updatePackageLockVersionText(text: string, nextVersion: string): string {
  const parsed = JSON.parse(text);
  const normalized = ensureSemVer(nextVersion);
  parsed.version = normalized;
  if (parsed.packages && parsed.packages[''] && typeof parsed.packages[''] === 'object') {
    parsed.packages[''].version = normalized;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function buildReleaseManifest(fromDir: string = __dirname): ReleaseManifest {
  const version = readPackageVersion(resolvePackageJsonPath(fromDir));
  return {
    distributionChannel: 'github-release-source',
    latestReleaseApiUrl: readReleaseEnvOverride('AGENTMEM_LATEST_RELEASE_API_URL', LATEST_RELEASE_API_URL),
    productName: PRODUCT_NAME,
    releasesUrl: readReleaseEnvOverride('AGENTMEM_RELEASES_URL', RELEASES_URL),
    sourceRepoUrl: SOURCE_REPO_URL,
    stableBranch: STABLE_BRANCH,
    tagName: `${TAG_PREFIX}${version}`,
    tagPrefix: TAG_PREFIX,
    verificationCommands: [...VERIFICATION_COMMANDS],
    version,
    versioning: 'semver',
    windowsBootstrapCommand: WINDOWS_BOOTSTRAP_COMMAND,
    windowsUpdateCommands: [...WINDOWS_UPDATE_COMMANDS],
  };
}

export function buildReleasePlan(
  increment: ReleaseIncrement,
  fromDir: string = __dirname
): ReleasePlan {
  const manifest = buildReleaseManifest(fromDir);
  const nextVersion = bumpSemVer(manifest.version, increment);
  const nextTag = `${manifest.tagPrefix}${nextVersion}`;
  const manualSteps = [
    `Switch to ${manifest.stableBranch} and make sure the working tree is clean.`,
    `Run npm run release:bump -- --next ${increment}.`,
    'Run npm run build.',
    'Run node --test tests/*.test.cjs.',
    `Commit the version bump and refreshed dist output with message "chore: release ${nextTag}".`,
    `Create the tag with git tag ${nextTag}.`,
    `Push the commit and tag to origin/${manifest.stableBranch}.`,
    `Create a GitHub Release titled ${nextTag} and publish the default source archives plus release notes.`,
  ];

  return {
    currentVersion: manifest.version,
    distributionSummary: 'GitHub Release + source archive',
    manualSteps,
    manifest,
    nextVersion,
  };
}

export function renderReleaseManifestText(manifest: ReleaseManifest): string {
  return [
    `${manifest.productName} Release Manifest`,
    '',
    `Current version: ${manifest.version}`,
    `Current tag: ${manifest.tagName}`,
    `Stable branch: ${manifest.stableBranch}`,
    `Versioning: ${manifest.versioning}`,
    'Distribution: GitHub Release + source archive',
    `Repository: ${manifest.sourceRepoUrl}`,
    `Releases page: ${manifest.releasesUrl}`,
    `Latest release API: ${manifest.latestReleaseApiUrl}`,
    `Windows bootstrap: ${manifest.windowsBootstrapCommand}`,
    'Windows update path:',
    ...manifest.windowsUpdateCommands.map((command) => `- ${command}`),
  ].join('\n');
}

export function renderReleasePlanText(plan: ReleasePlan): string {
  const nextTag = `${plan.manifest.tagPrefix}${plan.nextVersion}`;
  return [
    `${plan.manifest.productName} Release Plan`,
    '',
    `Current version: ${plan.currentVersion}`,
    `Next version: ${plan.nextVersion}`,
    `Release tag: ${nextTag}`,
    `Release branch: ${plan.manifest.stableBranch}`,
    `Distribution: ${plan.distributionSummary}`,
    `Release notes destination: GitHub Release (${plan.manifest.releasesUrl})`,
    '',
    'Verification commands:',
    ...plan.manifest.verificationCommands.map((command) => `- ${command}`),
    '',
    'Manual release steps:',
    ...plan.manualSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}

export function writeReleaseVersion(
  nextVersion: string,
  fromDir: string = __dirname
): { nextVersion: string; previousVersion: string; packageJsonPath: string; packageLockPath: string } {
  const normalized = ensureSemVer(nextVersion);
  const packageJsonPath = resolvePackageJsonPath(fromDir);
  const packageLockPath = resolvePackageLockPath(fromDir);
  const previousVersion = readPackageVersion(packageJsonPath);

  fs.writeFileSync(
    packageJsonPath,
    updatePackageJsonVersionText(fs.readFileSync(packageJsonPath, 'utf8'), normalized),
    'utf8'
  );
  fs.writeFileSync(
    packageLockPath,
    updatePackageLockVersionText(fs.readFileSync(packageLockPath, 'utf8'), normalized),
    'utf8'
  );

  return {
    nextVersion: normalized,
    previousVersion,
    packageJsonPath,
    packageLockPath,
  };
}
