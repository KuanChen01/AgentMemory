// v2.2.4: AgentMemory-generated records are written in English. Prompts, the one-shot CJK retry,
// the digest prompt bump (no regeneration of existing digests), MCP tool docs and installer guidance.
// Fake LLMs only; installer runs against a temp HOME. Nothing outside os.tmpdir() is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { withWorker, ev } = require('./helpers/task-worker.cjs');
const wm = require('../dist/services/work-memory.js');
const { DatabaseManager } = require('../dist/services/db.js');
const digest = require('../dist/services/daily-digest.js');
const { findDailyDigestCatchUpTargets } = require('../dist/services/daily-digest-scheduler.js');
const installer = require('../dist/services/agent-installer.js');
const { renderGrokAgentProfile } = require('../dist/services/grok-installer.js');
const { AGENTMEM_ENGLISH_RECORDS_MARKER, AGENTMEM_ENGLISH_RECORDS_RULE } = require('../dist/services/agent-guidance.js');

const RULE = 'Write title, narrative, facts and concepts in English regardless of the language of the events; keep identifiers, paths, commands and proper names verbatim.';
const CJK = { record_kind: 'outcome', title: '修复了钩子捕获脚本', narrative: '修复 claude-post-tool 钩子，测试全部通过。', facts: ['钩子已修复'], concepts: ['钩子'], files_read: [], files_modified: ['src/hooks/a.ts'] };
const EN = { record_kind: 'outcome', title: 'Fixed the hook capture script', narrative: 'Fixed the claude-post-tool hook; all tests pass.', facts: ['Hook fixed'], concepts: ['hooks'], files_read: [], files_modified: ['src/hooks/a.ts'] };

test('work-memory prompt carries the English rule verbatim', () => {
  assert.equal(wm.ENGLISH_RECORD_RULE, RULE);
  assert.ok(wm.WORK_MEMORY_PROMPT.includes(RULE));
});

test('cjkRatio / isMainlyCjk heuristic on title + narrative', () => {
  assert.equal(wm.cjkRatio(''), 0);
  assert.equal(wm.cjkRatio('Fixed src/x.ts'), 0);
  assert.equal(wm.cjkRatio('修复'), 1);
  assert.ok(wm.cjkRatio('修复了 src/hooks/claude-post-tool.ts 的捕获问题') >= wm.CJK_RETRY_THRESHOLD);
  assert.ok(wm.cjkRatio('Fixed the 钩子 (hook) capture in src/hooks/claude-post-tool.ts') < wm.CJK_RETRY_THRESHOLD);
  assert.ok(wm.cjkRatio('Fixed the hook. Tests pass.') === 0 && wm.cjkRatio('修复了钩子：`npm test` 与 src/a.ts 已通过。') === 1);
  assert.ok(wm.cjkRatio('フックを修正した') > 0.9 && wm.cjkRatio('훅을 수정했다') > 0.9);
  assert.equal(wm.isMainlyCjk(CJK), true);
  assert.equal(wm.isMainlyCjk(EN), false);
  assert.equal(wm.isMainlyCjk({ ...CJK, record_kind: 'skip' }), false, 'skip answers are not retried');
  assert.equal(wm.isMainlyCjk(null), false);
  assert.equal(wm.isMainlyCjk({ title: 42, narrative: ['x'] }), false);
});

test('synthesizeEnglishWorkMemory: English answer, one call', async () => {
  const systems = [];
  const r = await wm.synthesizeEnglishWorkMemory(async s => { systems.push(s); return EN; }, 'SYS');
  assert.deepEqual([r.calls, r.retried, systems], [1, false, ['SYS']]);
  assert.equal(r.raw, EN);
});

test('synthesizeEnglishWorkMemory: CJK answer retried once with a stronger reminder; second kept regardless', async () => {
  const systems = []; const answers = [CJK, EN];
  const r = await wm.synthesizeEnglishWorkMemory(async s => { systems.push(s); return answers.shift(); }, 'SYS');
  assert.equal(r.calls, 2); assert.equal(r.retried, true); assert.equal(r.raw, EN);
  assert.equal(systems[0], 'SYS'); assert.ok(systems[1].startsWith('SYS\n') && systems[1].includes(wm.ENGLISH_RETRY_REMINDER));
  const still = [CJK, { ...CJK, title: '仍然是中文' }]; let n = 0;
  const r2 = await wm.synthesizeEnglishWorkMemory(async () => { n++; return still.shift(); }, 'SYS');
  assert.equal(n, 2, 'never a third call'); assert.equal(r2.raw.title, '仍然是中文', 'second answer kept even if still CJK');
});

test('synthesizeEnglishWorkMemory: failed retry keeps the first answer; first-call errors propagate', async () => {
  let n = 0;
  const r = await wm.synthesizeEnglishWorkMemory(async () => { if (n++) throw new Error('boom'); return CJK; }, 'SYS');
  assert.equal(r.raw, CJK); assert.equal(r.calls, 2);
  await assert.rejects(wm.synthesizeEnglishWorkMemory(async () => { throw new Error('first'); }, 'SYS'), /first/);
});

