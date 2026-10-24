import { ADMIN_UI_WALLPAPERS } from './admin-ui-theme';

// 24px line icons (1.6 stroke), inlined so the page stays asset-free.
export const ADMIN_UI_ICONS: Record<string, string> = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  activity: '<path d="M3 17.5 9 11.5l4 4 8-8.5"/><path d="M16 7h5v5"/>',
  memory: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13"/><path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8"/>',
  pipeline: '<circle cx="12" cy="5" r="2.2"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/><path d="M12 7.2v4.3m0 0-5 5m5-5 5 5"/>',
  digests: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  projects: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2.2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  skills: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
  tag: '<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7l8.3 8.3a2 2 0 0 1 0 2.8l-5.9 5.9a2 2 0 0 1-2.8 0z"/><circle cx="8" cy="8" r="1.3"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M6.5 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V8H18"/>',
  facts: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  review: '<path d="M5.5 4.5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h-1a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><path d="m9 10.5 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  chevronUpDown: '<path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  chevronRight: '<path d="m10 7 5 5-5 5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  warning: '<path d="M10.3 4.2 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17.2" r="0.6"/>',
  retry: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.8 3.5v3.6h-3.6M6.2 20.5v-3.6h3.6"/>',
  segments: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="17.5" r="1.1"/>',
  evidence: '<path d="M6.5 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="m9 13.5 2 2 4-4"/>',
  external: '<path d="M13.5 4.5h6v6"/><path d="M19.5 4.5 11 13"/><path d="M17.5 14v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4"/>',
  chevronLeft: '<path d="m14 7-5 5 5 5"/>',
  llm: '<path d="M11 3.5 12.9 8.6 18 10.5l-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z"/><path d="m18 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  digestDoc: '<path d="M7 3.5h7.2l4.3 4.3v11.7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M9.2 12h5.6M9.2 15.5h5.6"/>',
  moon: '<path d="M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  layers: '<path d="m12 4 8.5 4.3L12 12.6 3.5 8.3z"/><path d="m3.5 12.2 8.5 4.3 8.5-4.3"/><path d="m3.5 16 8.5 4.3 8.5-4.3"/>',
  minus: '<path d="M7.5 12h9"/>',
};

export function renderAdminIcon(name: string, className: string = 'icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ADMIN_UI_ICONS[name] || ''}</svg>`;
}

