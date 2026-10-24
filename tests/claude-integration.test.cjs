const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');
const { extractCjkBigrams } = require('../dist/services/cjk.js');
const { getLocalHashingEmbedding } = require('../dist/services/embedding.js');
const {
  createProjectContextView,
  renderCompactProjectContextView,
  renderProjectContextView,
} = require('../dist/services/context-view.js');

const projectRoot = path.resolve(__dirname, '..');
// Absolute on every platform so searchHybrid's path.resolve() normalisation matches the stored path.
const TEST_PROJECT = path.resolve(os.tmpdir(), 'agentmemory-claude-repo-a').replace(/\\/g, '/');
const cliPath = path.join(projectRoot, 'dist', 'bin', 'cli.js');

async function withDatabase(run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = path.join(os.tmpdir(), `agentmemory-claude-test-${randomUUID()}.db`);
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();
  try {
    await db.initialize();
    await run(db);
  } finally {
    db.close();
    if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
    else process.env.AGENTMEM_DB_PATH = previous;
    for (const suffix of ['', '-shm', '-wal']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }
}

async function saveObservation(db, title, narrative, facts = []) {
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: TEST_PROJECT,
    agent_id: 'claudecode',
    title,
    narrative,
    facts,
    concepts: [],
    files_read: [],
    files_modified: [],
    embedding: getLocalHashingEmbedding(`${title} ${narrative} ${facts.join(' ')}`),
  });
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-claude-${randomUUID()}-`));
}

async function runInstall(tempHome, args = []) {
  const parsed = path.parse(tempHome);
  const child = spawn('node', [cliPath, 'install', ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION: '1',
      HOME: tempHome,
      USERPROFILE: tempHome,
      HOMEDRIVE: parsed.root.replace(/[\\\/]+$/, ''),
      HOMEPATH: tempHome.slice(parsed.root.length - 1),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(exitCode, 0, output);
  return output;
}

function readClaudeConfig(tempHome) {
  return {
    settings: JSON.parse(fs.readFileSync(path.join(tempHome, '.claude', 'settings.json'), 'utf8')),
    global: JSON.parse(fs.readFileSync(path.join(tempHome, '.claude.json'), 'utf8')),
  };
}

test('extractCjkBigrams splits CJK runs into overlapping bigrams and ignores ASCII', () => {
  assert.deepEqual(extractCjkBigrams('自动召回 hook 中'), ['自动', '动召', '召回', '中']);
  assert.deepEqual(extractCjkBigrams('plain ascii only'), []);
});

test('local hashing embedding gives CJK text a non-zero vector', () => {
  const vector = getLocalHashingEmbedding('自动召回中文查询');
  assert.ok(vector.some((value) => value !== 0));
});

test('searchHybrid ranks CJK matches for a pure Chinese query', async () => {
  await withDatabase(async (db) => {
    await saveObservation(db, 'Unrelated English note', 'Worker restarted after upgrade.');
    await saveObservation(db, '修复自动召回', '中文查询在自动召回时得分为零，现已修复。');
    await saveObservation(db, 'Another note', 'Nothing about recall here.');

    const query = '自动召回 中文查询';
    const hits = await db.searchHybrid(TEST_PROJECT, query, getLocalHashingEmbedding(query), 5);
    assert.equal(hits[0].title, '修复自动召回');
    assert.ok(hits[0].fts_score > 0.5);
    assert.ok(hits.every((hit) => hit.hybrid_score > 0.01), 'non-matching rows are filtered out');
  });
});

test('searchHybrid blends ASCII FTS and CJK overlap for mixed queries', async () => {
  await withDatabase(async (db) => {
    await saveObservation(db, 'Claude Code setup', 'Claude Code hooks registered.');
    await saveObservation(db, 'Claude Code 记忆接入', 'Claude Code 记忆系统接入完成。');

    const query = 'Claude Code 记忆接入';
    const hits = await db.searchHybrid(TEST_PROJECT, query, undefined, 5);
    assert.equal(hits[0].title, 'Claude Code 记忆接入');
    assert.equal(hits.length, 2);
  });
});

test('renderCompactProjectContextView stays under the cap and leads with summary blocks', () => {
  const observations = Array.from({ length: 10 }, (_, index) => ({
    id: `obs-${index}`,
    session_id: 'session-1',
    project_path: TEST_PROJECT,
    agent_id: 'codex',
    title: `Milestone number ${index}`,
    narrative: 'x'.repeat(600),
    facts: ['f'.repeat(400), 'g'.repeat(400), 'h'.repeat(400)],
    concepts: [],
    files_read: [],
    files_modified: [],
    embedding: [],
    created_at: `2026-06-03 02:${String(10 + index).padStart(2, '0')}:00`,
  }));
  const view = createProjectContextView(TEST_PROJECT, [], observations);

  const compact = renderCompactProjectContextView(view, 2000);
  assert.ok(compact.length <= 2000, `compact length ${compact.length}`);
  assert.match(compact, /Recent summary blocks:/);
  assert.match(compact, /truncated to fit host context limit/);
  assert.doesNotMatch(compact, /Policy decision trace|Temporal slice diagnostics|Bounded context package/);
  assert.ok(renderProjectContextView(view).length > compact.length);
});

test('renderCompactProjectContextView keeps only the newest blocks and digests and skips failed-synthesis stubs', () => {
  const observations = Array.from({ length: 10 }, (_, index) => ({
    id: `obs-${index}`,
    session_id: 'session-1',
    project_path: TEST_PROJECT,
    agent_id: 'codex',
    title: index === 1 ? 'Task capture incomplete: Bash' : `Milestone number ${index}`,
    narrative: 'short narrative',
    facts: ['a fact'],
    concepts: [],
    files_read: [],
    files_modified: [],
    embedding: [],
    created_at: `2026-06-03 02:${String(59 - index).padStart(2, '0')}:00`,
  }));
  const view = createProjectContextView(TEST_PROJECT, [], observations);
  view.daily_digests = Array.from({ length: 5 }, (_, index) => ({
    local_date: `2026-06-0${5 - index}`,
    summary: `Digest for day ${5 - index}`,
    next_actions: ['first action', 'second action'],
  }));

  const compact = renderCompactProjectContextView(view);
  assert.doesNotMatch(compact, /Task capture incomplete/);
  assert.equal((compact.match(/^- Milestone number/gm) || []).length, 6);
  assert.match(compact, /Milestone number 0/);
  assert.doesNotMatch(compact, /Milestone number 9/);
  assert.match(compact, /2026-06-05: Digest for day 5/);
  assert.doesNotMatch(compact, /2026-06-02|2026-06-01/);
  assert.doesNotMatch(compact, /second action/);
  assert.match(compact, /4 older\/low-value summary blocks and 2 older daily digests omitted/);
});

test('install keeps Claude PostToolUse capture off once it was removed, and the flags override it', async () => {
  const tempHome = makeTempHome();
  try {
    await runInstall(tempHome);
    let { settings, global } = readClaudeConfig(tempHome);
    assert.match(JSON.stringify(settings.hooks.PostToolUse), /claude-post-tool\.js/, 'fresh install keeps capture on');
    assert.deepEqual(global.mcpServers.agentmem.env, { AGENTMEM_AGENT_ID: 'claudecode' });

    delete settings.hooks.PostToolUse;
    fs.writeFileSync(path.join(tempHome, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
    const output = await runInstall(tempHome);
    ({ settings } = readClaudeConfig(tempHome));
    assert.equal(settings.hooks.PostToolUse, undefined, 'reinstall respects the opt-out');
    assert.match(JSON.stringify(settings.hooks.SessionStart), /claude-session-start\.js/);
    assert.doesNotMatch(output, /Claude Code PostToolUse hook is missing/);

    await runInstall(tempHome, ['--claude-capture']);
    ({ settings } = readClaudeConfig(tempHome));
    assert.match(JSON.stringify(settings.hooks.PostToolUse), /claude-post-tool\.js/);

    await runInstall(tempHome, ['--no-claude-capture']);
    ({ settings } = readClaudeConfig(tempHome));
    assert.equal(settings.hooks.PostToolUse, undefined);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