test('task consolidation: prompt carries the rule; CJK output retried once and the English retry is stored', async () => {
  await withWorker(async ({ post, idle, sleep, stub, dbPath }) => {
    stub.state.queue.push(CJK, EN);
    await post('/tools', ev('en1', 'apply_patch', 'edit src/hooks/a.ts', 'ok', true, '/work/App'));
    await post('/tasks/boundary', { session_id: 'en1' }); await sleep(300); await idle();
    let row; const end = Date.now() + 8000;
    while (Date.now() < end) {
      const d = new Database(dbPath, { readonly: true });
      row = d.prepare(`SELECT o.title, o.narrative FROM task_results r JOIN observations o ON o.id = r.observation_id WHERE r.session_id = 'en1'`).get();
      d.close(); if (row) break; await sleep(100);
    }
    assert.equal(stub.calls.length, 2, 'exactly one retry');
    assert.ok(stub.calls[0].system.includes(RULE) && !stub.calls[0].system.includes(wm.ENGLISH_RETRY_REMINDER));
    assert.ok(stub.calls[1].system.includes(wm.ENGLISH_RETRY_REMINDER));
    assert.equal(stub.calls[0].user, stub.calls[1].user, 'same events on retry');
    assert.equal(row?.title, EN.title);
  });
});

test('task consolidation: English output is not retried', async () => {
  await withWorker(async ({ post, idle, sleep, stub }) => {
    stub.state.queue.push(EN);
    await post('/tools', ev('en2', 'apply_patch', 'edit', 'ok', true, '/work/App'));
    await post('/tasks/boundary', { session_id: 'en2' }); await sleep(300); await idle(); await sleep(300);
    assert.equal(stub.calls.length, 1);
  });
});

async function withDb(run) {
  const prev = process.env.AGENTMEM_DB_PATH;
  const dbPath = path.join(os.tmpdir(), `agentmemory-english-${randomUUID()}.db`);
  process.env.AGENTMEM_DB_PATH = dbPath; const db = new DatabaseManager();
  try { await db.initialize(); await run(db); }
  finally {
    db.close(); if (prev === undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH = prev;
    for (const s of ['', '-shm', '-wal']) fs.rmSync(dbPath + s, { force: true });
  }
}
const llmConfig = { apiKey: 'test-key', apiUrl: 'http://127.0.0.1:9/v1', disableJsonMode: false, headers: {}, model: 'mock' };
const digestJson = { summary: 'Digest.', facts: [], decisions: [], verified_commands: [], open_questions: [], next_actions: [], state_fact_candidates: [], skill_candidates: [] };

test('daily digest: prompt v2 carries the English rule; existing v1 digests are never regenerated', async () => {
  assert.equal(digest.DAILY_DIGEST_PROMPT_VERSION, 'daily-digest-v2');
  await withDb(async (db) => {
    const obs = { id: randomUUID(), session_id: randomUUID(), project_path: '/work/App', agent_id: 'codex',
      title: 'Implemented the importer', narrative: 'Added the import endpoint and tests.', facts: ['Import keeps original time.'],
      concepts: ['import'], files_read: [], files_modified: ['src/a.ts'], embedding: [1, 0, 0], created_at: '2026-06-08T08:30:00.000Z' };
    await db.saveObservation(obs);
    const old = await db.saveDailyMemoryDigest({ project_path: '/work/App', local_date: '2026-06-08', status: 'success',
      digest: { ...digestJson, summary: '旧的中文摘要' }, source_observation_ids: [obs.id], source_count: 1, model: 'old', prompt_version: 'daily-digest-v1' });
    let calls = 0;
    const run = () => digest.runDailyMemoryDigest({ dbManager: db, llmConfig, localDate: '2026-06-08', projectPath: '/work/App',
      timeZone: 'Asia/Shanghai', completeChat: async (req) => { calls++; run.req = req; return JSON.stringify(digestJson); } });
    const r = await run();
    assert.equal(calls, 0, 'prompt bump does not regenerate an existing digest');
    assert.equal(r.digest.prompt_version, 'daily-digest-v1'); assert.equal(r.digest.digest.summary, '旧的中文摘要');
    assert.equal(r.digest.generated_at, old.generated_at);
    const targets = await findDailyDigestCatchUpTargets(db, { dates: ['2026-06-08'], timeZone: 'Asia/Shanghai' });
    assert.deepEqual(targets, [], 'scheduler catch-up does not backfill old digests');
    // A new day gets the v2 prompt with the English rule.
    await db.saveObservation({ ...obs, id: randomUUID(), created_at: '2026-06-09T08:30:00.000Z' });
    const r2 = await digest.runDailyMemoryDigest({ dbManager: db, llmConfig, localDate: '2026-06-09', projectPath: '/work/App',
      timeZone: 'Asia/Shanghai', completeChat: async (req) => { calls++; run.req = req; return JSON.stringify(digestJson); } });
    assert.equal(calls, 1); assert.equal(r2.digest.prompt_version, 'daily-digest-v2');
    assert.ok(run.req.messages[0].content.includes(digest.DAILY_DIGEST_ENGLISH_RULE));
    assert.match(digest.DAILY_DIGEST_ENGLISH_RULE, /in English regardless of the language/);
  });
});

test('record_memory MCP tool docs ask for English', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'servers', 'mcp-server.js'), 'utf8');
  const start = src.indexOf("name: 'record_memory'"); assert.ok(start > 0);
  const block = src.slice(start, start + 2500);
  assert.match(block, /Write in English/);
  assert.match(block, /Short title of the memory, written in English/);
  assert.match(block, /results\. Write in English\./);
  assert.match(block, /facts discovered or established, written in English/);
});

