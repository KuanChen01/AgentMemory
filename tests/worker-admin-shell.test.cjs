// Admin UI shell (phase 1): sidebar navigation, Home view, Developer tools, i18n parity and the Home aggregates.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');
const { ADMIN_UI_TRANSLATIONS } = require('../dist/services/admin-ui-copy.js');
const { ADMIN_UI_NAV_ITEMS, ADMIN_UI_DEV_PANELS } = require('../dist/services/admin-ui-markup.js');
const { DatabaseManager } = require('../dist/services/db.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const html = renderAdminPageHtml();
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function elementTag(id) {
  const match = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(match, `missing element #${id}`);
  return match[0];
}

test('admin client script is valid JavaScript and ids are unique', () => {
  assert.doesNotThrow(() => new vm.Script(script));
  const markup = html.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  assert.doesNotMatch(html, /runtimeStatusText/);
});

test('sidebar lists the eight sections with stable ids, targets and i18n keys', () => {
  const expected = [
    ['navHome', 'homeView', 'nav.home'],
    ['navActivity', 'activityView', 'nav.activity'],
    ['navMemory', 'memoryView', 'nav.memory'],
    ['navPipeline', 'pipelineView', 'nav.pipeline'],
    ['navDigests', 'digestsView', 'nav.digests'],
    ['navProjects', 'projectsView', 'nav.projects'],
    ['navSkills', 'skillsView', 'nav.skills'],
    ['navSettings', 'settingsView', 'nav.settings'],
  ];
  assert.deepEqual(ADMIN_UI_NAV_ITEMS.map((item) => [item.id, item.target, item.key]), expected);
  for (const [id, target, key] of expected) {
    const tag = elementTag(id);
    assert.match(tag, /class="navItem/);
    assert.match(tag, new RegExp(`data-nav-target="${target}"`));
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]*?data-i18n="${key.replace('.', '\\.')}"`));
    assert.match(elementTag(target), /class="appView/);
  }
  // Home is the default view and the default active nav item.
  assert.match(elementTag('navHome'), /is-active/);
  assert.match(elementTag('homeView'), /class="appView is-active"/);
  assert.match(html, /AgentMemory<\/span>/);
});

test('Home view exposes the health cards, attention and recent cards', () => {
  for (const id of ['homeWorkerCard', 'homeQueueCard', 'homeLlmCard', 'homeDigestCard', 'homeVaultCard']) {
    assert.match(elementTag(id), /class="healthCard glassCard glassBlur/);
    elementTag(`${id}Value`);
    elementTag(`${id}Meta`);
  }
  for (const id of ['homeTodayCard', 'homeTodayCount', 'homeTodayChart', 'homeAttentionCard', 'homeAttentionEmpty',
    'homeAttentionList', 'homeRecentCard', 'homeRecentRows', 'homeRecentViewAll', 'policyBanner', 'pageTitle']) {
    elementTag(id);
  }
  assert.match(html, /data-i18n="home\.allClear"/);
  assert.match(html, /\/admin\/api\/home-summary/);
  // Read/Write pills keep the ids the legacy client and tests rely on.
  for (const id of ['readPolicyState', 'writePolicyState', 'readToggle', 'writeToggle', 'readPolicyMeta', 'writePolicyMeta', 'localeToggle']) {
    elementTag(id);
  }
  assert.match(html, /data-locale-choice="en"/);
  assert.match(html, /data-locale-choice="zh-CN"/);
});

test('Developer tools toggle defaults off and wraps every legacy panel intact', () => {
  const toggle = elementTag('devToolsToggle');
  assert.match(toggle, /type="checkbox"/);
  assert.doesNotMatch(toggle, /checked/);
  assert.match(elementTag('devToolsNavGroup'), /\bhidden\b/);
  assert.match(html, /agentmemory\.admin\.devTools/);
  const devView = html.slice(html.indexOf('id="devToolsView"'));
  const panels = ['runtimePanel', 'proceduralSkillsPanel', 'llmSettingsPanel', 'projectContextPanel', 'stateLabPanel',
    'searchDiagnosticsPanel', 'observationLedgerPanel'];
  assert.deepEqual(ADMIN_UI_DEV_PANELS.map((item) => item.panel), panels);
  for (const panel of panels) {
    assert.match(devView, new RegExp(`id="${panel}" class="viewPanel glassPanel`));
    assert.match(devView, new RegExp(`data-panel-target="${panel}"`));
    assert.match(html, new RegExp(`data-nav-target="devToolsView" data-dev-panel="${panel}"`));
  }
  assert.match(devView, /id="viewTabs"/);
  for (const id of ['observationsCount', 'sessionsCount', 'statusText', 'policyUpdatedAt', 'releaseCheckCard', 'dailyDigestCard']) {
    assert.ok(devView.includes(`id="${id}"`), `legacy #${id} should live under Developer tools`);
  }
});

test('backdrop blur is limited to the sidebar and surfaces of the visible view', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const [, selectorText, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/(^|[;\s])(-webkit-)?backdrop-filter\s*:/.test(body)) {
      selectors.push(...selectorText.split(',').map((selector) => selector.trim()));
    }
  }
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    assert.match(selector, /^\.sidebar\b|\.is-active\b/, `${selector} would blur hidden surfaces`);
  }
});

