// Settings view (admin UI): markup, i18n, memory switches, LLM connection, digest scheduler and About.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { renderAdminPageHtml } = require('../dist/services/admin-ui.js');
const { ADMIN_UI_TRANSLATIONS } = require('../dist/services/admin-ui-copy.js');
const { ADMIN_UI_THEME } = require('../dist/services/admin-ui-theme.js');

const uiHtml = renderAdminPageHtml();
const uiScript = uiHtml.match(/<script>([\s\S]*)<\/script>/)[1];
const en = ADMIN_UI_TRANSLATIONS.en;
const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
const SECRET = 'sk-test-FIXTURE-key-9f3a2c';
const MASKED = 'sk-t...3a2c';
const HOSTILE = '<img src=x onerror=alert(1)>';
const POLICY_IDS = ['readToggle', 'writeToggle', 'readPolicyState', 'writePolicyState', 'readPolicyMeta', 'writePolicyMeta'];
const LEGACY_IDS = ['llmApiUrlInput', 'llmModelInput', 'llmApiKeyInput', 'llmSaveButton', 'llmTestButton', 'llmTestResult', 'releaseCheckButton', 'releaseCheckCard', 'dailyDigestCard', 'llmSettingsPanel'];

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

function settingsSection() {
  const start = uiHtml.indexOf('<section id="settingsView"');
  assert.ok(start >= 0, 'settingsView section');
  return uiHtml.slice(start, uiHtml.indexOf('<section id="', start + 1));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function llmConfig(extra) {
  return Object.assign({
    apiUrl: 'https://api.example.com/v1',
    model: 'demo-model',
    headers: '',
    disableJsonMode: false,
    hasApiKey: true,
    apiKeyMasked: MASKED,
    apiKey: SECRET,
    isLocalEndpoint: false,
    outputBudgetEnabled: true,
    observationMaxTokens: 2048,
    digestMaxTokens: 8192,
    envPath: 'C:/agentmemory/.env',
    exists: true,
  }, extra);
}

function digestState(config, runtime) {
  return {
    config: Object.assign({
      enabled: true,
      schedule_time: '02:30',
      time_zone: 'Pacific/Kiritimati',
      lookback_days: 3,
      schedule_hour: 2,
      schedule_minute: 30,
      updatedAt: '2026-10-22T00:00:00Z',
    }, config),
    runtime: Object.assign({ active: true, next_run_at: new Date(Date.now() + 44700000).toISOString(), next_run_delay_ms: 44700000 }, runtime),
  };
}

function settingsHarness() {
  const elements = {};
  const make = (id) => {
    const el = {
      id,
      textContent: '',
      innerHTML: '',
      className: '',
      hidden: false,
      disabled: false,
      checked: false,
      value: '',
      placeholder: '',
      style: {},
      dataset: {},
      attrs: {},
      options: [],
      offsetWidth: 220,
      offsetHeight: 80,
      listeners: {},
    };
    el.classList = {
      toggle(name, on) {
        const parts = new Set(el.className.split(/\s+/).filter(Boolean));
        const next = on === undefined ? !parts.has(name) : !!on;
        if (next) parts.add(name);
        else parts.delete(name);
        el.className = [...parts].join(' ');
        return next;
      },
    };
    el.getAttribute = (name) => (Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null);
    el.setAttribute = (name, value) => { el.attrs[name] = String(value); };
    el.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(el.attrs, name);
    el.removeAttribute = (name) => { delete el.attrs[name]; };
    el.addEventListener = (type, fn) => { (el.listeners[type] || (el.listeners[type] = [])).push(fn); };
    el.getBoundingClientRect = () => ({ top: 120, left: 800, right: 860, bottom: 150, width: 60, height: 30 });
    el.closest = () => el;
    el.contains = (node) => node === el;
    el.focus = () => { el.focused = true; };
    el.querySelector = (sel) => (sel === '.policyBadge' ? el.badge : null);
    elements[id] = el;
    return el;
  };
  for (const id of ['settingsView', 'readPolicyCard', 'writePolicyCard', 'readToggle', 'writeToggle', 'readPolicyState', 'writePolicyState', 'readPolicyMeta', 'writePolicyMeta', 'setReadChanged', 'setWriteChanged', 'setPolicyNote', 'setReadRow', 'setWriteRow', 'setLlmCard', 'setLlmApiUrl', 'setLlmModel', 'setLlmHeaders', 'setLlmDisableJson', 'setLlmKeyMasked', 'setLlmKeyInput', 'setLlmKeyChip', 'setLlmReplaceKey', 'setLlmKeyHint', 'setLlmBudget', 'setLlmEnvPath', 'setLlmNote', 'setLlmSave', 'setLlmTest', 'setLlmTestChip', 'setLlmTestedAt', 'setDigestCard', 'setDigestZone', 'setDigestZoneText', 'setDigestZoneWrap', 'setDigestEnabled', 'setDigestTime', 'setDigestLookback', 'setDigestSave', 'setDigestNext', 'setDigestInfo', 'setVersion', 'setLatest', 'setReleaseChip', 'setReleaseNote', 'setReleaseCheck', 'setReleaseLink', 'setReleaseCommands', 'setReleaseCode', 'setReleaseCopy', 'setUpdated', 'setConfirm', 'setConfirmText', 'setConfirmGo', 'setConfirmCancel', 'runtimeStatusLine']) make(id);
  elements.readPolicyCard.badge = make('readPolicyBadge');
  elements.writePolicyCard.badge = make('writePolicyBadge');
  elements.readToggle.checked = true;
  elements.writeToggle.checked = true;
  for (let n = 1; n <= 14; n += 1) {
    const option = make(`setDigestLookbackOption${n}`);
    option.value = String(n);
    option.textContent = n === 1 ? '1 day' : `${n} days`;
    elements.setDigestLookback.options.push(option);
  }
  const posts = [];
  const applied = [];
  const statuses = [];
  const documentListeners = {};
  const windowListeners = {};
  const state = {
    locale: 'en',
    activeView: 'settingsView',
    isSavingPolicy: false,
    isCheckingRelease: false,
    pendingPolicy: null,
    overview: { policy: { readEnabled: true, writeEnabled: true, updatedAt: '2026-10-22 09:14:00' }, release: { version: '2.1.1' } },
    releaseCheck: null,
    settings: {
      llm: null, llmLoading: false, llmSaving: false, llmError: '', llmSaveError: '', llmSaved: false, llmFormKey: '', llmTest: null, llmTesting: false, keyEditing: false,
      digest: null, digestLoading: false, digestSaving: false, digestError: '', digestSaveError: '', digestFormKey: '',
      policyError: '', loadedAt: 0, confirm: '', copiedAt: 0, section: 'setSwitchesCard',
    },
  };
  const els = {
    settingsView: elements.settingsView,
    readPolicyCard: elements.readPolicyCard,
    writePolicyCard: elements.writePolicyCard,
    readToggle: elements.readToggle,
    writeToggle: elements.writeToggle,
    readPolicyState: elements.readPolicyState,
    writePolicyState: elements.writePolicyState,
    readPolicyMeta: elements.readPolicyMeta,
    writePolicyMeta: elements.writePolicyMeta,
    setReadChanged: elements.setReadChanged,
    setWriteChanged: elements.setWriteChanged,
    setPolicyNote: elements.setPolicyNote,
    setLlmCard: elements.setLlmCard,
    setLlmApiUrl: elements.setLlmApiUrl,
    setLlmModel: elements.setLlmModel,
    setLlmHeaders: elements.setLlmHeaders,
    setLlmDisableJson: elements.setLlmDisableJson,
    setLlmKeyMasked: elements.setLlmKeyMasked,
    setLlmKeyInput: elements.setLlmKeyInput,
    setLlmKeyChip: elements.setLlmKeyChip,
    setLlmReplaceKey: elements.setLlmReplaceKey,
    setLlmKeyHint: elements.setLlmKeyHint,
    setLlmBudget: elements.setLlmBudget,
    setLlmEnvPath: elements.setLlmEnvPath,
    setLlmNote: elements.setLlmNote,
    setLlmSave: elements.setLlmSave,
    setLlmTest: elements.setLlmTest,
    setLlmTestChip: elements.setLlmTestChip,
    setLlmTestedAt: elements.setLlmTestedAt,
    setDigestCard: elements.setDigestCard,
    setDigestZone: elements.setDigestZone,
    setDigestZoneText: elements.setDigestZoneText,
    setDigestZoneWrap: elements.setDigestZoneWrap,
    setDigestEnabled: elements.setDigestEnabled,
    setDigestTime: elements.setDigestTime,
    setDigestLookback: elements.setDigestLookback,
    setDigestSave: elements.setDigestSave,
    setDigestNext: elements.setDigestNext,
    setDigestInfo: elements.setDigestInfo,
    setVersion: elements.setVersion,
    setLatest: elements.setLatest,
    setReleaseChip: elements.setReleaseChip,
    setReleaseNote: elements.setReleaseNote,
    setReleaseCheck: elements.setReleaseCheck,
    setReleaseLink: elements.setReleaseLink,
    setReleaseCommands: elements.setReleaseCommands,
    setReleaseCode: elements.setReleaseCode,
    setReleaseCopy: elements.setReleaseCopy,
    setUpdated: elements.setUpdated,
    setConfirm: elements.setConfirm,
    setConfirmText: elements.setConfirmText,
    setConfirmGo: elements.setConfirmGo,
    setConfirmCancel: elements.setConfirmCancel,
    runtimeStatusLine: elements.runtimeStatusLine,
    setNavItems: [],
    setCards: [],
  };
  const context = vm.createContext({
    UI: ADMIN_UI_TRANSLATIONS,
    state,
    els,
    posts,
    applied,
    statuses,
    URL,
    Intl,
    document: {
      getElementById: (id) => elements[id] || null,
      documentElement: { scrollHeight: 4000 },
      addEventListener(type, fn) { (documentListeners[type] || (documentListeners[type] = [])).push(fn); },
    },
    window: {
      innerHeight: 900,
      scrollY: 0,
      requestAnimationFrame(fn) { fn(); },
      scrollTo() {},
      addEventListener(type, fn) { (windowListeners[type] || (windowListeners[type] = [])).push(fn); },
    },
    fetchJson(url, options) {
      const entry = {
        url,
        method: options && options.method ? options.method : 'GET',
        body: options && options.body ? JSON.parse(options.body) : null,
      };
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve;
        entry.reject = reject;
      });
      posts.push(entry);
      return entry.promise;
    },
  });
  vm.runInContext(harnessSource, context);
  return {
    context,
    elements,
    state,
    posts,
    applied,
    statuses,
    documentListeners,
    run(code) { return vm.runInContext(code, context); },
  };
}

