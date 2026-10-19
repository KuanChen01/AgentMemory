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
      if (seen && depth === 0) return uiScript.slice(start, index + 1);
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
    const state = {
      activeView: "pipelineView",
      pipeline: { project: "", agent: "", state: "", range: "7d", loaded: true, readsDisabled: false, openPopover: "", lastScrollAt: 0 },
      drawer: { id: "", task: "" },
    };
    const document = { hidden: false };
    ${uiClientFunction('isMemoryDrawerOpen')}
    ${uiClientFunction('isPipelineFiltered')}
    ${uiClientFunction('pipelineCanPoll')}
    const out = { plain: pipelineCanPoll() };
    state.pipeline.project = "harbor-sync"; out.project = pipelineCanPoll(); state.pipeline.project = "";
    state.pipeline.agent = "claude"; out.agent = pipelineCanPoll(); state.pipeline.agent = "";
    state.pipeline.state = "stuck"; out.state = pipelineCanPoll(); state.pipeline.state = "";
    state.pipeline.range = "30d"; out.range = pipelineCanPoll(); state.pipeline.range = "7d";
    state.drawer.task = "task-1"; out.task = pipelineCanPoll(); state.drawer.task = "";
    state.drawer.id = "mem-1"; out.memory = pipelineCanPoll(); state.drawer.id = "";
    document.hidden = true; out.hidden = pipelineCanPoll(); document.hidden = false;
    state.pipeline.lastScrollAt = Date.now(); out.scrolling = pipelineCanPoll(); state.pipeline.lastScrollAt = 0;
    state.activeView = "memoryView"; out.elsewhere = pipelineCanPoll();
    out;
  `);
  assert.equal(result.plain, true);
  for (const key of ['project', 'agent', 'state', 'range', 'task', 'memory', 'hidden', 'scrolling', 'elsewhere']) {
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
  assert.match(attention, /home\.attnStuck[^\n]*pipelineState: "stuck"/);
  assert.match(attention, /home\.attnDuplicates[^\n]*pipelineState: "duplicate"/);
  assert.match(attention, /home\.attnFallbacks[^\n]*pipelineState: "fallback"/);
  assert.match(uiClientFunction('renderHomeAttention'), /data-pipeline-state="/);
  assert.match(uiClientFunction('renderHomeHealth'), /setAttr\(els\.homeQueueCard, "data-pipeline-state"/);
  assert.match(uiClientFunction('bindEvents'), /presetPipelineFilters\(trigger\.getAttribute\("data-pipeline-state"\)/);
  const preset = vm.runInNewContext(`
    const PIPELINE_STATES = ["queued", "processing", "saved", "skipped", "duplicate", "fallback", "failed", "stuck"];
    const state = { pipeline: { project: "lumen-notes", agent: "codex", state: "", range: "custom", customFrom: "2026-10-01", customTo: "2026-10-02" } };
    ${uiClientFunction('presetPipelineFilters')}
    presetPipelineFilters("stuck", "30d");
    const stuck = Object.assign({}, state.pipeline);
    presetPipelineFilters("bogus", "forever");
    ({ stuck, bogus: Object.assign({}, state.pipeline) });
  `);
  assert.deepEqual(JSON.parse(JSON.stringify(preset.stuck)), { project: '', agent: '', state: 'stuck', range: '30d', customFrom: '', customTo: '' });
  assert.equal(preset.bogus.state, '');
  assert.equal(preset.bogus.range, '7d');
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
  assert.match(css, /\.activityView,\s*\.memoryView,\s*\.pipelineView \{\s*position: relative;\s*--a-glass:/);
  assert.match(css, /html\[data-glass="dark"\] \.activityView,\s*html\[data-glass="dark"\] \.memoryView,\s*html\[data-glass="dark"\] \.pipelineView \{/);
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
