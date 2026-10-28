// Shared admin UI consistency: locale dates, empty state, status chips, and the developer-tools toggle.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');

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

function dateSample(locale) {
  return vm.runInNewContext(`
    const state = { locale: ${JSON.stringify(locale)} };
    ${uiClientFunction('formatUiDate')}
    const date = new Date(2026, 9, 24, 16, 36, 8);
    ({
      day: formatUiDate(date, "day"),
      dateTime: formatUiDate(date, "dateTime"),
      time: formatUiDate(date, "time"),
      full: formatUiDate(date, "full"),
    });
  `);
}

test('formatUiDate renders day, date-time and full stamps for en and zh-CN', () => {
  const en = dateSample('en');
  assert.equal(en.day, 'Oct 24');
  assert.equal(en.dateTime, 'Oct 24, 16:36');
  assert.equal(en.time, '16:36');
  assert.match(en.full, /2026/);
  assert.match(en.full, /16:36:08/);
  const zh = dateSample('zh-CN');
  assert.equal(zh.day, '10月24日');
  assert.equal(zh.dateTime, '10月24日 16:36');
  assert.equal(zh.time, '16:36');
  assert.match(zh.full, /2026/);
  assert.match(zh.full, /16:36:08/);
});

test('renderEmptyState uses one shared empty-state structure', () => {
  const html = vm.runInNewContext(`
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('renderEmptyState')}
    renderEmptyState("ICON", "Nothing here", "Try another range", "Clear");
  `);
  assert.match(html, /class="emptyState"/);
  assert.match(html, /class="emptyStateLine"/);
  assert.match(html, /ICON/);
  assert.match(html, /Nothing here/);
  assert.match(html, /Try another range/);
  assert.match(html, /Clear/);
});

test('statusChip covers the semantic variants', () => {
  const html = vm.runInNewContext(`
    ${uiScript.slice(uiScript.indexOf('function escapeHtml('), uiScript.indexOf('function summarize('))}
    ${uiClientFunction('statusVariantClass')}
    ${uiClientFunction('statusChip')}
    ["success", "warning", "danger", "neutral", "info"].map((variant) => statusChip(variant, variant)).join("\\n");
  `);
  for (const variant of ['success', 'warning', 'danger', 'neutral', 'info']) {
    assert.match(html, new RegExp('statusChip is-' + variant));
  }
});

test('Pipeline and Digests keep Load more reachable while a search has no loaded matches', () => {
  for (const name of ['renderPipelineNotice', 'renderDigestNotice']) {
    const source = uiClientFunction(name);
    assert.match(source, /keepMore/);
    assert.match(source, /nextCursor/);
    assert.match(source, name.indexOf('Pipeline') >= 0 ? /pipeline\.noResultsMore/ : /digests\.noResultsMore/);
  }
  for (const name of ['renderPipelineList', 'renderDigestList']) {
    const source = uiClientFunction(name);
    assert.match(source, /keepMore/);
    assert.match(source, /if \(noticed\) return/);
    assert.doesNotMatch(source, /setHidden\(els\.\w+LoadMore, noticed \|\| !/);
    assert.ok(source.indexOf('list.innerHTML = ""') < source.indexOf('if (noticed) return'));
  }
});

test('Activity, Pipeline, Digests, Projects and Skills empty states use renderEmptyState', () => {
  for (const name of ['renderActivityBoard', 'renderPipelineNotice', 'renderDigestNotice', 'renderProjectNotice', 'renderSkillEmpty']) {
    assert.match(uiClientFunction(name), /renderEmptyState\(/, name);
  }
  assert.match(uiClientFunction('renderSkillNotice'), /renderEmptyState\(/);
});

test('Settings chips and the Activity drawer use statusChip', () => {
  for (const name of ['renderSettingsLlm', 'renderSettingsAbout', 'renderDrawerTask', 'renderMemoryDrawerBody']) {
    assert.match(uiClientFunction(name), /statusChip\(/, name);
  }
  const llm = uiClientFunction('renderSettingsLlm');
  assert.match(llm, /is-ok/);
  assert.match(llm, /is-warn/);
  const about = uiClientFunction('renderSettingsAbout');
  assert.match(about, /is-ok|is-warn|view\.tone/);
});

test('opening Developer tools while the toggle is off turns the toggle on', () => {
  const activate = uiClientFunction('activateView');
  assert.match(activate, /setDevToolsEnabled\(true, true\)/);
  assert.doesNotMatch(activate, /nextView = "homeView"/);
  const toggle = uiClientFunction('setDevToolsEnabled');
  assert.match(toggle, /activateView\("homeView"\)/);
  assert.match(toggle, /localStorage/);
  assert.match(uiClientFunction('initialize'), /activateView\(initialViewId\(\)\)/);
  assert.match(uiClientFunction('initialViewId'), /location\.hash/);
});
