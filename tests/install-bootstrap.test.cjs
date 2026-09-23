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
  renderAntigravityPluginMcpConfig,
  renderAntigravityPluginRule,
  renderOpenCodePlugin,
  resolveAntigravityConfigPath,
} = require('../dist/services/agent-installer.js');
const {
  ensureGrokConfigToml,
  hasGrokGlobalRules,
  mergeGrokGlobalRules,
  removeGrokAgentMemoryConfig,
  removeGrokGlobalRules,
  renderGrokAgentProfile,
  renderGrokGlobalRules,
  renderGrokHooksConfig,
} = require('../dist/services/grok-installer.js');
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

test('Grok config upsert preserves unrelated settings and enables the managed identity', () => {
  const original = `[cli]\ninstaller = "internal"\n\n[mcp_servers.agentmem]\ncommand = "node"\nargs = ["old-server.js"]\nenv = { AGENTMEM_AGENT_ID = "grok" }\n\n[mcp_servers.agentmem.env]\nAGENTMEM_AGENT_ID = "grok"\n\n[compat.claude]\nskills = true\nhooks = true\n\n[agent]\nmodel = "grok-build"\n`;
  const updated = ensureGrokConfigToml(
    original,
    'E:/Repo/AgentMemory/dist/servers/mcp-server.js'
  );

  assert.match(updated, /installer = "internal"/);
  assert.match(updated, /skills = true/);
  assert.match(updated, /hooks = false/);
  assert.match(updated, /name = "agentmem"/);
  assert.match(updated, /AGENTMEM_AGENT_ID = "grok"/);
  assert.equal((updated.match(/\[mcp_servers\.agentmem\]/g) || []).length, 1);
  assert.doesNotMatch(updated, /\[mcp_servers\.agentmem\.env\]/);
  assert.equal((updated.match(/AGENTMEM_AGENT_ID\s*=\s*"grok"/g) || []).length, 1);

  const cleaned = removeGrokAgentMemoryConfig(updated);
  assert.doesNotMatch(cleaned, /mcp_servers\.agentmem/);
  assert.doesNotMatch(cleaned, /mcp_servers\.agentmem\.env/);
  assert.doesNotMatch(cleaned, /name = "agentmem"/);
  assert.match(cleaned, /hooks = true/);
  assert.match(cleaned, /skills = true/);
  assert.match(cleaned, /model = "grok-build"/);
});

test('Grok profile and hooks provide lifecycle recovery without global AGENTS dependency', () => {
  const profile = renderGrokAgentProfile();
  const rules = renderGrokGlobalRules();
  const hooks = renderGrokHooksConfig('E:/Repo/AgentMemory/dist/hooks/grok-hook.js');

  assert.match(profile, /agents_md: false/);
  assert.match(profile, /get_project_context/);
  assert.match(profile, /AgentMemory Grok Profile/);
  assert.match(rules, /AgentMemory Grok Rules/);
  assert.doesNotMatch(rules, /obsiguide\.md/);
  assert.doesNotMatch(rules, /E:\\Kuan\\Vault/);
  assert.equal(hasGrokGlobalRules(rules), true);
  assert.match(hooks, /SessionStart/);
  assert.match(hooks, /PostToolUseFailure/);
  assert.match(hooks, /SessionEnd/);
  assert.match(hooks, /grok-hook\.js/);
});

