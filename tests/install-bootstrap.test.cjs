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
  ensureAntigravityPluginsConfig,
  ensureAntigravityMcpServer,
  renderAntigravityGuidance,
  renderAntigravityPluginHooks,
  renderAntigravityPluginManifest,
  renderOpenCodePlugin,
  resolveAntigravityConfigPath,
} = require('../dist/services/agent-installer.js');
const { ensureBootstrapEnvFile } = require('../dist/services/bootstrap.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-bootstrap-${randomUUID()}-`));
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

test('renderOpenCodePlugin delegates to the built hook scripts', () => {
  const plugin = renderOpenCodePlugin({
    startHookPath: 'E:/Repo/AgentMemory/dist/hooks/opencode-session-start.js',
    postHookPath: 'E:/Repo/AgentMemory/dist/hooks/opencode-post-tool.js',
  });

  assert.match(plugin, /opencode-session-start\.js/);
  assert.match(plugin, /opencode-post-tool\.js/);
  assert.match(plugin, /spawn/);
  assert.match(plugin, /child\.stdin\.write/);
});

test('ensureAntigravityMcpServer upserts a single mcpServers.agentmem entry', () => {
  const original = JSON.stringify(
    {
      mcpServers: {
        other: {
          command: 'python',
          args: ['server.py'],
          disabled: false,
        },
        agentmem: {
          command: 'node',
          args: ['old/path.js'],
          disabled: true,
        },
        agentvault: {
          command: 'node',
          args: ['E:/Repo/AgentVault/dist/servers/mcp-server.js'],
        },
      },
    },
    null,
    2
  );

  const updated = ensureAntigravityMcpServer(
    original,
    'E:/Repo/AgentMemory/dist/servers/mcp-server.js'
  );

  const parsed = JSON.parse(updated);
  assert.deepEqual(parsed.mcpServers.agentmem, {
    command: 'node',
    args: ['E:/Repo/AgentMemory/dist/servers/mcp-server.js'],
    env: { AGENTMEM_AGENT_ID: 'antigravity' },
    disabled: false,
  });
  assert.equal(parsed.mcpServers.agentvault, undefined);
  assert.deepEqual(parsed.mcpServers.other, {
    command: 'python',
    args: ['server.py'],
    disabled: false,
  });
});

test('ensureAntigravityPluginsConfig registers one AgentMemory plugin root', () => {
  const pluginRoot = 'C:/Users/Test/.agentmem/antigravity-plugins';
  const original = JSON.stringify({
    entries: [
      { path: 'C:/custom/plugins' },
      { path: pluginRoot },
    ],
  });
  const parsed = JSON.parse(ensureAntigravityPluginsConfig(original, pluginRoot));
  assert.deepEqual(parsed.entries, [
    { path: 'C:/custom/plugins' },
    { path: pluginRoot },
  ]);
});

test('renderAntigravity plugin artifacts wire lifecycle hooks to the built bridge', () => {
  const manifest = JSON.parse(renderAntigravityPluginManifest());
  const hooks = renderAntigravityPluginHooks(
    'E:/Repo/AgentMemory/dist/hooks/antigravity-hook.js'
  );
  assert.equal(manifest.name, 'agentmem');
  assert.match(hooks, /PreInvocation/);
  assert.match(hooks, /PostToolUse/);
  assert.match(hooks, /Stop/);
  assert.match(hooks, /antigravity-hook\.js/);
});

test('renderAntigravityGuidance separates obsiguide, vault, and agentmem boundaries', () => {
  const guidance = renderAntigravityGuidance();

  assert.match(guidance, /obsiguide\.md/);
  assert.match(guidance, /obsiguide\.template\.md/);
  assert.match(guidance, /unverified working memory/);
  assert.match(guidance, /E:\\Kuan\\Vault/);
  assert.match(guidance, /record_memory/);
  assert.match(guidance, /local-only/);
  assert.match(guidance, /Never copy raw AgentMemory summaries/);
});

test('resolveAntigravityConfigPath prefers the Antigravity CLI registry', () => {
  const tempHome = makeTempHome();

  try {
    const cliConfigPath = path.join(tempHome, '.gemini', 'antigravity-cli', 'mcp_config.json');
    const pluginConfigPath = path.join(
      tempHome,
      '.gemini',
      'config',
      'plugins',
      'local-game-mcps',
      'mcp_config.json'
    );
    fs.mkdirSync(path.dirname(cliConfigPath), { recursive: true });
    fs.mkdirSync(path.dirname(pluginConfigPath), { recursive: true });
    fs.writeFileSync(cliConfigPath, '{"mcpServers":{}}\n', 'utf8');
    fs.writeFileSync(pluginConfigPath, '{"mcpServers":{}}\n', 'utf8');

    assert.equal(resolveAntigravityConfigPath(tempHome), cliConfigPath);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem install creates the OpenCode plugin and configures Antigravity when a registry exists', async () => {
  const tempHome = makeTempHome();

  try {
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

    await runCli(tempHome, ['install']);

    const pluginPath = path.join(
      tempHome,
      '.config',
      'opencode',
      'plugins',
      'agentmem-plugin.mjs'
    );
    assert.equal(fs.existsSync(pluginPath), true);

    const pluginText = fs.readFileSync(pluginPath, 'utf8');
    assert.match(pluginText, /opencode-session-start\.js/);
    assert.match(pluginText, /opencode-post-tool\.js/);

    const antigravityConfig = JSON.parse(fs.readFileSync(antigravityConfigPath, 'utf8'));
    assert.deepEqual(antigravityConfig.mcpServers.agentmem, {
      command: 'node',
      args: ['E:/Kuan/Projects/Codex/AgentMemory/dist/servers/mcp-server.js'],
      env: { AGENTMEM_AGENT_ID: 'antigravity' },
      disabled: false,
    });

    const guidancePath = path.join(tempHome, '.agentmem', 'AGENTMEM_ANTIGRAVITY.md');
    assert.equal(fs.existsSync(guidancePath), true);
    const guidanceText = fs.readFileSync(guidancePath, 'utf8');
    assert.match(guidanceText, /Before normal repo work, read the current workspace root `obsiguide\.md`/);
    assert.match(guidanceText, /Treat all AgentMemory results as unverified working memory/);
    assert.match(guidanceText, /Never copy raw AgentMemory summaries/);

    const pluginRoot = path.join(tempHome, '.agentmem', 'antigravity-plugins');
    const pluginDir = path.join(pluginRoot, 'agentmem');
    const pluginsConfig = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.gemini', 'config', 'plugins.json'), 'utf8')
    );
    assert.deepEqual(pluginsConfig.entries, [{ path: pluginRoot.replace(/\\/g, '/') }]);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8')),
      { name: 'agentmem' }
    );
    const hooksText = fs.readFileSync(path.join(pluginDir, 'hooks.json'), 'utf8');
    assert.match(hooksText, /PreInvocation/);
    assert.match(hooksText, /PostToolUse/);
    assert.match(hooksText, /Stop/);
    assert.match(hooksText, /antigravity-hook\.js/);
    assert.match(
      fs.readFileSync(path.join(pluginDir, 'rules', 'agentmem.md'), 'utf8'),
      /agent_id: "antigravity"/
    );
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem install migrates stale Antigravity CLI agentvault registry', async () => {
  const tempHome = makeTempHome();

  try {
    const antigravityConfigPath = path.join(
      tempHome,
      '.gemini',
      'antigravity-cli',
      'mcp_config.json'
    );
    fs.mkdirSync(path.dirname(antigravityConfigPath), { recursive: true });
    fs.writeFileSync(
      antigravityConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            agentvault: {
              command: 'node',
              args: ['E:/Kuan/Projects/Codex/AgentVault/dist/servers/mcp-server.js'],
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    await runCli(tempHome, ['install', '--strict']);

    const antigravityConfig = JSON.parse(fs.readFileSync(antigravityConfigPath, 'utf8'));
    assert.equal(antigravityConfig.mcpServers.agentvault, undefined);
    assert.deepEqual(antigravityConfig.mcpServers.agentmem, {
      command: 'node',
      args: ['E:/Kuan/Projects/Codex/AgentMemory/dist/servers/mcp-server.js'],
      env: { AGENTMEM_AGENT_ID: 'antigravity' },
      disabled: false,
    });
    assert.equal(
      fs.existsSync(path.join(tempHome, '.agentmem', 'AGENTMEM_ANTIGRAVITY.md')),
      true
    );
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem install --strict fails when no Antigravity registry can be found', async () => {
  const tempHome = makeTempHome();

  try {
    const result = await runCli(tempHome, ['install', '--strict'], { allowFailure: true });

    assert.notEqual(result.exitCode, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Antigravity/i);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem bootstrap-win scaffolds a blank env file and stops before install when credentials are missing', async () => {
  const tempHome = makeTempHome();

  try {
    const result = await runCli(tempHome, ['bootstrap-win', '--no-open'], { allowFailure: true });

    assert.notEqual(result.exitCode, 0);
    const envPath = path.join(tempHome, '.agentmem', '.env');
    assert.equal(fs.existsSync(envPath), true);
    const envText = fs.readFileSync(envPath, 'utf8');
    assert.match(envText, /^AGENTMEM_LLM_API_KEY=$/m);
    assert.match(`${result.stdout}\n${result.stderr}`, /fill/i);
  } finally {
    removeDir(tempHome);
  }
});

test('ensureBootstrapEnvFile accepts legacy DeepSeek keys by migrating them into AGENTMEM_LLM_* values', () => {
  const tempHome = makeTempHome();

  try {
    const envDir = path.join(tempHome, '.agentmem');
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, '.env'),
      [
        'DEEPSEEK_API_KEY=legacy-key',
        'DEEPSEEK_API_URL=https://api.deepseek.com/v1',
      ].join('\n'),
      'utf8'
    );

    const result = ensureBootstrapEnvFile(tempHome);
    assert.equal(result.ready, true);

    const envText = fs.readFileSync(path.join(envDir, '.env'), 'utf8');
    assert.match(envText, /AGENTMEM_LLM_API_KEY=legacy-key/);
    assert.match(envText, /AGENTMEM_LLM_API_URL=https:\/\/api\.deepseek\.com\/v1/);
    assert.match(envText, /AGENTMEM_LLM_MODEL=deepseek-chat/);
  } finally {
    removeDir(tempHome);
  }
});
