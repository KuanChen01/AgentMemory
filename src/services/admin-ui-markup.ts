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

const PLACEHOLDER_VIEWS: Array<{ id: string; icon: string; titleKey: string; title: string; leadKey: string; lead: string }> = [
  { id: 'activityView', icon: 'activity', titleKey: 'nav.activity', title: 'Activity', leadKey: 'shell.activityLead', lead: 'What your agents did in a time window: sessions, outcomes and context per project and agent.' },
  { id: 'memoryView', icon: 'memory', titleKey: 'nav.memory', title: 'Memory', leadKey: 'shell.memoryLead', lead: 'Browse and search every memory by kind, source, project, agent and date.' },
  { id: 'pipelineView', icon: 'pipeline', titleKey: 'nav.pipeline', title: 'Pipeline', leadKey: 'shell.pipelineLead', lead: 'Task capture, consolidation results, fallbacks, duplicate flags and LLM usage.' },
  { id: 'digestsView', icon: 'digests', titleKey: 'nav.digests', title: 'Digests & Reviews', leadKey: 'shell.digestsLead', lead: 'Daily digests per project, the digest scheduler and Vault review checkpoints.' },
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

function renderSidebar(): string {
  const navItems = ADMIN_UI_NAV_ITEMS.map((item, index) => `
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
        <label class="devToggle" for="devToolsToggle" data-i18n-title="shell.devToolsToggleHint" title="Show the legacy workbench panels">
          ${renderAdminIcon('terminal', 'navIcon')}
          <span class="devToggleLabel" data-i18n="shell.devToolsToggle">Developer tools</span>
          <span class="iosSwitch"><input id="devToolsToggle" type="checkbox" role="switch" /><span class="track" aria-hidden="true"></span></span>
        </label>
      </div>
    </aside>`;
}

function renderTopBar(): string {
  return `
      <header class="topBar">
        <h1 id="pageTitle" class="pageTitle" data-i18n="nav.home">Home</h1>
        <div class="topActions">
          <label id="readPolicyCard" class="policyPill glassPill readPolicy" for="readToggle">
            <span class="pillLabel" data-i18n="shell.read">Read</span>
            <span class="pillDot" aria-hidden="true"></span>
            <span id="readPolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
            <input id="readToggle" class="visuallyHidden" type="checkbox" role="switch" />
          </label>
          <label id="writePolicyCard" class="policyPill glassPill writePolicy" for="writeToggle">
            <span class="pillLabel" data-i18n="shell.write">Write</span>
            <span class="pillDot" aria-hidden="true"></span>
            <span id="writePolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
            <input id="writeToggle" class="visuallyHidden" type="checkbox" role="switch" />
          </label>
          <div id="localeToggle" class="localeToggle glassPill" role="group">
            <span class="visuallyHidden" data-i18n="locale.label">UI Language</span>
            <button class="localeButton is-active" type="button" data-locale-choice="en">EN</button>
            <span class="localeSep" aria-hidden="true">/</span>
            <button class="localeButton" type="button" data-locale-choice="zh-CN">中文</button>
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
          <section class="glassCard homeCard" id="homeTodayCard">
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

          <section class="glassCard homeCard" id="homeAttentionCard">
            <header class="cardHead">
              <h2 class="cardTitle" data-i18n="home.attentionTitle">Needs attention</h2>
              <span class="countBadge" id="homeAttentionCount" hidden></span>
            </header>
            <div class="attentionLoading" id="homeAttentionLoading" data-i18n="home.loading">Loading…</div>
            <div class="allClear" id="homeAttentionEmpty" hidden>
              <div class="allClearOrb">${renderAdminIcon('check', 'allClearIcon')}</div>
              <div class="allClearTitle" data-i18n="home.allClear">All clear</div>
              <p class="allClearLead" data-i18n="home.allClearLead">No fallbacks, stuck tasks or failed digests today</p>
            </div>
            <ul class="attentionList" id="homeAttentionList" hidden></ul>
          </section>
        </div>

        <section class="glassCard homeCard homeRecent" id="homeRecentCard">
          <header class="cardHead">
            <h2 class="cardTitle" data-i18n="home.recentTitle">Recent memories</h2>
            <!-- TODO(ui): point "View all" at the Memory view once it lands in phase 2. -->
            <button class="linkButton" id="homeRecentViewAll" type="button" data-nav-target="devToolsView" data-dev-panel="observationLedgerPanel" data-requires-dev-tools="true">
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

function renderPlaceholderViews(): string {
  return PLACEHOLDER_VIEWS.map((view) => `
      <section id="${view.id}" class="appView" aria-labelledby="pageTitle">
        <div class="glassCard placeholderCard">
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
          <div class="glassCard placeholderCard">
            <div class="placeholderIcon">${renderAdminIcon('settings', 'placeholderGlyph')}</div>
            <h2 class="placeholderTitle" data-i18n="nav.settings">Settings</h2>
            <p class="placeholderLead" data-i18n="shell.settingsLead">Memory switches, LLM connection, digest scheduler and version information.</p>
            <span class="soonChip" data-i18n="shell.comingSoon">Coming in the next phase</span>
          </div>
          <div class="glassCard homeCard switchesCard">
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
  <div class="appShell">${renderSidebar()}
    <main class="mainArea" id="mainArea">
      <div class="mainInner">${renderTopBar()}${renderHomeView()}${renderPlaceholderViews()}${renderSettingsView()}

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
