export function renderAdminWorkbenchMarkup(): string {
  return `
  <main class="shell">
    <section class="hero">
      <div class="heroLayout">
        <div>
          <div class="heroTopRow">
            <span class="eyebrow" data-i18n="hero.eyebrow">AgentMemory Admin Workbench</span>
            <div id="localeToggle" class="localeToggle">
              <span class="localeToggleLabel" data-i18n="locale.label">UI Language</span>
              <div class="localeToggleButtons">
                <button class="localeButton is-active" type="button" data-locale-choice="en">EN</button>
                <button class="localeButton" type="button" data-locale-choice="zh-CN">中文</button>
              </div>
            </div>
          </div>
          <h1 data-i18n="hero.title">Glass Runtime Console for Shared Agent Context</h1>
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
      </div>

      <div class="policyRow">
        <section id="readPolicyCard" class="policyCard readPolicy">
          <div>
            <div class="policyTitleRow">
              <h2 class="policyTitle" data-i18n="policy.readTitle">Read Memory</h2>
              <span id="readPolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
            </div>
            <p class="panelLead" data-i18n="policy.readLead">Controls startup context, state reads, hybrid search, and MCP read tools.</p>
            <div id="readPolicyMeta" class="finePrint" style="margin-top: 10px;" data-i18n="policy.loadingCurrentState">Loading current state...</div>
          </div>
          <label class="switch">
            <input id="readToggle" type="checkbox" />
            <span class="slider"></span>
          </label>
        </section>

        <section id="writePolicyCard" class="policyCard writePolicy">
          <div>
            <div class="policyTitleRow">
              <h2 class="policyTitle" data-i18n="policy.writeTitle">Write Memory</h2>
              <span id="writePolicyState" class="policyBadge" data-i18n="policy.loading">Loading</span>
            </div>
            <p class="panelLead" data-i18n="policy.writeLead">Controls observation writes, state writes, session updates, and MCP record tools.</p>
            <div id="writePolicyMeta" class="finePrint" style="margin-top: 10px;" data-i18n="policy.loadingCurrentState">Loading current state...</div>
          </div>
          <label class="switch">
            <input id="writeToggle" type="checkbox" />
            <span class="slider"></span>
          </label>
        </section>
      </div>
    </section>

    <section class="dock">
      <div class="segmented" id="viewTabs">
        <button class="segmentButton is-active" type="button" data-panel-target="runtimePanel" data-i18n="tabs.runtime">Runtime</button>
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
  </main>
  `;
}
