// Pipeline view (admin UI): markup, i18n, client URL/poll, Home links, XSS, glass, and row copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');
const { ADMIN_UI_TRANSLATIONS } = require('../dist/services/admin-ui-copy.js');

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

function pipelineSection() {
  const start = uiHtml.indexOf('<section id="pipelineView"');
  assert.ok(start >= 0, 'pipelineView section');
  return uiHtml.slice(start, uiHtml.indexOf('<section id="digestsView"', start));
}

test('Pipeline view replaces the placeholder and follows Memory directly', () => {
  const view = pipelineSection();
  assert.match(view, /class="appView pipelineView"/);
  assert.doesNotMatch(view, /placeholderCard|shell\.comingSoon/);
  for (const id of ['pipelineLead', 'pipelineUpdated', 'pipelineToolbar', 'pipelineProjectButton', 'pipelineAgentButton', 'pipelineStateButton',
    'pipelineRangeControl', 'pipelineRangeToday', 'pipelineRange7d', 'pipelineRange30d', 'pipelineRangeCustom', 'pipelineFlowRow', 'pipelineFlow',
    'pipelineStageQueued', 'pipelineStageProcessing', 'pipelineStageConsolidating', 'pipelineStageSaved', 'pipelineStageSkipped',
    'pipelineStageDuplicate', 'pipelineStageFallback', 'pipelineStageFailed', 'pipelineStuck', 'pipelineStuckCount', 'pipelineListHead',
    'pipelineList', 'pipelineNotice', 'pipelineNoticeAction', 'pipelineLoadMore', 'pipelineProjectPopover', 'pipelineAgentPopover',
    'pipelineStatePopover', 'pipelineCustomPopover', 'pipelineCustomFrom', 'pipelineCustomTo', 'pipelineCustomApply', 'pipelineCustomCancel']) {
    assert.ok(view.includes(`id="${id}"`), `#${id} lives in the Pipeline view`);
  }
  // New ids keep the pipeline prefix, and the whole page keeps ids unique.
  for (const [, id] of view.matchAll(/\sid="([^"]+)"/g)) assert.match(id, /^pipeline/, `${id} uses the pipeline prefix`);
  const markup = uiHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  // Memory tests slice memoryView..pipelineView, so no other view may sit between them.
  const memoryAt = uiHtml.indexOf('<section id="memoryView"');
  assert.ok(memoryAt >= 0);
  assert.equal(uiHtml.indexOf('<section id="', memoryAt + 1), uiHtml.indexOf('<section id="pipelineView"'));
  assert.deepEqual([...view.matchAll(/data-pipeline-range="([^"]+)"/g)].map((match) => match[1]), ['today', '7d', '30d', 'custom']);
  assert.match(uiHtml.match(/<[a-z]+[^>]*\bid="pipelineRange7d"[^>]*>/)[0], /aria-pressed="true"/);
  // Consolidating only displays; every other stage and the Stuck chip filter the list.
  assert.deepEqual([...view.matchAll(/data-pipeline-stage="([^"]+)"/g)].map((match) => match[1]),
    ['queued', 'processing', 'saved', 'skipped', 'duplicate', 'fallback', 'failed', 'stuck']);
  const toolbar = view.slice(view.indexOf('id="pipelineToolbar"'), view.indexOf('id="pipelineFlowRow"'));
  assert.doesNotMatch(toolbar, /class="actPopover/);
  assert.match(view, /id="pipelineList"[^>]*><\/div>/);
});

test('every Pipeline i18n key exists in en and zh-CN', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const keys = (dict) => Object.keys(dict).filter((key) => key.startsWith('pipeline.')).sort();
  assert.ok(keys(en).length > 80);
  assert.deepEqual(keys(zh), keys(en));
  for (const key of keys(en)) assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
  const source = uiHtml.replace(/const UI_DICTIONARY = .*\n/, '');
  const used = new Set([...source.matchAll(/"(pipeline\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  // The drawer lead is built from the state key (pipeline.stateX -> pipeline.aboutX); "pipeline.about" is that prefix.
  used.delete('pipeline.about');
  for (const state of ['Queued', 'Processing', 'Saved', 'Skipped', 'Duplicate', 'Fallback', 'Failed', 'Stuck']) used.add(`pipeline.about${state}`);
  assert.ok(used.size > 60);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
});

test('Pipeline client reads /admin/api/pipeline with from, to and the tz offset, and keeps the cursor window', () => {
  assert.match(uiScript, /"\/admin\/api\/pipeline\?"/);
  const url = uiClientFunction('pipelineUrl');
  assert.match(url, /stats: cursor \? "0" : "1"/);
  assert.match(url, /from: win\.from\.toISOString\(\)/);
  assert.match(url, /to: win\.to\.toISOString\(\)/);
  assert.match(url, /tz_offset_minutes/);
  const load = uiClientFunction('loadPipeline');
  assert.match(load, /if \(seq !== pipe\.seq\) return;/);
  assert.match(load, /const win = mode === "more" \? pipe\.window : getPipelineRange\(\)/);
  assert.match(load, /error\.status === 400/);
  assert.match(load, /mergeMemoryDays\(pipe\.days, days\)/);
  assert.match(uiClientFunction('pollVisibleView'), /pipelineCanPoll\(\)\) await loadPipeline\("refresh"\)/);
  assert.match(uiClientFunction('usesActivityBackdrop'), /state\.activeView === "pipelineView"/);
  assert.match(uiClientFunction('memoryDrawerIsDocked'), /host === "pipelineView"/);
});

test('pipelineCanPoll is false for a filter, a range, an open drawer or a hidden tab', () => {
  const result = vm.runInNewContext(`
    const MEMORY_SCROLL_IDLE_MS = 1500;
    const PIPELINE_MAX_PAGE = 100;
    const PIPELINE_REFRESH_HEADROOM = 20;
    const state = {
      activeView: "pipelineView",
      pipeline: { project: "", agent: "", state: "", flagged: false, range: "7d", loaded: true, readsDisabled: false, openPopover: "", lastScrollAt: 0, items: [] },
      drawer: { id: "", task: "" },
    };
    const document = { hidden: false };
    ${uiClientFunction('isMemoryDrawerOpen')}
    ${uiClientFunction('isPipelineFiltered')}
    ${uiClientFunction('pipelinePollPaused')}
    ${uiClientFunction('pipelineCanPoll')}
    const out = { plain: pipelineCanPoll() };
    state.pipeline.project = "harbor-sync"; out.project = pipelineCanPoll(); state.pipeline.project = "";
    state.pipeline.agent = "claude"; out.agent = pipelineCanPoll(); state.pipeline.agent = "";
    state.pipeline.state = "stuck"; out.state = pipelineCanPoll(); state.pipeline.state = "";
    state.pipeline.flagged = true; out.flagged = pipelineCanPoll(); state.pipeline.flagged = false;
    state.pipeline.range = "30d"; out.range = pipelineCanPoll(); state.pipeline.range = "7d";
    state.pipeline.range = "all"; out.all = pipelineCanPoll(); state.pipeline.range = "7d";
    state.pipeline.items = Array.from({ length: 150 }, (_item, index) => ({ task_id: "row-" + index }));
    out.long = pipelineCanPoll();
    state.pipeline.items = Array.from({ length: 40 }, (_item, index) => ({ task_id: "row-" + index }));
    out.short = pipelineCanPoll();
    state.pipeline.items = [];
    state.drawer.task = "task-1"; out.task = pipelineCanPoll(); state.drawer.task = "";
    state.drawer.id = "mem-1"; out.memory = pipelineCanPoll(); state.drawer.id = "";
    document.hidden = true; out.hidden = pipelineCanPoll(); document.hidden = false;
    state.pipeline.lastScrollAt = Date.now(); out.scrolling = pipelineCanPoll(); state.pipeline.lastScrollAt = 0;
    state.activeView = "memoryView"; out.elsewhere = pipelineCanPoll();
    out;
  `);
  assert.equal(result.plain, true);
  assert.equal(result.short, true);
  for (const key of ['project', 'agent', 'state', 'flagged', 'range', 'all', 'long', 'task', 'memory', 'hidden', 'scrolling', 'elsewhere']) {
    assert.equal(result[key], false, `${key} stops the poll`);
  }
});

test('reads off clears Pipeline rows and the task drawer at once', () => {
  const apply = uiClientFunction('applyReadPolicyToViews');
  for (const pattern of [/pipe\.items = \[\]/, /pipe\.days = \[\]/, /pipe\.stages = null/, /pipe\.nextCursor = null/, /pipe\.window = null/,
    /pipe\.groupNodes\.clear\(\)/, /pipe\.rowNodes\.clear\(\)/, /pipe\.readsDisabled = true/, /pipe\.readsDisabled = false/, /pipe\.seq \+= 1/,
    /pipelineList\.innerHTML = ""/, /drawer\.taskItem = null/, /loadPipeline\("reset"\)/, /renderPipeline\(\)/]) {
    assert.match(apply, pattern);
  }
  const load = uiClientFunction('loadPipeline');
  const disabled = load.slice(load.indexOf('if (payload.disabled)'), load.indexOf('} else {'));
  assert.match(disabled, /pipe\.items = \[\]/);
  assert.match(disabled, /pipe\.rowNodes\.clear\(\)/);
  assert.match(disabled, /applyReadPolicyToViews\(\{ readEnabled: false \}\)/);
  assert.doesNotMatch(disabled, /payload\.message/);
  const notice = uiClientFunction('renderPipelineNotice');
  const noticeDisabled = notice.slice(notice.indexOf('if (pipe.readsDisabled)'), notice.indexOf('} else if'));
  assert.match(noticeDisabled, /pipeline\.readsDisabledTitle/);
  assert.doesNotMatch(noticeDisabled, /message/);
  const list = uiClientFunction('renderPipelineList');
  assert.ok(list.indexOf('list.innerHTML = ""') < list.indexOf('if (noticed) return'));
  assert.match(uiClientFunction('renderPipelineTaskDrawer'), /pipeline\.drawerReadsDisabled/);
});

test('Home queue and attention links open Pipeline with the matching state', () => {
  const attention = uiClientFunction('collectAttentionItems');
  assert.match(attention, /home\.attnStuck[^\n]*pipelineState: "stuck"[^\n]*pipelineRange: "all"/);
  assert.match(attention, /home\.attnDuplicates[^\n]*pipelineFlagged: "1"[^\n]*pipelineRange: "all"/);
  assert.match(attention, /home\.attnFallbacks[^\n]*pipelineRange: link\.range[^\n]*pipelineFallbackFrom: link\.fallbackFrom/);
  assert.doesNotMatch(attention, /pipelineState:\s*"fallback"/);
  assert.doesNotMatch(attention, /superset of every counted task/);
  assert.match(uiClientFunction('renderHomeAttention'), /data-pipeline-state="/);
  assert.match(uiClientFunction('renderHomeAttention'), /data-pipeline-flagged="/);
  assert.match(uiClientFunction('renderHomeAttention'), /data-pipeline-fallback-from="/);
  assert.match(uiClientFunction('renderHomeHealth'), /setAttr\(els\.homeQueueCard, "data-pipeline-state"/);
  assert.match(uiClientFunction('renderHomeHealth'), /setAttr\(els\.homeQueueCard, "data-pipeline-flagged", "1"\)/);
  assert.match(uiClientFunction('renderHomeHealth'), /setAttr\(els\.homeQueueCard, "data-pipeline-state", "queued"\)/);
  assert.match(uiClientFunction('bindEvents'), /presetPipelineFilters\(trigger\.getAttribute\("data-pipeline-state"\)/);
  assert.match(uiClientFunction('bindEvents'), /data-pipeline-fallback-from/);
  const preset = vm.runInNewContext(`
    const PIPELINE_STATES = ["queued", "processing", "saved", "skipped", "duplicate", "fallback", "failed", "stuck"];
    const state = { pipeline: { project: "lumen-notes", agent: "codex", state: "", range: "custom", customFrom: "2026-10-01", customTo: "2026-10-02" } };
    ${uiClientFunction('presetPipelineFilters')}
    presetPipelineFilters("stuck", "30d");
    const stuck = Object.assign({}, state.pipeline);
    presetPipelineFilters("bogus", "forever");
    const bogus = Object.assign({}, state.pipeline);
    presetPipelineFilters("fallback", "all");
    const fallback = Object.assign({}, state.pipeline);
    presetPipelineFilters("", "all", "1");
    ({ stuck, bogus, fallback, flagged: Object.assign({}, state.pipeline) });
  `);
  assert.deepEqual(JSON.parse(JSON.stringify(preset.stuck)), { project: '', agent: '', state: 'stuck', range: '30d', customFrom: '', customTo: '', flagged: false, fallbackFrom: '' });
  assert.equal(preset.bogus.state, '');
  assert.equal(preset.bogus.range, '7d');
  assert.equal(preset.bogus.flagged, false);
  assert.equal(preset.bogus.fallbackFrom, '');
  assert.equal(preset.fallback.state, 'fallback');
  assert.equal(preset.fallback.range, 'all');
  assert.equal(preset.fallback.flagged, false);
  assert.equal(preset.fallback.fallbackFrom, '');
  assert.equal(preset.flagged.state, '');
  assert.equal(preset.flagged.range, 'all');
  assert.equal(preset.flagged.flagged, true);
  assert.equal(preset.flagged.fallbackFrom, '');
});

test('Pipeline rows and the task drawer escape hostile titles and errors', () => {
  const escapeStart = uiScript.indexOf('function escapeHtml(');
  const escapeEnd = uiScript.indexOf('function summarize(', escapeStart);
  const helpers = uiScript.slice(uiScript.indexOf('const PIPELINE_PAGE = 50;'), uiScript.indexOf('function getPipelineRange('));
  const hostile = '<img src=x onerror=alert(1)>';
  const item = {
    task_id: 't-1"><b>', session_id: 's-1', project_path: `/work/harbor-sync/${hostile}`, agent_id: '<script>agent</script>',
    trigger: '<i>idle</i>', source_kind: 'task', title: hostile, summary: '<script>alert(2)</script>', state: 'fallback',
    stuck_reason: null, stale_hours: null, partial: false, created_at: '2026-10-17T05:24:00.000Z', updated_at: '2026-10-17T05:25:00.000Z',
    attempts: 1, max_attempts: 5, llm_calls: 2, segment_count: 1, pending_segments: 0, missing_segments: 0, evidence_count: 3,
    observation_id: 'obs"><svg onload=alert(3)>', duplicate_of: null, fallback: true, last_error: '"><script>alert(4)</script>',
  };
  const result = vm.runInNewContext(`
    ${uiScript.slice(escapeStart, escapeEnd)}
    const state = { locale: "en", pipeline: { items: [], loaded: true }, drawer: { readsDisabled: false } };
    const t = (key, vars) => key + (vars ? " " + Object.values(vars).join(" ") : "");
    const formatCount = (value) => String(Number(value || 0));
    const formatClock = () => "13:24";
    const formatShortDate = () => "Oct 17";
    const calendarDaysAgo = () => 0;
    const parseTimestamp = (value) => (value ? new Date(value) : null);
    const projectBasename = (value) => String(value || "").split("/").pop();
    const svgIcon = () => "<svg></svg>";
    const setText = (el, value) => { el.text = value; };
    const setAttr = () => {};
    const els = { activityDrawerMeta: {}, activityDrawerSub: {}, activityDrawerTitle: {}, activityDrawerBody: {} };
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${helpers}
    ${uiClientFunction('renderPipelineRowBody')}
    ${uiClientFunction('renderPipelineTaskDrawer')}
    const row = renderPipelineRowBody(item);
    renderPipelineTaskDrawer(item);
    ({ row, meta: els.activityDrawerMeta.innerHTML, sub: els.activityDrawerSub.innerHTML, body: els.activityDrawerBody.innerHTML, title: els.activityDrawerTitle.text });
  `, { item });
  for (const part of ['row', 'meta', 'sub', 'body']) {
    assert.doesNotMatch(result[part], /<(img|script|b|i)\b|<svg onload/, `${part} is escaped`);
  }
  assert.match(result.row, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.body, /&lt;script&gt;alert\(4\)&lt;\/script&gt;/);
  assert.match(result.body, /data-pipeline-memory="obs&quot;&gt;&lt;svg onload=alert\(3\)&gt;"/);
  // The title goes through textContent, so the raw string is fine there.
  assert.equal(result.title, hostile);
});

test('Pipeline glass reuses the Activity and Memory tokens and blurs only inside the active view', () => {
  const css = uiHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
  // Digests & Reviews joined the same token rules after Pipeline.
  assert.match(css, /\.activityView,\s*\.memoryView,\s*\.pipelineView,\s*\.digestsView \{\s*position: relative;\s*--a-glass:/);
  assert.match(css, /html\[data-glass="dark"\] \.activityView,\s*html\[data-glass="dark"\] \.memoryView,\s*html\[data-glass="dark"\] \.pipelineView,\s*html\[data-glass="dark"\] \.digestsView \{/);
  const tokens = css.slice(css.indexOf('/* ---------- Pipeline ---------- */'), css.indexOf('.pipeLeadRow {'));
  // Every rgba() stop of the new glass fills (light and dark) multiplies the Background opacity slider.
  const fills = [...tokens.matchAll(/(--p-(?:orb|stuck)-fill): ([^;]+);/g)];
  assert.equal(fills.length, 4);
  for (const [, name, value] of fills) {
    const stops = (value.match(/rgba\(/g) || []).length;
    assert.ok(stops > 0);
    assert.equal((value.match(/\* var\(--glass-scale\)/g) || []).length, stops, `${name} scales with the Background opacity slider`);
  }
  assert.match(css, /@media \(min-width: 1440px\) \{\s*\.pipelineView\.is-drawer-open \.pipeHead/);
});

test('Pipeline row secondary line uses English copy for partial, stuck, summary and untitled tasks', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const keys = [
    'pipeline.notePartial', 'pipeline.notePartialOne', 'pipeline.notePartialMissing', 'pipeline.noteExhausted', 'pipeline.noteStale',
    'pipeline.titleTrigger', 'pipeline.titleTask', 'pipeline.titleLegacy', 'pipeline.triggerUserPrompt',
  ];
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  for (const key of keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `${key} placeholders`);
  }

  const triggerKeys = uiScript.slice(uiScript.indexOf('const PIPELINE_TRIGGER_KEYS = {'), uiScript.indexOf('function pipelineStateLabel('));
  const result = vm.runInNewContext(`
    const formatCount = (value) => String(Number(value || 0));
    ${uiClientFunction('interpolate')}
    const t = (key, vars) => interpolate(en[key] || key, vars);
    ${triggerKeys}
    ${uiClientFunction('pipelineTriggerLabel')}
    ${uiClientFunction('pipelineTaskTitle')}
    ${uiClientFunction('pipelineTaskNote')}
    const base = {
      title: "Harbor sync", summary: "Wrote the harbor-sync notes.", state: "saved", stuck_reason: null,
      stale_hours: null, partial: false, pending_segments: 0, missing_segments: 0, attempts: 0, max_attempts: 5,
      trigger: "user_prompt", source_kind: "task",
    };
    ({
      pending: pipelineTaskNote(Object.assign({}, base, { partial: true, pending_segments: 5, missing_segments: 0 })).text,
      missing: pipelineTaskNote(Object.assign({}, base, { partial: true, pending_segments: 2, missing_segments: 4 })).text,
      exhausted: pipelineTaskNote(Object.assign({}, base, { state: "stuck", stuck_reason: "exhausted", attempts: 5, max_attempts: 5 })).text,
      stale: pipelineTaskNote(Object.assign({}, base, { state: "stuck", stuck_reason: "stale", stale_hours: 26 })).text,
      summary: pipelineTaskNote(base).text,
      untitled: pipelineTaskTitle(Object.assign({}, base, { title: null })),
    });
  `, { en });
  assert.equal(result.pending, 'Closed, 5 segments pending');
  assert.equal(result.missing, 'Closed, 2 pending, 4 missing');
  assert.equal(result.exhausted, 'Retries used up (5/5)');
  assert.equal(result.stale, 'No progress for 26 h');
  assert.equal(result.summary, 'Wrote the harbor-sync notes.');
  assert.equal(result.untitled, 'User prompt · task');
});

test('Pipeline drawer summary stops on a word boundary and zero attempts show a dash', () => {
  const escapeStart = uiScript.indexOf('function escapeHtml(');
  const escapeEnd = uiScript.indexOf('function summarize(', escapeStart);
  const helpers = uiScript.slice(uiScript.indexOf('const PIPELINE_PAGE = 50;'), uiScript.indexOf('function getPipelineRange('));
  const ellipsis = '\u2026';
  const dash = '\u2014';
  const kept = 'brindle '.repeat(16).trim();
  const mid = 'brindle '.repeat(16) + 'consolidatio';
  const clean = 'brindle '.repeat(17) + 'end.';
  const over = 'brindle '.repeat(16) + 'consolidation and the quay window';
  const boundary = 'brindle '.repeat(17) + 'end ';
  const zh = '\u6e2f'.repeat(140);
  const oneWord = 'x'.repeat(140);
  assert.equal(mid.length, 140);
  assert.equal(clean.length, 140);
  assert.equal(boundary.length, 140);
  assert.ok(over.length > 140);

  const result = vm.runInNewContext(`
    ${uiScript.slice(escapeStart, escapeEnd)}
    const state = { locale: "en", pipeline: { items: [], loaded: true }, drawer: { readsDisabled: false } };
    const t = (key, vars) => key + (vars ? " " + Object.values(vars).join(" ") : "");
    const formatCount = (value) => String(Number(value || 0));
    const formatClock = () => "13:24";
    const formatShortDate = () => "Oct 17";
    const calendarDaysAgo = () => 2;
    const parseTimestamp = (value) => (value ? new Date(value) : null);
    const projectBasename = (value) => String(value || "").split("/").pop();
    const svgIcon = () => "<svg></svg>";
    const setText = (el, value) => { el.text = value; };
    const setAttr = () => {};
    const els = { activityDrawerMeta: {}, activityDrawerSub: {}, activityDrawerTitle: {}, activityDrawerBody: {} };
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${helpers}
    ${uiClientFunction('renderPipelineRowBody')}
    ${uiClientFunction('renderPipelineTaskDrawer')}
    const base = {
      task_id: "task-brindle", session_id: "sess-quay", project_path: "/work/brindle-ledger", agent_id: "brindle-agent",
      trigger: "turn_end", source_kind: "task", title: "Brindle ledger", state: "saved", stuck_reason: null,
      stale_hours: null, partial: false, created_at: "2026-10-17T05:24:00.000Z", updated_at: "2026-10-17T05:48:00.000Z",
      max_attempts: 5, llm_calls: 1, segment_count: 1, pending_segments: 0, missing_segments: 0, evidence_count: 2,
      observation_id: "obs-brindle", duplicate_of: null, fallback: false, last_error: null,
    };
    const zeroItem = Object.assign({}, base, { summary: mid, attempts: 0 });
    const someItem = Object.assign({}, base, { summary: "Wrote the harbor-sync notes.", attempts: 2 });
    const zeroRow = renderPipelineRowBody(zeroItem);
    renderPipelineTaskDrawer(zeroItem);
    const zeroBody = els.activityDrawerBody.innerHTML;
    const zeroMeta = els.activityDrawerMeta.innerHTML;
    const someRow = renderPipelineRowBody(someItem);
    renderPipelineTaskDrawer(someItem);
    const someBody = els.activityDrawerBody.innerHTML;
    ({
      short: pipelineDrawerSummary("Wrote the harbor-sync notes."),
      bare: pipelineDrawerSummary("Wrote the harbor-sync notes"),
      empty: pipelineDrawerSummary("   "),
      mid: pipelineDrawerSummary(mid),
      clean: pipelineDrawerSummary(clean),
      over: pipelineDrawerSummary(over),
      boundary: pipelineDrawerSummary(boundary),
      zh: pipelineDrawerSummary(zh),
      zhShort: pipelineDrawerSummary("\\u6e2f\\u8bb0\\u540c\\u6b65\\u5b8c\\u6210\\u3002"),
      oneWord: pipelineDrawerSummary(oneWord),
      zeroAttempts: pipelineAttempts({ attempts: 0, max_attempts: 5 }),
      someAttempts: pipelineAttempts({ attempts: 2, max_attempts: 5 }),
      bareAttempts: pipelineAttempts({ attempts: 2, max_attempts: 0 }),
      zeroRow, zeroBody, zeroMeta, someRow, someBody,
    });
  `, { mid, clean, over, boundary, zh, oneWord });

  assert.equal(result.short, 'Wrote the harbor-sync notes.');
  assert.equal(result.bare, 'Wrote the harbor-sync notes');
  assert.equal(result.empty, '');
  assert.equal(result.mid, kept + ellipsis);
  assert.equal(result.over, kept + ellipsis);
  assert.equal(result.clean, clean + ellipsis);
  assert.equal(result.boundary, 'brindle '.repeat(17) + 'end' + ellipsis);
  assert.equal(result.zh, zh + ellipsis);
  assert.equal(result.zhShort, '港记同步完成。');
  assert.equal(result.oneWord, oneWord + ellipsis);
  assert.doesNotMatch(result.mid, /consolidatio/);
  assert.equal(result.zeroAttempts, dash);
  assert.equal(result.someAttempts, '2/5');
  assert.equal(result.bareAttempts, '2');
  // The list note keeps the clipped word; CSS ellipsis owns that line. The drawer does not.
  assert.match(result.zeroRow, /consolidatio/);
  assert.match(result.zeroRow, new RegExp('pipeAttempts is-zero[^>]*>' + dash + '<'));
  assert.doesNotMatch(result.zeroRow, /0\/5/);
  assert.doesNotMatch(result.zeroRow, /pipeline\.attemptsHint/);
  assert.match(result.someRow, /pipeAttempts[^>]*>2\/5</);
  assert.match(result.someRow, /pipeline\.attemptsHint 2 5/);
  assert.doesNotMatch(result.zeroBody, /consolidatio/);
  assert.match(result.zeroBody, new RegExp(kept.replace(/ /g, ' ') + ellipsis));
  assert.match(result.zeroBody, new RegExp('pipeStatValue">' + dash + '<'));
  assert.doesNotMatch(result.zeroBody, /0\/5|drawerShowMore|actNarrativeToggle/);
  assert.match(result.zeroBody, /Oct 17 · 13:24/);
  assert.match(result.zeroMeta, /Oct 17 · 13:24/);
  assert.match(result.someBody, /Wrote the harbor-sync notes\./);
  assert.match(result.someBody, /pipeStatValue">2\/5</);
  assert.doesNotMatch(result.someBody, /pipeStatValue">0\/5|Wrote the harbor-sync notes\.\u2026/);
});

test('Pipeline drawer dates use the short stamp and the overlay scrim is shared', () => {
  const drawer = uiClientFunction('renderPipelineTaskDrawer');
  assert.doesNotMatch(drawer, /toLocaleString/);
  assert.match(drawer, /formatPipelineStamp\(updated\)/);
  assert.doesNotMatch(drawer, /drawerShowMore/);
  const stamp = uiClientFunction('formatPipelineStamp');
  assert.match(stamp, /formatShortDate\(date\)/);
  assert.match(stamp, /formatClock\(date\)/);
  assert.doesNotMatch(stamp, /toLocaleString/);
  const css = uiHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
  const lightAt = css.indexOf('--a-scrim: rgba(40, 46, 90, 0.22)');
  const darkAt = css.indexOf('--a-scrim: rgba(2, 4, 16, 0.50)');
  assert.ok(lightAt > 0, 'light scrim');
  assert.ok(darkAt > lightAt, 'dark scrim');
  assert.equal(css.indexOf('--a-scrim: rgba(40, 46, 90, 0.22)', lightAt + 1), -1);
  assert.equal(css.indexOf('--a-scrim: rgba(2, 4, 16, 0.50)', darkAt + 1), -1);
  assert.match(css.slice(css.lastIndexOf('.activityView,', lightAt), lightAt), /\.memoryView,\s*\.pipelineView/);
  assert.match(css.slice(css.lastIndexOf('html[data-glass="dark"] .activityView', darkAt), darkAt), /html\[data-glass="dark"\] \.memoryView,\s*html\[data-glass="dark"\] \.pipelineView/);
  assert.match(css, /\.actScrim \{[^}]*background:\s*var\(--a-scrim\)/);
  assert.match(css, /\.appView\.is-active \.actScrim \{\s*-webkit-backdrop-filter: blur\(2px\);\s*backdrop-filter: blur\(2px\);/);
  assert.doesNotMatch(css, /\.(?:memory|pipeline)View[^{]*\.actScrim[^{]*\{[^}]*background:\s*(?:transparent|none)/);
  assert.doesNotMatch(css, /--a-scrim:\s*rgba\([^)]*,\s*0(?:\.0+)?\)/);
});

async function vmJson(script, sandbox) {
  return JSON.parse(JSON.stringify(await vm.runInNewContext(script, sandbox)));
}

function pipelineBehaviourPrelude() {
  return `
    const MEMORY_SCROLL_IDLE_MS = 1500;
    const PIPELINE_PAGE = 50;
    const PIPELINE_MAX_PAGE = 100;
    const PIPELINE_REFRESH_HEADROOM = 20;
    const state = {
      activeView: "pipelineView",
      locale: "en",
      overview: { projects: [], agents: [] },
      memory: {
        items: [], days: [], stats: null, nextCursor: null, loaded: false, error: "",
        readsDisabled: false, refreshFailed: false, stale: false, seq: 0, busySeq: 0, moreSeq: 0,
        groupNodes: new Map(), rowNodes: new Map(),
      },
      activity: { earlier: { key: "", payload: null, loading: false, error: "", readsDisabled: false, message: "", seq: 0, loadedAt: 0 } },
      drawer: { id: "", task: "", taskItem: null, host: "", payload: null, error: "", missing: false, readsDisabled: false, seq: 0 },
      pipeline: {
        project: "", agent: "", state: "", flagged: false, fallbackFrom: "", range: "7d", customFrom: "", customTo: "",
        items: [], days: [], stages: null, facets: null, nextCursor: null, window: null, key: "",
        loaded: false, loadedAt: 0, error: "", readsDisabled: false, refreshFailed: false, stale: false,
        seq: 0, busySeq: 0, moreSeq: 0, lastScrollAt: 0, openPopover: "", updatesPaused: false,
        rowNodes: new Map(), groupNodes: new Map(), signatures: {},
      },
      digests: {
        items: [], days: [], stats: null, facets: null, vault: null, nextCursor: null, window: null, loaded: false, error: "",
        readsDisabled: false, stale: false, seq: 0, busySeq: 0, moreSeq: 0, vaultSeq: 0, vaultAt: 0,
        rowNodes: new Map(), groupNodes: new Map(),
      },
      projects: {
        items: [], summary: null, nextCursor: null, loaded: false, error: "", errorStatus: 0,
        readsDisabled: false, stale: false, seq: 0, busySeq: 0, moreSeq: 0, rowNodes: new Map(),
      },
    };
    const document = { hidden: false };
    const window = { scrolls: 0, scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrolls += 1; this.x = x; this.y = y; this.scrollX = x; this.scrollY = y; } };
    const els = {
      pipelineUpdatesPaused: { hidden: true, textContent: "" },
      pipelineList: { innerHTML: "rows" },
      memoryList: { innerHTML: "rows" },
    };
    const calls = [];
    function fetchJson(url) {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      calls.push({ url, resolve, reject, promise });
      return promise;
    }
    function setText(element, value) {
      if (!element) return;
      const next = String(value);
      if (element.textContent !== next) element.textContent = next;
    }
    function setHidden(element, hidden) {
      if (element && element.hidden !== !!hidden) element.hidden = !!hidden;
    }
    function t(key) { return Object.prototype.hasOwnProperty.call(en, key) ? en[key] : key; }
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('projectBasename')}
    ${uiClientFunction('isActivitySelected')}
    ${uiClientFunction('isMemoryDrawerOpen')}
    ${uiClientFunction('getPipelineRange')}
    ${uiClientFunction('pipelineKey')}
    ${uiClientFunction('pipelineUrl')}
    ${uiClientFunction('mergeMemoryDays')}
    ${uiClientFunction('isPipelineFiltered')}
    ${uiClientFunction('pipelinePollPaused')}
    ${uiClientFunction('pipelineCanPoll')}
    ${uiClientFunction('renderPipelinePauseHint')}
    ${uiClientFunction('reloadPipelineFromStart')}
    ${uiClientFunction('mergePipelineRefresh')}
    ${uiClientFunction('pipelineTaskAnchor')}
    ${uiClientFunction('loadPipeline')}
    ${uiClientFunction('applyReadPolicyToViews')}
    ${uiClientFunction('pipelineFacetValues')}
    let pipelineOnRender = null;
    function renderPipeline() {
      if (typeof pipelineOnRender === "function") pipelineOnRender();
    }
    function renderDigests() {}
    function loadDigests() {}
    function loadDigestCards() {}
    function openDigestDrawer() {}
    function renderProjects() {}
    function loadProjects() {}
    function openProjectDrawer() {}
    function renderMemory() {}
    function renderActivityEarlier() {}
    function renderMemoryDrawer() {}
    function loadMemories() {}
    function loadActivityEarlier() {}
    function openMemoryDrawer() {}
    async function settle() {
      for (let step = 0; step < 12; step += 1) await Promise.resolve();
    }
    function rowIds() { return state.pipeline.items.map((item) => item.task_id); }
  `;
}

test('a list longer than one refresh pauses the poll, and a shorter refresh keeps loaded rows', async () => {
  assert.doesNotMatch(uiClientFunction('loadPipeline'), /incoming\[incoming\.length - 1\]/);
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.items = Array.from({ length: 150 }, (_item, index) => ({ task_id: "old-" + index }));
      state.pipeline.loaded = true;
      state.pipeline.key = pipelineKey();
      const canPollLong = pipelineCanPoll();
      if (pipelineCanPoll()) await loadPipeline("refresh");
      const fetchesAfterPollGuard = calls.length;
      await loadPipeline("refresh");
      await settle();
      const direct = { fetches: calls.length, ids: rowIds(), first: state.pipeline.items[0].task_id, last: state.pipeline.items[149].task_id };
      renderPipelinePauseHint(true);
      const hintHiddenWithNotice = els.pipelineUpdatesPaused.hidden;
      renderPipelinePauseHint();
      const hint = { hidden: els.pipelineUpdatesPaused.hidden, text: els.pipelineUpdatesPaused.textContent };
      reloadPipelineFromStart();
      await settle();
      const resetUrl = calls[0].url;
      calls[0].resolve({
        items: [{ task_id: "fresh-1" }],
        days: [],
        stages: { queued: 1 },
        facets: { projects: ["/work/harbor-sync"], agents: ["brindle-agent"] },
        next_cursor: null,
      });
      await calls[0].promise;
      await settle();
      const afterReset = { scrolls: window.scrolls, ids: rowIds(), hintHidden: els.pipelineUpdatesPaused.hidden, facets: state.pipeline.facets };
      state.pipeline.items = Array.from({ length: 40 }, (_item, index) => ({ task_id: "page-" + index }));
      state.pipeline.loaded = true;
      state.pipeline.range = "7d";
      state.pipeline.flagged = false;
      state.pipeline.key = pipelineKey();
      state.pipeline.lastScrollAt = 0;
      const canPollShort = pipelineCanPoll();
      renderPipelinePauseHint();
      const shortHintHidden = els.pipelineUpdatesPaused.hidden;
      const beforeRefresh = calls.length;
      const refresh = loadPipeline("refresh");
      await settle();
      const refreshUrl = calls[beforeRefresh].url;
      calls[beforeRefresh].resolve({
        items: [{ task_id: "replaced" }].concat(state.pipeline.items),
        days: [{ day: "2026-10-18", count: 1 }],
        stages: { queued: 3 },
        next_cursor: null,
      });
      await refresh;
      await settle();
      return {
        canPollLong, fetchesAfterPollGuard, direct, hintHiddenWithNotice, hint, resetUrl, afterReset,
        canPollShort, shortHintHidden, refreshUrl, afterRefresh: rowIds(), stages: state.pipeline.stages,
      };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.canPollLong, false);
  assert.equal(result.fetchesAfterPollGuard, 0);
  assert.equal(result.direct.fetches, 0);
  assert.equal(result.direct.ids.length, 150);
  assert.equal(result.direct.first, 'old-0');
  assert.equal(result.direct.last, 'old-149');
  assert.equal(result.hintHiddenWithNotice, true);
  assert.equal(result.hint.hidden, false);
  assert.equal(result.hint.text, 'Updates paused – Refresh');
  assert.equal(result.hint.text.includes('\u2013'), true);
  assert.equal(result.resetUrl.includes('cursor='), false);
  assert.equal(result.resetUrl.includes('limit=50'), true);
  assert.equal(result.afterReset.scrolls, 1);
  assert.deepEqual(result.afterReset.ids, ['fresh-1']);
  assert.equal(result.afterReset.hintHidden, true);
  assert.deepEqual(result.afterReset.facets, { projects: ['/work/harbor-sync'], agents: ['brindle-agent'] });
  assert.equal(result.canPollShort, true);
  assert.equal(result.shortHintHidden, true);
  assert.equal(result.refreshUrl.includes('limit=60'), true);
  assert.equal(result.refreshUrl.includes('cursor='), false);
  assert.deepEqual(result.afterRefresh, ['replaced'].concat(Array.from({ length: 40 }, (_item, index) => 'page-' + index)));
  assert.equal(result.stages.queued, 3);
});

test('a slow pipeline response is ignored once a newer request has been sent', async () => {
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.loaded = true;
      state.pipeline.key = pipelineKey();
      const first = loadPipeline("reset");
      await settle();
      const second = loadPipeline("reset");
      await settle();
      calls[1].resolve({
        items: [{ task_id: "newer" }],
        days: [{ day: "2026-10-18", count: 1 }],
        stages: { queued: 1 },
        facets: { projects: ["/work/harbor-sync"], agents: [] },
        next_cursor: null,
      });
      await calls[1].promise;
      await settle();
      calls[0].resolve({
        items: [{ task_id: "stale-slow" }],
        days: [],
        stages: { queued: 99 },
        facets: { projects: ["/work/stale"], agents: ["stale-agent"] },
        next_cursor: "stale-cursor",
      });
      await first;
      await second;
      await settle();
      return {
        ids: rowIds(),
        queued: state.pipeline.stages && state.pipeline.stages.queued,
        projects: state.pipeline.facets && state.pipeline.facets.projects,
        nextCursor: state.pipeline.nextCursor,
      };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.deepEqual(result.ids, ['newer']);
  assert.equal(result.queued, 1);
  assert.deepEqual(result.projects, ['/work/harbor-sync']);
  assert.equal(result.nextCursor, null);
});

test('turning reads off drops an in-flight pipeline response', async () => {
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.items = [{ task_id: "visible" }];
      state.pipeline.facets = { projects: ["/work/harbor-sync"], agents: ["brindle-agent"] };
      state.pipeline.loaded = true;
      state.pipeline.key = pipelineKey();
      const pending = loadPipeline("reset");
      await settle();
      applyReadPolicyToViews({ readEnabled: false });
      const during = { ids: rowIds(), readsDisabled: state.pipeline.readsDisabled, facets: state.pipeline.facets, list: els.pipelineList.innerHTML };
      calls[0].resolve({
        items: [{ task_id: "late-task" }],
        days: [{ day: "2026-10-18", count: 1 }],
        stages: { queued: 4 },
        facets: { projects: ["/work/late"], agents: ["late-agent"] },
        next_cursor: "late-cursor",
      });
      await pending;
      await settle();
      return { during, after: { ids: rowIds(), readsDisabled: state.pipeline.readsDisabled, facets: state.pipeline.facets, stages: state.pipeline.stages, nextCursor: state.pipeline.nextCursor } };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.deepEqual(result.during.ids, []);
  assert.equal(result.during.readsDisabled, true);
  assert.equal(result.during.facets, null);
  assert.equal(result.during.list, '');
  assert.deepEqual(result.after.ids, []);
  assert.equal(result.after.readsDisabled, true);
  assert.equal(result.after.facets, null);
  assert.equal(result.after.stages, null);
  assert.equal(result.after.nextCursor, null);
});

test('load more merges a repeated boundary day by day and dedupes task ids', async () => {
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.items = [{ task_id: "keep-a", day: "2026-10-17" }];
      state.pipeline.days = [{ day: "2026-10-17", count: 4 }];
      state.pipeline.nextCursor = "cursor-day";
      state.pipeline.window = getPipelineRange();
      state.pipeline.loaded = true;
      state.pipeline.key = pipelineKey();
      const more = loadPipeline("more");
      await settle();
      const url = calls[0].url;
      calls[0].resolve({
        items: [
          { task_id: "keep-a", day: "2026-10-17" },
          { task_id: "new-b", day: "2026-10-17" },
          { task_id: "new-c", day: "2026-10-16" },
        ],
        days: [{ day: "2026-10-17", count: 4 }, { day: "2026-10-16", count: 2 }],
        next_cursor: null,
      });
      await more;
      await settle();
      return { url, ids: rowIds(), days: state.pipeline.days };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.url.includes('cursor='), true);
  assert.deepEqual(result.ids, ['keep-a', 'new-b', 'new-c']);
  assert.deepEqual(result.days, [
    { day: '2026-10-17', count: 4 },
    { day: '2026-10-16', count: 2 },
  ]);
});

test('a 400 on a cursor request refetches pipeline page 1', async () => {
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.items = [{ task_id: "page-2-old", day: "2026-10-16" }];
      state.pipeline.days = [{ day: "2026-10-16", count: 1 }];
      state.pipeline.nextCursor = "cursor-stale";
      state.pipeline.window = getPipelineRange();
      state.pipeline.loaded = true;
      state.pipeline.key = pipelineKey();
      const more = loadPipeline("more");
      await settle();
      const moreUrl = calls[0].url;
      const error = new Error("Invalid pipeline request: cursor");
      error.status = 400;
      calls[0].reject(error);
      await settle();
      const resetUrl = calls[1] ? calls[1].url : "";
      calls[1].resolve({
        items: [{ task_id: "page-1" }],
        days: [{ day: "2026-10-18", count: 1 }],
        stages: { queued: 2 },
        facets: { projects: ["/work/harbor-sync"], agents: ["brindle-agent"] },
        next_cursor: null,
      });
      await calls[1].promise;
      await more;
      await settle();
      return { moreUrl, resetUrl, fetches: calls.length, ids: rowIds(), queued: state.pipeline.stages.queued };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.fetches, 2);
  assert.equal(result.moreUrl.includes('cursor='), true);
  assert.equal(result.resetUrl.includes('cursor='), false);
  assert.equal(result.resetUrl.includes('limit=50'), true);
  assert.deepEqual(result.ids, ['page-1']);
  assert.equal(result.queued, 2);
});

test('range all sends no from or to, and a flagged filter pauses the poll', () => {
  const result = vm.runInNewContext(`
    const MEMORY_SCROLL_IDLE_MS = 1500;
    const PIPELINE_MAX_PAGE = 100;
    const PIPELINE_REFRESH_HEADROOM = 20;
    const state = {
      activeView: "pipelineView",
      pipeline: { project: "", agent: "", state: "", flagged: true, range: "all", customFrom: "", customTo: "", loaded: true, readsDisabled: false, openPopover: "", lastScrollAt: 0, items: [] },
      drawer: { id: "", task: "" },
    };
    const document = { hidden: false };
    ${uiClientFunction('localDayKey')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('parseLocalDay')}
    ${uiClientFunction('isMemoryDrawerOpen')}
    ${uiClientFunction('isPipelineFiltered')}
    ${uiClientFunction('pipelinePollPaused')}
    ${uiClientFunction('getPipelineRange')}
    ${uiClientFunction('pipelineUrl')}
    ${uiClientFunction('pipelineCanPoll')}
    const allUrl = pipelineUrl(getPipelineRange(), 50, null);
    const allPoll = pipelineCanPoll();
    state.pipeline.flagged = false;
    state.pipeline.range = "7d";
    const weekUrl = pipelineUrl(getPipelineRange(), 50, null);
    const weekPoll = pipelineCanPoll();
    ({ allUrl, allPoll, weekUrl, weekPoll });
  `, { URLSearchParams });
  assert.equal(result.allUrl.includes('from='), false);
  assert.equal(result.allUrl.includes('to='), false);
  assert.equal(result.allUrl.includes('flagged=1'), true);
  assert.equal(result.allPoll, false);
  assert.equal(result.weekUrl.includes('from='), true);
  assert.equal(result.weekUrl.includes('to='), true);
  assert.equal(result.weekUrl.includes('flagged='), false);
  assert.equal(result.weekPoll, true);
});

test('pipeline pickers merge overview lists with facets, and overview spelling wins', () => {
  const result = JSON.parse(JSON.stringify(vm.runInNewContext(`
    const state = {
      overview: { projects: ["/work/lumen-notes"], agents: ["lumen-agent"] },
      pipeline: {
        project: "/work/quay-notes",
        agent: "",
        facets: { projects: ["/work/harbor-sync", "/work/Lumen-Notes"], agents: ["quay-agent", "lumen-agent"] },
      },
    };
    ${uiClientFunction('agentIdOf')}
    ${uiClientFunction('agentLabel')}
    ${uiClientFunction('agentOptionKey')}
    ${uiClientFunction('sameAgent')}
    ${uiClientFunction('canonicalAgentOption')}
    ${uiClientFunction('lookupAgentLabel')}
    ${uiClientFunction('projectBasename')}
    ${uiClientFunction('isActivitySelected')}
    ${uiClientFunction('pipelineFacetValues')}
    ({
      projects: pipelineFacetValues("project").map((option) => option.value),
      agents: pipelineFacetValues("agent").map((option) => option.value),
    });
  `)));
  assert.deepEqual(result.projects, ['/work/harbor-sync', '/work/lumen-notes', '/work/quay-notes']);
  assert.deepEqual(result.agents, ['lumen-agent', 'quay-agent']);
});

test('a refresh that misses the loaded tail pauses without dropping rows, and a hit merges in place', async () => {
  assert.doesNotMatch(uiClientFunction('loadPipeline'), /incoming\[incoming\.length - 1\]/);
  assert.match(uiClientFunction('loadPipeline'), /mergePipelineRefresh\(pipe\.items, incoming, anchorId\)/);
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      state.pipeline.items = [
        { task_id: "a", title: "old-a" },
        { task_id: "b", title: "keep-b" },
        { task_id: "c", title: "old-c" },
      ];
      state.pipeline.days = [{ day: "2026-10-17", count: 3 }];
      state.pipeline.nextCursor = "older-page";
      state.pipeline.window = { from: null, to: null };
      state.pipeline.loaded = true;
      state.pipeline.range = "7d";
      state.pipeline.key = pipelineKey();
      window.scrollX = 4;
      window.scrollY = 480;
      const scrollsBefore = window.scrolls;
      const refresh = loadPipeline("refresh");
      await settle();
      const refreshUrl = calls[0].url;
      calls[0].resolve({
        items: [
          { task_id: "n", title: "new" },
          { task_id: "a", title: "fresh-a" },
          { task_id: "c", title: "fresh-c" },
        ],
        days: [{ day: "2026-10-18", count: 2 }],
        stages: { queued: 4 },
        next_cursor: "next-1",
      });
      await refresh;
      await settle();
      const merged = {
        ids: rowIds(),
        titles: state.pipeline.items.map((item) => item.title),
        days: state.pipeline.days,
        nextCursor: state.pipeline.nextCursor,
        scrollY: window.scrollY,
        scrolls: window.scrolls - scrollsBefore,
        paused: state.pipeline.updatesPaused,
        hintHidden: els.pipelineUpdatesPaused.hidden,
      };

      state.pipeline.items = [{ task_id: "a" }, { task_id: "b" }, { task_id: "tail" }];
      state.pipeline.loaded = true;
      state.pipeline.updatesPaused = false;
      state.pipeline.key = pipelineKey();
      state.pipeline.nextCursor = "stay-cursor";
      state.pipeline.days = [{ day: "2026-10-17", count: 3 }];
      const windowBefore = state.pipeline.window;
      window.scrollY = 900;
      const scrollsAtPause = window.scrolls;
      const beforePause = calls.length;
      const pausedRefresh = loadPipeline("refresh");
      await settle();
      calls[beforePause].resolve({
        items: [{ task_id: "only-new" }],
        days: [{ day: "2026-10-18", count: 1 }],
        stages: { queued: 9 },
        facets: { projects: ["/work/harbor-sync"], agents: ["brindle-agent"] },
        next_cursor: "dropped-cursor",
      });
      await pausedRefresh;
      await settle();
      const paused = {
        ids: rowIds(),
        nextCursor: state.pipeline.nextCursor,
        days: state.pipeline.days,
        sameWindow: state.pipeline.window === windowBefore,
        scrolls: window.scrolls - scrollsAtPause,
        updatesPaused: state.pipeline.updatesPaused,
        hintHidden: els.pipelineUpdatesPaused.hidden,
        hint: els.pipelineUpdatesPaused.textContent,
        queued: state.pipeline.stages && state.pipeline.stages.queued,
        fetches: calls.length,
      };
      const canPoll = pipelineCanPoll();
      const beforePoll = calls.length;
      if (pipelineCanPoll()) await loadPipeline("refresh");
      await loadPipeline("refresh");
      await settle();
      const fetchesAfterPause = calls.length - beforePoll;

      const scrollsAtReset = window.scrolls;
      reloadPipelineFromStart();
      await settle();
      const resetUrl = calls[calls.length - 1].url;
      calls[calls.length - 1].resolve({
        items: [{ task_id: "fresh-1" }],
        days: [],
        stages: { queued: 1 },
        next_cursor: null,
      });
      await settle();
      return {
        refreshUrl, merged, paused, canPoll, fetchesAfterPause, resetUrl,
        afterReset: {
          scrolls: window.scrolls - scrollsAtReset,
          y: window.y,
          ids: rowIds(),
          hintHidden: els.pipelineUpdatesPaused.hidden,
          updatesPaused: state.pipeline.updatesPaused,
        },
      };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.refreshUrl.includes('cursor='), false);
  assert.deepEqual(result.merged.ids, ['n', 'a', 'b', 'c']);
  assert.deepEqual(result.merged.titles, ['new', 'fresh-a', 'keep-b', 'fresh-c']);
  assert.deepEqual(result.merged.days, [
    { day: '2026-10-18', count: 2 },
    { day: '2026-10-17', count: 3 },
  ]);
  assert.equal(result.merged.nextCursor, 'next-1');
  assert.equal(result.merged.scrollY, 480);
  assert.equal(result.merged.scrolls, 0);
  assert.equal(result.merged.paused, false);
  assert.equal(result.merged.hintHidden, true);
  assert.deepEqual(result.paused.ids, ['a', 'b', 'tail']);
  assert.equal(result.paused.nextCursor, 'stay-cursor');
  assert.deepEqual(result.paused.days, [{ day: '2026-10-17', count: 3 }]);
  assert.equal(result.paused.sameWindow, true);
  assert.equal(result.paused.scrolls, 0);
  assert.equal(result.paused.updatesPaused, true);
  assert.equal(result.paused.hintHidden, false);
  assert.equal(result.paused.hint, 'Updates paused – Refresh');
  assert.equal(result.paused.queued, 9);
  assert.equal(result.canPoll, false);
  assert.equal(result.fetchesAfterPause, 0);
  assert.equal(result.resetUrl.includes('limit=50'), true);
  assert.equal(result.resetUrl.includes('cursor='), false);
  assert.equal(result.afterReset.scrolls, 1);
  assert.equal(result.afterReset.y, 0);
  assert.deepEqual(result.afterReset.ids, ['fresh-1']);
  assert.equal(result.afterReset.hintHidden, true);
  assert.equal(result.afterReset.updatesPaused, false);
});

test('a refresh scrolls by the distance prepended rows push the visible task down', async () => {
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    (async () => {
      const tops = { above: -48, read: 180 };
      let pendingShift = 0;
      pipelineOnRender = () => {
        if (!pendingShift) return;
        const delta = pendingShift;
        pendingShift = 0;
        tops.above += delta;
        tops.read += delta;
      };
      els.pipelineList.querySelectorAll = () => ["above", "read"].map((id) => ({
        getAttribute(name) { return name === "data-task-id" ? id : null; },
        getBoundingClientRect() { return { top: tops[id] }; },
      }));
      window.scrollBy = function (x, y) {
        this.scrollByCalls = (this.scrollByCalls || 0) + 1;
        this.scrollByX = x;
        this.scrollByY = y;
        this.scrollY += y;
      };
      state.pipeline.items = [{ task_id: "above" }, { task_id: "read" }];
      state.pipeline.loaded = true;
      state.pipeline.range = "7d";
      state.pipeline.key = pipelineKey();
      window.scrollY = 220;
      const refresh = loadPipeline("refresh");
      await settle();
      pendingShift = 64;
      calls[0].resolve({
        items: [{ task_id: "new" }, { task_id: "above" }, { task_id: "read" }],
        days: [],
        stages: { queued: 1 },
        next_cursor: null,
      });
      await refresh;
      await settle();
      const shifted = {
        scrollByCalls: window.scrollByCalls,
        scrollByY: window.scrollByY,
        scrollY: window.scrollY,
        scrolls: window.scrolls,
        readTop: tops.read,
      };

      state.pipeline.items = [{ task_id: "above" }, { task_id: "read" }];
      state.pipeline.loaded = true;
      state.pipeline.updatesPaused = false;
      state.pipeline.key = pipelineKey();
      window.scrollY = 0;
      const callsBeforeTop = window.scrollByCalls;
      const atTopRefresh = loadPipeline("refresh");
      await settle();
      pendingShift = 40;
      calls[1].resolve({
        items: [{ task_id: "newer" }, { task_id: "above" }, { task_id: "read" }],
        days: [],
        stages: { queued: 1 },
        next_cursor: null,
      });
      await atTopRefresh;
      await settle();
      return {
        shifted,
        atTop: {
          scrollByCalls: window.scrollByCalls - callsBeforeTop,
          scrollY: window.scrollY,
          readTop: tops.read,
        },
      };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.shifted.scrollByCalls, 1);
  assert.equal(result.shifted.scrollByY, 64);
  assert.equal(result.shifted.scrollY, 284);
  assert.equal(result.shifted.scrolls, 0);
  assert.equal(result.shifted.readTop, 244);
  assert.equal(result.atTop.scrollByCalls, 0);
  assert.equal(result.atTop.scrollY, 0);
  assert.equal(result.atTop.readTop, 284);
});

test('Home queue duplicates and fallbacks today open Pipeline without the wrong state filter', () => {
  const result = JSON.parse(JSON.stringify(vm.runInNewContext(`
    const state = {
      overviewError: false,
      isSavingPolicy: true,
      overview: null,
      homeSummary: null,
      homeFallbackTaskCount: null,
      homeFallbackFrom: "",
      healthStatus: {},
      digestSchedulerPayload: null,
    };
    const nodes = {};
    const document = {
      getElementById(id) {
        if (!nodes[id]) nodes[id] = { textContent: "" };
        return nodes[id];
      },
    };
    function makeCard(id) {
      const attrs = {};
      return {
        id,
        className: "",
        hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
        setAttribute(name, value) { attrs[name] = String(value); },
        removeAttribute(name) { delete attrs[name]; },
      };
    }
    const els = {
      homeWorkerCard: makeCard("homeWorkerCard"),
      homeQueueCard: makeCard("homeQueueCard"),
      homeLlmCard: makeCard("homeLlmCard"),
      homeDigestCard: makeCard("homeDigestCard"),
      homeVaultCard: makeCard("homeVaultCard"),
    };
    function t(key, vars) {
      const template = en[key] || key;
      return String(template).replace(/\\{(\\w+)\\}/g, (_match, name) => (
        vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : "{" + name + "}"
      ));
    }
    function read(card) {
      return {
        state: card.getAttribute("data-pipeline-state"),
        range: card.getAttribute("data-pipeline-range"),
        flagged: card.getAttribute("data-pipeline-flagged"),
        fallbackFrom: card.getAttribute("data-pipeline-fallback-from"),
      };
    }
    ${uiClientFunction('setText')}
    ${uiClientFunction('setClass')}
    ${uiClientFunction('setAttr')}
    ${uiClientFunction('renderHealthCard')}
    ${uiClientFunction('parseTimestamp')}
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('localMidnightIso')}
    ${uiClientFunction('homeFallbackCount')}
    ${uiClientFunction('homeFallbackPipelineLink')}
    ${uiClientFunction('renderHomeHealth')}
    ${uiClientFunction('collectAttentionItems')}
    state.overview = { queue: { pending: 4, stuck_tasks: 0, duplicate_flags: 3 } };
    renderHomeHealth();
    const duplicates = read(els.homeQueueCard);
    state.overview = { queue: { pending: 2, stuck_tasks: 1, duplicate_flags: 3 } };
    renderHomeHealth();
    const stuck = read(els.homeQueueCard);
    state.overview = { queue: { pending: 1, stuck_tasks: 0, duplicate_flags: 0 } };
    renderHomeHealth();
    const quiet = read(els.homeQueueCard);
    const midnight = localMidnightIso();
    state.homeSummary = { tasks_today: { total: 5, fallback: 2, llm_calls: 3 } };
    state.homeFallbackFrom = midnight;
    state.homeFallbackTaskCount = 1;
    renderHomeHealth();
    const linked = read(els.homeLlmCard);
    const meta = nodes.homeLlmCardMeta.textContent;
    state.homeFallbackTaskCount = null;
    state.homeFallbackFrom = "";
    renderHomeHealth();
    const pendingCount = nodes.homeLlmCardMeta.textContent;
    state.overview = { queue: { pending: 2, stuck_tasks: 0, duplicate_flags: 2 } };
    state.homeSummary = null;
    const duplicateItems = collectAttentionItems();
    state.overview = null;
    state.homeSummary = { tasks_today: { fallback: 4 } };
    state.homeFallbackFrom = midnight;
    state.homeFallbackTaskCount = 1;
    const fallbackItems = collectAttentionItems();
    ({ duplicates, stuck, quiet, midnight, linked, meta, pendingCount, duplicateItems, fallbackItems });
  `, { en: ADMIN_UI_TRANSLATIONS.en })));
  assert.deepEqual(result.duplicates, { state: null, range: 'all', flagged: '1', fallbackFrom: null });
  assert.deepEqual(result.stuck, { state: 'stuck', range: 'all', flagged: null, fallbackFrom: null });
  assert.deepEqual(result.quiet, { state: 'queued', range: '7d', flagged: null, fallbackFrom: null });
  assert.equal(result.linked.fallbackFrom, result.midnight);
  assert.equal(result.linked.range, 'all');
  assert.equal(result.linked.state, null);
  assert.equal(result.linked.flagged, null);
  assert.match(result.meta, /1 fallback/);
  assert.match(result.pendingCount, /2 fallback/);
  assert.equal(result.duplicateItems.length, 1);
  assert.equal(result.duplicateItems[0].pipelineFlagged, '1');
  assert.equal(result.duplicateItems[0].pipelineRange, 'all');
  assert.equal(result.duplicateItems[0].pipelineState, undefined);
  assert.equal(result.fallbackItems.length, 1);
  assert.equal(result.fallbackItems[0].pipelineFallbackFrom, result.midnight);
  assert.equal(result.fallbackItems[0].pipelineRange, 'all');
  assert.equal(result.fallbackItems[0].pipelineState, undefined);
  assert.match(result.fallbackItems[0].text, /^1 /);
});

test('fallback_from is sent without a from/to window and resets the pipeline cursor', async () => {
  const iso = '2026-10-24T16:00:00.000Z';
  assert.match(uiClientFunction('pipelineKey'), /pipe\.fallbackFrom \|\| ""/);
  assert.match(uiClientFunction('pipelineUrl'), /fallback_from/);
  assert.match(uiClientFunction('clearPipelineFilters'), /fallbackFrom: ""/);
  assert.match(uiClientFunction('isPipelineFiltered'), /pipe\.fallbackFrom/);
  assert.match(uiClientFunction('renderPipelineToolbar'), /pipeline\.fallbackChip/);
  assert.match(uiClientFunction('renderPipelineNotice'), /pipe\.fallbackFrom/);
  const result = await vmJson(`
    ${pipelineBehaviourPrelude()}
    ${uiClientFunction('setPipelineFilters')}
    ${uiClientFunction('clearPipelineFilters')}
    (async () => {
      const iso = ${JSON.stringify(iso)};
      state.pipeline.loaded = true;
      state.pipeline.range = "7d";
      state.pipeline.fallbackFrom = iso;
      const filtered = isPipelineFiltered();
      const canPoll = pipelineCanPoll();
      state.pipeline.fallbackFrom = "";
      state.pipeline.range = "all";
      state.pipeline.items = [{ task_id: "keep" }, { task_id: "tail" }];
      state.pipeline.nextCursor = "old-cursor";
      state.pipeline.key = pipelineKey();
      state.pipeline.fallbackFrom = iso;
      const pending = loadPipeline("refresh");
      await settle();
      const params = new URLSearchParams(calls[0].url.slice(calls[0].url.indexOf("?") + 1));
      calls[0].resolve({ items: [{ task_id: "page-1" }], days: [], stages: { queued: 1 }, next_cursor: "ignored" });
      await pending;
      await settle();
      clearPipelineFilters();
      await settle();
      const clearParams = new URLSearchParams(calls[1].url.slice(calls[1].url.indexOf("?") + 1));
      return {
        filtered, canPoll,
        fallbackFrom: params.get("fallback_from"),
        stateParam: params.has("state"),
        from: params.has("from"),
        to: params.has("to"),
        cursor: params.has("cursor"),
        limit: params.get("limit"),
        ids: rowIds(),
        clearedFallback: state.pipeline.fallbackFrom,
        clearedRange: state.pipeline.range,
        clearHasFallback: clearParams.has("fallback_from"),
      };
    })();
  `, { URLSearchParams, en: ADMIN_UI_TRANSLATIONS.en });
  assert.equal(result.filtered, true);
  assert.equal(result.canPoll, false);
  assert.equal(result.fallbackFrom, iso);
  assert.equal(result.stateParam, false);
  assert.equal(result.from, false);
  assert.equal(result.to, false);
  assert.equal(result.cursor, false);
  assert.equal(result.limit, '50');
  assert.deepEqual(result.ids, ['page-1']);
  assert.equal(result.clearedFallback, '');
  assert.equal(result.clearedRange, '7d');
  assert.equal(result.clearHasFallback, false);
});

test('fallbacks today count distinct task ids, not fallback result rows', async () => {
  const result = await vmJson(`
    (async () => {
    const state = { homeFallbackSeq: 0, homeFallbackTaskCount: null, homeFallbackFrom: "" };
    const calls = [];
    let mode = "pages";
    let rendered = 0;
    function fetchJson(url) {
      calls.push(url);
      if (mode === "disabled") return Promise.resolve({ disabled: true, items: [] });
      if (calls.length === 1) {
        return Promise.resolve({
          items: [{ task_id: "t1" }, { task_id: "t1" }, { task_id: "t2" }],
          next_cursor: "c1",
        });
      }
      return Promise.resolve({ items: [{ task_id: "t2" }, { task_id: "t3" }], next_cursor: null });
    }
    function renderHome() { rendered += 1; }
    ${uiClientFunction('shiftDays')}
    ${uiClientFunction('localMidnightIso')}
    ${uiClientFunction('homeFallbackCount')}
    ${uiClientFunction('countDistinctFallbackTasks')}
    ${uiClientFunction('loadHomeFallbackTaskCount')}
    const onePage = countDistinctFallbackTasks([[{ task_id: "t1" }, { task_id: "t1" }]]);
    const overlap = countDistinctFallbackTasks([
      [{ task_id: "t1" }, { task_id: "t1" }, { task_id: "t2" }],
      [{ task_id: "t2" }, { task_id: "t3" }],
    ]);
    state.homeFallbackFrom = localMidnightIso();
    state.homeFallbackTaskCount = 1;
    const distinct = homeFallbackCount({ tasks_today: { fallback: 4 } });
    state.homeFallbackFrom = "2000-01-01T00:00:00.000Z";
    const rows = homeFallbackCount({ tasks_today: { fallback: 4 } });
    state.homeFallbackFrom = "";
    state.homeFallbackTaskCount = null;
    mode = "disabled";
    await loadHomeFallbackTaskCount();
    const afterDisabled = { count: state.homeFallbackTaskCount, from: state.homeFallbackFrom, rendered };
    mode = "pages";
    calls.length = 0;
    await loadHomeFallbackTaskCount();
    const params = calls.map((url) => new URLSearchParams(url.slice(url.indexOf("?") + 1)));
    return ({
      onePage, overlap, distinct, rows, afterDisabled, rendered,
      count: state.homeFallbackTaskCount,
      from: state.homeFallbackFrom,
      midnight: localMidnightIso(),
      first: {
        fallbackFrom: params[0].get("fallback_from"),
        stats: params[0].get("stats"),
        limit: params[0].get("limit"),
        from: params[0].has("from"),
        to: params[0].has("to"),
        state: params[0].has("state"),
        cursor: params[0].has("cursor"),
      },
      secondCursor: params[1].get("cursor"),
    });
    })();
  `, { URLSearchParams });
  assert.equal(result.onePage, 1);
  assert.equal(result.overlap, 3);
  assert.equal(result.distinct, 1);
  assert.equal(result.rows, 4);
  assert.equal(result.afterDisabled.count, null);
  assert.equal(result.afterDisabled.from, '');
  assert.equal(result.afterDisabled.rendered, 0);
  assert.equal(result.count, 3);
  assert.equal(result.from, result.midnight);
  assert.equal(result.rendered, 1);
  assert.equal(result.first.fallbackFrom, result.midnight);
  assert.equal(result.first.stats, '0');
  assert.equal(result.first.limit, '100');
  assert.equal(result.first.from, false);
  assert.equal(result.first.to, false);
  assert.equal(result.first.state, false);
  assert.equal(result.first.cursor, false);
  assert.equal(result.secondCursor, 'c1');
});

test('a fallback count that still has a cursor after 20 pages keeps the summary row count', async () => {
  const result = await vmJson(`
    (async () => {
      const state = { homeFallbackSeq: 0, homeFallbackTaskCount: null, homeFallbackFrom: "" };
      const calls = [];
      function fetchJson() {
        const page = calls.length + 1;
        calls.push(page);
        return Promise.resolve({ items: [{ task_id: "t" + page }], next_cursor: "c" + page });
      }
      let rendered = 0;
      function renderHome() { rendered += 1; }
      ${uiClientFunction('shiftDays')}
      ${uiClientFunction('localMidnightIso')}
      ${uiClientFunction('homeFallbackCount')}
      ${uiClientFunction('countDistinctFallbackTasks')}
      ${uiClientFunction('loadHomeFallbackTaskCount')}
      await loadHomeFallbackTaskCount();
      return {
        calls: calls.length,
        count: state.homeFallbackTaskCount,
        from: state.homeFallbackFrom,
        rendered,
        shown: homeFallbackCount({ tasks_today: { fallback: 9 } }),
      };
    })();
  `, { URLSearchParams });
  assert.equal(result.calls, 20);
  assert.equal(result.count, null);
  assert.equal(result.from, '');
  assert.equal(result.rendered, 0);
  assert.equal(result.shown, 9);
});

test('overlapping fallback counts for the same midnight share one pagination', async () => {
  const result = await vmJson(`
    (async () => {
      const state = { homeFallbackSeq: 0, homeFallbackTaskCount: null, homeFallbackFrom: "", homeFallbackInFlight: null };
      const calls = [];
      const pending = [];
      function fetchJson(url) {
        calls.push(url);
        return new Promise((resolve) => { pending.push(resolve); });
      }
      let rendered = 0;
      function renderHome() { rendered += 1; }
      ${uiClientFunction('shiftDays')}
      ${uiClientFunction('localMidnightIso')}
      ${uiClientFunction('countDistinctFallbackTasks')}
      ${uiClientFunction('loadHomeFallbackTaskCount')}
      const first = loadHomeFallbackTaskCount();
      const second = loadHomeFallbackTaskCount();
      let secondDone = false;
      second.then(() => { secondDone = true; });
      await Promise.resolve();
      const whilePending = { fetches: calls.length, seq: state.homeFallbackSeq, secondDone };
      pending[0]({ items: [{ task_id: "t1" }, { task_id: "t2" }], next_cursor: null });
      await first;
      await second;
      return {
        whilePending,
        fetches: calls.length,
        count: state.homeFallbackTaskCount,
        rendered,
        seq: state.homeFallbackSeq,
        inflight: state.homeFallbackInFlight,
      };
    })();
  `, { URLSearchParams });
  assert.equal(result.whilePending.fetches, 1);
  assert.equal(result.whilePending.seq, 1);
  assert.equal(result.whilePending.secondDone, false);
  assert.equal(result.fetches, 1);
  assert.equal(result.count, 2);
  assert.equal(result.rendered, 1);
  assert.equal(result.seq, 1);
  assert.equal(result.inflight, null);
});

test('a zero fallback summary clears the distinct count before rendering Home', async () => {
  const result = await vmJson(`
    (async () => {
      const state = {
        homeFallbackSeq: 2,
        homeFallbackTaskCount: 4,
        homeFallbackFrom: "",
        homeFallbackInFlight: { from: "stale", promise: null },
        homeSummary: null,
        homeSummaryAt: 0,
        homeSummaryInFlight: null,
      };
      const HOME_CHART_DAYS = 30;
      const renders = [];
      function fetchJson() {
        return Promise.resolve({ tasks_today: { fallback: 0, total: 3, llm_calls: 1 } });
      }
      ${uiClientFunction('shiftDays')}
      ${uiClientFunction('localMidnightIso')}
      ${uiClientFunction('homeFallbackCount')}
      ${uiClientFunction('loadHomeSummary')}
      state.homeFallbackFrom = localMidnightIso();
      function renderHome() {
        renders.push({
          count: state.homeFallbackTaskCount,
          from: state.homeFallbackFrom,
          seq: state.homeFallbackSeq,
          shown: homeFallbackCount(state.homeSummary),
          inflight: state.homeFallbackInFlight,
        });
      }
      await loadHomeSummary();
      return { renders, seq: state.homeFallbackSeq };
    })();
  `, { URLSearchParams });
  assert.equal(result.renders.length, 1);
  assert.equal(result.renders[0].count, null);
  assert.equal(result.renders[0].from, '');
  assert.equal(result.renders[0].seq, 3);
  assert.equal(result.renders[0].shown, 0);
  assert.equal(result.renders[0].inflight, null);
  assert.equal(result.seq, 3);
});

test('fallback chip copy exists in en and zh-CN, and the pause hint is a spaced pill', () => {
  for (const key of ['pipeline.fallbackChip', 'pipeline.fallbackRemove']) {
    const en = ADMIN_UI_TRANSLATIONS.en[key];
    const zh = ADMIN_UI_TRANSLATIONS['zh-CN'][key];
    assert.equal(typeof en, 'string');
    assert.equal(typeof zh, 'string');
    assert.ok(en.trim());
    assert.ok(zh.trim());
  }
  assert.match(ADMIN_UI_TRANSLATIONS.en['pipeline.fallbackChip'], /\{time\}/);
  assert.match(ADMIN_UI_TRANSLATIONS['zh-CN']['pipeline.fallbackChip'], /\{time\}/);
  const css = uiHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
  const block = css.slice(css.indexOf('.pipePause {'), css.indexOf('.pipePause:hover'));
  assert.match(block, /border-radius:\s*999px/);
  assert.match(block, /margin:[^;]*16px/);
  assert.match(block, /var\(--p-warn-fill\)/);
  assert.match(block, /var\(--p-warn-ink\)/);
  assert.match(css, /html\[data-glass="dark"\] \.pipelineView \{[^}]*--p-warn-fill:/);
  assert.match(css, /html\[data-glass="dark"\] \.pipelineView \{[^}]*--p-warn-ink:/);
  assert.match(uiClientFunction('bindPipelineEvents'), /#pipelineUpdatesPaused/);
  assert.match(uiClientFunction('reloadPipelineFromStart'), /scrollTo\(0,\s*0\)/);
  assert.match(pipelineSection(), /id="pipelineFallbackChip"/);
  assert.match(pipelineSection(), /id="pipelineUpdatesPaused"/);
});

