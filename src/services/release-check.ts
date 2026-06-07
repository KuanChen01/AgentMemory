import fs from 'fs';
import path from 'path';
import { buildReleaseManifest, ReleaseManifest, resolveProjectRoot } from './release';

export type ReleaseCheckStatus =
  | 'up_to_date'
  | 'update_available'
  | 'invalid_latest_tag'
  | 'network_error';

export type ReleaseInstallMode = 'git_checkout' | 'source_archive';

export interface ReleaseUpgradeGuidance {
  commands: string[];
  installMode: ReleaseInstallMode;
  summary: string;
}

export interface ReleaseCheckResult {
  checkedAt: string;
  currentTag: string;
  currentVersion: string;
  latestTag: string | null;
  latestVersion: string | null;
  message: string;
  releaseUrl: string;
  status: ReleaseCheckStatus;
  upgradeGuidance: ReleaseUpgradeGuidance;
}

interface ReleaseApiPayload {
  html_url?: unknown;
  tag_name?: unknown;
}

type ReleaseFetchResponse = {
  json(): Promise<ReleaseApiPayload>;
  ok: boolean;
  status: number;
};

type ReleaseFetch = (
  input: string,
  init?: {
    headers?: Record<string, string>;
  }
) => Promise<ReleaseFetchResponse>;

export interface ReleaseCheckOptions {
  checkedAt?: string;
  fetchImpl?: ReleaseFetch;
  manifest?: ReleaseManifest;
  projectRoot?: string;
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemVer(version: string): [number, number, number] {
  const normalized = String(version || '').trim();
  const match = normalized.match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Expected a strict SemVer version like 1.2.3, received "${version}".`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function createMessage(status: ReleaseCheckStatus, latestTag?: string | null, detail?: string): string {
  switch (status) {
    case 'update_available':
      return 'A newer AgentMemory release is available.';
    case 'invalid_latest_tag':
      return `Latest GitHub Release tag "${latestTag || 'unknown'}" is not a strict SemVer tag.`;
    case 'network_error':
      return detail
        ? `Unable to check the latest GitHub Release right now: ${detail}`
        : 'Unable to check the latest GitHub Release right now.';
    case 'up_to_date':
    default:
      return detail || 'AgentMemory is already on the latest published release.';
  }
}

export function compareSemVerVersions(left: string, right: string): number {
  const [leftMajor, leftMinor, leftPatch] = parseSemVer(left);
  const [rightMajor, rightMinor, rightPatch] = parseSemVer(right);

  if (leftMajor !== rightMajor) return leftMajor > rightMajor ? 1 : -1;
  if (leftMinor !== rightMinor) return leftMinor > rightMinor ? 1 : -1;
  if (leftPatch !== rightPatch) return leftPatch > rightPatch ? 1 : -1;
  return 0;
}

export function parseReleaseTagVersion(tagName: string, tagPrefix: string = 'v'): string | null {
  const normalized = String(tagName || '').trim();
  if (!normalized.startsWith(tagPrefix)) {
    return null;
  }

  const version = normalized.slice(tagPrefix.length);
  return SEMVER_PATTERN.test(version) ? version : null;
}

export function detectReleaseInstallMode(projectRoot: string): ReleaseInstallMode {
  return fs.existsSync(path.join(projectRoot, '.git')) ? 'git_checkout' : 'source_archive';
}

export function buildReleaseUpgradeGuidance(
  manifest: ReleaseManifest,
  installMode: ReleaseInstallMode
): ReleaseUpgradeGuidance {
  if (installMode === 'git_checkout') {
    return {
      commands: [...manifest.windowsUpdateCommands],
      installMode,
      summary:
        'This checkout can upgrade by pulling the latest repository changes and rerunning the Windows bootstrap.',
    };
  }

  return {
    commands: [manifest.windowsBootstrapCommand],
    installMode,
    summary:
      'Download the latest source archive from the GitHub Release page, replace this checkout, then rerun the Windows bootstrap.',
  };
}

function buildNetworkErrorResult(
  manifest: ReleaseManifest,
  checkedAt: string,
  projectRoot: string,
  detail: string
): ReleaseCheckResult {
  return {
    checkedAt,
    currentTag: manifest.tagName,
    currentVersion: manifest.version,
    latestTag: null,
    latestVersion: null,
    message: createMessage('network_error', null, detail),
    releaseUrl: manifest.releasesUrl,
    status: 'network_error',
    upgradeGuidance: buildReleaseUpgradeGuidance(manifest, detectReleaseInstallMode(projectRoot)),
  };
}

export async function checkLatestRelease(
  options: ReleaseCheckOptions = {}
): Promise<ReleaseCheckResult> {
  const manifest = options.manifest || buildReleaseManifest();
  const checkedAt = options.checkedAt || new Date().toISOString();
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const fetchImpl = options.fetchImpl || (globalThis.fetch as ReleaseFetch | undefined);

  if (!fetchImpl) {
    return buildNetworkErrorResult(
      manifest,
      checkedAt,
      projectRoot,
      'No fetch implementation is available in this runtime.'
    );
  }

  try {
    const response = await fetchImpl(manifest.latestReleaseApiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${manifest.productName}/${manifest.version}`,
      },
    });

    if (!response.ok) {
      return buildNetworkErrorResult(
        manifest,
        checkedAt,
        projectRoot,
        `HTTP ${response.status}`
      );
    }

    const payload = await response.json();
    const latestTag =
      typeof payload.tag_name === 'string' && payload.tag_name.trim()
        ? payload.tag_name.trim()
        : null;
    const latestVersion = latestTag
      ? parseReleaseTagVersion(latestTag, manifest.tagPrefix)
      : null;
    const releaseUrl =
      typeof payload.html_url === 'string' && payload.html_url.trim()
        ? payload.html_url.trim()
        : manifest.releasesUrl;
    const upgradeGuidance = buildReleaseUpgradeGuidance(
      manifest,
      detectReleaseInstallMode(projectRoot)
    );

    if (!latestVersion) {
      return {
        checkedAt,
        currentTag: manifest.tagName,
        currentVersion: manifest.version,
        latestTag,
        latestVersion: null,
        message: createMessage('invalid_latest_tag', latestTag),
        releaseUrl,
        status: 'invalid_latest_tag',
        upgradeGuidance,
      };
    }

    const comparison = compareSemVerVersions(latestVersion, manifest.version);
    if (comparison > 0) {
      return {
        checkedAt,
        currentTag: manifest.tagName,
        currentVersion: manifest.version,
        latestTag,
        latestVersion,
        message: createMessage('update_available'),
        releaseUrl,
        status: 'update_available',
        upgradeGuidance,
      };
    }

    const message =
      comparison < 0
        ? 'Current checkout is ahead of the latest published GitHub Release.'
        : createMessage('up_to_date');

    return {
      checkedAt,
      currentTag: manifest.tagName,
      currentVersion: manifest.version,
      latestTag,
      latestVersion,
      message,
      releaseUrl,
      status: 'up_to_date',
      upgradeGuidance,
    };
  } catch (error: any) {
    return buildNetworkErrorResult(
      manifest,
      checkedAt,
      projectRoot,
      error?.message || 'Unexpected release-check failure.'
    );
  }
}
