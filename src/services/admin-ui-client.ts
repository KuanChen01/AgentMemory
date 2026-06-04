export function renderAdminWorkbenchClientScript(pollIntervalMs: number): string {
  return `
  const POLL_INTERVAL_MS = ${JSON.stringify(pollIntervalMs)};
  const state = {
    activePanel: "runtimePanel",
    filters: {
      page: 1,
      pageSize: 25,
      project: "",
      agent: "",
      query: "",
    },
    overview: null,
    pendingPolicy: null,
    records: [],
    selectedId: null,
    isSavingPolicy: false,
    contextPayload: null,
    statePayload: null,
    searchPayload: null,
    pollHandle: null,
  };

  const els = {
    observationsCount: document.getElementById("observationsCount"),
    sessionsCount: document.getElementById("sessionsCount"),
    projectsCount: document.getElementById("projectsCount"),
    agentsCount: document.getElementById("agentsCount"),
    currentStateFactsCount: document.getElementById("currentStateFactsCount"),
    statusText: document.getElementById("statusText"),
    policyUpdatedAt: document.getElementById("policyUpdatedAt"),
    runtimeProjectList: document.getElementById("runtimeProjectList"),
    runtimeAgentList: document.getElementById("runtimeAgentList"),
    runtimeStatusText: document.getElementById("runtimeStatusText"),
    readPolicyCard: document.getElementById("readPolicyCard"),
    writePolicyCard: document.getElementById("writePolicyCard"),
    readPolicyState: document.getElementById("readPolicyState"),
    writePolicyState: document.getElementById("writePolicyState"),
    readPolicyMeta: document.getElementById("readPolicyMeta"),
    writePolicyMeta: document.getElementById("writePolicyMeta"),
    readToggle: document.getElementById("readToggle"),
    writeToggle: document.getElementById("writeToggle"),
    viewTabs: document.getElementById("viewTabs"),
    panels: Array.from(document.querySelectorAll(".viewPanel")),
    projectSelect: document.getElementById("projectSelect"),
    agentSelect: document.getElementById("agentSelect"),
    queryInput: document.getElementById("queryInput"),
    refreshButton: document.getElementById("refreshButton"),
    listStatus: document.getElementById("listStatus"),
    listMeta: document.getElementById("listMeta"),
    recordsList: document.getElementById("recordsList"),
    detailTitle: document.getElementById("detailTitle"),
    detailTimestamp: document.getElementById("detailTimestamp"),
    detailContent: document.getElementById("detailContent"),
    contextProjectSelect: document.getElementById("contextProjectSelect"),
    contextLimitInput: document.getElementById("contextLimitInput"),
    contextRefreshButton: document.getElementById("contextRefreshButton"),
    contextStatusText: document.getElementById("contextStatusText"),
    contextMetrics: document.getElementById("contextMetrics"),
    contextRenderedText: document.getElementById("contextRenderedText"),
    currentStateList: document.getElementById("currentStateList"),
    summaryBlocksList: document.getElementById("summaryBlocksList"),
    recentObservationsList: document.getElementById("recentObservationsList"),
    projectContextStatus: document.getElementById("projectContextStatus"),
    stateProjectSelect: document.getElementById("stateProjectSelect"),
    stateEntityTypeInput: document.getElementById("stateEntityTypeInput"),
    stateEntityKeyInput: document.getElementById("stateEntityKeyInput"),
    stateFactKeyInput: document.getElementById("stateFactKeyInput"),
    stateAsOfInput: document.getElementById("stateAsOfInput"),
    stateRefreshButton: document.getElementById("stateRefreshButton"),
    stateReadStatus: document.getElementById("stateReadStatus"),
    stateFactsList: document.getElementById("stateFactsList"),
    stateLabStatus: document.getElementById("stateLabStatus"),
    stateWriteProjectSelect: document.getElementById("stateWriteProjectSelect"),
    stateWriteEntityTypeInput: document.getElementById("stateWriteEntityTypeInput"),
    stateWriteEntityKeyInput: document.getElementById("stateWriteEntityKeyInput"),
    stateWriteFactKeyInput: document.getElementById("stateWriteFactKeyInput"),
    stateValueInput: document.getElementById("stateValueInput"),
    stateEffectiveAtInput: document.getElementById("stateEffectiveAtInput"),
    stateWriteButton: document.getElementById("stateWriteButton"),
    stateWriteStatus: document.getElementById("stateWriteStatus"),
    searchProjectSelect: document.getElementById("searchProjectSelect"),
    searchQueryInput: document.getElementById("searchQueryInput"),
    searchLimitInput: document.getElementById("searchLimitInput"),
    searchRunButton: document.getElementById("searchRunButton"),
    searchStatusText: document.getElementById("searchStatusText"),
    searchMetaText: document.getElementById("searchMetaText"),
    searchResults: document.getElementById("searchResults"),
    searchDiagnosticsStatus: document.getElementById("searchDiagnosticsStatus"),
  };

  function formatDate(value) {
    if (!value) return "Unknown timestamp";
    const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("T") ? "" : "Z"));
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function summarize(text, max = 160) {
    const normalized = String(text || "").trim();
    if (!normalized) return "No narrative available.";
    return normalized.length > max ? normalized.slice(0, max - 1) + "..." : normalized;
  }

  function setStatusLine(element, message, variant) {
    element.className = "statusLine" + (variant ? " " + variant : "");
    element.innerHTML = '<span class="statusDot"></span><span>' + escapeHtml(message) + '</span>';
  }

  function comparePolicyFreshness(left, right) {
    const leftStamp = String(left && left.updatedAt || "");
    const rightStamp = String(right && right.updatedAt || "");
    if (!leftStamp || !rightStamp || leftStamp === rightStamp) {
      return 0;
    }
    return leftStamp > rightStamp ? 1 : -1;
  }

  function getDisplayedPolicy() {
    if (state.pendingPolicy) return state.pendingPolicy;
    if (state.overview && state.overview.policy) return state.overview.policy;
    return { readEnabled: false, writeEnabled: false, updatedAt: "" };
  }

  function getPolicySummary(policy) {
    return "Read: " + (policy.readEnabled ? "Enabled" : "Disabled") + " / Write: " + (policy.writeEnabled ? "Enabled" : "Disabled");
  }

  function getPolicyMeta(kind, enabled) {
    if (state.isSavingPolicy) {
      return "Saving target policy and waiting for worker confirmation.";
    }
    if (kind === "read") {
      return enabled
        ? "Agents can restore state, context, search results, and explicit read tools."
        : "Agents cannot restore past context, state, or search results.";
    }
    return enabled
      ? "Agents can write observations, sessions, and explicit state facts."
      : "Agents cannot record new observations, sessions, or structured state.";
  }

  function renderPolicyCard(kind, enabled) {
    const isRead = kind === "read";
    const card = isRead ? els.readPolicyCard : els.writePolicyCard;
    const toggle = isRead ? els.readToggle : els.writeToggle;
    const badge = isRead ? els.readPolicyState : els.writePolicyState;
    const meta = isRead ? els.readPolicyMeta : els.writePolicyMeta;
    const variant = isRead ? "readPolicy" : "writePolicy";
    card.className = "policyCard " + variant + " " +
      (enabled ? "is-enabled" : "is-disabled") +
      (state.isSavingPolicy ? " is-saving" : "");
    toggle.checked = !!enabled;
    toggle.disabled = state.isSavingPolicy;
    badge.textContent = state.isSavingPolicy ? "Saving" : enabled ? "Enabled" : "Disabled";
    badge.className = "policyBadge " + (state.isSavingPolicy ? "saving" : enabled ? "enabled" : "disabled");
    meta.textContent = getPolicyMeta(kind, enabled);
  }

  function syncSelect(select, values, emptyLabel, selectedValue, allowEmpty = true) {
    const options = [];
    if (allowEmpty) {
      options.push('<option value="">' + escapeHtml(emptyLabel) + '</option>');
    }
    (values || []).forEach((value) => {
      const escaped = escapeHtml(value);
      const selected = value === selectedValue ? ' selected' : '';
      options.push('<option value="' + escaped + '"' + selected + '>' + escaped + '</option>');
    });
    select.innerHTML = options.join("");
  }

  function ensureProjectDefaults(projects) {
    const firstProject = Array.isArray(projects) && projects.length > 0 ? projects[0] : "";
    if (firstProject && !els.contextProjectSelect.value) {
      els.contextProjectSelect.value = firstProject;
    }
    if (firstProject && !els.stateProjectSelect.value) {
      els.stateProjectSelect.value = firstProject;
    }
    if (firstProject && !els.stateWriteProjectSelect.value) {
      els.stateWriteProjectSelect.value = firstProject;
    }
    if (firstProject && !els.searchProjectSelect.value) {
      els.searchProjectSelect.value = firstProject;
    }
  }

  function renderRuntimeLists(items, target) {
    if (!items || items.length === 0) {
      target.innerHTML = '<span class="pill subtle">No data yet</span>';
      return;
    }
    target.innerHTML = items.map((item) => '<span class="tag">' + escapeHtml(item) + '</span>').join("");
  }

  function renderOverview() {
    if (!state.overview) return;
    const policy = getDisplayedPolicy();
    const stats = state.overview.stats || {};
    els.observationsCount.textContent = String(stats.observations || 0);
    els.sessionsCount.textContent = String(stats.sessions || 0);
    els.projectsCount.textContent = String(stats.projects || 0);
    els.agentsCount.textContent = String(stats.agents || 0);
    els.currentStateFactsCount.textContent = String(stats.currentStateFacts || 0);
    renderPolicyCard("read", !!policy.readEnabled);
    renderPolicyCard("write", !!policy.writeEnabled);
    els.statusText.textContent = (state.isSavingPolicy ? "Saving policy. " : "") + getPolicySummary(policy);
    els.statusText.className = "statusValue" + (state.isSavingPolicy ? " is-saving" : "");
    els.policyUpdatedAt.textContent = state.isSavingPolicy
      ? "Pending target state is shown until the worker confirms it."
      : "Policy updated: " + formatDate(policy.updatedAt || state.overview.refreshedAt);
    els.runtimeStatusText.textContent = getPolicySummary(policy);

    const projects = state.overview.projects || [];
    const agents = state.overview.agents || [];
    renderRuntimeLists(projects, els.runtimeProjectList);
    renderRuntimeLists(agents, els.runtimeAgentList);

    syncSelect(els.projectSelect, projects, "All projects", state.filters.project, true);
    syncSelect(els.agentSelect, agents, "All agents", state.filters.agent, true);
    syncSelect(els.contextProjectSelect, projects, "Choose a project", els.contextProjectSelect.value, true);
    syncSelect(els.stateProjectSelect, projects, "Choose a project", els.stateProjectSelect.value, true);
    syncSelect(els.stateWriteProjectSelect, projects, "Choose a project", els.stateWriteProjectSelect.value, true);
    syncSelect(els.searchProjectSelect, projects, "Choose a project", els.searchProjectSelect.value, true);
    ensureProjectDefaults(projects);
  }

  function renderContextCards(view) {
    if (!view || view.disabled) {
      els.currentStateList.innerHTML = '<div class="emptyState">Context read is currently disabled.</div>';
      els.summaryBlocksList.innerHTML = '<div class="emptyState">Summary blocks unavailable.</div>';
      els.recentObservationsList.innerHTML = '<div class="emptyState">Recent observations unavailable.</div>';
      return;
    }

    els.currentStateList.innerHTML = Array.isArray(view.current_state) && view.current_state.length > 0
      ? view.current_state.map((fact) => (
          '<div class="factCard">' +
            '<div class="metaLabel">' + escapeHtml(fact.entity_type + ":" + fact.entity_key) + '</div>' +
            '<div style="margin-top: 8px; font-weight: 700;">' + escapeHtml(fact.fact_key) + '</div>' +
            '<div class="factValue subtle" style="margin-top: 6px;">' + escapeHtml(typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)) + '</div>' +
            '<div class="finePrint" style="margin-top: 8px;">Effective ' + escapeHtml(formatDate(fact.effective_at)) + '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">No current structured state recorded for this project.</div>';

    els.summaryBlocksList.innerHTML = Array.isArray(view.summary_blocks) && view.summary_blocks.length > 0
      ? view.summary_blocks.map((block) => (
          '<div class="summaryCard">' +
            '<div class="policyTitleRow">' +
              '<div style="font-weight: 700;">' + escapeHtml(block.title) + '</div>' +
              '<span class="tag">' + escapeHtml(block.agent_id) + '</span>' +
            '</div>' +
            '<div class="finePrint" style="margin-top: 4px;">' + escapeHtml(formatDate(block.created_at)) + '</div>' +
            '<div style="margin-top: 10px;">' +
              (block.lines || []).map((line) => '<div class="summaryLine subtle">' + escapeHtml(line) + '</div>').join("") +
            '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">No summary blocks available.</div>';

    els.recentObservationsList.innerHTML = Array.isArray(view.recent_observations) && view.recent_observations.length > 0
      ? view.recent_observations.map((entry) => (
          '<div class="obsCard">' +
            '<div class="policyTitleRow">' +
              '<div style="font-weight: 700;">' + escapeHtml(entry.title) + '</div>' +
              '<span class="tag">' + escapeHtml(entry.agent_id) + '</span>' +
            '</div>' +
            '<div class="finePrint" style="margin-top: 6px;">' + escapeHtml(formatDate(entry.created_at)) + '</div>' +
            '<div class="mono subtle" style="margin-top: 8px;">' + escapeHtml(entry.id) + '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">No recent observations available.</div>';
  }

  function renderProjectContext() {
    const payload = state.contextPayload;
    if (!payload) {
      els.contextStatusText.textContent = "Choose a project to inspect its current startup context.";
      els.contextMetrics.innerHTML = "";
      els.contextRenderedText.textContent = "Choose a project to inspect its current startup context.";
      els.currentStateList.innerHTML = '<div class="emptyState">No project selected.</div>';
      els.summaryBlocksList.innerHTML = '<div class="emptyState">No summary blocks to display.</div>';
      els.recentObservationsList.innerHTML = '<div class="emptyState">No recent observations to display.</div>';
      return;
    }

    const metrics = payload.metrics || {};
    const view = payload.view || {};
    els.contextMetrics.innerHTML = [
      '<span class="metricBadge"><strong>Payload</strong> ' + escapeHtml(String(metrics.payloadBytes || 0)) + ' bytes</span>',
      '<span class="metricBadge"><strong>Summary</strong> ' + escapeHtml(String(metrics.summaryCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>Low-signal</strong> ' + escapeHtml(String(metrics.lowSignalCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>Duplicate titles</strong> ' + escapeHtml(String(metrics.duplicateTitleCount || 0)) + '</span>'
    ].join("");
    els.contextRenderedText.textContent = payload.rendered || "No structured context recorded yet.";
    els.contextStatusText.textContent = view.disabled
      ? String(view.message || "Context is disabled.")
      : "Generated at " + formatDate(view.generated_at);
    setStatusLine(els.projectContextStatus, view.disabled ? "Context disabled" : "Context loaded", view.disabled ? "warning" : "");
    renderContextCards(view);
  }

  function renderStateFacts() {
    const payload = state.statePayload;
    if (!payload) {
      els.stateFactsList.innerHTML = '<div class="emptyState">Choose a project and load state facts.</div>';
      return;
    }

    if (payload.disabled) {
      els.stateFactsList.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || "State read is disabled.") + '</div>';
      return;
    }

    els.stateFactsList.innerHTML = Array.isArray(payload.facts) && payload.facts.length > 0
      ? payload.facts.map((fact) => (
          '<div class="factCard">' +
            '<div class="metaLabel">' + escapeHtml(fact.entity_type + ":" + fact.entity_key) + '</div>' +
            '<div style="margin-top: 8px; font-weight: 700;">' + escapeHtml(fact.fact_key) + '</div>' +
            '<div class="factValue subtle" style="margin-top: 6px;">' + escapeHtml(typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)) + '</div>' +
            '<div class="finePrint" style="margin-top: 8px;">Effective ' + escapeHtml(formatDate(fact.effective_at)) + '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">No matching state facts for the current query.</div>';
  }

  function renderSearchResults() {
    const payload = state.searchPayload;
    if (!payload) {
      els.searchResults.innerHTML = '<div class="emptyState">Run a query to inspect hybrid search ranking.</div>';
      return;
    }

    if (payload.disabled) {
      els.searchResults.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || "Search is disabled.") + '</div>';
      return;
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    els.searchResults.innerHTML = results.length > 0
      ? results.map((result) => (
          '<div class="scoreCard">' +
            '<div class="policyTitleRow">' +
              '<div style="font-weight: 700;">' + escapeHtml(result.title) + '</div>' +
              '<span class="tag">' + escapeHtml(result.agent_id) + '</span>' +
              (result.low_signal_title ? '<span class="statusChip warning">Low Signal</span>' : '') +
            '</div>' +
            '<div class="metaRow">' +
              '<span class="scoreBadge"><strong>Hybrid</strong> ' + escapeHtml(Number(result.hybrid_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>FTS</strong> ' + escapeHtml(Number(result.fts_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>Vector</strong> ' + escapeHtml(Number(result.vector_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>Date</strong> ' + escapeHtml(formatDate(result.created_at)) + '</span>' +
            '</div>' +
            '<p class="recordSummary" style="margin-top: 10px;">' + escapeHtml(summarize(result.narrative, 220)) + '</p>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">No results for the current diagnostic query.</div>';
  }

  function renderRecords(total) {
    if (!state.records.length) {
      els.recordsList.innerHTML = '<div class="emptyState">No observations matched the current filters.</div>';
      if (!state.selectedId) {
        renderDetail(null);
      }
      return;
    }

    if (!state.records.some((record) => record.id === state.selectedId)) {
      state.selectedId = state.records[0].id;
    }

    els.recordsList.innerHTML = state.records.map((record) => {
      const activeClass = record.id === state.selectedId ? " active" : "";
      return '<button class="recordItem' + activeClass + '" type="button" data-record-id="' + escapeHtml(record.id) + '">' +
        '<div class="policyTitleRow">' +
          '<div style="font-weight: 700;">' + escapeHtml(record.title) + '</div>' +
          '<span class="tag">' + escapeHtml(record.agent_id) + '</span>' +
        '</div>' +
        '<p class="recordSummary" style="margin-top: 10px;">' + escapeHtml(summarize(record.narrative)) + '</p>' +
        '<div class="metaRow">' +
          '<span class="tag">' + escapeHtml(record.project_path) + '</span>' +
          '<span class="tag">' + escapeHtml(formatDate(record.created_at)) + '</span>' +
        '</div>' +
      '</button>';
    }).join("");

    els.listMeta.textContent = "Showing " + state.records.length + " of " + total + " records";

    Array.from(els.recordsList.querySelectorAll("[data-record-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedId = button.getAttribute("data-record-id");
        renderRecords(total);
        renderDetail(getSelectedRecord());
      });
    });

    renderDetail(getSelectedRecord());
  }

  function renderTagSection(title, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="finePrint" style="margin-top: 8px;">None</div></div>';
    }
    return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="chipsRow" style="margin-top: 10px;">' +
      items.map((item) => '<span class="tag">' + escapeHtml(item) + '</span>').join("") +
      '</div></div>';
  }

  function renderListSection(title, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="finePrint" style="margin-top: 8px;">None</div></div>';
    }
    return '<div class="detailCard"><div class="metaLabel">' + title + '</div><ul class="listDetails" style="margin-top: 10px;">' +
      items.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") +
      '</ul></div>';
  }

  function getSelectedRecord() {
    return state.records.find((record) => record.id === state.selectedId) || null;
  }

  function renderDetail(record) {
    if (!record) {
      els.detailTitle.textContent = "Choose a record";
      els.detailTimestamp.textContent = "";
      els.detailContent.className = "emptyState";
      els.detailContent.innerHTML = "Select an observation from the ledger to inspect narrative, facts, concepts, and touched files.";
      return;
    }

    els.detailTitle.textContent = record.title;
    els.detailTimestamp.textContent = formatDate(record.created_at);
    els.detailContent.className = "";
    els.detailContent.innerHTML = [
      '<div class="metaRow">',
        '<span class="tag">' + escapeHtml(record.agent_id) + '</span>',
        '<span class="tag">' + escapeHtml(record.project_path) + '</span>',
        '<span class="tag">' + escapeHtml(record.id) + '</span>',
      '</div>',
      '<div class="detailCard" style="margin-top: 16px;">',
        '<div class="metaLabel">Narrative</div>',
        '<p class="recordSummary" style="margin-top: 10px;">' + escapeHtml(record.narrative || "No narrative available.") + '</p>',
      '</div>',
      renderTagSection("Facts", record.facts),
      renderTagSection("Concepts", record.concepts),
      renderListSection("Files Read", record.files_read),
      renderListSection("Files Modified", record.files_modified),
    ].join("");
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload.error || "Request failed (" + response.status + ")");
    }
    return payload;
  }

  async function loadOverview() {
    const nextOverview = await fetchJson("/admin/api/overview");
    if (state.overview && comparePolicyFreshness(nextOverview.policy, state.overview.policy) < 0) {
      nextOverview.policy = state.overview.policy;
    }
    state.overview = nextOverview;
    renderOverview();
  }

  async function loadRecords(statusMessage) {
    if (statusMessage) {
      setStatusLine(els.listStatus, statusMessage, "");
    }
    const params = new URLSearchParams({
      page: String(state.filters.page),
      pageSize: String(state.filters.pageSize),
    });
    if (state.filters.project) params.set("project", state.filters.project);
    if (state.filters.agent) params.set("agent", state.filters.agent);
    if (state.filters.query) params.set("query", state.filters.query);
    const payload = await fetchJson("/admin/api/records?" + params.toString());
    state.records = Array.isArray(payload.records) ? payload.records : [];
    renderRecords(Number(payload.total || 0));
    setStatusLine(els.listStatus, "Synced " + new Date().toLocaleTimeString(), "");
  }

  async function loadProjectContext() {
    const projectPath = els.contextProjectSelect.value;
    if (!projectPath) {
      state.contextPayload = null;
      renderProjectContext();
      return;
    }

    setStatusLine(els.projectContextStatus, "Loading context", "warning");
    const params = new URLSearchParams({
      project_path: projectPath,
      limit: String(els.contextLimitInput.value || "10"),
    });
    state.contextPayload = await fetchJson("/admin/api/context?" + params.toString());
    renderProjectContext();
  }

  async function loadStateFacts() {
    const projectPath = els.stateProjectSelect.value;
    if (!projectPath) {
      state.statePayload = null;
      renderStateFacts();
      return;
    }

    setStatusLine(els.stateLabStatus, "Loading state facts", "warning");
    const params = new URLSearchParams({
      project_path: projectPath,
    });
    if (els.stateEntityTypeInput.value.trim()) params.set("entity_type", els.stateEntityTypeInput.value.trim());
    if (els.stateEntityKeyInput.value.trim()) params.set("entity_key", els.stateEntityKeyInput.value.trim());
    if (els.stateFactKeyInput.value.trim()) params.set("fact_key", els.stateFactKeyInput.value.trim());
    if (els.stateAsOfInput.value.trim()) params.set("as_of", els.stateAsOfInput.value.trim());
    state.statePayload = await fetchJson("/admin/api/state?" + params.toString());
    els.stateReadStatus.textContent = state.statePayload.disabled
      ? String(state.statePayload.message || "State read is disabled.")
      : "Loaded " + String((state.statePayload.facts || []).length) + " facts.";
    renderStateFacts();
    setStatusLine(els.stateLabStatus, state.statePayload.disabled ? "State read disabled" : "State loaded", state.statePayload.disabled ? "warning" : "");
  }

  function parseStateValue(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (/^(true|false|null|-?\\d+(\\.\\d+)?)$/.test(trimmed) || /^[\\[{"]/.test(trimmed)) {
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        throw new Error("State value looks like JSON but could not be parsed.");
      }
    }
    return trimmed;
  }

  async function writeStateFact() {
    const projectPath = els.stateWriteProjectSelect.value;
    if (!projectPath) {
      throw new Error("Choose a project before writing state.");
    }
    const factKey = els.stateWriteFactKeyInput.value.trim();
    if (!factKey) {
      throw new Error("Fact key is required.");
    }

    setStatusLine(els.stateLabStatus, "Writing state fact", "warning");
    const payload = await fetchJson("/admin/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_path: projectPath,
        entity_type: els.stateWriteEntityTypeInput.value.trim() || undefined,
        entity_key: els.stateWriteEntityKeyInput.value.trim() || undefined,
        fact_key: factKey,
        value: parseStateValue(els.stateValueInput.value),
        effective_at: els.stateEffectiveAtInput.value.trim() || undefined,
      }),
    });

    els.stateWriteStatus.textContent = "Wrote " + payload.fact.fact_key + " at " + formatDate(payload.fact.effective_at);
    setStatusLine(els.stateLabStatus, "State fact written", "");
    await loadStateFacts();
  }

  async function runSearchDiagnostics() {
    const projectPath = els.searchProjectSelect.value;
    const query = els.searchQueryInput.value.trim();
    if (!projectPath) {
      state.searchPayload = null;
      renderSearchResults();
      throw new Error("Choose a project before running diagnostics.");
    }
    if (!query) {
      state.searchPayload = null;
      renderSearchResults();
      throw new Error("Enter a query before running diagnostics.");
    }

    setStatusLine(els.searchDiagnosticsStatus, "Running diagnostics", "warning");
    state.searchPayload = await fetchJson("/admin/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_path: projectPath,
        query,
        limit: Number(els.searchLimitInput.value || "10"),
      }),
    });
    els.searchStatusText.textContent = "Query: " + query;
    els.searchMetaText.textContent = "Returned " + String((state.searchPayload.results || []).length) + " results";
    renderSearchResults();
    setStatusLine(els.searchDiagnosticsStatus, "Diagnostics ready", "");
  }

  async function savePolicy() {
    if (!state.overview || state.isSavingPolicy) return;
    const previousPolicy = {
      readEnabled: !!state.overview.policy.readEnabled,
      writeEnabled: !!state.overview.policy.writeEnabled,
      updatedAt: state.overview.policy.updatedAt || "",
    };
    const nextPolicy = {
      readEnabled: els.readToggle.checked,
      writeEnabled: els.writeToggle.checked,
    };
    state.pendingPolicy = nextPolicy;
    state.isSavingPolicy = true;
    renderOverview();

    try {
      const payload = await fetchJson("/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPolicy),
      });
      state.overview.policy = payload.policy;
      state.pendingPolicy = null;
      state.isSavingPolicy = false;
      renderOverview();
    } catch (error) {
      state.pendingPolicy = null;
      state.isSavingPolicy = false;
      state.overview.policy = previousPolicy;
      renderOverview();
      throw error;
    }
  }

  function syncFiltersFromInputs() {
    state.filters.project = els.projectSelect.value;
    state.filters.agent = els.agentSelect.value;
    state.filters.query = els.queryInput.value.trim();
    state.filters.page = 1;
  }

  function activatePanel(panelId) {
    state.activePanel = panelId;
    els.panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === panelId);
    });
    Array.from(els.viewTabs.querySelectorAll("[data-panel-target]")).forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-panel-target") === panelId);
    });
  }

  async function pollActiveData() {
    try {
      await loadOverview();
      if (state.activePanel === "observationLedgerPanel") {
        await loadRecords("Polling ledger");
      }
      if (state.activePanel === "projectContextPanel" && els.contextProjectSelect.value) {
        await loadProjectContext();
      }
    } catch (error) {
      // Keep polling best-effort only.
    }
  }

  function bindEvents() {
    Array.from(els.viewTabs.querySelectorAll("[data-panel-target]")).forEach((button) => {
      button.addEventListener("click", () => {
        activatePanel(button.getAttribute("data-panel-target"));
      });
    });

    els.refreshButton.addEventListener("click", async () => {
      syncFiltersFromInputs();
      await loadRecords("Refreshing ledger");
    });
    els.projectSelect.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("Filtering ledger");
    });
    els.agentSelect.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("Filtering ledger");
    });
    els.queryInput.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("Filtering ledger");
    });
    els.queryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        syncFiltersFromInputs();
        await loadRecords("Filtering ledger");
      }
    });

    els.contextRefreshButton.addEventListener("click", async () => {
      await loadProjectContext();
    });
    els.contextProjectSelect.addEventListener("change", async () => {
      await loadProjectContext();
    });
    els.contextLimitInput.addEventListener("change", async () => {
      await loadProjectContext();
    });

    els.stateRefreshButton.addEventListener("click", async () => {
      await loadStateFacts();
    });
    els.stateProjectSelect.addEventListener("change", async () => {
      if (!els.stateWriteProjectSelect.value) {
        els.stateWriteProjectSelect.value = els.stateProjectSelect.value;
      }
      await loadStateFacts();
    });
    els.stateWriteProjectSelect.addEventListener("change", () => {
      if (!els.stateProjectSelect.value) {
        els.stateProjectSelect.value = els.stateWriteProjectSelect.value;
      }
    });
    els.stateWriteButton.addEventListener("click", async () => {
      try {
        await writeStateFact();
      } catch (error) {
        els.stateWriteStatus.textContent = error.message || "Failed to write state fact.";
        setStatusLine(els.stateLabStatus, error.message || "Failed to write state fact.", "error");
      }
    });

    els.searchRunButton.addEventListener("click", async () => {
      try {
        await runSearchDiagnostics();
      } catch (error) {
        els.searchStatusText.textContent = error.message || "Failed to run diagnostics.";
        els.searchMetaText.textContent = "";
        setStatusLine(els.searchDiagnosticsStatus, error.message || "Failed to run diagnostics.", "error");
      }
    });
    els.searchQueryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        try {
          await runSearchDiagnostics();
        } catch (error) {
          els.searchStatusText.textContent = error.message || "Failed to run diagnostics.";
          els.searchMetaText.textContent = "";
          setStatusLine(els.searchDiagnosticsStatus, error.message || "Failed to run diagnostics.", "error");
        }
      }
    });

    els.readToggle.addEventListener("change", async () => {
      try {
        await savePolicy();
      } catch (error) {
        setStatusLine(els.runtimeStatusLine || document.getElementById("runtimeStatusLine"), error.message || "Failed to save policy.", "error");
      }
    });
    els.writeToggle.addEventListener("change", async () => {
      try {
        await savePolicy();
      } catch (error) {
        setStatusLine(els.runtimeStatusLine || document.getElementById("runtimeStatusLine"), error.message || "Failed to save policy.", "error");
      }
    });
  }

  async function initialize() {
    bindEvents();
    try {
      await loadOverview();
      await loadRecords("Loading ledger");
      if (els.contextProjectSelect.value) {
        await loadProjectContext();
      } else {
        renderProjectContext();
      }
      if (els.stateProjectSelect.value) {
        await loadStateFacts();
      } else {
        renderStateFacts();
      }
      renderSearchResults();
      setStatusLine(document.getElementById("runtimeStatusLine"), "Workbench ready", "");
    } catch (error) {
      setStatusLine(document.getElementById("runtimeStatusLine"), error.message || "Failed to initialize workbench.", "error");
    }

    state.pollHandle = window.setInterval(() => {
      pollActiveData();
    }, POLL_INTERVAL_MS);
  }

  initialize();
  `;
}
