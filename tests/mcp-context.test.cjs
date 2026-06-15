const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');
const { renderProjectContextView } = require('../dist/services/context-view.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-mcp-context-test-${randomUUID()}.db`);
}

function makePort() {
  return 45000 + Math.floor(Math.random() * 1000);
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

async function seedProjectContext(db, projectPath) {
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: projectPath,
    agent_id: 'codex',
    title: 'Read README.md file',
    narrative: 'Low signal read event',
    facts: ['Read README.md'],
    concepts: ['context'],
    files_read: ['README.md'],
    files_modified: [],
    embedding: [0, 1, 0],
  });
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: projectPath,
    agent_id: 'codex',
    title: 'Implemented Antigravity startup helper',
    narrative: 'Added a new MCP helper for startup context.',
    facts: ['Added get_project_context'],
    concepts: ['mcp', 'startup'],
    files_read: ['src/servers/mcp-server.ts'],
    files_modified: ['src/servers/mcp-server.ts'],
    embedding: [1, 0, 0],
  });
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: projectPath,
    agent_id: 'codex',
    title: 'Implemented Antigravity startup helper',
    narrative: 'Duplicate high-signal title that should be collapsed.',
    facts: ['Duplicate title'],
    concepts: ['mcp', 'startup'],
    files_read: ['src/services/context-view.ts'],
    files_modified: ['src/services/context-view.ts'],
    embedding: [1, 0, 0],
  });
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: projectPath,
    agent_id: 'antigravity',
    title: 'Validated MCP-only startup path',
    narrative: 'Verified one-shot startup context retrieval.',
    facts: ['Validated helper output'],
    concepts: ['mcp', 'validation'],
    files_read: [],
    files_modified: ['README.md'],
    embedding: [1, 1, 0],
  });
  await db.saveStateFact({
    project_path: projectPath,
    fact_key: 'rollout_stage',
    value: 'phase2-antigravity-helper',
    effective_at: '2026-06-03T00:00:00.000Z',
  });
  await db.saveStateFact({
    project_path: projectPath,
    entity_type: 'agent',
    entity_key: 'antigravity',
    fact_key: 'startup_context_mode',
    value: 'mcp+get_project_context',
    effective_at: '2026-06-03T00:00:00.000Z',
  });
  await db.saveProceduralSkill({
    project_path: projectPath,
    title: 'Bootstrap workbench',
    summary: 'Reusable steps for bootstrapping the local workbench.',
    trigger_text: 'when the user asks how to bootstrap the workbench',
    steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
    tags: ['workbench', 'bootstrap'],
    status: 'enabled',
    confidence: 0.8,
    embedding: [1, 1, 0],
  });
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

async function startWorker(dbPath, port) {
  const child = spawn('node', ['dist/services/worker.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      AGENTMEM_DB_PATH: dbPath,
      AGENTMEM_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker did not start in time')), 10000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes(`AgentMemory worker service running on port ${port}`)) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited early with code ${code}`));
    });
  });

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
        } catch (_error) {
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

async function listTools(child, requestId) {
  const responsePromise = waitForResponse(child, requestId);
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    method: 'tools/list',
    params: {},
  }) + '\n');
  return responsePromise;
}

async function startDatabaseLockHolder(dbPath) {
  const code = `
const { Database } = require('node-sqlite3-wasm');
const db = new Database(${JSON.stringify(dbPath)});
db.run('CREATE TABLE IF NOT EXISTS lock_holder (id TEXT PRIMARY KEY)');
db.run('BEGIN EXCLUSIVE');
db.run("INSERT OR REPLACE INTO lock_holder (id) VALUES ('held')");
console.log('ready');
setInterval(() => {}, 1000);
process.on('SIGTERM', () => {
  try { db.run('ROLLBACK'); } catch (_error) {}
  db.close();
  process.exit(0);
});
`;
  const child = spawn('node', ['-e', code], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`DB lock holder did not start. STDERR: ${stderr}`)), 5000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`DB lock holder exited early with code ${code}. STDERR: ${stderr}`));
    });
  });

  return child;
}

async function stopMcpServer(child) {
  child.kill();
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => child.once('exit', resolve));
}