test('every i18n key used by the markup and the shell exists in en and zh-CN', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const used = new Set();
  for (const match of html.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)) used.add(match[1]);
  for (const match of script.matchAll(/\bt\("((?:nav|home|shell|devtools)\.[\w.]+)"/g)) used.add(match[1]);
  for (const match of script.matchAll(/"((?:nav|home|shell|devtools)\.[A-Za-z0-9.]+)"/g)) used.add(match[1]);
  for (const item of [...ADMIN_UI_NAV_ITEMS, ...ADMIN_UI_DEV_PANELS]) used.add(item.key);
  assert.ok(used.size > 50);
  for (const key of used) {
    if (!/^[a-zA-Z]+\.[\w.]+$/.test(key)) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  // New shell namespaces must stay in parity between the two locales.
  const shellKeys = (dict) => Object.keys(dict).filter((key) => /^(nav|home|shell|devtools)\./.test(key)).sort();
  assert.deepEqual(shellKeys(zh), shellKeys(en));
  assert.equal(zh['home.allClear'], '一切正常');
  assert.equal(zh['nav.devTools'], '开发者工具');
  for (const key of shellKeys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  }
});

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-shell-test-${randomUUID()}.db`);
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

test('home summary aggregates days by kind in the caller time zone', withDb(async (db) => {
  const projectA = path.resolve(os.tmpdir(), 'am-shell-project-a').replace(/\\/g, '/');
  const projectB = path.resolve(os.tmpdir(), 'am-shell-project-b').replace(/\\/g, '/');
  const observation = (createdAt, agent, project, title, kind, source) => db.saveObservation({
    id: randomUUID(), session_id: randomUUID(), project_path: project, agent_id: agent, title,
    narrative: `${title} narrative`, facts: [], concepts: [], files_read: [], files_modified: [], embedding: [],
    created_at: createdAt, ...(kind ? { record_kind: kind, source_kind: source || 'task' } : {}),
  });
  await observation('2026-10-17 01:00:00', 'codex', projectA, 'Outcome today', 'outcome');
  await observation('2026-10-17 02:30:00', 'codex', projectB, 'Context today', 'context');
  await observation('2026-10-16 17:30:00', 'grok', projectA, 'Explicit after local midnight', 'outcome', 'explicit');
  await observation('2026-10-16 15:00:00', 'codex', projectA, 'Legacy yesterday');
  await observation('2026-09-01 08:00:00', 'codex', projectA, 'Outside the window');

  const taskRow = (id, status, createdAt) => db.sqlWrite((tx) => tx.run(`INSERT INTO task_results (id, task_id, session_id,
    project_path, agent_id, segment_index, segment_count, event_count, source_ids, trigger, status, llm_calls, created_at)
    VALUES (?, ?, 's', ?, 'codex', 0, 1, 1, '[]', 'boundary', ?, 1, ?)`, [id, id, projectA, status, createdAt]));
  await taskRow('t1', 'saved', '2026-10-17 01:00:00');
  await taskRow('t2', 'fallback', '2026-10-17 02:00:00');
  await taskRow('t3', 'saved', '2026-10-15 01:00:00');

  const digest = (project, status, generatedAt, lastError) => db.saveDailyMemoryDigest({
    project_path: project, local_date: '2026-10-17', status, digest: null, source_observation_ids: [],
    prompt_version: 'test', generated_at: generatedAt, last_error: lastError || null,
  });
  await digest(projectB, 'success', '2026-10-17T03:40:00.000Z');
  await digest(projectA, 'failed', '2026-10-17T03:49:00.000Z', 'model timed out');

  await db.saveStateFact({
    project_path: projectA, entity_type: 'automation', entity_key: 'obsidian-vault-daily-review',
    fact_key: 'last_successful_review_at', value: '2026-10-16T09:58:35.000Z', effective_at: '2026-10-16T09:58:35.000Z',
  });

  const now = new Date('2026-10-17T04:00:00.000Z');
  const shanghai = await db.getAdminHomeSummary({ tzOffsetMinutes: 480, days: 30, now });
  assert.equal(shanghai.daily.length, 30);
  assert.equal(shanghai.daily[0].day, '2026-09-18');
  assert.equal(shanghai.today.date, '2026-10-17');
  assert.deepEqual(
    [shanghai.today.total, shanghai.today.outcome, shanghai.today.context, shanghai.today.legacy],
    [3, 2, 1, 0]
  );
  assert.deepEqual(shanghai.daily[28], { day: '2026-10-16', outcome: 0, context: 0, legacy: 1 });
  assert.deepEqual(shanghai.today.agents, [{ agent_id: 'codex', n: 2 }, { agent_id: 'grok', n: 1 }]);
  assert.equal(shanghai.today.projects[0].project_path, projectA);

  assert.equal(shanghai.recent.length, 5);
  assert.equal(shanghai.recent[0].title, 'Context today');
  assert.equal(shanghai.recent[0].record_kind, 'context');
  const explicit = shanghai.recent.find((row) => row.agent_id === 'grok');
  assert.equal(explicit.source_kind, 'explicit');
  const legacy = shanghai.recent.find((row) => row.title === 'Legacy yesterday');
  assert.equal(legacy.record_kind, null);

  assert.deepEqual(shanghai.tasks_today, { total: 2, saved: 1, skipped: 0, fallback: 1, duplicate: 0, other: 0, llm_calls: 2 });
  assert.equal(shanghai.digests.latest.status, 'failed');
  assert.equal(shanghai.digests.latest.project_path, projectA);
  assert.equal(shanghai.digests.latest_day_projects, 2);
  assert.deepEqual(shanghai.digests.failed_recent.map((row) => [row.project_path, row.last_error]), [[projectA, 'model timed out']]);
  assert.equal(shanghai.vault_review.last_successful_review_at, '2026-10-16T09:58:35.000Z');

  // In UTC the 17:30 explicit memory belongs to the previous day.
  const utc = await db.getAdminHomeSummary({ tzOffsetMinutes: 0, days: 7, now });
  assert.equal(utc.daily.length, 7);
  assert.equal(utc.today.total, 2);
  assert.deepEqual(utc.daily[5], { day: '2026-10-16', outcome: 1, context: 0, legacy: 1 });
}));

test('home summary is empty-safe', withDb(async (db) => {
  const summary = await db.getAdminHomeSummary({ tzOffsetMinutes: 480, days: 500 });
  assert.equal(summary.days, 90);
  assert.equal(summary.today.total, 0);
  assert.deepEqual(summary.recent, []);
  assert.equal(summary.digests.latest, null);
  assert.deepEqual(summary.digests.failed_recent, []);
  assert.equal(summary.vault_review.last_successful_review_at, null);
}));

test('worker serves the shell, the home summary route and the worker start time', async () => {
  await withWorker(async ({ base, get }) => {
    const page = await (await fetch(`${base}/admin`)).text();
    assert.match(page, /id="homeView"/);
    assert.match(page, /id="devToolsToggle"/);
    const overview = await get('/admin/api/overview');
    assert.ok(Number.isFinite(Date.parse(overview.startedAt)));
    const summary = await get('/admin/api/home-summary?days=30&tz_offset_minutes=480');
    assert.equal(summary.daily.length, 30);
    assert.equal(summary.tz_offset_minutes, 480);
    assert.equal(typeof summary.tasks_today.total, 'number');
    assert.ok(Array.isArray(summary.recent));
  });
});
