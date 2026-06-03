const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-mcp-state-test-${randomUUID()}.db`);
}

async function withDatabase(run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await run(db, dbPath);
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.AGENTMEM_DB_PATH;
    } else {
      process.env.AGENTMEM_DB_PATH = previous;
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const target = `${dbPath}${suffix}`;
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    }
  }
}

async function startMcpServer(dbPath) {
  const child = spawn('node', ['dist/servers/mcp-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      AGENTMEM_DB_PATH: dbPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  await new Promise((resolve) => setTimeout(resolve, 600));
  return child;
}

function waitForResponse(child, id) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for MCP response ${id}. STDERR: ${stderr}`));
    }, 6000);

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            cleanup();
            resolve(parsed);
            return;
          }
        } catch (error) {
          // Ignore non-JSON lines.
        }
      }
    };

    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`MCP server exited early with code ${code}. STDERR: ${stderr}`));
    };

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

async function callTool(child, requestId, name, args) {
  const responsePromise = waitForResponse(child, requestId);
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  }) + '\n');
  return responsePromise;
}

async function stopMcpServer(child) {
  child.kill();
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => child.once('exit', resolve));
}

test('MCP state tools can write and read current and historical values', async () => {
  await withDatabase(async (_db, dbPath) => {
    const child = await startMcpServer(dbPath);

    try {
      const writeOne = await callTool(child, 1, 'set_memory_state', {
        project_path: 'E:/Repo/A',
        fact_key: 'user_budget',
        value: 50000,
        effective_at: '2026-01-01T00:00:00.000Z',
      });
      assert.match(writeOne.result.content[0].text, /recorded/i);

      const writeTwo = await callTool(child, 2, 'set_memory_state', {
        project_path: 'E:/Repo/A',
        fact_key: 'user_budget',
        value: 80000,
        effective_at: '2026-02-01T00:00:00.000Z',
      });
      assert.match(writeTwo.result.content[0].text, /recorded/i);

      const currentRead = await callTool(child, 3, 'get_memory_state', {
        project_path: 'E:/Repo/A',
      });
      assert.match(currentRead.result.content[0].text, /user_budget/i);
      assert.match(currentRead.result.content[0].text, /80000/);

      const historicalRead = await callTool(child, 4, 'get_memory_state', {
        project_path: 'E:/Repo/A',
        as_of: '2026-01-15T00:00:00.000Z',
      });
      assert.match(historicalRead.result.content[0].text, /50000/);
    } finally {
      await stopMcpServer(child);
    }
  });
});

test('MCP state tools honor read and write policy gates', async () => {
  await withDatabase(async (db, dbPath) => {
    await db.updateRuntimePolicy({ readEnabled: false, writeEnabled: false });
    const child = await startMcpServer(dbPath);

    try {
      const blockedRead = await callTool(child, 5, 'get_memory_state', {
        project_path: 'E:/Repo/A',
      });
      assert.match(blockedRead.result.content[0].text, /disabled/i);

      const blockedWrite = await callTool(child, 6, 'set_memory_state', {
        project_path: 'E:/Repo/A',
        fact_key: 'status',
        value: 'red',
      });
      assert.match(blockedWrite.result.content[0].text, /disabled/i);
    } finally {
      await stopMcpServer(child);
    }
  });
});
