const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { buildReleaseManifest } = require('../dist/services/release.js');
const {
  buildReleaseUpgradeGuidance,
  checkLatestRelease,
  compareSemVerVersions,
  detectReleaseInstallMode,
  parseReleaseTagVersion,
} = require('../dist/services/release-check.js');

function createTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-release-check-${randomUUID()}-`));
}

function createManifest(overrides = {}) {
  return {
    ...buildReleaseManifest(),
    latestReleaseApiUrl: 'https://example.test/releases/latest',
    releasesUrl: 'https://example.test/releases',
    ...overrides,
  };
}

test('compareSemVerVersions orders strict semver versions correctly', () => {
  assert.equal(compareSemVerVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemVerVersions('1.0.0', '1.0.1'), -1);
  assert.equal(compareSemVerVersions('1.2.0', '1.1.9'), 1);
});

test('parseReleaseTagVersion accepts strict v-prefixed tags and rejects invalid ones', () => {
  assert.equal(parseReleaseTagVersion('v1.2.3'), '1.2.3');
  assert.equal(parseReleaseTagVersion('1.2.3'), null);
  assert.equal(parseReleaseTagVersion('v1.2'), null);
  assert.equal(parseReleaseTagVersion('release-1.2.3'), null);
});

test('detectReleaseInstallMode and upgrade guidance distinguish git checkouts from source archives', () => {
  const gitProjectRoot = createTempProject();
  const archiveProjectRoot = createTempProject();
  fs.writeFileSync(path.join(gitProjectRoot, '.git'), 'gitdir: ../.git/worktrees/example\n');

  try {
    assert.equal(detectReleaseInstallMode(gitProjectRoot), 'git_checkout');
    assert.equal(detectReleaseInstallMode(archiveProjectRoot), 'source_archive');

    const manifest = createManifest();
    const gitGuidance = buildReleaseUpgradeGuidance(manifest, 'git_checkout');
    assert.deepEqual(gitGuidance.commands, ['git pull', '.\\bootstrap-second-machine.cmd']);

    const archiveGuidance = buildReleaseUpgradeGuidance(manifest, 'source_archive');
    assert.deepEqual(archiveGuidance.commands, ['.\\bootstrap-second-machine.cmd']);
    assert.match(archiveGuidance.summary, /download/i);
  } finally {
    fs.rmSync(gitProjectRoot, { recursive: true, force: true });
    fs.rmSync(archiveProjectRoot, { recursive: true, force: true });
  }
});

test('checkLatestRelease returns update_available for a newer GitHub Release', async () => {
  const projectRoot = createTempProject();
  fs.writeFileSync(path.join(projectRoot, '.git'), 'gitdir: ../.git/worktrees/example\n');

  try {
    const result = await checkLatestRelease({
      checkedAt: '2026-06-07T00:00:00.000Z',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            tag_name: 'v1.0.1',
            html_url: 'https://example.test/releases/tag/v1.0.1',
          };
        },
      }),
      manifest: createManifest({ tagName: 'v1.0.0', version: '1.0.0' }),
      projectRoot,
    });

    assert.equal(result.status, 'update_available');
    assert.equal(result.currentVersion, '1.0.0');
    assert.equal(result.latestVersion, '1.0.1');
    assert.equal(result.latestTag, 'v1.0.1');
    assert.equal(result.releaseUrl, 'https://example.test/releases/tag/v1.0.1');
    assert.equal(result.checkedAt, '2026-06-07T00:00:00.000Z');
    assert.equal(result.upgradeGuidance.installMode, 'git_checkout');
    assert.deepEqual(result.upgradeGuidance.commands, ['git pull', '.\\bootstrap-second-machine.cmd']);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('checkLatestRelease normalizes invalid tags and network failures without throwing', async () => {
  const projectRoot = createTempProject();

  try {
    const invalidTagResult = await checkLatestRelease({
      checkedAt: '2026-06-07T00:00:00.000Z',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            tag_name: 'latest',
            html_url: 'https://example.test/releases/tag/latest',
          };
        },
      }),
      manifest: createManifest(),
      projectRoot,
    });

    assert.equal(invalidTagResult.status, 'invalid_latest_tag');
    assert.equal(invalidTagResult.latestVersion, null);
    assert.equal(invalidTagResult.latestTag, 'latest');

    const networkErrorResult = await checkLatestRelease({
      checkedAt: '2026-06-07T00:00:00.000Z',
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
      manifest: createManifest(),
      projectRoot,
    });

    assert.equal(networkErrorResult.status, 'network_error');
    assert.equal(networkErrorResult.latestVersion, null);
    assert.match(networkErrorResult.message, /socket hang up/i);
    assert.equal(networkErrorResult.upgradeGuidance.installMode, 'source_archive');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
