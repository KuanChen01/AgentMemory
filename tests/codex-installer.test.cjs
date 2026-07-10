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
  ensureCodexHooksEnabled,
  ensureCodexMcpServer,
  removeCodexMcpServer,
  updateCodexConfigToml,
} = require('../dist/services/codex-installer.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-codex-install-${randomUUID()}-`));
}

function removeDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function makeCliEnv(tempHome) {
  const parsed = path.parse(tempHome);
  const homedrive = parsed.root.replace(/[\\\/]+$/, '');
  const homepath = tempHome.slice(parsed.root.length - 1);

  return {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
    HOMEDRIVE: homedrive,
    HOMEPATH: homepath,
  };
}

async function runInstall(tempHome) {
  const child = spawn('node', [cliPath, 'install'], {
    cwd: projectRoot,
    env: makeCliEnv(tempHome),
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

  if (exitCode !== 0) {
    throw new Error(`agentmem install exited with code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { stdout, stderr };
}

test('ensureCodexHooksEnabled replaces hooks assignment without dropping other feature keys', () => {
  const original = `[features]
hooks = false
model = "gpt-5"
codex_hooks = true
`;

  const updated = ensureCodexHooksEnabled(original);

  assert.match(updated, /\[features\]/);
  assert.equal(countMatches(updated, /^\s*hooks\s*=/gm), 1);
  assert.match(updated, /^\s*hooks\s*=\s*true$/m);
  assert.doesNotMatch(updated, /^\s*hooks\s*=\s*false$/m);
  assert.match(updated, /^\s*model\s*=\s*"gpt-5"$/m);
  assert.doesNotMatch(updated, /^\s*codex_hooks\s*=/m);
});

test('ensureCodexMcpServer upserts a single mcp_servers.agentmem table', () => {
  const original = `[mcp_servers.agentmem]
command = "node"
args = ["old/path.js"]

[mcp_servers.other]
command = "python"
`;

  const updated = ensureCodexMcpServer(original, 'E:/Repo/AgentMemory/dist/servers/mcp-server.js');

  assert.equal(countMatches(updated, /^\[mcp_servers\.agentmem\]$/gm), 1);
  assert.match(updated, /^\[mcp_servers\.agentmem\]\ncommand = "node"\nargs = \[ "E:\/Repo\/AgentMemory\/dist\/servers\/mcp-server\.js" \]$/m);
  assert.match(updated, /^\[mcp_servers\.other\]$/m);
});

test('removeCodexMcpServer strips only the agentmem MCP section', () => {
  const original = `[features]
hooks = true
model = "gpt-5"

[mcp_servers.agentmem]
command = "node"
args = ["E:/Repo/AgentMemory/dist/servers/mcp-server.js"]

[mcp_servers.other]
command = "python"
args = ["server.py"]
`;

  const updated = removeCodexMcpServer(original);

  assert.doesNotMatch(updated, /^\[mcp_servers\.agentmem\]$/m);
  assert.match(updated, /^\[mcp_servers\.other\]$/m);
  assert.match(updated, /^\s*hooks\s*=\s*true$/m);
  assert.match(updated, /^\s*model\s*=\s*"gpt-5"$/m);
});

test('updateCodexConfigToml is idempotent across repeated runs', () => {
  const original = `[features]
hooks = false
model = "gpt-5"
`;

  const once = updateCodexConfigToml(original, 'E:/Repo/AgentMemory/dist/servers/mcp-server.js');
  const twice = updateCodexConfigToml(once, 'E:/Repo/AgentMemory/dist/servers/mcp-server.js');

  assert.equal(twice, once);
  assert.equal(countMatches(twice, /^\s*hooks\s*=/gm), 1);
  assert.equal(countMatches(twice, /^\[mcp_servers\.agentmem\]$/gm), 1);
});

test('agentmem install creates fresh Codex config.toml and hooks.json', async () => {
  const tempHome = makeTempHome();

  try {
    const { stdout } = await runInstall(tempHome);

    assert.match(stdout, /ChatGPT desktop \(Codex runtime\)/);

    const configPath = path.join(tempHome, '.codex', 'config.toml');
    const hooksPath = path.join(tempHome, '.codex', 'hooks.json');

    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(hooksPath), true);

    const toml = fs.readFileSync(configPath, 'utf8');
    assert.match(toml, /\[features\]/);
    assert.match(toml, /^\s*hooks\s*=\s*true$/m);
    assert.match(toml, /^\[mcp_servers\.agentmem\]$/m);
    assert.match(toml, /^\s*command\s*=\s*"node"$/m);
    assert.match(toml, /dist\/servers\/mcp-server\.js/);

    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.equal(hooks.hooks.SessionStart[0].hooks[0].command.includes('codex-session-start.js'), true);
    assert.equal(hooks.hooks.PostToolUse[0].hooks[0].command.includes('codex-post-tool.js'), true);
  } finally {
    removeDir(tempHome);
  }
});

test('agentmem install rewrites existing Codex config without duplicate hooks or mcp tables', async () => {
  const tempHome = makeTempHome();

  try {
    const codexDir = path.join(tempHome, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');

    fs.writeFileSync(
      configPath,
      `[features]
hooks = false
model = "gpt-5"

[mcp_servers.agentmem]
command = "node"
args = ["old/path.js"]
`,
      'utf8'
    );

    await runInstall(tempHome);
    const once = fs.readFileSync(configPath, 'utf8');

    await runInstall(tempHome);
    const twice = fs.readFileSync(configPath, 'utf8');

    assert.equal(twice, once);
    assert.equal(countMatches(twice, /^\s*hooks\s*=/gm), 1);
    assert.match(twice, /^\s*hooks\s*=\s*true$/m);
    assert.doesNotMatch(twice, /^\s*hooks\s*=\s*false$/m);
    assert.match(twice, /^\s*model\s*=\s*"gpt-5"$/m);
    assert.equal(countMatches(twice, /^\[mcp_servers\.agentmem\]$/gm), 1);
    assert.match(twice, /dist\/servers\/mcp-server\.js/);
  } finally {
    removeDir(tempHome);
  }
});
