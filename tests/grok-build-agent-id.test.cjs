// Grok Build agent id: display alias at read time, canonical id on new writes, raw `grok` rows left in place.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const { DatabaseManager } = require('../dist/services/db.js');
const {
  GROK_BUILD_AGENT_ID,
  GROK_BOT_AGENT_ID,
  agentAliasIds,
  agentDisplayName,
  agentMatchSql,
  normalizeAgentId,
  resolveAgentId,
} = require('../dist/services/agent-id.js');
const { getAdminPipeline } = require('../dist/services/pipeline-query.js');
const { getAdminDigestList } = require('../dist/services/digest-query.js');
const { getAdminProjectList } = require('../dist/services/project-query.js');
const {
  installAgentMemory,
  resolveInstallPaths,
  uninstallAgentMemory,
  validateInstalledFiles,
} = require('../dist/services/agent-installer.js');
const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');

const PROJECT = '/work/GrokAlias';
const DAY = '2026-10-18 12:00:00';
const NOW_MS = Date.parse('2026-10-18T18:00:00.000Z');
const WINDOW = { from: '2026-10-18T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z', tzOffsetMinutes: 0 };

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-grok-build-${randomUUID()}.db`);
    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await run(db);
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
      for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  };
}

function withHome(run) {
  return async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-grok-build-home-${randomUUID()}-`));
    const previous = process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION;
    process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION = '1';
    try {
      await run(homeDir);
    } finally {
      if (previous === undefined) delete process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION;
      else process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION = previous;
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  };
}

function save(db, fields) {
  return db.saveObservation({
    id: fields.id,
    session_id: fields.session_id || 'sess-grok-build',
    project_path: PROJECT,
    agent_id: fields.agent_id,
    title: fields.title || fields.id,
    narrative: 'narrative',
    facts: [],
    concepts: [],
    files_read: [],
    files_modified: [],
    embedding: [0.1, 0.2],
    created_at: DAY,
    record_kind: 'outcome',
    source_kind: 'task',
  });
}

function idsOf(body, key = 'id') {
  return body.items.map((item) => item[key]).sort();
}

test('agent id helpers alias Grok Build and leave Grok Bot and other ids alone', () => {
  assert.equal(GROK_BUILD_AGENT_ID, 'grok-build');
  assert.equal(GROK_BOT_AGENT_ID, 'grok-bot');
  for (const id of ['grok', 'GROK', 'grok-build', 'GROK-BUILD', 'Grok Build', '  grok   build ']) {
    assert.equal(agentDisplayName(id), 'Grok Build');
  }
  assert.equal(agentDisplayName('grok-bot'), 'Grok Bot');
  assert.equal(agentDisplayName('Grok Bot'), 'Grok Bot');
  assert.equal(agentDisplayName('codex/local_fit'), 'codex/local_fit');
  assert.equal(agentDisplayName('Codex'), 'Codex');

  assert.deepEqual(agentAliasIds('grok'), ['grok', 'grok-build']);
  assert.deepEqual(agentAliasIds('Grok Build'), ['grok', 'grok-build']);
  assert.deepEqual(agentAliasIds('grok-bot'), ['grok-bot']);
  assert.deepEqual(agentAliasIds('Grok Bot'), ['grok-bot']);
  assert.deepEqual(agentAliasIds('Codex'), ['codex']);
  assert.deepEqual(agentAliasIds(''), []);
  assert.deepEqual(agentAliasIds('   '), []);

  assert.deepEqual(agentMatchSql('o.agent_id', 'Grok Build'), {
    sql: 'LOWER(o.agent_id) IN (?,?)',
    params: ['grok', 'grok-build'],
  });
  assert.deepEqual(agentMatchSql('agent_id', 'grok-bot'), {
    sql: 'LOWER(agent_id) IN (?)',
    params: ['grok-bot'],
  });
  assert.deepEqual(agentMatchSql('agent_id', ''), { sql: '1=0', params: [] });

  assert.equal(normalizeAgentId('grok'), 'grok');
  assert.equal(normalizeAgentId('Grok'), 'Grok');
  assert.equal(normalizeAgentId('GROK-BUILD'), 'GROK-BUILD');
  assert.equal(normalizeAgentId('grok-bot'), 'grok-bot');
  assert.equal(normalizeAgentId('Grok Build'), 'grok-build');
  assert.equal(normalizeAgentId('Grok Bot'), 'grok-bot');
  assert.equal(normalizeAgentId('Antigravity'), 'antigravity');
  assert.equal(resolveAgentId('Grok Build'), 'grok-build');
  assert.equal(resolveAgentId('', 'grok'), 'grok');
  assert.equal(resolveAgentId(undefined, 'GROK-BUILD'), 'GROK-BUILD');
});

