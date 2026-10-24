// Digests & Reviews view (admin UI): markup, i18n, client URL and range, row copy, XSS, glass tokens and drawer docking.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');
const { ADMIN_UI_TRANSLATIONS } = require('../dist/services/admin-ui-copy.js');
const { ADMIN_UI_THEME } = require('../dist/services/admin-ui-theme.js');

const uiHtml = renderAdminPageHtml();
const uiScript = uiHtml.match(/<script>([\s\S]*)<\/script>/)[1];

function uiClientFunction(name) {
  const start = uiScript.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const from = uiScript.slice(start - 6, start) === 'async ' ? start - 6 : start;
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
    if (char === '/' && uiScript[index + 1] === '/' && uiScript[index - 1] !== '\\') {
      index = uiScript.indexOf('\n', index);
      continue;
    }
    if (char === '{') {
      depth += 1;
      seen = true;
    } else if (char === '}') {
      depth -= 1;
      if (seen && depth === 0) return uiScript.slice(from, index + 1);
    }
  }
  assert.fail(`unclosed function ${name}`);
}

function digestsSection() {
  const start = uiHtml.indexOf('<section id="digestsView"');
  assert.ok(start >= 0, 'digestsView section');
  return uiHtml.slice(start, uiHtml.indexOf('<section id="', start + 1));
}

