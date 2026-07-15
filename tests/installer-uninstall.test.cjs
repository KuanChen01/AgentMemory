const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'bin', 'cli.js');
const {
  mergeManagedHookEntries,
  removeManagedHookEntries,
} = require('../dist/services/agent-installer.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-uninstall-${randomUUID()}-`));
}

function removeDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function makeCliEnv(tempHome) {
  const parsed = path.parse(tempHome);
  const homedrive = parsed.root.replace(/[\\\/]+$/, '');
  const homepath = tempHome.slice(parsed.root.length - 1);

  return {
    ...process.env,
    AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION: '1',
    AGENTMEM_SKIP_GLOBAL_UNLINK: '1',
    HOME: tempHome,
    USERPROFILE: tempHome,
    HOMEDRIVE: homedrive,
    HOMEPATH: homepath,
  };
}

async function runCli(tempHome, args, options = {}) {
  const child = spawn('node', [cliPath, ...args], {
    cwd: projectRoot,
    env: {
      ...makeCliEnv(tempHome),
      ...(options.env || {}),
    },
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

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });

  if (!options.allowFailure && exitCode !== 0) {
    throw new Error(`agentmem ${args.join(' ')} exited with code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { exitCode, stdout, stderr };
}

function seedAntigravity(tempHome) {
  const antigravityConfigPath = path.join(
    tempHome,
    '.gemini',
    'config',
    'plugins',
    'local-game-mcps',
    'mcp_config.json'
  );
  fs.mkdirSync(path.dirname(antigravityConfigPath), { recursive: true });
  fs.writeFileSync(
    antigravityConfigPath,
    JSON.stringify(
      {
        mcpServers: {
          other: {
            command: 'python',
            args: ['other.py'],
            disabled: false,
          },
        },
      },
      null,
      2
    ),
    'utf8'
  );
}

function readInstallState(tempHome) {
  return JSON.parse(
    fs.readFileSync(path.join(tempHome, '.agentmem', 'install-state.json'), 'utf8')
  );
}

test('mergeManagedHookEntries preserves unrelated hooks while deduping AgentMemory commands', () => {
  const existing = [
    {
      matcher: 'docs/**',
      hooks: [{ type: 'command', command: 'node "C:/tools/custom-docs-hook.js"' }],
    },
    {
      matcher: '.*',
      hooks: [
        { type: 'command', command: 'node "D:/Old/AgentMemory/dist/hooks/codex-session-start.js"' },
        { type: 'command', command: 'node "C:/tools/other-hook.js"' },
      ],
    },
  ];

  const merged = mergeManagedHookEntries(existing, 'codex-session-start.js', 'node "E:/Repo/AgentMemory/dist/hooks/codex-session-start.js"');

  assert.equal(
    merged.filter((entry) => JSON.stringify(entry).includes('codex-session-start.js')).length,
    1
  );
  assert.equal(JSON.stringify(merged).includes('custom-docs-hook.js'), true);
  assert.equal(JSON.stringify(merged).includes('other-hook.js'), true);
});

test('removeManagedHookEntries strips only AgentMemory-managed hook commands', () => {
  const existing = [
    {
      matcher: '.*',
      hooks: [
        { type: 'command', command: 'node "E:/Repo/AgentMemory/dist/hooks/codex-post-tool.js"' },
        { type: 'command', command: 'node "C:/tools/custom-post.js"' },
      ],
    },
  ];

  const cleaned = removeManagedHookEntries(existing, ['codex-post-tool.js']);

  assert.equal(JSON.stringify(cleaned).includes('codex-post-tool.js'), false);
  assert.equal(JSON.stringify(cleaned).includes('custom-post.js'), true);
});

test('agentmem install records a pristine baseline once and keeps it across repeated installs', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const configPath = path.join(tempHome, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `[features]
model = "gpt-5"
`,
      'utf8'
    );

    await runCli(tempHome, ['install']);
    const stateOnce = readInstallState(tempHome);
    const recordOnce = Object.values(stateOnce.targets).find((entry) => entry.path === configPath);

    assert.equal(recordOnce.baselineStatus, 'pristine');
    assert.equal(recordOnce.existedBeforeInstall, true);
    assert.equal(fs.existsSync(recordOnce.baselineBackupPath), true);
    const backupText = fs.readFileSync(recordOnce.baselineBackupPath, 'utf8');
    assert.equal(backupText, `[features]
model = "gpt-5"
`);

    await runCli(tempHome, ['install']);
    const stateTwice = readInstallState(tempHome);
    const recordTwice = Object.values(stateTwice.targets).find((entry) => entry.path === configPath);

    assert.equal(recordTwice.baselineBackupPath, recordOnce.baselineBackupPath);
    assert.equal(fs.readFileSync(recordTwice.baselineBackupPath, 'utf8'), backupText);
  } finally {
    removeDir(tempHome);
  }
});

test('legacy AgentMemory-managed files without state are adopted without a pristine baseline', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const hooksPath = path.join(tempHome, '.codex', 'hooks.json');
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: '.*',
                hooks: [{ type: 'command', command: 'node "D:/Old/AgentMemory/dist/hooks/codex-session-start.js"' }],
              },
            ],
          },
        },
        null,
        2
      ),
      'utf8'
    );

    await runCli(tempHome, ['install']);
    const state = readInstallState(tempHome);
    const record = Object.values(state.targets).find((entry) => entry.path === hooksPath);

    assert.equal(record.baselineStatus, 'legacy-no-pristine-baseline');
    assert.equal(record.baselineBackupPath, undefined);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem uninstall restores pristine files when configs were untouched after install', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const claudeSettingsPath = path.join(tempHome, '.claude', 'settings.json');
    const claudeGlobalPath = path.join(tempHome, '.claude.json');
    fs.mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
    const originalSettings = `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`;
    const originalGlobal = `${JSON.stringify({ telemetry: false }, null, 2)}\n`;
    fs.writeFileSync(claudeSettingsPath, originalSettings, 'utf8');
    fs.writeFileSync(claudeGlobalPath, originalGlobal, 'utf8');

    await runCli(tempHome, ['install']);
    await runCli(tempHome, ['uninstall']);

    assert.equal(fs.readFileSync(claudeSettingsPath, 'utf8'), originalSettings);
    assert.equal(fs.readFileSync(claudeGlobalPath, 'utf8'), originalGlobal);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem uninstall falls back to targeted cleanup when a managed file diverged after install', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const configPath = path.join(tempHome, '.codex', 'config.toml');
    const hooksPath = path.join(tempHome, '.codex', 'hooks.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `[features]
model = "gpt-5"
`, 'utf8');
    fs.writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: 'tools/**',
                hooks: [{ type: 'command', command: 'node "C:/tools/custom-post.js"' }],
              },
            ],
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    await runCli(tempHome, ['install']);
    fs.appendFileSync(configPath, '\n[custom]\nflag = true\n', 'utf8');

    const uninstall = await runCli(tempHome, ['uninstall']);

    const cleanedToml = fs.readFileSync(configPath, 'utf8');
    const cleanedHooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.equal(uninstall.stdout.includes('warning') || uninstall.stderr.includes('warning'), true);
    assert.equal(cleanedToml.includes('[mcp_servers.agentmem]'), false);
    assert.equal(cleanedToml.includes('[custom]'), true);
    assert.equal(cleanedToml.includes('flag = true'), true);
    assert.equal(JSON.stringify(cleanedHooks).includes('codex-post-tool.js'), false);
    assert.equal(JSON.stringify(cleanedHooks).includes('custom-post.js'), true);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem uninstall restores a pristine Grok config and removes generated artifacts', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const grokConfigPath = path.join(tempHome, '.grok', 'config.toml');
    const grokHooksPath = path.join(tempHome, '.grok', 'hooks', 'agentmem.json');
    const grokProfilePath = path.join(tempHome, '.grok', 'agents', 'agentmem.md');
    const grokRulesPath = path.join(tempHome, '.grok', 'AGENTS.md');
    const original = `[cli]\ninstaller = "internal"\n`;
    fs.mkdirSync(path.dirname(grokConfigPath), { recursive: true });
    fs.writeFileSync(grokConfigPath, original, 'utf8');

    await runCli(tempHome, ['install']);
    assert.match(fs.readFileSync(grokRulesPath, 'utf8'), /AgentMemory Grok Vault Rules/);
    assert.match(fs.readFileSync(grokRulesPath, 'utf8'), /obsiguide\.md/);
    await runCli(tempHome, ['uninstall']);

    assert.equal(fs.readFileSync(grokConfigPath, 'utf8'), original);
    assert.equal(fs.existsSync(grokHooksPath), false);
    assert.equal(fs.existsSync(grokProfilePath), false);
    assert.equal(fs.existsSync(grokRulesPath), false);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem uninstall cleans only Grok-managed config when the file diverged', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    const grokConfigPath = path.join(tempHome, '.grok', 'config.toml');
    fs.mkdirSync(path.dirname(grokConfigPath), { recursive: true });
    fs.writeFileSync(grokConfigPath, `[cli]\ninstaller = "internal"\n`, 'utf8');

    await runCli(tempHome, ['install']);
    fs.appendFileSync(grokConfigPath, '\n[custom]\nflag = true\n', 'utf8');
    await runCli(tempHome, ['uninstall']);

    const cleaned = fs.readFileSync(grokConfigPath, 'utf8');
    assert.doesNotMatch(cleaned, /mcp_servers\.agentmem/);
    assert.doesNotMatch(cleaned, /name = "agentmem"/);
    assert.doesNotMatch(cleaned, /hooks = false/);
    assert.match(cleaned, /\[custom\]/);
    assert.match(cleaned, /flag = true/);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem uninstall --purge-all removes install state and backup artifacts', async () => {
  const tempHome = makeTempHome();

  try {
    seedAntigravity(tempHome);
    await runCli(tempHome, ['install']);
    await runCli(tempHome, ['uninstall', '--purge-all']);

    assert.equal(fs.existsSync(path.join(tempHome, '.agentmem', 'install-state.json')), false);
    assert.equal(fs.existsSync(path.join(tempHome, '.agentmem', 'backups')), false);
  } finally {
    removeDir(tempHome);
  }
});