test('reads alias grok and grok-build while stored grok rows stay grok', withDb(async (db) => {
  await save(db, { id: 'obs-saved-grok', agent_id: 'grok' });
  await save(db, { id: 'obs-display', agent_id: 'Grok Build' });
  await save(db, { id: 'obs-bot', agent_id: 'Grok Bot' });
  await save(db, { id: 'obs-codex', agent_id: 'codex' });
  await db.sqlWrite((tx) => {
    tx.run(`INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
      VALUES ('obs-legacy-grok', 'sess-grok-build', ?, 'grok', 'legacy', 'n', '[]', '[]', '[]', '[]', '[]', ?)`, [PROJECT, DAY]);
    tx.run(`INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
      VALUES ('obs-stored-build', 'sess-grok-build', ?, 'grok-build', 'stored', 'n', '[]', '[]', '[]', '[]', '[]', ?)`, [PROJECT, DAY]);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('res-grok', 'task-grok', 'sess-grok-build', ?, 'grok', 0, 1, 1, '[]', 'user_prompt', 'saved', 'obs-legacy-grok', 0, ?)`, [PROJECT, DAY]);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('res-build', 'task-build', 'sess-grok-build', ?, 'grok-build', 0, 1, 1, '[]', 'user_prompt', 'saved', 'obs-display', 0, ?)`, [PROJECT, DAY]);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('res-bot', 'task-bot', 'sess-grok-build', ?, 'grok-bot', 0, 1, 1, '[]', 'user_prompt', 'saved', 'obs-bot', 0, ?)`, [PROJECT, DAY]);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('res-codex', 'task-codex', 'sess-grok-build', ?, 'codex', 0, 1, 1, '[]', 'user_prompt', 'saved', 'obs-codex', 0, ?)`, [PROJECT, DAY]);
    for (const row of [
      { id: 'd-alias', day: '2026-10-18', sources: ['obs-legacy-grok', 'obs-display'] },
      { id: 'd-bot', day: '2026-10-17', sources: ['obs-bot'] },
      { id: 'd-codex', day: '2026-10-16', sources: ['obs-codex'] },
    ]) {
      tx.run(`INSERT INTO daily_memory_digests (
          id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
          model, prompt_version, generated_at
        ) VALUES (?, ?, ?, 'success', ?, ?, ?, NULL, 'daily-digest-v1', '2026-10-18T12:00:00.000Z')`, [
        row.id, PROJECT, row.day, JSON.stringify({ summary: row.id }), JSON.stringify(row.sources), row.sources.length,
      ]);
    }
  });

  const stored = db.sqlAll(`SELECT id, agent_id FROM observations ORDER BY id`);
  const byId = Object.fromEntries(stored.map((row) => [row.id, row.agent_id]));
  assert.equal(byId['obs-saved-grok'], 'grok');
  assert.equal(byId['obs-legacy-grok'], 'grok');
  assert.equal(byId['obs-stored-build'], 'grok-build');
  assert.equal(byId['obs-display'], 'grok-build');
  assert.equal(byId['obs-bot'], 'grok-bot');
  assert.equal(byId['obs-codex'], 'codex');

  const activity = await db.getAdminActivity({ ...WINDOW, kind: 'all' });
  assert.deepEqual(activity.breakdown.map((row) => [row.project_path, row.agent_id, row.agent_label, row.outcome, row.legacy]), [
    [PROJECT, 'grok-build', 'Grok Build', 2, 2],
    [PROJECT, 'codex', 'codex', 1, 0],
    [PROJECT, 'grok-bot', 'Grok Bot', 1, 0],
  ]);
  const aliasCards = (await db.getAdminActivity({ ...WINDOW, kind: 'all', agent: 'grok-build' })).cards;
  assert.deepEqual(aliasCards.map((card) => card.id).sort(), ['obs-display', 'obs-legacy-grok', 'obs-saved-grok', 'obs-stored-build']);
  assert.deepEqual(aliasCards.map((card) => card.agent_id).sort(), ['grok', 'grok', 'grok-build', 'grok-build']);
  assert.equal(aliasCards.some((card) => Object.prototype.hasOwnProperty.call(card, 'agent_label')), false);
  const displayCards = await db.getAdminActivity({ ...WINDOW, kind: 'all', agent: 'Grok Build' });
  assert.deepEqual(displayCards.cards.map((card) => card.id).sort(), aliasCards.map((card) => card.id).sort());

  const memories = await db.getAdminMemories({ ...WINDOW, kind: 'all', agent: 'Grok Build', limit: 20 });
  assert.equal(memories.filters.agent, 'Grok Build');
  assert.deepEqual(idsOf(memories), ['obs-display', 'obs-legacy-grok', 'obs-saved-grok', 'obs-stored-build']);
  assert.equal(memories.items.some((item) => Object.prototype.hasOwnProperty.call(item, 'agent_label')), false);
  assert.equal(Object.prototype.hasOwnProperty.call(memories, 'facets'), false);
  const botMemories = await db.getAdminMemories({ ...WINDOW, kind: 'all', agent: 'grok-bot', limit: 20 });
  assert.deepEqual(idsOf(botMemories), ['obs-bot']);

  assert.deepEqual(await db.listDistinctAgents(), ['codex', 'grok-bot', 'grok-build']);

  const home = await db.getAdminHomeSummary({ tzOffsetMinutes: 0, days: 7, now: new Date(NOW_MS) });
  assert.deepEqual(home.today.agents, [
    { agent_id: 'grok-build', n: 4, agent_label: 'Grok Build' },
    { agent_id: 'codex', n: 1, agent_label: 'codex' },
    { agent_id: 'grok-bot', n: 1, agent_label: 'Grok Bot' },
  ]);
  assert.equal(home.recent.find((row) => row.id === 'obs-legacy-grok').agent_id, 'grok');

  const projects = getAdminProjectList(db, { days: 30 }, { nowMs: NOW_MS });
  const project = projects.items.find((item) => item.project_path === PROJECT);
  assert.deepEqual(project.agents, [
    { agent_id: 'grok-build', agent_label: 'Grok Build', count: 4 },
    { agent_id: 'codex', agent_label: 'codex', count: 1 },
    { agent_id: 'grok-bot', agent_label: 'Grok Bot', count: 1 },
  ]);

  const runtime = { inflight: [], consolidating: 0, nowMs: NOW_MS };
  const pipeline = getAdminPipeline(db, { agent: 'Grok Build' }, runtime);
  assert.equal(pipeline.filters.agent, 'Grok Build');
  assert.deepEqual(idsOf(pipeline, 'task_id'), ['task-build', 'task-grok']);
  assert.deepEqual(pipeline.items.map((item) => item.agent_id).sort(), ['grok', 'grok-build']);
  const openPipeline = getAdminPipeline(db, {}, runtime);
  assert.deepEqual(openPipeline.facets.agents, ['codex', 'grok-bot', 'grok-build']);
  assert.deepEqual(openPipeline.facets.agent_labels, {
    codex: 'codex',
    'grok-bot': 'Grok Bot',
    'grok-build': 'Grok Build',
  });

  const digests = getAdminDigestList(db, { agent: 'Grok Build' }, { nowMs: NOW_MS });
  assert.equal(digests.filters.agent, 'Grok Build');
  assert.deepEqual(idsOf(digests), ['d-alias']);
  assert.deepEqual(digests.items[0].agents, ['grok', 'grok-build']);
  const allDigests = getAdminDigestList(db, {}, { nowMs: NOW_MS });
  assert.deepEqual(allDigests.facets.agents, ['codex', 'grok-bot', 'grok-build']);
  assert.deepEqual(allDigests.facets.agent_labels, {
    codex: 'codex',
    'grok-bot': 'Grok Bot',
    'grok-build': 'Grok Build',
  });
  assert.equal(getAdminDigestList(db, { agent: 'grok' }, { nowMs: NOW_MS }).filters.agent, 'grok');
}));

