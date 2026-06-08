const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-context-test-${randomUUID()}.db`);
}

function makePort() {
  return 44000 + Math.floor(Math.random() * 1000);
}

async function seedDatabase(dbPath, projectPath) {
  const previous = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: projectPath,
      agent_id: 'codex',
      title: 'Read README.md file',
      narrative: 'Low signal read event',
      facts: ['Read file README.md'],
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
      title: 'Checked git status',
      narrative: 'Low signal status event',
      facts: ['Working tree checked'],
      concepts: ['context'],
      files_read: [],
      files_modified: [],
      embedding: [0, 1, 0],
    });
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: projectPath,
      agent_id: 'codex',
      title: 'Alpha memory',
      narrative: 'First memory for context view testing',
      facts: ['Alpha fact', 'Budget was updated'],
      concepts: ['context'],
      files_read: ['src/a.ts'],
      files_modified: ['src/a.ts'],
      embedding: [1, 0, 0],
    });
    await db.saveStateFact({
      project_path: projectPath,
      fact_key: 'user_budget',
      value: 80000,
      effective_at: '2026-02-01T00:00:00.000Z',
    });
    await db.saveStateFact({
      project_path: projectPath,
      entity_type: 'service',
      entity_key: 'worker',
      fact_key: 'port',
      value: 38888,
      effective_at: '2026-02-01T00:00:00.000Z',
    });
    await db.saveDailyMemoryDigest({
      project_path: projectPath,
      local_date: '2026-06-08',
      status: 'success',
      digest: {
        summary: 'Daily digest service was implemented.',
        facts: ['Digest fact'],
        decisions: ['Original observations remain append-only.'],
        verified_commands: ['node --test tests/context-worker.test.cjs'],
        open_questions: [],
        next_actions: ['Review digest candidates in admin.'],
        state_fact_candidates: [],
        skill_candidates: [],
        low_signal_patterns: [],
        confidence: 0.9,
      },
      source_observation_ids: ['digest-source-1'],
      source_count: 1,
      model: 'mock',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-08T23:50:00.000Z',
    });
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.AGENTMEM_DB_PATH;
    } else {
      process.env.AGENTMEM_DB_PATH = previous;
    }
  }
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

async function stopWorker(child, port) {
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST' });
  } catch (error) {
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

function cleanupDb(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }
}

async function runHook(scriptName, projectPath, port) {
  const scriptPath = path.resolve(__dirname, '..', 'dist', 'hooks', scriptName);
  const child = spawn('node', [scriptPath], {
    cwd: projectPath,
    env: {
      ...process.env,
      AGENTMEM_PORT: String(port),
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

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Hook ${scriptName} timed out. STDERR: ${stderr}`));
    }, 10000);

    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Hook ${scriptName} exited with code ${code}. STDERR: ${stderr}`));
      }
    });
  });

  return stdout;
}

test('worker context endpoint returns ProjectContextView and hooks render it', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const projectPath = path.join(os.tmpdir(), `agentmemory-project-${randomUUID()}`).replace(/\\/g, '/');
  fs.mkdirSync(projectPath, { recursive: true });
  await seedDatabase(dbPath, projectPath);
  const child = await startWorker(dbPath, port);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/context?project_path=${encodeURIComponent(projectPath)}&limit=5`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.project_path, projectPath);
    assert.ok(Array.isArray(payload.current_state));
    assert.ok(Array.isArray(payload.daily_digests));
    assert.ok(Array.isArray(payload.summary_blocks));
    assert.ok(Array.isArray(payload.recent_observations));
    assert.ok(payload.current_state.some((entry) => entry.fact_key === 'user_budget' && entry.value === 80000));
    assert.equal(payload.daily_digests[0].summary, 'Daily digest service was implemented.');
    assert.ok(payload.summary_blocks.length > 0);
    assert.equal(payload.recent_observations[0].title, 'Alpha memory');
    assert.equal(payload.recent_observations[0].embedding, undefined);
    assert.ok(payload.summary_blocks.every((entry) => entry.title !== 'Read README.md file'));
    assert.ok(payload.summary_blocks.every((entry) => entry.title !== 'Checked git status'));

    for (const scriptName of ['claude-session-start.js', 'codex-session-start.js', 'opencode-session-start.js']) {
      const output = await runHook(scriptName, projectPath, port);
      assert.match(output, /Current structured state/i);
      assert.match(output, /Recent daily digests/i);
      assert.match(output, /user_budget/);
      assert.match(output, /Daily digest service was implemented/);
      assert.match(output, /Alpha memory/);
      assert.doesNotMatch(output, /Read README\.md file/);
      assert.doesNotMatch(output, /Checked git status/);
    }
  } finally {
    await stopWorker(child, port);
    cleanupDb(dbPath);
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test('worker state endpoints obey runtime policy gates', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const projectPath = 'E:/Repo/Policy';
  await seedDatabase(dbPath, projectPath);
  const child = await startWorker(dbPath, port);

  try {
    const createState = await fetch(`http://127.0.0.1:${port}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: projectPath,
        fact_key: 'status',
        value: 'green',
      }),
    });
    assert.equal(createState.status, 200);
    const createPayload = await createState.json();
    assert.equal(createPayload.fact.fact_key, 'status');
    assert.equal(createPayload.fact.value, 'green');

    const currentState = await fetch(`http://127.0.0.1:${port}/state?project_path=${encodeURIComponent(projectPath)}`);
    assert.equal(currentState.status, 200);
    const currentPayload = await currentState.json();
    assert.ok(currentPayload.facts.some((fact) => fact.fact_key === 'status' && fact.value === 'green'));

    await fetch(`http://127.0.0.1:${port}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false, writeEnabled: false }),
    });

    const blockedContext = await fetch(`http://127.0.0.1:${port}/context?project_path=${encodeURIComponent(projectPath)}&limit=5`);
    const blockedContextPayload = await blockedContext.json();
    assert.equal(blockedContextPayload.disabled, true);
    assert.deepEqual(blockedContextPayload.current_state, []);

    const blockedStateRead = await fetch(`http://127.0.0.1:${port}/state?project_path=${encodeURIComponent(projectPath)}`);
    const blockedStateReadPayload = await blockedStateRead.json();
    assert.equal(blockedStateReadPayload.disabled, true);

    const blockedStateWrite = await fetch(`http://127.0.0.1:${port}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: projectPath,
        fact_key: 'status',
        value: 'red',
      }),
    });
    const blockedStateWritePayload = await blockedStateWrite.json();
    assert.equal(blockedStateWritePayload.disabled, true);
    assert.equal(blockedStateWritePayload.success, false);
  } finally {
    await stopWorker(child, port);
    cleanupDb(dbPath);
  }
});
