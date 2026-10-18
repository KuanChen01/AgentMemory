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
const { ADMIN_UI_NAV_ITEMS, ADMIN_UI_DEV_PANELS, ADMIN_UI_HEALTH_CHECKS } = require('../dist/services/admin-ui-markup.js');
const { ADMIN_UI_THEME, ADMIN_UI_WALLPAPERS } = require('../dist/services/admin-ui-theme.js');
const { ACTIVITY_BG_DARK_WEBP, ACTIVITY_BG_LIGHT_WEBP } = require('../dist/services/admin-ui-bg-assets.js');
const {
  ADMIN_UI_BACKGROUND_STORAGE_KEY,
  ADMIN_UI_BACKGROUND_DEFAULTS,
  renderAdminBackgroundBootScript,
} = require('../dist/services/admin-ui-client.js');
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
  for (const match of script.matchAll(/\bt\("((?:nav|home|shell|devtools|bg)\.[\w.]+)"/g)) used.add(match[1]);
  for (const match of script.matchAll(/"((?:nav|home|shell|devtools|bg)\.[A-Za-z0-9.]+)"/g)) used.add(match[1]);
  for (const item of [...ADMIN_UI_NAV_ITEMS, ...ADMIN_UI_DEV_PANELS, ...ADMIN_UI_WALLPAPERS]) used.add(item.key);
  for (const check of ADMIN_UI_HEALTH_CHECKS) used.add(check.labelKey);
  assert.ok(used.size > 50);
  for (const key of used) {
    if (!/^[a-zA-Z]+\.[\w.]+$/.test(key)) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  // New shell namespaces must stay in parity between the two locales.
  const shellKeys = (dict) => Object.keys(dict).filter((key) => /^(nav|home|shell|devtools|bg)\./.test(key)).sort();
  assert.deepEqual(shellKeys(zh), shellKeys(en));
  assert.equal(zh['home.allClear'], '一切正常');
  assert.equal(zh['nav.devTools'], '开发者工具');
  assert.equal(zh['bg.title'], '背景');
  for (const key of shellKeys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  }
});

test('Needs attention shows the health ring with one segment per health card and a passing chip', () => {
  const attention = html.slice(html.indexOf('id="homeAttentionCard"'), html.indexOf('id="homeRecentCard"'));
  const ring = elementTag('homeHealthRing');
  assert.match(ring, /class="healthRing"/);
  assert.match(ring, /role="img"/);
  assert.ok(attention.includes('id="homeHealthRing"'), 'ring lives in the Needs attention card');
  assert.ok(attention.includes('id="homeHealthRingChip"'));
  assert.ok(attention.includes('id="homeStatusHero"'));
  assert.doesNotMatch(html, /allClearOrb/);

  assert.deepEqual(ADMIN_UI_HEALTH_CHECKS.map((check) => check.key), ['worker', 'queue', 'llm', 'digest', 'vault']);
  assert.deepEqual(ADMIN_UI_HEALTH_CHECKS.map((check) => check.card),
    ['homeWorkerCard', 'homeQueueCard', 'homeLlmCard', 'homeDigestCard', 'homeVaultCard']);
  const segments = [...attention.matchAll(/<circle class="ringSeg" id="([^"]+)" data-check="([^"]+)"/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(segments, ADMIN_UI_HEALTH_CHECKS.map((check) => [check.id, check.key]));
  for (const check of ADMIN_UI_HEALTH_CHECKS) {
    elementTag(check.card);
    assert.match(elementTag(check.id), /data-state="unknown"/);
  }
  // Each check has its own glyph state, and the client updates the ring in place rather than rebuilding it.
  for (const glyph of ['glyphOk', 'glyphWarn', 'glyphError']) assert.match(attention, new RegExp(`class="${glyph}"`));
  assert.match(script, /function getHealthCheckStates\(/);
  assert.match(script, /setAttr\(ring, "data-tone", tone\)/);
  assert.doesNotMatch(script, /homeHealthRing\.innerHTML|homeStatusHero\.innerHTML/);
});

test('health ring copy reads naturally in both locales', () => {
  const format = (template, vars) => template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key]));
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  assert.equal(format(en['home.checksPassingAll'], { n: 5, total: 5 }), '5 / 5 checks passing');
  assert.equal(format(en['home.checksPassing'], { n: 4, total: 5 }), '4 / 5 passing');
  assert.equal(format(zh['home.checksPassingAll'], { n: 5, total: 5 }), '5 / 5 项检查通过');
  assert.equal(format(zh['home.checksPassing'], { n: 4, total: 5 }), '4 / 5 项通过');
});