test('Grok install writes grok-build, rewrites a managed grok env, and uninstall removes both', withHome(async (homeDir) => {
  const paths = resolveInstallPaths(projectRoot, homeDir);
  installAgentMemory({ homeDir, repoRoot: projectRoot });
  const installed = fs.readFileSync(paths.grokConfigPath, 'utf8');
  assert.equal((installed.match(/AGENTMEM_AGENT_ID\s*=\s*"grok-build"/g) || []).length, 1);
  assert.equal((installed.match(/AGENTMEM_AGENT_ID\s*=\s*"grok"/g) || []).length, 0);
  const profile = fs.readFileSync(paths.grokProfilePath, 'utf8');
  assert.match(profile, /canonical `grok-build`/);
  const grokIssue = 'AGENTMEM_AGENT_ID=grok-build';
  assert.equal(validateInstalledFiles(paths).some((issue) => issue.includes(grokIssue)), false);

  fs.writeFileSync(paths.grokConfigPath, installed.replace('AGENTMEM_AGENT_ID = "grok-build"', 'AGENTMEM_AGENT_ID = "grok"'));
  assert.equal(validateInstalledFiles(paths).some((issue) => issue.includes(grokIssue)), true);
  installAgentMemory({ homeDir, repoRoot: projectRoot });
  const rewritten = fs.readFileSync(paths.grokConfigPath, 'utf8');
  assert.equal((rewritten.match(/AGENTMEM_AGENT_ID\s*=\s*"grok-build"/g) || []).length, 1);
  assert.equal((rewritten.match(/AGENTMEM_AGENT_ID\s*=\s*"grok"/g) || []).length, 0);
  assert.equal(validateInstalledFiles(paths).some((issue) => issue.includes(grokIssue)), false);

  await uninstallAgentMemory({ homeDir, repoRoot: projectRoot, skipGlobalUnlink: true });
  const removed = fs.existsSync(paths.grokConfigPath) ? fs.readFileSync(paths.grokConfigPath, 'utf8') : '';
  assert.doesNotMatch(removed, /mcp_servers\.agentmem/);

  fs.mkdirSync(path.dirname(paths.grokConfigPath), { recursive: true });
  fs.writeFileSync(paths.grokConfigPath, `[mcp_servers.agentmem]\ncommand = "node"\nenv = { AGENTMEM_AGENT_ID = "grok" }\n\n[mcp_servers.agentmem.env]\nAGENTMEM_AGENT_ID = "grok"\n\n[agent]\nmodel = "grok-build"\n`);
  await uninstallAgentMemory({ homeDir, repoRoot: projectRoot, skipGlobalUnlink: true });
  const afterOld = fs.readFileSync(paths.grokConfigPath, 'utf8');
  assert.doesNotMatch(afterOld, /mcp_servers\.agentmem/);
  assert.match(afterOld, /model = "grok-build"/);

  fs.writeFileSync(paths.grokConfigPath, `[mcp_servers.agentmem]\ncommand = "node"\nenv = { AGENTMEM_AGENT_ID = "grok-build" }\n\n[agent]\nmodel = "grok-build"\n`);
  await uninstallAgentMemory({ homeDir, repoRoot: projectRoot, skipGlobalUnlink: true });
  const afterNew = fs.readFileSync(paths.grokConfigPath, 'utf8');
  assert.doesNotMatch(afterNew, /mcp_servers\.agentmem/);
  assert.match(afterNew, /model = "grok-build"/);
}));