// Primary sections of the sidebar, in order. Each target is an .appView section below.
export const ADMIN_UI_NAV_ITEMS: Array<{ id: string; target: string; key: string; label: string; icon: string }> = [
  { id: 'navHome', target: 'homeView', key: 'nav.home', label: 'Home', icon: 'home' },
  { id: 'navActivity', target: 'activityView', key: 'nav.activity', label: 'Activity', icon: 'activity' },
  { id: 'navMemory', target: 'memoryView', key: 'nav.memory', label: 'Memory', icon: 'memory' },
  { id: 'navPipeline', target: 'pipelineView', key: 'nav.pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'navDigests', target: 'digestsView', key: 'nav.digests', label: 'Digests & Reviews', icon: 'digests' },
  { id: 'navProjects', target: 'projectsView', key: 'nav.projects', label: 'Projects', icon: 'projects' },
  { id: 'navSkills', target: 'skillsView', key: 'nav.skills', label: 'Skills', icon: 'skills' },
  { id: 'navSettings', target: 'settingsView', key: 'nav.settings', label: 'Settings', icon: 'settings' },
];

// Legacy workbench panels, kept intact under Developer tools (ids and copy are covered by tests).
export const ADMIN_UI_DEV_PANELS: Array<{ id: string; panel: string; key: string; label: string }> = [
  { id: 'navDevRuntime', panel: 'runtimePanel', key: 'tabs.runtime', label: 'Runtime' },
  { id: 'navDevProceduralSkills', panel: 'proceduralSkillsPanel', key: 'tabs.proceduralSkills', label: 'Procedural Skills' },
  { id: 'navDevLlmSettings', panel: 'llmSettingsPanel', key: 'tabs.llmSettings', label: 'LLM Settings' },
  { id: 'navDevProjectContext', panel: 'projectContextPanel', key: 'tabs.projectContext', label: 'Project Context' },
  { id: 'navDevStateLab', panel: 'stateLabPanel', key: 'tabs.stateLab', label: 'State Lab' },
  { id: 'navDevSearchDiagnostics', panel: 'searchDiagnosticsPanel', key: 'tabs.searchDiagnostics', label: 'Search Diagnostics' },
  { id: 'navDevObservationLedger', panel: 'observationLedgerPanel', key: 'tabs.observationLedger', label: 'Observation Ledger' },
];

// The five Home health cards, in ring order (clockwise from 12 o'clock). The ring derives each segment's state
// from the matching card, so the two never disagree.
export const ADMIN_UI_HEALTH_CHECKS: Array<{ key: string; id: string; card: string; labelKey: string; label: string }> = [
  { key: 'worker', id: 'homeHealthRingWorker', card: 'homeWorkerCard', labelKey: 'home.workerLabel', label: 'Worker' },
  { key: 'queue', id: 'homeHealthRingQueue', card: 'homeQueueCard', labelKey: 'home.queueLabel', label: 'Queue' },
  { key: 'llm', id: 'homeHealthRingLlm', card: 'homeLlmCard', labelKey: 'home.llmLabel', label: 'LLM today' },
  { key: 'digest', id: 'homeHealthRingDigest', card: 'homeDigestCard', labelKey: 'home.digestLabel', label: 'Last digest' },
  { key: 'vault', id: 'homeHealthRingVault', card: 'homeVaultCard', labelKey: 'home.vaultLabel', label: 'Vault review' },
];

const PLACEHOLDER_VIEWS: Array<{ id: string; icon: string; titleKey: string; title: string; leadKey: string; lead: string }> = [
  { id: 'projectsView', icon: 'projects', titleKey: 'nav.projects', title: 'Projects', leadKey: 'shell.projectsLead', lead: 'Every project with its startup context, state facts, digests and skills.' },
  { id: 'skillsView', icon: 'skills', titleKey: 'nav.skills', title: 'Skills', leadKey: 'shell.skillsLead', lead: 'Procedural skills, digest candidates and how often post-task reviews matched them.' },
];

const BRAND_MARK = `<svg class="brandMark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="amMarkTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe6ff"/><stop offset="1" stop-color="#63b3ff"/></linearGradient>
    <linearGradient id="amMarkLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#1b5fd8"/></linearGradient>
    <linearGradient id="amMarkRight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa7ff"/><stop offset="1" stop-color="#2f78ee"/></linearGradient>
  </defs>
  <path d="M16 3.6 27 9.6 16 15.6 5 9.6z" fill="url(#amMarkTop)" stroke="url(#amMarkTop)" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M5 9.6 16 15.6V28.2L5 22.2z" fill="url(#amMarkLeft)" stroke="url(#amMarkLeft)" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M27 9.6 16 15.6V28.2l11-6z" fill="url(#amMarkRight)" stroke="url(#amMarkRight)" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M16 3.6 27 9.6 16 15.6 5 9.6z" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="0.7" stroke-linejoin="round"/>
</svg>`;

// Group labels shown above the first item of each sidebar group.
const NAV_GROUP_LABELS: Record<string, { key: string; label: string }> = {
  navHome: { key: 'nav.groupOverview', label: 'Overview' },
  navProjects: { key: 'nav.groupLibrary', label: 'Library' },
};

function renderSidebar(): string {
  const navItems = ADMIN_UI_NAV_ITEMS.map((item, index) => `${NAV_GROUP_LABELS[item.id] ? `
        <p class="navGroupLabel" data-i18n="${NAV_GROUP_LABELS[item.id].key}">${NAV_GROUP_LABELS[item.id].label}</p>` : ''}
        <button class="navItem${index === 0 ? ' is-active' : ''}" id="${item.id}" type="button" data-nav-target="${item.target}" data-i18n-title="${item.key}" title="${item.label}"${index === 0 ? ' aria-current="page"' : ''}>
          ${renderAdminIcon(item.icon, 'navIcon')}<span class="navLabel" data-i18n="${item.key}">${item.label}</span>
        </button>`).join('');
  const devItems = ADMIN_UI_DEV_PANELS.map((item) => `
          <button class="navItem navSubItem" id="${item.id}" type="button" data-nav-target="devToolsView" data-dev-panel="${item.panel}">
            <span class="navBullet" aria-hidden="true"></span><span class="navLabel" data-i18n="${item.key}">${item.label}</span>
          </button>`).join('');
  return `
    <aside class="sidebar glassSurface glassBlur" id="appSidebar">
      <div class="brand">${BRAND_MARK}<span class="brandName">AgentMemory</span></div>
      <nav class="sideNav" id="sideNav" data-i18n-aria-label="shell.navLabel" aria-label="Sections">${navItems}
        <div class="navGroup" id="devToolsNavGroup" hidden>
          <button class="navItem navGroupHead" id="navDevTools" type="button" data-nav-target="devToolsView" data-i18n-title="nav.devTools" title="Developer tools">
            ${renderAdminIcon('terminal', 'navIcon')}<span class="navLabel" data-i18n="nav.devTools">Developer tools</span>
          </button>${devItems}
        </div>
      </nav>
      <div class="sidebarFooter">
        <button class="sidebarRow bgPickerButton" id="bgPickerButton" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="bgPopover" data-i18n-title="bg.open" title="Change the background">
          ${renderAdminIcon('image', 'navIcon')}
          <span class="devToggleLabel" data-i18n="bg.title">Background</span>
          <span class="bgSwatch" id="bgSwatch" aria-hidden="true"></span>
        </button>
        <label class="devToggle" for="devToolsToggle" data-i18n-title="shell.devToolsToggleHint" title="Show the legacy workbench panels">
          ${renderAdminIcon('terminal', 'navIcon')}
          <span class="devToggleLabel" data-i18n="shell.devToolsToggle">Developer tools</span>
          <span class="iosSwitch"><input id="devToolsToggle" type="checkbox" role="switch" /><span class="track" aria-hidden="true"></span></span>
        </label>
      </div>
    </aside>`;
}

function renderRange(id: string, labelKey: string, label: string, min: number, max: number): string {
  return `
          <div class="bgField">
            <label class="bgFieldLabel" for="${id}Input" data-i18n="${labelKey}">${label}</label>
            <input class="bgRange" id="${id}Input" type="range" min="${min}" max="${max}" step="1" />
            <output class="bgFieldValue" id="${id}Value" for="${id}Input"></output>
          </div>`;
}

// Background picker. A sibling of the sidebar rather than a child: the sidebar's backdrop-filter makes it a
// backdrop root, so a popover inside it could only frost the sidebar itself, not the page behind.
function renderBackgroundPopover(): string {
  const thumbPanes = '<i class="bgPane bgPaneSide"></i><i class="bgPane bgPaneTop"></i><i class="bgPane bgPaneMain"></i>';
  const presets = ADMIN_UI_WALLPAPERS.map((preset) => `
          <button class="bgTile" id="bgPreset${preset.label}" type="button" data-bg-preset="${preset.id}" aria-pressed="false">
            <span class="bgThumb" data-wall="${preset.id}">${thumbPanes}</span>
            <span class="bgTileLabel" data-i18n="${preset.key}">${preset.label}</span>
          </button>`).join('');
  return `
    <section class="bgPopover" id="bgPopover" role="dialog" aria-labelledby="bgPopoverTitle" hidden>
      <header class="bgHead">
        <div>
          <h2 class="bgTitle" id="bgPopoverTitle" data-i18n="bg.title">Background</h2>
          <p class="bgLead" data-i18n="bg.lead">Presets, or your own image</p>
        </div>
        <button class="bgClose" id="bgPopoverClose" type="button" data-i18n-aria-label="bg.close" aria-label="Close">${renderAdminIcon('close', 'bgCloseIcon')}</button>
      </header>
      <div class="bgTiles" id="bgPresetList" role="group" data-i18n-aria-label="bg.presetsLabel" aria-label="Wallpaper">${presets}
        <button class="bgTile" id="bgPresetCustom" type="button" data-bg-preset="custom" aria-pressed="false" hidden>
          <span class="bgThumb bgThumbCustom">${thumbPanes}</span>
          <span class="bgTileLabel" data-i18n="bg.customImage">My image</span>
        </button>
        <button class="bgTile bgUploadTile" id="bgUploadButton" type="button">
          <span class="bgThumb bgThumbUpload">${renderAdminIcon('plus', 'bgPlusIcon')}<span data-i18n="bg.upload">Upload</span></span>
          <span class="bgTileLabel" data-i18n="bg.uploadLabel">Custom image</span>
        </button>
        <input class="visuallyHidden" id="bgUploadInput" type="file" accept="image/*" tabindex="-1" aria-hidden="true" />
      </div>
      <div class="bgFields">
        <div class="bgField">
          <span class="bgFieldLabel" id="bgToneLabel" data-i18n="bg.tone">Glass tone</span>
          <div class="bgSegmented" id="bgToneControl" role="group" aria-labelledby="bgToneLabel">
            <button class="bgSegment" type="button" data-bg-tone="auto" aria-pressed="true" data-i18n="bg.toneAuto">Auto</button>
            <button class="bgSegment" type="button" data-bg-tone="light" aria-pressed="false" data-i18n="bg.toneLight">Light</button>
            <button class="bgSegment" type="button" data-bg-tone="dark" aria-pressed="false" data-i18n="bg.toneDark">Dark</button>
          </div>
        </div>${renderRange('bgBlur', 'bg.blur', 'Wallpaper blur', 0, 40)}${renderRange('bgDim', 'bg.dim', 'Dim', 0, 60)}${renderRange('bgOpacity', 'bg.opacity', 'Glass opacity', 10, 80)}
      </div>
      <footer class="bgFoot">
        <span class="bgStatus" id="bgStatus" role="status" aria-live="polite">Saved on this browser · text adapts to the wallpaper</span>
        <span class="bgActions">
          <button class="bgButton" id="bgResetButton" type="button" data-i18n="bg.reset">Reset</button>
          <button class="bgButton is-primary" id="bgDoneButton" type="button" data-i18n="bg.done">Done</button>
        </span>
      </footer>
    </section>`;
}

// Health ring: a frosted disc with a status glyph and five arc segments, one per health check.
function renderHealthRing(): string {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const slot = circumference / ADMIN_UI_HEALTH_CHECKS.length;
  const gap = 7;
  const dash = slot - gap;
  const segments = ADMIN_UI_HEALTH_CHECKS.map((check, index) => `
                <circle class="ringSeg" id="${check.id}" data-check="${check.key}" data-state="unknown" cx="50" cy="50" r="${radius}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-(index * slot) - gap / 2).toFixed(2)}"><title>${check.label}</title></circle>`).join('');
  return `
            <div class="healthRing" id="homeHealthRing" data-tone="unknown" role="img" aria-label="Health checks">
              <span class="ringGlow" aria-hidden="true"></span>
              <span class="ringDisc" aria-hidden="true"></span>
              <svg class="ringArcs" viewBox="0 0 100 100" focusable="false">
                <defs><linearGradient id="amRingGradient" x1="0" y1="0" x2="1" y2="1"><stop class="ringStopA" offset="0"/><stop class="ringStopB" offset="1"/></linearGradient></defs>${segments}
              </svg>
              <svg class="ringGlyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path class="glyphOk" d="M5 12.5l4.2 4.2L19 7"/>
                <g class="glyphWarn"><path d="M12 6v8"/><circle cx="12" cy="18.2" r="1.3"/></g>
                <path class="glyphError" d="M7 7l10 10M17 7L7 17"/>
              </svg>
            </div>`;
}

function renderTopBar(): string {
  return `
      <header class="topBar">
        <h1 id="pageTitle" class="pageTitle" data-i18n="nav.home">Home</h1>
        <div class="topActions">
          <!-- One compact pill holds both switches; the state word only shows when a switch is off or saving. -->
          <div class="policyGroup glassPill" id="policyGroup" role="group" data-i18n-aria-label="shell.policyGroup" aria-label="Memory access">
            <label id="readPolicyCard" class="policyPill readPolicy" for="readToggle">
              <span class="pillDot" aria-hidden="true"></span>
              <span class="pillLabel" data-i18n="shell.read">Read</span>
              <span id="readPolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
              <input id="readToggle" class="visuallyHidden" type="checkbox" role="switch" />
            </label>
            <label id="writePolicyCard" class="policyPill writePolicy" for="writeToggle">
              <span class="pillDot" aria-hidden="true"></span>
              <span class="pillLabel" data-i18n="shell.write">Write</span>
              <span id="writePolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
              <input id="writeToggle" class="visuallyHidden" type="checkbox" role="switch" />
            </label>
          </div>
          <!-- Language listbox: the trigger's name is the label plus the current language, not a menu. -->
          <div id="localeToggle" class="localeMenu">
            <button class="localeTrigger glassPill" id="localeMenuButton" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="localeMenuList">
              <span class="visuallyHidden" data-i18n="locale.label">UI Language</span>
              <span class="localeTriggerValue" id="localeMenuValue">EN</span>${renderAdminIcon('chevronDown', 'localeTriggerIcon')}
            </button>
            <div class="localeList" id="localeMenuList" role="listbox" data-i18n-aria-label="locale.label" aria-label="UI Language" hidden>
              <button class="localeButton is-active" type="button" role="option" aria-selected="true" data-locale-choice="en"><span class="localeCode">EN</span><span class="localeName">English</span></button>
              <button class="localeButton" type="button" role="option" aria-selected="false" data-locale-choice="zh-CN"><span class="localeCode">中文</span><span class="localeName">简体中文</span></button>
            </div>
          </div>
        </div>
      </header>
      <div id="policyBanner" class="policyBanner" role="status" hidden>
        ${renderAdminIcon('pause', 'bannerIcon')}<span id="policyBannerText"></span>
      </div>`;
}

function renderHealthCard(id: string, target: string, labelKey: string, label: string): string {
  return `
          <button class="healthCard glassCard glassBlur is-idle" id="${id}" type="button" data-nav-target="${target}">
            <span class="healthHead"><span class="healthDot" aria-hidden="true"></span><span class="healthLabel" data-i18n="${labelKey}">${label}</span></span>
            <span class="healthValue" id="${id}Value">—</span>
            <span class="healthMeta" id="${id}Meta">&nbsp;</span>
          </button>`;
}

function renderHomeView(): string {
  return `
      <section id="homeView" class="appView is-active" aria-labelledby="pageTitle">
        <div class="homeHealth">${renderHealthCard('homeWorkerCard', 'settingsView', 'home.workerLabel', 'Worker')}${renderHealthCard('homeQueueCard', 'pipelineView', 'home.queueLabel', 'Queue')}${renderHealthCard('homeLlmCard', 'pipelineView', 'home.llmLabel', 'LLM today')}${renderHealthCard('homeDigestCard', 'digestsView', 'home.digestLabel', 'Last digest')}${renderHealthCard('homeVaultCard', 'digestsView', 'home.vaultLabel', 'Vault review')}
        </div>

        <div class="homeRow">
          <section class="glassCard glassBlur homeCard" id="homeTodayCard">
            <header class="cardHead">
              <h2 class="cardTitle" data-i18n="home.todayTitle">Today's memories</h2>
              <span class="cardHint" id="homeTodayDate"></span>
            </header>
            <div class="todayTop">
              <div class="todayCount" id="homeTodayCount">—</div>
              <div class="kindChips">
                <span class="kindChip kind-outcome"><span class="kindDot" aria-hidden="true"></span><span class="kindCount" id="homeKindOutcome">0</span><span data-i18n="home.kindOutcome">outcome</span></span>
                <span class="kindChip kind-context"><span class="kindDot" aria-hidden="true"></span><span class="kindCount" id="homeKindContext">0</span><span data-i18n="home.kindContext">context</span></span>
                <span class="kindChip kind-legacy"><span class="kindDot" aria-hidden="true"></span><span class="kindCount" id="homeKindLegacy">0</span><span data-i18n="home.kindLegacy">legacy</span></span>
              </div>
            </div>
            <div class="chartWrap" id="homeTodayChart" role="img" data-i18n-aria-label="home.chartLabel" aria-label="Memories per day, stacked by kind"></div>
            <div class="chipRow" id="homeTodayChips"></div>
          </section>

          <section class="glassCard glassBlur homeCard" id="homeAttentionCard">
            <header class="cardHead">
              <h2 class="cardTitle" data-i18n="home.attentionTitle">Needs attention</h2>
              <span class="countBadge" id="homeAttentionCount" hidden></span>
            </header>
            <div class="attentionLoading" id="homeAttentionLoading" data-i18n="home.loading">Loading…</div>
            <div class="statusHero" id="homeStatusHero" hidden>${renderHealthRing()}
              <div class="statusText">
                <div class="allClear" id="homeAttentionEmpty">
                  <div class="allClearTitle" data-i18n="home.allClear">All clear</div>
                  <p class="allClearLead" data-i18n="home.allClearLead">No fallbacks, stuck tasks or failed digests today</p>
                </div>
                <div class="allClear" id="homeStatusIssue" hidden>
                  <div class="allClearTitle" id="homeStatusTitle"></div>
                  <p class="allClearLead" id="homeStatusLead"></p>
                </div>
                <div class="statusMeta">
                  <span class="statusMetaChip" id="homeHealthRingChip" data-tone="unknown"></span>
                  <span class="statusMetaChip" id="homeStatusUpdated" hidden></span>
                </div>
              </div>
            </div>
            <ul class="attentionList" id="homeAttentionList" hidden></ul>
          </section>
        </div>

        <section class="glassCard glassBlur homeCard homeRecent" id="homeRecentCard">
          <header class="cardHead">
            <h2 class="cardTitle" data-i18n="home.recentTitle">Recent memories</h2>
            <button class="linkButton" id="homeRecentViewAll" type="button" data-nav-target="memoryView">
              <span data-i18n="home.viewAll">View all</span>${renderAdminIcon('arrowRight', 'linkIcon')}
            </button>
          </header>
          <div class="tableWrap">
            <table class="recentTable">
              <colgroup><col class="colTime" /><col class="colKind" /><col class="colAgent" /><col class="colProject" /><col /></colgroup>
              <thead>
                <tr>
                  <th scope="col" data-i18n="home.colTime">Time</th>
                  <th scope="col" data-i18n="home.colKind">Kind</th>
                  <th scope="col" data-i18n="home.colAgent">Agent</th>
                  <th scope="col" data-i18n="home.colProject">Project</th>
                  <th scope="col" data-i18n="home.colTitle">Title</th>
                </tr>
              </thead>
              <tbody id="homeRecentRows">
                <tr><td colspan="5" class="tableEmpty" data-i18n="home.loading">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>`;
}

// Time-window presets of the Activity toolbar; 7 days is the default.
export const ADMIN_UI_ACTIVITY_RANGES: Array<{ id: string; range: string; key: string; label: string }> = [
  { id: 'activityRangeToday', range: 'today', key: 'activity.rangeToday', label: 'Today' },
  { id: 'activityRangeYesterday', range: 'yesterday', key: 'activity.rangeYesterday', label: 'Yesterday' },
  { id: 'activityRange7d', range: '7d', key: 'activity.range7d', label: '7 days' },
  { id: 'activityRangeCustom', range: 'custom', key: 'activity.rangeCustom', label: 'Custom' },
];

function renderActivityPopup(id: string, labelKey: string, label: string): string {
  return `
          <button class="actPopup" id="${id}Button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}Popover">
            <span class="actPopupLabel" data-i18n="${labelKey}">${label}</span>
            <span class="actPopupValue" id="${id}Value">All</span>
            ${renderAdminIcon('chevronUpDown', 'actPopupIcon')}
          </button>`;
}

// One day column. The header, the card list and the trailing controls are static; the client only reconciles the
// cards inside #activityColumnNCards, keyed by memory id.
function renderActivityColumn(index: number): string {
  const id = `activityColumn${index}`;
  const pill = (kind: string, suffix: string) =>
    `<span class="actDayPill kind-${kind}" id="${id}${suffix}" hidden><span class="kindDot" aria-hidden="true"></span><span class="actDayCount">0</span></span>`;
  return `
            <section class="actColumn" id="${id}" aria-labelledby="${id}Heading">
              <header class="actColumnHead">
                <h2 class="actColumnTitle" id="${id}Heading"><span class="actColumnName" id="${id}Title"></span><span class="actColumnDate" id="${id}Date"></span></h2>
                <span class="actDayPills">${pill('outcome', 'Outcome')}${pill('context', 'Context')}${pill('legacy', 'Legacy')}</span>
              </header>
              <div class="actColumnBody" id="${id}Body">
                <div class="actCards" id="${id}Cards"></div>
                <p class="actColumnEmpty" id="${id}Empty" data-i18n="activity.dayEmpty" hidden>No memories on this day</p>
                <button class="actMore" id="${id}More" type="button" data-activity-more="true" hidden>Load more</button>
              </div>
            </section>`;
}

function renderActivityView(): string {
  const segments = ADMIN_UI_ACTIVITY_RANGES.map((item) => `
            <button class="actSegment" id="${item.id}" type="button" data-activity-range="${item.range}" aria-pressed="${item.range === '7d'}"${item.range === 'custom' ? ' aria-haspopup="dialog" aria-expanded="false" aria-controls="activityCustomPopover"' : ''} data-i18n="${item.key}">${item.label}</button>`).join('');
  return `
      <section id="activityView" class="appView activityView" aria-labelledby="pageTitle">
        <div class="actSummary" id="activitySummary">
          <span class="actSum" id="activitySumMemories">—</span><span class="actSumSep" aria-hidden="true">·</span>
          <span class="actSum" id="activitySumOutcome"></span><span class="actSumSep" aria-hidden="true">·</span>
          <span class="actSum" id="activitySumContext"></span><span class="actSumSep" aria-hidden="true">·</span>
          <button class="actSum actSumToggle" id="activitySumLegacy" type="button" aria-pressed="false"></button>
          <span class="actSpark" id="activitySparkline" role="img" data-i18n-aria-label="activity.sparkLabel" aria-label="Memories per day in this window"></span>
        </div>

        <div class="actToolbar glassSurface glassBlur" id="activityToolbar">
          <div class="actSegmented" id="activityRangeControl" role="group" data-i18n-aria-label="activity.rangeLabel" aria-label="Time range">${segments}
          </div>
          <span class="actToolbarSep" aria-hidden="true"></span>${renderActivityPopup('activityProject', 'activity.project', 'Project')}${renderActivityPopup('activityAgent', 'activity.agent', 'Agent')}
          <div class="actToolbarEnd">
            <span class="actRangeText"><span class="actRange" id="activityRangeLabel"></span><span class="actUpdated" id="activityUpdated"></span></span>
            <button class="actIconButton" id="activitySearchButton" type="button" data-nav-target="memoryView" data-focus-target="memorySearchInput" data-i18n-title="activity.searchMemory" title="Search memories" data-i18n-aria-label="activity.search" aria-label="Search">${renderAdminIcon('search', 'actIcon')}</button>
          </div>
        </div>

        <div class="actChips" id="activityChips" role="group" data-i18n-aria-label="activity.chipsLabel" aria-label="Projects"></div>

        <div class="actBoard" id="activityBoard">
          <div class="actMain">
            <div class="actColumns" id="activityColumns" role="region" data-i18n-aria-label="activity.columnsLabel" aria-label="Memories by day" aria-busy="true">${renderActivityColumn(0)}${renderActivityColumn(1)}
            </div>
            <div class="actNotice glassCard glassBlur" id="activityNotice" role="status" hidden>
              <div class="placeholderIcon">${renderAdminIcon('activity', 'placeholderGlyph')}</div>
              <h2 class="actNoticeTitle" id="activityNoticeTitle"></h2>
              <p class="actNoticeLead" id="activityNoticeLead"></p>
              <div class="actNoticeActions">
                <button class="bgButton is-primary" id="activityNoticeAction" type="button" hidden></button>
                <button class="bgButton" id="activityNoticeSecondary" type="button" hidden></button>
              </div>
            </div>
          </div>
          <!-- Older days from one stats-only request (120 days, limit=0); the client renders the two day groups. -->
          <aside class="actRail glassCard glassBlur" id="activityEarlierPanel" aria-labelledby="activityEarlierTitle">
            <h2 class="actRailTitle" id="activityEarlierTitle" data-i18n="activity.earlierTitle">Earlier</h2>
            <p class="actRailLead" id="activityEarlierLead" data-i18n="activity.earlierLead">Older days, up to 120 days back. Select a day to open its memories.</p>
            <div class="actRailBody" id="activityEarlierBody" aria-live="polite"></div>
            <p class="actRailNote" id="activityEarlierNote" data-i18n="activity.earlierNote">Bar length is √-scaled. Legacy days counted every tool call, so they read larger than v2.1 days without meaning more work.</p>
          </aside>
        </div>

        <!-- The one memory detail drawer, shared with Memory. The client moves it into whichever view opens it, so
             its blur only runs inside the visible view. -->
        <div class="actScrim" id="activityDrawerScrim" hidden></div>
        <aside class="actDrawer" id="activityDrawer" role="dialog" aria-modal="true" aria-labelledby="activityDrawerTitle" tabindex="-1" hidden>
          <header class="actDrawerHead">
            <div class="actDrawerMeta" id="activityDrawerMeta"></div>
            <div class="actDrawerTools">
              <button class="actDrawerClose" id="memoryDrawerCopy" type="button" data-i18n-title="memory.drawerCopyId" title="Copy memory ID" data-i18n-aria-label="memory.drawerCopyId" aria-label="Copy memory ID">${renderAdminIcon('copy', 'actIcon')}</button>
              <button class="actDrawerClose" id="activityDrawerClose" type="button" data-i18n-aria-label="activity.drawerClose" aria-label="Close">${renderAdminIcon('close', 'actIcon')}</button>
            </div>
          </header>
          <h2 class="actDrawerTitle" id="activityDrawerTitle"></h2>
          <div class="actDrawerSub" id="activityDrawerSub"></div>
          <div class="actDrawerBody" id="activityDrawerBody" aria-live="polite"></div>
        </aside>

        <!-- Popovers sit outside the blurred toolbar: inside it they could only frost the toolbar itself. -->
        <div class="actPopover actMenu" id="activityProjectPopover" role="listbox" data-i18n-aria-label="activity.projectMenu" aria-label="Filter by project" hidden></div>
        <div class="actPopover actMenu" id="activityAgentPopover" role="listbox" data-i18n-aria-label="activity.agentMenu" aria-label="Filter by agent" hidden></div>
        <section class="actPopover actCustom" id="activityCustomPopover" role="dialog" aria-labelledby="activityCustomTitle" hidden>
          <h3 class="actCustomTitle" id="activityCustomTitle" data-i18n="activity.customTitle">Custom range</h3>
          <div class="actCustomFields">
            <label class="actField"><span class="actFieldLabel" data-i18n="activity.customFrom">From</span><input class="actDateInput" id="activityCustomFrom" type="date" /></label>
            <label class="actField"><span class="actFieldLabel" data-i18n="activity.customTo">To</span><input class="actDateInput" id="activityCustomTo" type="date" /></label>
          </div>
          <p class="actCustomHint" id="activityCustomHint" data-i18n="activity.customHint">Up to 120 days</p>
          <p class="actCustomError" id="activityCustomError" role="alert" hidden></p>
          <div class="actCustomActions">
            <button class="bgButton" id="activityCustomCancel" type="button" data-i18n="activity.customCancel">Cancel</button>
            <button class="bgButton is-primary" id="activityCustomApply" type="button" data-i18n="activity.customApply">Apply</button>
          </div>
        </section>
      </section>`;
}

// Time presets of the Memory toolbar; Any time is the default. 7 and 30 days end now.
export const ADMIN_UI_MEMORY_RANGES: Array<{ id: string; range: string; key: string; label: string }> = [
  { id: 'memoryRangeAny', range: 'any', key: 'memory.rangeAny', label: 'Any time' },
  { id: 'memoryRange7d', range: '7d', key: 'memory.range7d', label: '7 days' },
  { id: 'memoryRange30d', range: '30d', key: 'memory.range30d', label: '30 days' },
  { id: 'memoryRangeCustom', range: 'custom', key: 'memory.rangeCustom', label: 'Custom' },
];

function renderMemoryPopup(id: string, labelKey: string, label: string): string {
  return `
          <button class="actPopup" id="${id}Button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}Popover">
            <span class="actPopupLabel" data-i18n="${labelKey}">${label}</span>
            <span class="actPopupValue" id="${id}Value">All</span>
            ${renderAdminIcon('chevronUpDown', 'actPopupIcon')}
          </button>`;
}

// Memory: one searchable, filterable list grouped by local day. The client renders the day groups inside
// #memoryList, keyed by day and memory id; the detail drawer is the one Activity owns, moved in on open.
function renderMemoryView(): string {
  const segments = ADMIN_UI_MEMORY_RANGES.map((item) => `
            <button class="actSegment" id="${item.id}" type="button" data-memory-range="${item.range}" aria-pressed="${item.range === 'any'}"${item.range === 'custom' ? ' aria-haspopup="dialog" aria-expanded="false" aria-controls="memoryCustomPopover"' : ''} data-i18n="${item.key}">${item.label}</button>`).join('');
  const kindSum = (kind: string, suffix: string) =>
    `<button class="memSumKind kind-${kind}" id="memorySum${suffix}" type="button" data-memory-sum-kind="${kind}" aria-pressed="false"><span class="memSumDot" aria-hidden="true"></span><span class="memSumText"></span></button>`;
  const column = (key: string, label: string, extra: string = '') => `<span class="memCol${extra}" data-i18n="${key}">${label}</span>`;
  const menu = (id: string, key: string, label: string) =>
    `<div class="actPopover actMenu" id="${id}" role="listbox" data-i18n-aria-label="${key}" aria-label="${label}" hidden></div>`;
  return `
      <section id="memoryView" class="appView memoryView" aria-labelledby="pageTitle">
        <p class="memLead" id="memoryLead" data-i18n="memory.lead">Search, filter, and browse saved memories across projects and agents.</p>

        <div class="memToolbar glassSurface glassBlur" id="memoryToolbar" role="search" data-i18n-aria-label="memory.toolbarLabel" aria-label="Memory filters">
          <label class="memSearch" for="memorySearchInput">
            ${renderAdminIcon('search', 'memSearchIcon')}
            <span class="visuallyHidden" data-i18n="memory.searchLabel">Search memories</span>
            <input class="memSearchInput" id="memorySearchInput" type="search" maxlength="200" autocomplete="off" spellcheck="false" data-i18n-placeholder="memory.searchPlaceholder" placeholder="Search memories…" />
            <button class="memSearchClear" id="memorySearchClear" type="button" data-i18n-aria-label="memory.searchClear" aria-label="Clear search" hidden>${renderAdminIcon('close', 'memSearchClearIcon')}</button>
          </label>
          <div class="memFilters">${renderMemoryPopup('memoryProject', 'memory.project', 'Project')}${renderMemoryPopup('memoryAgent', 'memory.agent', 'Agent')}${renderMemoryPopup('memoryKind', 'memory.kind', 'Kind')}${renderMemoryPopup('memorySource', 'memory.source', 'Source')}
          </div>
          <div class="actSegmented memSegmented" id="memoryRangeControl" role="group" data-i18n-aria-label="memory.rangeLabel" aria-label="Time range">${segments}
          </div>
        </div>

        <div class="memSummary" id="memorySummary">
          <span class="memSumTotal" id="memorySumTotal">—</span>
          <span class="memSumSep" aria-hidden="true">·</span>${kindSum('outcome', 'Outcome')}
          <span class="memSumSep" aria-hidden="true">·</span>${kindSum('context', 'Context')}
          <span class="memSumSep" aria-hidden="true">·</span>${kindSum('legacy', 'Legacy')}
          <span class="memUpdated" id="memoryUpdated"></span>
        </div>

        <div class="memTop glassSurface glassBlur" id="memoryTopProjects" hidden>
          <span class="memTopLabel" id="memoryTopLabel" data-i18n="memory.topProjects">Top projects</span>
          <div class="memTopBar" id="memoryTopBar" role="group" aria-labelledby="memoryTopLabel"></div>
        </div>

        <div class="memBoard" id="memoryBoard">
          <div class="memHead" id="memoryListHead" aria-hidden="true">${column('memory.colTime', 'Time')}${column('memory.colKind', 'Kind')}${column('memory.colTitle', 'Title / Summary')}${column('memory.colProject', 'Project')}${column('memory.colAgent', 'Agent')}${column('memory.colFacts', 'Facts', ' is-num')}${column('memory.colFiles', 'Files', ' is-num')}
          </div>
          <div class="memList" id="memoryList" role="region" data-i18n-aria-label="memory.listLabel" aria-label="Memories by day" aria-busy="true"></div>
          <div class="actNotice memNotice glassCard glassBlur" id="memoryNotice" role="status" hidden>
            <div class="placeholderIcon" id="memoryNoticeIcon">${renderAdminIcon('memory', 'placeholderGlyph')}</div>
            <h2 class="actNoticeTitle" id="memoryNoticeTitle"></h2>
            <p class="actNoticeLead" id="memoryNoticeLead"></p>
            <div class="actNoticeActions">
              <button class="bgButton is-primary" id="memoryNoticeAction" type="button" hidden></button>
            </div>
          </div>
          <div class="memMoreRow">
            <button class="memMore" id="memoryLoadMore" type="button" hidden data-i18n="memory.loadMore">Load more</button>
          </div>
        </div>

        <!-- Popovers sit outside the blurred toolbar so their own blur sees the page. -->
        ${menu('memoryProjectPopover', 'memory.projectMenu', 'Filter by project')}
        ${menu('memoryAgentPopover', 'memory.agentMenu', 'Filter by agent')}
        ${menu('memoryKindPopover', 'memory.kindMenu', 'Filter by kind')}
        ${menu('memorySourcePopover', 'memory.sourceMenu', 'Filter by source')}
        <section class="actPopover actCustom" id="memoryCustomPopover" role="dialog" aria-labelledby="memoryCustomTitle" hidden>
          <h3 class="actCustomTitle" id="memoryCustomTitle" data-i18n="memory.customTitle">Custom range</h3>
          <div class="actCustomFields">
            <label class="actField"><span class="actFieldLabel" data-i18n="memory.customFrom">From</span><input class="actDateInput" id="memoryCustomFrom" type="date" /></label>
            <label class="actField"><span class="actFieldLabel" data-i18n="memory.customTo">To</span><input class="actDateInput" id="memoryCustomTo" type="date" /></label>
          </div>
          <p class="actCustomHint" data-i18n="memory.customHint">Both days are included.</p>
          <p class="actCustomError" id="memoryCustomError" role="alert" hidden></p>
          <div class="actCustomActions">
            <button class="bgButton" id="memoryCustomCancel" type="button" data-i18n="memory.customCancel">Cancel</button>
            <button class="bgButton is-primary" id="memoryCustomApply" type="button" data-i18n="memory.customApply">Apply</button>
          </div>
        </section>
      </section>`;
}

// Time presets of the Pipeline toolbar; 7 days is the default. Today, 7 and 30 days end now.
export const ADMIN_UI_PIPELINE_RANGES: Array<{ id: string; range: string; key: string; label: string }> = [
  { id: 'pipelineRangeToday', range: 'today', key: 'pipeline.rangeToday', label: 'Today' },
  { id: 'pipelineRange7d', range: '7d', key: 'pipeline.range7d', label: '7 days' },
  { id: 'pipelineRange30d', range: '30d', key: 'pipeline.range30d', label: '30 days' },
  { id: 'pipelineRangeCustom', range: 'custom', key: 'pipeline.rangeCustom', label: 'Custom' },
];

// The flow strip, in order: the three in-flight stages (joined by chevrons), then the outcomes. Stuck has its own chip.
// Consolidating is the worker's live count and only displays; every other stage filters the list.
export const ADMIN_UI_PIPELINE_STAGES: Array<{ stage: string; id: string; key: string; label: string; flow: boolean }> = [
  { stage: 'queued', id: 'pipelineStageQueued', key: 'pipeline.stateQueued', label: 'Queued', flow: true },
  { stage: 'processing', id: 'pipelineStageProcessing', key: 'pipeline.stateProcessing', label: 'Processing', flow: true },
  { stage: 'consolidating', id: 'pipelineStageConsolidating', key: 'pipeline.stageConsolidating', label: 'Consolidating', flow: true },
  { stage: 'saved', id: 'pipelineStageSaved', key: 'pipeline.stateSaved', label: 'Saved', flow: false },
  { stage: 'skipped', id: 'pipelineStageSkipped', key: 'pipeline.stateSkipped', label: 'Skipped', flow: false },
  { stage: 'duplicate', id: 'pipelineStageDuplicate', key: 'pipeline.stateDuplicate', label: 'Duplicate', flow: false },
  { stage: 'fallback', id: 'pipelineStageFallback', key: 'pipeline.stateFallback', label: 'Fallback', flow: false },
  { stage: 'failed', id: 'pipelineStageFailed', key: 'pipeline.stateFailed', label: 'Failed', flow: false },
];

function renderPipelineStage(item: { stage: string; id: string; key: string; label: string }): string {
  const inner = `<span class="pipeOrb" aria-hidden="true"><span class="pipeOrbDot"></span></span>
              <span class="pipeStageText"><span class="pipeStageLabel" data-i18n="${item.key}">${item.label}</span><span class="pipeStageCount" id="${item.id}Count">—</span></span>`;
  if (item.stage === 'consolidating') {
    return `
            <div class="pipeStage is-static stage-${item.stage}" id="${item.id}" data-i18n-title="pipeline.stageConsolidatingHint" title="Consolidations the worker is running right now">
              ${inner}
            </div>`;
  }
  return `
            <button class="pipeStage stage-${item.stage}" id="${item.id}" type="button" data-pipeline-stage="${item.stage}" aria-pressed="false">
              ${inner}
            </button>`;
}

// Pipeline: the task list behind every memory, grouped by local day. The client fills #pipelineList keyed by day
// and task id; the detail drawer is the one Activity owns, moved in on open, with a task body of its own.
function renderPipelineView(): string {
  const segments = ADMIN_UI_PIPELINE_RANGES.map((item) => `
            <button class="actSegment" id="${item.id}" type="button" data-pipeline-range="${item.range}" aria-pressed="${item.range === '7d'}"${item.range === 'custom' ? ' aria-haspopup="dialog" aria-expanded="false" aria-controls="pipelineCustomPopover"' : ''} data-i18n="${item.key}">${item.label}</button>`).join('');
  const chevron = renderAdminIcon('chevronRight', 'pipeChevron');
  const flow = ADMIN_UI_PIPELINE_STAGES.filter((item) => item.flow).map(renderPipelineStage).join(chevron);
  const outcomes = ADMIN_UI_PIPELINE_STAGES.filter((item) => !item.flow).map(renderPipelineStage).join('');
  const column = (key: string, label: string, extra: string = '') => `<span class="memCol${extra}" data-i18n="${key}">${label}</span>`;
  const menu = (id: string, key: string, label: string) =>
    `<div class="actPopover actMenu" id="${id}" role="listbox" data-i18n-aria-label="${key}" aria-label="${label}" hidden></div>`;
  return `
      <section id="pipelineView" class="appView pipelineView" aria-labelledby="pageTitle">
        <div class="pipeLeadRow">
          <p class="memLead pipeLead" id="pipelineLead" data-i18n="pipeline.lead">Track how finished tasks become durable memories, and spot failures fast.</p>
          <span class="memUpdated" id="pipelineUpdated"></span>
        </div>

        <div class="memToolbar pipeToolbar glassSurface glassBlur" id="pipelineToolbar" role="group" data-i18n-aria-label="pipeline.toolbarLabel" aria-label="Pipeline filters">
          <div class="pipeFilters">${renderMemoryPopup('pipelineProject', 'pipeline.project', 'Project')}${renderMemoryPopup('pipelineAgent', 'pipeline.agent', 'Agent')}${renderMemoryPopup('pipelineState', 'pipeline.state', 'State')}
            <button class="pipeFlagChip" id="pipelineFlaggedChip" type="button" hidden data-i18n="pipeline.flaggedChip" data-i18n-title="pipeline.flaggedRemove" title="Remove flagged duplicates">Flagged duplicates</button>
          </div>
          <div class="actSegmented memSegmented" id="pipelineRangeControl" role="group" data-i18n-aria-label="pipeline.rangeLabel" aria-label="Time range">${segments}
            <span class="pipeRangeAll" id="pipelineRangeAll" hidden data-i18n="pipeline.rangeAll">All time</span>
          </div>
        </div>

        <div class="pipeFlowRow" id="pipelineFlowRow">
          <div class="pipeFlow glassSurface glassBlur" id="pipelineFlow" role="group" data-i18n-aria-label="pipeline.flowLabel" aria-label="Tasks by stage">
            <div class="pipeFlowGroup is-flow">${flow}
            </div>
            <span class="pipeFlowSep" aria-hidden="true"></span>
            <div class="pipeFlowGroup">${outcomes}
            </div>
          </div>
          <button class="pipeStuck glassSurface glassBlur" id="pipelineStuck" type="button" data-pipeline-stage="stuck" aria-pressed="false" title="Incomplete tasks whose retries are used up or that have not moved for over a day">
            <span class="pipeStuckIcon" aria-hidden="true">${renderAdminIcon('warning', 'pipeStuckGlyph')}</span>
            <span class="pipeStageText"><span class="pipeStageLabel" data-i18n="pipeline.stateStuck">Stuck</span><span class="pipeStageCount" id="pipelineStuckCount">—</span></span>
          </button>
        </div>

        <div class="memBoard pipeBoard" id="pipelineBoard">
          <button class="pipePause" id="pipelineUpdatesPaused" type="button" hidden data-i18n="pipeline.updatesPaused">Updates paused – Refresh</button>
          <div class="memHead pipeHead" id="pipelineListHead" aria-hidden="true">${column('pipeline.colTime', 'Time')}${column('pipeline.colState', 'State')}${column('pipeline.colTask', 'Task / Title')}${column('pipeline.colProject', 'Project')}${column('pipeline.colAgent', 'Agent')}${column('pipeline.colLlm', 'LLM calls', ' is-num')}${column('pipeline.colAttempts', 'Attempts', ' is-num')}
          </div>
          <div class="memList pipeList" id="pipelineList" role="region" data-i18n-aria-label="pipeline.listLabel" aria-label="Tasks by day" aria-busy="true"></div>
          <div class="actNotice memNotice glassCard glassBlur" id="pipelineNotice" role="status" hidden>
            <div class="placeholderIcon" id="pipelineNoticeIcon">${renderAdminIcon('pipeline', 'placeholderGlyph')}</div>
            <h2 class="actNoticeTitle" id="pipelineNoticeTitle"></h2>
            <p class="actNoticeLead" id="pipelineNoticeLead"></p>
            <div class="actNoticeActions">
              <button class="bgButton is-primary" id="pipelineNoticeAction" type="button" hidden></button>
            </div>
          </div>
          <div class="memMoreRow">
            <button class="memMore" id="pipelineLoadMore" type="button" hidden data-i18n="pipeline.loadMore">Load more</button>
          </div>
        </div>

        <!-- Popovers sit outside the blurred toolbar so their own blur sees the page. -->
        ${menu('pipelineProjectPopover', 'pipeline.projectMenu', 'Filter by project')}
        ${menu('pipelineAgentPopover', 'pipeline.agentMenu', 'Filter by agent')}
        ${menu('pipelineStatePopover', 'pipeline.stateMenu', 'Filter by state')}
        <section class="actPopover actCustom" id="pipelineCustomPopover" role="dialog" aria-labelledby="pipelineCustomTitle" hidden>
          <h3 class="actCustomTitle" id="pipelineCustomTitle" data-i18n="pipeline.customTitle">Custom range</h3>
          <div class="actCustomFields">
            <label class="actField"><span class="actFieldLabel" data-i18n="pipeline.customFrom">From</span><input class="actDateInput" id="pipelineCustomFrom" type="date" /></label>
            <label class="actField"><span class="actFieldLabel" data-i18n="pipeline.customTo">To</span><input class="actDateInput" id="pipelineCustomTo" type="date" /></label>
          </div>
          <p class="actCustomHint" data-i18n="pipeline.customHint">Both days are included.</p>
          <p class="actCustomError" id="pipelineCustomError" role="alert" hidden></p>
          <div class="actCustomActions">
            <button class="bgButton" id="pipelineCustomCancel" type="button" data-i18n="pipeline.customCancel">Cancel</button>
            <button class="bgButton is-primary" id="pipelineCustomApply" type="button" data-i18n="pipeline.customApply">Apply</button>
          </div>
        </section>
      </section>`;
}

// Time presets of the Digests toolbar; 7 days is the default. Each covers whole local days ending today, matched
// against the day a digest covers (not the time it was written).
export const ADMIN_UI_DIGEST_RANGES: Array<{ id: string; range: string; key: string; label: string }> = [
  { id: 'digRange7d', range: '7d', key: 'digests.range7d', label: '7 days' },
  { id: 'digRange30d', range: '30d', key: 'digests.range30d', label: '30 days' },
  { id: 'digRange90d', range: '90d', key: 'digests.range90d', label: '90 days' },
  { id: 'digRangeCustom', range: 'custom', key: 'digests.rangeCustom', label: 'Custom' },
];

// One stat of a status card: an icon, a quiet label and the value (and an optional second line).
function renderDigestStat(id: string, icon: string, labelKey: string, label: string, sub: boolean = false): string {
  return `
              <div class="digStat" id="${id}">
                ${renderAdminIcon(icon, 'digStatIcon')}
                <span class="digStatText">
                  <span class="digStatLabel" id="${id}Label" data-i18n="${labelKey}">${label}</span>
                  <span class="digStatValue" id="${id}Value">—</span>${sub ? `
                  <span class="digStatSub" id="${id}Sub"></span>` : ''}
                </span>
              </div>`;
}

// Digests & Reviews: the two status cards (nightly digest scheduler, Vault review), then the digests grouped by the
// day they cover. The client fills #digList keyed by day and digest id; the detail drawer is the one Activity owns,
// moved in on open, with a digest body of its own.
function renderDigestsView(): string {
  const segments = ADMIN_UI_DIGEST_RANGES.map((item) => `
            <button class="actSegment" id="${item.id}" type="button" data-digest-range="${item.range}" aria-pressed="${item.range === '7d'}"${item.range === 'custom' ? ' aria-haspopup="dialog" aria-expanded="false" aria-controls="digCustomPopover"' : ''} data-i18n="${item.key}">${item.label}</button>`).join('');
  const menu = (id: string, key: string, label: string) =>
    `<div class="actPopover actMenu" id="${id}" role="listbox" data-i18n-aria-label="${key}" aria-label="${label}" hidden></div>`;
  return `
      <section id="digestsView" class="appView digestsView" aria-labelledby="pageTitle">
        <div class="pipeLeadRow digLeadRow">
          <p class="memLead pipeLead" id="digLead" data-i18n="digests.lead">Nightly project digests and Vault review activity across your workspace.</p>
          <span class="memUpdated" id="digUpdated"></span>
        </div>

        <div class="memToolbar digToolbar digGlass glassSurface glassBlur" id="digToolbar" role="group" data-i18n-aria-label="digests.toolbarLabel" aria-label="Digest filters">
          <div class="digFilters">${renderMemoryPopup('digProject', 'digests.project', 'Project')}${renderMemoryPopup('digAgent', 'digests.agent', 'Agent')}
            <button class="digStatusChip" id="digStatusChip" type="button" hidden data-i18n-title="digests.failedRemove" title="Remove the Failed filter"><span class="digStatusChipDot" aria-hidden="true"></span><span data-i18n="digests.failedChip">Failed</span>${renderAdminIcon('close', 'digStatusChipIcon')}</button>
          </div>
          <div class="actSegmented memSegmented" id="digRangeControl" role="group" data-i18n-aria-label="digests.rangeLabel" aria-label="Time range">${segments}
          </div>
        </div>

        <div class="digCards" id="digCards">
          <section class="digCard digGlass glassCard glassBlur" id="digNightlyCard" aria-labelledby="digNightlyTitle">
            <header class="digCardHead">
              <span class="digCardIcon" aria-hidden="true">${renderAdminIcon('digestDoc', 'digCardGlyph')}</span>
              <h2 class="digCardTitle" id="digNightlyTitle" data-i18n="digests.nightlyTitle">Nightly digest</h2>
              <span class="digChip is-muted" id="digNightlyChip"><span class="digChipDot" aria-hidden="true"></span><span id="digNightlyChipText">—</span></span>
            </header>
            <div class="digStats">${renderDigestStat('digNextRun', 'moon', 'digests.nextRun', 'Next run')}${renderDigestStat('digLastRun', 'clock', 'digests.lastRun', 'Last run')}${renderDigestStat('digLastProjects', 'layers', 'digests.projectsLabel', 'Projects', true)}
            </div>
          </section>
          <section class="digCard digGlass glassCard glassBlur" id="digVaultCard" aria-labelledby="digVaultTitle">
            <header class="digCardHead">
              <span class="digCardIcon is-vault" aria-hidden="true">${renderAdminIcon('memory', 'digCardGlyph')}</span>
              <h2 class="digCardTitle" id="digVaultTitle" data-i18n="digests.vaultTitle">Vault review</h2>
              <span class="digChip is-muted" id="digVaultChip"><span class="digChipDot" aria-hidden="true"></span><span id="digVaultChipText">—</span></span>
            </header>
            <div class="digStats digVaultStats">
              <div class="digStat" id="digVaultLast">
                <span class="digStatText">
                  <span class="digStatLabel" data-i18n="digests.vaultLastCheckpoint">Last checkpoint</span>
                  <span class="digStatValue" id="digVaultLastValue">—</span>
                </span>
              </div>
              <div class="digDots" id="digVaultDots" role="img" data-i18n-aria-label="digests.vaultDotsLabel" aria-label="Vault review checkpoints over the last 14 days"></div>
            </div>
          </section>
        </div>

        <div class="memBoard digBoard" id="digBoard">
          <div class="memList digList" id="digList" role="region" data-i18n-aria-label="digests.listLabel" aria-label="Digests by day" aria-busy="true"></div>
          <div class="actNotice memNotice digGlass glassCard glassBlur" id="digNotice" role="status" hidden>
            <div class="placeholderIcon" id="digNoticeIcon">${renderAdminIcon('digestDoc', 'placeholderGlyph')}</div>
            <h2 class="actNoticeTitle" id="digNoticeTitle"></h2>
            <p class="actNoticeLead" id="digNoticeLead"></p>
            <div class="actNoticeActions">
              <button class="bgButton is-primary" id="digNoticeAction" type="button" hidden></button>
            </div>
          </div>
          <div class="memMoreRow">
            <button class="memMore digGlass" id="digLoadMore" type="button" hidden data-i18n="digests.loadMore">Load more</button>
          </div>
        </div>

        <!-- Popovers sit outside the blurred toolbar so their own blur sees the page. -->
        ${menu('digProjectPopover', 'digests.projectMenu', 'Filter by project')}
        ${menu('digAgentPopover', 'digests.agentMenu', 'Filter by agent')}
        <section class="actPopover actCustom" id="digCustomPopover" role="dialog" aria-labelledby="digCustomTitle" hidden>
          <h3 class="actCustomTitle" id="digCustomTitle" data-i18n="digests.customTitle">Custom range</h3>
          <div class="actCustomFields">
            <label class="actField"><span class="actFieldLabel" data-i18n="digests.customFrom">From</span><input class="actDateInput" id="digCustomFrom" type="date" /></label>
            <label class="actField"><span class="actFieldLabel" data-i18n="digests.customTo">To</span><input class="actDateInput" id="digCustomTo" type="date" /></label>
          </div>
          <p class="actCustomHint" data-i18n="digests.customHint">Both days are included.</p>
          <p class="actCustomError" id="digCustomError" role="alert" hidden></p>
          <div class="actCustomActions">
            <button class="bgButton" id="digCustomCancel" type="button" data-i18n="digests.customCancel">Cancel</button>
            <button class="bgButton is-primary" id="digCustomApply" type="button" data-i18n="digests.customApply">Apply</button>
          </div>
        </section>
      </section>`;
}

function renderPlaceholderViews(): string {
  return PLACEHOLDER_VIEWS.map((view) => `
      <section id="${view.id}" class="appView" aria-labelledby="pageTitle">
        <div class="glassCard glassBlur placeholderCard">
          <div class="placeholderIcon">${renderAdminIcon(view.icon, 'placeholderGlyph')}</div>
          <h2 class="placeholderTitle" data-i18n="${view.titleKey}">${view.title}</h2>
          <p class="placeholderLead" data-i18n="${view.leadKey}">${view.lead}</p>
          <span class="soonChip" data-i18n="shell.comingSoon">Coming in the next phase</span>
        </div>
      </section>`).join('');
}

function renderSettingsView(): string {
  return `
      <section id="settingsView" class="appView" aria-labelledby="pageTitle">
        <div class="settingsGrid">
          <div class="glassCard glassBlur placeholderCard">
            <div class="placeholderIcon">${renderAdminIcon('settings', 'placeholderGlyph')}</div>
            <h2 class="placeholderTitle" data-i18n="nav.settings">Settings</h2>
            <p class="placeholderLead" data-i18n="shell.settingsLead">Memory switches, LLM connection, digest scheduler and version information.</p>
            <span class="soonChip" data-i18n="shell.comingSoon">Coming in the next phase</span>
          </div>
          <div class="glassCard glassBlur homeCard switchesCard">
            <h2 class="cardTitle" data-i18n="shell.switchesTitle">Memory switches</h2>
            <p class="switchesLead" data-i18n="shell.switchesLead">Read and Write apply to every connected agent. Change them with the pills in the top bar.</p>
            <div class="switchRow">
              <h3 class="switchTitle" data-i18n="policy.readTitle">Read Memory</h3>
              <p class="switchLead" data-i18n="policy.readLead">Controls startup context, state reads, hybrid search, and MCP read tools.</p>
              <div id="readPolicyMeta" class="switchMeta" data-i18n="policy.loadingCurrentState">Loading current state...</div>
            </div>
            <div class="switchRow">
              <h3 class="switchTitle" data-i18n="policy.writeTitle">Write Memory</h3>
              <p class="switchLead" data-i18n="policy.writeLead">Controls observation writes, state writes, session updates, and MCP record tools.</p>
              <div id="writePolicyMeta" class="switchMeta" data-i18n="policy.loadingCurrentState">Loading current state...</div>
            </div>
          </div>
        </div>
      </section>`;
}

export function renderAdminWorkbenchMarkup(): string {
  return `
  <div class="appShell">${renderSidebar()}${renderBackgroundPopover()}
    <main class="mainArea" id="mainArea">
      <div class="mainInner">${renderTopBar()}${renderHomeView()}${renderActivityView()}${renderMemoryView()}${renderPipelineView()}${renderDigestsView()}${renderPlaceholderViews()}${renderSettingsView()}

      <section id="devToolsView" class="appView devToolsView" aria-labelledby="pageTitle">
    <p class="devToolsLead" data-i18n="devtools.lead">Legacy workbench panels, kept intact for debugging. Everyday status lives on Home.</p>
    <section class="hero legacyOverview">
      <div class="heroLayout">
        <div>
          <div class="heroTopRow">
            <span class="eyebrow" data-i18n="hero.eyebrow">AgentMemory Admin Workbench</span>
          </div>
          <h2 class="legacyHeroTitle" data-i18n="hero.title">Runtime Console for Shared Agent Context</h2>
          <p class="lead" data-i18n="hero.lead">
            Inspect runtime policy, structured state, startup context health, hybrid search behavior,
            and the raw observation ledger from one local-only control room.
          </p>
        </div>
        <div class="heroAside">
          <div class="statusCard glassPanel">
            <div class="statusLabel" data-i18n="hero.currentRuntime">Current Runtime</div>
            <div id="statusText" class="statusValue" data-i18n="hero.loadingWorkbenchStatus">Loading workbench status...</div>
            <div id="policyUpdatedAt" class="finePrint" style="margin-top: 10px;"></div>
          </div>
          <div class="infoCard glassPanel">
            <div class="metaLabel" data-i18n="hero.workbenchNotes">Workbench Notes</div>
            <p class="panelLead" style="margin-top: 10px;" data-i18n="hero.workbenchNotesLead">
              Loopback-only UI. Structured state stays explicit-only. Search diagnostics expose ranking
              quality without changing the current search algorithm.
            </p>
          </div>
        </div>
      </div>

      <div class="statsGrid">
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.observations">Observations</div>
          <div id="observationsCount" class="metricValue">-</div>
        </div>
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.sessions">Sessions</div>
          <div id="sessionsCount" class="metricValue">-</div>
        </div>
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.projectsSeen">Projects Seen</div>
          <div id="projectsCount" class="metricValue">-</div>
        </div>
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.agentsSeen">Agents Seen</div>
          <div id="agentsCount" class="metricValue">-</div>
        </div>
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.currentStateFacts">Current State Facts</div>
          <div id="currentStateFactsCount" class="metricValue">-</div>
        </div>
        <div class="metricTile">
          <div class="metaLabel" data-i18n="metrics.dailyDigests">Daily Digests</div>
          <div id="dailyDigestsCount" class="metricValue">-</div>
        </div>
      </div>
    </section>

    <section class="dock">
      <div class="segmented" id="viewTabs">
        <button class="segmentButton is-active" type="button" data-panel-target="runtimePanel" data-i18n="tabs.runtime">Runtime</button>
        <button class="segmentButton" type="button" data-panel-target="proceduralSkillsPanel" data-i18n="tabs.proceduralSkills">Procedural Skills</button>
        <button class="segmentButton" type="button" data-panel-target="llmSettingsPanel" data-i18n="tabs.llmSettings">LLM Settings</button>
        <button class="segmentButton" type="button" data-panel-target="projectContextPanel" data-i18n="tabs.projectContext">Project Context</button>
        <button class="segmentButton" type="button" data-panel-target="stateLabPanel" data-i18n="tabs.stateLab">State Lab</button>
        <button class="segmentButton" type="button" data-panel-target="searchDiagnosticsPanel" data-i18n="tabs.searchDiagnostics">Search Diagnostics</button>
        <button class="segmentButton" type="button" data-panel-target="observationLedgerPanel" data-i18n="tabs.observationLedger">Observation Ledger</button>
      </div>
    </section>

    <section class="viewStack">
      <section id="runtimePanel" class="viewPanel glassPanel is-active">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="runtime.section">Runtime</div>
            <h2 class="panelTitle" data-i18n="runtime.title">Global policy, project inventory, and system posture</h2>
            <p class="panelLead" data-i18n="runtime.lead">
              This view stays focused on workbench-level control: runtime gates, project coverage, and the
              current working surface for the rest of the panels.
            </p>
          </div>
          <div class="statusLine" id="runtimeStatusLine">
            <span class="statusDot"></span>
            <span data-i18n="runtime.ready">Ready</span>
          </div>
        </div>

        <div class="runtimeMetaGrid">
          <div id="releaseCheckCard" class="card" style="grid-column: 1 / -1;">
            <div class="policyTitleRow">
              <div>
                <div class="metaLabel" data-i18n="runtime.releaseSection">Release Update</div>
                <h3 class="policyTitle" style="margin-top: 8px;" data-i18n="runtime.releaseTitle">GitHub Release status</h3>
              </div>
              <span id="releaseStatusBadge" class="statusChip warning" data-i18n="runtime.releaseStatusUnknown">Not checked</span>
            </div>
            <p class="panelLead" style="margin-top: 10px;" data-i18n="runtime.releaseLead">
              Compare this checkout against the latest published GitHub Release. The check is read-only and never runs bootstrap for you.
            </p>

            <div class="metricsRow" style="margin-top: 14px;">
              <div class="metricBadge"><strong data-i18n="runtime.releaseCurrentVersion">Current</strong> <span id="releaseCurrentVersion">-</span></div>
              <div class="metricBadge"><strong data-i18n="runtime.releaseLatestVersion">Latest</strong> <span id="releaseLatestVersion">-</span></div>
            </div>

            <div id="releaseVersionMeta" class="finePrint" style="margin-top: 12px;"></div>
            <div id="releaseCheckMeta" class="finePrint" style="margin-top: 8px;" data-i18n="runtime.releaseNotChecked">No release check has been run yet.</div>
            <div id="releaseCheckMessage" class="panelLead" style="margin-top: 10px;"></div>

            <div class="stack" style="margin-top: 16px;">
              <div class="metaLabel" data-i18n="runtime.releaseGuidanceTitle">Upgrade Guidance</div>
              <div id="releaseGuidanceSummary" class="panelLead" data-i18n="runtime.releaseGuidancePending">
                Run the release check to load the recommended upgrade path for this checkout.
              </div>
              <div id="releaseGuidanceCommands" class="listBlock">
                <div class="emptyState" data-i18n="runtime.releaseGuidancePending">
                  Run the release check to load the recommended upgrade path for this checkout.
                </div>
              </div>
            </div>

            <div class="toolbarFooter" style="margin-top: 16px;">
              <div id="releaseCheckedAt" class="finePrint"></div>
              <div class="actionCluster">
                <button id="releaseCheckButton" class="button primary" type="button" data-i18n="runtime.releaseCheckButton">Check for Updates</button>
                <button id="releaseOpenButton" class="button secondary" type="button" data-i18n="runtime.releaseOpenButton">Open Release</button>
              </div>
            </div>
          </div>
          <div id="dailyDigestCard" class="card" style="grid-column: 1 / -1;">
            <div class="policyTitleRow">
              <div>
                <div class="metaLabel" data-i18n="runtime.dailyDigestSection">Daily Digest</div>
                <h3 class="policyTitle" style="margin-top: 8px;" data-i18n="runtime.dailyDigestTitle">Manual memory synthesis</h3>
              </div>
              <span id="dailyDigestStatusBadge" class="statusChip warning" data-i18n="runtime.dailyDigestIdle">Idle</span>
            </div>
            <p class="panelLead" style="margin-top: 10px;" data-i18n="runtime.dailyDigestLead">
              Run the same daily memory digest job that the worker schedules automatically, then inspect the latest saved digest.
            </p>

            <div class="toolbar compact" style="margin-top: 16px;">
              <label>
                <span class="fieldLabel" data-i18n="field.project">Project</span>
                <select id="dailyDigestProjectSelect" class="selectInput">
                  <option value="" data-i18n="field.chooseProject">Choose a project</option>
                </select>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.localDate">Local Date</span>
                <input id="dailyDigestDateInput" class="dateInput" type="date" />
              </label>
              <div class="buttonSlot">
                <button id="dailyDigestRunButton" class="button primary" type="button" data-i18n="runtime.dailyDigestRunButton">Run Digest</button>
              </div>
            </div>

            <div class="toolbarFooter" style="margin-top: 14px;">
              <div id="dailyDigestStatusText" class="finePrint" data-i18n="runtime.dailyDigestNoProject">Choose a project to inspect daily digests.</div>
            </div>
            <div class="divider"></div>
            <div class="policyTitleRow">
              <div>
                <div class="metaLabel" data-i18n="runtime.dailyDigestSchedulerSection">Scheduler Settings</div>
                <p class="panelLead" style="margin-top: 8px;" data-i18n="runtime.dailyDigestSchedulerLead">
                  Control automatic daily digest catch-up without changing the digest selection policy.
                </p>
              </div>
              <span id="dailyDigestSchedulerRuntimeBadge" class="statusChip warning" data-i18n="runtime.dailyDigestSchedulerLoading">Loading</span>
            </div>
            <label class="checkRow" style="margin-top: 14px;">
              <input id="dailyDigestSchedulerEnabledInput" type="checkbox" />
              <span data-i18n="runtime.dailyDigestSchedulerEnabled">Enable scheduled daily digest runs</span>
            </label>
            <div class="toolbar" style="margin-top: 14px;">
              <label>
                <span class="fieldLabel" data-i18n="field.scheduleTime">Run Time</span>
                <input id="dailyDigestScheduleTimeInput" class="dateInput" type="time" value="23:50" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.timeZone">Time Zone</span>
                <input id="dailyDigestTimeZoneInput" class="textInput" type="text" list="dailyDigestTimeZoneOptions" placeholder="Asia/Shanghai" />
                <datalist id="dailyDigestTimeZoneOptions">
                  <option value="Asia/Shanghai"></option>
                  <option value="UTC"></option>
                  <option value="America/New_York"></option>
                  <option value="America/Los_Angeles"></option>
                  <option value="Europe/London"></option>
                </datalist>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.lookbackDays">Catch-up Days</span>
                <input id="dailyDigestLookbackInput" class="numberInput" type="number" min="1" max="14" value="2" />
              </label>
              <div class="buttonSlot">
                <button id="dailyDigestSchedulerSaveButton" class="button secondary" type="button" data-i18n="runtime.dailyDigestSchedulerSaveButton">Save Schedule</button>
              </div>
            </div>
            <div class="toolbarFooter" style="margin-top: 14px;">
              <div id="dailyDigestSchedulerStatusText" class="finePrint" data-i18n="runtime.dailyDigestSchedulerLoading">Loading scheduler settings...</div>
              <div id="dailyDigestSchedulerNextRunText" class="finePrint"></div>
            </div>
            <div id="dailyDigestLatest" class="listBlock" style="margin-top: 12px;">
              <div class="emptyState" data-i18n="runtime.dailyDigestNoProject">Choose a project to inspect daily digests.</div>
            </div>
          </div>
          <div class="card">
            <div class="metaLabel" data-i18n="runtime.knownProjects">Known Projects</div>
            <div id="runtimeProjectList" class="runtimeProjectList"></div>
          </div>
          <div class="card">
            <div class="metaLabel" data-i18n="runtime.knownAgents">Known Agents</div>
            <div id="runtimeAgentList" class="runtimeAgentList"></div>
          </div>
        </div>
      </section>

      <section id="proceduralSkillsPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="procedural.section">Procedural Skills</div>
            <h2 class="panelTitle" data-i18n="procedural.title">Review digest candidates, manage skills, and validate task queries</h2>
            <p class="panelLead" data-i18n="procedural.lead">
              Turn reviewable procedural-memory candidates into operator-managed skills, record live outcomes,
              and verify the policy-driven memory query path from one workbench surface.
            </p>
          </div>
          <div id="proceduralSkillsStatus" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="procedural.ready">Ready</span>
          </div>
        </div>

        <div class="toolbar proceduralToolbar">
          <label>
            <span class="fieldLabel" data-i18n="field.project">Project</span>
            <select id="proceduralProjectSelect" class="selectInput">
              <option value="" data-i18n="field.chooseProject">Choose a project</option>
            </select>
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.localDate">Local Date</span>
            <input id="proceduralLocalDateInput" class="dateInput" type="date" />
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.status">Status</span>
            <select id="proceduralStatusFilter" class="selectInput">
              <option value="" data-i18n="procedural.allStatuses">All statuses</option>
              <option value="enabled" data-i18n="procedural.statusEnabled">Enabled</option>
              <option value="draft" data-i18n="procedural.statusDraft">Draft</option>
              <option value="disabled" data-i18n="procedural.statusDisabled">Disabled</option>
              <option value="retired" data-i18n="procedural.statusRetired">Retired</option>
            </select>
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.asOf">As Of</span>
            <input id="proceduralAsOfInput" class="dateInput" type="text" data-i18n-placeholder="placeholder.asOf" placeholder="2026-06-03T09:00:00.000Z" />
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.limit">Limit</span>
            <input id="proceduralLimitInput" class="numberInput" type="number" min="1" max="20" value="10" />
          </label>
          <div class="buttonSlot">
            <button id="proceduralRefreshButton" class="button primary" type="button" data-i18n="procedural.refreshButton">Refresh Workspace</button>
          </div>
        </div>

        <div class="toolbarFooter">
          <div id="proceduralStatusText" class="finePrint" data-i18n="procedural.noProjectSelected">Choose a project to inspect procedural skills.</div>
        </div>

        <div class="proceduralLayout">
          <div class="stack">
            <div class="card">
              <div class="metaLabel" data-i18n="procedural.candidateSection">Candidate Review</div>
              <p class="panelLead" style="margin-top: 10px;" data-i18n="procedural.candidateLead">
                Review skill_candidates from recent digests, then explicitly promote the reusable ones to draft.
              </p>
              <div id="proceduralCandidateList" class="listBlock" style="margin-top: 14px;">
                <div class="emptyState" data-i18n="procedural.noCandidatesPrompt">Choose a project to inspect digest candidates.</div>
              </div>
            </div>

            <div class="card">
              <div class="metaLabel" data-i18n="procedural.librarySection">Skills Library</div>
              <p class="panelLead" style="margin-top: 10px;" data-i18n="procedural.libraryLead">
                Inspect the current lifecycle state, confidence, and live counters for procedural skills in this project.
              </p>
              <div id="proceduralSkillsList" class="listBlock" style="margin-top: 14px;">
                <div class="emptyState" data-i18n="procedural.noSkillsPrompt">Choose a project to inspect the procedural skills library.</div>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="metaLabel" data-i18n="procedural.detailSection">Skill Detail</div>
              <div id="proceduralSkillDetail" class="listBlock" style="margin-top: 14px;">
                <div class="emptyState" data-i18n="procedural.noSkillSelected">Select a skill to inspect its trigger, summary, steps, and live counters.</div>
              </div>
            </div>

            <div class="card">
              <div class="metaLabel" data-i18n="procedural.feedbackSection">Feedback</div>
              <p class="panelLead" style="margin-top: 10px;" data-i18n="procedural.feedbackLead">
                Record whether a skill succeeded, failed, was rejected, or was skipped for the current project.
              </p>
              <div class="stack" style="margin-top: 14px;">
                <label>
                  <span class="fieldLabel" data-i18n="field.outcome">Outcome</span>
                  <select id="proceduralFeedbackOutcomeSelect" class="selectInput">
                    <option value="success" data-i18n="procedural.outcomeSuccess">Success</option>
                    <option value="failure" data-i18n="procedural.outcomeFailure">Failure</option>
                    <option value="rejected" data-i18n="procedural.outcomeRejected">Rejected</option>
                    <option value="skipped" data-i18n="procedural.outcomeSkipped">Skipped</option>
                  </select>
                </label>
                <label>
                  <span class="fieldLabel" data-i18n="field.taskText">Task Text</span>
                  <input id="proceduralFeedbackTaskInput" class="textInput" type="text" data-i18n-placeholder="placeholder.proceduralTaskText" placeholder="What task triggered this skill?" />
                </label>
                <label>
                  <span class="fieldLabel" data-i18n="field.notes">Notes</span>
                  <textarea id="proceduralFeedbackNotesInput" class="textArea" data-i18n-placeholder="placeholder.proceduralNotes" placeholder="Optional operator notes for this outcome."></textarea>
                </label>
              </div>
              <div class="toolbarFooter" style="margin-top: 14px;">
                <div id="proceduralFeedbackStatus" class="finePrint" data-i18n="procedural.feedbackIdle">Select a skill to record operator feedback.</div>
                <button id="proceduralFeedbackButton" class="button primary" type="button" data-i18n="procedural.feedbackButton">Submit Feedback</button>
              </div>
            </div>

            <div class="card">
              <div class="metaLabel" data-i18n="procedural.querySection">Query Validation</div>
              <p class="panelLead" style="margin-top: 10px;" data-i18n="procedural.queryLead">
                Run the policy-driven task query path and confirm which procedural skills and current rollout state are returned.
              </p>
              <div class="stack" style="margin-top: 14px;">
                <label>
                  <span class="fieldLabel" data-i18n="field.query">Query</span>
                  <textarea id="proceduralQueryInput" class="textArea" data-i18n-placeholder="placeholder.proceduralQuery" placeholder="How do I bootstrap the workbench and what is the rollout stage?"></textarea>
                </label>
              </div>
              <div class="toolbarFooter" style="margin-top: 14px;">
                <div id="proceduralQueryStatus" class="finePrint" data-i18n="procedural.queryIdle">Run a task query to validate policy resolution and rollout stage.</div>
                <button id="proceduralQueryButton" class="button primary" type="button" data-i18n="procedural.queryButton">Run Validation</button>
              </div>
              <div id="proceduralQueryResult" class="listBlock" style="margin-top: 14px;">
                <div class="emptyState" data-i18n="procedural.queryEmpty">No validation query has been run yet.</div>
              </div>
            </div>

            <div class="card">
              <div class="metaLabel" data-i18n="procedural.postTaskReviewSection">Automatic Post-task Reviews</div>
              <p class="panelLead" style="margin-top: 10px;" data-i18n="procedural.postTaskReviewLead">
                Inspect the latest hook-driven post-task review artifacts that were generated automatically after observation writes.
              </p>
              <div id="proceduralPostTaskReviewList" class="listBlock" style="margin-top: 14px;">
                <div class="emptyState" data-i18n="procedural.noPostTaskReviews">No automatic post-task reviews have been recorded yet.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="llmSettingsPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="llm.section">LLM Settings</div>
            <h2 class="panelTitle" data-i18n="llm.title">Model routing and live connection test</h2>
            <p class="panelLead" data-i18n="llm.lead">
              Switch the summarization model used by the worker, update the OpenAI-compatible endpoint,
              and run a small chat-completions test before trusting new settings.
            </p>
          </div>
          <div id="llmStatusLine" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="llm.loading">Loading LLM settings</span>
          </div>
        </div>

        <div class="llmLayout">
          <section class="card llmControlCard">
            <div class="metaLabel" data-i18n="llm.currentConfig">Current Config</div>
            <div class="llmStatusGrid" style="margin-top: 14px;">
              <div class="metricBadge"><strong data-i18n="llm.model">Model</strong> <span id="llmCurrentModel">-</span></div>
              <div class="metricBadge"><strong data-i18n="llm.endpoint">Endpoint</strong> <span id="llmCurrentEndpoint">-</span></div>
              <div class="metricBadge"><strong data-i18n="llm.apiKey">API Key</strong> <span id="llmKeyStatus">-</span></div>
              <div class="metricBadge"><strong data-i18n="llm.envFile">Env File</strong> <span id="llmEnvStatus">-</span></div>
              <div class="metricBadge"><strong data-i18n="llm.outputBudget">Output Budget</strong> <span id="llmBudgetStatus">-</span></div>
            </div>

            <div class="stack" style="margin-top: 18px;">
              <label>
                <span class="fieldLabel" data-i18n="llm.apiUrl">API Base URL</span>
                <input id="llmApiUrlInput" class="textInput" type="url" data-i18n-placeholder="llm.placeholderApiUrl" placeholder="https://api.deepseek.com/v1" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="llm.modelName">Model</span>
                <input id="llmModelInput" class="textInput" type="text" list="llmModelOptions" data-i18n-placeholder="llm.placeholderModel" placeholder="deepseek-chat" />
                <datalist id="llmModelOptions">
                  <option value="deepseek-chat"></option>
                  <option value="deepseek-reasoner"></option>
                  <option value="gpt-4.1"></option>
                  <option value="gpt-5"></option>
                  <option value="mimo-v2.5-pro"></option>
                  <option value="llama3.1"></option>
                </datalist>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="llm.apiKeyInput">API Key</span>
                <input id="llmApiKeyInput" class="textInput" type="password" autocomplete="new-password" data-i18n-placeholder="llm.placeholderApiKey" placeholder="Leave blank to keep existing key" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="llm.customHeaders">Custom Headers JSON</span>
                <textarea id="llmHeadersInput" class="textArea" data-i18n-placeholder="llm.placeholderHeaders" placeholder='{"X-Custom-Auth":"value"}'></textarea>
              </label>
              <label class="checkRow">
                <input id="llmDisableJsonModeInput" type="checkbox" />
                <span data-i18n="llm.disableJsonMode">Disable JSON mode for providers that reject response_format</span>
              </label>
              <fieldset class="budgetSettings">
                <legend class="fieldLabel" data-i18n="llm.outputBudget">Output Budget</legend>
                <label class="checkRow">
                  <input id="llmOutputBudgetEnabledInput" type="checkbox" aria-describedby="llmBudgetHint" />
                  <span data-i18n="llm.enableOutputBudget">Enable custom summary output limits</span>
                </label>
                <p id="llmBudgetHint" class="finePrint" aria-live="polite"></p>
                <div class="budgetFields">
                  <label>
                    <span class="fieldLabel" data-i18n="llm.observationMaxTokens">Tool summary limit (tokens)</span>
                    <input id="llmObservationMaxTokensInput" class="textInput" type="number" min="256" max="8192" step="1" value="1024" disabled />
                  </label>
                  <label>
                    <span class="fieldLabel" data-i18n="llm.digestMaxTokens">Daily digest limit (tokens)</span>
                    <input id="llmDigestMaxTokensInput" class="textInput" type="number" min="256" max="8192" step="1" value="3072" disabled />
                  </label>
                </div>
                <p class="finePrint" data-i18n="llm.budgetSaveHint">Save LLM Settings to apply. Turning limits off preserves these values for later.</p>
              </fieldset>
            </div>

            <div class="toolbarFooter">
              <div id="llmSaveStatus" class="finePrint" data-i18n="llm.saveHint">Save changes to update the running worker and the env file.</div>
              <div class="actionCluster">
                <button id="llmReloadButton" class="button secondary" type="button" data-i18n="llm.reload">Reload</button>
                <button id="llmSaveButton" class="button primary" type="button" data-i18n="llm.save">Save LLM Settings</button>
              </div>
            </div>
          </section>

          <aside class="card llmTestCard">
            <div class="metaLabel" data-i18n="llm.connectionTest">Connection Test</div>
            <h3 class="policyTitle" style="margin-top: 10px;" data-i18n="llm.testTitle">Verify this model before the next summary job</h3>
            <p class="panelLead" style="margin-top: 8px;" data-i18n="llm.testLead">
              Sends a tiny chat-completions request using the form values currently shown here. The test does not write observations.
            </p>
            <button id="llmTestButton" class="button primary" type="button" style="margin-top: 18px;" data-i18n="llm.runTest">Test Connection</button>
            <div id="llmTestResult" class="llmTestResult emptyState" style="margin-top: 16px;" data-i18n="llm.noTestYet">
              No connection test has been run yet.
            </div>
          </aside>
        </div>
      </section>

      <section id="projectContextPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="projectContext.section">Project Context</div>
            <h2 class="panelTitle" data-i18n="projectContext.title">Curated startup context and health metrics</h2>
            <p class="panelLead" data-i18n="projectContext.lead">
              Inspect the exact ProjectContextView that hook-backed agents and get_project_context
              rely on, plus payload and summary quality metrics.
            </p>
          </div>
          <div id="projectContextStatus" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="projectContext.ready">Ready</span>
          </div>
        </div>

        <div class="toolbar compact">
          <label>
            <span class="fieldLabel" data-i18n="field.project">Project</span>
            <select id="contextProjectSelect" class="selectInput">
              <option value="" data-i18n="field.chooseProject">Choose a project</option>
            </select>
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.limit">Limit</span>
            <input id="contextLimitInput" class="numberInput" type="number" min="1" max="50" value="10" />
          </label>
          <div class="buttonSlot">
            <button id="contextRefreshButton" class="button primary" type="button" data-i18n="projectContext.refresh">Refresh Context</button>
          </div>
        </div>

        <div class="toolbarFooter">
          <div id="contextStatusText" class="finePrint" data-i18n="projectContext.noProjectSelected">No project selected.</div>
          <div id="contextMetrics" class="metricsRow"></div>
        </div>

        <div class="sectionGrid">
          <div class="stack">
            <div class="card">
              <div class="metaLabel" data-i18n="projectContext.currentStructuredState">Current Structured State</div>
              <div id="currentStateList" class="listBlock" style="margin-top: 12px;"></div>
            </div>
            <div class="card">
              <div class="metaLabel" data-i18n="projectContext.dailyDigests">Daily Digests</div>
              <div id="dailyDigestList" class="listBlock" style="margin-top: 12px;"></div>
            </div>
            <div class="card">
              <div class="metaLabel" data-i18n="projectContext.summaryBlocks">Summary Blocks</div>
              <div id="summaryBlocksList" class="listBlock" style="margin-top: 12px;"></div>
            </div>
            <div class="card">
              <div class="metaLabel" data-i18n="projectContext.recentObservations">Recent Observations</div>
              <div id="recentObservationsList" class="listBlock" style="margin-top: 12px;"></div>
            </div>
          </div>

          <div class="card renderedBlock">
            <div class="metaLabel" data-i18n="projectContext.renderedStartupView">Rendered Startup View</div>
            <div class="divider"></div>
            <pre id="contextRenderedText" data-i18n="projectContext.chooseProjectPrompt">Choose a project to inspect its current startup context.</pre>
          </div>
        </div>
      </section>

      <section id="stateLabPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="stateLab.section">State Lab</div>
            <h2 class="panelTitle" data-i18n="stateLab.title">Inspect and explicitly write structured state facts</h2>
            <p class="panelLead" data-i18n="stateLab.lead">
              The UI only performs explicit state reads and writes. It does not auto-promote observations
              into state candidates.
            </p>
          </div>
          <div id="stateLabStatus" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="stateLab.ready">Ready</span>
          </div>
        </div>

        <div class="splitGrid">
          <div class="card">
            <div class="metaLabel" data-i18n="stateLab.readStateFacts">Read State Facts</div>
            <div class="toolbar wide" style="margin-top: 14px;">
              <label>
                <span class="fieldLabel" data-i18n="field.project">Project</span>
                <select id="stateProjectSelect" class="selectInput">
                  <option value="" data-i18n="field.chooseProject">Choose a project</option>
                </select>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.entityType">Entity Type</span>
                <input id="stateEntityTypeInput" class="textInput" type="text" data-i18n-placeholder="placeholder.entityType" placeholder="project / agent / service" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.entityKey">Entity Key</span>
                <input id="stateEntityKeyInput" class="textInput" type="text" data-i18n-placeholder="placeholder.optional" placeholder="Optional" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.factKey">Fact Key</span>
                <input id="stateFactKeyInput" class="textInput" type="text" data-i18n-placeholder="placeholder.optional" placeholder="Optional" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.asOf">As Of</span>
                <input id="stateAsOfInput" class="dateInput" type="text" data-i18n-placeholder="placeholder.asOf" placeholder="2026-06-03T09:00:00.000Z" />
              </label>
            </div>
            <div class="toolbarFooter">
              <div id="stateReadStatus" class="finePrint" data-i18n="stateLab.readCurrentFacts">Read current facts for the selected project.</div>
              <button id="stateRefreshButton" class="button primary" type="button" data-i18n="stateLab.loadFacts">Load Facts</button>
            </div>
            <div class="divider"></div>
            <div class="metaLabel" data-i18n="stateLab.results">Results</div>
            <div id="stateFactsList" class="factsTable" style="margin-top: 12px;"></div>
          </div>

          <div class="card">
            <div class="metaLabel" data-i18n="stateLab.writeStateFact">Write State Fact</div>
            <div class="stack" style="margin-top: 14px;">
              <label>
                <span class="fieldLabel" data-i18n="field.project">Project</span>
                <select id="stateWriteProjectSelect" class="selectInput">
                  <option value="" data-i18n="field.chooseProject">Choose a project</option>
                </select>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.entityType">Entity Type</span>
                <input id="stateWriteEntityTypeInput" class="textInput" type="text" data-i18n-placeholder="placeholder.entityType" placeholder="project / agent / service" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.entityKey">Entity Key</span>
                <input id="stateWriteEntityKeyInput" class="textInput" type="text" data-i18n-placeholder="placeholder.optional" placeholder="Optional" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.factKey">Fact Key</span>
                <input id="stateWriteFactKeyInput" class="textInput" type="text" data-i18n-placeholder="placeholder.factKeyRequired" placeholder="Required" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.value">Value</span>
                <textarea id="stateValueInput" class="textArea" data-i18n-placeholder="placeholder.value" placeholder='String or JSON, e.g. "green" or {"mode":"mcp"}'></textarea>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.effectiveAt">Effective At</span>
                <input id="stateEffectiveAtInput" class="dateInput" type="text" data-i18n-placeholder="placeholder.effectiveAt" placeholder="Optional ISO timestamp" />
              </label>
            </div>
            <div class="toolbarFooter">
              <div id="stateWriteStatus" class="finePrint" data-i18n="stateLab.explicitOnlyWritePath">Explicit-only write path.</div>
              <button id="stateWriteButton" class="button primary" type="button" data-i18n="stateLab.writeButton">Write State Fact</button>
            </div>
          </div>
        </div>
      </section>

      <section id="searchDiagnosticsPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="search.section">Search Diagnostics</div>
            <h2 class="panelTitle" data-i18n="search.title">Expose hybrid ranking details without changing the algorithm</h2>
            <p class="panelLead" data-i18n="search.lead">
              Use wide queries to observe how FTS, vector similarity, and low-signal titles affect current
              ranking order.
            </p>
          </div>
          <div id="searchDiagnosticsStatus" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="search.waiting">Waiting for query</span>
          </div>
        </div>

        <div class="toolbar">
          <label>
            <span class="fieldLabel" data-i18n="field.project">Project</span>
            <select id="searchProjectSelect" class="selectInput">
              <option value="" data-i18n="field.chooseProject">Choose a project</option>
            </select>
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.query">Query</span>
            <input id="searchQueryInput" class="textInput" type="text" data-i18n-placeholder="placeholder.searchQuery" placeholder="e.g. structured state startup context" />
          </label>
          <label>
            <span class="fieldLabel" data-i18n="field.limit">Limit</span>
            <input id="searchLimitInput" class="numberInput" type="number" min="1" max="50" value="10" />
          </label>
          <div class="buttonSlot">
            <button id="searchRunButton" class="button primary" type="button" data-i18n="search.runButton">Run Diagnostics</button>
          </div>
        </div>

        <div class="toolbarFooter">
          <div id="searchStatusText" class="finePrint" data-i18n="search.statusPrompt">Run a query to inspect score composition.</div>
          <div id="searchMetaText" class="finePrint"></div>
        </div>

        <div id="searchResults" class="scoreGrid"></div>
      </section>

      <section id="observationLedgerPanel" class="viewPanel glassPanel">
        <div class="panelHeader">
          <div>
            <div class="sectionEyebrow" data-i18n="ledger.section">Observation Ledger</div>
            <h2 class="panelTitle" data-i18n="ledger.title">Full observation browsing and detail drill-down</h2>
            <p class="panelLead" data-i18n="ledger.lead">
              Keep the raw ledger as the deep inspection surface while the other panels focus on structured
              state, curated startup context, and hybrid search diagnostics.
            </p>
          </div>
          <div id="ledgerStatusLine" class="statusLine">
            <span class="statusDot"></span>
            <span data-i18n="ledger.ready">Ready</span>
          </div>
        </div>

        <div class="ledgerLayout">
          <div class="card">
            <div class="toolbar">
              <label>
                <span class="fieldLabel" data-i18n="field.query">Query</span>
                <input id="queryInput" class="textInput" type="text" data-i18n-placeholder="placeholder.ledgerQuery" placeholder="Search title, narrative, files, project, agent" />
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.project">Project</span>
                <select id="projectSelect" class="selectInput">
                  <option value="" data-i18n="field.allProjects">All projects</option>
                </select>
              </label>
              <label>
                <span class="fieldLabel" data-i18n="field.agent">Agent</span>
                <select id="agentSelect" class="selectInput">
                  <option value="" data-i18n="field.allAgents">All agents</option>
                </select>
              </label>
              <div class="buttonSlot">
                <button id="refreshButton" class="button primary" type="button" data-i18n="ledger.refresh">Refresh Ledger</button>
              </div>
            </div>

            <div class="toolbarFooter">
              <div id="listStatus" class="statusLine">
                <span class="statusDot"></span>
                <span data-i18n="ledger.ready">Ready</span>
              </div>
              <div id="listMeta" class="listMeta" data-i18n="ledger.showingLatest">Showing latest records</div>
            </div>

            <div id="recordsList" class="recordsList">
              <div class="emptyState" data-i18n="ledger.loadingObservations">Loading observations...</div>
            </div>
          </div>

          <div class="detailPanel card">
            <div class="metaLabel" data-i18n="ledger.selectedObservation">Selected Observation</div>
            <h3 id="detailTitle" class="panelTitle" style="font-size: 28px; margin-top: 10px;" data-i18n="ledger.chooseRecord">Choose a record</h3>
            <div id="detailTimestamp" class="finePrint" style="margin-top: 8px;"></div>
            <div class="divider"></div>
            <div id="detailContent" class="emptyState" data-i18n="ledger.selectRecordPrompt">
              Select an observation from the ledger to inspect narrative, facts, concepts, and touched files.
            </div>
          </div>
        </div>
      </section>
    </section>
      </section>
      </div>
    </main>
  </div>
  `;
}
