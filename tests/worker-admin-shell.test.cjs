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
const { ADMIN_UI_NAV_ITEMS, ADMIN_UI_DEV_PANELS, ADMIN_UI_HEALTH_CHECKS, ADMIN_UI_ICONS } = require('../dist/services/admin-ui-markup.js');
const { ADMIN_UI_THEME, ADMIN_UI_WALLPAPERS, ADMIN_UI_GLASS_COLORS } = require('../dist/services/admin-ui-theme.js');
const {
  ADMIN_UI_THEME_STORAGE_KEY,
  ADMIN_UI_LEGACY_BACKGROUND_STORAGE_KEY,
  ADMIN_UI_THEME_DEFAULTS,
  renderAdminThemeBootScript,
} = require('../dist/services/admin-ui-client.js');
const { DatabaseManager } = require('../dist/services/db.js');
const { withWorker, assertLanRefused } = require('./helpers/task-worker.cjs');

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
  for (const match of script.matchAll(/\bt\("((?:nav|home|shell|devtools|theme)\.[\w.]+)"/g)) used.add(match[1]);
  for (const match of script.matchAll(/"((?:nav|home|shell|devtools|theme)\.[A-Za-z0-9.]+)"/g)) used.add(match[1]);
  for (const item of [...ADMIN_UI_NAV_ITEMS, ...ADMIN_UI_DEV_PANELS, ...ADMIN_UI_WALLPAPERS]) used.add(item.key);
  for (const check of ADMIN_UI_HEALTH_CHECKS) used.add(check.labelKey);
  assert.ok(used.size > 50);
  for (const key of used) {
    if (!/^[a-zA-Z]+\.[\w.]+$/.test(key)) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  // New shell namespaces must stay in parity between the two locales.
  const shellKeys = (dict) => Object.keys(dict).filter((key) => /^(nav|home|shell|devtools|theme)\./.test(key)).sort();
  assert.deepEqual(shellKeys(zh), shellKeys(en));
  assert.equal(zh['home.allClear'], '一切正常');
  assert.equal(zh['nav.devTools'], '开发者工具');
  assert.equal(zh['theme.title'], '主题');
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

test('sidebar Theme row opens a labelled panel with mode, sets, presets, upload, tone, sliders and reset', () => {
  const sidebar = html.slice(html.indexOf('id="appSidebar"'), html.indexOf('</aside>'));
  const button = elementTag('bgPickerButton');
  assert.ok(sidebar.includes('id="bgPickerButton"'), 'Theme row sits in the sidebar');
  const themeRow = sidebar.slice(sidebar.indexOf('id="bgPickerButton"'), sidebar.indexOf('class="devToggle"'));
  assert.doesNotMatch(themeRow, /bgSwatch|iosSwitch/);
  assert.ok(sidebar.includes(ADMIN_UI_ICONS.theme), 'theme icon');
  assert.ok(sidebar.includes(ADMIN_UI_ICONS.chevronRight), 'trailing chevron');
  assert.match(sidebar, /id="bgModeValue"/);
  assert.match(sidebar, /class="sidebarRowValue"/);
  assert.match(sidebar, /data-i18n="theme\.title"/);
  assert.match(sidebar, />Theme</);
  assert.match(button, /aria-controls="bgPopover"/);
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.doesNotMatch(sidebar, /background/i);
  assert.doesNotMatch(ADMIN_UI_THEME, /\.bgSwatch\b/);

  // The panel is a sibling of the sidebar: inside it, the sidebar's backdrop-filter would clip its blur.
  assert.ok(!sidebar.includes('id="bgPopover"'));
  const popoverTag = elementTag('bgPopover');
  assert.match(popoverTag, /role="dialog"/);
  assert.match(popoverTag, /aria-labelledby="bgPopoverTitle"/);
  assert.match(popoverTag, /\bhidden\b/);
  elementTag('bgPopoverTitle');
  assert.match(elementTag('bgPopoverClose'), /data-i18n-aria-label="theme\.close"/);

  const popover = html.slice(html.indexOf('id="bgPopover"'), html.indexOf('</section>', html.indexOf('id="bgPopover"')));
  assert.doesNotMatch(popover, /background/i);
  assert.doesNotMatch(popover, /背景/);
  assert.deepEqual(ADMIN_UI_WALLPAPERS.map((wallpaper) => [wallpaper.id, wallpaper.tone]), [
    ['mist', 'light'], ['graphite', 'dark'],
  ]);
  const presets = [...popover.matchAll(/data-bg-preset="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(presets, [...ADMIN_UI_WALLPAPERS.map((wallpaper) => wallpaper.id), 'custom']);
  for (const wallpaper of ADMIN_UI_WALLPAPERS) {
    assert.match(elementTag(`bgPreset${wallpaper.label}`), new RegExp(`data-bg-preset="${wallpaper.id}"`));
    assert.match(ADMIN_UI_THEME, new RegExp(`html\\[data-bg="${wallpaper.id}"\\]`));
    assert.match(ADMIN_UI_THEME, new RegExp(`\\.bgThumb\\[data-wall="${wallpaper.id}"\\]`));
  }
  assert.doesNotMatch(ADMIN_UI_THEME, /data-bg="(?:aurora|sunset|lagoon|night)"/);
  assert.match(elementTag('bgPresetCustom'), /\bhidden\b/);
  elementTag('bgUploadButton');
  const upload = elementTag('bgUploadInput');
  assert.match(upload, /type="file"/);
  assert.match(upload, /accept="image\/\*"/);

  const mode = elementTag('bgModeControl');
  assert.match(mode, /role="group"/);
  assert.match(mode, /aria-labelledby="bgModeLabel"/);
  assert.deepEqual([...popover.matchAll(/data-theme-mode="([^"]+)"/g)].map((match) => match[1]), ['auto', 'light', 'dark']);
  const sets = elementTag('bgSetControl');
  assert.match(sets, /role="tablist"/);
  assert.deepEqual([...popover.matchAll(/data-theme-set="([^"]+)"/g)].map((match) => match[1]), ['light', 'dark']);
  assert.match(elementTag('bgSetLight'), /data-i18n="theme\.tabLight"/);
  assert.match(elementTag('bgSetLight'), /data-i18n-aria-label="theme\.tabLightAria"/);
  assert.match(elementTag('bgSetDark'), /data-i18n-aria-label="theme\.tabDarkAria"/);

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

test('Activity day pills hide at zero, headings use the shared date formatter and zh-CN ranges keep the dash tight', () => {
  const column = extractClientFunction(script, 'renderActivityColumn');
  assert.match(column, /setHidden\(pill, !act\.payload \|\| count === 0/);
  assert.match(column, /formatUiDate\(date, "day"\)/);
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

test('every view shares one theme and the client has no activity backdrop path', () => {
  assert.doesNotMatch(script, /data-act-bg/);
  assert.doesNotMatch(script, /usesActivityBackdrop/);
  assert.doesNotMatch(ADMIN_UI_THEME, /data-act-bg/);
  assert.doesNotMatch(renderAdminThemeBootScript(), /data-act-bg|usesActivityBackdrop/);
  assert.match(script, /function applyTheme\(/);
  assert.match(extractClientFunction(script, 'activateView'), /applyTheme\(\)/);
  assert.match(script, /removeProperty\("--bg-image"\)/);
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

test('theme copy has no background wording in either locale', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  assert.equal(en['theme.title'], 'Theme');
  assert.equal(zh['theme.title'], '主题');
  assert.equal(en['theme.lead'], 'Light and dark sets, each with its own wallpaper and glass');
  assert.equal(zh['theme.lead'], '浅色、深色各一套，可分别设置壁纸和玻璃');
  assert.equal(en['theme.modeAuto'], 'Auto');
  assert.equal(en['theme.modeLight'], 'Light');
  assert.equal(en['theme.modeDark'], 'Dark');
  assert.equal(zh['theme.modeAuto'], '跟随系统');
  assert.equal(zh['theme.modeLight'], '浅色');
  assert.equal(zh['theme.modeDark'], '深色');
  assert.equal(en['theme.tabLight'], 'Light set');
  assert.equal(en['theme.tabDark'], 'Dark set');
  assert.equal(zh['theme.tabLight'], '浅色');
  assert.equal(zh['theme.tabDark'], '深色');
  assert.equal(zh['theme.tabLightAria'], '浅色主题');
  assert.equal(zh['theme.tabDarkAria'], '深色主题');
  for (const [locale, dict] of [['en', en], ['zh-CN', zh]]) {
    for (const [key, value] of Object.entries(dict)) {
      if (!key.startsWith('theme.')) continue;
      assert.equal(/background/i.test(String(value)), false, `${locale} ${key}`);
      assert.equal(String(value).includes('背景'), false, `${locale} ${key}`);
    }
  }
  assert.equal(Object.keys(en).some((key) => key.startsWith('bg.')), false);
  assert.equal(Object.keys(zh).some((key) => key.startsWith('bg.')), false);
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

  const open = extractClientFunction(script, 'openMemoryDrawer');
  assert.match(open, /if \(payload\.disabled\) \{[\s\S]*drawer\.readsDisabled = true/);
  assert.match(open, /drawer\.missing = false/);
  assert.match(open, /drawer\.readsDisabled = false/);

  const drawer = extractClientFunction(script, 'renderMemoryDrawer');
  assert.match(drawer, /drawer\.readsDisabled/);
  assert.match(drawer, /activity\.drawerReadsDisabled/);
  assert.ok(drawer.indexOf('activity.drawerReadsDisabled') < drawer.indexOf('activity.drawerMissing'));
});

test('Memory view replaces the placeholder with the toolbar, summary, top projects, list and notice', () => {
  const start = html.indexOf('id="memoryView"');
  const memory = html.slice(start, html.indexOf('id="pipelineView"'));
  assert.match(elementTag('memoryView'), /class="appView memoryView"/);
  assert.doesNotMatch(memory, /placeholderCard|shell\.comingSoon/);
  for (const id of ['memoryLead', 'memoryToolbar', 'memorySearchInput', 'memorySearchClear', 'memoryProjectButton', 'memoryProjectValue',
    'memoryAgentButton', 'memoryKindButton', 'memorySourceButton', 'memoryRangeControl', 'memoryRangeAny', 'memoryRange7d',
    'memoryRange30d', 'memoryRangeCustom', 'memorySummary', 'memorySumTotal', 'memorySumOutcome', 'memorySumContext', 'memorySumLegacy',
    'memoryUpdated', 'memoryTopProjects', 'memoryTopBar', 'memoryListHead', 'memoryList', 'memoryNotice', 'memoryNoticeAction',
    'memoryLoadMore', 'memoryProjectPopover', 'memoryAgentPopover', 'memoryKindPopover', 'memorySourcePopover', 'memoryCustomPopover',
    'memoryCustomFrom', 'memoryCustomTo', 'memoryCustomApply', 'memoryCustomCancel', 'memoryCustomError']) {
    assert.ok(memory.includes(`id="${id}"`), `#${id} lives in the Memory view`);
  }
  assert.match(elementTag('memorySearchInput'), /maxlength="200"/);
  assert.deepEqual([...memory.matchAll(/data-memory-range="([^"]+)"/g)].map((match) => match[1]), ['any', '7d', '30d', 'custom']);
  assert.match(elementTag('memoryRangeAny'), /aria-pressed="true"/);
  // Popovers sit outside the blurred toolbar, and the list is filled by the client.
  const toolbar = memory.slice(memory.indexOf('id="memoryToolbar"'), memory.indexOf('id="memorySummary"'));
  assert.doesNotMatch(toolbar, /class="actPopover/);
  assert.match(memory, /id="memoryList"[^>]*><\/div>/);
  // Home "View all" and the Activity search button open Memory.
  assert.match(elementTag('homeRecentViewAll'), /data-nav-target="memoryView"/);
  assert.doesNotMatch(elementTag('homeRecentViewAll'), /data-requires-dev-tools/);
  assert.match(elementTag('activitySearchButton'), /data-nav-target="memoryView"/);
  assert.match(elementTag('activitySearchButton'), /data-focus-target="memorySearchInput"/);
  assert.doesNotMatch(elementTag('activitySearchButton'), /aria-disabled/);
});

test('Memory client reads /admin/api/memories, debounces search and polls only the plain list', () => {
  assert.match(script, /"\/admin\/api\/memories\?"/);
  assert.match(script, /MEMORY_SEARCH_DELAY_MS = 300/);
  const load = extractClientFunction(script, 'loadMemories');
  assert.match(load, /if \(seq !== mem\.seq\) return;/);
  assert.match(load, /error\.status === 400/);
  assert.match(load, /mem\.readsDisabled = true/);
  assert.match(extractClientFunction(script, 'memoryUrl'), /stats: cursor \? "0" : "1"/);
  const poll = extractClientFunction(script, 'memoryCanPoll');
  assert.match(poll, /!isMemoryFiltered\(\)/);
  assert.match(poll, /!mem\.searchTimer/);
  assert.match(poll, /!isMemoryDrawerOpen\(\)/);
  assert.match(poll, /lastScrollAt/);
  const filtered = extractClientFunction(script, 'isMemoryFiltered');
  for (const guard of [/mem\.query/, /mem\.project/, /mem\.agent/, /mem\.kind !== "default"/, /mem\.source/, /mem\.range !== "any"/]) {
    assert.match(filtered, guard);
  }
  assert.match(extractClientFunction(script, 'pollVisibleView'), /memoryCanPoll\(\)/);
  assert.doesNotMatch(script, /usesActivityBackdrop|data-act-bg/);
  const merged = vm.runInNewContext(`
    ${extractClientFunction(script, 'mergeMemoryDays')}
    mergeMemoryDays([{ day: '2026-10-16', count: 4 }, { day: '2026-10-15', count: 9 }], [{ day: '2026-10-15', count: 9 }, { day: '2026-10-14', count: 2 }]);
  `);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), [{ day: '2026-10-16', count: 4 }, { day: '2026-10-15', count: 9 }, { day: '2026-10-14', count: 2 }]);
  // One drawer for both views: Memory moves Activity's drawer node in rather than copying it.
  assert.equal((html.match(/class="actDrawer"/g) || []).length, 1);
  assert.match(extractClientFunction(script, 'mountMemoryDrawer'), /view\.appendChild\(drawerEl\)/);
});

test('every Memory i18n key exists in en and zh-CN', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const memoryKeys = (dict) => Object.keys(dict).filter((key) => key.startsWith('memory.')).sort();
  assert.ok(memoryKeys(en).length > 60);
  assert.deepEqual(memoryKeys(zh), memoryKeys(en));
  for (const key of memoryKeys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  }
  const source = html.replace(/const UI_DICTIONARY = .*\n/, '');
  const used = new Set([...source.matchAll(/"(memory\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  assert.ok(used.size > 40);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
});

test('Memory drawer reserves list space when open and keeps reads-disabled copy local', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  assert.equal(en['memory.readsDisabledTitle'], 'Memory reads are turned off');
  assert.equal(zh['memory.readsDisabledTitle'], '记忆读取已关闭');
  assert.equal(en['memory.readsDisabledLead'], 'Memories are hidden while reads are disabled. Turn reads back on in Settings to browse them here.');
  assert.equal(zh['memory.readsDisabledLead'], '读取关闭期间不显示记忆。到设置里重新打开读取后，就能在这里浏览。');
  assert.equal(en['activity.drawerReadsDisabled'], 'Memory details are hidden while reads are disabled.');

  const open = extractClientFunction(script, 'openMemoryDrawer');
  assert.match(open, /\/admin\/api\/memory-detail\?id=/);
  const openDisabled = open.slice(open.indexOf('if (payload.disabled)'), open.indexOf('} else {'));
  assert.match(openDisabled, /drawer\.readsDisabled = true/);
  assert.match(openDisabled, /drawer\.payload = null/);
  assert.doesNotMatch(openDisabled, /payload\.message/);

  const drawer = extractClientFunction(script, 'renderMemoryDrawer');
  assert.match(drawer, /drawer\.readsDisabled/);
  assert.match(drawer, /activity\.drawerReadsDisabled/);
  assert.ok(drawer.indexOf('activity.drawerReadsDisabled') < drawer.indexOf('renderMemoryDrawerBody(drawer.payload)'));
  assert.doesNotMatch(drawer, /payload\.message/);
  assert.match(drawer, /classList\.toggle\("is-drawer-open", open && drawer\.host === "memoryView"\)/);
  assert.match(drawer, /classList\.toggle\("has-drawer", open && drawer\.host === "activityView"\)/);
  assert.doesNotMatch(drawer, /activityView\.classList\.toggle\("is-drawer-open"/);

  const load = extractClientFunction(script, 'loadMemories');
  const loadDisabled = load.slice(load.indexOf('if (payload.disabled)'), load.indexOf('} else {'));
  assert.match(loadDisabled, /mem\.readsDisabled = true/);
  assert.doesNotMatch(loadDisabled, /payload\.message/);

  const notice = extractClientFunction(script, 'renderMemoryNotice');
  const noticeDisabled = notice.slice(notice.indexOf('if (mem.readsDisabled)'), notice.indexOf('} else if'));
  assert.match(noticeDisabled, /memory\.readsDisabledTitle/);
  assert.match(noticeDisabled, /memory\.readsDisabledLead/);
  assert.doesNotMatch(noticeDisabled, /message/);

  const reserveAt = html.indexOf('.memoryView.is-drawer-open .memSummary');
  const queryAt = html.lastIndexOf('@media (min-width: 1440px)', reserveAt);
  assert.ok(queryAt >= 0 && queryAt < reserveAt, 'wide-viewport reserve lives in min-width: 1440px');
  const reserve = html.slice(reserveAt, html.indexOf('margin-right:', reserveAt) + 80);
  assert.match(reserve, /\.memoryView\.is-drawer-open \.memSummary/);
  assert.match(reserve, /\.memoryView\.is-drawer-open \.memTop/);
  assert.match(reserve, /\.memoryView\.is-drawer-open \.memHead/);
  assert.match(reserve, /\.memoryView\.is-drawer-open \.memGroup/);
  assert.match(reserve, /\.memoryView\.is-drawer-open \.memMoreRow/);
  assert.doesNotMatch(reserve, /\.memToolbar|\.activityView/);
  assert.match(reserve, /margin-right: calc\(min\(456px, calc\(100vw - 32px\)\) \+ 16px\)/);

  const memory = html.slice(html.indexOf('id="memoryView"'), html.indexOf('id="pipelineView"'));
  assert.doesNotMatch(memory, /placeholderCard|shell\.comingSoon/);
  const markup = html.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test('Memory drawer docks only when matchMedia 1440 matches and is a modal sheet otherwise', () => {
  const dock = extractClientFunction(script, 'memoryDrawerIsDocked');
  assert.match(dock, /host === "memoryView"/);
  assert.match(dock, /window\.matchMedia\("\(min-width: 1440px\)"\)/);
  assert.match(dock, /query && query\.matches/);

  const mount = extractClientFunction(script, 'mountMemoryDrawer');
  assert.match(mount, /const docked = memoryDrawerIsDocked\(host\)/);
  assert.match(mount, /setAttr\(drawerEl, "aria-modal", docked \? "false" : "true"\)/);
  assert.match(mount, /classList\.toggle\("is-docked", docked\)/);

  const drawer = extractClientFunction(script, 'renderMemoryDrawer');
  assert.match(drawer, /setHidden\(els\.activityDrawerScrim, !open \|\| memoryDrawerIsDocked\(drawer\.host\)\)/);
  assert.match(drawer, /classList\.toggle\("is-drawer-open", open && drawer\.host === "memoryView"\)/);

  const open = extractClientFunction(script, 'openMemoryDrawer');
  assert.match(open, /if \(!memoryDrawerIsDocked\(nextHost\) && els\.activityDrawerClose\) els\.activityDrawerClose\.focus\(\)/);

  const bind = extractClientFunction(script, 'bindMemoryDrawerEvents');
  assert.match(bind, /els\.activityDrawerScrim\.addEventListener\("click", \(\) => closeMemoryDrawer\(true\)\)/);
  assert.match(bind, /window\.matchMedia\("\(min-width: 1440px\)"\)/);
  assert.match(bind, /addEventListener\("change"/);
  assert.equal((bind.match(/addEventListener\("change"/g) || []).length, 1);
  assert.match(bind, /if \(!isMemoryDrawerOpen\(\) \|\| \(state\.drawer\.host !== "memoryView" && state\.drawer\.host !== "pipelineView" && state\.drawer\.host !== "digestsView"\)\) return;/);
  assert.match(bind, /mountMemoryDrawer\(state\.drawer\.host\)/);
  assert.match(bind, /event\.key === "Tab" && !memoryDrawerIsDocked\(state\.drawer\.host\)/);
  assert.match(bind, /event\.key === "Escape"/);
  assert.match(bind, /#activityDrawerClose/);
});

test('Earlier panel hides its lead and note while reads are disabled', () => {
  elementTag('activityEarlierLead');
  elementTag('activityEarlierNote');
  assert.match(elementTag('activityEarlierLead'), /data-i18n="activity\.earlierLead"/);
  assert.match(elementTag('activityEarlierNote'), /data-i18n="activity\.earlierNote"/);
  const earlier = extractClientFunction(script, 'renderActivityEarlier');
  assert.match(earlier, /setHidden\(els\.activityEarlierTitle, !!early\.readsDisabled\)/);
  assert.match(earlier, /setHidden\(els\.activityEarlierLead, !!early\.readsDisabled\)/);
  assert.match(earlier, /setHidden\(els\.activityEarlierNote, !!early\.readsDisabled\)/);
  assert.ok(earlier.indexOf('setHidden(els.activityEarlierLead') < earlier.indexOf('activity.readsDisabledTitle'));
});

test('Memory clears loaded rows as soon as a disabled page comes back', () => {
  const load = extractClientFunction(script, 'loadMemories');
  assert.match(load, /if \(mem\.readsDisabled\) mode = "reset"/);
  const disabled = load.slice(load.indexOf('if (payload.disabled)'), load.indexOf('} else {'));
  assert.match(disabled, /mem\.items = \[\]/);
  assert.match(disabled, /mem\.days = \[\]/);
  assert.match(disabled, /mem\.stats = null/);
  assert.match(disabled, /mem\.nextCursor = null/);
  assert.match(disabled, /mem\.rowNodes\.clear\(\)/);
  assert.match(disabled, /memoryList\.innerHTML = ""/);
  assert.doesNotMatch(disabled, /mode === "more"|mode === "refresh"|mode === "reset"/);
  const resumed = load.slice(load.indexOf('} else {'), load.indexOf('const incoming'));
  assert.match(resumed, /if \(mem\.readsDisabled\) mode = "reset"/);
  const list = extractClientFunction(script, 'renderMemoryList');
  assert.match(list, /if \(mem\.readsDisabled && list\) \{[\s\S]*list\.innerHTML = ""/);
  assert.match(list, /mem\.rowNodes\.clear\(\)/);
  assert.ok(list.indexOf('list.innerHTML = ""') < list.indexOf('if (noticed) return'));
});

test('shared drawer hides the copy button while reads are disabled', () => {
  elementTag('memoryDrawerCopy');
  const drawer = extractClientFunction(script, 'renderMemoryDrawer');
  assert.match(drawer, /setHidden\(els\.memoryDrawerCopy, !!drawer\.readsDisabled\)/);
  assert.ok(drawer.indexOf('memoryDrawerCopy') < drawer.indexOf('activity.drawerReadsDisabled'));
});

test('escapeHtml neutralises hostile memory text', () => {
  // extractClientFunction treats the quote inside /"/ as a string, so slice to the next function.
  const start = script.indexOf('function escapeHtml(');
  const end = script.indexOf('function summarize(', start);
  assert.ok(start >= 0 && end > start);
  const escaped = vm.runInNewContext(`
    ${script.slice(start, end)}
    ({
      img: escapeHtml('<img src=x onerror=alert(1)>'),
      script: escapeHtml('"><script>'),
    });
  `);
  assert.equal(escaped.img, '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escaped.script, '&quot;&gt;&lt;script&gt;');
  assert.equal(escaped.img.includes('<'), false);
  assert.equal(escaped.script.includes('<'), false);
});

test('memoryCanPoll is false for a 7 day range and a pending search', () => {
  const result = vm.runInNewContext(`
    const MEMORY_SCROLL_IDLE_MS = 1500;
    const state = {
      activeView: "memoryView",
      memory: {
        query: "", project: "", agent: "", kind: "default", source: "", range: "any",
        loaded: true, readsDisabled: false, searchTimer: 0, openPopover: "", lastScrollAt: 0,
      },
      drawer: { id: "" },
    };
    const document = { hidden: false };
    ${extractClientFunction(script, 'isMemoryDrawerOpen')}
    ${extractClientFunction(script, 'isMemoryFiltered')}
    ${extractClientFunction(script, 'memoryCanPoll')}
    const plain = memoryCanPoll();
    state.memory.range = "7d";
    const ranged = memoryCanPoll();
    state.memory.range = "any";
    state.memory.searchTimer = 41;
    const pending = memoryCanPoll();
    state.memory.searchTimer = 0;
    state.drawer.id = "mem-1";
    const open = memoryCanPoll();
    ({ plain, ranged, pending, open });
  `);
  assert.equal(result.plain, true);
  assert.equal(result.ranged, false);
  assert.equal(result.pending, false);
  assert.equal(result.open, false);
});

test('read policy clears Memory and Earlier without waiting for the next poll', () => {
  const apply = extractClientFunction(script, 'applyReadPolicyToViews');
  assert.match(apply, /mem\.items = \[\]/);
  assert.match(apply, /mem\.days = \[\]/);
  assert.match(apply, /mem\.stats = null/);
  assert.match(apply, /mem\.nextCursor = null/);
  assert.match(apply, /mem\.groupNodes\.clear\(\)/);
  assert.match(apply, /mem\.rowNodes\.clear\(\)/);
  assert.match(apply, /mem\.readsDisabled = true/);
  assert.match(apply, /mem\.readsDisabled = false/);
  assert.match(apply, /mem\.seq \+= 1/);
  assert.match(apply, /drawer\.payload = null/);
  assert.match(apply, /drawer\.seq \+= 1/);
  assert.match(apply, /drawer\.readsDisabled = true/);
  assert.match(apply, /renderMemoryDrawer\(\)/);
  assert.match(apply, /early\.payload = null/);
  assert.match(apply, /early\.loadedAt = 0/);
  assert.match(apply, /early\.key = ""/);
  assert.match(apply, /early\.seq \+= 1/);
  assert.match(apply, /early\.readsDisabled = false/);
  assert.match(apply, /early\.message = ""/);
  assert.match(apply, /loadMemories\("reset"\)/);
  assert.match(apply, /loadActivityEarlier\(true\)/);

  const save = extractClientFunction(script, 'savePolicy');
  const saved = save.slice(save.indexOf('state.overview.policy = payload.policy'), save.indexOf('} catch'));
  assert.match(saved, /applyReadPolicyToViews\(payload\.policy\)/);
  assert.ok(saved.indexOf('payload.policy') < saved.indexOf('renderOverview()'));

  const overview = extractClientFunction(script, 'loadOverview');
  const refreshed = overview.slice(overview.indexOf('state.overview = nextOverview'), overview.indexOf('renderOverview()'));
  assert.match(refreshed, /applyReadPolicyToViews\(nextOverview\.policy\)/);

  const load = extractClientFunction(script, 'loadMemories');
  const disabled = load.slice(load.indexOf('if (payload.disabled)'), load.indexOf('} else {'));
  assert.match(disabled, /applyReadPolicyToViews\(\{ readEnabled: false \}\)/);
  const detail = extractClientFunction(script, 'openMemoryDrawer');
  const detailDisabled = detail.slice(detail.indexOf('if (payload.disabled)'), detail.indexOf('} else {'));
  assert.match(detailDisabled, /applyReadPolicyToViews\(\{ readEnabled: false \}\)/);
  const earlier = extractClientFunction(script, 'loadActivityEarlier');
  const earlierDisabled = earlier.slice(earlier.indexOf('if (payload.disabled)'), earlier.indexOf('} else {'));
  assert.match(earlierDisabled, /applyReadPolicyToViews\(\{ readEnabled: false \}\)/);
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
  assert.match(upload, /setBackgroundStatus\("theme\.uploadTooLarge", true\)/);
  assert.equal(ADMIN_UI_TRANSLATIONS.en['theme.uploadTooLarge'], 'That image is larger than 10 MB. Pick a smaller one.');
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['theme.uploadTooLarge'], '图片超过 10 MB，请换一张小一点的。');

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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function runThemeBoot({ theme, legacy, prefersDark = false } = {}) {
  const storage = {};
  if (theme !== undefined) storage['am.theme'] = typeof theme === 'string' ? theme : JSON.stringify(theme);
  if (legacy !== undefined) storage['am.bg'] = typeof legacy === 'string' ? legacy : JSON.stringify(legacy);
  const legacySnapshot = storage['am.bg'];
  const attributes = {};
  const styles = {};
  const writes = [];
  const listeners = [];
  const media = { matches: !!prefersDark };
  const documentElement = {
    setAttribute: (name, value) => { attributes[name] = String(value); },
    style: {
      setProperty: (name, value) => { styles[name] = String(value); },
      removeProperty: (name) => { delete styles[name]; },
    },
  };
  const window = {
    localStorage: {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => { writes.push([key, String(value)]); storage[key] = String(value); },
      removeItem: (key) => { writes.push(['remove', key]); delete storage[key]; },
    },
    matchMedia: () => ({
      get matches() { return media.matches; },
      addEventListener: (_type, fn) => { listeners.push(fn); },
    }),
  };
  vm.runInNewContext(renderAdminThemeBootScript(), { window, document: { documentElement } });
  return { api: window.__amTheme, storage, writes, attributes, styles, media, listeners, legacySnapshot };
}

test('theme settings persist under am.theme and apply in <head> before first paint', () => {
  assert.equal(ADMIN_UI_THEME_STORAGE_KEY, 'am.theme');
  assert.equal(ADMIN_UI_LEGACY_BACKGROUND_STORAGE_KEY, 'am.bg');
  assert.deepEqual(ADMIN_UI_THEME_DEFAULTS, {
    v: 1,
    mode: 'auto',
    light: { wallpaper: 'mist', tone: 'auto', blur: 12, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null },
    dark: { wallpaper: 'graphite', tone: 'auto', blur: 12, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null },
    legacyImageSlot: null,
  });
  const head = html.slice(0, html.indexOf('<body>'));
  const boot = head.match(/<script id="amThemeBoot">([\s\S]*?)<\/script>/);
  assert.ok(boot, 'boot script is inlined in <head>');
  assert.doesNotMatch(head, /amBackgroundBoot/);
  assert.match(boot[1], /"am\.theme"/);
  assert.match(script, /THEME_STORAGE_KEY = "am\.theme"/);
  assert.doesNotMatch(script, /localStorage\.setItem\(\s*LEGACY_BG_STORAGE_KEY|localStorage\.setItem\(\s*"am\.bg"/);
  assert.doesNotThrow(() => new vm.Script(boot[1]));
  assert.equal(boot[1], renderAdminThemeBootScript());

  const lightStyles = { '--bg-blur': '12px', '--bg-brightness': '1', '--glass-scale': '1', 'color-scheme': 'light' };
  const freshLight = runThemeBoot({ prefersDark: false });
  assert.deepEqual(freshLight.attributes, { 'data-theme': 'light', 'data-bg': 'mist', 'data-glass': 'light' });
  assert.deepEqual(freshLight.styles, lightStyles);
  assert.deepEqual(freshLight.writes, []);

  const freshDark = runThemeBoot({ prefersDark: true });
  assert.deepEqual(freshDark.attributes, { 'data-theme': 'dark', 'data-bg': 'graphite', 'data-glass': 'dark' });
  assert.equal(freshDark.styles['color-scheme'], 'dark');
  assert.deepEqual(freshDark.writes, []);

  freshLight.media.matches = true;
  freshLight.listeners.forEach((fn) => fn());
  assert.equal(freshLight.attributes['data-theme'], 'dark');
  assert.equal(freshLight.attributes['data-bg'], 'graphite');
  assert.equal(freshLight.attributes['data-glass'], 'dark');
  assert.equal(freshLight.styles['color-scheme'], 'dark');
  assert.deepEqual(freshLight.writes, []);

  const pinned = runThemeBoot({
    theme: { v: 1, mode: 'light', light: ADMIN_UI_THEME_DEFAULTS.light, dark: ADMIN_UI_THEME_DEFAULTS.dark },
    prefersDark: true,
  });
  assert.equal(pinned.attributes['data-theme'], 'light');
  assert.equal(pinned.attributes['data-bg'], 'mist');
  pinned.media.matches = false;
  pinned.listeners.forEach((fn) => fn());
  assert.equal(pinned.attributes['data-theme'], 'light');
  assert.equal(pinned.attributes['data-bg'], 'mist');

  const legacyRaw = JSON.stringify({ preset: 'night', blur: 8 });
  const migratedBoot = runThemeBoot({ legacy: legacyRaw, prefersDark: false });
  assert.equal(migratedBoot.storage['am.bg'], legacyRaw);
  assert.deepEqual(migratedBoot.writes.map(([key]) => key), ['am.theme']);
  assert.equal(JSON.parse(migratedBoot.storage['am.theme']).dark.blur, 8);
  assert.equal(JSON.parse(migratedBoot.storage['am.theme']).mode, 'auto');
  assert.doesNotMatch(boot[1], /setItem\(\s*LEGACY_KEY|setItem\(\s*"am\.bg"|removeItem\(\s*(?:LEGACY_KEY|"am\.bg")/);

  // A custom image stays on screen: mode follows the old glass, and the boot paint uses that set.
  const customRaw = JSON.stringify({ preset: 'custom', customLuma: 0.2, customColor: '#112233', blur: 3 });
  const customBoot = runThemeBoot({ legacy: customRaw, prefersDark: false });
  assert.equal(customBoot.storage['am.bg'], customRaw);
  assert.deepEqual(customBoot.writes.map(([key]) => key), ['am.theme']);
  assert.equal(customBoot.attributes['data-theme'], 'dark');
  assert.equal(customBoot.attributes['data-bg'], 'custom');
  assert.equal(customBoot.attributes['data-glass'], 'dark');
  assert.equal(customBoot.styles['--bg-custom-color'], '#112233');
  assert.equal(customBoot.styles['--bg-image'], undefined);
  assert.equal(customBoot.styles['color-scheme'], 'dark');
});

test('theme normalize and legacy migration keep both sets and never drop stored images', () => {
  const { api } = runThemeBoot();
  const defaults = plain(api.normalize(null));
  assert.deepEqual(defaults, ADMIN_UI_THEME_DEFAULTS);
  assert.deepEqual(plain(api.normalize({
    mode: 'neon',
    light: { wallpaper: 'aurora', blur: 99, opacity: 5, customColor: 'blue' },
    dark: { wallpaper: 'mist', tone: 'dark' },
  })), {
    v: 1,
    mode: 'auto',
    light: { wallpaper: 'mist', tone: 'auto', blur: 40, dim: 0, opacity: 10, customLuma: null, customColor: null, glassColor: null },
    dark: { wallpaper: 'graphite', tone: 'dark', blur: 12, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null },
    legacyImageSlot: null,
  });

  const migrated = (old) => plain(api.migrateLegacy(old));
  const mist = migrated({ preset: 'mist', blur: 20, dim: 10, opacity: 40 });
  assert.equal(mist.legacySlot, null);
  assert.equal(mist.settings.mode, 'auto');
  assert.deepEqual(mist.settings.light, { wallpaper: 'mist', tone: 'auto', blur: 20, dim: 10, opacity: 40, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(mist.settings.dark, defaults.dark);

  const graphite = migrated({ preset: 'graphite', blur: 4 });
  assert.equal(graphite.legacySlot, null);
  assert.equal(graphite.settings.mode, 'auto');
  assert.deepEqual(graphite.settings.dark, { wallpaper: 'graphite', tone: 'auto', blur: 4, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(graphite.settings.light, defaults.light);

  const aurora = migrated({ preset: 'aurora', blur: 18, dim: 6, opacity: 50 });
  assert.equal(aurora.legacySlot, null);
  assert.equal(aurora.settings.mode, 'auto');
  assert.deepEqual(aurora.settings.light, { wallpaper: 'mist', tone: 'auto', blur: 18, dim: 6, opacity: 50, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(aurora.settings.dark, defaults.dark);

  const night = migrated({ preset: 'night', blur: 8, opacity: 22 });
  assert.equal(night.legacySlot, null);
  assert.equal(night.settings.mode, 'auto');
  assert.deepEqual(night.settings.dark, { wallpaper: 'graphite', tone: 'auto', blur: 8, dim: 0, opacity: 22, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(night.settings.light, defaults.light);

  const customDark = migrated({ preset: 'custom', customLuma: 0.2, customColor: '#112233', blur: 3 });
  assert.equal(customDark.legacySlot, 'dark');
  assert.equal(customDark.settings.legacyImageSlot, 'dark');
  assert.equal(customDark.settings.mode, 'dark');
  assert.deepEqual(customDark.settings.dark, { wallpaper: 'custom', tone: 'auto', blur: 3, dim: 0, opacity: 30, customLuma: 0.2, customColor: '#112233', glassColor: null });
  assert.deepEqual(customDark.settings.light, defaults.light);

  const customLight = migrated({ preset: 'custom', customLuma: 0.8 });
  assert.equal(customLight.legacySlot, 'light');
  assert.equal(customLight.settings.legacyImageSlot, 'light');
  assert.equal(customLight.settings.mode, 'light');
  assert.equal(customLight.settings.light.wallpaper, 'custom');
  assert.equal(customLight.settings.light.customLuma, 0.8);
  assert.deepEqual(customLight.settings.dark, defaults.dark);

  // The upload is no longer selected. It still lands on the dark set; wallpaper and mode stay put.
  const parked = plain(api.migrateLegacy({ preset: 'mist', blur: 20, dim: 10, opacity: 40 }, 0.2));
  assert.equal(parked.legacySlot, null);
  assert.equal(parked.settings.legacyImageSlot, 'dark');
  assert.equal(parked.settings.mode, 'auto');
  assert.deepEqual(parked.settings.light, { wallpaper: 'mist', tone: 'auto', blur: 20, dim: 10, opacity: 40, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(parked.settings.dark, { wallpaper: 'graphite', tone: 'auto', blur: 12, dim: 0, opacity: 30, customLuma: 0.2, customColor: null, glassColor: null });
  const parkedColor = plain(api.migrateLegacy({ preset: 'aurora' }, { luma: null, color: '#abcdef' }));
  assert.equal(parkedColor.settings.legacyImageSlot, 'light');
  assert.equal(parkedColor.settings.mode, 'auto');
  assert.equal(parkedColor.settings.light.wallpaper, 'mist');
  assert.equal(parkedColor.settings.dark.wallpaper, 'graphite');
  assert.equal(parkedColor.settings.light.customLuma, 0.75);
  assert.equal(parkedColor.settings.light.customColor, '#abcdef');

  const toneWins = migrated({ preset: 'aurora', tone: 'dark', blur: 7 });
  assert.equal(toneWins.legacySlot, null);
  assert.equal(toneWins.settings.mode, 'auto');
  assert.deepEqual(toneWins.settings.dark, { wallpaper: 'graphite', tone: 'dark', blur: 7, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null });
  assert.deepEqual(toneWins.settings.light, defaults.light);

  const mistTone = migrated({ preset: 'mist', tone: 'dark', blur: 4 });
  assert.equal(mistTone.legacySlot, null);
  assert.equal(mistTone.settings.mode, 'auto');
  assert.equal(mistTone.settings.light.wallpaper, 'mist');
  assert.equal(mistTone.settings.light.blur, 12);
  assert.deepEqual(mistTone.settings.dark, { wallpaper: 'graphite', tone: 'dark', blur: 4, dim: 0, opacity: 30, customLuma: null, customColor: null, glassColor: null });

  for (const junk of [null, 'nope', [], { preset: 'nope', tone: 'neon' }]) {
    const result = migrated(junk);
    assert.equal(result.legacySlot, null);
    assert.deepEqual(result.settings, defaults);
  }

  assert.equal(api.resolveMode(defaults, false), 'light');
  assert.equal(api.resolveMode(defaults, true), 'dark');
  assert.equal(api.resolveMode(plain(api.normalize({ mode: 'dark' })), false), 'dark');
  assert.equal(plain(api.activeSet(defaults, true)).wallpaper, 'graphite');
  assert.equal(plain(api.activeSet(defaults, false)).wallpaper, 'mist');
  assert.equal(api.resolveTone(defaults.light), 'light');
  assert.equal(api.resolveTone(defaults.dark), 'dark');
  assert.equal(api.resolveTone({ wallpaper: 'custom', tone: 'auto', dim: 0, customLuma: 0.2 }), 'dark');
  assert.equal(api.resolveTone({ wallpaper: 'custom', tone: 'auto', dim: 0, customLuma: null }), 'light');
  // Mist at full Dim crosses the 0.5 threshold (0.93 × 0.4).
  assert.equal(api.resolveTone({ wallpaper: 'mist', tone: 'auto', dim: 60 }), 'dark');
  assert.equal(api.resolveTone({ wallpaper: 'graphite', tone: 'light', dim: 0 }), 'light');
  assert.equal(plain(api.normalize({ legacyImageSlot: 'dark', mode: 'light' })).legacyImageSlot, 'dark');
  assert.equal(plain(api.normalize({ legacyImageSlot: 'nope' })).legacyImageSlot, null);
  assert.equal(defaults.legacyImageSlot, null);
});

function contrast(rgbText, hexText) {
  const lum = (parts) => {
    const linear = parts.map((part) => {
      const v = part / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const tint = rgbText.split(',').map(Number);
  const text = [1, 3, 5].map((at) => parseInt(hexText.slice(at, at + 2), 16));
  const [a, b] = [lum(tint), lum(text)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test('Theme panel has a per-set glass color row next to Glass tone, with Reset restoring it', () => {
  const popover = html.slice(html.indexOf('id="bgPopover"'), html.indexOf('</section>', html.indexOf('id="bgPopover"')));
  const control = elementTag('bgGlassColorControl');
  assert.match(control, /role="group"/);
  assert.match(control, /aria-labelledby="bgGlassColorLabel"/);
  assert.match(elementTag('bgGlassColorLabel'), /data-i18n="theme\.glassColor"/);
  // Between Glass tone and the sliders.
  const at = (needle) => popover.indexOf(needle);
  assert.ok(at('id="bgToneControl"') < at('id="bgGlassColorControl"'));
  assert.ok(at('id="bgGlassColorControl"') < at('id="bgBlurInput"'));
  assert.deepEqual([...popover.matchAll(/data-glass-color="([^"]*)"/g)].map((match) => match[1]),
    ['', ...ADMIN_UI_GLASS_COLORS.map((color) => color.hex)]);
  for (const color of ADMIN_UI_GLASS_COLORS) assert.match(color.hex, /^#[0-9a-f]{6}$/);
  const picker = elementTag('bgGlassColorInput');
  assert.match(picker, /type="color"/);
  assert.match(picker, /data-i18n-aria-label="theme\.glassColorCustom"/);
  // No new sliders: the row is swatches plus one native picker.
  assert.equal((popover.match(/type="range"/g) || []).length, 3);

  const keys = ['theme.glassColor', 'theme.glassColorDefault', 'theme.glassColorCustom', ...ADMIN_UI_GLASS_COLORS.map((color) => color.key)];
  for (const locale of ['en', 'zh-CN']) {
    for (const key of keys) assert.ok(ADMIN_UI_TRANSLATIONS[locale][key], `${locale} ${key}`);
  }
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['theme.glassColor'], '玻璃颜色');

  assert.match(script, /bgGlassColorButtons: Array\.from\(document\.querySelectorAll\("\[data-glass-color\]"\)\)/);
  assert.match(script, /updateTheme\(\{ set: \{ glassColor: button\.getAttribute\("data-glass-color"\) \|\| null \} \}, true\)/);
  assert.match(script, /glassColor: defaults\.glassColor,/);
  assert.match(ADMIN_UI_THEME, /\.bgTint\[aria-pressed="true"\]/);
});

test('glass color is stored per set, applied in <head>, and old am.theme values default to the built-in tint', () => {
  // Saved before this field existed: normalizes to null, paints the stock look, rewrites nothing.
  const old = {
    v: 1, mode: 'auto',
    light: { wallpaper: 'mist', tone: 'auto', blur: 12, dim: 0, opacity: 30, customLuma: null, customColor: null },
    dark: { wallpaper: 'graphite', tone: 'auto', blur: 12, dim: 0, opacity: 30, customLuma: null, customColor: null },
  };
  for (const prefersDark of [false, true]) {
    const boot = runThemeBoot({ theme: old, prefersDark });
    assert.deepEqual(boot.writes, []);
    assert.equal(boot.styles['--glass-tint-top'], undefined);
    assert.equal(boot.styles['--glass-tint-bottom'], undefined);
    assert.equal(plain(boot.api.read()).light.glassColor, null);
    assert.equal(plain(boot.api.read()).dark.glassColor, null);
  }

  const { api } = runThemeBoot();
  const normalized = plain(api.normalize({ light: { glassColor: '#4F86F7' }, dark: { glassColor: 'blue' } }));
  assert.equal(normalized.light.glassColor, '#4f86f7');
  assert.equal(normalized.dark.glassColor, null);
  assert.equal(plain(api.normalize({ dark: { glassColor: '#e8628f' } })).dark.glassColor, '#e8628f');
  assert.equal(plain(api.migrateLegacy({ preset: 'mist', blur: 20 })).settings.light.glassColor, null);

  // Each set paints its own color; the scheme flip swaps to the other set's.
  const saved = {
    v: 1, mode: 'auto',
    light: Object.assign({}, ADMIN_UI_THEME_DEFAULTS.light, { glassColor: '#e8628f' }),
    dark: Object.assign({}, ADMIN_UI_THEME_DEFAULTS.dark, { glassColor: '#3fb98a' }),
  };
  const boot = runThemeBoot({ theme: saved, prefersDark: false });
  assert.equal(boot.attributes['data-glass'], 'light');
  assert.equal(boot.styles['--glass-tint-top'], '232, 98, 143');
  assert.equal(boot.styles['--glass-tint-bottom'], '232, 98, 143');
  boot.media.matches = true;
  boot.listeners.forEach((fn) => fn());
  assert.equal(boot.attributes['data-glass'], 'dark');
  assert.equal(boot.styles['--glass-tint-top'], '63, 185, 138');
  assert.equal(boot.styles['--glass-tint-bottom'], '63, 185, 138');
  assert.deepEqual(boot.writes, []);
  // Back to null (what Reset writes) drops the inline override so the stylesheet tint returns.
  boot.api.apply(Object.assign({}, saved, { dark: ADMIN_UI_THEME_DEFAULTS.dark }));
  assert.equal(boot.styles['--glass-tint-top'], undefined);
  assert.equal(boot.styles['--glass-tint-bottom'], undefined);

  // Tone still decides data-glass: a light set forced to Dark tone tints dark with its own color.
  const forced = runThemeBoot({ theme: { mode: 'light', light: { tone: 'dark', glassColor: '#e8628f' } } });
  assert.equal(forced.attributes['data-glass'], 'dark');
  assert.equal(forced.styles['--glass-tint-top'], '232, 98, 143');
});

test('a malformed saved glass color drops only that field and keeps the rest of the theme', () => {
  // {"toString": null} is valid JSON that String() cannot convert; it must not throw the whole am.theme away.
  const bad = [42, true, { toString: null }, { toString: null, valueOf: null }, ['#ffffff'], { toString() { return '#ffffff'; } }, '#fff', ' #ffffff', '#ffffff '];
  const { api } = runThemeBoot();
  for (const glassColor of bad) {
    const set = plain(api.normalize({ light: { wallpaper: 'mist', tone: 'dark', blur: 20, dim: 10, opacity: 55, glassColor } })).light;
    assert.deepEqual(set, Object.assign({}, ADMIN_UI_THEME_DEFAULTS.light, { tone: 'dark', blur: 20, dim: 10, opacity: 55 }), JSON.stringify(String(glassColor && typeof glassColor === 'object' ? 'object' : glassColor)));
  }
  const stored = '{"v":1,"mode":"dark","light":{"glassColor":"#e8628f","blur":5},"dark":{"wallpaper":"graphite","tone":"light","blur":30,"dim":20,"opacity":70,"glassColor":{"toString":null}}}';
  const boot = runThemeBoot({ theme: stored });
  const theme = plain(boot.api.read());
  assert.equal(theme.mode, 'dark');
  assert.equal(theme.light.glassColor, '#e8628f');
  assert.equal(theme.light.blur, 5);
  assert.deepEqual(theme.dark, Object.assign({}, ADMIN_UI_THEME_DEFAULTS.dark, { tone: 'light', blur: 30, dim: 20, opacity: 70 }));
  assert.equal(boot.attributes['data-theme'], 'dark');
  assert.equal(boot.attributes['data-glass'], 'light');
  assert.equal(boot.styles['--bg-blur'], '30px');
  assert.equal(boot.styles['--glass-tint-top'], undefined);
  assert.deepEqual(boot.writes, []);
});

test('every glass fill follows the picked glass color and falls back to its stock tint', () => {
  const css = ADMIN_UI_THEME.replace(/\/\*[\s\S]*?\*\//g, '');
  const tint = (name) => `rgba\\(var\\(--glass-tint-${name}, `;
  // [token, light top/bottom fallback, dark top/bottom fallback] — the stock tints from before Glass color.
  const fills = [
    ['--a-glass', ['255, 255, 255', '255, 255, 255'], ['30, 42, 88', '12, 18, 46']],
    ['--a-card-fill', ['255, 255, 255', '255, 255, 255'], ['30, 42, 88', '14, 20, 50']],
    ['--d-glass', ['255, 255, 255', '248, 250, 255'], ['32, 44, 92', '12, 18, 46']],
  ];
  for (const [token, light, dark] of fills) {
    const values = [...css.matchAll(new RegExp(`${token}: ([^;]+);`, 'g'))].map((match) => match[1]);
    assert.equal(values.length, 2, `${token} has a light and a dark value`);
    for (const [value, [top, bottom]] of [[values[0], light], [values[1], dark]]) {
      assert.match(value, new RegExp(`${tint('top')}${top}\\), `), `${token} top`);
      assert.match(value, new RegExp(`${tint('bottom')}${bottom}\\), `), `${token} bottom`);
    }
  }
  assert.match(css, /:root \{[^}]*--glass-rgb-top: var\(--glass-tint-top, 255, 255, 255\);\s*--glass-rgb-bottom: var\(--glass-tint-bottom, 255, 255, 255\);/);
  assert.match(css, /html\[data-glass="dark"\] \{\s*--glass-rgb-top: var\(--glass-tint-top, 40, 48, 90\);\s*--glass-rgb-bottom: var\(--glass-tint-bottom, 20, 24, 56\);/);
});

test('Memory and Pipeline day cards follow the picked glass color and keep their stock fill', () => {
  const css = ADMIN_UI_THEME.replace(/\/\*[\s\S]*?\*\//g, '');
  const values = [...css.matchAll(/--m-group-fill: ([^;]+);/g)].map((match) => match[1]);
  assert.equal(values.length, 2, '--m-group-fill has a light and a dark value');
  for (const value of values) {
    assert.match(value, /^linear-gradient\(180deg, rgba\(var\(--glass-tint-top, [\d, ]+\), [^]+, rgba\(var\(--glass-tint-bottom, [\d, ]+\), /);
  }
  // With no glass color the fallbacks apply: exactly the fills master 4d8dd14 painted, alphas included.
  const stock = (value) => value.replace(/var\(--glass-tint-(?:top|bottom), ([\d, ]+)\)/g, '$1');
  assert.deepEqual(values.map(stock), [
    'linear-gradient(180deg, rgba(255, 255, 255, calc(0.50 * var(--glass-scale))), rgba(255, 255, 255, calc(0.30 * var(--glass-scale))))',
    'linear-gradient(180deg, rgba(28, 40, 86, calc(0.56 * var(--glass-scale))), rgba(12, 18, 46, calc(0.50 * var(--glass-scale))))',
  ]);
  assert.match(css, /\.memGroup \{[^}]*background: var\(--m-group-fill\);/);
});

test('the dark sidebar keeps its stock alphas and takes its tint from the glass color', () => {
  const css = ADMIN_UI_THEME.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]*\.sidebar(?![\w-])[^{}]*)\{([^{}]*)\}/g)]
    .filter((match) => /background\s*:/.test(match[2]))
    .map((match) => [match[1].trim(), match[2].match(/background:\s*([^;]+);/)[1]]);
  const tinted = (top, bottom) => `linear-gradient(180deg, rgba(var(--glass-rgb-top), ${top}), rgba(var(--glass-rgb-bottom), ${bottom}))`;
  // One rule, the same 0.34/0.22 with or without backdrop-filter support, as on master.
  assert.deepEqual(rules, [['html[data-glass="dark"] .sidebar.glassSurface', tinted('0.34', '0.22')]]);
  // With no glass color, --glass-rgb-* resolves to the stock deep blue: the exact gradient master 4d8dd14 painted.
  const stockTop = css.match(/html\[data-glass="dark"\] \{[^}]*--glass-rgb-top: var\(--glass-tint-top, ([\d, ]+)\);/)[1];
  const stockBottom = css.match(/html\[data-glass="dark"\] \{[^}]*--glass-rgb-bottom: var\(--glass-tint-bottom, ([\d, ]+)\);/)[1];
  assert.equal(rules[0][1].replace('var(--glass-rgb-top)', stockTop).replace('var(--glass-rgb-bottom)', stockBottom),
    'linear-gradient(180deg, rgba(40, 48, 90, 0.34), rgba(20, 24, 56, 0.22))');
});

test('a picked glass color is painted exactly as picked, whatever the glass tone', () => {
  const picks = [...ADMIN_UI_GLASS_COLORS.map((color) => color.hex), '#000000', '#ffffff', '#ffff00', '#808080'];
  for (const hex of picks) {
    const rgb = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ');
    for (const tone of ['light', 'dark']) {
      const boot = runThemeBoot({ theme: { mode: 'light', light: { tone, glassColor: hex } } });
      assert.equal(boot.attributes['data-glass'], tone);
      assert.equal(boot.styles['--glass-tint-top'], rgb, `${hex} on ${tone} glass`);
      assert.equal(boot.styles['--glass-tint-bottom'], rgb, `${hex} on ${tone} glass`);
    }
  }
  // The picker shows the stored value itself, so what it shows is what is painted.
  assert.match(renderAdminPageHtml(), /els\.bgGlassColorInput\.value = glassColor \|\| fallback/);
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
      // The stock tint is the fallback a picked Glass color (--glass-tint-bottom) replaces.
      glass: cssVar(source, '--glass-rgb-bottom').match(/^var\(--glass-tint-bottom, (.+)\)$/)[1].split(',').map(Number),
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
  assert.deepEqual(shanghai.today.agents, [
    { agent_id: 'codex', n: 2, agent_label: 'codex' },
    { agent_id: 'grok-build', n: 1, agent_label: 'Grok Build' },
  ]);
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
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));

test('home summary route is unreachable from non-loopback addresses', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find(addr => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, get }) => {
    const local = await get('/admin/api/home-summary');
    assert.ok(Array.isArray(local.daily));
    await assertLanRefused(external.address, port, '/admin/api/home-summary');
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
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));