test('Grok hook posts agent_id grok-build', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ url: req.url, payload: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"success":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const hookPath = path.join(projectRoot, 'dist', 'hooks', 'grok-hook.js');
  const runHook = (mode, payload) => new Promise((resolve, reject) => {
    const child = spawn('node', [hookPath, mode], {
      env: { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_HOOK_TIMEOUT_MS: '5000', AGENTMEM_HOOK_AUTOSTART: 'false' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
    child.stdin.end(JSON.stringify(payload));
  });
  try {
    const base = { sessionId: 'grok-session', workspaceRoot: '/work/GrokAlias' };
    await runHook('session-start', base);
    await runHook('post-tool-use', { ...base, toolName: 'read_file', toolInput: { path: 'README.md' }, toolOutput: 'ok' });
    assert.equal(calls[0].payload.agent_id, 'grok-build');
    assert.equal(calls[0].payload.id, 'grok-session');
    assert.equal(calls[1].payload.agent_id, 'grok-build');
    assert.equal(calls[1].url, '/tools');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin client labels Grok Build and dedupes alias options', () => {
  const uiHtml = renderAdminPageHtml();
  const uiScript = uiHtml.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.match(uiScript, /function agentLabel\(/);
  assert.match(uiScript, /escapeHtml\(agentLabel\(card\.agent_id\)\)/);
  assert.match(uiScript, /title="' \+ escapeHtml\(card\.agent_id\)/);

  function uiClientFunction(name) {
    const start = uiScript.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    let depth = 0;
    let seen = false;
    let quote = '';
    let escape = false;
    for (let index = start; index < uiScript.length; index += 1) {
      const char = uiScript[index];
      if (quote) {
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '{') {
        depth += 1;
        seen = true;
      } else if (char === '}') {
        depth -= 1;
        if (seen && depth === 0) return uiScript.slice(start, index + 1);
      }
    }
    assert.fail(`unclosed function ${name}`);
  }

  const result = vm.runInNewContext(`
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${uiClientFunction('agentOptionKey')}
    ${uiClientFunction('sameAgent')}
    ${uiClientFunction('canonicalAgentOption')}
    ${uiClientFunction('lookupAgentLabel')}
    ${uiClientFunction('dedupeAgentOptions')}
    ({
      grok: agentLabel('grok'),
      build: agentLabel('GROK-BUILD'),
      display: agentLabel('Grok Build'),
      bot: agentLabel('grok-bot'),
      botDisplay: agentLabel('Grok Bot'),
      codex: agentLabel('codex'),
      slash: agentLabel('codex/local_fit'),
      same: sameAgent('grok', 'grok-build'),
      apart: sameAgent('grok-build', 'grok-bot'),
      options: dedupeAgentOptions(['grok', 'grok-build', 'codex', 'grok-bot']),
      mapped: dedupeAgentOptions(['codex', 'grok-build'], { codex: 'Codex Desk', 'grok-build': 'From Map' }),
    });
  `);
  assert.equal(result.grok, 'Grok Build');
  assert.equal(result.build, 'Grok Build');
  assert.equal(result.display, 'Grok Build');
  assert.equal(result.bot, 'Grok Bot');
  assert.equal(result.botDisplay, 'Grok Bot');
  assert.equal(result.codex, 'codex');
  assert.equal(result.slash, 'codex/local_fit');
  assert.equal(result.same, true);
  assert.equal(result.apart, false);
  assert.deepEqual(Array.from(result.options, (option) => option.value).sort(), ['codex', 'grok-bot', 'grok-build']);
  assert.equal(result.options.find((option) => option.value === 'grok-build').label, 'Grok Build');
  assert.equal(result.options.find((option) => option.value === 'grok-bot').label, 'Grok Bot');
  assert.equal(result.mapped.find((option) => option.value === 'codex').label, 'Codex Desk');
  assert.equal(result.mapped.find((option) => option.value === 'grok-build').label, 'From Map');
});