test('sidebar Background row opens a labelled popover with presets, upload, tone, sliders and reset', () => {
  const sidebar = html.slice(html.indexOf('id="appSidebar"'), html.indexOf('</aside>'));
  const button = elementTag('bgPickerButton');
  assert.ok(sidebar.includes('id="bgPickerButton"'), 'Background row sits in the sidebar');
  assert.ok(sidebar.includes('id="bgSwatch"'));
  assert.match(button, /aria-controls="bgPopover"/);
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(sidebar, /data-i18n="bg\.title"/);

  // The popover is a sibling of the sidebar: inside it, the sidebar's backdrop-filter would clip its blur.
  assert.ok(!sidebar.includes('id="bgPopover"'));
  const popoverTag = elementTag('bgPopover');
  assert.match(popoverTag, /role="dialog"/);
  assert.match(popoverTag, /aria-labelledby="bgPopoverTitle"/);
  assert.match(popoverTag, /\bhidden\b/);
  elementTag('bgPopoverTitle');
  assert.match(elementTag('bgPopoverClose'), /data-i18n-aria-label="bg\.close"/);

  const popover = html.slice(html.indexOf('id="bgPopover"'), html.indexOf('</section>', html.indexOf('id="bgPopover"')));
  assert.deepEqual(ADMIN_UI_WALLPAPERS.map((wallpaper) => [wallpaper.id, wallpaper.tone]), [
    ['aurora', 'light'], ['sunset', 'light'], ['lagoon', 'light'], ['mist', 'light'], ['night', 'dark'], ['graphite', 'dark'],
  ]);
  const presets = [...popover.matchAll(/data-bg-preset="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(presets, [...ADMIN_UI_WALLPAPERS.map((wallpaper) => wallpaper.id), 'custom']);
  for (const wallpaper of ADMIN_UI_WALLPAPERS) {
    assert.match(elementTag(`bgPreset${wallpaper.label}`), new RegExp(`data-bg-preset="${wallpaper.id}"`));
    assert.match(ADMIN_UI_THEME, new RegExp(`html\\[data-bg="${wallpaper.id}"\\]`));
    assert.match(ADMIN_UI_THEME, new RegExp(`\\.bgThumb\\[data-wall="${wallpaper.id}"\\]`));
  }
  assert.match(elementTag('bgPresetCustom'), /\bhidden\b/);
  elementTag('bgUploadButton');
  const upload = elementTag('bgUploadInput');
  assert.match(upload, /type="file"/);
  assert.match(upload, /accept="image\/\*"/);

  const tone = elementTag('bgToneControl');
  assert.match(tone, /role="group"/);
  assert.match(tone, /aria-labelledby="bgToneLabel"/);
  assert.deepEqual([...popover.matchAll(/data-bg-tone="([^"]+)"/g)].map((match) => match[1]), ['auto', 'light', 'dark']);

  for (const [id, min, max] of [['bgBlurInput', 0, 40], ['bgDimInput', 0, 60], ['bgOpacityInput', 10, 80]]) {
    const range = elementTag(id);
    assert.match(range, /type="range"/);
    assert.match(range, new RegExp(`min="${min}" max="${max}"`));
    assert.ok(popover.includes(`<label class="bgFieldLabel" for="${id}"`), `${id} has a label`);
    elementTag(id.replace('Input', 'Value'));
  }
  elementTag('bgResetButton');
  elementTag('bgDoneButton');
  assert.match(elementTag('bgStatus'), /role="status"/);

  // Escape and outside clicks close it; the custom image goes to IndexedDB, downscaled on a canvas.
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /addEventListener\("pointerdown"/);
  assert.match(script, /indexedDB\.open\(/);
  assert.match(script, /BG_MAX_EDGE = 2560/);
  assert.match(script, /canvas\.toBlob\(/);
  assert.match(script, /URL\.createObjectURL\(/);
});

test('Activity view exposes the summary, toolbar, chips, day columns and the Earlier slot', () => {
  const activity = html.slice(html.indexOf('id="activityView"'), html.indexOf('id="memoryView"'));
  assert.match(elementTag('activityView'), /class="appView activityView"/);
  assert.doesNotMatch(activity, /placeholderCard|shell\.comingSoon/);
  for (const id of ['activitySummary', 'activitySumMemories', 'activitySumOutcome', 'activitySumContext', 'activitySumLegacy',
    'activitySparkline', 'activityToolbar', 'activityRangeControl', 'activityProjectButton', 'activityProjectValue',
    'activityAgentButton', 'activityAgentValue', 'activityRangeLabel', 'activityUpdated', 'activitySearchButton', 'activityChips',
    'activityBoard', 'activityColumns', 'activityNotice', 'activityEarlierPanel', 'activityEarlierTitle', 'activityEarlierBody',
    'activityProjectPopover', 'activityAgentPopover', 'activityCustomPopover', 'activityCustomFrom', 'activityCustomTo',
    'activityCustomApply', 'activityCustomCancel', 'activityCustomError']) {
    assert.ok(activity.includes(`id="${id}"`), `#${id} lives in the Activity view`);
  }
  for (const index of [0, 1]) {
    for (const suffix of ['', 'Heading', 'Title', 'Date', 'Outcome', 'Context', 'Legacy', 'Body', 'Cards', 'Empty', 'More']) {
      elementTag(`activityColumn${index}${suffix}`);
    }
  }
  const ranges = [...activity.matchAll(/data-activity-range="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ranges, ['today', 'yesterday', '7d', 'custom']);
  assert.match(elementTag('activityRange7d'), /aria-pressed="true"/);
  assert.match(elementTag('activityRangeCustom'), /aria-controls="activityCustomPopover"/);
  assert.match(elementTag('activityEarlierPanel'), /glassBlur/);
  // Popovers are not inside the blurred toolbar; the Earlier body is filled by the client.
  const toolbar = activity.slice(activity.indexOf('id="activityToolbar"'), activity.indexOf('id="activityChips"'));
  assert.ok(toolbar.includes('id="activityProjectButton"'));
  assert.doesNotMatch(toolbar, /class="actPopover/);
  assert.match(activity, /id="activityEarlierBody"[^>]*><\/div>/);
  // Cards are keyed by memory id. The only stats-only (limit=0) request is the Earlier panel's, and the 5 s poll
  // never makes it.
  assert.match(script, /setAttribute\("data-memory-id", card\.id\)/);
  assert.match(script, /\/admin\/api\/activity\?/);
  assert.match(script, /activityIncludesToday\(getActivityWindow\(\)\)/);
  assert.equal([...script.matchAll(/limit:\s*"0"/g)].length, 1);
  assert.match(extractClientFunction(script, 'loadActivityEarlier'), /limit:\s*"0"/);
  assert.doesNotMatch(extractClientFunction(script, 'pollVisibleView'), /loadActivityEarlier/);
});

test('Activity Earlier panel and memory drawer expose stable ids and wire to memory-detail', () => {
  const activity = html.slice(html.indexOf('id="activityView"'), html.indexOf('id="memoryView"'));
  for (const id of ['activityEarlierLead', 'activityEarlierBody', 'activityEarlierNote', 'activityDrawer', 'activityDrawerScrim',
    'activityDrawerMeta', 'activityDrawerTitle', 'activityDrawerSub', 'activityDrawerBody', 'activityDrawerClose']) {
    assert.ok(activity.includes(`id="${id}"`), `#${id} lives in the Activity view`);
  }
  const drawer = elementTag('activityDrawer');
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /aria-labelledby="activityDrawerTitle"/);
  assert.match(drawer, /\bhidden\b/);
  assert.match(elementTag('activityDrawerClose'), /data-i18n-aria-label="activity\.drawerClose"/);
  // The memory id goes in the query string (ids may contain ':'), and a card opens the drawer by click or key.
  assert.match(script, /"\/admin\/api\/memory-detail\?id=" \+ encodeURIComponent\(id\)/);
  assert.match(script, /node\.setAttribute\("tabindex", "0"\)/);
  assert.match(script, /data-earlier-day=/);
  assert.match(script, /data-earlier-toggle=/);
});

test('Activity drawer clamps long summaries, the Earlier panel stays in the viewport, and Background is a switch', () => {
  const titleAt = ADMIN_UI_THEME.indexOf('.actDrawerTitle {');
  const titleCss = ADMIN_UI_THEME.slice(titleAt, ADMIN_UI_THEME.indexOf('}', titleAt));
  assert.match(titleCss, /line-clamp:\s*2/);
  assert.doesNotMatch(titleCss, /line-clamp:\s*4/);
  const railCss = ADMIN_UI_THEME.slice(ADMIN_UI_THEME.indexOf('.activityView .actRail {'), ADMIN_UI_THEME.indexOf('.actRailTitle,'));
  assert.match(railCss, /max-height:\s*calc\(100vh - 40px\)/);
  assert.match(script, /rail\.style\.maxHeight = next/);
  assert.match(ADMIN_UI_THEME, /\.actRailBody\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(script, /function fitActivityEarlierPanel\(/);
  assert.match(script, /activityEarlierPanel: document\.getElementById\("activityEarlierPanel"\)/);
  assert.match(script, /data-narrative-toggle/);
  // The client script is a template string, so the shipped page must still escape the character class.
  assert.match(script, /trimmed\.match\(\/\[\{\}\\\[\\\]\]\/g\)/);
  const swatchCss = ADMIN_UI_THEME.slice(ADMIN_UI_THEME.indexOf('.bgSwatch {'), ADMIN_UI_THEME.indexOf('.bgSwatch::after'));
  assert.doesNotMatch(swatchCss, /wallpaper-swatch/);
  assert.match(swatchCss, /border-radius:\s*999px/);
  assert.equal(ADMIN_UI_TRANSLATIONS.en['activity.drawerShowMore'], 'Show more');
  assert.equal(ADMIN_UI_TRANSLATIONS.en['activity.drawerShowLess'], 'Show less');
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['activity.drawerShowMore'], '显示更多');
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['activity.drawerShowLess'], '收起');
  const result = vm.runInNewContext(`
    ${extractClientFunction(script, 'narrativeLooksRaw')}
    ${extractClientFunction(script, 'narrativeNeedsToggle')}
    ({
      short: narrativeNeedsToggle('Saved the release notes.'),
      long: narrativeNeedsToggle(${JSON.stringify('x'.repeat(400))}),
      lines: narrativeNeedsToggle('one\\ntwo\\nthree\\nfour\\nfive\\nsix'),
      raw: narrativeLooksRaw('{"tool":"bash","input":{"cmd":"ls"}}'),
      prose: narrativeLooksRaw('The install trial verified Node v24.'),
    });
  `);
  assert.equal(result.short, false);
  assert.equal(result.long, true);
  assert.equal(result.lines, true);
  assert.equal(result.raw, true);
  assert.equal(result.prose, false);
});

test('Activity drawer clamps a long Facts list and wraps tool names at separators', () => {
  assert.match(script, /data-facts-toggle/);
  assert.match(script, /factsOpen/);
  assert.match(script, /,<wbr> /);
  assert.doesNotMatch(script, /\$&<wbr>/);
  const factsLi = ADMIN_UI_THEME.slice(ADMIN_UI_THEME.indexOf('\n  .actFacts li {'), ADMIN_UI_THEME.indexOf('.actFacts li::before'));
  assert.match(factsLi, /overflow-wrap:\s*break-word/);
  assert.match(factsLi, /min-width:\s*0/);
  assert.doesNotMatch(factsLi, /anywhere/);
  const clampAt = ADMIN_UI_THEME.indexOf('.actNarrativeClamp:not(.is-open) .actFacts li {');
  const clampCss = ADMIN_UI_THEME.slice(clampAt, ADMIN_UI_THEME.indexOf('}', clampAt));
  assert.match(clampCss, /line-clamp:\s*5/);
  const result = vm.runInNewContext(`
    ${extractClientFunction(script, 'factsNeedToggle')}
    ({
      short: factsNeedToggle(['Saved the release notes.', 'Node v24 is current.']),
      many: factsNeedToggle(['a', 'b', 'c', 'd', 'e', 'f']),
      tools: factsNeedToggle(['12 tool calls (' + ${JSON.stringify('mcp__codex_apps__github__search_issues, '.repeat(12))} + ')']),
    });
  `);
  assert.equal(result.short, false);
  assert.equal(result.many, true);
  assert.equal(result.tools, true);
});

test('Activity day pills hide at zero, headings read "Fri, Oct 16" and zh-CN ranges keep the dash tight', () => {
  const column = extractClientFunction(script, 'renderActivityColumn');
  assert.match(column, /setHidden\(pill, !act\.payload \|\| count === 0/);
  assert.match(column, /weekday: "short", month: "short", day: "numeric"/);
  for (const index of [0, 1]) {
    for (const kind of ['Outcome', 'Context', 'Legacy']) assert.match(elementTag(`activityColumn${index}${kind}`), /\bhidden\b/);
  }
  assert.match(extractClientFunction(script, 'renderActivityToolbar'), /state\.locale === "zh-CN" \? "–" : " – "/);
});

test('Activity gives every visible project its own dot colour until the palette runs out', () => {
  const source = `
    const ACTIVITY_HUES = 10;
    const state = { activity: { hues: new Map() } };
    ${extractClientFunction(script, 'projectHue')}
    ${extractClientFunction(script, 'assignActivityHues')}
    const rows = ['E:/demo/DemoAlpha', 'E:/demo/SampleBeta', 'E:/demo/SampleBeta_2', 'E:/demo/ExampleGamma',
      'E:/demo/FixtureDelta', 'E:/demo/MockEcho', 'E:/demo/TrialFoxtrot', 'E:/demo/PlaceholderGolf', 'E:/demo/SyntheticHotel', 'E:/demo/x']
      .map((project_path) => ({ project_path }));
    assignActivityHues(rows);
    const first = rows.map((row) => projectHue(row.project_path));
    state.activity.hues.clear();
    assignActivityHues(rows.slice().reverse());
    ({ first, again: rows.map((row) => projectHue(row.project_path)), empty: projectHue(''), upper: projectHue('E:/DEMO/SAMPLEBETA') });
  `;
  const result = vm.runInNewContext(source);
  assert.equal(new Set(result.first).size, 10, 'ten projects take ten distinct slots');
  assert.deepEqual([...result.again], [...result.first], 'slots do not depend on render order');
  assert.equal(result.empty, 'none');
  assert.equal(result.upper, result.first[1], 'paths match case-insensitively');
});

test('Activity shows its own default backdrop until the user picks a background', () => {
  assert.match(ADMIN_UI_THEME, /html\[data-act-bg="light"\] \{\s*--wallpaper:/);
  assert.match(ADMIN_UI_THEME, /html\[data-act-bg="dark"\] \{\s*--wallpaper:/);
  const uses = extractClientFunction(script, 'usesActivityBackdrop');
  assert.match(uses, /state\.activeView === "activityView"/);
  assert.match(uses, /!settings\.pinned/);
  assert.match(uses, /settings\.tone === "auto"/);
  assert.match(extractClientFunction(script, 'applyBackdrop'), /prefers-color-scheme: dark/);
  // Picking a preset or uploading pins the choice; Reset returns to the default.
  assert.match(script, /updateBackground\(\{ preset, pinned: true \}, true\)/);
  assert.match(script, /pinned: false \}, true\)/);
  const boot = renderAdminBackgroundBootScript();
  assert.match(boot, /pinned: !!\(raw && typeof raw === "object"\) && source\.pinned !== false/);
  const pinnedFor = (stored) => {
    const context = {
      document: { documentElement: { setAttribute() {}, style: { setProperty() {}, removeProperty() {} } } },
      localStorage: { getItem() { return stored; } },
    };
    context.window = context;
    vm.runInNewContext(boot, context);
    return context.window.__amBackground.read().pinned;
  };
  assert.equal(pinnedFor(null), false);
  assert.equal(pinnedFor(JSON.stringify({ preset: 'night', blur: 8 })), true);
  assert.equal(pinnedFor(JSON.stringify({ preset: 'aurora', pinned: false })), false);
  assert.equal(pinnedFor(JSON.stringify({ preset: 'sunset', pinned: true })), true);
});

test('Earlier legacy and mixed days include compacted memories in the count', () => {
  const source = `
    ${extractClientFunction(script, 'earlierTyped')}
    ${extractClientFunction(script, 'earlierShownCount')}
    ({
      compacted: earlierShownCount({ era: 'legacy', legacy: 0, outcome: 3, context: 1 }),
      raw: earlierShownCount({ era: 'legacy', legacy: 40, outcome: 0, context: 0 }),
      mixed: earlierShownCount({ era: 'mixed', legacy: 10, outcome: 2, context: 1 }),
      current: earlierShownCount({ era: 'v2.1', legacy: 9, outcome: 5, context: 1 }),
    });
  `;
  const result = vm.runInNewContext(source);
  assert.equal(result.compacted, 4);
  assert.equal(result.raw, 40);
  assert.equal(result.mixed, 13);
  assert.equal(result.current, 6);
  assert.match(extractClientFunction(script, 'renderActivityEarlier'), /earlierShownCount/);
});

test('Today and Yesterday reload when the local date changes', () => {
  const poll = extractClientFunction(script, 'pollVisibleView');
  assert.match(poll, /activityWindowStale\(\)/);
  assert.match(poll, /reloadActivityWindow\(\)/);
  assert.doesNotMatch(poll, /loadActivityEarlier/);
  const reload = extractClientFunction(script, 'reloadActivityWindow');
  assert.match(reload, /anchorActivityEarlier\(\)/);
  assert.match(reload, /loadActivity\("reset"\)/);
  assert.match(reload, /loadActivityEarlier\(true\)/);
  // The loaded window key is what the poll compares. The check itself must not invent a day.
  assert.match(extractClientFunction(script, 'loadActivity'), /act\.windowKey = key/);
  assert.match(extractClientFunction(script, 'activityWindowStale'), /act\.windowKey/);
  assert.doesNotMatch(extractClientFunction(script, 'activityWindowStale'), /localDay/);
});

test('the first poll after midnight reloads a Today or Yesterday window loaded before it', () => {
  const source = `
    const ACTIVITY_DAY_MS = 86400000;
    const ACTIVITY_MAX_DAYS = 120;
    ${extractClientFunction(script, 'localDayKey')}
    ${extractClientFunction(script, 'shiftDays')}
    ${extractClientFunction(script, 'parseLocalDay')}
    ${extractClientFunction(script, 'getActivityWindow')}
    ${extractClientFunction(script, 'activityKey')}
    ${extractClientFunction(script, 'activityWindowStale')}
    const state = { activity: { range: 'yesterday', project: '', agent: '', kind: 'typed', customFrom: '', customTo: '', windowKey: '', localDay: '' } };
    const RealDate = Date;
    function at(iso, run) {
      const instant = new RealDate(iso).getTime();
      function Clock(...args) {
        if (!new.target) return new RealDate(instant).toString();
        return args.length ? new RealDate(...args) : new RealDate(instant);
      }
      Clock.now = () => instant;
      Clock.parse = RealDate.parse;
      Clock.UTC = RealDate.UTC;
      Clock.prototype = RealDate.prototype;
      globalThis.Date = Clock;
      try { return run(); }
      finally { globalThis.Date = RealDate; }
    }
    // Opened before midnight. localDay is still empty, which used to make this first later poll a no-op.
    state.activity.windowKey = at('2000-01-01T22:00:00', () => activityKey(getActivityWindow()));
    const yesterday = at('2000-01-02T00:00:05', () => activityWindowStale());
    state.activity.range = 'today';
    state.activity.windowKey = at('2000-01-01T22:00:00', () => activityKey(getActivityWindow()));
    const today = at('2000-01-02T00:00:05', () => activityWindowStale());
    state.activity.windowKey = at('2000-01-02T00:00:05', () => activityKey(getActivityWindow()));
    const same = at('2000-01-02T00:00:05', () => activityWindowStale());
    state.activity.range = 'custom';
    const custom = at('2000-01-02T00:00:05', () => activityWindowStale());
    state.activity.range = '7d';
    const week = at('2000-01-02T00:00:05', () => activityWindowStale());
    state.activity.range = 'yesterday';
    state.activity.windowKey = '';
    const unloaded = at('2000-01-02T00:00:05', () => activityWindowStale());
    ({ yesterday, today, same, custom, week, unloaded, localDay: state.activity.localDay });
  `;
  const result = vm.runInNewContext(source);
  assert.equal(result.yesterday, true);
  assert.equal(result.today, true);
  assert.equal(result.same, false);
  assert.equal(result.custom, false);
  assert.equal(result.week, false);
  assert.equal(result.unloaded, false);
  assert.equal(result.localDay, '');
});

test('Activity default backdrop uses the light and dark artwork', () => {
  function actWallpaper(scheme) {
    const start = ADMIN_UI_THEME.indexOf(`html[data-act-bg="${scheme}"] {`);
    assert.ok(start >= 0, scheme);
    return ADMIN_UI_THEME.slice(start, ADMIN_UI_THEME.indexOf('}', start));
  }
  const light = actWallpaper('light');
  const dark = actWallpaper('dark');
  assert.ok(light.includes(ACTIVITY_BG_LIGHT_WEBP));
  assert.ok(dark.includes(ACTIVITY_BG_DARK_WEBP));
  assert.equal(light.includes(ACTIVITY_BG_DARK_WEBP), false);
  assert.equal(dark.includes(ACTIVITY_BG_LIGHT_WEBP), false);
  assert.match(light, /center \/ cover no-repeat, #e7eefb/);
  assert.match(dark, /center \/ cover no-repeat, #0b1226/);
  assert.match(light, /--wallpaper-base:\s*#e7eefb/);
  assert.match(dark, /--wallpaper-base:\s*#0b1226/);
  assert.doesNotMatch(light, /radial-gradient/);
  assert.doesNotMatch(dark, /radial-gradient/);
});

test('top bar keeps Read and Write in one compact pill and the language in a menu', () => {
  const group = html.slice(html.indexOf('id="policyGroup"'), html.indexOf('id="localeToggle"'));
  assert.ok(group.includes('id="readPolicyCard"') && group.includes('id="writePolicyCard"'));
  assert.match(elementTag('policyGroup'), /role="group"/);
  assert.doesNotMatch(elementTag('readPolicyCard'), /glassPill/);
  const trigger = elementTag('localeMenuButton');
  assert.match(trigger, /aria-haspopup="listbox"/);
  assert.doesNotMatch(trigger, /aria-haspopup="true"/);
  assert.doesNotMatch(trigger, /aria-label=/);
  assert.match(trigger, /aria-controls="localeMenuList"/);
  const menu = html.slice(html.indexOf('id="localeMenuButton"'), html.indexOf('id="localeMenuList"'));
  assert.match(menu, /data-i18n="locale\.label"/);
  assert.match(menu, /id="localeMenuValue"/);
  const listTag = elementTag('localeMenuList');
  assert.match(listTag, /role="listbox"/);
  assert.match(listTag, /\bhidden\b/);
  const listAt = html.indexOf('id="localeMenuList"');
  const list = html.slice(listAt, html.indexOf('</header>', listAt));
  assert.match(list, /role="option"/);
  assert.match(list, /data-locale-choice="en"/);
  assert.match(list, /data-locale-choice="zh-CN"/);
});

test('every Activity i18n key exists in en and zh-CN', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const activityKeys = (dict) => Object.keys(dict).filter((key) => key.startsWith('activity.')).sort();
  assert.ok(activityKeys(en).length > 40);
  assert.deepEqual(activityKeys(zh), activityKeys(en));
  for (const key of activityKeys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  }
  const used = new Set();
  // Markup plus client code, without the inlined dictionary itself.
  const source = html.replace(/const UI_DICTIONARY = .*\n/, '');
  for (const match of source.matchAll(/"(activity\.[A-Za-z0-9.]+)"/g)) used.add(match[1]);
  assert.ok(used.size > 30);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
});

test('activity board, Earlier panel and drawer handle a reads-disabled payload', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  assert.equal(en['activity.readsDisabledTitle'], 'Memory reads are turned off');
  assert.equal(zh['activity.readsDisabledTitle'], '记忆读取已关闭');
  assert.equal(en['activity.readsDisabledLead'], 'Activity is hidden while reads are disabled. Turn reads back on in Settings to see memories here.');
  assert.equal(zh['activity.readsDisabledLead'], '读取关闭期间不显示活动。到设置里重新打开读取后，这里会恢复显示。');
  assert.equal(en['activity.drawerReadsDisabled'], 'Memory details are hidden while reads are disabled.');
  assert.equal(zh['activity.drawerReadsDisabled'], '读取关闭期间不显示记忆详情。');

  const load = extractClientFunction(script, 'loadActivity');
  assert.match(load, /if \(payload\.disabled\) \{[\s\S]*act\.cards = \[\]/);
  assert.match(load, /act\.readsDisabled = true/);
  assert.match(load, /act\.message = payload\.message/);
  assert.match(load, /act\.readsDisabled = false/);

  const board = extractClientFunction(script, 'renderActivityBoard');
  assert.ok(board.indexOf('act.readsDisabled') < board.indexOf('activity.errorTitle'));
  assert.match(board, /activity\.readsDisabledTitle/);
  assert.match(board, /activity\.readsDisabledLead/);

  const earlierLoad = extractClientFunction(script, 'loadActivityEarlier');
  assert.match(earlierLoad, /if \(payload\.disabled\) \{[\s\S]*early\.payload = null/);
  assert.match(earlierLoad, /early\.loadedAt = 0/);
  assert.match(earlierLoad, /early\.readsDisabled = true/);
  assert.match(earlierLoad, /early\.readsDisabled = false/);

  const earlier = extractClientFunction(script, 'renderActivityEarlier');
  assert.match(earlier, /early\.readsDisabled/);
  assert.ok(earlier.indexOf('activity.readsDisabledTitle') < earlier.indexOf('activity.earlierError'));
  assert.match(earlier, /activity\.readsDisabledLead/);

  const open = extractClientFunction(script, 'openActivityDrawer');
  assert.match(open, /if \(payload\.disabled\) \{[\s\S]*drawer\.readsDisabled = true/);
  assert.match(open, /drawer\.missing = false/);
  assert.match(open, /drawer\.readsDisabled = false/);

  const drawer = extractClientFunction(script, 'renderActivityDrawer');
  assert.match(drawer, /drawer\.readsDisabled/);
  assert.match(drawer, /activity\.drawerReadsDisabled/);
  assert.ok(drawer.indexOf('activity.drawerReadsDisabled') < drawer.indexOf('activity.drawerMissing'));
});

function extractClientFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 0;
  let seen = false;
  let quote = '';
  let escape = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
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
    // A slash escaped by a backslash is a regex such as /^image\//, not a line comment.
    if (char === '/' && source[index + 1] === '/' && source[index - 1] !== '\\') {
      const newline = source.indexOf('\n', index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (char === '{') {
      depth += 1;
      seen = true;
    } else if (char === '}') {
      depth -= 1;
      if (seen && depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unclosed function ${name}`);
}

test('custom wallpaper rejects files over 10 MB before decode and keeps transparent pixels', () => {
  assert.match(script, /BG_MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/);
  const upload = extractClientFunction(script, 'handleWallpaperUpload');
  const sizeAt = upload.search(/file\.size\s*>\s*BG_MAX_UPLOAD_BYTES/);
  const prepareAt = upload.indexOf('prepareWallpaper(');
  const busyAt = upload.indexOf('bg.busy = true');
  assert.ok(sizeAt >= 0, 'size check inside handleWallpaperUpload');
  assert.ok(prepareAt >= 0, 'prepareWallpaper call inside handleWallpaperUpload');
  assert.ok(sizeAt < prepareAt, 'size check runs before decode');
  assert.ok(busyAt > sizeAt, 'oversized files return before bg.busy is set');
  assert.match(upload, /setBackgroundStatus\("bg\.uploadTooLarge", true\)/);
  assert.equal(ADMIN_UI_TRANSLATIONS.en['bg.uploadTooLarge'], 'That image is larger than 10 MB. Pick a smaller one.');
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['bg.uploadTooLarge'], '图片超过 10 MB，请换一张小一点的。');

  const width = 8;
  const height = 8;
  const result = vm.runInNewContext(`
    ${extractClientFunction(script, 'canvasHasAlpha')}
    ${extractClientFunction(script, 'wallpaperEncodeTypes')}
    const opaque = new Uint8ClampedArray(${width * height * 4});
    opaque.fill(255);
    const sampled = new Uint8ClampedArray(opaque);
    sampled[((4 * ${width}) + 4) * 4 + 3] = 254;
    const offRow = new Uint8ClampedArray(opaque);
    offRow[((1 * ${width}) + 4) * 4 + 3] = 0;
    ({
      opaque: canvasHasAlpha(opaque, ${width}, ${height}, 4),
      sampled: canvasHasAlpha(sampled, ${width}, ${height}, 4),
      offRow: canvasHasAlpha(offRow, ${width}, ${height}, 4),
      alphaTypes: wallpaperEncodeTypes(true),
      opaqueTypes: wallpaperEncodeTypes(false),
    });
  `);
  assert.equal(result.opaque, false);
  assert.equal(result.sampled, true);
  assert.equal(result.offRow, false);
  // Arrays created inside the vm have that realm's Array prototype, so copy them before deepEqual.
  assert.deepEqual([...result.alphaTypes], ['image/webp', 'image/png']);
  assert.deepEqual([...result.opaqueTypes], ['image/jpeg']);
});

test('background settings persist under am.bg and apply in <head> before first paint', () => {
  assert.equal(ADMIN_UI_BACKGROUND_STORAGE_KEY, 'am.bg');
  assert.deepEqual(ADMIN_UI_BACKGROUND_DEFAULTS, { preset: 'aurora', tone: 'auto', blur: 12, dim: 0, opacity: 30 });
  const head = html.slice(0, html.indexOf('<body>'));
  const boot = head.match(/<script id="amBackgroundBoot">([\s\S]*?)<\/script>/);
  assert.ok(boot, 'boot script is inlined in <head>');
  assert.match(boot[1], /"am\.bg"/);
  assert.match(script, /BG_STORAGE_KEY = "am\.bg"/);
  assert.doesNotThrow(() => new vm.Script(boot[1]));
  assert.equal(boot[1], renderAdminBackgroundBootScript());

  const run = (stored) => {
    const attributes = {};
    const styles = {};
    const documentElement = {
      setAttribute: (name, value) => { attributes[name] = String(value); },
      style: {
        setProperty: (name, value) => { styles[name] = String(value); },
        removeProperty: (name) => { delete styles[name]; },
      },
    };
    const window = { localStorage: { getItem: (key) => (key === 'am.bg' && stored !== undefined ? JSON.stringify(stored) : null) } };
    vm.runInNewContext(boot[1], { window, document: { documentElement } });
    return { attributes, styles, api: window.__amBackground };
  };

  const fresh = run(undefined);
  assert.deepEqual(fresh.attributes, { 'data-bg': 'aurora', 'data-glass': 'light' });
  assert.deepEqual(fresh.styles, { '--bg-blur': '12px', '--bg-brightness': '1', '--glass-scale': '1' });
  assert.equal(run({ preset: 'night' }).attributes['data-glass'], 'dark');
  assert.equal(run({ preset: 'graphite', tone: 'light' }).attributes['data-glass'], 'light');
  assert.equal(run({ preset: 'mist', dim: 60 }).attributes['data-glass'], 'dark');
  const custom = run({ preset: 'custom', customLuma: 0.21, customColor: '#334455', blur: 99, dim: -5, opacity: 60 });
  assert.deepEqual(custom.attributes, { 'data-bg': 'custom', 'data-glass': 'dark' });
  assert.deepEqual(custom.styles, { '--bg-blur': '40px', '--bg-brightness': '1', '--glass-scale': '2', '--bg-custom-color': '#334455' });
  assert.equal(run({ preset: 'custom', customLuma: 0.8 }).attributes['data-glass'], 'light');
  assert.equal(run({ preset: 'nope', tone: 'neon' }).attributes['data-bg'], 'aurora');
  assert.equal(typeof fresh.api.normalize, 'function');
});

test('glass surfaces are driven by :root variables and the wallpaper is one static layer', () => {
  const css = ADMIN_UI_THEME.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const name of ['--glass-a-top', '--glass-a-bottom', '--glass-scale', '--glass-border', '--glass-blur', '--glass-text', '--bg-blur', '--bg-brightness']) {
    assert.match(css, new RegExp(`${name}:`), `${name} is defined`);
  }
  assert.match(css, /--glass-fill: linear-gradient\(180deg, rgba\(var\(--glass-rgb-top\), calc\(var\(--glass-a-top\) \* var\(--glass-scale\)\)\)/);
  assert.match(css, /--glass-blur: blur\(32px\) saturate\(175%\)/);
  assert.match(css, /html\[data-glass="dark"\] \{/);
  // Exactly one wallpaper layer, filtered by the blur and dim sliders.
  const wallpaperRules = [...css.matchAll(/([^{}]+)\{[^{}]*background: var\(--wallpaper\)/g)].map((match) => match[1].trim());
  assert.deepEqual(wallpaperRules, ['body::before']);
  assert.match(css, /body::before \{[^}]*position: fixed;[^}]*filter: blur\(var\(--bg-blur\)\) brightness\(var\(--bg-brightness\)\)/);
  // No external images or fonts.
  assert.doesNotMatch(css, /url\((?!["']?data:|#|var\()/);
  assert.doesNotMatch(css, /@import|@font-face/);
});

test('glass surfaces share one gradient rim and thickness shadow instead of flat borders', () => {
  const css = ADMIN_UI_THEME.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /--glass-border:\s*radial-gradient\(/);
  assert.match(css, /--glass-edge:\s*inset /);
  const rim = css.match(/([^{}]+)\{[^{}]*background: var\(--glass-border\);[^{}]*mask-composite: exclude;/);
  assert.ok(rim, 'one rule paints the masked rim');
  for (const sel of ['.glassCard::after', '.glassSurface::after', '.glassPill::after', '.actCard::after', '.actChip::after', '.actPopup::after', '.actDrawer::after']) {
    assert.ok(rim[1].includes(sel), `${sel} gets the rim`);
  }
  // The old flat borders are gone; their 1px stays transparent so nothing moves.
  assert.doesNotMatch(css, /var\(--(?:a-glass|a-card|a-control|a-drawer|a-section|a-track|pill)-border\)/);
  assert.doesNotMatch(css, /border: 1px solid var\(--glass-border\)/);
});

test('Home blurs nine static surfaces: the sidebar, five health cards and three content cards', () => {
  const homeView = html.slice(html.indexOf('id="homeView"'), html.indexOf('id="activityView"'));
  const blurredOnHome = [...homeView.matchAll(/class="[^"]*\bglassBlur\b[^"]*"[^>]*\bid="([^"]+)"|\bid="([^"]+)"[^>]*class="[^"]*\bglassBlur\b/g)];
  const ids = [...homeView.matchAll(/<[a-z]+ class="([^"]*)" id="([^"]+)"/g)]
    .filter((match) => /\bglassBlur\b/.test(match[1]))
    .map((match) => match[2]);
  assert.ok(blurredOnHome.length >= ids.length);
  assert.deepEqual(ids, ['homeWorkerCard', 'homeQueueCard', 'homeLlmCard', 'homeDigestCard', 'homeVaultCard',
    'homeTodayCard', 'homeAttentionCard', 'homeRecentCard']);
  assert.match(elementTag('appSidebar'), /\bglassBlur\b/);
  // Table rows, chips and the ring never carry glassBlur.
  assert.doesNotMatch(homeView, /<(?:tr|td|li|span)[^>]*\bglassBlur\b/);
});

// Rough worst-case estimate: each base stop and each blob (at full alpha over each stop), boosted by the
// card's saturate(175%), under the thinnest part of the glass (its bottom alpha). AA body text needs 4.5:1.
test('glass text keeps AA contrast on every wallpaper preset', () => {
  const css = ADMIN_UI_THEME;
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `missing ${selector}`);
    return css.slice(start, css.indexOf('\n  }', start));
  };
  const cssVar = (text, name) => {
    const match = text.match(new RegExp(`${name}: ([^;]+);`));
    assert.ok(match, `missing ${name}`);
    return match[1].trim();
  };
  const parseColor = (value) => {
    if (value.startsWith('#')) return { rgb: [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16)), alpha: 1 };
    const parts = value.replace(/rgba?\(|\)/g, '').split(',').map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  };
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const over = (top, alpha, bottom) => top.map((value, index) => value * alpha + bottom[index] * (1 - alpha));
  const saturate = (rgb, amount) => {
    const [r, g, b] = rgb;
    const rows = [
      [0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount],
      [0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount],
      [0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount],
    ];
    return rows.map((row) => Math.min(255, Math.max(0, row[0] * r + row[1] * g + row[2] * b)));
  };
  const tones = {};
  for (const [tone, selector] of [['light', ':root'], ['dark', 'html[data-glass="dark"]']]) {
    const source = block(selector);
    tones[tone] = {
      glass: cssVar(source, '--glass-rgb-bottom').split(',').map(Number),
      alpha: Number(cssVar(source, '--glass-a-bottom')),
      text: parseColor(cssVar(source, '--glass-text')),
      text2: parseColor(cssVar(source, '--glass-text-2')),
      text3: parseColor(cssVar(source, '--glass-text-3')),
    };
  }
  for (const wallpaper of ADMIN_UI_WALLPAPERS) {
    const tone = tones[wallpaper.tone];
    const stops = wallpaper.stops.map(([color]) => parseColor(color).rgb);
    const samples = [...stops, ...wallpaper.blobs.flatMap((blob) => stops.map((stop) => over(blob.rgb, blob.alpha, stop)))];
    for (const sample of samples) {
      const card = over(tone.glass, tone.alpha, saturate(sample, 1.75));
      const ink = (color) => over(color.rgb, color.alpha, card);
      assert.ok(contrast(ink(tone.text), card) >= 4.5, `${wallpaper.id}: body text contrast`);
      assert.ok(contrast(ink(tone.text2), card) >= 4.5, `${wallpaper.id}: secondary text contrast ${contrast(ink(tone.text2), card).toFixed(2)}`);
      assert.ok(contrast(ink(tone.text3), card) >= 3, `${wallpaper.id}: hint text contrast ${contrast(ink(tone.text3), card).toFixed(2)}`);
    }
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

test('home summary queries use the datetime(created_at) index, and existing databases gain it on startup', withDb(async (db) => {
  const plan = (sql, values = []) => db.sqlAll(`EXPLAIN QUERY PLAN ${sql}`, values).map(row => row.detail).join(' | ');
  assert.match(plan(`SELECT COUNT(*) FROM observations WHERE datetime(created_at) >= datetime(?)`, ['2026-10-01 00:00:00']),
    /idx_observations_created_dt/);
  assert.match(plan(`SELECT id FROM observations ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 10`), /idx_observations_created_dt/);
  // A database from the previous release has no such index: the next initialize adds it without a schema bump.
  await db.sqlWrite((tx) => tx.run(`DROP INDEX idx_observations_created_dt`));
  const dbPath = process.env.AGENTMEM_DB_PATH;
  db.close();
  const reopened = new DatabaseManager();
  try {
    await reopened.initialize();
    assert.equal(reopened.sqlAll(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_observations_created_dt'`).length, 1);
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '11');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));

test('home summary route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find(addr => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, get }) => {
    const local = await get('/admin/api/home-summary');
    assert.ok(Array.isArray(local.daily));
    const response = await fetch(`http://${external.address}:${port}/admin/api/home-summary`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('activity and memory-detail queries use the task_results observation index, and existing databases gain it on startup', withDb(async (db) => {
  const plan = (sql, values = []) => db.sqlAll(`EXPLAIN QUERY PLAN ${sql}`, values).map(row => row.detail).join(' | ');
  assert.match(plan(`SELECT COUNT(*) FROM task_results WHERE observation_id=?`, ['obs']), /idx_task_results_observation/);
  assert.match(plan(`SELECT id FROM task_results WHERE observation_id=? ORDER BY rowid`, ['obs']), /idx_task_results_observation/);
  // A database from the previous release has no such index: the next initialize adds it without a schema bump.
  await db.sqlWrite((tx) => tx.run(`DROP INDEX idx_task_results_observation`));
  const dbPath = process.env.AGENTMEM_DB_PATH;
  db.close();
  const reopened = new DatabaseManager();
  try {
    await reopened.initialize();
    assert.equal(reopened.sqlAll(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_results_observation'`).length, 1);
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '11');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));
