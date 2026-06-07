const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const http = require('node:http');

const projectRoot = path.resolve(__dirname, '..');
const powerShellScriptPath = path.join(projectRoot, 'scripts', 'start-workbench.ps1');
const cmdPath = path.join(projectRoot, 'start-workbench.cmd');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-workbench-${randomUUID()}-`));
}

function removeDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function makeProcessEnv(tempHome) {
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

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function runPowerShell(args, options = {}) {
  const child = spawn(
    'pwsh',
    ['-ExecutionPolicy', 'Bypass', '-File', powerShellScriptPath, ...args],
    {
      cwd: projectRoot,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  if (options.stdin) {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });

  if (!options.allowFailure && exitCode !== 0) {
    throw new Error(`PowerShell exited with code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { exitCode, stdout, stderr };
}

async function runCmd(args, options = {}) {
  const child = spawn('cmd', ['/c', cmdPath, ...args], {
    cwd: projectRoot,
    env: options.env || process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  if (options.stdin) {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });

  if (!options.allowFailure && exitCode !== 0) {
    throw new Error(`cmd exited with code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { exitCode, stdout, stderr };
}

function createReusableOverviewPayload() {
  return JSON.stringify({
    policy: { readEnabled: true, writeEnabled: true, updatedAt: '2026-06-03 12:00:00' },
    stats: {
      observations: 2,
      sessions: 1,
      projects: 1,
      agents: 1,
      currentStateFacts: 1,
    },
    projects: ['E:/Repo/A'],
    agents: ['codex'],
  });
}

test('workbench PowerShell script reports status for an inactive port', async () => {
  const port = await findFreePort();
  const result = await runPowerShell(['-Action', 'status', '-Port', String(port)]);

  assert.equal(result.stdout.includes('AgentMemory Workbench 状态'), true);
  assert.equal(result.stdout.includes('State : INACTIVE'), true);
  assert.equal(result.stdout.includes(`Port  : ${port}`), true);
});

test('workbench PowerShell script no-ops when start is requested on an active port', async () => {
  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(createReusableOverviewPayload());
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const result = await runPowerShell(['-Action', 'start', '-Port', String(port), '-NoOpen']);
    assert.equal(result.stdout.includes('State : ACTIVE'), true);
    assert.equal(result.stdout.includes('当前已启动'), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('workbench PowerShell script no-ops when stop is requested on an inactive port', async () => {
  const port = await findFreePort();
  const result = await runPowerShell(['-Action', 'stop', '-Port', String(port)]);

  assert.equal(result.stdout.includes('State : INACTIVE'), true);
  assert.equal(result.stdout.includes('当前已停止'), true);
});

test('workbench PowerShell script reports inactive open-admin without launching anything', async () => {
  const port = await findFreePort();
  const result = await runPowerShell(['-Action', 'open-admin', '-Port', String(port)]);

  assert.equal(result.stdout.includes('State : INACTIVE'), true);
  assert.equal(result.stdout.includes('当前未启动，未打开 /admin。'), true);
});

test('start-workbench.cmd dispatches status mode and forwards --port', async () => {
  const port = await findFreePort();
  const result = await runCmd(['status', '--port', String(port)]);

  assert.equal(result.stdout.includes('AgentMemory Workbench 状态'), true);
  assert.equal(result.stdout.includes(`Port  : ${port}`), true);
});

test('workbench orchestration smoke covers start, status, restart, and stop on a temp HOME', async () => {
  const tempHome = makeTempHome();
  const env = makeProcessEnv(tempHome);
  const port = await findFreePort();

  try {
    const startResult = await runPowerShell(['-Action', 'start', '-Port', String(port), '-NoOpen'], { env });
    assert.equal(startResult.stdout.includes('已启动 workbench。'), true);
    assert.equal(startResult.stdout.includes('State : ACTIVE'), true);

    const statusResult = await runPowerShell(['-Action', 'status', '-Port', String(port)], { env });
    assert.equal(statusResult.stdout.includes('State : ACTIVE'), true);

    const restartResult = await runPowerShell(['-Action', 'restart', '-Port', String(port), '-NoOpen'], { env });
    assert.equal(restartResult.stdout.includes('已重启 workbench。'), true);
    assert.equal(restartResult.stdout.includes('State : ACTIVE'), true);

    const stopResult = await runPowerShell(['-Action', 'stop', '-Port', String(port)], { env });
    assert.equal(stopResult.stdout.includes('已停止 workbench。'), true);
    assert.equal(stopResult.stdout.includes('State : INACTIVE'), true);
  } finally {
    await runPowerShell(['-Action', 'stop', '-Port', String(port)], { env, allowFailure: true });
    removeDir(tempHome);
  }
});