test('Digests view replaces the placeholder and follows Pipeline directly', () => {
  const view = digestsSection();
  assert.match(view, /^<section id="digestsView" class="appView digestsView"/);
  assert.doesNotMatch(view, /placeholderCard|shell\.comingSoon/);
  const pipelineAt = uiHtml.indexOf('<section id="pipelineView"');
  const sections = [...uiHtml.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(sections[sections.indexOf('pipelineView') + 1], 'digestsView');
  assert.ok(pipelineAt < uiHtml.indexOf('<section id="digestsView"'));
  for (const id of ['digLead', 'digUpdated', 'digToolbar', 'digProjectButton', 'digAgentButton', 'digStatusChip', 'digRangeControl', 'digRange7d',
    'digRange30d', 'digRange90d', 'digRangeCustom', 'digCards', 'digNightlyCard', 'digNightlyChip', 'digNextRunValue', 'digLastRunValue',
    'digLastProjectsValue', 'digLastProjectsSub', 'digVaultCard', 'digVaultChip', 'digVaultLastValue', 'digVaultDots', 'digList', 'digNotice',
    'digNoticeAction', 'digLoadMore', 'digProjectPopover', 'digAgentPopover', 'digCustomPopover', 'digCustomFrom', 'digCustomTo']) {
    assert.ok(view.includes(`id="${id}"`), `#${id} lives in the Digests view`);
  }
  for (const [, id] of view.matchAll(/\sid="([^"]+)"/g)) assert.match(id, /^dig/, `${id} uses the dig prefix`);
  const markup = uiHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  assert.deepEqual([...view.matchAll(/data-digest-range="([^"]+)"/g)].map((match) => match[1]), ['7d', '30d', '90d', 'custom']);
  assert.match(uiHtml.match(/<[a-z]+[^>]*\bid="digRange7d"[^>]*>/)[0], /aria-pressed="true"/);
  // The legacy Runtime panel keeps its own digest controls, each id exactly once.
  const legacy = ['dailyDigestCard', 'dailyDigestProjectSelect', 'dailyDigestDateInput', 'dailyDigestRunButton',
    'dailyDigestStatusText', 'dailyDigestLatest', 'dailyDigestList', 'dailyDigestSchedulerEnabledInput',
    'dailyDigestScheduleTimeInput', 'dailyDigestTimeZoneInput', 'dailyDigestLookbackInput',
    'dailyDigestSchedulerSaveButton', 'dailyDigestSchedulerStatusText'];
  for (const id of legacy) {
    const hits = [...markup.matchAll(new RegExp(`\\sid="${id}"`, 'g'))];
    assert.equal(hits.length, 1, `legacy #${id} exists once`);
    assert.ok(!view.includes(`id="${id}"`));
  }
  assert.match(view, /id="digList"[^>]*><\/div>/);
});

test('every Digests i18n key exists in en and zh-CN', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const keys = (dict) => Object.keys(dict).filter((key) => key.startsWith('digests.')).sort();
  assert.ok(keys(en).length > 80);
  assert.deepEqual(keys(zh), keys(en));
  for (const key of keys(en)) assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  const source = uiHtml.replace(/const UI_DICTIONARY = .*\n/, '');
  const used = new Set([...source.matchAll(/"(digests\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  // digestPlural adds "One" to its key.
  for (const key of [...used]) if (Object.prototype.hasOwnProperty.call(en, `${key}One`)) used.add(`${key}One`);
  assert.ok(used.size > 50);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
});

test('Digests client reads digest-list by covered day with the tz offset, and the two status cards', () => {
  assert.match(uiScript, /"\/admin\/api\/digest-list\?"/);
  assert.match(uiScript, /"\/admin\/api\/digest-detail\?id="/);
  assert.match(uiScript, /"\/admin\/api\/vault-reviews\?"/);
  assert.match(uiScript, /fetchJson\("\/admin\/api\/digest-scheduler"\)/);
  const url = uiClientFunction('digestsUrl');
  assert.match(url, /stats: cursor \? "0" : "1"/);
  assert.match(url, /tz_offset_minutes/);
  const load = uiClientFunction('loadDigests');
  assert.match(load, /if \(seq !== dig\.seq\) return;/);
  assert.match(load, /const win = mode === "more" \? dig\.window : getDigestRange\(\)/);
  assert.match(load, /error\.status === 400/);
  assert.match(load, /mergeDigestDays\(dig\.days, days\)/);
  assert.match(uiClientFunction('renderDigestList'), /item\.covered_day/);
  assert.match(uiClientFunction('usesActivityBackdrop'), /state\.activeView === "digestsView"/);
  assert.match(uiClientFunction('memoryDrawerIsDocked'), /host === "digestsView"/);
  assert.match(uiClientFunction('applyReadPolicyToViews'), /dig\.readsDisabled = true/);
  assert.match(uiClientFunction('activateView'), /showDigestsView\(\)/);
  const cards = uiClientFunction('loadDigestCards');
  assert.match(cards, /limit: "1", stats: "1", tz_offset_minutes: tz/);
  assert.match(cards, /"\/admin\/api\/digest-list\?" \+ lastRunParams/);
  assert.match(cards, /if \(seq !== dig\.vaultSeq\) return;/);
  assert.match(uiClientFunction('renderDigestNightly'), /dig\.lastRun/);
  assert.doesNotMatch(uiClientFunction('renderDigestNightly'), /dig\.stats/);
  assert.match(uiClientFunction('bindDigestEvents'), /openDigestMenu/);
  assert.match(uiClientFunction('bindDigestEvents'), /openDigestCustom/);
  assert.match(uiClientFunction('bindDigestEvents'), /applyDigestCustomRange/);
  assert.match(uiClientFunction('renderDigestVault'), /String\(date\.getDate\(\)\)/);
  assert.doesNotMatch(uiClientFunction('renderDigestVault'), /index === 0/);
});

test('getDigestRange covers whole local days ending today', () => {
  const run = (range, extra) => vm.runInNewContext(`
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('getDigestRange')}
    const DIGEST_RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };
    const state = { digests: Object.assign({ range: ${JSON.stringify(range)}, customFrom: "", customTo: "" }, ${JSON.stringify(extra || {})}) };
    const today = shiftDays(new Date(), 0);
    ({ win: getDigestRange(), today: localDayKey(today), tomorrow: localDayKey(shiftDays(today, 1)), weekAgo: localDayKey(shiftDays(today, -6)), monthAgo: localDayKey(shiftDays(today, -89)) });
  `);
  const week = run('7d');
  assert.deepEqual({ ...week.win }, { from: week.weekAgo, to: week.tomorrow });
  const quarter = run('90d');
  assert.deepEqual({ ...quarter.win }, { from: quarter.monthAgo, to: quarter.tomorrow });
  const custom = run('custom', { customFrom: '2026-10-01', customTo: '2026-10-03' });
  assert.deepEqual({ ...custom.win }, { from: '2026-10-01', to: '2026-10-04' });
  // A reversed custom range falls back to 7 days.
  const reversed = run('custom', { customFrom: '2026-10-05', customTo: '2026-10-01' });
  assert.deepEqual({ ...reversed.win }, { from: reversed.weekAgo, to: reversed.tomorrow });
});

function rowRenderer() {
  const en = ADMIN_UI_TRANSLATIONS.en;
  return vm.runInNewContext(`
    const UI = ${JSON.stringify(en)};
    const state = { locale: "en", activity: { hues: new Map() } };
    const ACTIVITY_HUES = 10;
    function t(key, vars) { return String(UI[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && name in vars ? String(vars[name]) : "")); }
    function svgIcon(name) { return "<svg data-icon=\\"" + name + "\\"></svg>"; }
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('formatCount')}
    ${uiClientFunction('parseTimestamp')}
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('formatUiDate')}
    ${uiClientFunction('formatClock')}
    ${uiClientFunction('formatShortDate')}
    ${uiClientFunction('formatPipelineStamp')}
    ${uiClientFunction('digestWrittenLabel')}
    ${uiClientFunction('projectBasename')}
    ${uiClientFunction('projectHue')}
    ${uiClientFunction('digestSkipLabel')}
    ${uiClientFunction('digestPlural')}
    ${uiClientFunction('renderDigestCounts')}
    ${uiClientFunction('renderDigestIcon')}
    ${uiClientFunction('renderDigestRowBody')}
    renderDigestRowBody;
  `);
}

test('digest rows always show text, escape server strings and only colour open questions', () => {
  const render = rowRenderer();
  const base = { id: 'd1', project_path: '/work/harbor-sync', covered_day: '2026-10-16', generated_at: '2026-10-16T15:58:00.000Z', status_detail: 'success', last_error: null };
  const ok = render({ ...base, status: 'succeeded', summary: 'Retry logic stabilized', counts: { facts: 14, decisions: 2, next_actions: 3, open_questions: 1 } });
  assert.match(ok, /harbor-sync/);
  assert.match(ok, /Retry logic stabilized/);
  assert.match(ok, /14 facts/);
  assert.match(ok, /2 decisions/);
  assert.match(ok, /3 next/);
  assert.match(ok, /<span class="digCount is-open">1 open question<\/span>/);
  const quiet = render({ ...base, status: 'succeeded', summary: 'Quiet day', counts: { facts: 1, decisions: 0, next_actions: 0, open_questions: 0 } });
  assert.match(quiet, /1 fact</);
  assert.doesNotMatch(quiet, /decision|next|open question/);
  const skipped = render({ ...base, project_path: '/work/lumen-notes', status: 'skipped', status_detail: 'skipped_no_observations', summary: '', counts: {} });
  assert.match(skipped, /Skipped · no activity/);
  assert.match(skipped, /lumen-notes/);
  assert.match(render({ ...base, status: 'skipped', status_detail: 'skipped_missing_llm', summary: '', counts: {} }), /Skipped · LLM not configured/);
  const failed = render({ ...base, status: 'failed', status_detail: 'failed', summary: '', last_error: 'timeout after 60s', counts: {} });
  assert.match(failed, /digFailDot/);
  assert.match(failed, /timeout after 60s/);
  const hostile = render({ ...base, status: 'succeeded', project_path: '/work/<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>', counts: {} });
  assert.doesNotMatch(hostile, /<script>|<img/);
  assert.match(hostile, /&lt;script&gt;/);
  const hostileFail = render({ ...base, status: 'failed', status_detail: 'failed', summary: '<script>alert(1)</script>', last_error: '<img src=x onerror=alert(1)>', counts: {} });
  assert.doesNotMatch(hostileFail, /<script>|<img/);
  assert.match(hostileFail, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Digests joins the shared glass tokens in light and dark and docks the drawer only at 1440px', () => {
  assert.match(ADMIN_UI_THEME, /\.activityView,\s*\.memoryView,\s*\.pipelineView,\s*\.digestsView \{\s*position: relative;\s*--a-glass:/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.pipelineView,\s*html\[data-glass="dark"\] \.digestsView \{\s*--a-well-blur:/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.digestsView \{\s*--d-glass:/);
  // New fills follow the Background opacity slider.
  const digestTokens = ADMIN_UI_THEME.slice(ADMIN_UI_THEME.indexOf('  .digestsView {\n    --d-glass:'));
  assert.match(digestTokens, /--d-glass: linear-gradient\(180deg, rgba\(255, 255, 255, calc\(0\.58 \* var\(--glass-scale\)\)\)/);
  assert.match(digestTokens, /--d-well: linear-gradient\(180deg, rgba\(255, 255, 255, calc\(0\.42 \* var\(--glass-scale\)\)\)/);
  assert.match(ADMIN_UI_THEME, /@media \(min-width: 1440px\) \{\s*\.digestsView\.is-drawer-open \.digList,/);
});

function parseDigestUrl(href) {
  return new URL(href, 'http://admin.local');
}

test('digest-list query carries project, agent, failed and custom to = end+1 without a cursor', () => {
  const href = vm.runInNewContext(`
    const DIGEST_PAGE = 50;
    const DIGEST_RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };
    const state = { digests: { project: "/work/harbor-sync", agent: "codex", status: "failed", range: "custom", customFrom: "2026-10-01", customTo: "2026-10-03" } };
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('getDigestRange')}
    ${uiClientFunction('digestsUrl')}
    digestsUrl(getDigestRange(), null);
  `, { URLSearchParams });
  const url = parseDigestUrl(href);
  assert.equal(url.pathname, '/admin/api/digest-list');
  assert.equal(url.searchParams.get('project'), '/work/harbor-sync');
  assert.equal(url.searchParams.get('agent'), 'codex');
  assert.equal(url.searchParams.get('status'), 'failed');
  assert.equal(url.searchParams.get('from'), '2026-10-01');
  assert.equal(url.searchParams.get('to'), '2026-10-04');
  assert.equal(url.searchParams.get('stats'), '1');
  assert.equal(url.searchParams.get('cursor'), null);
  assert.ok(url.searchParams.get('tz_offset_minutes') !== null);

  const paged = vm.runInNewContext(`
    const DIGEST_PAGE = 50;
    const state = { digests: { project: "", agent: "", status: "" } };
    ${uiClientFunction('digestsUrl')}
    digestsUrl({ from: "2026-10-01", to: "2026-10-08" }, "cursor-token");
  `, { URLSearchParams });
  const more = parseDigestUrl(paged);
  assert.equal(more.searchParams.get('stats'), '0');
  assert.equal(more.searchParams.get('cursor'), 'cursor-token');
  assert.equal(more.searchParams.get('project'), null);
  assert.equal(more.searchParams.get('status'), null);
});

test('project and agent pickers list All first and use first-page facets', () => {
  const result = vm.runInNewContext(`
    const state = {
      locale: "en",
      digests: {
        project: "",
        agent: "codex",
        facets: { projects: ["/work/lumen-notes", "/work/harbor-sync"], agents: ["codex", "grok"] },
      },
    };
    function t(key) { return key === "digests.allProjects" ? "All projects" : key === "digests.allAgents" ? "All agents" : key; }
    function projectBasename(value) { return String(value || "").split("/").pop(); }
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${uiClientFunction('agentOptionKey')}
    ${uiClientFunction('sameAgent')}
    ${uiClientFunction('canonicalAgentOption')}
    ${uiClientFunction('isActivitySelected')}
    ${uiClientFunction('digestFacetValues')}
    ${uiClientFunction('digestMenuOptions')}
    ({
      projects: digestMenuOptions("project"),
      agents: digestMenuOptions("agent"),
    });
  `);
  assert.equal(result.projects[0].value, '');
  assert.equal(result.projects[0].label, 'All projects');
  assert.deepEqual(JSON.parse(JSON.stringify(result.projects.slice(1).map((item) => item.value))), ['/work/harbor-sync', '/work/lumen-notes']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.projects.slice(1).map((item) => item.label))), ['harbor-sync', 'lumen-notes']);
  assert.equal(result.projects[1].title, '/work/harbor-sync');
  assert.equal(result.agents[0].label, 'All agents');
  const agentOptions = result.agents.slice(1);
  assert.deepEqual(Array.from(agentOptions, (item) => item.value).sort(), ['codex', 'grok-build']);
  assert.equal(agentOptions.find((item) => item.value === 'grok-build').label, 'Grok Build');
  assert.equal(agentOptions.find((item) => item.value === 'codex').label, 'codex');
  const agentLabels = Array.from(agentOptions, (item) => item.label);
  assert.deepEqual(agentLabels, [...agentLabels].sort((left, right) => left.localeCompare(right)));
});

test('Home last-digest headline uses the covered local_date, not generated_at', () => {
  const health = uiClientFunction('renderHomeHealth');
  const digestBlock = health.slice(health.indexOf('const latest = summary.digests'), health.indexOf('els.homeVaultCard'));
  assert.match(digestBlock, /parseLocalDay\(latest\.local_date\)/);
  assert.match(digestBlock, /formatShortDate\(covered\)/);
  assert.doesNotMatch(digestBlock, /formatShortDate\(generatedAt\)|formatClock\(generatedAt\)/);

  const result = vm.runInNewContext(`
    const state = { locale: "en" };
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('parseTimestamp')}
    ${uiClientFunction('formatUiDate')}
    ${uiClientFunction('formatShortDate')}
    const latest = { local_date: "2026-10-16", generated_at: "2026-10-17T01:54:00+08:00" };
    const covered = parseLocalDay(latest.local_date);
    ({ headline: formatShortDate(covered), day: covered.getDate(), month: covered.getMonth(), year: covered.getFullYear() });
  `);
  assert.match(result.headline, /Oct 16/);
  assert.equal(result.day, 16);
  assert.equal(result.month, 9);
  assert.equal(result.year, 2026);
});

test('Home attnDigestFailed opens Digests with Failed, the project and a range that includes that day', () => {
  const attention = uiClientFunction('collectAttentionItems');
  assert.match(attention, /home\.attnDigestFailed/);
  assert.match(attention, /digestStatus: "failed"/);
  assert.match(attention, /digestProject: digest\.project_path/);
  assert.match(attention, /digestDate: digest\.local_date/);
  assert.match(uiClientFunction('renderHomeAttention'), /data-digest-status="/);
  assert.match(uiClientFunction('bindEvents'), /presetDigestFilters\(trigger\.getAttribute\("data-digest-project"\)/);
  const preset = vm.runInNewContext(`
    const state = { digests: { project: "", agent: "codex", status: "", range: "7d", customFrom: "", customTo: "" } };
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('presetDigestFilters')}
    presetDigestFilters("/work/harbor-sync", "failed", "2026-10-16");
    const failed = Object.assign({}, state.digests);
    presetDigestFilters("", "bogus", "not-a-day");
    ({ failed, cleared: Object.assign({}, state.digests) });
  `);
  assert.equal(preset.failed.project, '/work/harbor-sync');
  assert.equal(preset.failed.agent, '');
  assert.equal(preset.failed.status, 'failed');
  assert.equal(preset.failed.range, 'custom');
  assert.equal(preset.failed.customFrom, '2026-10-16');
  assert.equal(preset.failed.customTo, '2026-10-16');
  assert.equal(preset.cleared.status, '');
  assert.equal(preset.cleared.range, '7d');
});

test('digest drawer escapes hostile summary, last_error and source titles', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const result = vm.runInNewContext(`
    const DIGEST_FACTS_PREVIEW = 3;
    const DIGEST_SOURCES_PREVIEW = 5;
    const state = { locale: "en", drawer: { digestFactsOpen: false, digestSourcesOpen: false } };
    function t(key) { return key; }
    function svgIcon() { return "<svg></svg>"; }
    function formatCount(value) { return String(Number(value || 0)); }
    function formatShortDate() { return "Oct 16"; }
    function formatClock() { return "01:54"; }
    function formatPipelineStamp() { return "Oct 16 · 01:54"; }
    function parseTimestamp(value) { return value ? new Date(value) : null; }
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('digestWrittenLabel')}
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('renderFactText')}
    ${uiClientFunction('digestStrings')}
    ${uiClientFunction('digestSection')}
    ${uiClientFunction('digestBullets')}
    ${uiClientFunction('renderDigestDrawerBody')}
    const ok = renderDigestDrawerBody({
      digest: {
        id: "d-ok", status: "succeeded", model: "x", source_count: 1, confidence: 0.8,
        generated_at: "2026-10-16T15:58:00.000Z", last_error: null,
        body: { summary: ${JSON.stringify(hostile)}, facts: [], decisions: [], next_actions: [], open_questions: [] },
      },
      sources: [{ id: "obs-1", title: ${JSON.stringify(hostile)}, created_at: "2026-10-16T12:00:00.000Z", missing: false }],
    });
    const failed = renderDigestDrawerBody({
      digest: { id: "d-fail", status: "failed", last_error: ${JSON.stringify(hostile)}, body: null, generated_at: "2026-10-16T15:58:00.000Z" },
      sources: [],
    });
    ({ ok, failed });
  `);
  assert.doesNotMatch(result.ok, /<img/);
  assert.match(result.ok, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.ok, /digSourceTitle/);
  assert.doesNotMatch(result.failed, /<img/);
  assert.match(result.failed, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

function digestTimeText(html) {
  const match = String(html).match(/<time class="digTime"[^>]*>([^<]*)<\/time>/);
  assert.ok(match, 'digest row time');
  return match[1];
}

test('digest written time adds the short date only when it falls on another local day', () => {
  const render = rowRenderer();
  const result = vm.runInNewContext(`
    const UI = ${JSON.stringify(ADMIN_UI_TRANSLATIONS.en)};
    const DIGEST_FACTS_PREVIEW = 3;
    const DIGEST_SOURCES_PREVIEW = 5;
    const state = { locale: "en", drawer: { digestFactsOpen: false, digestSourcesOpen: false } };
    function t(key, vars) { return String(UI[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && name in vars ? String(vars[name]) : "")); }
    function svgIcon() { return "<svg></svg>"; }
    ${uiClientFunction('formatCount')}
    ${uiClientFunction('parseTimestamp')}
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('formatUiDate')}
    ${uiClientFunction('formatClock')}
    ${uiClientFunction('formatShortDate')}
    ${uiClientFunction('formatPipelineStamp')}
    ${uiClientFunction('digestWrittenLabel')}
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('renderFactText')}
    ${uiClientFunction('digestStrings')}
    ${uiClientFunction('digestSection')}
    ${uiClientFunction('digestBullets')}
    ${uiClientFunction('renderDigestDrawerBody')}
    const same = new Date(2026, 9, 16, 23, 50, 0);
    const next = new Date(2026, 9, 17, 1, 54, 0);
    function footer(generated) {
      const html = renderDigestDrawerBody({
        digest: {
          id: "d1", status: "succeeded", covered_day: "2026-10-16", model: "m", source_count: 1, confidence: 0.5,
          generated_at: generated.toISOString(), last_error: null,
          body: { summary: "Quiet day", facts: [], decisions: [], next_actions: [], open_questions: [] },
        },
        sources: [],
      });
      const match = html.match(/<dt>Written<\\/dt><dd>([^<]*)<\\/dd>/);
      return match ? match[1] : "";
    }
    ({
      sameIso: same.toISOString(),
      nextIso: next.toISOString(),
      sameClock: formatClock(same),
      nextClock: formatClock(next),
      sameStamp: formatPipelineStamp(same),
      nextStamp: formatPipelineStamp(next),
      sameFooter: footer(same),
      nextFooter: footer(next),
    });
  `);
  const base = {
    id: 'd1', project_path: '/work/harbor-sync', covered_day: '2026-10-16', status: 'succeeded',
    status_detail: 'success', summary: 'Quiet day', counts: { facts: 1 }, last_error: null,
  };
  const sameRow = render({ ...base, generated_at: result.sameIso });
  const nextRow = render({ ...base, generated_at: result.nextIso });
  assert.equal(digestTimeText(sameRow), result.sameClock);
  assert.equal(digestTimeText(nextRow), result.nextStamp);
  assert.notEqual(result.nextStamp, result.nextClock);
  assert.match(result.nextStamp, / · /);
  assert.match(sameRow, /title="\/work\/harbor-sync"/);
  assert.equal(result.sameFooter, result.sameClock);
  assert.equal(result.nextFooter, result.nextStamp);
  assert.match(result.sameStamp, / · /);
});

test('digest day headers lead with Today or Yesterday like Memory', () => {
  const run = (locale, dict) => vm.runInNewContext(`
    const UI = ${JSON.stringify(dict)};
    const state = { locale: ${JSON.stringify(locale)} };
    function t(key) { return UI[key] || key; }
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('calendarDaysAgo')}
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('formatUiDate')}
    ${uiClientFunction('memoryDayLabel')}
    ${uiClientFunction('digestDayLabel')}
    const today = localDayKey(shiftDays(new Date(), 0));
    const yesterday = localDayKey(shiftDays(new Date(), -1));
    const olderKey = localDayKey(shiftDays(new Date(), -3));
    const olderDate = parseLocalDay(olderKey);
    ({
      todayLabel: digestDayLabel(today),
      yesterdayLabel: digestDayLabel(yesterday),
      olderLabel: digestDayLabel(olderKey),
      memoryToday: memoryDayLabel(today),
      memoryYesterday: memoryDayLabel(yesterday),
      olderName: formatUiDate(olderDate, "day"),
      olderWeekday: formatUiDate(olderDate, "weekday"),
    });
  `);
  const en = run('en', ADMIN_UI_TRANSLATIONS.en);
  assert.equal(en.todayLabel.name, 'Today');
  assert.equal(en.todayLabel.relative, true);
  assert.equal(en.todayLabel.date, en.memoryToday.date);
  assert.match(en.todayLabel.date, /^[A-Z][a-z]{2} \d{1,2}/);
  assert.equal(en.yesterdayLabel.name, 'Yesterday');
  assert.equal(en.yesterdayLabel.relative, true);
  assert.equal(en.yesterdayLabel.date, en.memoryYesterday.date);
  assert.equal(en.olderLabel.relative, false);
  assert.equal(en.olderLabel.name, en.olderName);
  assert.equal(en.olderLabel.date, en.olderWeekday);
  assert.notEqual(en.olderLabel.name, 'Today');
  assert.notEqual(en.olderLabel.name, 'Yesterday');
  const zh = run('zh-CN', ADMIN_UI_TRANSLATIONS['zh-CN']);
  assert.equal(zh.todayLabel.name, '今天');
  assert.equal(zh.yesterdayLabel.name, '昨天');
  assert.equal(zh.todayLabel.date, zh.memoryToday.date);
  assert.equal(zh.yesterdayLabel.date, zh.memoryYesterday.date);
  assert.equal(zh.olderLabel.name, zh.olderName);
  assert.equal(zh.olderLabel.date, zh.olderWeekday);
  const list = uiClientFunction('renderDigestList');
  const head = list.slice(list.indexOf('group.head.innerHTML'), list.indexOf('syncDigestRows'));
  assert.ok(head.indexOf('memDayName') < head.indexOf('memDayDate'));
  assert.match(head, /escapeHtml\(label\.name\)/);
  assert.match(head, /escapeHtml\(label\.date\)/);
  assert.match(uiClientFunction('digestDayLabel'), /memoryDayLabel\(dayKey\)/);
});
