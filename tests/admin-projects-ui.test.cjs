// Projects view (admin UI): markup, i18n, client URL and wiring, row and drawer copy, XSS, glass tokens and drawer docking.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');
const { ADMIN_UI_TRANSLATIONS } = require('../dist/services/admin-ui-copy.js');
const { ADMIN_UI_NAV_ITEMS } = require('../dist/services/admin-ui-markup.js');
const { ADMIN_UI_THEME } = require('../dist/services/admin-ui-theme.js');

const uiHtml = renderAdminPageHtml();
const uiScript = uiHtml.match(/<script>([\s\S]*)<\/script>/)[1];
const hostile = '<img src=x onerror=alert(1)>';

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

function projectsSection() {
  const start = uiHtml.indexOf('<section id="projectsView"');
  assert.ok(start >= 0, 'projectsView section');
  return uiHtml.slice(start, uiHtml.indexOf('<section id="', start + 1));
}

test('Projects view replaces the placeholder and follows Digests directly', () => {
  const view = projectsSection();
  assert.match(view, /^<section id="projectsView" class="appView projectsView"/);
  assert.doesNotMatch(view, /placeholderCard|shell\.comingSoon/);
  const sections = [...uiHtml.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(sections[sections.indexOf('digestsView') + 1], 'projectsView');
  // Skills follows Projects directly and is a real page, not a placeholder.
  assert.equal(sections[sections.indexOf('projectsView') + 1], 'skillsView');
  const skillsAt = uiHtml.indexOf('<section id="skillsView"');
  assert.doesNotMatch(uiHtml.slice(skillsAt, uiHtml.indexOf('<section id="', skillsAt + 1)), /placeholderCard|shell\.comingSoon/);
  assert.deepEqual(
    ADMIN_UI_NAV_ITEMS.map((item) => [item.id, item.target, item.key]).find((row) => row[0] === 'navProjects'),
    ['navProjects', 'projectsView', 'nav.projects'],
  );
  assert.match(uiHtml, /id="navProjects"[^>]*data-nav-target="projectsView"/);
  assert.match(uiHtml, /id="navProjects"[\s\S]*?data-i18n="nav\.projects"/);
  for (const id of ['prjLead', 'prjToolbar', 'prjSearchInput', 'prjSearchClear', 'prjSortButton', 'prjSortValue', 'prjRangeControl', 'prjRange7',
    'prjRange30', 'prjRange90', 'prjStats', 'prjStatProjectsValue', 'prjStatActiveLabel', 'prjStatDigestsValue', 'prjStatSkillsValue',
    'prjStatSkillsNote', 'prjCard', 'prjList', 'prjCount', 'prjLoadMore', 'prjNotice', 'prjNoticeAction', 'prjSortPopover']) {
    assert.ok(view.includes(`id="${id}"`), `#${id} lives in the Projects view`);
  }
  for (const [, id] of view.matchAll(/\sid="([^"]+)"/g)) if (id !== 'projectsView') assert.match(id, /^prj/, `${id} uses the prj prefix`);
  const markup = uiHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  for (const id of ['contextProjectSelect', 'contextStatusText', 'stateProjectSelect', 'stateWriteProjectSelect', 'proceduralProjectSelect', 'projectSelect', 'projectsCount']) {
    assert.equal([...markup.matchAll(new RegExp(`\\sid="${id}"`, 'g'))].length, 1, `legacy #${id} exists once`);
    assert.ok(!view.includes(`id="${id}"`));
  }
  // 7 | 30 | 90 days, 30 pressed, no custom range.
  assert.deepEqual([...view.matchAll(/data-project-range="([^"]+)"/g)].map((match) => match[1]), ['7', '30', '90']);
  assert.match(uiHtml.match(/<[a-z]+[^>]*\bid="prjRange30"[^>]*>/)[0], /aria-pressed="true"/);
  assert.doesNotMatch(view, /custom/i);
  assert.match(view, /id="prjList"[^>]*><\/div>/);
});

test('every Projects i18n key exists in en and zh-CN with the same placeholders', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const keys = (dict) => Object.keys(dict).filter((key) => key.startsWith('projects.')).sort();
  assert.ok(keys(en).length > 60);
  assert.deepEqual(keys(zh), keys(en));
  const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of keys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
    assert.deepEqual(vars(zh[key]), vars(en[key]), `${key} placeholders`);
  }
  const source = uiHtml.replace(/const UI_DICTIONARY = .*\n/, '');
  const used = new Set([...source.matchAll(/"(projects\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  for (const key of [...used]) if (Object.prototype.hasOwnProperty.call(en, `${key}One`)) used.add(`${key}One`);
  assert.ok(used.size > 40);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  // No tokens anywhere: the startup context counts items and chars.
  for (const key of keys(en)) assert.doesNotMatch(String(en[key]), /token/i, `${key} mentions tokens`);
});

test('project-list URL carries days, sort, limit, tz and q, and a cursor only for later pages', () => {
  const run = (projects, cursor) => new URL(vm.runInNewContext(`
    const PROJECT_PAGE = 50;
    const state = { projects: ${JSON.stringify(projects)} };
    ${uiClientFunction('projectsUrl')}
    projectsUrl(${JSON.stringify(cursor)});
  `, { URLSearchParams }), 'http://admin.local');
  const first = run({ q: '  harbor ', sort: 'last_activity', days: 30 }, null);
  assert.equal(first.pathname, '/admin/api/project-list');
  assert.equal(first.searchParams.get('days'), '30');
  assert.equal(first.searchParams.get('sort'), 'last_activity');
  assert.equal(first.searchParams.get('limit'), '50');
  assert.equal(first.searchParams.get('q'), 'harbor');
  assert.equal(first.searchParams.get('cursor'), null);
  assert.ok(first.searchParams.get('tz_offset_minutes') !== null);
  const more = run({ q: '', sort: 'name', days: 7 }, 'cursor-token');
  assert.equal(more.searchParams.get('q'), null);
  assert.equal(more.searchParams.get('days'), '7');
  assert.equal(more.searchParams.get('cursor'), 'cursor-token');
});

test('Projects client wiring: sequencing, stale cursor, reads off, backdrop, docking and detail by key', () => {
  assert.match(uiScript, /sort: "last_activity",\s*days: 30,/);
  assert.match(uiScript, /PROJECT_SEARCH_DEBOUNCE_MS = 250/);
  const load = uiClientFunction('loadProjects');
  assert.match(load, /if \(seq !== prj\.seq\) return;/);
  assert.match(load, /error\.status === 400/);
  assert.match(load, /cursor/i);
  assert.match(load, /payload\.disabled/);
  assert.match(load, /payload\.status === "reads_disabled"/);
  const policy = uiClientFunction('applyReadPolicyToViews');
  assert.match(policy, /prj\.readsDisabled = true/);
  assert.match(policy, /prj\.seq \+= 1/);
  assert.match(policy, /els\.prjList\.innerHTML = ""/);
  assert.match(policy, /loadProjects\("reset"\)/);
  assert.doesNotMatch(uiScript, /usesActivityBackdrop|data-act-bg/);
  assert.match(uiClientFunction('memoryDrawerIsDocked'), /host === "projectsView"/);
  assert.match(uiClientFunction('activateView'), /showProjectsView\(\)/);
  const open = uiClientFunction('openProjectDrawer');
  assert.match(open, /"\/admin\/api\/project-detail\?"/);
  assert.match(open, /project: key/);
  assert.match(open, /days: String\(state\.projects\.days\)/);
  assert.match(open, /tz_offset_minutes/);
  assert.match(open, /if \(seq !== drawer\.seq\) return;/);
  assert.match(open, /payload\.status === "reads_disabled"/);
  assert.match(open, /error\.status === 404/);
  assert.match(open, /"missing"/);
  assert.match(open, /mountMemoryDrawer\("projectsView"\)/);
  assert.match(uiClientFunction('closeMemoryDrawer'), /drawer\.seq \+= 1/);
  assert.match(uiClientFunction('closeMemoryDrawer'), /drawer\.project = ""/);
  // A 404 keeps the drawer open on a quiet missing state and drops the list row's selection.
  assert.match(uiClientFunction('markOpenMemory'), /projectError === "missing" \? "" : state\.drawer\.project/);
  assert.equal(ADMIN_UI_TRANSLATIONS.en['projects.drawerMissing'], 'Project not found');
  assert.match(uiClientFunction('setProjectFilters'), /openProjectDrawer/);
  assert.match(uiClientFunction('syncProjectRows'), /setAttribute\("data-project-key", key\)/);
  assert.match(uiClientFunction('copyMemoryId'), /display_name/);
  assert.match(uiClientFunction('openProjectDigest'), /openDigestDrawer/);
  const notice = uiClientFunction('renderProjectNotice');
  assert.match(notice, /projects\.readsDisabledTitle/);
  assert.match(notice, /projects\.unavailableTitle/);
  assert.match(notice, /projects\.errorTitle/);
  assert.match(notice, /projects\.emptyTitle/);
  assert.match(notice, /projects\.noMatchTitle/);
  assert.match(notice, /projects\.retry/);
  const projectsCode = uiScript.slice(uiScript.indexOf('// ---------- Projects ----------'), uiScript.indexOf('async function loadReleaseCheck'));
  assert.doesNotMatch(projectsCode, /project_path/);
  assert.doesNotMatch(projectsCode, /\btokens?\b/i);
  // The path is never read by the projects code.
  for (const name of ['renderProjectRowBody', 'renderProjectDrawer', 'renderProjectDrawerBody', 'copyMemoryId', 'projectsUrl', 'syncProjectRows', 'openProjectDrawer', 'projectDrawerItem']) {
    assert.doesNotMatch(uiClientFunction(name), /project_path/, `${name} must not touch project_path`);
  }
});

function projectsSandbox() {
  return vm.createContext({
    UI: ADMIN_UI_TRANSLATIONS.en,
    state: { locale: 'en', projects: { days: 30, items: [] }, drawer: { project: '', projectPayload: null, projectContextOpen: false, projectFactsOpen: false } },
  });
}

function loadRenderers(context) {
  vm.runInContext(`
    const PROJECT_AGENT_CHIPS = 2;
    const PROJECT_FACTS_PREVIEW = 5;
    const PROJECT_CONTEXT_LINES = 3;
    function t(key, vars) { return String(UI[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && name in vars ? String(vars[name]) : "")); }
    function svgIcon(name) { return "<svg data-icon=\\"" + name + "\\"></svg>"; }
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${uiClientFunction('formatCount')}
    ${uiClientFunction('parseTimestamp')}
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('formatUiDate')}
    ${uiClientFunction('statusVariantClass')}
    ${uiClientFunction('statusChip')}
    ${uiClientFunction('formatShortDate')}
    ${uiClientFunction('calendarDaysAgo')}
    ${uiClientFunction('findProjectItem')}
    ${uiClientFunction('projectDrawerItem')}
    ${uiClientFunction('projectPlural')}
    ${uiClientFunction('projectAgo')}
    ${uiClientFunction('renderProjectIcon')}
    ${uiClientFunction('renderProjectAgents')}
    ${uiClientFunction('renderProjectRowBody')}
    ${uiClientFunction('projectSection')}
    ${uiClientFunction('projectEmpty')}
    ${uiClientFunction('projectShowToggle')}
    ${uiClientFunction('renderProjectBars')}
    ${uiClientFunction('projectFactValue')}
    ${uiClientFunction('renderProjectDrawerBody')}
  `, context);
  return context;
}

const baseItem = {
  project_key: 'p_c9b7172c823a6530', display_name: 'harbor-sync', display_name_collision: false, project_path: '/work/<img src=x onerror=alert(1)>/harbor-sync',
  memories_total: 2089, memories_in_range: 412, last_activity_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  agents: [{ agent_id: 'claude-code', count: 260 }, { agent_id: 'codex', count: 152 }, { agent_id: 'team/bot-1', count: 3 }],
  state_facts_count: 3, latest_digest_covered_day: '2026-10-23', digest_days_in_range: 24, skills_count: 2, candidates_count: 1, startup_context_tokens: 4096,
};

test('project rows show range counts, two agent chips then +N, and fade without activity; strings are escaped', () => {
  const context = loadRenderers(projectsSandbox());
  const render = (item) => vm.runInContext(`renderProjectRowBody(${JSON.stringify(item)})`, context);
  const row = render(baseItem);
  assert.match(row, /harbor-sync/);
  assert.match(row, /claude-code<\/span><span class="prjChipCount">260/);
  assert.match(row, /codex<\/span><span class="prjChipCount">152/);
  assert.match(row, /class="prjChip is-more"[^>]*>\+1</);
  assert.match(row, />412</);
  assert.match(row, /of 2,089/);
  assert.match(row, /2h ago/);
  assert.match(row, /24 \/ 30/);
  assert.match(row, /class="prjCand"[^>]*>\+1</);
  assert.match(row, /team\/bot-1 3/);
  assert.doesNotMatch(row, /\/work\//);
  assert.doesNotMatch(row, /startup_context_tokens|4096/);
  const quiet = render({ ...baseItem, memories_in_range: 0, agents: [], skills_count: 0, candidates_count: 0, digest_days_in_range: 0 });
  assert.match(quiet, /No activity in 30 days/);
  assert.doesNotMatch(quiet, /prjChip/);
  assert.match(quiet, /class="prjDash">—</);
  assert.doesNotMatch(quiet, /prjCand/);
  const evil = render({ ...baseItem, display_name: hostile, agents: [{ agent_id: '<script>x</script>', count: 1 }] });
  assert.doesNotMatch(evil, /<img|<script>/);
  assert.match(evil, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const bare = render({ ...baseItem, memories_in_range: 4, last_activity_at: null, latest_digest_covered_day: null, startup_context_tokens: null });
  assert.match(bare, /No memories/);
  assert.match(bare, /No digest yet/);
  assert.doesNotMatch(bare, /\bnull\b|startup_context_tokens|\/work\//);
});

const detail = {
  project: baseItem,
  startup_context: { preview: 'State: branch feat/sync-retry\nDigest Oct 23: retry queue backs off\nSkill: run smoke test\nline four', truncated: true, chars: 6120, item_count: 9, generated_at: null, tokens: 4096 },
  state_facts: [{ entity_type: 'ci', entity_key: 'upload-tests', fact_key: 'status', value: '"green"', effective_at: null, updated_at: null },
    { entity_type: 'repo', entity_key: 'harbor-sync', fact_key: 'branch', value: '{"name":"main"}', effective_at: null, updated_at: null }],
  state_facts_total: 2,
  recent_digests: [{ id: 1000, covered_day: '2026-10-23', status: 'succeeded', summary_first_sentence: 'Retry queue backs off.' },
    { id: 1002, covered_day: '2026-10-21', status: 'skipped', summary_first_sentence: null },
    { id: 1004, covered_day: '2026-10-19', status: 'failed', summary_first_sentence: null }],
  skills: [{ id: 11, kind: 'skill', name: 'Run the sync smoke test', status: 'active', match_count_in_range: 14, last_matched_at: null, source_digest: null },
    { id: 12, kind: 'skill', name: 'Pause the nightly export', summary: 'Hold the export until the queue drains.', status: 'disabled', match_count_in_range: 0, last_matched_at: null, source_digest: null },
    { id: 'c_1001_0', kind: 'digest_candidate', name: 'Reset the retry queue', status: 'candidate', match_count_in_range: 0, last_matched_at: null, source_digest: { id: 1001, covered_day: '2026-10-23' } },
    { id: 'c_1008_0', kind: 'digest_candidate', name: 'Retry a dropped upload', status: 'candidate', match_count_in_range: 0, last_matched_at: null, source_digest: null },
    { id: 'c_1009_0', kind: 'digest_candidate', name: 'Keep the local cache', status: 'candidate', match_count_in_range: 0, last_matched_at: null, source_digest: { id: 9, covered_day: null } }],
  days: Array.from({ length: 14 }, (_v, index) => ({ date: `2026-10-${String(11 + index).padStart(2, '0')}`, memories: index % 3 ? index : 0 })),
};

test('project drawer: 14 bars, items and chars without tokens, facts, digest links and skills', () => {
  const context = loadRenderers(projectsSandbox());
  const html = vm.runInContext(`renderProjectDrawerBody(${JSON.stringify(detail)})`, context);
  assert.equal((html.match(/class="prjBar[ "]/g) || []).length, 14);
  assert.match(html, /prjBar is-zero/);
  assert.match(html, /9 items · 6,120 chars/);
  assert.doesNotMatch(html, /token/i);
  assert.doesNotMatch(html, />4096</);
  // Collapsed: the first three lines and the expand toggle.
  assert.match(html, /retry queue backs off\nSkill: run smoke test<\/pre>/);
  assert.doesNotMatch(html, /line four/);
  assert.match(html, /data-project-toggle="context"/);
  assert.match(html, /<span class="prjFactScope">upload-tests<\/span>status/);
  assert.match(html, /<dd title="green">green<\/dd>/);
  assert.match(html, /<dd title="name: main">name: main<\/dd>/);
  assert.match(html, /data-project-digest="1000"/);
  assert.match(html, /prjDigest is-skipped[\s\S]*?>Skipped</);
  assert.match(html, /prjDigest is-failed[\s\S]*?>Failed</);
  assert.match(html, /14 matches/);
  assert.match(html, /from Oct 23 digest/);
  assert.match(html, /digChip is-ok/);
  assert.match(html, /digChip is-warn/);
  assert.match(html, /digChip is-muted[\s\S]*?>Disabled</);
  assert.match(html, /Never matched/);
  assert.match(html, /prjSkillMeta">—</);
  assert.doesNotMatch(html, /\/work\/|\bnull\b|token/i);

  vm.runInContext('state.drawer.projectContextOpen = true;', context);
  const open = vm.runInContext(`renderProjectDrawerBody(${JSON.stringify(detail)})`, context);
  assert.match(open, /line four<\/pre>/);
  assert.match(open, /Showing the first \d[\d,]* of 6,120 chars/);
});

test('project drawer empty states read as intentional and hostile strings are escaped', () => {
  const context = loadRenderers(projectsSandbox());
  const empty = vm.runInContext(`renderProjectDrawerBody(${JSON.stringify({
    project: { ...baseItem, memories_in_range: 0 }, startup_context: { preview: '', truncated: false, chars: 0, item_count: 0, tokens: null },
    state_facts: [], state_facts_total: 0, recent_digests: [], skills: [], days: detail.days.map((day) => ({ ...day, memories: 0 })),
  })})`, context);
  assert.match(empty, /No memories in the last 14 days/);
  assert.match(empty, /Nothing in the startup context yet/);
  assert.match(empty, /No state facts recorded/);
  assert.match(empty, /No digests yet/);
  assert.match(empty, /No skills yet — candidates appear after nightly digests/);
  const evil = vm.runInContext(`renderProjectDrawerBody(${JSON.stringify({
    ...detail,
    startup_context: { ...detail.startup_context, preview: hostile },
    state_facts: [{ entity_type: 'x', entity_key: hostile, fact_key: hostile, value: JSON.stringify(hostile) }],
    recent_digests: [{ id: hostile, covered_day: '2026-10-23', status: 'succeeded', summary_first_sentence: hostile }],
    skills: [{ id: 1, kind: 'skill', name: hostile, summary: hostile, status: 'active', match_count_in_range: 1 }],
  })})`, context);
  assert.doesNotMatch(evil, /<img/);
  assert.match(evil, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Projects joins the shared glass tokens in light and dark and docks the drawer only at 1440px', () => {
  assert.match(ADMIN_UI_THEME, /\.projectsView,\s*\.activityView,\s*\.memoryView,\s*\.pipelineView,\s*\.digestsView \{\s*position: relative;/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.projectsView,\s*html\[data-glass="dark"\] \.activityView,/);
  assert.match(ADMIN_UI_THEME, /\.projectsView,\s*\.digestsView \{\s*--d-glass:/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.projectsView,\s*html\[data-glass="dark"\] \.digestsView \{\s*--d-glass:/);
  assert.match(ADMIN_UI_THEME, /\.projectsView\.is-active,/);
  assert.match(ADMIN_UI_THEME, /@media \(min-width: 1440px\) \{\s*\.projectsView\.is-drawer-open \.prjBoard \{/);
  // Folder icons share one tint: no per-project hue on the Projects page.
  assert.doesNotMatch(uiClientFunction('renderProjectRowBody'), /projectHue|data-hue/);
  const css = uiHtml.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
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
  assert.match(css, /\.appView\.is-active \.actScrim \{\s*-webkit-backdrop-filter: blur\(2px\);\s*backdrop-filter: blur\(2px\);/);
});

test('partial project pages mark summed tiles with a plus and a loaded-count sub-label', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  assert.equal(en['projects.statLoaded'], 'in {n} loaded projects');
  assert.equal(en['projects.statLoadedOne'], 'in 1 loaded project');
  assert.equal(zh['projects.statLoaded'], '已加载 {n} 个项目');
  assert.equal(zh['projects.statLoadedOne'], '已加载 1 个项目');
  assert.equal(en['projects.statCandidatesOne'], '{n} candidate');
  assert.equal(zh['projects.statCandidatesOne'], '{n} 个候选');
  const view = projectsSection();
  assert.deepEqual([...view.matchAll(/id="(prjStat\w*Sub)"/g)].map((match) => match[1]), ['prjStatDigestsSub', 'prjStatSkillsSub']);
  assert.match(ADMIN_UI_THEME, /\.prjStatSub \{[^}]*font-size:\s*12\.5px;/);
  assert.match(ADMIN_UI_THEME, /\.prjStatSub \{[^}]*color:\s*var\(--text-3\)/);

  const elements = {};
  const make = (id, className, hidden) => {
    const el = { id, textContent: '', hidden: !!hidden, className: className || '' };
    el.classList = {
      toggle(name, on) {
        const parts = new Set(el.className.split(/\s+/).filter(Boolean));
        if (on) parts.add(name);
        else parts.delete(name);
        el.className = [...parts].join(' ');
      },
    };
    elements[id] = el;
    return el;
  };
  make('prjStats');
  make('prjStatActiveLabel');
  for (const id of ['prjStatProjects', 'prjStatActive', 'prjStatDigests', 'prjStatSkills']) {
    make(`${id}Value`, 'prjStatValue', false);
    make(`${id}Note`, 'prjStatNote', true);
    make(`${id}Sub`, 'prjStatSub', true);
  }
  const i18n = { UI: en };
  const context = vm.createContext({
    i18n,
    state: {
      locale: 'en',
      projects: { days: 30, items: [], summary: null, nextCursor: null, loaded: false, readsDisabled: false, error: '' },
    },
    document: { getElementById: (id) => elements[id] || null },
    els: { prjStats: elements.prjStats },
  });
  vm.runInContext(`
    function t(key, vars) { return String(i18n.UI[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && name in vars ? String(vars[name]) : "")); }
    ${uiClientFunction('formatCount')}
    ${uiClientFunction('setText')}
    ${uiClientFunction('setHidden')}
    ${uiClientFunction('setClass')}
    ${uiClientFunction('projectPlural')}
    ${uiClientFunction('renderProjectStats')}
  `, context);
  const show = (patch) => {
    const prj = context.state.projects;
    prj.loaded = patch.loaded;
    prj.summary = patch.summary;
    prj.nextCursor = patch.nextCursor;
    prj.items = patch.items;
    prj.days = 30;
    prj.readsDisabled = false;
    prj.error = '';
    i18n.UI = patch.ui || en;
    context.state.locale = patch.locale || 'en';
    vm.runInContext('renderProjectStats()', context);
  };
  const row = (digest, skills, candidates) => ({ digest_days_in_range: digest, skills_count: skills, candidates_count: candidates });
  const summary = { projects_total: 120, active_in_range: 80 };

  show({ loaded: true, summary, nextCursor: 'page-2', items: [row(40, 4, 2), row(27, 1, 1)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatProjectsValue.textContent, '120');
  assert.equal(elements.prjStatProjectsValue.className, 'prjStatValue');
  assert.equal(elements.prjStatActiveValue.textContent, '80');
  assert.equal(elements.prjStatActiveLabel.textContent, 'Active in 30 days');
  assert.equal(elements.prjStatDigestsValue.textContent, '67+');
  assert.equal(elements.prjStatDigestsValue.className, 'prjStatValue');
  assert.equal(elements.prjStatDigestsSub.hidden, false);
  assert.equal(elements.prjStatDigestsSub.textContent, 'in 2 loaded projects');
  assert.equal(elements.prjStatSkillsValue.textContent, '5+');
  assert.equal(elements.prjStatSkillsSub.hidden, false);
  assert.equal(elements.prjStatSkillsSub.textContent, 'in 2 loaded projects');
  assert.equal(elements.prjStatSkillsNote.hidden, false);
  assert.equal(elements.prjStatSkillsNote.textContent, '3+ candidates');
  assert.equal(elements.prjStatSkillsNote.className, 'prjStatNote is-candidates');
  assert.equal(elements.prjStats.hidden, false);

  show({ loaded: true, summary, nextCursor: 'page-2', items: [row(40, 4, 2), row(27, 1, 1)], ui: zh, locale: 'zh-CN' });
  assert.equal(elements.prjStatDigestsValue.textContent, '67+');
  assert.equal(elements.prjStatDigestsSub.textContent, '已加载 2 个项目');
  assert.equal(elements.prjStatSkillsSub.textContent, '已加载 2 个项目');
  assert.equal(elements.prjStatSkillsNote.textContent, '3+ 个候选');
  assert.equal(elements.prjStatActiveLabel.textContent, '30 天内活跃');
  assert.equal(elements.prjStatProjectsValue.textContent, '120');

  show({ loaded: true, summary, nextCursor: 'page-3', items: [row(40, 4, 2), row(27, 1, 1), row(10, 1, 0)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatDigestsValue.textContent, '77+');
  assert.equal(elements.prjStatSkillsValue.textContent, '6+');
  assert.equal(elements.prjStatSkillsNote.textContent, '3+ candidates');
  assert.equal(elements.prjStatDigestsSub.textContent, 'in 3 loaded projects');
  assert.equal(elements.prjStatSkillsSub.hidden, false);
  assert.equal(elements.prjStatProjectsValue.textContent, '120');

  show({ loaded: true, summary: { projects_total: 120, active_in_range: 0 }, nextCursor: 'page-2', items: [row(0, 0, 0)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatActiveValue.textContent, '0');
  assert.equal(elements.prjStatActiveValue.className, 'prjStatValue is-zero');
  assert.equal(elements.prjStatDigestsValue.textContent, '0+');
  assert.equal(elements.prjStatDigestsValue.className, 'prjStatValue is-zero');
  assert.equal(elements.prjStatSkillsValue.textContent, '0+');
  assert.equal(elements.prjStatSkillsValue.className, 'prjStatValue is-zero');
  assert.equal(elements.prjStatSkillsNote.hidden, false);
  assert.equal(elements.prjStatSkillsNote.textContent, 'None yet');
  assert.equal(elements.prjStatSkillsNote.className, 'prjStatNote is-quiet');
  assert.equal(elements.prjStatDigestsSub.textContent, 'in 1 loaded project');
  assert.equal(elements.prjStatSkillsSub.textContent, 'in 1 loaded project');

  show({ loaded: true, summary, nextCursor: 'page-2', items: [row(3, 2, 0)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatDigestsValue.textContent, '3+');
  assert.equal(elements.prjStatDigestsValue.className, 'prjStatValue');
  assert.equal(elements.prjStatSkillsValue.textContent, '2+');
  assert.equal(elements.prjStatSkillsValue.className, 'prjStatValue');
  assert.equal(elements.prjStatSkillsNote.hidden, true);
  assert.equal(elements.prjStatSkillsNote.textContent, '');
  assert.equal(elements.prjStatSkillsSub.hidden, false);
  assert.equal(elements.prjStatSkillsSub.textContent, 'in 1 loaded project');

  show({ loaded: true, summary, nextCursor: 'page-2', items: [row(4, 1, 1)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatDigestsValue.textContent, '4+');
  assert.equal(elements.prjStatSkillsValue.textContent, '1+');
  assert.equal(elements.prjStatSkillsNote.textContent, '1+ candidate');
  assert.equal(elements.prjStatSkillsNote.className, 'prjStatNote is-candidates');
  assert.equal(elements.prjStatDigestsSub.textContent, 'in 1 loaded project');

  show({ loaded: true, summary, nextCursor: 'page-2', items: [row(4, 1, 1)], ui: zh, locale: 'zh-CN' });
  assert.equal(elements.prjStatSkillsNote.textContent, '1+ 个候选');
  assert.equal(elements.prjStatDigestsSub.textContent, '已加载 1 个项目');
  assert.equal(elements.prjStatSkillsSub.textContent, '已加载 1 个项目');

  show({ loaded: true, summary, nextCursor: null, items: [row(4, 1, 1)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatProjectsValue.textContent, '120');
  assert.equal(elements.prjStatActiveValue.textContent, '80');
  assert.equal(elements.prjStatDigestsValue.textContent, '4');
  assert.equal(elements.prjStatSkillsValue.textContent, '1');
  assert.equal(elements.prjStatSkillsNote.hidden, false);
  assert.equal(elements.prjStatSkillsNote.textContent, '1 candidate');
  assert.equal(elements.prjStatSkillsNote.className, 'prjStatNote is-candidates');
  assert.equal(elements.prjStatDigestsSub.hidden, true);
  assert.equal(elements.prjStatDigestsSub.textContent, '');
  assert.equal(elements.prjStatSkillsSub.hidden, true);
  assert.equal(elements.prjStatSkillsSub.textContent, '');

  show({ loaded: true, summary, nextCursor: null, items: [row(40, 4, 2), row(27, 1, 1)], ui: en, locale: 'en' });
  assert.equal(elements.prjStatDigestsValue.textContent, '67');
  assert.equal(elements.prjStatSkillsValue.textContent, '5');
  assert.equal(elements.prjStatSkillsNote.textContent, '3 candidates');
  assert.equal(elements.prjStatDigestsSub.hidden, true);
  assert.equal(elements.prjStatSkillsSub.hidden, true);
  assert.equal(elements.prjStatProjectsValue.textContent, '120');
  assert.equal(elements.prjStatActiveValue.textContent, '80');

  show({ loaded: false, summary: null, nextCursor: 'page-2', items: [], ui: en, locale: 'en' });
  assert.equal(elements.prjStatProjectsValue.textContent, '—');
  assert.equal(elements.prjStatActiveValue.textContent, '—');
  assert.equal(elements.prjStatDigestsValue.textContent, '—');
  assert.equal(elements.prjStatSkillsValue.textContent, '—');
  assert.equal(elements.prjStatSkillsNote.hidden, true);
  assert.equal(elements.prjStatSkillsNote.textContent, '');
  assert.equal(elements.prjStatDigestsSub.hidden, true);
  assert.equal(elements.prjStatDigestsSub.textContent, '');
  assert.equal(elements.prjStatSkillsSub.hidden, true);
  assert.equal(elements.prjStatSkillsSub.textContent, '');
});