const harnessSource = `
function t(key, vars) {
  const dict = (state.locale === 'zh-CN' ? UI['zh-CN'] : UI.en) || {};
  return String(dict[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : ''));
}
function svgIcon() { return '<svg></svg>'; }
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function renderOverview() {
  const policy = getDisplayedPolicy();
  renderPolicyCard('read', !!policy.readEnabled);
  renderPolicyCard('write', !!policy.writeEnabled);
}
function applyReadPolicyToViews(policy) { applied.push(JSON.parse(JSON.stringify(policy))); }
function setRawStatusLine(name, element, message, variant) { statuses.push({ name, message, variant }); }
function syncSettingsSection() {}
function renderLlmConfig() {
  state.llmConfigRendered = state.llmConfig;
  if (!state.llmConfig || !els.llmApiUrlInput) return;
  els.llmApiUrlInput.value = state.llmConfig.apiUrl || "";
  els.llmModelInput.value = state.llmConfig.model || "";
  els.llmHeadersInput.value = state.llmConfig.headers || "";
}
${[
  'setText', 'setAttr', 'setHidden', 'setClass', 'parseTimestamp', 'formatUiDate', 'statusVariantClass', 'formatClock', 'formatShortDate', 'formatDuration', 'formatSettingsStamp', 'syncSelect', 'getSettingsTimeZones', 'settingsZonesAvailable', 'renderSettings', 'renderSettingsLlm', 'renderSettingsLlmTest', 'renderSettingsDigest', 'renderSettingsDayOptions', 'renderSettingsAbout', 'getSettingsReleasePresentation', 'settingsRedacted', 'settingsTypedKey', 'settingsHttpUrl', 'settingsLlmPayload', 'settingsLlmProblem', 'settingsLlmTestView', 'saveSettingsLlm', 'loadSettingsLlm', 'loadSettingsDigest', 'showSettingsView', 'runSettingsLlmTest', 'settingsDigestPayload', 'settingsDigestProblem', 'saveSettingsDigest', 'renderSettingsUpdated', 'savePolicy', 'onPolicyToggleClick', 'onPolicyToggleChange', 'confirmSettingsSwitchOff', 'cancelSettingsConfirm', 'setSettingsConfirm', 'commitPolicySave', 'policyToggleKind', 'policyToggleKey', 'savedPolicyEnabled', 'getDisplayedPolicy', 'renderPolicyCard', 'renderPolicyNote', 'getPolicyMeta', 'bindSettingsEvents',
].map((name) => uiClientFunction(name)).join('\n')}
bindSettingsEvents();
`;

