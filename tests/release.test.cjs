const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'bin', 'cli.js');
const {
  buildReleaseManifest,
  bumpSemVer,
  updatePackageJsonVersionText,
  updatePackageLockVersionText,
} = require('../dist/services/release.js');

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('bumpSemVer increments patch, minor, and major versions', () => {
  assert.equal(bumpSemVer('1.0.0', 'patch'), '1.0.1');
  assert.equal(bumpSemVer('1.0.0', 'minor'), '1.1.0');
  assert.equal(bumpSemVer('1.0.0', 'major'), '2.0.0');
});

test('updatePackageJsonVersionText rewrites the root package version only', () => {
  const original = JSON.stringify(
    {
      name: 'agentmemory',
      version: '1.0.0',
      private: true,
    },
    null,
    2
  );

  const updated = updatePackageJsonVersionText(original, '1.2.0');
  const parsed = JSON.parse(updated);
  assert.equal(parsed.version, '1.2.0');
  assert.equal(parsed.name, 'agentmemory');
  assert.equal(parsed.private, true);
});

test('updatePackageLockVersionText rewrites both top-level and workspace package versions', () => {
  const original = JSON.stringify(
    {
      name: 'agentmemory',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'agentmemory',
          version: '1.0.0',
        },
        'node_modules/example': {
          version: '2.0.0',
        },
      },
    },
    null,
    2
  );

  const updated = updatePackageLockVersionText(original, '1.2.0');
  const parsed = JSON.parse(updated);
  assert.equal(parsed.version, '1.2.0');
  assert.equal(parsed.packages[''].version, '1.2.0');
  assert.equal(parsed.packages['node_modules/example'].version, '2.0.0');
});

test('buildReleaseManifest returns the stable release policy for AgentMemory', () => {
  const manifest = buildReleaseManifest();
  assert.equal(manifest.productName, 'AgentMemory');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.tagName, 'v1.0.0');
  assert.equal(manifest.stableBranch, 'master');
  assert.equal(manifest.versioning, 'semver');
  assert.equal(manifest.distributionChannel, 'github-release-source');
  assert.equal(manifest.sourceRepoUrl, 'https://github.com/KuanChen01/AgentMemory.git');
  assert.equal(manifest.latestReleaseApiUrl, 'https://api.github.com/repos/KuanChen01/AgentMemory/releases/latest');
});

test('agentmem release-manifest --json prints machine-readable release metadata', async () => {
  const result = await runCli(['release-manifest', '--json']);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.version, '1.0.0');
  assert.equal(payload.tagName, 'v1.0.0');
  assert.equal(payload.stableBranch, 'master');
  assert.equal(payload.distributionChannel, 'github-release-source');
});

test('agentmem release-plan --next minor prints the next tag and release checklist', async () => {
  const result = await runCli(['release-plan', '--next', 'minor']);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Current version:\s+1\.0\.0/);
  assert.match(result.stdout, /Next version:\s+1\.1\.0/);
  assert.match(result.stdout, /Release branch:\s+master/);
  assert.match(result.stdout, /Release tag:\s+v1\.1\.0/);
  assert.match(result.stdout, /npm run build/);
  assert.match(result.stdout, /node --test tests\/\*\.test\.cjs/);
  assert.match(result.stdout, /GitHub Release/);
});

test('agentmem version prints the current product version', async () => {
  const result = await runCli(['version']);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /AgentMemory\s+v1\.0\.0/);
});
