const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-mcp-test-${randomUUID()}.db`);
}

async function withSeededDatabase(run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'Alpha memory',
      narrative: 'Seeded for MCP policy tests',
      facts: ['alpha'],
      concepts: ['mcp'],
      files_read: ['src/a.ts'],
      files_modified: ['src/a.ts'],
      embedding: [1, 0, 0],
    });
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

async function startMcpServer(dbPath, extraEnv = {}) {
  const child = spawn('node', ['dist/servers/mcp-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      AGENTMEM_DB_PATH: dbPath,
      ...extraEnv,
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

test('MCP read tools return a disabled message when read policy is off', async () => {
  await withSeededDatabase(async (db, dbPath) => {
    await db.updateRuntimePolicy({ readEnabled: false, writeEnabled: true });
    const child = await startMcpServer(dbPath);

    try {
      const response = await callTool(child, 1, 'search_memory', {
        query: 'Alpha',
        project_path: 'E:/Repo/A',
        limit: 5,
      });
      const text = response.result.content[0].text;
      assert.match(text, /disabled/i);
    } finally {
      await stopMcpServer(child);
    }
  });
});

test('MCP record_memory does not write when write policy is off', async () => {
  await withSeededDatabase(async (db, dbPath) => {
    await db.updateRuntimePolicy({ readEnabled: true, writeEnabled: false });
    const before = await db.listObservations({ page: 1, pageSize: 50 });
    const child = await startMcpServer(dbPath);

    try {
      const response = await callTool(child, 2, 'record_memory', {
        title: 'Should not persist',
        narrative: 'This write should be blocked by policy.',
        project_path: 'E:/Repo/A',
        agent_id: 'codex',
      });
      const text = response.result.content[0].text;
      assert.match(text, /disabled/i);
    } finally {
      await stopMcpServer(child);
    }

    process.env.AGENTMEM_DB_PATH = dbPath;
    const reopened = new DatabaseManager();
    await reopened.initialize();
    const after = await reopened.listObservations({ page: 1, pageSize: 50 });
    reopened.close();
    assert.equal(after.total, before.total);
  });
});

test('MCP record_memory inherits the configured client identity when agent_id is omitted', async () => {
  await withSeededDatabase(async (db, dbPath) => {
    const child = await startMcpServer(dbPath, { AGENTMEM_AGENT_ID: 'antigravity' });

    try {
      const response = await callTool(child, 3, 'record_memory', {
        title: 'Antigravity identity fallback test',
        narrative: 'The MCP client omitted agent_id and should inherit its configured identity.',
        project_path: 'E:/Repo/A',
      });
      assert.match(response.result.content[0].text, /successfully recorded/i);
    } finally {
      await stopMcpServer(child);
    }

    const records = await db.listObservations({
      agent: 'antigravity',
      query: 'Antigravity identity fallback test',
      page: 1,
      pageSize: 10,
    });
    assert.equal(records.total, 1);
    assert.equal(records.records[0].agent_id, 'antigravity');
  });
});