function domSurface(elements, includeValues) {
  const parts = [];
  for (const el of Object.values(elements)) {
    parts.push(el.textContent || '', el.innerHTML || '', el.className || '', el.placeholder || '');
    if (includeValues) parts.push(el.value || '');
    if (el.attrs) parts.push(...Object.values(el.attrs));
  }
  return parts.join('\n');
}

function clickEvent(toggle) {
  return { currentTarget: toggle, target: toggle, prevented: false, preventDefault() { this.prevented = true; } };
}

test('Settings markup has no placeholder and keeps the policy ids inside the switches card', () => {
  const view = settingsSection();
  const markup = uiHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const switches = view.slice(view.indexOf('id="setSwitchesCard"'), view.indexOf('id="setLlmCard"'));
  assert.match(view, /^<section id="settingsView" class="appView settingsView"/);
  assert.doesNotMatch(view, /placeholderCard|comingSoon/);
  assert.ok(view.includes('id="setConfirm"'));
  assert.ok(switches.includes('id="setPolicyNote"'));
  for (const id of POLICY_IDS) {
    assert.equal([...markup.matchAll(new RegExp(`\\sid="${id}"`, 'g'))].length, 1, `#${id} is unique`);
    assert.equal([...switches.matchAll(new RegExp(`\\sid="${id}"`, 'g'))].length, 1, `#${id} is inside the switches card`);
  }
  for (const [, id] of view.matchAll(/\sid="([^"]+)"/g)) {
    if (id === 'settingsView' || POLICY_IDS.includes(id)) continue;
    assert.match(id, /^set/, `${id} uses the set prefix`);
  }
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  const dev = uiHtml.slice(uiHtml.indexOf('id="devToolsView"'), uiHtml.indexOf('<script>'));
  for (const id of LEGACY_IDS) {
    assert.equal([...markup.matchAll(new RegExp(`\\sid="${id}"`, 'g'))].length, 1, `legacy #${id} is unique`);
    assert.equal(view.includes(`id="${id}"`), false);
    assert.ok(dev.includes(`id="${id}"`), `legacy #${id} stays under Developer tools`);
  }
  assert.match(view, /id="setLlmKeyMasked"[^>]*readonly/);
  assert.match(view, /id="setLlmKeyInput"[^>]*type="password"[^>]*hidden/);
  assert.match(ADMIN_UI_THEME, /\.setHint\.is-error \{/);
  assert.match(ADMIN_UI_THEME, /\.setSelectWrap\.is-text \.setSelectIcon \{\s*display:\s*none;/);
});

test('every Settings i18n key exists in en and zh-CN with the same placeholders', () => {
  const keys = (dict) => Object.keys(dict).filter((key) => key.startsWith('settings.')).sort();
  assert.ok(keys(en).length > 40);
  assert.deepEqual(keys(zh), keys(en));
  const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of keys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
    assert.deepEqual(vars(zh[key]), vars(en[key]), `${key} placeholders`);
  }
  const used = new Set([...uiScript.matchAll(/"(settings\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  for (const match of settingsSection().matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="(settings\.[^"]+)"/g)) used.add(match[1]);
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  assert.equal(en['settings.confirmReadOff'], 'Turn off reading? Agents stop getting startup context and search results until you turn it back on.');
  assert.equal(en['settings.confirmWriteOff'], 'Turn off writing? New observations and state updates are dropped until you turn it back on.');
  assert.equal(en['settings.digestOff'], 'Scheduler is off. No nightly digests are built.');
  assert.equal(en['settings.llmConnected'], 'Connected · {latency} ms');
  assert.equal(en['settings.llmFailed'], 'Failed · {error}');
  assert.equal(en['settings.policySaveFailed'], 'Could not save that change. The previous setting is still in place.');
});

test('Settings client wiring keeps legacy panels and does not check for updates until the button', () => {
  const show = uiClientFunction('showSettingsView');
  assert.match(show, /loadSettingsLlm\(\)/);
  assert.match(show, /loadSettingsDigest\(\)/);
  assert.doesNotMatch(show, /loadReleaseCheck|release-check/);
  assert.match(uiClientFunction('initialize'), /loadReleaseCheck\(\)/);
  const settingsBind = uiClientFunction('bindSettingsEvents');
  assert.match(settingsBind, /els\.setReleaseCheck\.addEventListener\("click", \(\) => \{\s*if \(!state\.isCheckingRelease\) void loadReleaseCheck\(\);/);
  assert.match(settingsBind, /Escape" && state\.settings\.confirm/);
  assert.match(settingsBind, /cancelSettingsConfirm\(\)/);
  assert.match(settingsBind, /event\.target === els\.readToggle \|\| event\.target === els\.writeToggle/);
  const bind = uiClientFunction('bindEvents');
  assert.match(bind, /onPolicyToggleClick/);
  assert.match(bind, /onPolicyToggleChange\(toggle\)/);
  assert.match(bind, /llmSaveButton[\s\S]{0,200}saveLlmSettings\(\)/);
  assert.match(bind, /llmTestButton[\s\S]{0,200}runLlmConnectionTest\(\)/);
  assert.match(bind, /releaseCheckButton[\s\S]{0,240}loadReleaseCheck\(\)/);
  assert.match(uiClientFunction('applyLocale'), /renderSettings\(\)/);
  assert.match(uiClientFunction('usesActivityBackdrop'), /state\.activeView === "settingsView"/);
  for (const name of ['renderSettingsLlm', 'renderSettingsDigest', 'saveSettingsLlm']) {
    assert.doesNotMatch(uiClientFunction(name), /readEnabled|readsDisabled/, `${name} stays usable while reads are off`);
  }
  assert.doesNotMatch(uiClientFunction('applyReadPolicyToViews'), /state\.settings/);
  assert.doesNotMatch(uiClientFunction('renderSettingsAbout'), /bootstrap|git pull|0\.9\.4/);
  assert.doesNotMatch(uiClientFunction('saveSettingsLlm'), /console\.(log|debug|info|warn)/);
});

test('turning a memory switch off confirms first; cancel, Esc and an outside click send nothing', async () => {
  const h = settingsHarness();
  const open = clickEvent(h.elements.readToggle);
  h.context.open = open;
  h.run('onPolicyToggleClick(open)');
  assert.equal(open.prevented, true);
  assert.equal(h.elements.readToggle.checked, true);
  assert.equal(h.state.settings.confirm, 'read');
  assert.equal(h.elements.setConfirm.hidden, false);
  assert.equal(h.elements.setConfirmText.textContent, en['settings.confirmReadOff']);
  h.elements.readToggle.checked = false;
  h.run('onPolicyToggleChange(els.readToggle)');
  assert.equal(h.elements.readToggle.checked, true);
  assert.equal(h.posts.length, 0);

  h.elements.setConfirmCancel.listeners.click[0]();
  assert.equal(h.posts.length, 0);
  assert.equal(h.state.settings.confirm, '');
  assert.equal(h.elements.readToggle.checked, true);
  assert.equal(h.elements.setConfirm.hidden, true);

  h.run('onPolicyToggleClick(open)');
  const esc = { key: 'Escape', prevented: false, preventDefault() { this.prevented = true; } };
  h.documentListeners.keydown[0](esc);
  assert.equal(esc.prevented, true);
  assert.equal(h.posts.length, 0);
  assert.equal(h.state.settings.confirm, '');
  assert.equal(h.elements.readToggle.checked, true);

  h.run('onPolicyToggleClick(open)');
  h.documentListeners.click[0]({ target: h.elements.readToggle });
  assert.equal(h.state.settings.confirm, 'read');
  h.documentListeners.click[0]({ target: { id: 'outside' } });
  assert.equal(h.posts.length, 0);
  assert.equal(h.state.settings.confirm, '');
  assert.equal(h.elements.readToggle.checked, true);
});

test('confirming switch-off posts the policy, disables both switches, and restores them if the save fails', async () => {
  const h = settingsHarness();
  const open = clickEvent(h.elements.readToggle);
  h.context.open = open;
  h.run('onPolicyToggleClick(open)');
  const pending = h.run('confirmSettingsSwitchOff()');
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].url, '/admin/api/settings');
  assert.equal(h.posts[0].method, 'POST');
  assert.deepEqual(plain(h.posts[0].body), { readEnabled: false, writeEnabled: true });
  assert.equal(h.elements.readToggle.disabled, true);
  assert.equal(h.elements.writeToggle.disabled, true);
  const extra = clickEvent(h.elements.writeToggle);
  h.context.extra = extra;
  h.elements.writeToggle.checked = false;
  h.run('onPolicyToggleClick(extra)');
  assert.equal(extra.prevented, true);
  assert.equal(h.elements.writeToggle.checked, true);
  assert.equal(h.posts.length, 1);
  h.posts[0].reject(Object.assign(new Error('boom'), { status: 500 }));
  await pending;
  assert.equal(h.state.overview.policy.readEnabled, true);
  assert.equal(h.state.overview.policy.writeEnabled, true);
  assert.equal(h.elements.readToggle.checked, true);
  assert.equal(h.elements.readToggle.disabled, false);
  assert.equal(h.elements.writeToggle.disabled, false);
  assert.equal(h.elements.setPolicyNote.hidden, false);
  assert.equal(h.elements.setPolicyNote.textContent, en['settings.policySaveFailed']);
  assert.match(h.elements.setPolicyNote.className, /is-error/);
  assert.equal(h.statuses.at(-1).message, 'boom');
  assert.equal(h.applied.length, 0);
});

test('a confirmed switch-off updates the row and the top-bar pill; turning a switch on posts immediately', async () => {
  const h = settingsHarness();
  const open = clickEvent(h.elements.readToggle);
  h.context.open = open;
  h.run('onPolicyToggleClick(open)');
  let pending = h.run('confirmSettingsSwitchOff()');
  h.posts[0].resolve({ success: true, policy: { readEnabled: false, writeEnabled: true, updatedAt: '2026-10-24 04:05:06' } });
  await pending;
  assert.equal(h.elements.readPolicyState.textContent, 'Off');
  assert.equal(h.elements.readPolicyCard.badge.textContent, 'Off');
  assert.equal(h.elements.readPolicyCard.className, 'policyPill readPolicy is-disabled');
  assert.equal(h.elements.readToggle.checked, false);
  assert.equal(h.elements.readToggle.disabled, false);
  assert.equal(h.elements.readPolicyMeta.textContent, en['settings.readOffLead']);
  assert.match(h.elements.setReadRow.className, /is-off/);
  assert.equal(h.elements.setPolicyNote.hidden, true);
  assert.equal(h.applied.length, 1);
  assert.equal(h.applied[0].readEnabled, false);

  h.state.overview.policy = { readEnabled: false, writeEnabled: true, updatedAt: '2026-10-24 04:05:06' };
  h.posts.length = 0;
  h.run('renderOverview()');
  h.elements.readToggle.checked = true;
  const turnOn = clickEvent(h.elements.readToggle);
  h.context.turnOn = turnOn;
  h.run('onPolicyToggleClick(turnOn)');
  assert.equal(turnOn.prevented, false);
  assert.equal(h.state.settings.confirm, '');
  pending = h.run('onPolicyToggleChange(els.readToggle)');
  assert.deepEqual(plain(h.posts[0].body), { readEnabled: true, writeEnabled: true });
  h.posts[0].resolve({ success: true, policy: { readEnabled: true, writeEnabled: true, updatedAt: '2026-10-24 05:06:07' } });
  await pending;
  assert.equal(h.elements.readPolicyState.textContent, 'On');
  assert.equal(h.elements.readPolicyCard.badge.textContent, 'On');
});

test('the LLM card shows only the masked key and omits apiKey unless a new one was typed', async () => {
  const h = settingsHarness();
  assert.equal(SECRET.length >= 8, true);
  assert.equal(SECRET.includes(MASKED), false);
  h.state.settings.llm = llmConfig();
  h.run('renderSettingsLlm()');
  assert.equal(h.elements.setLlmKeyInput.value, '');
  assert.equal(h.elements.setLlmKeyMasked.value, MASKED);
  assert.equal(h.elements.setLlmKeyChip.textContent, en['settings.llmKeySaved']);
  assert.equal(domSurface(h.elements, true).includes(SECRET), false);

  h.elements.setLlmKeyInput.value = SECRET;
  assert.equal(domSurface(h.elements, false).includes(SECRET), false);
  assert.equal(h.elements.setLlmKeyMasked.value, MASKED);
  let body = plain(h.run('settingsLlmPayload()'));
  assert.equal(Object.hasOwn(body, 'apiKey'), false);
  assert.equal(JSON.stringify(body).includes(SECRET), false);

  h.elements.setLlmReplaceKey.listeners.click[0]();
  assert.equal(h.state.settings.keyEditing, true);
  assert.equal(h.elements.setLlmKeyInput.hidden, false);
  assert.equal(h.elements.setLlmKeyInput.value, '');
  assert.equal(h.elements.setLlmReplaceKey.textContent, en['settings.confirmCancel']);
  h.elements.setLlmKeyInput.value = `  ${SECRET}  `;
  body = plain(h.run('settingsLlmPayload()'));
  assert.equal(body.apiKey, SECRET);
  h.elements.setLlmReplaceKey.listeners.click[0]();
  assert.equal(h.state.settings.keyEditing, false);
  assert.equal(h.elements.setLlmKeyInput.value, '');
  assert.equal(h.elements.setLlmKeyInput.hidden, true);

  h.elements.setLlmApiUrl.value = 'ftp://files.example/llm';
  h.elements.setLlmModel.value = 'demo-model';
  await h.run('saveSettingsLlm()');
  assert.equal(h.posts.length, 0);
  assert.equal(h.state.settings.llmSaveError, en['settings.llmUrlInvalid']);
  assert.match(h.elements.setLlmNote.className, /is-error/);
  h.elements.setLlmApiUrl.value = 'https://api.example.com/v1';
  h.elements.setLlmModel.value = '   ';
  await h.run('saveSettingsLlm()');
  assert.equal(h.posts.length, 0);
  assert.equal(h.state.settings.llmSaveError, en['settings.llmModelRequired']);

  h.state.settings.keyEditing = true;
  h.elements.setLlmKeyInput.value = SECRET;
  h.elements.setLlmApiUrl.value = 'https://api.example.com/v1';
  h.elements.setLlmModel.value = 'demo-model';
  h.elements.setLlmHeaders.value = '{"X-Custom":"1"}';
  h.elements.setLlmDisableJson.checked = true;
  let pending = h.run('saveSettingsLlm()');
  assert.equal(h.elements.setLlmSave.disabled, true);
  assert.equal(h.elements.setLlmTest.disabled, true);
  body = plain(h.posts[0].body);
  assert.equal(h.posts[0].url, '/admin/api/llm-config');
  assert.equal(h.posts[0].method, 'POST');
  assert.equal(body.apiKey, SECRET);
  assert.equal(body.disableJsonMode, true);
  assert.equal(Object.hasOwn(body, 'outputBudgetEnabled'), false);
  assert.equal(Object.hasOwn(body, 'observationMaxTokens'), false);
  h.posts[0].reject(Object.assign(new Error(`nope ${SECRET}`), { status: 500 }));
  await pending;
  assert.equal(h.elements.setLlmNote.textContent.includes(SECRET), false);
  assert.match(h.elements.setLlmNote.textContent, /••••/);
  assert.equal(h.elements.setLlmKeyInput.value, SECRET);
  assert.equal(h.state.settings.keyEditing, true);
  assert.equal(domSurface(h.elements, false).includes(SECRET), false);

  h.state.settings.keyEditing = false;
  h.elements.setLlmKeyInput.value = SECRET;
  h.elements.setLlmDisableJson.checked = false;
  h.elements.setLlmHeaders.value = '';
  h.posts.length = 0;
  pending = h.run('saveSettingsLlm()');
  body = plain(h.posts[0].body);
  assert.deepEqual(body, { apiUrl: 'https://api.example.com/v1', model: 'demo-model', headers: '', disableJsonMode: false });
  const saved = llmConfig({ apiUrl: 'https://api.example.com/v1', model: 'demo-model' });
  h.posts[0].resolve({ success: true, config: saved });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[1].url, '/admin/api/llm-config');
  assert.equal(h.posts[1].method, 'GET');
  assert.equal(h.elements.setLlmKeyInput.value, '');
  assert.equal(h.state.settings.keyEditing, false);
  assert.equal(h.elements.setLlmNote.textContent, en['settings.llmSaved']);
  h.posts[1].resolve({ config: saved });
  await pending;
  assert.equal(h.elements.setLlmKeyMasked.value, MASKED);
  assert.equal(h.elements.setLlmKeyInput.hidden, true);
  assert.equal(domSurface(h.elements, true).includes(SECRET), false);
  assert.equal(h.state.settings.llm.apiUrl, 'https://api.example.com/v1');
});

test('Test connection renders Connected, Failed and a thrown error, and the button stays disabled while it runs', async () => {
  const h = settingsHarness();
  h.run('renderSettingsLlmTest()');
  assert.equal(h.elements.setLlmTest.disabled, true);
  h.state.settings.llm = llmConfig();
  h.state.settings.llmTesting = true;
  h.run('renderSettingsLlm()');
  assert.equal(h.elements.setLlmTest.disabled, true);
  h.state.settings.llmTesting = false;
  h.run('renderSettingsLlm()');
  h.elements.setLlmApiUrl.value = 'https://api.example.com/v1';
  h.elements.setLlmModel.value = 'demo-model';
  let pending = h.run('runSettingsLlmTest()');
  assert.equal(h.elements.setLlmTest.disabled, true);
  assert.equal(h.elements.setLlmTest.textContent, en['settings.llmTesting']);
  assert.equal(h.posts[0].url, '/admin/api/llm-test');
  assert.equal(h.posts[0].method, 'POST');
  assert.equal(Object.hasOwn(plain(h.posts[0].body), 'apiKey'), false);
  assert.deepEqual(plain(h.posts[0].body), { apiUrl: 'https://api.example.com/v1', model: 'demo-model', headers: '' });
  h.posts[0].resolve({ ok: true, latencyMs: 412, testedAt: new Date().toISOString(), requestUrl: 'https://api.example.com/v1', model: 'demo-model' });
  await pending;
  assert.equal(h.elements.setLlmTestChip.textContent, 'Connected · 412 ms');
  assert.match(h.elements.setLlmTestChip.className, /is-ok/);
  assert.equal(h.elements.setLlmTestedAt.textContent, en['settings.testedNow']);
  assert.equal(h.elements.setLlmTest.disabled, false);

  h.state.settings.llmTest = { ok: true, latencyMs: 12, status: 200, error: '', requestUrl: '', testedAt: new Date(Date.now() - 2.5 * 60000).toISOString() };
  h.run('renderSettingsLlmTest()');
  assert.equal(h.elements.setLlmTestedAt.textContent, 'Tested 2 min ago');

  h.state.settings.keyEditing = true;
  h.elements.setLlmKeyInput.value = SECRET;
  h.posts.length = 0;
  pending = h.run('runSettingsLlmTest()');
  assert.equal(plain(h.posts[0].body).apiKey, SECRET);
  h.posts[0].resolve({ ok: false, error: 'unauthorized', status: 401, latencyMs: 20, testedAt: new Date().toISOString(), requestUrl: `https://api.example.com/${SECRET}` });
  await pending;
  assert.equal(h.elements.setLlmTestChip.textContent, 'Failed · 401 unauthorized');
  assert.match(h.elements.setLlmTestChip.className, /is-err/);
  assert.equal(h.elements.setLlmTestChip.attrs.title.includes(SECRET), false);

  h.posts.length = 0;
  pending = h.run('runSettingsLlmTest()');
  h.posts[0].resolve({ ok: false, error: '401 Unauthorized: invalid API key', status: 401, latencyMs: 238, testedAt: new Date().toISOString() });
  await pending;
  assert.equal(h.elements.setLlmTestChip.textContent, 'Failed · 401 Unauthorized: invalid API key');

  h.posts.length = 0;
  pending = h.run('runSettingsLlmTest()');
  h.posts[0].reject(Object.assign(new Error(`Request failed (503) ${SECRET}`), { status: 503 }));
  await pending;
  assert.match(h.elements.setLlmTestChip.textContent, /Failed/);
  assert.match(h.elements.setLlmTestChip.textContent, /503/);
  assert.match(h.elements.setLlmTestChip.className, /is-err/);
  assert.equal(h.elements.setLlmTestChip.textContent.includes(SECRET), false);
  assert.equal(h.elements.setLlmTest.disabled, false);
});

test('the digest card fills the scheduler, posts the save body, and falls back to a time-zone text field', async () => {
  const h = settingsHarness();
  h.state.settings.digest = digestState();
  h.run('renderSettingsDigest()');
  assert.equal(h.elements.setDigestEnabled.checked, true);
  assert.equal(h.elements.setDigestTime.value, '02:30');
  assert.equal(h.elements.setDigestZone.value, 'Pacific/Kiritimati');
  assert.match(h.elements.setDigestZone.innerHTML, /value="Pacific\/Kiritimati" selected/);
  assert.match(h.elements.setDigestNext.textContent, /Next run .+ \(in 12h 25m\)/);
  assert.equal(h.elements.setDigestLookback.value, '3');

  h.state.settings.digest = digestState({ time_zone: `Not/AZone${HOSTILE}` });
  h.state.settings.digestFormKey = '';
  h.run('renderSettingsDigest()');
  assert.match(h.elements.setDigestZone.innerHTML, /&lt;img/);
  assert.doesNotMatch(h.elements.setDigestZone.innerHTML, /<img/);
  assert.equal(h.elements.setDigestZone.value, `Not/AZone${HOSTILE}`);

  h.state.settings.digest = digestState({ enabled: false }, { next_run_at: null, next_run_delay_ms: null });
  h.state.settings.digestFormKey = '';
  h.run('renderSettingsDigest()');
  assert.equal(h.elements.setDigestNext.textContent, en['settings.digestOff']);
  assert.match(h.elements.setDigestInfo.className, /is-off/);

  h.state.settings.digest = digestState();
  h.state.settings.digestFormKey = '';
  h.run('renderSettingsDigest()');
  h.elements.setDigestTime.value = '99:99';
  await h.run('saveSettingsDigest()');
  assert.equal(h.posts.length, 0);
  assert.equal(h.elements.setDigestNext.textContent, en['settings.digestTimeInvalid']);
  assert.match(h.elements.setDigestInfo.className, /is-error/);
  h.elements.setDigestTime.value = '02:30';
  h.elements.setDigestLookback.value = '15';
  await h.run('saveSettingsDigest()');
  assert.equal(h.posts.length, 0);
  assert.equal(h.elements.setDigestNext.textContent, en['settings.digestDaysInvalid']);

  h.elements.setDigestLookback.value = '3';
  const pending = h.run('saveSettingsDigest()');
  assert.equal(h.elements.setDigestSave.disabled, true);
  assert.deepEqual(plain(h.posts[0].body), { enabled: true, schedule_time: '02:30', time_zone: 'Pacific/Kiritimati', lookback_days: 3 });
  assert.equal(h.posts[0].url, '/admin/api/digest-scheduler');
  assert.equal(h.posts[0].method, 'POST');
  const evil = `Daily digest ${HOSTILE}`;
  h.posts[0].reject(Object.assign(new Error(evil), { status: 400 }));
  await pending;
  assert.equal(h.elements.setDigestNext.textContent, evil);
  assert.equal(h.elements.setDigestNext.innerHTML, '');
  assert.match(h.elements.setDigestInfo.className, /is-error/);
  assert.equal(h.elements.setDigestSave.disabled, false);

  h.context.settingsZonesAvailable = function settingsZonesAvailable() { return false; };
  assert.equal(h.run('settingsZonesAvailable()'), false);
  h.state.settings.digest = digestState({ time_zone: 'Australia/Lord_Howe', lookback_days: 2 });
  h.state.settings.digestFormKey = '';
  h.state.settings.digestSaveError = '';
  h.run('renderSettingsDigest()');
  assert.equal(h.elements.setDigestZone.hidden, true);
  assert.equal(h.elements.setDigestZoneText.hidden, false);
  assert.equal(h.elements.setDigestZoneText.value, 'Australia/Lord_Howe');
  assert.match(h.elements.setDigestZoneWrap.className, /is-text/);
  h.elements.setDigestZoneText.value = 'Europe/Berlin';
  assert.equal(plain(h.run('settingsDigestPayload()')).time_zone, 'Europe/Berlin');
});

test('About uses the installed version and renders release-check commands from the response', () => {
  const h = settingsHarness();
  const commands = ['git pull', '.\\bootstrap-second-machine.cmd', HOSTILE];
  h.state.releaseCheck = {
    status: 'update_available',
    currentVersion: '9.9.9-should-not-win',
    latestVersion: '2.2.0',
    releaseUrl: 'https://github.com/example/agentmemory/releases/tag/v2.2.0',
    checkedAt: new Date().toISOString(),
    message: 'An update is available',
    upgradeGuidance: { installMode: 'git_checkout', summary: 'Pull, then bootstrap.', commands },
  };
  h.run('renderSettingsAbout()');
  assert.equal(h.elements.setVersion.textContent, '2.1.1');
  assert.equal(h.elements.setVersion.textContent.includes('9.9.9'), false);
  assert.equal(h.elements.setLatest.textContent, '2.2.0');
  assert.equal(h.elements.setReleaseChip.textContent, en['settings.aboutUpdate']);
  assert.match(h.elements.setReleaseChip.className, /is-warn/);
  assert.equal(h.elements.setReleaseLink.hidden, false);
  assert.equal(h.elements.setReleaseLink.getAttribute('href'), 'https://github.com/example/agentmemory/releases/tag/v2.2.0');
  assert.equal(h.elements.setReleaseCode.textContent, commands.join('\n'));
  assert.equal(h.elements.setReleaseCode.innerHTML, '');
  assert.equal(h.elements.setReleaseCommands.hidden, false);
  assert.equal(domSurface(h.elements, true).includes('9.9.9-should-not-win'), false);

  h.state.releaseCheck = { status: 'network_error', currentVersion: '9.9.9-should-not-win', latestVersion: '', message: `offline ${HOSTILE}`, releaseUrl: '', checkedAt: new Date().toISOString(), upgradeGuidance: { commands: ['git pull'] } };
  h.run('renderSettingsAbout()');
  assert.equal(h.elements.setReleaseNote.textContent, `offline ${HOSTILE}`);
  assert.equal(h.elements.setReleaseNote.innerHTML, '');
  assert.equal(h.elements.setReleaseNote.className, 'setMuted');
  assert.equal(h.elements.setReleaseCommands.hidden, true);
  assert.equal(h.elements.setReleaseChip.hidden, true);

  h.state.releaseCheck = { status: 'invalid_latest_tag', message: '', latestVersion: '', releaseUrl: 'javascript:alert(1)' };
  h.run('renderSettingsAbout()');
  assert.equal(h.elements.setReleaseNote.textContent, en['settings.aboutInvalidTag']);
  assert.equal(h.elements.setReleaseLink.hidden, true);

  h.state.releaseCheck = { status: 'up_to_date', latestVersion: '2.1.1', releaseUrl: 'https://github.com/example/agentmemory/releases/tag/v2.1.1', checkedAt: new Date().toISOString(), upgradeGuidance: { commands: ['git pull'] } };
  h.run('renderSettingsAbout()');
  assert.equal(h.elements.setReleaseChip.textContent, en['settings.aboutUpToDate']);
  assert.match(h.elements.setReleaseChip.className, /is-ok/);
  assert.equal(h.elements.setReleaseCommands.hidden, true);

  h.state.isCheckingRelease = true;
  h.run('renderSettingsAbout()');
  assert.equal(h.elements.setReleaseCheck.disabled, true);
  assert.equal(h.elements.setReleaseCheck.textContent, en['settings.aboutChecking']);
  assert.equal(h.elements.setReleaseChip.hidden, true);
});

test('reads off leaves Settings usable, and a locale switch re-renders the page copy', () => {
  const h = settingsHarness();
  h.state.overview.policy = { readEnabled: false, writeEnabled: true, updatedAt: '2026-10-22 09:14:00' };
  h.elements.readToggle.checked = false;
  h.run('renderOverview()');
  assert.equal(h.elements.readPolicyState.textContent, 'Off');
  assert.equal(h.elements.readToggle.disabled, false);
  assert.equal(h.elements.readPolicyMeta.textContent, en['settings.readOffLead']);
  assert.equal(h.elements.writePolicyState.textContent, 'On');
  h.state.settings.llm = llmConfig({ hasApiKey: false, apiKey: '', apiKeyMasked: '' });
  h.run('renderSettingsLlm()');
  assert.equal(h.elements.setLlmSave.disabled, false);
  assert.equal(h.elements.setLlmKeyChip.textContent, 'Not set');
  assert.equal(h.elements.setLlmKeyMasked.value, '');
  h.state.settings.digest = digestState();
  h.run('renderSettingsDigest()');
  assert.equal(h.elements.setDigestSave.disabled, false);
  assert.equal(h.elements.setReleaseCheck.disabled, false);

  h.state.locale = 'zh-CN';
  h.state.overview.policy.readEnabled = true;
  h.state.settings.digest = digestState({ enabled: false }, { next_run_at: null, next_run_delay_ms: null });
  h.state.settings.digestFormKey = '';
  h.run('renderOverview()');
  h.run('renderSettings()');
  assert.equal(h.elements.readPolicyState.textContent, '开');
  assert.equal(h.elements.readPolicyCard.badge.textContent, '开');
  h.state.overview.policy.readEnabled = false;
  h.run('renderOverview()');
  assert.equal(h.elements.readPolicyState.textContent, '关');
  assert.equal(h.elements.readPolicyCard.badge.textContent, '关');
  assert.equal(h.elements.setDigestLookback.options[0].textContent, '1 天');
  assert.equal(h.elements.setDigestLookback.options[1].textContent, '2 天');
  assert.equal(h.elements.setDigestNext.textContent, zh['settings.digestOff']);
});

test('a settings GET that finishes after a save does not restore the old LLM or digest card', async () => {
  const h = settingsHarness();
  h.state.settings.llm = llmConfig({ apiUrl: 'https://old.example/v1', model: 'old-model', headers: 'old-header' });
  h.state.settings.digest = digestState();
  h.state.settings.llmFormKey = '';
  h.state.settings.digestFormKey = '';
  h.run('renderSettings()');
  assert.equal(h.elements.setLlmApiUrl.value, 'https://old.example/v1');
  assert.equal(h.elements.setDigestTime.value, '02:30');
  assert.equal(h.elements.setLlmSave.disabled, false);
  assert.equal(h.elements.setDigestSave.disabled, false);

  h.run('showSettingsView()');
  const llmGet = h.posts.find((entry) => entry.url === '/admin/api/llm-config' && entry.method === 'GET');
  const digestGet = h.posts.find((entry) => entry.url === '/admin/api/digest-scheduler' && entry.method === 'GET');
  assert.ok(llmGet && digestGet);
  assert.equal(h.elements.setLlmSave.disabled, false);
  assert.equal(h.elements.setDigestSave.disabled, false);

  h.elements.setLlmApiUrl.value = 'https://new.example/v1';
  h.elements.setLlmModel.value = 'new-model';
  h.elements.setLlmHeaders.value = 'x-new';
  h.elements.setDigestTime.value = '04:45';
  const llmSave = h.run('saveSettingsLlm()');
  const digestSave = h.run('saveSettingsDigest()');
  const llmPost = h.posts.find((entry) => entry.url === '/admin/api/llm-config' && entry.method === 'POST');
  const digestPost = h.posts.find((entry) => entry.url === '/admin/api/digest-scheduler' && entry.method === 'POST');
  const savedLlm = llmConfig({ apiUrl: 'https://new.example/v1', model: 'new-model', headers: 'x-new' });
  delete savedLlm.apiKey;
  llmPost.resolve({ success: true, config: savedLlm });
  digestPost.resolve(digestState({ schedule_time: '04:45', updatedAt: '2026-10-24T04:45:00Z' }));
  await new Promise((resolve) => setImmediate(resolve));

  llmGet.resolve({ config: llmConfig({ apiUrl: 'https://old.example/v1', model: 'old-model', headers: 'old-header' }) });
  digestGet.resolve(digestState());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.state.settings.llm.apiUrl, 'https://new.example/v1');
  assert.equal(h.state.settings.llm.model, 'new-model');
  assert.equal(h.state.settings.llm.headers, 'x-new');
  assert.equal(h.elements.setLlmApiUrl.value, 'https://new.example/v1');
  assert.equal(h.elements.setLlmModel.value, 'new-model');
  assert.equal(h.elements.setLlmHeaders.value, 'x-new');
  assert.equal(h.state.settings.digest.config.schedule_time, '04:45');
  assert.equal(h.elements.setDigestTime.value, '04:45');

  const quiet = h.posts.filter((entry) => entry.url === '/admin/api/llm-config' && entry.method === 'GET' && entry !== llmGet);
  assert.equal(quiet.length, 1);
  quiet[0].resolve({ config: savedLlm });
  await llmSave;
  await digestSave;
  assert.equal(h.elements.setLlmApiUrl.value, 'https://new.example/v1');
  assert.equal(h.elements.setLlmModel.value, 'new-model');
  assert.equal(h.elements.setDigestTime.value, '04:45');
  assert.equal(JSON.stringify(h.state.settings.llm).includes(SECRET), false);
});

test('a locale switch during a connection test re-enables the LLM form, and save and test do not overlap', async () => {
  const h = settingsHarness();
  h.state.settings.llm = llmConfig();
  h.run('renderSettingsLlm()');
  h.elements.setLlmApiUrl.value = 'https://api.example.com/v1';
  h.elements.setLlmModel.value = 'demo-model';
  const pending = h.run('runSettingsLlmTest()');
  assert.equal(h.elements.setLlmApiUrl.disabled, true);
  assert.equal(h.elements.setLlmSave.disabled, true);
  assert.equal(h.elements.setLlmTest.disabled, true);
  const postsDuringTest = h.posts.length;
  await h.run('saveSettingsLlm()');
  assert.equal(h.posts.length, postsDuringTest);
  assert.equal(h.posts.some((entry) => entry.url === '/admin/api/llm-config'), false);

  h.state.locale = 'zh-CN';
  h.run('renderSettings()');
  assert.equal(h.elements.setLlmApiUrl.disabled, true);
  assert.equal(h.elements.setLlmModel.disabled, true);
  assert.equal(h.elements.setLlmHeaders.disabled, true);
  assert.equal(h.elements.setLlmDisableJson.disabled, true);
  assert.equal(h.elements.setLlmSave.disabled, true);
  h.posts[0].resolve({ ok: true, latencyMs: 10, testedAt: new Date().toISOString(), requestUrl: 'https://api.example.com/v1' });
  await pending;
  assert.equal(h.elements.setLlmApiUrl.disabled, false);
  assert.equal(h.elements.setLlmModel.disabled, false);
  assert.equal(h.elements.setLlmHeaders.disabled, false);
  assert.equal(h.elements.setLlmDisableJson.disabled, false);
  assert.equal(h.elements.setLlmSave.disabled, false);
  assert.equal(h.elements.setLlmTest.disabled, false);

  h.state.locale = 'en';
  h.posts.length = 0;
  const savePending = h.run('saveSettingsLlm()');
  assert.equal(h.elements.setLlmTest.disabled, true);
  const blocked = h.run('runSettingsLlmTest()');
  await blocked;
  assert.equal(h.posts.some((entry) => entry.url === '/admin/api/llm-test'), false);
  h.posts[0].resolve({ success: true, config: llmConfig() });
  await new Promise((resolve) => setImmediate(resolve));
  h.posts[1].resolve({ config: llmConfig() });
  await savePending;
  assert.equal(h.elements.setLlmSave.disabled, false);
  assert.equal(h.elements.setLlmTest.disabled, false);
});

test('Test connection redacts a typed key shorter than 8 characters', async () => {
  const h = settingsHarness();
  const shortKey = 'k7';
  assert.equal(shortKey.length < 8, true);
  h.state.settings.llm = llmConfig();
  h.run('renderSettingsLlm()');
  h.elements.setLlmApiUrl.value = 'https://api.example.com/v1';
  h.elements.setLlmModel.value = 'demo-model';
  h.state.settings.keyEditing = true;
  h.elements.setLlmKeyInput.value = `  ${shortKey}  `;
  const pending = h.run('runSettingsLlmTest()');
  assert.equal(plain(h.posts[0].body).apiKey, shortKey);
  h.posts[0].resolve({
    ok: false,
    error: `401 invalid ${shortKey}`,
    status: 401,
    requestUrl: `https://api.example.com/${shortKey}`,
    testedAt: new Date().toISOString(),
  });
  await pending;
  assert.equal(h.elements.setLlmTestChip.textContent.includes(shortKey), false);
  assert.match(h.elements.setLlmTestChip.textContent, /••••/);
  assert.equal(h.elements.setLlmTestChip.attrs.title.includes(shortKey), false);
  assert.match(h.elements.setLlmTestChip.attrs.title, /••••/);
  assert.equal(domSurface(h.elements, false).includes(shortKey), false);
  assert.equal(h.elements.setLlmSave.disabled, false);
});

test('a successful Settings LLM save updates the legacy dev-tools llmConfig', async () => {
  const h = settingsHarness();
  h.state.llmConfig = llmConfig({ apiUrl: 'https://old.example/v1', model: 'old-model', headers: 'x-old' });
  h.state.settings.llm = llmConfig({ apiUrl: 'https://old.example/v1', model: 'old-model', headers: 'x-old' });
  h.run('els.llmApiUrlInput = { value: "https://old.example/v1" }; els.llmModelInput = { value: "old-model" }; els.llmHeadersInput = { value: "x-old" };');
  h.run('renderSettingsLlm()');
  h.elements.setLlmApiUrl.value = 'https://new.example/v1';
  h.elements.setLlmModel.value = 'new-model';
  h.elements.setLlmHeaders.value = 'x-new';
  const pending = h.run('saveSettingsLlm()');
  const saved = llmConfig({ apiUrl: 'https://new.example/v1', model: 'new-model', headers: 'x-new' });
  delete saved.apiKey;
  h.posts[0].resolve({ success: true, config: saved });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.state.llmConfig.apiUrl, 'https://new.example/v1');
  assert.equal(h.state.llmConfig.model, 'new-model');
  assert.equal(h.state.llmConfig.headers, 'x-new');
  assert.equal(JSON.stringify(h.state.llmConfig).includes(SECRET), false);
  assert.equal(h.context.els.llmApiUrlInput.value, 'https://new.example/v1');
  assert.equal(h.context.els.llmModelInput.value, 'new-model');
  assert.equal(h.context.els.llmHeadersInput.value, 'x-new');
  assert.equal(h.state.llmConfigRendered.apiUrl, 'https://new.example/v1');
  h.posts[1].resolve({ config: saved });
  await pending;
  assert.equal(h.context.els.llmApiUrlInput.value, 'https://new.example/v1');
  assert.equal(h.elements.setLlmNote.textContent, en['settings.llmSaved']);
});
