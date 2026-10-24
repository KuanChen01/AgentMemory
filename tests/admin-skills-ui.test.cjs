// Skills view (admin UI): markup, i18n, client URL and wiring, row variants, drawer body, XSS, glass tokens and docking.
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

function skillsSection() {
  const start = uiHtml.indexOf('<section id="skillsView"');
  assert.ok(start >= 0, 'skillsView section');
  return uiHtml.slice(start, uiHtml.indexOf('<section id="', start + 1));
}

test('Skills view replaces the placeholder and follows Projects directly', () => {
  const view = skillsSection();
  assert.match(view, /^<section id="skillsView" class="appView skillsView"/);
  assert.doesNotMatch(view, /placeholderCard|shell\.comingSoon/);
  const sections = [...uiHtml.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(sections[sections.indexOf('projectsView') + 1], 'skillsView');
  assert.deepEqual(ADMIN_UI_NAV_ITEMS.map((item) => [item.id, item.target, item.key]).find((row) => row[0] === 'navSkills'), ['navSkills', 'skillsView', 'nav.skills']);
  assert.match(uiHtml, /id="navSkills"[^>]*data-nav-target="skillsView"/);
  assert.match(view, /data-i18n="shell\.skillsLead"/);
  for (const id of ['sklLead', 'sklToolbar', 'sklSearchInput', 'sklSearchClear', 'sklProjectButton', 'sklProjectValue', 'sklSortButton', 'sklSortValue',
    'sklRangeControl', 'sklRange7', 'sklRange30', 'sklRange90', 'sklStats', 'sklStatActiveValue', 'sklStatActiveSub', 'sklStatCandidatesValue',
    'sklStatMatchesLabel', 'sklStatHitRateValue', 'sklStatHitRateSub', 'sklCard', 'sklSegments', 'sklSegCandidateCount', 'sklSegActiveCount',
    'sklSegDisabledCount', 'sklSegRetiredCount', 'sklListHead', 'sklList', 'sklEmpty', 'sklCount', 'sklLoadMore', 'sklNotice', 'sklProjectPopover',
    'sklSortPopover', 'sklConfirm', 'sklConfirmGo', 'sklConfirmCancel']) {
    assert.ok(view.includes(`id="${id}"`), `#${id} lives in the Skills view`);
  }
  for (const [, id] of view.matchAll(/\sid="([^"]+)"/g)) if (id !== 'skillsView') assert.match(id, /^skl/, `${id} uses the skl prefix`);
  const markup = uiHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  for (const id of ['proceduralSkillsPanel', 'proceduralSkillsStatus', 'proceduralProjectSelect', 'proceduralLocalDateInput', 'proceduralStatusFilter',
    'proceduralAsOfInput', 'proceduralLimitInput', 'proceduralRefreshButton', 'proceduralStatusText', 'proceduralCandidateList', 'proceduralFeedbackOutcomeSelect']) {
    assert.equal([...markup.matchAll(new RegExp(`\\sid="${id}"`, 'g'))].length, 1, `legacy #${id} exists once`);
    assert.ok(!view.includes(`id="${id}"`));
  }
  assert.deepEqual([...view.matchAll(/data-skill-range="([^"]+)"/g)].map((match) => match[1]), ['7', '30', '90']);
  assert.match(uiHtml.match(/<[a-z]+[^>]*\bid="sklRange30"[^>]*>/)[0], /aria-pressed="true"/);
  assert.deepEqual([...view.matchAll(/data-skill-status="([^"]+)"/g)].map((match) => match[1]), ['candidate', 'active', 'disabled', 'retired']);
  assert.match(view, /id="sklList"[^>]*><\/div>/);
});

test('every Skills i18n key exists in en and zh-CN with the same placeholders', () => {
  const en = ADMIN_UI_TRANSLATIONS.en;
  const zh = ADMIN_UI_TRANSLATIONS['zh-CN'];
  const keys = (dict) => Object.keys(dict).filter((key) => key.startsWith('skills.')).sort();
  assert.ok(keys(en).length > 80);
  assert.deepEqual(keys(zh), keys(en));
  const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of keys(en)) {
    assert.ok(String(en[key]).trim() && String(zh[key]).trim(), `${key} must not be empty`);
    assert.deepEqual(vars(zh[key]), vars(en[key]), `${key} placeholders`);
  }
  const source = uiHtml.replace(/const UI_DICTIONARY = .*\n/, '');
  const used = new Set([...source.matchAll(/"(skills\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]));
  for (const key of [...used]) if (Object.prototype.hasOwnProperty.call(en, `${key}One`)) used.add(`${key}One`);
  // Built from parts: action labels and segment counts (the prefixes themselves are not keys).
  for (const prefix of ['skills.action', 'skills.count', 'skills.countOf']) used.delete(prefix);
  for (const action of ['Promote', 'Enable', 'Disable', 'Retire', 'Reenable']) used.add(`skills.action${action}`);
  for (const noun of ['Candidate', 'Active', 'Disabled', 'Retired']) {
    used.add(`skills.count${noun}`);
    used.add(`skills.count${noun}One`);
    used.add(`skills.countOf${noun}`);
  }
  for (const key of used) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh-CN is missing ${key}`);
  }
  assert.equal(en['skills.notePromoted'], 'Promoted to draft. Enable it to start matching.');
  assert.equal(en['skills.confirmDisable'], 'Disable this skill? It stops matching until re-enabled.');
  assert.equal(en['skills.confirmRetire'], 'Retire this skill? It is hidden from projects.');
  assert.equal(en['skills.emptyAllTitle'] + '. ' + en['skills.emptyAllLead'], 'No skills or candidates yet. Candidates appear after nightly digests.');
});

test('skills-summary URL carries status, days, sort, limit, tz, project and q, and a cursor only for later pages', () => {
  const run = (skills, cursor) => new URL(vm.runInNewContext(`
    const SKILL_PAGE = 50;
    const state = { skills: ${JSON.stringify(skills)} };
    ${uiClientFunction('skillSort')}
    ${uiClientFunction('skillsUrl')}
    skillsUrl(${JSON.stringify(cursor)});
  `, { URLSearchParams }), 'http://admin.local');
  const first = run({ status: 'candidate', q: '  smoke ', project: 'p_1a2b', sort: '', days: 30 }, null);
  assert.equal(first.pathname, '/admin/api/skills-summary');
  assert.equal(first.searchParams.get('status'), 'candidate');
  assert.equal(first.searchParams.get('days'), '30');
  assert.equal(first.searchParams.get('sort'), 'recent');
  assert.equal(first.searchParams.get('limit'), '50');
  assert.equal(first.searchParams.get('project'), 'p_1a2b');
  assert.equal(first.searchParams.get('q'), 'smoke');
  assert.equal(first.searchParams.get('cursor'), null);
  assert.ok(first.searchParams.get('tz_offset_minutes') !== null);
  const more = run({ status: 'active', q: '', project: '', sort: '', days: 7 }, 'cursor-token');
  assert.equal(more.searchParams.get('sort'), 'matches');
  assert.equal(more.searchParams.get('project'), null);
  assert.equal(more.searchParams.get('q'), null);
  assert.equal(more.searchParams.get('cursor'), 'cursor-token');
  assert.equal(run({ status: 'active', q: '', project: '', sort: 'name', days: 90 }, null).searchParams.get('sort'), 'name');
});

test('Skills client wiring: sequencing, stale cursor, reads off, backdrop, docking, detail by id and path only in writes', () => {
  const load = uiClientFunction('loadSkills');
  assert.match(load, /if \(seq !== skl\.seq\) return;/);
  assert.match(load, /error\.status === 400/);
  assert.match(load, /payload\.status === "reads_disabled"/);
  assert.match(load, /summary\.active/);
  const policy = uiClientFunction('applyReadPolicyToViews');
  assert.match(policy, /skl\.readsDisabled = true/);
  assert.match(policy, /skl\.seq \+= 1/);
  assert.match(policy, /els\.sklList\.innerHTML = ""/);
  assert.match(policy, /loadSkills\("reset"\)/);
  assert.doesNotMatch(uiScript, /usesActivityBackdrop|data-act-bg/);
  assert.match(uiClientFunction('memoryDrawerIsDocked'), /host === "skillsView"/);
  assert.match(uiClientFunction('activateView'), /showSkillsView\(\)/);
  assert.match(uiClientFunction('isMemoryDrawerOpen'), /state\.drawer\.skill/);
  assert.match(uiClientFunction('closeMemoryDrawer'), /drawer\.skill = ""/);
  const open = uiClientFunction('openSkillDrawer');
  assert.match(open, /"\/admin\/api\/skill-detail\?"/);
  assert.match(open, /if \(seq !== drawer\.seq\) return;/);
  assert.match(open, /error\.status === 404/);
  assert.match(open, /mountMemoryDrawer\("skillsView"\)/);
  assert.match(uiClientFunction('syncSkillRows'), /setAttribute\("data-skill-id", id\)/);
  assert.match(uiClientFunction('renderSkillDrawerFoot'), /data-dev-panel="proceduralSkillsPanel"/);
  assert.match(uiClientFunction('runSkillAction'), /"\/admin\/api\/skills\/promote-candidate"/);
  assert.match(uiClientFunction('runSkillAction'), /"\/admin\/api\/skills\/status"/);
  assert.match(uiClientFunction('recordSkillFeedback'), /"\/admin\/api\/skills\/feedback"/);
  const skillsCode = uiScript.slice(uiScript.indexOf('// ---------- Skills ----------'), uiScript.indexOf('// ---------- Projects ----------'));
  // Two POST bodies (key + value each) plus the dev-panel preset, which only compares the in-memory path to an existing option.
  assert.equal([...skillsCode.matchAll(/project_path/g)].length, 6);
  assert.equal([...skillsCode.matchAll(/project_path: item\.project_path/g)].length, 2, 'project_path is written only in the promote and feedback bodies');
  for (const name of ['renderSkillRowBody', 'renderSkillDrawer', 'renderSkillDrawerBody', 'renderSkillDrawerFoot', 'skillsUrl', 'syncSkillRows', 'openSkillDrawer', 'copyMemoryId', 'loadSkillProjects']) {
    assert.doesNotMatch(uiClientFunction(name), /project_path/, `${name} must not touch project_path`);
  }
  assert.doesNotMatch(skillsCode, /\.score\b/);
});

function skillsContext(writeEnabled = true) {
  const context = vm.createContext({ UI: ADMIN_UI_TRANSLATIONS.en, writeEnabled, state: {
    locale: 'en',
    skills: { status: 'candidate', days: 30, items: [], pending: {}, promoted: {}, notes: {}, readsDisabled: false },
    drawer: { skill: '', skillPayload: null, skillItem: null, skillRecord: { outcome: 'success', notes: '' }, readsDisabled: false },
  } });
  vm.runInContext(`
    const SKILL_OUTCOMES = [["success", "skills.outcomeSuccess"], ["failure", "skills.outcomeFailure"], ["rejected", "skills.outcomeRejected"], ["skipped", "skills.outcomeSkipped"]];
    function t(key, vars) { return String(UI[key] || key).replace(/\\{(\\w+)\\}/g, (_m, name) => (vars && name in vars ? String(vars[name]) : "")); }
    function svgIcon(name) { return "<svg data-icon=\\"" + name + "\\"></svg>"; }
    function getDisplayedPolicy() { return { readEnabled: true, writeEnabled }; }
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
    ${uiClientFunction('projectAgo')}
    ${uiClientFunction('skillWritesOff')}
    ${uiClientFunction('skillWritePending')}
    ${uiClientFunction('findSkillItem')}
    ${uiClientFunction('skillDrawerItem')}
    ${uiClientFunction('skillDrawerSignature')}
    ${uiClientFunction('skillVariant')}
    ${uiClientFunction('skillMatchedAgo')}
    ${uiClientFunction('skillSource')}
    ${uiClientFunction('renderSkillIcon')}
    ${uiClientFunction('renderSkillChip')}
    ${uiClientFunction('renderSkillActionButton')}
    ${uiClientFunction('renderSkillRowAction')}
    ${uiClientFunction('renderSkillSpark')}
    ${uiClientFunction('renderSkillVotes')}
    ${uiClientFunction('renderSkillRowBody')}
    ${uiClientFunction('skillSection')}
    ${uiClientFunction('skillQuiet')}
    ${uiClientFunction('renderSkillBars')}
    ${uiClientFunction('skillStepText')}
    ${uiClientFunction('renderSkillFeedbackForm')}
    ${uiClientFunction('renderSkillDrawerBody')}
    ${uiClientFunction('renderSkillDrawerFoot')}
  `, context);
  return context;
}

const days = Array.from({ length: 14 }, (_v, index) => ({ date: `2026-10-${String(11 + index).padStart(2, '0')}`, matches: 0 }));
const candidate = {
  id: 'c_dg_100_0', kind: 'digest_candidate', name: 'Run smoke test before tagging', summary: 'Build, run the smoke suite, then tag the release.',
  status: 'candidate', stored_status: null, project_key: 'p_1a2b', display_name: 'harbor-sync', project_path: '/work/<img src=x onerror=alert(1)>/harbor-sync',
  source: 'digest_candidate', source_digest: { id: 'dg_100', covered_day: '2026-10-23' }, candidate_ref: { local_date: '2026-10-23', candidate_index: 0 },
  confidence: 0.82, steps_count: 4, match_count_in_range: 0, last_matched_at: null, feedback_up: 0, feedback_down: 0, days,
};
const active = {
  ...candidate, id: 'sk_101', kind: 'skill', status: 'active', stored_status: 'enabled', candidate_ref: null, match_count_in_range: 14,
  last_matched_at: new Date(Date.now() - 2 * 3600000).toISOString(), feedback_up: 9, feedback_down: 1, days: days.map((day, index) => ({ ...day, matches: index % 3 ? index : 0 })),
};

test('skill rows: candidate, removed digest, draft, active, disabled and retired variants; strings are escaped', () => {
  const context = skillsContext();
  const render = (item, mode) => vm.runInContext(`renderSkillRowBody(${JSON.stringify(item)}, ${JSON.stringify(mode)})`, context);
  const row = render(candidate, 'source');
  assert.match(row, /data-icon="sparkle"/);
  assert.match(row, />Oct 23 digest</);
  assert.match(row, /class="sklSteps"[^>]*>4</);
  assert.match(row, /data-skill-action="promote"[^>]*>Promote</);
  assert.match(row, />harbor-sync</);
  assert.doesNotMatch(row, /\/work\/|project_path/);
  assert.match(render({ ...candidate, source_digest: { id: 'dg_1', covered_day: null } }, 'source'), /sklSource is-removed"[^>]*>Digest removed</);
  assert.match(render({ ...candidate, source: 'manual', source_digest: null }, 'source'), />Manual</);
  const draft = render({ ...candidate, id: 'sk_9', kind: 'skill', stored_status: 'draft' }, 'source');
  assert.match(draft, /sklChip is-draft[^>]*>.*Draft</);
  assert.match(draft, /data-skill-action="enable"[^>]*>Enable</);
  assert.doesNotMatch(draft, /data-skill-action="promote"/);
  const live = render(active, 'matches');
  assert.match(live, /data-icon="star"/);
  assert.match(live, /sklMatchNum">14</);
  assert.equal((live.match(/sklSparkBar/g) || []).length, 14);
  assert.match(live, /last matched 2h ago/);
  assert.match(live, /data-icon="thumbUp"[\s\S]*?>9</);
  assert.match(live, /data-skill-action="disable"[^>]*>Disable</);
  assert.doesNotMatch(live, /sklSource|sklSteps/);
  assert.match(render({ ...active, status: 'disabled', stored_status: 'disabled' }, 'matches'), /data-skill-action="enable"/);
  const retired = render({ ...active, status: 'retired', stored_status: 'retired', last_matched_at: null }, 'matches');
  assert.match(retired, /data-skill-action="reenable"[^>]*>Re-enable</);
  assert.match(retired, /Not matched yet/);
  const evil = render({ ...candidate, name: hostile, summary: hostile, display_name: hostile, id: hostile }, 'source');
  assert.doesNotMatch(evil, /<img/);
  assert.match(evil, /&lt;img src=x onerror=alert\(1\)&gt;/);
  vm.runInContext(`state.skills.notes["c_dg_100_0"] = { tone: "ok", text: t("skills.notePromoted") };`, context);
  assert.match(render(candidate, 'source'), /sklRowNote is-ok">Promoted to draft\. Enable it to start matching\./);
});

test('write buttons stay visible but inert while writes are off', () => {
  const context = skillsContext(false);
  const row = vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context);
  assert.match(row, /data-skill-action="promote"[^>]*aria-disabled="true"/);
  assert.match(row, /title="Writing is off\. Turn Write on to change skills\."/);
  const foot = vm.runInContext(`renderSkillDrawerFoot(${JSON.stringify(candidate)})`, context);
  assert.match(foot, /sklFootNote is-info/);
  assert.match(foot, /aria-disabled="true"/);
});

test('skill drawer: candidate body, active body with feedback form, action bar per variant, no score', () => {
  const context = skillsContext();
  const body = (payload) => vm.runInContext(`renderSkillDrawerBody(${JSON.stringify(payload)})`, context);
  const foot = (item) => vm.runInContext(`renderSkillDrawerFoot(${JSON.stringify(item)})`, context);
  const cand = body({ skill: { ...candidate, trigger: 'Before tagging a release', steps: ['npm run build', 'Tag the release'], tags: [] }, recent_matches: [], recent_feedback: [] });
  assert.match(cand, /Confidence 0\.82/);
  assert.match(cand, />Before tagging a release</);
  assert.match(cand, /<ol class="sklStepList"><li>npm run build<\/li><li>Tag the release<\/li><\/ol>/);
  assert.equal((cand.match(/class="prjBar[ "]/g) || []).length, 14);
  assert.match(cand, /No matches yet\. Candidates match once enabled\./);
  assert.match(cand, />None yet</);
  assert.match(cand, />0 up</);
  assert.match(cand, />0 down</);
  assert.match(cand, /Available after enabling/);
  assert.doesNotMatch(cand, /sklRecord/);
  assert.doesNotMatch(body({ skill: { ...candidate, confidence: null }, recent_matches: [], recent_feedback: [] }), /Confidence/);
  // The list copy (no trigger, no steps) after a promote 404 still renders.
  assert.doesNotMatch(body({ skill: candidate, recent_matches: [], recent_feedback: [] }), /Trigger|sklStepList/);
  const live = body({ skill: { ...active, trigger: null, steps: [], tags: [] },
    recent_matches: [{ review_id: 'rv_1', at: new Date(Date.now() - 2 * 3600000).toISOString(), task: 'Prepare 0.9.2 release', agent_id: 'claude-code', recommendation_state: 'recommended', score: null }],
    recent_feedback: [{ outcome: 'success', at: new Date().toISOString(), task: 'Cut 0.9.1', notes: hostile }] });
  assert.match(live, /No trigger recorded/);
  assert.match(live, /No steps recorded/);
  assert.match(live, /Prepare 0\.9\.2 release/);
  assert.match(live, />claude-code</);
  assert.match(live, /sklRecord/);
  assert.match(live, /data-skill-outcome="success" aria-pressed="true"/);
  assert.match(live, /data-skill-action="feedback"[^>]*>Record</);
  assert.match(live, /sklOutcomeTag is-success/);
  assert.doesNotMatch(live, /Available after enabling|score|<img|\/work\//);
  const quietLive = body({ skill: { ...active, days }, recent_matches: [], recent_feedback: [] });
  assert.match(quietLive, /No matches in the last 14 days/);
  assert.match(quietLive, /No feedback recorded yet/);

  assert.match(foot(candidate), /data-skill-action="promote"[^>]*>Promote</);
  assert.match(foot({ ...candidate, kind: 'skill', stored_status: 'draft' }), /data-skill-action="enable"/);
  const activeFoot = foot(active);
  assert.match(activeFoot, /data-skill-action="disable"/);
  assert.match(activeFoot, /data-skill-action="retire"/);
  const disabledFoot = foot({ ...active, status: 'disabled' });
  assert.match(disabledFoot, /data-skill-action="enable"/);
  assert.match(disabledFoot, /data-skill-action="retire"/);
  assert.match(foot({ ...active, status: 'retired' }), /data-skill-action="reenable"/);
  for (const html of [activeFoot, foot(candidate)]) {
    assert.match(html, /data-nav-target="devToolsView" data-dev-panel="proceduralSkillsPanel"/);
    assert.match(html, /Open in dev panel/);
  }
});

test('skill writes: confirm before disable or retire, no delete, writes-off stays put, promote sends the candidate fields', () => {
  const skillsCode = uiScript.slice(uiScript.indexOf('// ---------- Skills ----------'), uiScript.indexOf('// ---------- Projects ----------'));
  const handle = uiClientFunction('handleSkillAction');
  assert.match(handle, /action === "disable" \|\| action === "retire"\) \{\s*setSkillConfirm\(\{ id, action \}, button\);\s*return;/);
  assert.doesNotMatch(handle.slice(0, handle.indexOf('setSkillConfirm')), /runSkillAction|fetchJson/);
  const bind = uiClientFunction('bindSkillEvents');
  assert.match(bind, /#sklConfirmCancel[\s\S]{0,80}setSkillConfirm\(null\)/);
  assert.match(bind, /#sklConfirmGo[\s\S]{0,160}runSkillAction\(confirm\.id, confirm\.action\)/);
  assert.match(bind, /state\.skills\.confirm && event\.key === "Escape"[\s\S]{0,120}setSkillConfirm\(null\)/);
  assert.match(bind, /state\.skills\.confirm && !els\.sklConfirm\.contains\(event\.target\)\) setSkillConfirm\(null\)/);
  assert.doesNotMatch(skillsCode, /\/admin\/api\/skills\/delete|data-skill-action="delete"|skills\.actionDelete/);
  assert.doesNotMatch(skillsSection(), /data-skill-action="delete"|Delete skill/);
  const rejected = uiClientFunction('skillWriteRejected');
  assert.match(rejected, /payload\.success === false && payload\.disabled/);
  assert.match(rejected, /payload\.message \|\| t\("skills\.writesOffTitle"\)/);
  assert.match(rejected, /payload\.success === false/);
  for (const name of ['runSkillAction', 'recordSkillFeedback']) {
    const fn = uiClientFunction(name);
    const gate = fn.indexOf('if (skillWriteRejected(id, payload)) return;');
    const refresh = fn.indexOf('refreshSkillAfterWrite(');
    assert.ok(gate >= 0 && refresh > gate, `${name} shows a writes-off or failed payload before any refresh`);
  }
  assert.match(uiClientFunction('runSkillAction'), /body = \{ project_path: item\.project_path, local_date: ref\.local_date, candidate_index: ref\.candidate_index \}/);
  assert.match(uiClientFunction('runSkillAction'), /"\/admin\/api\/skills\/promote-candidate"/);
  assert.match(uiClientFunction('runSkillAction'), /if \(action === "promote" && \(skl\.promoted \|\| \{\}\)\[id\]\) return;/);
  assert.match(uiClientFunction('runSkillAction'), /if \(!item \|\| skl\.pending\[id\] \|\| skillWritePending\(\)\) return;/);
  assert.match(uiClientFunction('recordSkillFeedback'), /body = \{ skill_id: id, project_path: item\.project_path, outcome: record\.outcome \}/);
  assert.match(uiClientFunction('refreshSkillAfterWrite'), /loadSkills\("reset"\)/);
  assert.match(uiClientFunction('refreshSkillAfterWrite'), /await loadSkills\("reset"\)/);
  assert.match(uiClientFunction('refreshSkillAfterWrite'), /\(forceOpen \|\| drawer\.skill === previousId\) \? nextId : drawer\.skill/);
});

test('list and detail stay on the newest request, a missing skill is quiet, and the dev panel is preset without rendering the path', () => {
  assert.match(uiScript, /const SKILL_PAGE = 50;/);
  assert.match(uiScript, /const SKILL_SEARCH_DEBOUNCE_MS = 250;/);
  assert.match(uiClientFunction('renderSkillList'), /skills\.countOf/);
  assert.match(uiClientFunction('renderSkillList'), /els\.sklLoadMore/);
  assert.match(uiClientFunction('closeMemoryDrawer'), /drawer\.seq \+= 1/);
  const open = uiClientFunction('openSkillDrawer');
  assert.match(open, /const seq = drawer\.seq \+ 1;/);
  assert.match(open, /if \(seq !== drawer\.seq\) return;/);
  assert.match(open, /drawer\.skillError = "missing"/);
  assert.match(open, /state\.skills\.banner = t\("skills\.notFound"\)/);
  assert.match(open, /closeMemoryDrawer\(false\)/);
  const policy = uiClientFunction('applyReadPolicyToViews');
  assert.match(policy, /state\.skills \|\| \{/);
  assert.match(policy, /if \(state\.skills\)/);
  assert.match(policy, /skl\.seq \+= 1/);
  assert.match(policy, /drawer\.seq \+= 1/);
  assert.match(policy, /els\.sklList\.innerHTML = ""/);
  assert.match(policy, /if \(state\.activeView === "skillsView"\) void loadSkills\("reset"\)/);
  const preset = uiClientFunction('presetProceduralFromSkill');
  assert.match(preset, /option\.value === path/);
  assert.match(preset, /proceduralStatusFilter/);
  assert.match(preset, /proceduralLocalDateInput/);
  assert.match(preset, /state\.devToolsLoaded/);
  assert.match(preset, /loadProceduralWorkspaceData\(\)/);
  assert.doesNotMatch(preset, /innerHTML|setAttribute|clipboard|href|\btitle\b|dispatchEvent|appendChild|options\.add/);
  assert.match(uiClientFunction('bindSkillEvents'), /closest\("\.sklDevLink"\)[\s\S]{0,80}presetProceduralFromSkill\(skillDrawerItem\(\)\)/);
  assert.doesNotMatch(uiClientFunction('bindSkillEvents'), /sklDevLink[\s\S]{0,120}stopPropagation/);
  const events = uiClientFunction('bindEvents');
  const nav = events.slice(events.indexOf('[data-nav-target]'));
  assert.ok(nav.indexOf('setDevToolsEnabled(true, true)') >= 0 && nav.indexOf('setDevToolsEnabled(true, true)') < nav.indexOf('activateView('));
  assert.match(uiClientFunction('renderSkillDrawerFoot'), /data-requires-dev-tools="true"/);
  assert.equal(ADMIN_UI_TRANSLATIONS.en['skills.notFound'], 'Skill not found');
  assert.equal(ADMIN_UI_TRANSLATIONS['zh-CN']['skills.notFound'], '未找到技能');
});

test('server strings in a skill row and drawer are escaped, including a writes-off note', () => {
  const context = skillsContext();
  const hostileNote = 'Writes are off <img src=x onerror=alert(1)>';
  vm.runInContext(`state.skills.notes[${JSON.stringify(candidate.id)}] = { tone: "info", text: ${JSON.stringify(hostileNote)} };`, context);
  const row = vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context);
  assert.match(row, /Writes are off &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(row, /<img|\/work\/|project_path/);
  const body = vm.runInContext(`renderSkillDrawerBody(${JSON.stringify({
    skill: { ...candidate, trigger: hostile, steps: [hostile, { text: hostile }] },
    recent_matches: [{ at: null, task: hostile, agent_id: hostile }],
    recent_feedback: [],
  })})`, context);
  assert.doesNotMatch(body, /<img|\/work\//);
  assert.ok((body.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) || []).length >= 4);
});

test('Skills joins the shared glass tokens in light and dark and docks the drawer only at 1440px', () => {
  assert.match(ADMIN_UI_THEME, /\.skillsView,\s*\.projectsView,\s*\.activityView,/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.skillsView,\s*html\[data-glass="dark"\] \.projectsView,/);
  assert.match(ADMIN_UI_THEME, /\.skillsView,\s*\.projectsView,\s*\.digestsView \{\s*--d-glass:/);
  assert.match(ADMIN_UI_THEME, /html\[data-glass="dark"\] \.skillsView,\s*html\[data-glass="dark"\] \.projectsView,\s*html\[data-glass="dark"\] \.digestsView \{\s*--d-glass:/);
  assert.match(ADMIN_UI_THEME, /\.skillsView\.is-active,/);
  assert.match(ADMIN_UI_THEME, /@media \(min-width: 1440px\) \{\s*\.skillsView\.is-drawer-open \.prjBoard \{/);
  assert.match(ADMIN_UI_THEME, /\.skillsView\.is-drawer-open \.sklCard \{\s*--skl-cols: 40px minmax\(0, 1fr\)/);
  assert.match(ADMIN_UI_THEME, /\.skillsView\.is-drawer-open \.sklProjectChip \{[^}]*max-width:\s*100%/);
  // Icons stay blue or neutral: no per-project hue on the Skills page.
  assert.doesNotMatch(uiClientFunction('renderSkillRowBody'), /projectHue|data-hue/);
  assert.doesNotMatch(uiClientFunction('renderSkillIcon'), /projectHue|data-hue/);
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
});

function skillsWriteHarness() {
  const item = {
    id: candidate.id,
    kind: 'digest_candidate',
    name: candidate.name,
    status: 'candidate',
    stored_status: null,
    project_path: '/work/harbor-sync',
    candidate_ref: { local_date: '2026-10-23', candidate_index: 0 },
  };
  const gate = { fetch: null, load: null };
  const opens = [];
  const posts = [];
  const context = vm.createContext({
    posts,
    opens,
    gate,
    state: {
      skills: {
        status: 'candidate',
        days: 30,
        items: [item],
        pending: {},
        promoted: {},
        notes: {},
        readsDisabled: false,
      },
      drawer: {
        host: '',
        skill: '',
        skillPayload: null,
        skillItem: null,
        skillRecord: { outcome: 'success', notes: '' },
        readsDisabled: false,
      },
    },
  });
  vm.runInContext(`
    const SKILL_STATUS_WRITES = { enable: ["enabled", "skills.noteEnabled"], reenable: ["enabled", "skills.noteEnabled"], disable: ["disabled", "skills.noteDisabled"], retire: ["retired", "skills.noteRetired"] };
    function t(key) { return key; }
    function skillWritesOff() { return false; }
    function skillWritePending() {
      const pending = state.skills.pending || {};
      return Object.keys(pending).some((key) => pending[key]);
    }
    function findSkillItem(id) {
      return state.skills.items.find((entry) => String(entry.id) === id) || null;
    }
    function skillDrawerItem() {
      const drawer = state.drawer;
      if (!drawer.skill) return null;
      if (drawer.skillPayload && drawer.skillPayload.skill) return drawer.skillPayload.skill;
      return findSkillItem(drawer.skill) || drawer.skillItem;
    }
    function setSkillNote(id, tone, text) { if (id) state.skills.notes[id] = { tone, text }; }
    function skillWriteRejected(_id, payload) { return !!(payload && payload.success === false); }
    function renderSkills() { state.renders = (state.renders || 0) + 1; }
    function fetchJson(url, options) {
      posts.push({ url, body: JSON.parse(options.body) });
      return new Promise((resolve, reject) => { gate.fetch = { resolve, reject }; });
    }
    function loadSkills() {
      return new Promise((resolve) => { gate.load = resolve; });
    }
    function openSkillDrawer(id) { opens.push(id); }
    ${uiClientFunction('refreshSkillAfterWrite')}
    ${uiClientFunction('runSkillAction')}
  `, context);
  return { context, gate, opens, posts };
}

async function settleGate(gate, key) {
  for (let step = 0; step < 30 && !gate[key]; step += 1) await Promise.resolve();
  assert.ok(gate[key], `expected ${key} to be pending`);
}

test('a second Promote for the same candidate is ignored until the list refresh', async () => {
  const { context, gate, opens, posts } = skillsWriteHarness();
  const first = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, context);
  const inFlight = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, context);
  assert.equal(context.state.skills.pending[candidate.id], 'promote');
  assert.equal(posts.length, 1);
  await settleGate(gate, 'fetch');
  gate.fetch.resolve({ success: true, skill: { id: 'sk_new' } });
  await settleGate(gate, 'load');
  assert.equal(context.state.skills.promoted[candidate.id], 'sk_new');
  assert.equal(context.state.skills.items[0].id, 'sk_new');
  assert.equal(context.state.skills.items[0].kind, 'skill');
  assert.equal(context.state.skills.items[0].stored_status, 'draft');
  assert.equal(context.state.skills.pending[candidate.id], 'promote');
  const afterSuccess = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, context);
  gate.load();
  await first;
  await inFlight;
  await afterSuccess;
  const afterRefresh = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, context);
  await afterRefresh;
  assert.equal(posts.length, 1);
  assert.equal(context.state.skills.pending[candidate.id], undefined);
  assert.deepEqual(opens, ['sk_new']);
  assert.equal(context.state.skills.notes.sk_new.tone, 'ok');
});

test('promoting from a row opens the drawer on the new draft, or the candidate id when the response has no id', async () => {
  const withId = skillsWriteHarness();
  const fromRow = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, withId.context);
  await settleGate(withId.gate, 'fetch');
  withId.gate.fetch.resolve({ success: true, skill: { id: 'sk_row' } });
  await settleGate(withId.gate, 'load');
  assert.deepEqual(withId.opens, ['sk_row']);
  withId.gate.load();
  await fromRow;

  const fromDrawer = skillsWriteHarness();
  fromDrawer.context.state.drawer.host = 'skillsView';
  fromDrawer.context.state.drawer.skill = candidate.id;
  fromDrawer.context.state.drawer.skillItem = fromDrawer.context.state.skills.items[0];
  const drawerPromote = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, fromDrawer.context);
  await settleGate(fromDrawer.gate, 'fetch');
  fromDrawer.gate.fetch.resolve({ success: true, skill: { id: 'sk_drawer' } });
  await settleGate(fromDrawer.gate, 'load');
  assert.deepEqual(fromDrawer.opens, ['sk_drawer']);
  fromDrawer.gate.load();
  await drawerPromote;

  const fallback = skillsWriteHarness();
  const noId = vm.runInContext(`runSkillAction(${JSON.stringify(candidate.id)}, "promote")`, fallback.context);
  await settleGate(fallback.gate, 'fetch');
  fallback.gate.fetch.resolve({ success: true, skill: {} });
  await settleGate(fallback.gate, 'load');
  assert.deepEqual(fallback.opens, [candidate.id]);
  fallback.gate.load();
  await noId;
});

test('row and drawer signatures include the global write-pending state so sibling actions re-enable', () => {
  assert.match(uiClientFunction('syncSkillRows'), /const signature = \[state\.locale, skl\.days, mode, off, skillWritePending\(\)/);
  assert.match(uiClientFunction('skillDrawerSignature'), /state\.skills\.pending\[id\] \|\| "", skillWritePending\(\)/);
  const context = skillsContext();
  const before = vm.runInContext('skillDrawerSignature()', context);
  const rowBefore = vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context);
  assert.doesNotMatch(rowBefore, /aria-disabled="true"/);
  vm.runInContext('state.skills.pending.other = "enable";', context);
  const during = vm.runInContext('skillDrawerSignature()', context);
  const rowDuring = vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context);
  assert.notEqual(during, before);
  assert.match(rowDuring, /aria-disabled="true"/);
  vm.runInContext('state.skills.pending = {};', context);
  const after = vm.runInContext('skillDrawerSignature()', context);
  const rowAfter = vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context);
  assert.equal(after, before);
  assert.doesNotMatch(rowAfter, /aria-disabled="true"/);
  vm.runInContext(`state.skills.promoted[${JSON.stringify(candidate.id)}] = "sk_new";`, context);
  assert.match(vm.runInContext(`renderSkillRowBody(${JSON.stringify(candidate)}, "source")`, context), /aria-disabled="true"/);
});