test('installer guidance templates carry the English rule for every managed agent surface', () => {
  assert.ok(AGENTMEM_ENGLISH_RECORDS_RULE.includes(AGENTMEM_ENGLISH_RECORDS_MARKER));
  assert.ok(installer.renderAntigravityGuidance().includes(AGENTMEM_ENGLISH_RECORDS_RULE));
  assert.ok(installer.renderAntigravityPluginRule().includes(AGENTMEM_ENGLISH_RECORDS_RULE));
  assert.ok(renderGrokAgentProfile().includes(AGENTMEM_ENGLISH_RECORDS_RULE.slice(2)));
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test('install/reinstall/uninstall never touch ~/.claude/CLAUDE.md (vera:agentmem-rule block byte-for-byte)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmemory-english-home-'));
  const saved = {}; for (const k of ['AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION', 'AGENTMEM_SKIP_GLOBAL_UNLINK', 'AGENTMEM_PORT', 'XDG_CONFIG_HOME', 'APPDATA']) saved[k] = process.env[k];
  Object.assign(process.env, { AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION: '1', AGENTMEM_SKIP_GLOBAL_UNLINK: '1', AGENTMEM_PORT: '0' });
  delete process.env.XDG_CONFIG_HOME; delete process.env.APPDATA;
  try {
    const claudeMd = path.join(home, '.claude', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
    // CRLF, BOM, trailing spaces, non-ASCII and a mention of record_memory inside the managed block.
    const bytes = Buffer.from('\ufeff# My notes\r\n\r\n<!-- vera:agentmem-rule:start -->\r\n记忆规则：record_memory 用中文？  \r\n- keep this exactly\t\r\n<!-- vera:agentmem-rule:end -->\r\ntrailing', 'utf8');
    fs.writeFileSync(claudeMd, bytes);
    const repoRoot = path.resolve(__dirname, '..');
    installer.installAgentMemory({ repoRoot, homeDir: home });
    installer.installAgentMemory({ repoRoot, homeDir: home });
    assert.ok(Buffer.from(fs.readFileSync(claudeMd)).equals(bytes), 'CLAUDE.md unchanged after install + reinstall');
    const paths = installer.resolveInstallPaths(repoRoot, home);
    for (const p of [paths.antigravityGuidancePath, paths.antigravityPluginRulePath, paths.grokProfilePath])
      assert.ok(fs.readFileSync(p, 'utf8').includes(AGENTMEM_ENGLISH_RECORDS_MARKER), p);
    const opencode = walk(home).filter(f => f.endsWith('AGENTS.md') && fs.readFileSync(f, 'utf8').includes('AgentMemory OpenCode Rules'));
    assert.equal(opencode.length, 1, 'OpenCode rules written');
    assert.ok(fs.readFileSync(opencode[0], 'utf8').includes(AGENTMEM_ENGLISH_RECORDS_MARKER));
    const issues = installer.validateInstalledFiles(paths, paths.antigravityOfficialConfigPath);
    assert.equal(issues.filter(i => /English|boundary rules|startup and boundary/.test(i)).length, 0, issues.join('\n'));
    // Doctor flags guidance written by an older version (no English rule).
    fs.writeFileSync(paths.antigravityGuidancePath, installer.renderAntigravityGuidance().replace(AGENTMEM_ENGLISH_RECORDS_RULE + '\n', ''));
    fs.writeFileSync(opencode[0], fs.readFileSync(opencode[0], 'utf8').replace(AGENTMEM_ENGLISH_RECORDS_RULE + '\n', ''));
    const stale = installer.validateInstalledFiles(paths, paths.antigravityOfficialConfigPath);
    assert.ok(stale.some(i => i.includes('Antigravity AgentMemory guidance')), stale.join('\n'));
    assert.ok(stale.some(i => i.includes('English-records rule')), stale.join('\n'));
    await installer.uninstallAgentMemory({ repoRoot, homeDir: home, skipGlobalUnlink: true });
    assert.ok(Buffer.from(fs.readFileSync(claudeMd)).equals(bytes), 'CLAUDE.md unchanged after uninstall');
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir())));
    fs.rmSync(home, { recursive: true, force: true });
  }
});