test('Grok global rules merge into and remove from an existing user rules file', () => {
  const original = '# User Grok Rules\n\nKeep the Acme workflow enabled.\n';
  const merged = mergeGrokGlobalRules(original);
  const twice = mergeGrokGlobalRules(merged);

  assert.match(merged, /# User Grok Rules/);
  assert.match(merged, /AgentMemory Grok Vault Rules: START/);
  assert.equal(twice, merged);
  assert.equal(removeGrokGlobalRules(`${merged}\n# User addition\n`), `${original.trimEnd()}\n\n# User addition`);
});

test('Grok config cleanup preserves a user-owned hooks false setting', () => {
  const original = '[compat.claude]\nhooks = false\n';
  const updated = ensureGrokConfigToml(original, 'E:/Repo/AgentMemory/dist/servers/mcp-server.js');
  const cleaned = removeGrokAgentMemoryConfig(`${updated}\n[custom]\nflag = true\n`);

  assert.match(cleaned, /hooks = false/);
  assert.match(cleaned, /\[custom\]/);
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
  const pluginMcp = JSON.parse(
    renderAntigravityPluginMcpConfig('E:/Repo/AgentMemory/dist/servers/mcp-server.js')
  );
  const rule = renderAntigravityPluginRule();
  assert.equal(manifest.name, 'agentmem');
  assert.match(String(manifest.description || ''), /AgentMemory/);
  assert.match(hooks, /PreInvocation/);
  assert.match(hooks, /PostToolUse/);
  assert.match(hooks, /Stop/);
  assert.match(hooks, /antigravity-hook\.js/);
  assert.equal(pluginMcp.mcpServers.agentmem.env.AGENTMEM_AGENT_ID, 'antigravity');
  assert.match(rule, /^---\nname: agentmem\n/);
  assert.match(rule, /trigger: always_on/);
});

test('renderAntigravityGuidance keeps AgentMemory recovery narrow and evidence-backed', () => {
  const guidance = renderAntigravityGuidance();

  assert.doesNotMatch(guidance, /obsiguide\.md/);
  assert.doesNotMatch(guidance, /E:\\Kuan\\Vault/);
  assert.match(guidance, /unverified working memory/);
  assert.match(guidance, /record_memory/);
  assert.match(guidance, /trivial output/);
  assert.match(guidance, /Never treat raw AgentMemory summaries/);
});

test('resolveAntigravityConfigPath prefers the official Antigravity global registry', () => {
  const tempHome = makeTempHome();

  try {
    const officialConfigPath = path.join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const cliConfigPath = path.join(tempHome, '.gemini', 'antigravity-cli', 'mcp_config.json');
    fs.mkdirSync(path.dirname(officialConfigPath), { recursive: true });
    fs.mkdirSync(path.dirname(cliConfigPath), { recursive: true });
    fs.writeFileSync(officialConfigPath, '{"mcpServers":{}}\n', 'utf8');
    fs.writeFileSync(cliConfigPath, '{"mcpServers":{}}\n', 'utf8');

    assert.equal(resolveAntigravityConfigPath(tempHome), officialConfigPath);
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

    const officialConfig = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.gemini', 'config', 'mcp_config.json'), 'utf8')
    );
    assert.deepEqual(officialConfig.mcpServers.agentmem, {
      command: 'node',
      args: ['E:/Kuan/Projects/Codex/AgentMemory/dist/servers/mcp-server.js'],
      env: { AGENTMEM_AGENT_ID: 'antigravity' },
      disabled: false,
    });

    const guidancePath = path.join(tempHome, '.agentmem', 'AGENTMEM_ANTIGRAVITY.md');
    assert.equal(fs.existsSync(guidancePath), true);
    const guidanceText = fs.readFileSync(guidancePath, 'utf8');
    assert.doesNotMatch(guidanceText, /obsiguide\.md/);
    assert.match(guidanceText, /unverified working memory/);
    assert.match(guidanceText, /Treat all AgentMemory results as unverified working memory/);
    assert.match(guidanceText, /Never treat raw AgentMemory summaries/);

    const pluginRoot = path.join(tempHome, '.agentmem', 'antigravity-plugins');
    const pluginDir = path.join(pluginRoot, 'agentmem');
    const pluginsConfigPath = path.join(tempHome, '.gemini', 'config', 'plugins.json');
    assert.equal(fs.existsSync(pluginsConfigPath), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8')).name,
      'agentmem'
    );
    const hooksText = fs.readFileSync(path.join(pluginDir, 'hooks.json'), 'utf8');
    assert.match(hooksText, /PreInvocation/);
    assert.match(hooksText, /PostToolUse/);
    assert.match(hooksText, /Stop/);
    assert.match(hooksText, /antigravity-hook\.js/);
    assert.match(
      fs.readFileSync(path.join(pluginDir, 'mcp_config.json'), 'utf8'),
      /AGENTMEM_AGENT_ID/
    );
    assert.match(
      fs.readFileSync(path.join(pluginDir, 'rules', 'agentmem.md'), 'utf8'),
      /^---\r?\nname: agentmem/
    );
    assert.match(
      fs.readFileSync(path.join(pluginDir, 'rules', 'agentmem.md'), 'utf8'),
      /agent_id: "antigravity"/
    );
  } finally {
    removeDir(tempHome);
  }
});

test('repeated install removes an empty Antigravity plugins registry previously managed by AgentMemory', async () => {
  const tempHome = makeTempHome();

  try {
    const pluginsConfigPath = path.join(tempHome, '.gemini', 'config', 'plugins.json');
    const pluginRoot = path.join(tempHome, '.agentmem', 'antigravity-plugins').replace(/\\/g, '/');
    fs.mkdirSync(path.dirname(pluginsConfigPath), { recursive: true });
    fs.writeFileSync(
      pluginsConfigPath,
      `${JSON.stringify({ entries: [{ path: pluginRoot }] }, null, 2)}\n`,
      'utf8'
    );

    await runCli(tempHome, ['install']);
    assert.equal(fs.existsSync(pluginsConfigPath), false);

    fs.writeFileSync(pluginsConfigPath, '{}\n', 'utf8');
    await runCli(tempHome, ['install']);
    assert.equal(fs.existsSync(pluginsConfigPath), false);
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

test('agentmem install --strict creates the official Antigravity global registry when none exists', async () => {
  const tempHome = makeTempHome();

  try {
    const result = await runCli(tempHome, ['install', '--strict'], { allowFailure: true });

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    const officialConfig = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.gemini', 'config', 'mcp_config.json'), 'utf8')
    );
    assert.equal(officialConfig.mcpServers.agentmem.env.AGENTMEM_AGENT_ID, 'antigravity');
    assert.equal(fs.existsSync(path.join(tempHome, '.grok', 'AGENTS.md')), false);

    const repeated = await runCli(tempHome, ['install', '--strict'], { allowFailure: true });
    assert.equal(repeated.exitCode, 0, `${repeated.stdout}\n${repeated.stderr}`);
    assert.equal(fs.existsSync(path.join(tempHome, '.grok', 'AGENTS.md')), false);
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