async function stopWorker(child, port) {
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST' });
  } catch (_error) {
    // Best effort shutdown.
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

test('MCP get_project_context renders the same curated structured context as /context', async () => {
  await withDatabase(async (db, dbPath) => {
    const port = makePort();
    const projectPath = 'E:/Repo/Antigravity';
    await seedProjectContext(db, projectPath);
    const worker = await startWorker(dbPath, port);
    const mcp = await startMcpServer(dbPath);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/context?project_path=${encodeURIComponent(projectPath)}&limit=10`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(
        payload.recent_observations.filter((entry) => entry.title === 'Implemented Antigravity startup helper').length,
        1
      );

      const rendered = renderProjectContextView(payload);
      const toolResponse = await callTool(mcp, 1, 'get_project_context', {
        project_path: projectPath,
        limit: 10,
      });
      const text = toolResponse.result.content[0].text;

      assert.equal(text, rendered);
      assert.match(text, /Current structured state:/);
      assert.match(text, /Procedural memory:/);
      assert.match(text, /Recent summary blocks:/);
      assert.match(text, /Recent observations:/);
      assert.match(text, /rollout_stage = phase2-antigravity-helper/);
      assert.match(text, /Bootstrap workbench/);
      assert.match(text, /Validated MCP-only startup path/);
      assert.doesNotMatch(text, /Read README\.md file/);
      assert.doesNotMatch(text, /Chronological timeline/);
      assert.doesNotMatch(text, /Use get_memory_details to view detailed narratives/);
      assert.ok(text.indexOf('Current structured state:') < text.indexOf('Recent summary blocks:'));
    } finally {
      await stopMcpServer(mcp);
      await stopWorker(worker, port);
    }
  });
});

test('MCP query_memory and list_procedural_skills expose the policy-driven path', async () => {
  await withDatabase(async (db, dbPath) => {
    const projectPath = 'E:/Repo/Antigravity';
    await seedProjectContext(db, projectPath);
    const mcp = await startMcpServer(dbPath);

    try {
      const queryToolResponse = await callTool(mcp, 200, 'query_memory', {
        project_path: projectPath,
        query: 'How do I bootstrap the workbench and what is the current rollout stage?',
        skill_limit: 3,
        limit: 5,
      });
      const queryText = queryToolResponse.result.content[0].text;
      assert.match(queryText, /Policy Resolution/);
      assert.match(queryText, /Bootstrap workbench/);
      assert.match(queryText, /Sliding window contract/);

      const listSkillsResponse = await callTool(mcp, 201, 'list_procedural_skills', {
        project_path: projectPath,
        status: 'enabled',
      });
      const listText = listSkillsResponse.result.content[0].text;
      assert.match(listText, /Skill: Bootstrap workbench/);
      assert.match(listText, /Status: enabled/);
    } finally {
      await stopMcpServer(mcp);
    }
  });
});

test('MCP server lists tools without opening the SQLite database while idle', async () => {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const holder = await startDatabaseLockHolder(dbPath);
  const mcp = await startMcpServer(dbPath);

  try {
    const response = await listTools(mcp, 100);
    const tools = response.result.tools.map((tool) => tool.name);

    assert.equal(tools.includes('get_project_context'), true);
    assert.equal(tools.includes('record_memory'), true);
  } finally {
    await stopMcpServer(mcp);
    await stopMcpServer(holder);
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
});

test('MCP get_project_context returns disabled and empty messages', async () => {
  await withDatabase(async (db, dbPath) => {
    const child = await startMcpServer(dbPath);

    try {
      const empty = await callTool(child, 2, 'get_project_context', {
        project_path: 'E:/Repo/Empty',
      });
      assert.match(empty.result.content[0].text, /No structured context recorded yet/i);
    } finally {
      await stopMcpServer(child);
    }

    await db.updateRuntimePolicy({ readEnabled: false, writeEnabled: true });
    const disabledChild = await startMcpServer(dbPath);

    try {
      const disabled = await callTool(disabledChild, 3, 'get_project_context', {
        project_path: 'E:/Repo/Empty',
      });
      assert.match(disabled.result.content[0].text, /Context Disabled/i);
      assert.match(disabled.result.content[0].text, /disabled/i);
    } finally {
      await stopMcpServer(disabledChild);
    }
  });
});
