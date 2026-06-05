import {
  ADMIN_UI_DEFAULT_LOCALE,
  ADMIN_UI_LOCALE_STORAGE_KEY,
  ADMIN_UI_TRANSLATIONS,
} from './admin-ui-copy';

export function renderAdminWorkbenchClientScript(pollIntervalMs: number): string {
  return `
  const POLL_INTERVAL_MS = ${JSON.stringify(pollIntervalMs)};
  const UI_LOCALE_STORAGE_KEY = ${JSON.stringify(ADMIN_UI_LOCALE_STORAGE_KEY)};
  const UI_DEFAULT_LOCALE = ${JSON.stringify(ADMIN_UI_DEFAULT_LOCALE)};
  const UI_DICTIONARY = ${JSON.stringify(ADMIN_UI_TRANSLATIONS)};
  const state = {
    activePanel: "runtimePanel",
    locale: UI_DEFAULT_LOCALE,
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
    recordsTotal: 0,
    selectedId: null,
    isSavingPolicy: false,
    isSavingLlm: false,
    isTestingLlm: false,
    llmConfig: null,
    llmTestResult: null,
    contextPayload: null,
    statePayload: null,
    searchPayload: null,
    pollHandle: null,
    statusLineState: {},
  };

  const els = {
    localeToggle: document.getElementById("localeToggle"),
    localeButtons: Array.from(document.querySelectorAll("[data-locale-choice]")),
    observationsCount: document.getElementById("observationsCount"),
    sessionsCount: document.getElementById("sessionsCount"),
    projectsCount: document.getElementById("projectsCount"),
    agentsCount: document.getElementById("agentsCount"),
    currentStateFactsCount: document.getElementById("currentStateFactsCount"),
    statusText: document.getElementById("statusText"),
    policyUpdatedAt: document.getElementById("policyUpdatedAt"),
    runtimeProjectList: document.getElementById("runtimeProjectList"),
    runtimeAgentList: document.getElementById("runtimeAgentList"),
    runtimeStatusLine: document.getElementById("runtimeStatusLine"),
    llmStatusLine: document.getElementById("llmStatusLine"),
    llmCurrentModel: document.getElementById("llmCurrentModel"),
    llmCurrentEndpoint: document.getElementById("llmCurrentEndpoint"),
    llmKeyStatus: document.getElementById("llmKeyStatus"),
    llmEnvStatus: document.getElementById("llmEnvStatus"),
    llmApiUrlInput: document.getElementById("llmApiUrlInput"),
    llmModelInput: document.getElementById("llmModelInput"),
    llmApiKeyInput: document.getElementById("llmApiKeyInput"),
    llmHeadersInput: document.getElementById("llmHeadersInput"),
    llmDisableJsonModeInput: document.getElementById("llmDisableJsonModeInput"),
    llmSaveStatus: document.getElementById("llmSaveStatus"),
    llmReloadButton: document.getElementById("llmReloadButton"),
    llmSaveButton: document.getElementById("llmSaveButton"),
    llmTestButton: document.getElementById("llmTestButton"),
    llmTestResult: document.getElementById("llmTestResult"),
    ledgerStatusLine: document.getElementById("ledgerStatusLine"),
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

  function normalizeLocale(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized.startsWith("zh")) return "zh-CN";
    return "en";
  }

  function detectInitialLocale() {
    try {
      const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
      if (stored) {
        return normalizeLocale(stored);
      }
    } catch (_error) {
      // Ignore storage access errors and fall back to browser locale.
    }
    return normalizeLocale(navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : "") || UI_DEFAULT_LOCALE);
  }

  function getMessages() {
    return UI_DICTIONARY[state.locale] || UI_DICTIONARY[UI_DEFAULT_LOCALE] || {};
  }

  function interpolate(template, vars) {
    return String(template || "").replace(/\\{(\\w+)\\}/g, (_match, key) => {
      const value = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "{" + key + "}";
      return String(value);
    });
  }

  function t(key, vars) {
    const messages = getMessages();
    const fallbackMessages = UI_DICTIONARY[UI_DEFAULT_LOCALE] || {};
    const template = messages[key] || fallbackMessages[key] || key;
    return interpolate(template, vars);
  }

  function formatDate(value) {
    if (!value) return t("common.unknownTimestamp");
    const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("T") ? "" : "Z"));
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString(state.locale);
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
    if (!normalized) return t("common.noNarrativeAvailable");
    return normalized.length > max ? normalized.slice(0, max - 1) + "..." : normalized;
  }

  function setStatusLine(element, message, variant) {
    if (!element) return;
    element.className = "statusLine" + (variant ? " " + variant : "");
    element.innerHTML = '<span class="statusDot"></span><span>' + escapeHtml(message) + '</span>';
  }

  function setStoredStatusLine(name, element, key, vars, variant) {
    state.statusLineState[name] = { key, vars: vars || {}, variant: variant || "" };
    setStatusLine(element, t(key, vars), variant);
  }

  function setRawStatusLine(name, element, message, variant) {
    state.statusLineState[name] = { raw: message, variant: variant || "" };
    setStatusLine(element, message, variant);
  }

  function rerenderStatusLines() {
    const targets = {
      runtime: els.runtimeStatusLine,
      llm: els.llmStatusLine,
      ledger: els.listStatus,
      projectContext: els.projectContextStatus,
      stateLab: els.stateLabStatus,
      searchDiagnostics: els.searchDiagnosticsStatus,
    };
    Object.keys(targets).forEach((name) => {
      const snapshot = state.statusLineState[name];
      if (!snapshot) return;
      if (snapshot.key) {
        setStatusLine(targets[name], t(snapshot.key, snapshot.vars), snapshot.variant);
        return;
      }
      setStatusLine(targets[name], snapshot.raw, snapshot.variant);
    });
  }

  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key) return;
      node.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (!key) return;
      node.setAttribute("placeholder", t(key));
    });
  }

  function syncLocaleButtons() {
    els.localeButtons.forEach((button) => {
      const locale = button.getAttribute("data-locale-choice");
      const isActive = locale === state.locale;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function applyLocale(skipPersist) {
    document.documentElement.lang = state.locale;
    document.documentElement.setAttribute("data-ui-locale", state.locale);
    document.title = t("meta.documentTitle");
    applyStaticTranslations();
    syncLocaleButtons();
    rerenderStatusLines();
    renderOverview();
    renderLlmConfig();
    renderLlmTestResult();
    renderProjectContext();
    renderStateFacts();
    renderSearchResults();
    if (state.records.length > 0 || state.recordsTotal > 0 || state.selectedId) {
      renderRecords(state.recordsTotal);
    } else {
      renderDetail(null);
    }
    if (!skipPersist) {
      try {
        window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, state.locale);
      } catch (_error) {
        // Ignore storage write errors.
      }
    }
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
    return t("status.policySummary", {
      readState: policy.readEnabled ? t("common.enabled") : t("common.disabled"),
      writeState: policy.writeEnabled ? t("common.enabled") : t("common.disabled"),
    });
  }

  function getPolicyMeta(kind, enabled) {
    if (state.isSavingPolicy) {
      return t("status.savingTargetPolicy");
    }
    if (kind === "read") {
      return enabled
        ? t("status.readMetaEnabled")
        : t("status.readMetaDisabled");
    }
    return enabled
      ? t("status.writeMetaEnabled")
      : t("status.writeMetaDisabled");
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
    badge.textContent = state.isSavingPolicy ? t("common.saving") : enabled ? t("common.enabled") : t("common.disabled");
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
      target.innerHTML = '<span class="pill subtle">' + escapeHtml(t("runtime.noDataYet")) + '</span>';
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
    els.statusText.textContent = state.isSavingPolicy
      ? t("status.policySaving", { summary: getPolicySummary(policy) })
      : getPolicySummary(policy);
    els.statusText.className = "statusValue" + (state.isSavingPolicy ? " is-saving" : "");
    els.policyUpdatedAt.textContent = state.isSavingPolicy
      ? t("status.pendingPolicy")
      : t("status.policyUpdated", { timestamp: formatDate(policy.updatedAt || state.overview.refreshedAt) });

    const projects = state.overview.projects || [];
    const agents = state.overview.agents || [];
    renderRuntimeLists(projects, els.runtimeProjectList);
    renderRuntimeLists(agents, els.runtimeAgentList);

    syncSelect(els.projectSelect, projects, t("field.allProjects"), state.filters.project, true);
    syncSelect(els.agentSelect, agents, t("field.allAgents"), state.filters.agent, true);
    syncSelect(els.contextProjectSelect, projects, t("field.chooseProject"), els.contextProjectSelect.value, true);
    syncSelect(els.stateProjectSelect, projects, t("field.chooseProject"), els.stateProjectSelect.value, true);
    syncSelect(els.stateWriteProjectSelect, projects, t("field.chooseProject"), els.stateWriteProjectSelect.value, true);
    syncSelect(els.searchProjectSelect, projects, t("field.chooseProject"), els.searchProjectSelect.value, true);
    ensureProjectDefaults(projects);
  }

  function renderLlmConfig() {
    const config = state.llmConfig;
    if (!config) {
      els.llmCurrentModel.textContent = "-";
      els.llmCurrentEndpoint.textContent = "-";
      els.llmKeyStatus.textContent = "-";
      els.llmEnvStatus.textContent = "-";
      return;
    }

    els.llmCurrentModel.textContent = config.model || "-";
    els.llmCurrentEndpoint.textContent = config.apiUrl || "-";
    els.llmKeyStatus.textContent = config.hasApiKey
      ? t("llm.keySet", { masked: config.apiKeyMasked || "set" })
      : t("llm.keyMissing");
    els.llmEnvStatus.textContent = config.exists
      ? t("llm.envExists")
      : t("llm.envMissing");

    if (!state.isSavingLlm && !state.isTestingLlm) {
      els.llmApiUrlInput.value = config.apiUrl || "";
      els.llmModelInput.value = config.model || "";
      els.llmHeadersInput.value = config.headers || "";
      els.llmDisableJsonModeInput.checked = !!config.disableJsonMode;
    }
    els.llmSaveButton.disabled = state.isSavingLlm;
    els.llmReloadButton.disabled = state.isSavingLlm;
    els.llmTestButton.disabled = state.isSavingLlm || state.isTestingLlm;
    if (state.isSavingLlm) {
      els.llmSaveStatus.textContent = t("common.saving");
    }
  }

  function getLlmFormPayload(includeApiKey) {
    const payload = {
      apiUrl: els.llmApiUrlInput.value.trim(),
      disableJsonMode: !!els.llmDisableJsonModeInput.checked,
      headers: els.llmHeadersInput.value.trim(),
      model: els.llmModelInput.value.trim(),
    };
    const apiKey = els.llmApiKeyInput.value.trim();
    if (includeApiKey && apiKey) {
      payload.apiKey = apiKey;
    }
    return payload;
  }

  function renderLlmTestResult() {
    const result = state.llmTestResult;
    if (!result) {
      els.llmTestResult.className = "llmTestResult emptyState";
      els.llmTestResult.textContent = state.isTestingLlm ? t("llm.testing") : t("llm.noTestYet");
      return;
    }

    const statusLine = result.ok
      ? t("llm.testPassed", { latency: String(result.latencyMs || 0) })
      : t("llm.testFailed", { latency: String(result.latencyMs || 0) });
    const details = [
      '<div class="statusChip ' + (result.ok ? 'success' : 'error') + '">' + escapeHtml(statusLine) + '</div>',
      '<div class="finePrint" style="margin-top: 10px;">' + escapeHtml(t("llm.testEndpoint", { endpoint: result.requestUrl || "" })) + '</div>',
      result.status ? '<div class="finePrint">' + escapeHtml(t("llm.testStatus", { status: String(result.status) })) + '</div>' : '',
      result.contentPreview ? '<div class="finePrint">' + escapeHtml(t("llm.testResponse", { response: result.contentPreview })) + '</div>' : '',
      result.error ? '<div class="finePrint">' + escapeHtml(t("llm.testError", { error: result.error })) + '</div>' : '',
    ];
    els.llmTestResult.className = "llmTestResult " + (result.ok ? "success" : "error");
    els.llmTestResult.innerHTML = details.join("");
  }

  function renderContextCards(view) {
    if (!view || view.disabled) {
      els.currentStateList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.contextReadDisabled")) + '</div>';
      els.summaryBlocksList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.summaryUnavailable")) + '</div>';
      els.recentObservationsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.recentUnavailable")) + '</div>';
      return;
    }

    els.currentStateList.innerHTML = Array.isArray(view.current_state) && view.current_state.length > 0
      ? view.current_state.map((fact) => (
          '<div class="factCard">' +
            '<div class="metaLabel">' + escapeHtml(fact.entity_type + ":" + fact.entity_key) + '</div>' +
            '<div style="margin-top: 8px; font-weight: 700;">' + escapeHtml(fact.fact_key) + '</div>' +
            '<div class="factValue subtle" style="margin-top: 6px;">' + escapeHtml(typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)) + '</div>' +
            '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("field.effectiveAt")) + ' ' + escapeHtml(formatDate(fact.effective_at)) + '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">' + escapeHtml(t("projectContext.noCurrentStructuredState")) + '</div>';

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
      : '<div class="emptyState">' + escapeHtml(t("projectContext.noSummaryBlocks")) + '</div>';

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
      : '<div class="emptyState">' + escapeHtml(t("projectContext.noRecentObservations")) + '</div>';
  }

  function renderProjectContext() {
    const payload = state.contextPayload;
    if (!payload) {
      els.contextStatusText.textContent = t("projectContext.chooseProjectPrompt");
      els.contextMetrics.innerHTML = "";
      els.contextRenderedText.textContent = t("projectContext.chooseProjectPrompt");
      els.currentStateList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noProjectPanel")) + '</div>';
      els.summaryBlocksList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noSummaryDisplay")) + '</div>';
      els.recentObservationsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noRecentDisplay")) + '</div>';
      return;
    }

    const metrics = payload.metrics || {};
    const view = payload.view || {};
    els.contextMetrics.innerHTML = [
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.payload")) + '</strong> ' + escapeHtml(String(metrics.payloadBytes || 0)) + ' ' + escapeHtml(t("common.bytes")) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.summary")) + '</strong> ' + escapeHtml(String(metrics.summaryCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.lowSignal")) + '</strong> ' + escapeHtml(String(metrics.lowSignalCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.duplicateTitles")) + '</strong> ' + escapeHtml(String(metrics.duplicateTitleCount || 0)) + '</span>'
    ].join("");
    els.contextRenderedText.textContent = payload.rendered || t("projectContext.noStructuredContext");
    els.contextStatusText.textContent = view.disabled
      ? String(view.message || t("projectContext.contextDisabled"))
      : t("projectContext.generatedAt", { timestamp: formatDate(view.generated_at) });
    setStoredStatusLine("projectContext", els.projectContextStatus, view.disabled ? "projectContext.contextDisabled" : "projectContext.contextLoaded", {}, view.disabled ? "warning" : "");
    renderContextCards(view);
  }

  function renderStateFacts() {
    const payload = state.statePayload;
    if (!payload) {
      els.stateFactsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("stateLab.chooseProjectAndLoad")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.stateFactsList.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("stateLab.readDisabled")) + '</div>';
      return;
    }

    els.stateFactsList.innerHTML = Array.isArray(payload.facts) && payload.facts.length > 0
      ? payload.facts.map((fact) => (
          '<div class="factCard">' +
            '<div class="metaLabel">' + escapeHtml(fact.entity_type + ":" + fact.entity_key) + '</div>' +
            '<div style="margin-top: 8px; font-weight: 700;">' + escapeHtml(fact.fact_key) + '</div>' +
            '<div class="factValue subtle" style="margin-top: 6px;">' + escapeHtml(typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)) + '</div>' +
            '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("field.effectiveAt")) + ' ' + escapeHtml(formatDate(fact.effective_at)) + '</div>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">' + escapeHtml(t("stateLab.noMatchingFacts")) + '</div>';
  }

  function renderSearchResults() {
    const payload = state.searchPayload;
    if (!payload) {
      els.searchResults.innerHTML = '<div class="emptyState">' + escapeHtml(t("search.resultsPrompt")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.searchResults.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("search.failedToRun")) + '</div>';
      return;
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    els.searchResults.innerHTML = results.length > 0
      ? results.map((result) => (
          '<div class="scoreCard">' +
            '<div class="policyTitleRow">' +
              '<div style="font-weight: 700;">' + escapeHtml(result.title) + '</div>' +
              '<span class="tag">' + escapeHtml(result.agent_id) + '</span>' +
              (result.low_signal_title ? '<span class="statusChip warning">' + escapeHtml(t("search.lowSignal")) + '</span>' : '') +
            '</div>' +
            '<div class="metaRow">' +
              '<span class="scoreBadge"><strong>' + escapeHtml(t("search.metricHybrid")) + '</strong> ' + escapeHtml(Number(result.hybrid_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>' + escapeHtml(t("search.metricFts")) + '</strong> ' + escapeHtml(Number(result.fts_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>' + escapeHtml(t("search.metricVector")) + '</strong> ' + escapeHtml(Number(result.vector_score || 0).toFixed(3)) + '</span>' +
              '<span class="scoreBadge"><strong>' + escapeHtml(t("search.metricDate")) + '</strong> ' + escapeHtml(formatDate(result.created_at)) + '</span>' +
            '</div>' +
            '<p class="recordSummary" style="margin-top: 10px;">' + escapeHtml(summarize(result.narrative, 220)) + '</p>' +
          '</div>'
        )).join("")
      : '<div class="emptyState">' + escapeHtml(t("search.noResults")) + '</div>';
  }

  function renderRecords(total) {
    if (!state.records.length) {
      els.recordsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("ledger.noMatches")) + '</div>';
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

    els.listMeta.textContent = t("ledger.showingCount", {
      shown: state.records.length,
      total,
    });

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
      return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("detail.none")) + '</div></div>';
    }
    return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="chipsRow" style="margin-top: 10px;">' +
      items.map((item) => '<span class="tag">' + escapeHtml(item) + '</span>').join("") +
      '</div></div>';
  }

  function renderListSection(title, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="detailCard"><div class="metaLabel">' + title + '</div><div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("detail.none")) + '</div></div>';
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
      els.detailTitle.textContent = t("ledger.chooseRecord");
      els.detailTimestamp.textContent = "";
      els.detailContent.className = "emptyState";
      els.detailContent.innerHTML = escapeHtml(t("ledger.selectRecordPrompt"));
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
        '<div class="metaLabel">' + escapeHtml(t("detail.narrative")) + '</div>',
        '<p class="recordSummary" style="margin-top: 10px;">' + escapeHtml(record.narrative || t("common.noNarrativeAvailable")) + '</p>',
      '</div>',
      renderTagSection(t("detail.facts"), record.facts),
      renderTagSection(t("detail.concepts"), record.concepts),
      renderListSection(t("detail.filesRead"), record.files_read),
      renderListSection(t("detail.filesModified"), record.files_modified),
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

  async function loadLlmConfig() {
    setStoredStatusLine("llm", els.llmStatusLine, "llm.loading", {}, "warning");
    const payload = await fetchJson("/admin/api/llm-config");
    state.llmConfig = payload.config || null;
    renderLlmConfig();
    setStoredStatusLine("llm", els.llmStatusLine, "llm.ready", {}, "");
  }

  async function saveLlmSettings() {
    const payloadToSave = getLlmFormPayload(true);
    state.isSavingLlm = true;
    renderLlmConfig();
    setStoredStatusLine("llm", els.llmStatusLine, "common.saving", {}, "warning");
    try {
      const payload = await fetchJson("/admin/api/llm-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSave),
      });
      state.llmConfig = payload.config || null;
      state.isSavingLlm = false;
      els.llmApiKeyInput.value = "";
      els.llmSaveStatus.textContent = t("llm.savedAt", { timestamp: formatDate(payload.savedAt) });
      renderLlmConfig();
      setStoredStatusLine("llm", els.llmStatusLine, "llm.ready", {}, "");
    } catch (error) {
      state.isSavingLlm = false;
      renderLlmConfig();
      setRawStatusLine("llm", els.llmStatusLine, error.message || t("llm.saveFailed"), "error");
      els.llmSaveStatus.textContent = error.message || t("llm.saveFailed");
    }
  }

  async function runLlmConnectionTest() {
    const payloadToTest = getLlmFormPayload(true);
    state.isTestingLlm = true;
    state.llmTestResult = null;
    renderLlmConfig();
    renderLlmTestResult();
    setStoredStatusLine("llm", els.llmStatusLine, "llm.testing", {}, "warning");
    try {
      state.llmTestResult = await fetchJson("/admin/api/llm-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToTest),
      });
      state.isTestingLlm = false;
      renderLlmConfig();
      renderLlmTestResult();
      setRawStatusLine(
        "llm",
        els.llmStatusLine,
        state.llmTestResult.ok
          ? t("llm.testPassed", { latency: String(state.llmTestResult.latencyMs || 0) })
          : t("llm.testFailed", { latency: String(state.llmTestResult.latencyMs || 0) }),
        state.llmTestResult.ok ? "" : "error"
      );
    } catch (error) {
      state.isTestingLlm = false;
      state.llmTestResult = {
        error: error.message || t("llm.testFailed", { latency: "0" }),
        latencyMs: 0,
        ok: false,
        requestUrl: "",
      };
      renderLlmConfig();
      renderLlmTestResult();
      setRawStatusLine("llm", els.llmStatusLine, error.message || t("llm.testFailed", { latency: "0" }), "error");
    }
  }

  async function loadRecords(statusKey) {
    if (statusKey) {
      setStoredStatusLine("ledger", els.listStatus, statusKey, {}, "");
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
    state.recordsTotal = Number(payload.total || 0);
    renderRecords(state.recordsTotal);
    setStoredStatusLine("ledger", els.listStatus, "ledger.syncedAt", {
      time: new Date().toLocaleTimeString(state.locale),
    }, "");
  }

  async function loadProjectContext() {
    const projectPath = els.contextProjectSelect.value;
    if (!projectPath) {
      state.contextPayload = null;
      renderProjectContext();
      return;
    }

    setStoredStatusLine("projectContext", els.projectContextStatus, "projectContext.loadingContext", {}, "warning");
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

    setStoredStatusLine("stateLab", els.stateLabStatus, "stateLab.loadingFacts", {}, "warning");
    const params = new URLSearchParams({
      project_path: projectPath,
    });
    if (els.stateEntityTypeInput.value.trim()) params.set("entity_type", els.stateEntityTypeInput.value.trim());
    if (els.stateEntityKeyInput.value.trim()) params.set("entity_key", els.stateEntityKeyInput.value.trim());
    if (els.stateFactKeyInput.value.trim()) params.set("fact_key", els.stateFactKeyInput.value.trim());
    if (els.stateAsOfInput.value.trim()) params.set("as_of", els.stateAsOfInput.value.trim());
    state.statePayload = await fetchJson("/admin/api/state?" + params.toString());
    els.stateReadStatus.textContent = state.statePayload.disabled
      ? String(state.statePayload.message || t("stateLab.readDisabled"))
      : t("stateLab.loadedFacts", { count: String((state.statePayload.facts || []).length) });
    renderStateFacts();
    setStoredStatusLine("stateLab", els.stateLabStatus, state.statePayload.disabled ? "stateLab.readDisabled" : "stateLab.stateLoaded", {}, state.statePayload.disabled ? "warning" : "");
  }

  function parseStateValue(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (/^(true|false|null|-?\\d+(\\.\\d+)?)$/.test(trimmed) || /^[\\[{"]/.test(trimmed)) {
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        throw new Error(t("stateLab.valueParseError"));
      }
    }
    return trimmed;
  }

  async function writeStateFact() {
    const projectPath = els.stateWriteProjectSelect.value;
    if (!projectPath) {
      throw new Error(t("stateLab.chooseProjectBeforeWrite"));
    }
    const factKey = els.stateWriteFactKeyInput.value.trim();
    if (!factKey) {
      throw new Error(t("stateLab.factKeyRequired"));
    }

    setStoredStatusLine("stateLab", els.stateLabStatus, "stateLab.writingFact", {}, "warning");
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

    els.stateWriteStatus.textContent = t("stateLab.wroteFact", {
      factKey: payload.fact.fact_key,
      timestamp: formatDate(payload.fact.effective_at),
    });
    setStoredStatusLine("stateLab", els.stateLabStatus, "stateLab.factWritten", {}, "");
    await loadStateFacts();
  }

  async function runSearchDiagnostics() {
    const projectPath = els.searchProjectSelect.value;
    const query = els.searchQueryInput.value.trim();
    if (!projectPath) {
      state.searchPayload = null;
      renderSearchResults();
      throw new Error(t("search.chooseProjectBeforeRun"));
    }
    if (!query) {
      state.searchPayload = null;
      renderSearchResults();
      throw new Error(t("search.enterQueryBeforeRun"));
    }

    setStoredStatusLine("searchDiagnostics", els.searchDiagnosticsStatus, "search.running", {}, "warning");
    state.searchPayload = await fetchJson("/admin/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_path: projectPath,
        query,
        limit: Number(els.searchLimitInput.value || "10"),
      }),
    });
    els.searchStatusText.textContent = t("search.queryPrefix", { query });
    els.searchMetaText.textContent = t("search.returnedResults", { count: String((state.searchPayload.results || []).length) });
    renderSearchResults();
    setStoredStatusLine("searchDiagnostics", els.searchDiagnosticsStatus, "search.readyStatus", {}, "");
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
        await loadRecords("ledger.polling");
      }
      if (state.activePanel === "projectContextPanel" && els.contextProjectSelect.value) {
        await loadProjectContext();
      }
    } catch (error) {
      // Keep polling best-effort only.
    }
  }

  function bindEvents() {
    els.localeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextLocale = normalizeLocale(button.getAttribute("data-locale-choice"));
        if (state.locale === nextLocale) return;
        state.locale = nextLocale;
        applyLocale(false);
      });
    });

    Array.from(els.viewTabs.querySelectorAll("[data-panel-target]")).forEach((button) => {
      button.addEventListener("click", () => {
        activatePanel(button.getAttribute("data-panel-target"));
      });
    });

    els.llmReloadButton.addEventListener("click", async () => {
      await loadLlmConfig();
    });
    els.llmSaveButton.addEventListener("click", async () => {
      await saveLlmSettings();
    });
    els.llmTestButton.addEventListener("click", async () => {
      await runLlmConnectionTest();
    });

    els.refreshButton.addEventListener("click", async () => {
      syncFiltersFromInputs();
      await loadRecords("ledger.refreshing");
    });
    els.projectSelect.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("ledger.filtering");
    });
    els.agentSelect.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("ledger.filtering");
    });
    els.queryInput.addEventListener("change", async () => {
      syncFiltersFromInputs();
      await loadRecords("ledger.filtering");
    });
    els.queryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        syncFiltersFromInputs();
        await loadRecords("ledger.filtering");
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
        els.stateWriteStatus.textContent = error.message || t("stateLab.failedWrite");
        setRawStatusLine("stateLab", els.stateLabStatus, error.message || t("stateLab.failedWrite"), "error");
      }
    });

    els.searchRunButton.addEventListener("click", async () => {
      try {
        await runSearchDiagnostics();
      } catch (error) {
        els.searchStatusText.textContent = error.message || t("search.failedToRun");
        els.searchMetaText.textContent = "";
        setRawStatusLine("searchDiagnostics", els.searchDiagnosticsStatus, error.message || t("search.failedToRun"), "error");
      }
    });
    els.searchQueryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        try {
          await runSearchDiagnostics();
        } catch (error) {
          els.searchStatusText.textContent = error.message || t("search.failedToRun");
          els.searchMetaText.textContent = "";
          setRawStatusLine("searchDiagnostics", els.searchDiagnosticsStatus, error.message || t("search.failedToRun"), "error");
        }
      }
    });

    els.readToggle.addEventListener("change", async () => {
      try {
        await savePolicy();
      } catch (error) {
        setRawStatusLine("runtime", els.runtimeStatusLine, error.message || t("status.policySaveFailed"), "error");
      }
    });
    els.writeToggle.addEventListener("change", async () => {
      try {
        await savePolicy();
      } catch (error) {
        setRawStatusLine("runtime", els.runtimeStatusLine, error.message || t("status.policySaveFailed"), "error");
      }
    });
  }

  async function initialize() {
    state.locale = detectInitialLocale();
    applyLocale(true);
    bindEvents();
    try {
      await loadOverview();
      await loadLlmConfig();
      await loadRecords("ledger.loading");
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
      setStoredStatusLine("runtime", els.runtimeStatusLine, "status.workbenchReady", {}, "");
    } catch (error) {
      setRawStatusLine("runtime", els.runtimeStatusLine, error.message || t("status.initializationFailed"), "error");
    }

    state.pollHandle = window.setInterval(() => {
      pollActiveData();
    }, POLL_INTERVAL_MS);
  }

  initialize();
  `;
}
