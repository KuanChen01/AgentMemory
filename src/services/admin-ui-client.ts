import {
  ADMIN_UI_DEFAULT_LOCALE,
  ADMIN_UI_LOCALE_STORAGE_KEY,
  ADMIN_UI_TRANSLATIONS,
} from './admin-ui-copy';
import { ADMIN_UI_HEALTH_CHECKS, ADMIN_UI_ICONS } from './admin-ui-markup';
import { ADMIN_UI_WALLPAPERS } from './admin-ui-theme';

export const ADMIN_UI_DEV_TOOLS_STORAGE_KEY = 'agentmemory.admin.devTools';
// Background picker settings (preset or custom, tone, sliders). The custom image itself lives in IndexedDB.
export const ADMIN_UI_BACKGROUND_STORAGE_KEY = 'am.bg';
export const ADMIN_UI_BACKGROUND_DEFAULTS = { preset: 'aurora', tone: 'auto', blur: 12, dim: 0, opacity: 30 };

// Runs in <head> before the body is parsed, so the saved wallpaper and glass tone apply before first paint.
// It also exposes the normalise/apply helpers the main client script reuses (window.__amBackground).
export function renderAdminBackgroundBootScript(): string {
  const lumas = Object.fromEntries(ADMIN_UI_WALLPAPERS.map((wallpaper) => [wallpaper.id, wallpaper.luma]));
  return `
  (function () {
    var KEY = ${JSON.stringify(ADMIN_UI_BACKGROUND_STORAGE_KEY)};
    var DEFAULTS = ${JSON.stringify(ADMIN_UI_BACKGROUND_DEFAULTS)};
    var LUMAS = ${JSON.stringify(lumas)};
    function clampInt(value, min, max, fallback) {
      var number = Number(value);
      if (value === null || value === undefined || value === "" || !isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, Math.round(number)));
    }
    function normalize(raw) {
      var source = raw && typeof raw === "object" ? raw : {};
      var luma = Number(source.customLuma);
      return {
        preset: source.preset === "custom" || Object.prototype.hasOwnProperty.call(LUMAS, source.preset) ? source.preset : DEFAULTS.preset,
        tone: source.tone === "light" || source.tone === "dark" ? source.tone : "auto",
        blur: clampInt(source.blur, 0, 40, DEFAULTS.blur),
        dim: clampInt(source.dim, 0, 60, DEFAULTS.dim),
        opacity: clampInt(source.opacity, 10, 80, DEFAULTS.opacity),
        customLuma: source.customLuma !== null && source.customLuma !== undefined && isFinite(luma) ? Math.min(1, Math.max(0, luma)) : null,
        customColor: /^#[0-9a-f]{6}$/i.test(String(source.customColor || "")) ? String(source.customColor) : null
      };
    }
    // Auto picks dark glass when the wallpaper, after the Dim slider, is closer to black than to white.
    function resolveTone(settings) {
      if (settings.tone !== "auto") return settings.tone;
      var luma = settings.preset === "custom" ? (settings.customLuma === null ? 0.75 : settings.customLuma) : LUMAS[settings.preset];
      return luma * (1 - settings.dim / 100) < 0.5 ? "dark" : "light";
    }
    function apply(settings) {
      var root = document.documentElement;
      root.setAttribute("data-bg", settings.preset);
      root.setAttribute("data-glass", resolveTone(settings));
      root.style.setProperty("--bg-blur", settings.blur + "px");
      root.style.setProperty("--bg-brightness", String(1 - settings.dim / 100));
      root.style.setProperty("--glass-scale", String(Math.round((settings.opacity / DEFAULTS.opacity) * 1000) / 1000));
      if (settings.customColor) {
        root.style.setProperty("--bg-custom-color", settings.customColor);
      } else {
        root.style.removeProperty("--bg-custom-color");
      }
    }
    function read() {
      try {
        return normalize(JSON.parse(window.localStorage.getItem(KEY) || "null"));
      } catch (_error) {
        return normalize(null);
      }
    }
    window.__amBackground = { key: KEY, defaults: DEFAULTS, normalize: normalize, resolveTone: resolveTone, apply: apply, read: read };
    apply(read());
  })();
  `;
}

export function renderAdminWorkbenchClientScript(pollIntervalMs: number): string {
  return `
  const POLL_INTERVAL_MS = ${JSON.stringify(pollIntervalMs)};
  const UI_LOCALE_STORAGE_KEY = ${JSON.stringify(ADMIN_UI_LOCALE_STORAGE_KEY)};
  const UI_DEFAULT_LOCALE = ${JSON.stringify(ADMIN_UI_DEFAULT_LOCALE)};
  const UI_DICTIONARY = ${JSON.stringify(ADMIN_UI_TRANSLATIONS)};
  const UI_ICONS = ${JSON.stringify(ADMIN_UI_ICONS)};
  const DEV_TOOLS_STORAGE_KEY = ${JSON.stringify(ADMIN_UI_DEV_TOOLS_STORAGE_KEY)};
  const BG_STORAGE_KEY = ${JSON.stringify(ADMIN_UI_BACKGROUND_STORAGE_KEY)};
  const BG_DB_NAME = "agentmemory-admin-ui";
  const BG_DB_STORE = "wallpapers";
  const BG_DB_KEY = "custom";
  const BG_MAX_EDGE = 2560;
  const BG_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const HEALTH_CHECKS = ${JSON.stringify(ADMIN_UI_HEALTH_CHECKS.map(({ key, id, card, labelKey }) => ({ key, id, card, labelKey })))};
  // Home aggregates are cheap SQL but still heavier than the 5 s overview, so they refresh on a slower cadence
  // (and immediately when the overview shows a new memory or task).
  const HOME_SUMMARY_REFRESH_MS = 30000;
  const DIGEST_SCHEDULER_REFRESH_MS = 60000;
  const HOME_CHART_DAYS = 30;
  const V21_SWITCH_DAY = "2026-10-15";
  const VAULT_STALE_MS = 26 * 60 * 60 * 1000;
  const VIEW_TITLE_KEYS = {
    homeView: "nav.home",
    activityView: "nav.activity",
    memoryView: "nav.memory",
    pipelineView: "nav.pipeline",
    digestsView: "nav.digests",
    projectsView: "nav.projects",
    skillsView: "nav.skills",
    settingsView: "nav.settings",
    devToolsView: "devtools.title",
  };
  const state = {
    activePanel: "runtimePanel",
    activeView: "homeView",
    devToolsEnabled: false,
    devToolsLoaded: false,
    overviewError: false,
    homeSummary: null,
    homeSummaryAt: 0,
    homeSummaryInFlight: null,
    digestSchedulerAt: 0,
    digestSchedulerAppliedStamp: "",
    homeSignatures: {},
    healthStatus: {},
    overviewAt: 0,
    ringTone: "",
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
    releaseCheck: null,
    contextPayload: null,
    digestSchedulerPayload: null,
    digestPayload: null,
    proceduralDigestPayload: null,
    proceduralSkillsPayload: null,
    proceduralPostTaskReviewsPayload: null,
    proceduralQueryPayload: null,
    statePayload: null,
    searchPayload: null,
    selectedProceduralSkillId: null,
    isCheckingRelease: false,
    isSavingDigestScheduler: false,
    isRunningDigest: false,
    isRefreshingProcedural: false,
    isPromotingProceduralCandidate: false,
    promotingProceduralCandidateKey: "",
    updatingProceduralSkillId: null,
    isSubmittingProceduralFeedback: false,
    isRunningProceduralQuery: false,
    pollHandle: null,
    isPolling: false,
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
    dailyDigestsCount: document.getElementById("dailyDigestsCount"),
    statusText: document.getElementById("statusText"),
    policyUpdatedAt: document.getElementById("policyUpdatedAt"),
    runtimeProjectList: document.getElementById("runtimeProjectList"),
    runtimeAgentList: document.getElementById("runtimeAgentList"),
    runtimeStatusLine: document.getElementById("runtimeStatusLine"),
    releaseStatusBadge: document.getElementById("releaseStatusBadge"),
    releaseCurrentVersion: document.getElementById("releaseCurrentVersion"),
    releaseLatestVersion: document.getElementById("releaseLatestVersion"),
    releaseVersionMeta: document.getElementById("releaseVersionMeta"),
    releaseCheckMeta: document.getElementById("releaseCheckMeta"),
    releaseCheckMessage: document.getElementById("releaseCheckMessage"),
    releaseGuidanceSummary: document.getElementById("releaseGuidanceSummary"),
    releaseGuidanceCommands: document.getElementById("releaseGuidanceCommands"),
    releaseCheckedAt: document.getElementById("releaseCheckedAt"),
    releaseCheckButton: document.getElementById("releaseCheckButton"),
    releaseOpenButton: document.getElementById("releaseOpenButton"),
    dailyDigestStatusBadge: document.getElementById("dailyDigestStatusBadge"),
    dailyDigestProjectSelect: document.getElementById("dailyDigestProjectSelect"),
    dailyDigestDateInput: document.getElementById("dailyDigestDateInput"),
    dailyDigestRunButton: document.getElementById("dailyDigestRunButton"),
    dailyDigestStatusText: document.getElementById("dailyDigestStatusText"),
    dailyDigestLatest: document.getElementById("dailyDigestLatest"),
    dailyDigestSchedulerRuntimeBadge: document.getElementById("dailyDigestSchedulerRuntimeBadge"),
    dailyDigestSchedulerEnabledInput: document.getElementById("dailyDigestSchedulerEnabledInput"),
    dailyDigestScheduleTimeInput: document.getElementById("dailyDigestScheduleTimeInput"),
    dailyDigestTimeZoneInput: document.getElementById("dailyDigestTimeZoneInput"),
    dailyDigestLookbackInput: document.getElementById("dailyDigestLookbackInput"),
    dailyDigestSchedulerSaveButton: document.getElementById("dailyDigestSchedulerSaveButton"),
    dailyDigestSchedulerStatusText: document.getElementById("dailyDigestSchedulerStatusText"),
    dailyDigestSchedulerNextRunText: document.getElementById("dailyDigestSchedulerNextRunText"),
    proceduralSkillsStatus: document.getElementById("proceduralSkillsStatus"),
    proceduralProjectSelect: document.getElementById("proceduralProjectSelect"),
    proceduralLocalDateInput: document.getElementById("proceduralLocalDateInput"),
    proceduralStatusFilter: document.getElementById("proceduralStatusFilter"),
    proceduralAsOfInput: document.getElementById("proceduralAsOfInput"),
    proceduralLimitInput: document.getElementById("proceduralLimitInput"),
    proceduralRefreshButton: document.getElementById("proceduralRefreshButton"),
    proceduralStatusText: document.getElementById("proceduralStatusText"),
    proceduralCandidateList: document.getElementById("proceduralCandidateList"),
    proceduralSkillsList: document.getElementById("proceduralSkillsList"),
    proceduralSkillDetail: document.getElementById("proceduralSkillDetail"),
    proceduralFeedbackOutcomeSelect: document.getElementById("proceduralFeedbackOutcomeSelect"),
    proceduralFeedbackTaskInput: document.getElementById("proceduralFeedbackTaskInput"),
    proceduralFeedbackNotesInput: document.getElementById("proceduralFeedbackNotesInput"),
    proceduralFeedbackStatus: document.getElementById("proceduralFeedbackStatus"),
    proceduralFeedbackButton: document.getElementById("proceduralFeedbackButton"),
    proceduralQueryInput: document.getElementById("proceduralQueryInput"),
    proceduralQueryStatus: document.getElementById("proceduralQueryStatus"),
    proceduralQueryButton: document.getElementById("proceduralQueryButton"),
    proceduralQueryResult: document.getElementById("proceduralQueryResult"),
    proceduralPostTaskReviewList: document.getElementById("proceduralPostTaskReviewList"),
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
    llmBudgetStatus: document.getElementById("llmBudgetStatus"),
    llmOutputBudgetEnabledInput: document.getElementById("llmOutputBudgetEnabledInput"),
    llmObservationMaxTokensInput: document.getElementById("llmObservationMaxTokensInput"),
    llmDigestMaxTokensInput: document.getElementById("llmDigestMaxTokensInput"),
    llmBudgetHint: document.getElementById("llmBudgetHint"),
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
    dailyDigestList: document.getElementById("dailyDigestList"),
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
    appViews: Array.from(document.querySelectorAll(".appView")),
    navItems: Array.from(document.querySelectorAll("#sideNav [data-nav-target]")),
    pageTitle: document.getElementById("pageTitle"),
    devToolsToggle: document.getElementById("devToolsToggle"),
    devToolsNavGroup: document.getElementById("devToolsNavGroup"),
    policyBanner: document.getElementById("policyBanner"),
    policyBannerText: document.getElementById("policyBannerText"),
    homeWorkerCard: document.getElementById("homeWorkerCard"),
    homeQueueCard: document.getElementById("homeQueueCard"),
    homeLlmCard: document.getElementById("homeLlmCard"),
    homeDigestCard: document.getElementById("homeDigestCard"),
    homeVaultCard: document.getElementById("homeVaultCard"),
    homeTodayDate: document.getElementById("homeTodayDate"),
    homeTodayCount: document.getElementById("homeTodayCount"),
    homeKindOutcome: document.getElementById("homeKindOutcome"),
    homeKindContext: document.getElementById("homeKindContext"),
    homeKindLegacy: document.getElementById("homeKindLegacy"),
    homeTodayChart: document.getElementById("homeTodayChart"),
    homeTodayChips: document.getElementById("homeTodayChips"),
    homeAttentionCount: document.getElementById("homeAttentionCount"),
    homeAttentionLoading: document.getElementById("homeAttentionLoading"),
    homeAttentionEmpty: document.getElementById("homeAttentionEmpty"),
    homeAttentionList: document.getElementById("homeAttentionList"),
    homeStatusHero: document.getElementById("homeStatusHero"),
    homeStatusIssue: document.getElementById("homeStatusIssue"),
    homeStatusTitle: document.getElementById("homeStatusTitle"),
    homeStatusLead: document.getElementById("homeStatusLead"),
    homeStatusUpdated: document.getElementById("homeStatusUpdated"),
    homeHealthRing: document.getElementById("homeHealthRing"),
    homeHealthRingChip: document.getElementById("homeHealthRingChip"),
    homeRecentRows: document.getElementById("homeRecentRows"),
    bgPickerButton: document.getElementById("bgPickerButton"),
    bgPopover: document.getElementById("bgPopover"),
    bgPopoverClose: document.getElementById("bgPopoverClose"),
    bgPresetButtons: Array.from(document.querySelectorAll("[data-bg-preset]")),
    bgCustomTile: document.getElementById("bgPresetCustom"),
    bgUploadButton: document.getElementById("bgUploadButton"),
    bgUploadInput: document.getElementById("bgUploadInput"),
    bgToneButtons: Array.from(document.querySelectorAll("[data-bg-tone]")),
    bgBlurInput: document.getElementById("bgBlurInput"),
    bgBlurValue: document.getElementById("bgBlurValue"),
    bgDimInput: document.getElementById("bgDimInput"),
    bgDimValue: document.getElementById("bgDimValue"),
    bgOpacityInput: document.getElementById("bgOpacityInput"),
    bgOpacityValue: document.getElementById("bgOpacityValue"),
    bgResetButton: document.getElementById("bgResetButton"),
    bgDoneButton: document.getElementById("bgDoneButton"),
    bgStatus: document.getElementById("bgStatus"),
  };

  // Background picker state. The popover lives outside the polled views, so a refresh never touches it.
  const bg = {
    api: window.__amBackground || null,
    settings: null,
    open: false,
    objectUrl: "",
    customAvailable: false,
    statusKey: "bg.savedHint",
    statusError: false,
    busy: false,
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
      proceduralSkills: els.proceduralSkillsStatus,
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
    document.querySelectorAll("[data-i18n-title]").forEach((node) => {
      const key = node.getAttribute("data-i18n-title");
      if (!key) return;
      node.setAttribute("title", t(key));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      const key = node.getAttribute("data-i18n-aria-label");
      if (!key) return;
      node.setAttribute("aria-label", t(key));
    });
  }

  // Incremental DOM writes: the 5 s poll only touches nodes whose value actually changed.
  function setText(element, value) {
    if (!element) return;
    const next = String(value);
    if (element.textContent !== next) element.textContent = next;
  }

  function setClass(element, className) {
    if (element && element.className !== className) element.className = className;
  }

  function setAttr(element, name, value) {
    if (!element) return;
    if (value === null || value === undefined || value === "") {
      if (element.hasAttribute(name)) element.removeAttribute(name);
      return;
    }
    if (element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value));
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== !!hidden) element.hidden = !!hidden;
  }

  function setHtmlIfChanged(name, element, signature, render) {
    if (!element || state.homeSignatures[name] === signature) return;
    state.homeSignatures[name] = signature;
    element.innerHTML = render();
  }

  function svgIcon(name, className) {
    return '<svg class="' + className + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (UI_ICONS[name] || "") + '</svg>';
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
    syncPageTitle();
    rerenderStatusLines();
    renderBackgroundControls();
    renderOverview();
    renderHome();
    renderProceduralWorkspace();
    renderLlmConfig();
    renderLlmTestResult();
    renderDailyDigestScheduler();
    renderDailyDigest();
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
    // The Read/Write controls are compact pills in the top bar; the long explanation lives in Settings.
    setClass(card, "policyPill glassPill " + variant + " " +
      (enabled ? "is-enabled" : "is-disabled") +
      (state.isSavingPolicy ? " is-saving" : ""));
    if (toggle.checked !== !!enabled) toggle.checked = !!enabled;
    if (toggle.disabled !== state.isSavingPolicy) toggle.disabled = state.isSavingPolicy;
    setText(badge, state.isSavingPolicy ? t("common.saving") : enabled ? t("shell.on") : t("shell.off"));
    setClass(badge, "policyBadge " + (state.isSavingPolicy ? "saving" : enabled ? "enabled" : "disabled"));
    const metaText = getPolicyMeta(kind, enabled);
    setText(meta, metaText);
    setAttr(card, "title", metaText);
  }

  function renderPolicyBanner(policy) {
    const readOff = !policy.readEnabled;
    const writeOff = !policy.writeEnabled;
    const key = readOff && writeOff ? "shell.bothPaused" : writeOff ? "shell.writesPaused" : readOff ? "shell.readsPaused" : "";
    setHidden(els.policyBanner, !key || state.isSavingPolicy);
    if (key) setText(els.policyBannerText, t(key));
  }

  function syncSelect(select, values, emptyLabel, selectedValue, allowEmpty = true) {
    // Rebuilding an unchanged <select> every poll would close an open dropdown; skip it.
    const optionsKey = JSON.stringify([values || [], emptyLabel, allowEmpty]);
    if (select.dataset.optionsKey === optionsKey) return;
    select.dataset.optionsKey = optionsKey;
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
    if (firstProject && !els.dailyDigestProjectSelect.value) {
      els.dailyDigestProjectSelect.value = firstProject;
    }
    if (firstProject && !els.proceduralProjectSelect.value) {
      els.proceduralProjectSelect.value = firstProject;
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
    els.dailyDigestsCount.textContent = String(stats.dailyDigests || 0);
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
    syncSelect(els.dailyDigestProjectSelect, projects, t("field.chooseProject"), els.dailyDigestProjectSelect.value, true);
    syncSelect(els.proceduralProjectSelect, projects, t("field.chooseProject"), els.proceduralProjectSelect.value, true);
    syncSelect(els.stateProjectSelect, projects, t("field.chooseProject"), els.stateProjectSelect.value, true);
    syncSelect(els.stateWriteProjectSelect, projects, t("field.chooseProject"), els.stateWriteProjectSelect.value, true);
    syncSelect(els.searchProjectSelect, projects, t("field.chooseProject"), els.searchProjectSelect.value, true);
    ensureProjectDefaults(projects);
    renderReleaseCheck();
    renderDailyDigest();
    renderPolicyBanner(policy);
    renderHome();
  }

  function getReleaseStatusPresentation(result) {
    if (state.isCheckingRelease) {
      return { label: t("runtime.releaseCheckingButton"), variant: "warning" };
    }
    if (!result) {
      return { label: t("runtime.releaseStatusUnknown"), variant: "warning" };
    }
    switch (result.status) {
      case "update_available":
        return { label: t("runtime.releaseStatusUpdateAvailable"), variant: "warning" };
      case "invalid_latest_tag":
        return { label: t("runtime.releaseStatusInvalidTag"), variant: "error" };
      case "network_error":
        return { label: t("runtime.releaseStatusNetworkError"), variant: "error" };
      case "up_to_date":
      default:
        return { label: t("runtime.releaseStatusUpToDate"), variant: "success" };
    }
  }

  function getReleasePageUrl() {
    if (state.releaseCheck && state.releaseCheck.releaseUrl) {
      return String(state.releaseCheck.releaseUrl);
    }
    if (state.overview && state.overview.release && state.overview.release.releasesUrl) {
      return String(state.overview.release.releasesUrl);
    }
    return "";
  }

  function renderReleaseCheck() {
    if (!state.overview || !state.overview.release) return;
    const manifest = state.overview.release;
    const result = state.releaseCheck;
    const status = getReleaseStatusPresentation(result);
    const latestVersion = result && result.latestVersion
      ? String(result.latestVersion)
      : t("runtime.releaseUnknown");
    const versionMeta = [];
    if (manifest.tagName) {
      versionMeta.push(t("runtime.releaseCurrentTag", { tag: String(manifest.tagName) }));
    }
    if (result && result.latestTag) {
      versionMeta.push(t("runtime.releaseLatestTag", { tag: String(result.latestTag) }));
    }

    els.releaseStatusBadge.textContent = status.label;
    els.releaseStatusBadge.className = "statusChip " + status.variant;
    els.releaseCurrentVersion.textContent = String(manifest.version || "-");
    els.releaseLatestVersion.textContent = latestVersion;
    els.releaseVersionMeta.textContent = versionMeta.join(" · ");
    els.releaseCheckMeta.textContent = state.isCheckingRelease
      ? t("runtime.releaseChecking")
      : result
        ? t("runtime.releaseCheckedAt", { timestamp: formatDate(result.checkedAt) })
        : t("runtime.releaseNotChecked");
    els.releaseCheckMessage.textContent = result
      ? String(result.message || "")
      : t("runtime.releaseNotChecked");

    if (result && result.upgradeGuidance) {
      els.releaseGuidanceSummary.textContent = String(result.upgradeGuidance.summary || "");
      const commands = Array.isArray(result.upgradeGuidance.commands)
        ? result.upgradeGuidance.commands
        : [];
      els.releaseGuidanceCommands.innerHTML = commands.length > 0
        ? commands.map((command) => (
            '<div class="factCard mono subtle">' + escapeHtml(command) + '</div>'
          )).join("")
        : '<div class="emptyState">' + escapeHtml(t("runtime.releaseGuidancePending")) + '</div>';
    } else {
      els.releaseGuidanceSummary.textContent = t("runtime.releaseGuidancePending");
      els.releaseGuidanceCommands.innerHTML = '<div class="emptyState">' + escapeHtml(t("runtime.releaseGuidancePending")) + '</div>';
    }

    const releaseUrl = getReleasePageUrl();
    els.releaseCheckedAt.textContent = result
      ? t("runtime.releaseCheckedAt", { timestamp: formatDate(result.checkedAt) })
      : "";
    els.releaseCheckButton.disabled = state.isCheckingRelease;
    els.releaseCheckButton.textContent = state.isCheckingRelease
      ? t("runtime.releaseCheckingButton")
      : t("runtime.releaseCheckButton");
    els.releaseOpenButton.disabled = !releaseUrl;
    els.releaseOpenButton.dataset.releaseUrl = releaseUrl;
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
    els.llmBudgetStatus.textContent = config.outputBudgetEnabled
      ? t("llm.budgetActive", { observation: config.observationMaxTokens, digest: config.digestMaxTokens })
      : t("llm.budgetOff");

    if (!state.isSavingLlm && !state.isTestingLlm) {
      els.llmApiUrlInput.value = config.apiUrl || "";
      els.llmModelInput.value = config.model || "";
      els.llmHeadersInput.value = config.headers || "";
      els.llmDisableJsonModeInput.checked = !!config.disableJsonMode;
      els.llmOutputBudgetEnabledInput.checked = !!config.outputBudgetEnabled;
      els.llmObservationMaxTokensInput.value = String(config.observationMaxTokens || 1024);
      els.llmDigestMaxTokensInput.value = String(config.digestMaxTokens || 3072);
    }
    renderLlmBudgetFields();
    els.llmSaveButton.disabled = state.isSavingLlm;
    els.llmReloadButton.disabled = state.isSavingLlm;
    els.llmTestButton.disabled = state.isSavingLlm || state.isTestingLlm;
    if (state.isSavingLlm) {
      els.llmSaveStatus.textContent = t("common.saving");
    }
  }

  function renderLlmBudgetFields() {
    const enabled = els.llmOutputBudgetEnabledInput.checked;
    const busy = state.isSavingLlm || state.isTestingLlm;
    els.llmOutputBudgetEnabledInput.disabled = busy;
    els.llmObservationMaxTokensInput.disabled = !enabled || busy;
    els.llmDigestMaxTokensInput.disabled = !enabled || busy;
    els.llmBudgetHint.textContent = t(enabled ? "llm.budgetEnabledHint" : "llm.budgetDisabledHint");
  }

  function getLlmFormPayload(includeApiKey) {
    const outputBudgetEnabled = els.llmOutputBudgetEnabledInput.checked;
    const budgetValue = (input, fallback) => {
      const value = Number(input.value);
      return outputBudgetEnabled || (Number.isInteger(value) && value >= 256 && value <= 8192) ? value : fallback;
    };
    const payload = {
      apiUrl: els.llmApiUrlInput.value.trim(),
      disableJsonMode: !!els.llmDisableJsonModeInput.checked,
      headers: els.llmHeadersInput.value.trim(),
      model: els.llmModelInput.value.trim(),
      outputBudgetEnabled,
      observationMaxTokens: budgetValue(els.llmObservationMaxTokensInput, state.llmConfig?.observationMaxTokens || 1024),
      digestMaxTokens: budgetValue(els.llmDigestMaxTokensInput, state.llmConfig?.digestMaxTokens || 3072),
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

  function getLocalDateInputValue(date) {
    const current = date || new Date();
    return new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function ensureDailyDigestDateDefault() {
    if (!els.dailyDigestDateInput.value) {
      els.dailyDigestDateInput.value = getLocalDateInputValue();
    }
  }

  function getDigestStatusPresentation(status) {
    if (state.isRunningDigest) {
      return { label: t("runtime.dailyDigestRunning"), variant: "warning" };
    }
    switch (status) {
      case "success":
        return { label: "success", variant: "success" };
      case "failed":
        return { label: "failed", variant: "error" };
      case "skipped_missing_llm":
      case "skipped_no_observations":
        return { label: String(status).replace(/_/g, " "), variant: "warning" };
      default:
        return { label: t("runtime.dailyDigestIdle"), variant: "warning" };
    }
  }

  function getDigestContent(entry) {
    if (!entry) return {};
    return entry.digest || entry;
  }

  function formatConfidence(value) {
    const numeric = Number(value || 0);
    return numeric > 0 ? numeric.toFixed(2) : "0";
  }

  function renderDigestLines(labelKey, lines) {
    const values = Array.isArray(lines) ? lines.filter(Boolean).slice(0, 4) : [];
    if (values.length === 0) return "";
    return '<div style="margin-top: 12px;">' +
      '<div class="metaLabel">' + escapeHtml(t(labelKey)) + '</div>' +
      values.map((line) => '<div class="summaryLine subtle" style="margin-top: 6px;">' + escapeHtml(line) + '</div>').join("") +
      '</div>';
  }

  function renderDigestCard(entry, options) {
    const digest = getDigestContent(entry);
    const status = String(entry && entry.status || digest.status || "");
    const statusPresentation = getDigestStatusPresentation(status);
    const localDate = String(entry && entry.local_date || digest.local_date || "");
    const sourceCount = Number(entry && entry.source_count || digest.source_count || 0);
    const confidence = typeof digest.confidence === "number" ? digest.confidence : Number(entry && entry.confidence || 0);
    const summary = String(digest.summary || "");
    const model = entry && entry.model ? String(entry.model) : "";
    const generatedAt = String(entry && entry.generated_at || digest.generated_at || "");
    const error = String(entry && entry.last_error || digest.last_error || "");
    const compact = !!(options && options.compact);
    const meta = [
      localDate ? localDate : "",
      generatedAt ? formatDate(generatedAt) : "",
      t("runtime.dailyDigestSources", { count: String(sourceCount) }),
      t("runtime.dailyDigestConfidence", { confidence: formatConfidence(confidence) }),
    ].filter(Boolean);
    const details = [
      summary
        ? '<p class="panelLead" style="margin-top: 10px;">' + escapeHtml(summary) + '</p>'
        : '<div class="emptyState" style="margin-top: 10px;">' + escapeHtml(error || t("runtime.dailyDigestNoDigest")) + '</div>',
      compact ? "" : renderDigestLines("runtime.dailyDigestFacts", digest.facts),
      compact ? "" : renderDigestLines("runtime.dailyDigestDecisions", digest.decisions),
      compact ? "" : renderDigestLines("runtime.dailyDigestNextActions", digest.next_actions),
      !compact && model ? '<div class="finePrint" style="margin-top: 10px;">' + escapeHtml(t("runtime.dailyDigestModel", { model })) + '</div>' : "",
      error ? '<div class="finePrint" style="margin-top: 10px;">' + escapeHtml(error) + '</div>' : "",
    ];
    return '<div class="summaryCard">' +
      '<div class="policyTitleRow">' +
        '<div style="font-weight: 700;">' + escapeHtml(localDate || t("runtime.dailyDigestSummary")) + '</div>' +
        '<span class="statusChip ' + escapeHtml(statusPresentation.variant) + '">' + escapeHtml(statusPresentation.label) + '</span>' +
      '</div>' +
      '<div class="finePrint" style="margin-top: 6px;">' + escapeHtml(meta.join(" · ")) + '</div>' +
      details.join("") +
    '</div>';
  }

  function renderDailyDigestScheduler() {
    const payload = state.digestSchedulerPayload;
    const config = payload && payload.config ? payload.config : null;
    const runtime = payload && payload.runtime ? payload.runtime : {};
    const isActive = !!(runtime && runtime.active);

    els.dailyDigestSchedulerSaveButton.disabled = state.isSavingDigestScheduler;
    els.dailyDigestSchedulerSaveButton.textContent = state.isSavingDigestScheduler
      ? t("runtime.dailyDigestSchedulerSavingButton")
      : t("runtime.dailyDigestSchedulerSaveButton");

    if (!config) {
      els.dailyDigestSchedulerRuntimeBadge.textContent = t("runtime.dailyDigestSchedulerLoading");
      els.dailyDigestSchedulerRuntimeBadge.className = "statusChip warning";
      els.dailyDigestSchedulerStatusText.textContent = t("runtime.dailyDigestSchedulerLoading");
      els.dailyDigestSchedulerNextRunText.textContent = "";
      return;
    }

    // Only push saved values into the form when they changed, so polling never wipes an edit in progress.
    const configStamp = JSON.stringify(config);
    if (state.digestSchedulerAppliedStamp !== configStamp) {
      state.digestSchedulerAppliedStamp = configStamp;
      els.dailyDigestSchedulerEnabledInput.checked = !!config.enabled;
      els.dailyDigestScheduleTimeInput.value = String(config.schedule_time || "23:50");
      els.dailyDigestTimeZoneInput.value = String(config.time_zone || "Asia/Shanghai");
      els.dailyDigestLookbackInput.value = String(config.lookback_days || 2);
    }

    els.dailyDigestSchedulerRuntimeBadge.textContent = isActive
      ? t("runtime.dailyDigestSchedulerActive")
      : t("runtime.dailyDigestSchedulerInactive");
    els.dailyDigestSchedulerRuntimeBadge.className = "statusChip " + (isActive ? "success" : "warning");
    if (!state.isSavingDigestScheduler) {
      els.dailyDigestSchedulerStatusText.textContent = t("runtime.dailyDigestSchedulerReady");
    }
    els.dailyDigestSchedulerNextRunText.textContent = runtime.next_run_at
      ? t("runtime.dailyDigestSchedulerNextRun", { timestamp: formatDate(runtime.next_run_at) })
      : t("runtime.dailyDigestSchedulerNoNextRun");
  }

  function renderDailyDigest() {
    ensureDailyDigestDateDefault();
    const projectPath = els.dailyDigestProjectSelect.value;
    const payload = state.digestPayload;
    const latest = payload && payload.latest ? payload.latest : null;
    const statusPresentation = getDigestStatusPresentation(latest && latest.status);
    els.dailyDigestStatusBadge.textContent = statusPresentation.label;
    els.dailyDigestStatusBadge.className = "statusChip " + statusPresentation.variant;
    els.dailyDigestRunButton.disabled = state.isRunningDigest || !projectPath;
    els.dailyDigestRunButton.textContent = state.isRunningDigest
      ? t("runtime.dailyDigestRunningButton")
      : t("runtime.dailyDigestRunButton");

    if (!projectPath) {
      els.dailyDigestStatusText.textContent = t("runtime.dailyDigestNoProject");
      els.dailyDigestLatest.innerHTML = '<div class="emptyState">' + escapeHtml(t("runtime.dailyDigestNoProject")) + '</div>';
      return;
    }

    if (state.isRunningDigest) {
      els.dailyDigestStatusText.textContent = t("runtime.dailyDigestRunning");
      return;
    }

    if (!payload) {
      els.dailyDigestStatusText.textContent = t("runtime.dailyDigestLoading");
      els.dailyDigestLatest.innerHTML = '<div class="emptyState">' + escapeHtml(t("runtime.dailyDigestLoading")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.dailyDigestStatusText.textContent = String(payload.message || t("runtime.dailyDigestDisabled"));
      els.dailyDigestLatest.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("runtime.dailyDigestDisabled")) + '</div>';
      return;
    }

    if (!latest) {
      els.dailyDigestStatusText.textContent = t("runtime.dailyDigestNoDigest");
      els.dailyDigestLatest.innerHTML = '<div class="emptyState">' + escapeHtml(t("runtime.dailyDigestNoDigest")) + '</div>';
      return;
    }

    els.dailyDigestStatusText.textContent = latest.status === "failed"
      ? t("runtime.dailyDigestFailed")
      : t("runtime.dailyDigestLoaded");
    els.dailyDigestLatest.innerHTML = renderDigestCard(latest);
  }

  function getProceduralSkillStatusPresentation(status) {
    switch (String(status || "")) {
      case "enabled":
        return { label: t("procedural.statusEnabled"), variant: "success" };
      case "disabled":
        return { label: t("procedural.statusDisabled"), variant: "warning" };
      case "retired":
        return { label: t("procedural.statusRetired"), variant: "error" };
      default:
        return { label: t("procedural.statusDraft"), variant: "warning" };
    }
  }

  function formatProceduralOutcomeLabel(outcome) {
    switch (String(outcome || "")) {
      case "failure":
        return t("procedural.outcomeFailure");
      case "rejected":
        return t("procedural.outcomeRejected");
      case "skipped":
        return t("procedural.outcomeSkipped");
      default:
        return t("procedural.outcomeSuccess");
    }
  }

  function getProceduralLimitValue() {
    const parsed = Number(els.proceduralLimitInput.value || "10");
    if (!Number.isFinite(parsed)) return 10;
    return Math.max(1, Math.min(20, Math.trunc(parsed)));
  }

  function getProceduralCandidateKey(localDate, index) {
    return String(localDate || "") + ":" + String(index);
  }

  function getProceduralDigests() {
    const payload = state.proceduralDigestPayload;
    return Array.isArray(payload && payload.digests) ? payload.digests : [];
  }

  function getProceduralFilteredDigests() {
    const localDate = String(els.proceduralLocalDateInput.value || "").trim();
    const digests = getProceduralDigests();
    if (!localDate) {
      return digests;
    }
    return digests.filter((digest) => String(digest && digest.local_date || "") === localDate);
  }

  function getProceduralSkills() {
    const payload = state.proceduralSkillsPayload;
    return Array.isArray(payload && payload.skills) ? payload.skills : [];
  }

  function getProceduralPostTaskReviews() {
    const payload = state.proceduralPostTaskReviewsPayload;
    return Array.isArray(payload && payload.reviews) ? payload.reviews : [];
  }

  function syncSelectedProceduralSkill() {
    const skills = getProceduralSkills();
    if (!skills.length) {
      state.selectedProceduralSkillId = null;
      return;
    }
    if (skills.some((skill) => skill.id === state.selectedProceduralSkillId)) {
      return;
    }
    state.selectedProceduralSkillId = skills[0].id;
  }

  function getSelectedProceduralSkill() {
    const skills = getProceduralSkills();
    return skills.find((skill) => skill.id === state.selectedProceduralSkillId) || null;
  }

  function getRolloutStageFromCurrentState(currentState) {
    const facts = Array.isArray(currentState) ? currentState : [];
    const rolloutFact = facts.find((fact) => String(fact && fact.fact_key || "") === "rollout_stage");
    if (!rolloutFact) {
      return t("procedural.rolloutStageUnknown");
    }
    return typeof rolloutFact.value === "string"
      ? rolloutFact.value
      : JSON.stringify(rolloutFact.value);
  }

  function renderProceduralStatusActions(skill) {
    const updatingSkill = state.updatingProceduralSkillId === skill.id;
    const disabled = updatingSkill || state.isPromotingProceduralCandidate || state.isSubmittingProceduralFeedback;
    const labels = [
      { status: "enabled", label: t("procedural.enableButton") },
      { status: "disabled", label: t("procedural.disableButton") },
      { status: "retired", label: t("procedural.retireButton") },
    ];
    return '<div class="actionCluster">' +
      labels.map((entry) => {
        const isCurrent = String(skill.status || "") === entry.status;
        const label = updatingSkill && entry.status === skill.status
          ? t("common.saving")
          : entry.label;
        return '<button class="button ' + (entry.status === "retired" ? "ghost" : "secondary") + '" type="button"' +
          ' data-procedural-skill-status="' + escapeHtml(entry.status) + '"' +
          ' data-procedural-skill-id="' + escapeHtml(skill.id) + '"' +
          (disabled || isCurrent ? " disabled" : "") +
          '>' + escapeHtml(label) + '</button>';
      }).join("") +
      '</div>';
  }

  function renderProceduralCandidateList() {
    const projectPath = els.proceduralProjectSelect.value;
    const payload = state.proceduralDigestPayload;

    if (!projectPath) {
      els.proceduralCandidateList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noCandidatesPrompt")) + '</div>';
      return;
    }

    if (!payload) {
      els.proceduralCandidateList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.loadingCandidates")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.proceduralCandidateList.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("procedural.readDisabled")) + '</div>';
      return;
    }

    const filteredDigests = getProceduralFilteredDigests();
    if (filteredDigests.length === 0) {
      const message = els.proceduralLocalDateInput.value
        ? t("procedural.noDigestForDate", { date: els.proceduralLocalDateInput.value })
        : t("procedural.noDigests");
      els.proceduralCandidateList.innerHTML = '<div class="emptyState">' + escapeHtml(message) + '</div>';
      return;
    }

    const groups = filteredDigests
      .map((digest) => {
        const digestContent = getDigestContent(digest);
        const candidates = Array.isArray(digestContent.skill_candidates) ? digestContent.skill_candidates : [];
        if (!candidates.length) {
          return '<div class="summaryCard proceduralCandidateGroup">' +
            '<div class="policyTitleRow">' +
              '<div style="font-weight: 700;">' + escapeHtml(String(digest.local_date || t("field.localDate"))) + '</div>' +
              '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.candidateCount")) + '</strong> 0</span>' +
            '</div>' +
            '<div class="finePrint" style="margin-top: 6px;">' + escapeHtml(String(digestContent.summary || "")) + '</div>' +
            '<div class="emptyState">' + escapeHtml(t("procedural.noCandidates")) + '</div>' +
          '</div>';
        }
        return '<div class="summaryCard proceduralCandidateGroup">' +
          '<div class="policyTitleRow">' +
            '<div style="font-weight: 700;">' + escapeHtml(String(digest.local_date || t("field.localDate"))) + '</div>' +
            '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.candidateCount")) + '</strong> ' + escapeHtml(String(candidates.length)) + '</span>' +
          '</div>' +
          '<div class="finePrint" style="margin-top: 6px;">' + escapeHtml(String(digestContent.summary || "")) + '</div>' +
          '<div class="listBlock" style="margin-top: 12px;">' +
            candidates.map((candidate, index) => {
              const triggerText = String(candidate && (candidate.trigger_text || candidate.trigger) || "");
              const steps = Array.isArray(candidate && candidate.steps)
                ? candidate.steps.map((step) => String(step).trim()).filter(Boolean)
                : [];
              const candidateKey = getProceduralCandidateKey(digest.local_date, index);
              const isPromoting = state.promotingProceduralCandidateKey === candidateKey;
              return '<div class="summaryCard">' +
                '<div class="policyTitleRow">' +
                  '<div style="font-weight: 700;">' + escapeHtml(String(candidate && candidate.title || t("common.none"))) + '</div>' +
                  '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.confidenceLabel")) + '</strong> ' + escapeHtml(formatConfidence(candidate && candidate.confidence)) + '</span>' +
                '</div>' +
                '<div class="finePrint" style="margin-top: 6px;">' + escapeHtml(triggerText || t("common.none")) + '</div>' +
                '<p class="panelLead" style="margin-top: 10px;">' + escapeHtml(String(candidate && candidate.summary || "")) + '</p>' +
                (steps.length
                  ? '<ol class="proceduralSteps">' + steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join("") + '</ol>'
                  : '<div class="finePrint" style="margin-top: 10px;">' + escapeHtml(t("procedural.noSteps")) + '</div>') +
                '<div class="toolbarFooter" style="margin-top: 12px;">' +
                  '<div class="finePrint">' + escapeHtml(t("procedural.promoteHint")) + '</div>' +
                  '<button class="button primary" type="button" data-procedural-promote="true" data-procedural-local-date="' + escapeHtml(String(digest.local_date || "")) + '" data-procedural-candidate-index="' + escapeHtml(String(index)) + '"' + (isPromoting || state.isRefreshingProcedural ? " disabled" : "") + '>' +
                    escapeHtml(isPromoting ? t("common.saving") : t("procedural.promoteButton")) +
                  '</button>' +
                '</div>' +
              '</div>';
            }).join("") +
          '</div>' +
        '</div>';
      })
      .join("");

    els.proceduralCandidateList.innerHTML = groups || ('<div class="emptyState">' + escapeHtml(t("procedural.noCandidates")) + '</div>');
  }

  function renderProceduralSkillsList() {
    const projectPath = els.proceduralProjectSelect.value;
    const payload = state.proceduralSkillsPayload;

    if (!projectPath) {
      els.proceduralSkillsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noSkillsPrompt")) + '</div>';
      return;
    }

    if (!payload) {
      els.proceduralSkillsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.loadingSkills")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.proceduralSkillsList.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("procedural.readDisabled")) + '</div>';
      return;
    }

    const skills = getProceduralSkills();
    if (!skills.length) {
      els.proceduralSkillsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noSkills")) + '</div>';
      return;
    }

    els.proceduralSkillsList.innerHTML = skills.map((skill) => {
      const statusPresentation = getProceduralSkillStatusPresentation(skill.status);
      const isSelected = skill.id === state.selectedProceduralSkillId;
      return '<div class="summaryCard proceduralSkillCard' + (isSelected ? ' is-selected' : '') + '" role="button" tabindex="0" data-procedural-skill-select="true" data-procedural-skill-id="' + escapeHtml(skill.id) + '">' +
        '<div class="policyTitleRow">' +
          '<div style="font-weight: 700;">' + escapeHtml(skill.title) + '</div>' +
          '<span class="statusChip ' + escapeHtml(statusPresentation.variant) + '">' + escapeHtml(statusPresentation.label) + '</span>' +
        '</div>' +
        '<p class="panelLead" style="margin-top: 10px;">' + escapeHtml(skill.summary) + '</p>' +
        '<div class="metaRow" style="margin-top: 10px;">' +
          '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.confidenceLabel")) + '</strong> ' + escapeHtml(formatConfidence(skill.confidence)) + '</span>' +
          '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.successFailureLabel")) + '</strong> ' + escapeHtml(String(skill.success_count || 0) + "/" + String(skill.failure_count || 0)) + '</span>' +
          '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.lastUsedLabel")) + '</strong> ' + escapeHtml(skill.last_used_at ? formatDate(skill.last_used_at) : t("procedural.neverUsed")) + '</span>' +
        '</div>' +
        '<div class="toolbarFooter" style="margin-top: 12px;">' +
          '<div class="finePrint">' + escapeHtml(skill.trigger_text || t("common.none")) + '</div>' +
          renderProceduralStatusActions(skill) +
        '</div>' +
      '</div>';
    }).join("");
  }

  function renderProceduralSkillDetail() {
    const skill = getSelectedProceduralSkill();
    if (!skill) {
      els.proceduralSkillDetail.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noSkillSelected")) + '</div>';
      return;
    }

    const statusPresentation = getProceduralSkillStatusPresentation(skill.status);
    const steps = Array.isArray(skill.steps) ? skill.steps : [];
    const feedbackSummary = skill.feedback_summary || {};
    const feedbackHistory = Array.isArray(skill.feedback_history) ? skill.feedback_history : [];
    const lifecycleSignal = skill.lifecycle_signal || null;
    els.proceduralSkillDetail.innerHTML = '<div class="summaryCard">' +
      '<div class="policyTitleRow">' +
        '<div style="font-weight: 700;">' + escapeHtml(skill.title) + '</div>' +
        '<span class="statusChip ' + escapeHtml(statusPresentation.variant) + '">' + escapeHtml(statusPresentation.label) + '</span>' +
      '</div>' +
      '<div class="proceduralDetailStats">' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.confidenceLabel")) + '</strong> ' + escapeHtml(formatConfidence(skill.confidence)) + '</span>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.successFailureLabel")) + '</strong> ' + escapeHtml(String(skill.success_count || 0) + "/" + String(skill.failure_count || 0)) + '</span>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.lastUsedLabel")) + '</strong> ' + escapeHtml(skill.last_used_at ? formatDate(skill.last_used_at) : t("procedural.neverUsed")) + '</span>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.feedbackCountLabel")) + '</strong> ' + escapeHtml(String(feedbackSummary.total || 0)) + '</span>' +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.triggerLabel")) + '</div>' +
        '<div class="recordSummary" style="margin-top: 8px;">' + escapeHtml(skill.trigger_text || t("common.none")) + '</div>' +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.summaryLabel")) + '</div>' +
        '<div class="recordSummary" style="margin-top: 8px;">' + escapeHtml(skill.summary || t("common.none")) + '</div>' +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.stepsLabel")) + '</div>' +
        (steps.length
          ? '<ol class="proceduralSteps">' + steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join("") + '</ol>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("procedural.noSteps")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.evidenceLabel")) + '</div>' +
        '<div class="chipsRow" style="margin-top: 10px;">' +
          '<span class="tag">' + escapeHtml(t("procedural.sourceDigestLabel")) + ': ' + escapeHtml(String(skill.source_digest_id || t("common.none"))) + '</span>' +
          '<span class="tag">' + escapeHtml(t("procedural.sourceObservationsLabel")) + ': ' + escapeHtml(String(skill.source_observation_count || 0)) + '</span>' +
          '<span class="tag">' + escapeHtml(t("procedural.statusEffectiveLabel")) + ': ' + escapeHtml(skill.status_effective_at ? formatDate(skill.status_effective_at) : t("common.none")) + '</span>' +
        '</div>' +
        (lifecycleSignal
          ? '<div class="recordSummary" style="margin-top: 10px;">' + escapeHtml(t("procedural.lifecycleSignalLabel")) + ': ' + escapeHtml(lifecycleSignal.state) + ' (' + escapeHtml(String(Number(lifecycleSignal.score || 0).toFixed ? Number(lifecycleSignal.score || 0).toFixed(2) : lifecycleSignal.score)) + ')</div>' +
            '<ul class="listDetails" style="margin-top: 10px;">' + lifecycleSignal.reasons.map((reason) => '<li>' + escapeHtml(String(reason)) + '</li>').join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.feedbackHistoryLabel")) + '</div>' +
        (feedbackHistory.length
          ? '<ul class="listDetails" style="margin-top: 10px;">' + feedbackHistory.map((feedback) =>
              '<li><strong>' + escapeHtml(formatProceduralOutcomeLabel(feedback.outcome)) + '</strong> · ' +
              escapeHtml(feedback.created_at ? formatDate(feedback.created_at) : t("common.none")) +
              (feedback.task_text ? ' · ' + escapeHtml(feedback.task_text) : '') +
              (feedback.notes ? ' · ' + escapeHtml(feedback.notes) : '') +
              '</li>'
            ).join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("procedural.noFeedbackHistory")) + '</div>') +
      '</div>' +
      '<div class="toolbarFooter" style="margin-top: 14px;">' +
        '<div class="finePrint">' + escapeHtml(t("procedural.statusActionsHint")) + '</div>' +
        renderProceduralStatusActions(skill) +
      '</div>' +
    '</div>';
  }

  function renderProceduralQueryResult() {
    const payload = state.proceduralQueryPayload;
    if (!payload) {
      els.proceduralQueryResult.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.queryEmpty")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.proceduralQueryResult.innerHTML = '<div class="emptyState">' + escapeHtml(payload.message || t("procedural.readDisabled")) + '</div>';
      return;
    }

    const policy = payload.policy || {};
    const matchedSkills = Array.isArray(payload.procedural_skills) ? payload.procedural_skills : [];
    const rolloutStage = getRolloutStageFromCurrentState(payload.project_context && payload.project_context.current_state);
    const reasons = Array.isArray(policy.reasons) ? policy.reasons : [];
    const layers = Array.isArray(policy.layers) ? policy.layers : [];
    const boundedContext = payload.bounded_context || (payload.project_context && payload.project_context.bounded_context) || null;
    const temporalDiagnostics = payload.temporal_diagnostics || (payload.project_context && payload.project_context.temporal_diagnostics) || null;
    const decisionTrace = payload.decision_trace || (payload.project_context && payload.project_context.decision_trace) || null;
    els.proceduralQueryResult.innerHTML = '<div class="summaryCard">' +
      '<div class="policyTitleRow">' +
        '<div style="font-weight: 700;">' + escapeHtml(t("procedural.queryResultTitle")) + '</div>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.actionLabel")) + '</strong> ' + escapeHtml(String(policy.action || t("common.none"))) + '</span>' +
      '</div>' +
      '<div class="metaRow" style="margin-top: 10px;">' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.rolloutStageLabel")) + '</strong> ' + escapeHtml(rolloutStage) + '</span>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.matchedSkillsLabel")) + '</strong> ' + escapeHtml(String(matchedSkills.length)) + '</span>' +
        '<span class="metricBadge"><strong>' + escapeHtml(t("field.asOf")) + '</strong> ' + escapeHtml(payload.as_of || t("common.none")) + '</span>' +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.layersLabel")) + '</div>' +
        '<div class="chipsRow" style="margin-top: 10px;">' +
          (layers.length
            ? layers.map((layer) => '<span class="tag">' + escapeHtml(String(layer)) + '</span>').join("")
            : '<span class="tag">' + escapeHtml(t("common.none")) + '</span>') +
        '</div>' +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.reasonsLabel")) + '</div>' +
        (reasons.length
          ? '<ul class="listDetails" style="margin-top: 10px;">' + reasons.map((reason) => '<li>' + escapeHtml(String(reason)) + '</li>').join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.matchedTitlesLabel")) + '</div>' +
        (matchedSkills.length
          ? '<ul class="listDetails" style="margin-top: 10px;">' + matchedSkills.map((skill) =>
              '<li><strong>' + escapeHtml(String(skill.title || "")) + '</strong> · ' +
              escapeHtml(String(skill.recommendation_state || t("common.none"))) +
              ' · ' + escapeHtml(String(typeof skill.recommendation_score === "number" ? skill.recommendation_score.toFixed(2) : t("common.none"))) +
              (Array.isArray(skill.recommendation_reasons) && skill.recommendation_reasons[0]
                ? ' · ' + escapeHtml(String(skill.recommendation_reasons[0]))
                : '') +
              '</li>'
            ).join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("procedural.noMatchedSkills")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.boundedContextLabel")) + '</div>' +
        (boundedContext
          ? '<div class="chipsRow" style="margin-top: 10px;">' +
              '<span class="tag">' + escapeHtml(t("procedural.contextBudgetLabel")) + ': ' + escapeHtml(String(boundedContext.recommended_char_budget || 0)) + '</span>' +
              '<span class="tag">' + escapeHtml(t("procedural.contextUsedLabel")) + ': ' + escapeHtml(String(boundedContext.char_budget_used || 0)) + '</span>' +
              '<span class="tag">' + escapeHtml(t("procedural.contextTrimmedLabel")) + ': ' + escapeHtml(String(boundedContext.trimmed_entry_count || 0)) + '</span>' +
            '</div>' +
            '<div class="recordSummary" style="margin-top: 10px;">' + escapeHtml((boundedContext.rendered_package || "").trim() || t("common.none")) + '</div>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.temporalDiagnosticsLabel")) + '</div>' +
        (temporalDiagnostics && Array.isArray(temporalDiagnostics.layer_diagnostics) && temporalDiagnostics.layer_diagnostics.length
          ? '<ul class="listDetails" style="margin-top: 10px;">' + temporalDiagnostics.layer_diagnostics.map((layer) =>
              '<li><strong>' + escapeHtml(String(layer.layer)) + '</strong> · ' +
              escapeHtml(String(layer.effective_time_field || "n/a")) +
              ' / ' + escapeHtml(String(layer.recorded_time_field || "")) +
              ' · ' + escapeHtml(String(layer.included_count || 0)) +
              (Array.isArray(layer.notes) && layer.notes[0] ? ' · ' + escapeHtml(String(layer.notes[0])) : '') +
              '</li>'
            ).join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
      '</div>' +
      '<div class="detailCard">' +
        '<div class="metaLabel">' + escapeHtml(t("procedural.decisionTraceLabel")) + '</div>' +
        (decisionTrace && Array.isArray(decisionTrace.steps) && decisionTrace.steps.length
          ? '<ul class="listDetails" style="margin-top: 10px;">' + decisionTrace.steps.map((step) =>
              '<li><strong>' + escapeHtml(String(step.step || "")) + '</strong> · ' +
              escapeHtml(String(step.decision || "")) +
              (Array.isArray(step.reasons) && step.reasons[0] ? ' · ' + escapeHtml(String(step.reasons[0])) : '') +
              '</li>'
            ).join("") + '</ul>'
          : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
      '</div>' +
      '<div class="finePrint" style="margin-top: 14px;">' + escapeHtml(t("procedural.generatedAt", { timestamp: formatDate(payload.generated_at) })) + '</div>' +
    '</div>';
  }

  function renderProceduralPostTaskReviews() {
    const projectPath = els.proceduralProjectSelect.value;
    const payload = state.proceduralPostTaskReviewsPayload;

    if (!projectPath) {
      els.proceduralPostTaskReviewList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noPostTaskReviewsPrompt")) + '</div>';
      return;
    }

    if (!payload) {
      els.proceduralPostTaskReviewList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.loadingPostTaskReviews")) + '</div>';
      return;
    }

    if (payload.disabled) {
      els.proceduralPostTaskReviewList.innerHTML = '<div class="emptyState">' + escapeHtml(String(payload.message || t("procedural.readDisabled"))) + '</div>';
      return;
    }

    const reviews = getProceduralPostTaskReviews();
    if (!reviews.length) {
      els.proceduralPostTaskReviewList.innerHTML = '<div class="emptyState">' + escapeHtml(t("procedural.noPostTaskReviews")) + '</div>';
      return;
    }

    els.proceduralPostTaskReviewList.innerHTML = reviews.map((review) => {
      const matchedTitles = Array.isArray(review.matched_skill_titles) ? review.matched_skill_titles : [];
      const recommendationStates = Array.isArray(review.recommendation_states) ? review.recommendation_states : [];
      const decisionTrace = review.decision_trace && Array.isArray(review.decision_trace.steps)
        ? review.decision_trace.steps
        : [];
      const boundedContext = review.bounded_context || null;
      return '<div class="summaryCard">' +
        '<div class="policyTitleRow">' +
          '<div style="font-weight: 700;">' + escapeHtml(String(review.source_title || t("common.none"))) + '</div>' +
          '<span class="metricBadge"><strong>' + escapeHtml(t("procedural.actionLabel")) + '</strong> ' + escapeHtml(String(review.status || "open")) + '</span>' +
        '</div>' +
        '<div class="finePrint" style="margin-top: 6px;">' +
          escapeHtml(t("procedural.generatedAt", { timestamp: formatDate(review.generated_at) })) +
        '</div>' +
        '<div class="detailCard">' +
          '<div class="metaLabel">' + escapeHtml(t("procedural.postTaskReviewQueryLabel")) + '</div>' +
          '<div class="recordSummary" style="margin-top: 8px;">' + escapeHtml(String(review.query_text || t("common.none"))) + '</div>' +
        '</div>' +
        '<div class="detailCard">' +
          '<div class="metaLabel">' + escapeHtml(t("procedural.matchedTitlesLabel")) + '</div>' +
          (matchedTitles.length
            ? '<ul class="listDetails" style="margin-top: 10px;">' + matchedTitles.map((title, index) =>
                '<li><strong>' + escapeHtml(String(title)) + '</strong>' +
                (recommendationStates[index] ? ' · ' + escapeHtml(String(recommendationStates[index])) : '') +
                '</li>'
              ).join("") + '</ul>'
            : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("procedural.noMatchedSkills")) + '</div>') +
        '</div>' +
        '<div class="detailCard">' +
          '<div class="metaLabel">' + escapeHtml(t("procedural.boundedContextLabel")) + '</div>' +
          (boundedContext
            ? '<div class="chipsRow" style="margin-top: 10px;">' +
                '<span class="tag">' + escapeHtml(t("procedural.contextBudgetLabel")) + ': ' + escapeHtml(String(boundedContext.recommended_char_budget || 0)) + '</span>' +
                '<span class="tag">' + escapeHtml(t("procedural.contextUsedLabel")) + ': ' + escapeHtml(String(boundedContext.char_budget_used || 0)) + '</span>' +
                '<span class="tag">' + escapeHtml(t("procedural.contextTrimmedLabel")) + ': ' + escapeHtml(String(boundedContext.trimmed_entry_count || 0)) + '</span>' +
              '</div>'
            : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
        '</div>' +
        '<div class="detailCard">' +
          '<div class="metaLabel">' + escapeHtml(t("procedural.decisionTraceLabel")) + '</div>' +
          (decisionTrace.length
            ? '<ul class="listDetails" style="margin-top: 10px;">' + decisionTrace.map((step) =>
                '<li><strong>' + escapeHtml(String(step.step || "")) + '</strong> · ' +
                escapeHtml(String(step.decision || "")) +
                (Array.isArray(step.reasons) && step.reasons[0] ? ' · ' + escapeHtml(String(step.reasons[0])) : '') +
                '</li>'
              ).join("") + '</ul>'
            : '<div class="finePrint" style="margin-top: 8px;">' + escapeHtml(t("common.none")) + '</div>') +
        '</div>' +
      '</div>';
    }).join("");
  }

  function renderProceduralWorkspace() {
    const projectPath = els.proceduralProjectSelect.value;
    const selectedSkill = getSelectedProceduralSkill();
    const digestPayload = state.proceduralDigestPayload;
    const skillsPayload = state.proceduralSkillsPayload;

    els.proceduralRefreshButton.disabled = state.isRefreshingProcedural || !projectPath;
    els.proceduralRefreshButton.textContent = state.isRefreshingProcedural
      ? t("procedural.refreshingButton")
      : t("procedural.refreshButton");
    els.proceduralFeedbackButton.disabled = state.isSubmittingProceduralFeedback || !projectPath || !selectedSkill;
    els.proceduralFeedbackButton.textContent = state.isSubmittingProceduralFeedback
      ? t("procedural.feedbackSavingButton")
      : t("procedural.feedbackButton");
    els.proceduralQueryButton.disabled = state.isRunningProceduralQuery || !projectPath;
    els.proceduralQueryButton.textContent = state.isRunningProceduralQuery
      ? t("procedural.queryRunningButton")
      : t("procedural.queryButton");

    if (!projectPath) {
      els.proceduralStatusText.textContent = t("procedural.noProjectSelected");
      els.proceduralFeedbackStatus.textContent = t("procedural.feedbackIdle");
      els.proceduralQueryStatus.textContent = t("procedural.queryIdle");
    } else if (state.isRefreshingProcedural) {
      els.proceduralStatusText.textContent = t("procedural.loadingWorkspace");
      els.proceduralFeedbackStatus.textContent = selectedSkill
        ? t("procedural.feedbackReady", { title: selectedSkill.title })
        : t("procedural.feedbackIdle");
      els.proceduralQueryStatus.textContent = t("procedural.queryIdle");
    } else if (digestPayload && digestPayload.disabled) {
      els.proceduralStatusText.textContent = String(digestPayload.message || t("procedural.readDisabled"));
      els.proceduralFeedbackStatus.textContent = selectedSkill
        ? t("procedural.feedbackReady", { title: selectedSkill.title })
        : t("procedural.feedbackIdle");
      els.proceduralQueryStatus.textContent = t("procedural.queryIdle");
    } else if (skillsPayload && skillsPayload.disabled) {
      els.proceduralStatusText.textContent = String(skillsPayload.message || t("procedural.readDisabled"));
      els.proceduralFeedbackStatus.textContent = selectedSkill
        ? t("procedural.feedbackReady", { title: selectedSkill.title })
        : t("procedural.feedbackIdle");
      els.proceduralQueryStatus.textContent = t("procedural.queryIdle");
    } else {
      els.proceduralStatusText.textContent = t("procedural.workspaceLoaded", {
        digests: String(getProceduralDigests().length),
        skills: String(getProceduralSkills().length),
      });
      els.proceduralFeedbackStatus.textContent = state.isSubmittingProceduralFeedback
        ? t("procedural.feedbackSaving")
        : selectedSkill
          ? t("procedural.feedbackReady", { title: selectedSkill.title })
          : t("procedural.feedbackIdle");
      if (state.isRunningProceduralQuery) {
        els.proceduralQueryStatus.textContent = t("procedural.queryRunning");
      } else if (state.proceduralQueryPayload && !state.proceduralQueryPayload.disabled) {
        els.proceduralQueryStatus.textContent = t("procedural.generatedAt", {
          timestamp: formatDate(state.proceduralQueryPayload.generated_at),
        });
      } else if (state.proceduralQueryPayload && state.proceduralQueryPayload.disabled) {
        els.proceduralQueryStatus.textContent = String(state.proceduralQueryPayload.message || t("procedural.readDisabled"));
      } else {
        els.proceduralQueryStatus.textContent = t("procedural.queryIdle");
      }
    }

    renderProceduralCandidateList();
    renderProceduralSkillsList();
    renderProceduralSkillDetail();
    renderProceduralQueryResult();
    renderProceduralPostTaskReviews();
  }

  function showProceduralError(error) {
    const message = error && error.message ? error.message : t("procedural.workspaceFailed");
    els.proceduralStatusText.textContent = message;
    setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, message, "error");
  }

  function renderContextCards(view) {
    if (!view || view.disabled) {
      els.currentStateList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.contextReadDisabled")) + '</div>';
      els.dailyDigestList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.dailyDigestsUnavailable")) + '</div>';
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

    els.dailyDigestList.innerHTML = Array.isArray(view.daily_digests) && view.daily_digests.length > 0
      ? view.daily_digests.map((digest) => renderDigestCard(digest, { compact: true })).join("")
      : '<div class="emptyState">' + escapeHtml(t("projectContext.noDailyDigests")) + '</div>';

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
      els.dailyDigestList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noDailyDigests")) + '</div>';
      els.summaryBlocksList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noSummaryDisplay")) + '</div>';
      els.recentObservationsList.innerHTML = '<div class="emptyState">' + escapeHtml(t("projectContext.noRecentDisplay")) + '</div>';
      return;
    }

    const metrics = payload.metrics || {};
    const view = payload.view || {};
    els.contextMetrics.innerHTML = [
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.payload")) + '</strong> ' + escapeHtml(String(metrics.payloadBytes || 0)) + ' ' + escapeHtml(t("common.bytes")) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.dailyDigests")) + '</strong> ' + escapeHtml(String((view.daily_digests || []).length)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.summary")) + '</strong> ' + escapeHtml(String(metrics.summaryCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.proceduralSkills")) + '</strong> ' + escapeHtml(String(metrics.proceduralSkillCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.windowEntries")) + '</strong> ' + escapeHtml(String(metrics.slidingWindowEntryCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.contextBudget")) + '</strong> ' + escapeHtml(String(metrics.boundedContextBudget || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.contextUsed")) + '</strong> ' + escapeHtml(String(metrics.boundedContextCharsUsed || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.contextTrimmed")) + '</strong> ' + escapeHtml(String(metrics.boundedContextTrimmedEntries || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.temporalLayers")) + '</strong> ' + escapeHtml(String(metrics.temporalDiagnosticLayerCount || 0)) + '</span>',
      '<span class="metricBadge"><strong>' + escapeHtml(t("metrics.decisionTrace")) + '</strong> ' + escapeHtml(String(metrics.decisionTraceStepCount || 0)) + '</span>',
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

  function parseTimestamp(value) {
    if (!value) return null;
    const text = String(value);
    const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T") + "Z");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseLocalDay(value) {
    const parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatClock(date) {
    return date.toLocaleTimeString(state.locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function formatShortDate(date) {
    return date ? date.toLocaleDateString(state.locale, { month: "short", day: "numeric" }) : "";
  }

  function calendarDaysAgo(date) {
    const now = new Date();
    const then = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today.getTime() - then.getTime()) / 86400000);
  }

  function formatDayLabel(date) {
    const days = calendarDaysAgo(date);
    return days === 0 ? t("home.today") : days === 1 ? t("home.yesterday") : formatShortDate(date);
  }

  function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days > 0) return t("home.durationDays", { d: days, h: hours });
    if (hours > 0) return t("home.durationHours", { h: hours, m: minutes % 60 });
    return t("home.durationMinutes", { m: minutes });
  }

  function projectBasename(projectPath) {
    const parts = String(projectPath || "").split(String.fromCharCode(92)).join("/").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : String(projectPath || "");
  }

  function renderHealthCard(card, status, value, meta, title) {
    if (!card) return;
    state.healthStatus[card.id] = status;
    setClass(card, "healthCard glassCard glassBlur is-" + status);
    setText(document.getElementById(card.id + "Value"), value);
    setText(document.getElementById(card.id + "Meta"), meta || "\\u00a0");
    setAttr(card, "title", title || "");
  }

  function renderHomeHealth() {
    const overview = state.overview;
    const summary = state.homeSummary;
    const now = Date.now();

    if (state.overviewError) {
      renderHealthCard(els.homeWorkerCard, "error", t("home.workerUnreachable"), t("home.workerUnreachableMeta"));
    } else if (!overview) {
      renderHealthCard(els.homeWorkerCard, "idle", "—", t("home.loading"));
    } else {
      const version = overview.release && overview.release.version ? "v" + overview.release.version : "";
      const startedAt = parseTimestamp(overview.startedAt);
      const uptime = startedAt ? t("home.uptime", { duration: formatDuration(now - startedAt.getTime()) }) : "";
      renderHealthCard(els.homeWorkerCard, "ok", t("home.workerRunning"), [version, uptime].filter(Boolean).join(" · "));
    }

    if (overview && overview.queue) {
      const stuck = Number(overview.queue.stuck_tasks || 0);
      const duplicates = Number(overview.queue.duplicate_flags || 0);
      renderHealthCard(
        els.homeQueueCard,
        stuck > 0 || duplicates > 0 ? "warn" : "ok",
        t("home.queuePending", { n: Number(overview.queue.pending || 0) }),
        t("home.queueMeta", { stuck, dup: duplicates })
      );
    } else if (!overview) {
      renderHealthCard(els.homeQueueCard, "idle", "—", t("home.loading"));
    }

    // TODO(api): llm usage. Calls, latency and tokens per day need an endpoint over logs/llm-usage-*.jsonl;
    // until then this card reports today's task-summary success rate (saved vs raw fallback) from task_results.
    if (!summary) {
      renderHealthCard(els.homeLlmCard, "idle", "—", t("home.loading"), t("home.llmHint"));
    } else {
      const tasks = summary.tasks_today || {};
      const total = Number(tasks.total || 0);
      if (total === 0) {
        renderHealthCard(els.homeLlmCard, "idle", "—", t("home.llmNoTasks"), t("home.llmHint"));
      } else {
        const fallback = Number(tasks.fallback || 0);
        const rate = Math.round(((total - fallback) / total) * 100);
        renderHealthCard(
          els.homeLlmCard,
          rate < 80 ? "error" : rate < 95 ? "warn" : "ok",
          rate + "%",
          t("home.llmMeta", { calls: Number(tasks.llm_calls || 0), fallback }),
          t("home.llmHint")
        );
      }
    }

    const scheduler = state.digestSchedulerPayload;
    const nextRun = scheduler && scheduler.runtime ? parseTimestamp(scheduler.runtime.next_run_at) : null;
    const schedulerEnabled = !!(scheduler && scheduler.config && scheduler.config.enabled);
    if (!summary) {
      renderHealthCard(els.homeDigestCard, "idle", "—", t("home.loading"));
    } else {
      const latest = summary.digests && summary.digests.latest;
      const generatedAt = latest ? parseTimestamp(latest.generated_at) : null;
      if (!latest || !generatedAt) {
        renderHealthCard(els.homeDigestCard, "idle", "—", t("home.digestNone"));
      } else {
        const status = String(latest.status || "");
        const projects = Number(summary.digests.latest_day_projects || 0);
        const meta = !scheduler
          ? t("home.digestMeta", { n: projects, time: "—" })
          : schedulerEnabled && nextRun
            ? t("home.digestMeta", { n: projects, time: formatClock(nextRun) })
            : t("home.digestMetaNoNext", { n: projects });
        renderHealthCard(
          els.homeDigestCard,
          status === "failed" ? "error" : status === "skipped_missing_llm" ? "warn" : "ok",
          calendarDaysAgo(generatedAt) === 0 ? formatClock(generatedAt) : formatShortDate(generatedAt),
          meta,
          [projectBasename(latest.project_path), latest.local_date, status.replace(/_/g, " "), generatedAt.toLocaleString(state.locale)].filter(Boolean).join(" · ")
        );
      }
    }

    if (!summary) {
      renderHealthCard(els.homeVaultCard, "idle", "—", t("home.loading"));
    } else {
      const checkpoint = parseTimestamp(summary.vault_review && summary.vault_review.last_successful_review_at);
      if (!checkpoint) {
        renderHealthCard(els.homeVaultCard, "idle", "—", t("home.vaultNone"));
      } else {
        const age = now - checkpoint.getTime();
        const daysAgo = calendarDaysAgo(checkpoint);
        const ageText = formatDuration(age);
        renderHealthCard(
          els.homeVaultCard,
          age > VAULT_STALE_MS ? "warn" : "ok",
          daysAgo <= 1 ? formatClock(checkpoint) : formatShortDate(checkpoint),
          daysAgo <= 1 ? t("home.vaultMeta", { day: formatDayLabel(checkpoint), age: ageText }) : t("home.vaultAge", { age: ageText }),
          checkpoint.toLocaleString(state.locale)
        );
      }
    }
  }

  function niceStep(raw) {
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const fraction = raw / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  }

  // Stacked 30-day bars as inline SVG; rebuilt only when the daily counts or the locale change.
  function renderDailyChart(daily) {
    if (!daily.length) return "";
    const width = 720;
    const height = 210;
    const left = 40;
    const right = 12;
    const top = 30;
    const bottom = 26;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const baseY = top + plotHeight;
    const totals = daily.map((day) => Number(day.outcome || 0) + Number(day.context || 0) + Number(day.legacy || 0));
    const maxTotal = Math.max(0, ...totals);
    const step = maxTotal > 0 ? Math.max(1, niceStep(maxTotal / 2)) : 1;
    const ceiling = Math.max(step, Math.ceil(maxTotal / step) * step);
    const yFor = (value) => baseY - (value / ceiling) * plotHeight;
    const slot = plotWidth / daily.length;
    const barWidth = Math.max(3, Math.min(16, slot * 0.58));
    const parts = [];

    for (let value = 0; value <= ceiling; value += step) {
      const y = yFor(value);
      parts.push('<line class="' + (value === 0 ? "chartAxis" : "chartGrid") + '" x1="' + left + '" x2="' + (width - right) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      parts.push('<text x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(value.toLocaleString(state.locale)) + '</text>');
    }

    daily.forEach((day, index) => {
      const x = left + index * slot + (slot - barWidth) / 2;
      const segments = [
        ["barOutcome", Number(day.outcome || 0)],
        ["barContext", Number(day.context || 0)],
        ["barLegacy", Number(day.legacy || 0)],
      ];
      let cursor = baseY;
      const rects = segments.filter((segment) => segment[1] > 0).map((segment) => {
        const segmentHeight = Math.max(2, (segment[1] / ceiling) * plotHeight);
        cursor -= segmentHeight;
        return '<rect class="' + segment[0] + '" x="' + x.toFixed(1) + '" y="' + cursor.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + segmentHeight.toFixed(1) + '" rx="2"/>';
      });
      const tooltip = t("home.barTooltip", {
        date: formatShortDate(parseLocalDay(day.day)),
        outcome: Number(day.outcome || 0),
        context: Number(day.context || 0),
        legacy: Number(day.legacy || 0),
      });
      parts.push('<g class="barGroup"><title>' + escapeHtml(tooltip) + '</title>' +
        '<rect x="' + (left + index * slot).toFixed(1) + '" y="' + top + '" width="' + slot.toFixed(1) + '" height="' + plotHeight + '" fill="transparent"/>' +
        rects.join("") + '</g>');
    });

    daily.forEach((day, index) => {
      if ((daily.length - 1 - index) % 7 !== 0) return;
      const center = left + index * slot + slot / 2;
      parts.push('<text x="' + center.toFixed(1) + '" y="' + (height - 6) + '" text-anchor="middle">' + escapeHtml(formatShortDate(parseLocalDay(day.day))) + '</text>');
    });

    // The v2.1 switch to one memory per task explains the volume drop; mark it so it is not read as an outage.
    const markerIndex = daily.findIndex((day) => day.day === V21_SWITCH_DAY);
    if (markerIndex > 0) {
      const markerX = left + markerIndex * slot;
      const labelOnLeft = markerX > width * 0.6;
      parts.push('<line class="chartMarker" x1="' + markerX.toFixed(1) + '" x2="' + markerX.toFixed(1) + '" y1="' + (top - 12) + '" y2="' + baseY + '"/>');
      parts.push('<circle class="chartMarkerDot" cx="' + markerX.toFixed(1) + '" cy="' + (top - 14) + '" r="3.2"/>');
      parts.push('<text class="chartMarkerLabel" x="' + (markerX + (labelOnLeft ? -8 : 8)).toFixed(1) + '" y="' + (top - 10) + '" text-anchor="' + (labelOnLeft ? "end" : "start") + '">' + escapeHtml(t("home.v21Marker")) + '</text>');
    }

    return '<svg class="chartSvg" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" focusable="false">' + parts.join("") + '</svg>';
  }

  function renderHomeToday() {
    const summary = state.homeSummary;
    if (!summary || !summary.today) {
      setText(els.homeTodayCount, "—");
      return;
    }
    const today = summary.today;
    setText(els.homeTodayCount, String(today.total || 0));
    setText(els.homeKindOutcome, String(today.outcome || 0));
    setText(els.homeKindContext, String(today.context || 0));
    setText(els.homeKindLegacy, String(today.legacy || 0));
    const todayDate = parseLocalDay(today.date);
    setText(els.homeTodayDate, todayDate ? todayDate.toLocaleDateString(state.locale, { weekday: "short", month: "short", day: "numeric" }) : "");

    const daily = Array.isArray(summary.daily) ? summary.daily : [];
    setHtmlIfChanged("chart", els.homeTodayChart, state.locale + JSON.stringify(daily), () => renderDailyChart(daily));

    const agents = Array.isArray(today.agents) ? today.agents : [];
    const projects = Array.isArray(today.projects) ? today.projects : [];
    setHtmlIfChanged("chips", els.homeTodayChips, state.locale + JSON.stringify([agents, projects]), () => {
      if (!agents.length && !projects.length) {
        return '<span class="metaChip is-muted">' + escapeHtml(t("home.noActivityToday")) + '</span>';
      }
      return agents.map((agent) => (
        '<span class="metaChip is-agent">' + svgIcon("tag", "chipIcon") +
          '<span>' + escapeHtml(agent.agent_id) + '</span>' +
          '<span class="metaChipCount">' + escapeHtml(String(agent.n)) + '</span>' +
        '</span>'
      )).join("") + projects.map((project) => (
        '<span class="metaChip" title="' + escapeHtml(project.project_path) + '">' + svgIcon("projects", "chipIcon") +
          '<span>' + escapeHtml(projectBasename(project.project_path)) + '</span>' +
          '<span class="metaChipCount">' + escapeHtml(String(project.n)) + '</span>' +
        '</span>'
      )).join("");
    });
  }

  function collectAttentionItems() {
    const items = [];
    const overview = state.overview;
    const summary = state.homeSummary;
    if (state.overviewError) {
      items.push({ severity: "error", text: t("home.attnUnreachable"), target: "settingsView" });
    }
    if (overview && !state.isSavingPolicy) {
      const policy = getDisplayedPolicy();
      if (!policy.writeEnabled) items.push({ severity: "error", text: t("shell.writesPaused"), target: "settingsView" });
      if (!policy.readEnabled) items.push({ severity: "error", text: t("shell.readsPaused"), target: "settingsView" });
    }
    const queue = overview && overview.queue || {};
    if (Number(queue.stuck_tasks || 0) > 0) {
      items.push({ severity: "warn", text: t("home.attnStuck", { n: queue.stuck_tasks }), target: "pipelineView" });
    }
    if (Number(queue.duplicate_flags || 0) > 0) {
      items.push({ severity: "warn", text: t("home.attnDuplicates", { n: queue.duplicate_flags }), target: "pipelineView" });
    }
    if (summary) {
      const fallback = Number(summary.tasks_today && summary.tasks_today.fallback || 0);
      if (fallback > 0) {
        items.push({ severity: "warn", text: t("home.attnFallbacks", { n: fallback }), target: "pipelineView" });
      }
      const failed = summary.digests && Array.isArray(summary.digests.failed_recent) ? summary.digests.failed_recent : [];
      failed.forEach((digest) => {
        items.push({
          severity: "error",
          text: t("home.attnDigestFailed", { project: projectBasename(digest.project_path), date: digest.local_date }),
          title: String(digest.last_error || ""),
          target: "digestsView",
        });
      });
      const checkpoint = parseTimestamp(summary.vault_review && summary.vault_review.last_successful_review_at);
      if (checkpoint && Date.now() - checkpoint.getTime() > VAULT_STALE_MS) {
        items.push({ severity: "warn", text: t("home.attnVaultStale", { age: formatDuration(Date.now() - checkpoint.getTime()) }), target: "digestsView" });
      }
    }
    return items;
  }

  // Ring segments mirror the five health cards: a card that is ok, warn or error passes that state through;
  // an idle card (no tasks, no digest or checkpoint yet) counts as passing once its data has loaded.
  function getHealthCheckStates() {
    const loaded = {
      homeWorkerCard: !!state.overview || state.overviewError,
      homeQueueCard: !!state.overview,
      homeLlmCard: !!state.homeSummary,
      homeDigestCard: !!state.homeSummary,
      homeVaultCard: !!state.homeSummary,
    };
    return HEALTH_CHECKS.map((check) => {
      const status = state.healthStatus[check.card];
      if (status === "ok" || status === "warn" || status === "error") return status;
      return loaded[check.card] ? "ok" : "unknown";
    });
  }

  const CHECK_STATE_KEYS = { ok: "home.checkOk", warn: "home.checkWarn", error: "home.checkError", unknown: "home.checkUnknown" };

  // Incremental: only attributes and text change on a poll; the ring markup itself is never rebuilt.
  function renderHealthRing(checks, tone) {
    const ring = els.homeHealthRing;
    if (!ring) return;
    const total = checks.length;
    const passing = checks.filter((check) => check === "ok").length;
    if (state.ringTone && state.ringTone !== tone) {
      ring.classList.remove("is-pulsing");
      void ring.offsetWidth;
      ring.classList.add("is-pulsing");
    }
    state.ringTone = tone;
    setAttr(ring, "data-tone", tone);
    setAttr(ring, "aria-label", t("home.ringLabel", { n: passing, total }));
    HEALTH_CHECKS.forEach((check, index) => {
      const segment = document.getElementById(check.id);
      if (!segment) return;
      setAttr(segment, "data-state", checks[index]);
      setText(segment.querySelector("title"), t("home.checkSegment", { check: t(check.labelKey), state: t(CHECK_STATE_KEYS[checks[index]]) }));
    });
    setText(els.homeHealthRingChip, t(passing === total ? "home.checksPassingAll" : "home.checksPassing", { n: passing, total }));
    setAttr(els.homeHealthRingChip, "data-tone", tone);
  }

  function renderHomeAttention() {
    const loaded = !!state.overview || state.overviewError;
    const items = collectAttentionItems();
    const errors = items.filter((item) => item.severity === "error").length;
    const checks = getHealthCheckStates();
    const tone = errors > 0 || checks.includes("error")
      ? "error"
      : items.length > 0 || checks.includes("warn") ? "warn" : "ok";
    setHidden(els.homeAttentionLoading, loaded);
    setHidden(els.homeStatusHero, !loaded);
    setClass(els.homeStatusHero, "statusHero" + (items.length > 0 ? " is-compact" : ""));
    setHidden(els.homeAttentionEmpty, tone !== "ok");
    setHidden(els.homeStatusIssue, tone === "ok");
    if (tone !== "ok") {
      const failing = HEALTH_CHECKS.filter((_check, index) => checks[index] === "warn" || checks[index] === "error");
      setText(els.homeStatusTitle, t(tone === "error" ? "home.statusErrorTitle" : "home.statusWarnTitle"));
      setText(els.homeStatusLead, items.length === 1
        ? t("home.statusItemsOne")
        : items.length > 1
          ? t("home.statusItemsMany", { n: items.length })
          : t("home.statusChecksLead", { names: failing.map((check) => t(check.labelKey)).join(" · ") }));
    }
    renderHealthRing(checks, tone);
    setHidden(els.homeStatusUpdated, !state.overviewAt);
    if (state.overviewAt) {
      setText(els.homeStatusUpdated, t("home.updatedAt", { time: formatClock(new Date(state.overviewAt)) }));
    }
    setHidden(els.homeAttentionList, !loaded || items.length === 0);
    setHidden(els.homeAttentionCount, items.length === 0);
    setText(els.homeAttentionCount, String(items.length));
    setClass(els.homeAttentionCount, "countBadge" + (errors > 0 ? " is-error" : ""));
    setHtmlIfChanged("attention", els.homeAttentionList, JSON.stringify(items), () => items.map((item) => (
      '<li><button class="attentionItem is-' + item.severity + '" type="button" data-nav-target="' + item.target + '"' +
        (item.title ? ' title="' + escapeHtml(item.title) + '"' : '') + '>' +
        '<span class="attentionDot" aria-hidden="true"></span><span>' + escapeHtml(item.text) + '</span>' +
      '</button></li>'
    )).join(""));
  }

  function renderHomeRecent() {
    const summary = state.homeSummary;
    if (!summary) return;
    const rows = Array.isArray(summary.recent) ? summary.recent : [];
    const signature = state.locale + "|" + new Date().toDateString() + "|" +
      rows.map((row) => row.id + ":" + (row.record_kind || "") + ":" + (row.source_kind || "")).join(",");
    setHtmlIfChanged("recent", els.homeRecentRows, signature, () => {
      if (!rows.length) {
        return '<tr><td colspan="5" class="tableEmpty">' + escapeHtml(t("home.recentEmpty")) + '</td></tr>';
      }
      return rows.map((row) => {
        const createdAt = parseTimestamp(row.created_at);
        const time = createdAt
          ? (calendarDaysAgo(createdAt) === 0 ? formatClock(createdAt) : formatShortDate(createdAt) + " " + formatClock(createdAt))
          : "—";
        const kind = row.record_kind === "outcome" || row.record_kind === "context" ? row.record_kind : "legacy";
        const kindLabel = t(kind === "outcome" ? "home.kindOutcome" : kind === "context" ? "home.kindContext" : "home.kindLegacy");
        const explicit = row.source_kind === "explicit";
        return '<tr>' +
          '<td title="' + escapeHtml(createdAt ? createdAt.toLocaleString(state.locale) : "") + '">' + escapeHtml(time) + '</td>' +
          '<td><span class="kindPill kind-' + kind + (explicit ? ' is-explicit" title="' + escapeHtml(t("home.kindExplicit")) : '') + '">' + escapeHtml(kindLabel) + '</span></td>' +
          '<td class="cellMuted">' + escapeHtml(row.agent_id || "") + '</td>' +
          '<td title="' + escapeHtml(row.project_path || "") + '">' + escapeHtml(projectBasename(row.project_path)) + '</td>' +
          '<td title="' + escapeHtml(row.title || "") + '">' + escapeHtml(row.title || "") + '</td>' +
        '</tr>';
      }).join("");
    });
  }

  function renderHome() {
    renderHomeHealth();
    renderHomeToday();
    renderHomeAttention();
    renderHomeRecent();
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
    let nextOverview;
    try {
      nextOverview = await fetchJson("/admin/api/overview");
    } catch (error) {
      state.overviewError = true;
      renderHome();
      throw error;
    }
    if (state.overview && comparePolicyFreshness(nextOverview.policy, state.overview.policy) < 0) {
      nextOverview.policy = state.overview.policy;
    }
    // A new memory or task result makes the Home aggregates stale: refresh them on this poll, not in 30 s.
    if (state.overview && (getOverviewActivityStamp(state.overview) !== getOverviewActivityStamp(nextOverview))) {
      state.homeSummaryAt = 0;
    }
    state.overviewError = false;
    state.overview = nextOverview;
    state.overviewAt = Date.now();
    renderOverview();
  }

  function getOverviewActivityStamp(overview) {
    const stats = overview && overview.stats || {};
    const tasks = overview && overview.tasks || {};
    return [stats.observations, stats.dailyDigests, stats.currentStateFacts, tasks.tasks, tasks.llm_calls].join("|");
  }

  async function loadHomeSummary() {
    if (state.homeSummaryInFlight) return state.homeSummaryInFlight;
    state.homeSummaryAt = Date.now();
    const params = new URLSearchParams({
      days: String(HOME_CHART_DAYS),
      tz_offset_minutes: String(-new Date().getTimezoneOffset()),
    });
    state.homeSummaryInFlight = fetchJson("/admin/api/home-summary?" + params.toString())
      .then((payload) => {
        state.homeSummary = payload;
        renderHome();
      })
      .finally(() => {
        state.homeSummaryInFlight = null;
      });
    return state.homeSummaryInFlight;
  }

  async function refreshHomeData(force) {
    const now = Date.now();
    const jobs = [];
    if (force || now - state.homeSummaryAt >= HOME_SUMMARY_REFRESH_MS) {
      jobs.push(loadHomeSummary());
    }
    if (!state.isSavingDigestScheduler && (force || now - state.digestSchedulerAt >= DIGEST_SCHEDULER_REFRESH_MS)) {
      jobs.push(loadDailyDigestSchedulerConfig());
    }
    await Promise.allSettled(jobs);
  }

  async function loadReleaseCheck() {
    if (!state.overview || !state.overview.release) return;
    state.isCheckingRelease = true;
    renderReleaseCheck();
    try {
      state.releaseCheck = await fetchJson("/admin/api/release-check");
    } catch (error) {
      state.releaseCheck = {
        checkedAt: new Date().toISOString(),
        currentVersion: String(state.overview.release.version || ""),
        currentTag: String(state.overview.release.tagName || ""),
        latestVersion: null,
        latestTag: null,
        message: error.message || t("runtime.releaseStatusNetworkError"),
        releaseUrl: getReleasePageUrl(),
        status: "network_error",
        upgradeGuidance: {
          commands: Array.isArray(state.overview.release.windowsUpdateCommands)
            ? state.overview.release.windowsUpdateCommands
            : [],
          installMode: "git_checkout",
          summary: t("runtime.releaseGuidancePending"),
        },
      };
    } finally {
      state.isCheckingRelease = false;
      renderReleaseCheck();
    }
  }

  async function loadLlmConfig() {
    setStoredStatusLine("llm", els.llmStatusLine, "llm.loading", {}, "warning");
    const payload = await fetchJson("/admin/api/llm-config");
    state.llmConfig = payload.config || null;
    renderLlmConfig();
    setStoredStatusLine("llm", els.llmStatusLine, "llm.ready", {}, "");
  }

  async function saveLlmSettings() {
    if (els.llmOutputBudgetEnabledInput.checked) {
      for (const input of [els.llmObservationMaxTokensInput, els.llmDigestMaxTokensInput]) {
        if (!input.reportValidity() || !input.value) {
          els.llmSaveStatus.textContent = t("llm.invalidBudget");
          input.focus();
          return;
        }
      }
    }
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

  async function loadDailyDigestStatus() {
    const projectPath = els.dailyDigestProjectSelect.value;
    if (!projectPath) {
      state.digestPayload = null;
      renderDailyDigest();
      return;
    }

    const params = new URLSearchParams({
      project_path: projectPath,
      limit: "5",
    });
    state.digestPayload = await fetchJson("/admin/api/digests?" + params.toString());
    renderDailyDigest();
  }

  async function loadDailyDigestSchedulerConfig() {
    state.digestSchedulerAt = Date.now();
    state.digestSchedulerPayload = await fetchJson("/admin/api/digest-scheduler");
    renderDailyDigestScheduler();
    renderHome();
  }

  async function loadProceduralWorkspaceData() {
    const projectPath = els.proceduralProjectSelect.value;
    if (!projectPath) {
      state.proceduralDigestPayload = null;
      state.proceduralSkillsPayload = null;
      state.proceduralPostTaskReviewsPayload = null;
      state.selectedProceduralSkillId = null;
      renderProceduralWorkspace();
      return;
    }

    state.isRefreshingProcedural = true;
    renderProceduralWorkspace();
    setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.loadingWorkspace", {}, "warning");

    try {
      const limit = getProceduralLimitValue();
      const digestParams = new URLSearchParams({
        project_path: projectPath,
        limit: String(limit),
      });
      const skillParams = new URLSearchParams({
        project_path: projectPath,
        limit: String(limit),
      });
      const reviewParams = new URLSearchParams({
        project_path: projectPath,
        limit: String(limit),
      });
      const status = String(els.proceduralStatusFilter.value || "").trim();
      const asOf = els.proceduralAsOfInput.value.trim();
      if (status) skillParams.set("status", status);
      if (asOf) skillParams.set("as_of", asOf);

      const [digestPayload, skillsPayload, postTaskReviewsPayload] = await Promise.all([
        fetchJson("/admin/api/digests?" + digestParams.toString()),
        fetchJson("/admin/api/skills?" + skillParams.toString()),
        fetchJson("/admin/api/post-task-reviews?" + reviewParams.toString()),
      ]);

      state.proceduralDigestPayload = digestPayload;
      if (!els.proceduralLocalDateInput.value) {
        const latestDigest = Array.isArray(digestPayload.digests) ? digestPayload.digests[0] : null;
        if (latestDigest && latestDigest.local_date) {
          els.proceduralLocalDateInput.value = String(latestDigest.local_date);
        }
      }

      state.proceduralSkillsPayload = skillsPayload;
      state.proceduralPostTaskReviewsPayload = postTaskReviewsPayload;
      syncSelectedProceduralSkill();
      renderProceduralWorkspace();

      if (digestPayload.disabled || skillsPayload.disabled || postTaskReviewsPayload.disabled) {
        setRawStatusLine(
          "proceduralSkills",
          els.proceduralSkillsStatus,
          String(digestPayload.message || skillsPayload.message || postTaskReviewsPayload.message || t("procedural.readDisabled")),
          "warning"
        );
      } else {
        setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.workspaceReady", {}, "");
      }
    } finally {
      state.isRefreshingProcedural = false;
      renderProceduralWorkspace();
    }
  }

  async function saveDailyDigestSchedulerConfig() {
    state.isSavingDigestScheduler = true;
    els.dailyDigestSchedulerStatusText.textContent = t("runtime.dailyDigestSchedulerSavingButton");
    renderDailyDigestScheduler();
    try {
      state.digestSchedulerPayload = await fetchJson("/admin/api/digest-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: els.dailyDigestSchedulerEnabledInput.checked,
          lookback_days: Number(els.dailyDigestLookbackInput.value || "2"),
          schedule_time: els.dailyDigestScheduleTimeInput.value || "23:50",
          time_zone: els.dailyDigestTimeZoneInput.value || "Asia/Shanghai",
        }),
      });
      state.isSavingDigestScheduler = false;
      renderDailyDigestScheduler();
      els.dailyDigestSchedulerStatusText.textContent = t("runtime.dailyDigestSchedulerSaved", {
        timestamp: formatDate(state.digestSchedulerPayload.config && state.digestSchedulerPayload.config.updatedAt),
      });
    } catch (error) {
      state.isSavingDigestScheduler = false;
      renderDailyDigestScheduler();
      throw error;
    }
  }

  async function runDailyDigest() {
    const projectPath = els.dailyDigestProjectSelect.value;
    if (!projectPath) {
      throw new Error(t("runtime.dailyDigestChooseProjectBeforeRun"));
    }

    state.isRunningDigest = true;
    renderDailyDigest();
    try {
      const payload = await fetchJson("/admin/api/digests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_path: projectPath,
          local_date: els.dailyDigestDateInput.value || undefined,
        }),
      });
      state.digestPayload = {
        project_path: projectPath,
        latest: payload.digest || null,
        digests: payload.digest ? [payload.digest] : [],
        generated_at: new Date().toISOString(),
      };
      state.isRunningDigest = false;
      renderDailyDigest();
      els.dailyDigestStatusText.textContent = t("runtime.dailyDigestRunComplete", {
        date: String(payload.local_date || els.dailyDigestDateInput.value || ""),
        status: String(payload.digest && payload.digest.status || ""),
      });
      await loadDailyDigestStatus();
      if (els.contextProjectSelect.value === projectPath) {
        await loadProjectContext();
      }
      await loadOverview();
    } catch (error) {
      state.isRunningDigest = false;
      renderDailyDigest();
      throw error;
    }
  }

  async function promoteProceduralCandidate(localDate, candidateIndex) {
    const projectPath = els.proceduralProjectSelect.value;
    if (!projectPath) {
      throw new Error(t("procedural.noProjectSelected"));
    }

    let finalMessage = "";
    state.isPromotingProceduralCandidate = true;
    state.promotingProceduralCandidateKey = getProceduralCandidateKey(localDate, candidateIndex);
    renderProceduralWorkspace();
    setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.promotingCandidate", {}, "warning");

    try {
      const payload = await fetchJson("/admin/api/skills/promote-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_path: projectPath,
          local_date: localDate,
          candidate_index: candidateIndex,
        }),
      });
      if (payload.disabled) {
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, payload.message || t("procedural.writeDisabled"), "warning");
        els.proceduralStatusText.textContent = payload.message || t("procedural.writeDisabled");
        return;
      }

      state.selectedProceduralSkillId = payload.skill && payload.skill.id ? payload.skill.id : state.selectedProceduralSkillId;
      if (els.proceduralStatusFilter.value && els.proceduralStatusFilter.value !== "draft") {
        els.proceduralStatusFilter.value = "";
      }
      await loadOverview();
      if (els.dailyDigestProjectSelect.value === projectPath) {
        await loadDailyDigestStatus();
      }
      await loadProceduralWorkspaceData();
      const title = payload.skill && payload.skill.title ? payload.skill.title : t("procedural.statusDraft");
      finalMessage = t("procedural.promotedCandidate", { title });
    } finally {
      state.isPromotingProceduralCandidate = false;
      state.promotingProceduralCandidateKey = "";
      renderProceduralWorkspace();
      if (finalMessage) {
        els.proceduralStatusText.textContent = finalMessage;
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, finalMessage, "");
      }
    }
  }

  async function updateProceduralSkillStatus(skillId, status) {
    let finalMessage = "";
    state.updatingProceduralSkillId = skillId;
    renderProceduralWorkspace();
    setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.updatingStatus", {}, "warning");

    try {
      const payload = await fetchJson("/admin/api/skills/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_id: skillId,
          status,
        }),
      });
      if (payload.disabled) {
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, payload.message || t("procedural.writeDisabled"), "warning");
        els.proceduralStatusText.textContent = payload.message || t("procedural.writeDisabled");
        return;
      }

      state.selectedProceduralSkillId = payload.skill && payload.skill.id ? payload.skill.id : state.selectedProceduralSkillId;
      if (els.proceduralStatusFilter.value && els.proceduralStatusFilter.value !== status) {
        els.proceduralStatusFilter.value = "";
      }
      await loadProceduralWorkspaceData();
      finalMessage = t("procedural.statusUpdated", {
        title: payload.skill && payload.skill.title ? payload.skill.title : "",
        status: getProceduralSkillStatusPresentation(status).label,
      });
    } finally {
      state.updatingProceduralSkillId = null;
      renderProceduralWorkspace();
      if (finalMessage) {
        els.proceduralStatusText.textContent = finalMessage;
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, finalMessage, "");
      }
    }
  }

  async function submitProceduralFeedback() {
    const projectPath = els.proceduralProjectSelect.value;
    const skill = getSelectedProceduralSkill();
    if (!projectPath || !skill) {
      throw new Error(t("procedural.feedbackRequiresSkill"));
    }

    let finalMessage = "";
    state.isSubmittingProceduralFeedback = true;
    renderProceduralWorkspace();
    setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.feedbackSaving", {}, "warning");

    try {
      const payload = await fetchJson("/admin/api/skills/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_id: skill.id,
          project_path: projectPath,
          outcome: els.proceduralFeedbackOutcomeSelect.value,
          task_text: els.proceduralFeedbackTaskInput.value.trim() || undefined,
          notes: els.proceduralFeedbackNotesInput.value.trim() || undefined,
        }),
      });
      if (payload.disabled) {
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, payload.message || t("procedural.writeDisabled"), "warning");
        els.proceduralFeedbackStatus.textContent = payload.message || t("procedural.writeDisabled");
        return;
      }

      await loadProceduralWorkspaceData();
      els.proceduralFeedbackTaskInput.value = "";
      els.proceduralFeedbackNotesInput.value = "";
      finalMessage = t("procedural.feedbackSaved", {
        outcome: formatProceduralOutcomeLabel(payload.feedback && payload.feedback.outcome),
      });
    } finally {
      state.isSubmittingProceduralFeedback = false;
      renderProceduralWorkspace();
      if (finalMessage) {
        els.proceduralFeedbackStatus.textContent = finalMessage;
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, finalMessage, "");
      }
    }
  }

  async function runProceduralValidationQuery() {
    const projectPath = els.proceduralProjectSelect.value;
    if (!projectPath) {
      throw new Error(t("procedural.noProjectSelected"));
    }
    const query = els.proceduralQueryInput.value.trim();
    if (!query) {
      throw new Error(t("procedural.queryRequired"));
    }

    state.isRunningProceduralQuery = true;
    renderProceduralWorkspace();
    setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.queryRunning", {}, "warning");

    try {
      state.proceduralQueryPayload = await fetchJson("/admin/api/memory/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_path: projectPath,
          query,
          as_of: els.proceduralAsOfInput.value.trim() || undefined,
          limit: getProceduralLimitValue(),
          skill_limit: getProceduralLimitValue(),
        }),
      });
      renderProceduralWorkspace();
      if (state.proceduralQueryPayload.disabled) {
        const disabledMessage = state.proceduralQueryPayload.message || t("procedural.readDisabled");
        els.proceduralQueryStatus.textContent = disabledMessage;
        setRawStatusLine("proceduralSkills", els.proceduralSkillsStatus, disabledMessage, "warning");
        return;
      }
      setStoredStatusLine("proceduralSkills", els.proceduralSkillsStatus, "procedural.workspaceReady", {}, "");
    } finally {
      state.isRunningProceduralQuery = false;
      renderProceduralWorkspace();
    }
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

  function setBackgroundStatus(key, isError) {
    bg.statusKey = key;
    bg.statusError = !!isError;
    renderBackgroundControls();
  }

  function syncRange(input, output, value, label) {
    if (!input) return;
    if (String(input.value) !== String(value)) input.value = String(value);
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty("--fill", (((value - min) / (max - min)) * 100).toFixed(1) + "%");
    setText(output, label);
  }

  function renderBackgroundControls() {
    if (!bg.settings) return;
    const settings = bg.settings;
    els.bgPresetButtons.forEach((button) => {
      const selected = button.getAttribute("data-bg-preset") === settings.preset;
      button.classList.toggle("is-selected", selected);
      setAttr(button, "aria-pressed", selected ? "true" : "false");
    });
    setHidden(els.bgCustomTile, !bg.customAvailable);
    els.bgToneButtons.forEach((button) => {
      setAttr(button, "aria-pressed", button.getAttribute("data-bg-tone") === settings.tone ? "true" : "false");
    });
    syncRange(els.bgBlurInput, els.bgBlurValue, settings.blur, settings.blur + "px");
    syncRange(els.bgDimInput, els.bgDimValue, settings.dim, settings.dim + "%");
    syncRange(els.bgOpacityInput, els.bgOpacityValue, settings.opacity, settings.opacity + "%");
    setText(els.bgStatus, t(bg.statusKey));
    if (els.bgStatus) els.bgStatus.classList.toggle("is-error", bg.statusError);
    setAttr(els.bgPickerButton, "aria-expanded", bg.open ? "true" : "false");
  }

  function persistBackground() {
    try {
      window.localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(bg.settings));
    } catch (_error) {
      setBackgroundStatus("bg.storageFailed", true);
    }
  }

  // Applies live through the data attributes and :root variables the boot script also uses.
  function updateBackground(patch, persist) {
    if (!bg.api) return;
    bg.settings = bg.api.normalize(Object.assign({}, bg.settings, patch));
    bg.api.apply(bg.settings);
    renderBackgroundControls();
    if (persist) persistBackground();
  }

  function openWallpaperDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = window.indexedDB.open(BG_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(BG_DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
  }

  function withWallpaperStore(mode, run) {
    return openWallpaperDb().then((db) => new Promise((resolve, reject) => {
      let result;
      let tx;
      try {
        tx = db.transaction(BG_DB_STORE, mode);
        const request = run(tx.objectStore(BG_DB_STORE));
        request.onsuccess = () => {
          result = request.result;
        };
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB transaction failed"));
      };
    }));
  }

  function useWallpaperBlob(blob) {
    const previous = bg.objectUrl;
    bg.objectUrl = URL.createObjectURL(blob);
    document.documentElement.style.setProperty("--bg-image", 'url("' + bg.objectUrl + '")');
    bg.customAvailable = true;
    if (previous) URL.revokeObjectURL(previous);
  }

  async function loadStoredWallpaper() {
    let record = null;
    try {
      record = await withWallpaperStore("readonly", (store) => store.get(BG_DB_KEY));
    } catch (_error) {
      record = null;
    }
    if (record && record.blob instanceof Blob) {
      useWallpaperBlob(record.blob);
    } else if (bg.settings && bg.settings.preset === "custom") {
      // The image was cleared with the site data (or never stored): fall back to the default preset.
      updateBackground({ preset: bg.api.defaults.preset }, true);
      bg.statusKey = "bg.customMissing";
      bg.statusError = true;
    }
    renderBackgroundControls();
  }

  // Sampled alpha scan. stride 4 checks every 4th pixel of every 4th row so a 2560px canvas stays cheap.
  function canvasHasAlpha(data, width, height, stride) {
    const step = Math.max(1, stride | 0);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += step) {
      const row = y * rowBytes;
      for (let x = 0; x < width; x += step) {
        if (data[row + x * 4 + 3] < 255) return true;
      }
    }
    return false;
  }

  function wallpaperEncodeTypes(hasAlpha) {
    return hasAlpha ? ["image/webp", "image/png"] : ["image/jpeg"];
  }

  function wallpaperSourceMayHaveAlpha(type) {
    const normalized = String(type || "").split(";")[0].trim().toLowerCase();
    return normalized === "image/png" || normalized === "image/webp" || normalized === "image/gif" || normalized === "image/avif" || normalized === "image/svg+xml";
  }

  function decodeImage(file) {
    const viaElement = () => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image decode failed"));
      };
      image.src = url;
    });
    return typeof window.createImageBitmap === "function" ? window.createImageBitmap(file).catch(viaElement) : viaElement();
  }

  // Downscales to at most BG_MAX_EDGE on the long side and samples a 24x24 copy for the average colour and
  // luma that drive the Auto glass tone. Sources that can carry alpha are re-encoded as WebP (PNG when the
  // browser cannot encode WebP) so transparent pixels stay transparent; opaque images stay JPEG.
  async function prepareWallpaper(file) {
    const source = await decodeImage(file);
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) throw new Error("Image has no size");
    const scale = Math.min(1, BG_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (typeof source.close === "function") source.close();

    const sample = document.createElement("canvas");
    sample.width = 24;
    sample.height = 24;
    const sampleContext = sample.getContext("2d");
    if (!sampleContext) throw new Error("Canvas unavailable");
    sampleContext.drawImage(canvas, 0, 0, 24, 24);
    const pixels = sampleContext.getImageData(0, 0, 24, 24).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      red += pixels[index] * alpha;
      green += pixels[index + 1] * alpha;
      blue += pixels[index + 2] * alpha;
      weight += alpha;
    }
    weight = weight || 1;
    const channels = [red / weight, green / weight, blue / weight].map((value) => Math.round(Math.min(255, Math.max(0, value))));
    const luma = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
    const color = "#" + channels.map((value) => value.toString(16).padStart(2, "0")).join("");

    let hasAlpha = false;
    if (wallpaperSourceMayHaveAlpha(file.type)) {
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const frameHasAlpha = canvasHasAlpha(frame.data, canvas.width, canvas.height, 4);
      const sampleHasAlpha = canvasHasAlpha(pixels, 24, 24, 1);
      hasAlpha = frameHasAlpha || sampleHasAlpha;
    }
    const types = wallpaperEncodeTypes(hasAlpha);
    const encode = (type) => new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Image encode failed"))), type, 0.9);
    });
    let blob = await encode(types[0]);
    if (types.length > 1 && blob.type !== "image/webp") blob = await encode(types[1]);
    return { blob, width: canvas.width, height: canvas.height, luma: Math.round(luma * 1000) / 1000, color };
  }

  async function handleWallpaperUpload(file) {
    if (!file || bg.busy) return;
    if (!/^image\\//.test(String(file.type || ""))) {
      setBackgroundStatus("bg.uploadNotImage", true);
      return;
    }
    if (file.size > BG_MAX_UPLOAD_BYTES) {
      setBackgroundStatus("bg.uploadTooLarge", true);
      return;
    }
    bg.busy = true;
    setBackgroundStatus("bg.uploadWorking", false);
    let prepared;
    try {
      prepared = await prepareWallpaper(file);
    } catch (_error) {
      bg.busy = false;
      setBackgroundStatus("bg.uploadFailed", true);
      return;
    }
    useWallpaperBlob(prepared.blob);
    let stored = true;
    try {
      await withWallpaperStore("readwrite", (store) => store.put({
        blob: prepared.blob,
        width: prepared.width,
        height: prepared.height,
        luma: prepared.luma,
        color: prepared.color,
        savedAt: new Date().toISOString(),
      }, BG_DB_KEY));
    } catch (_error) {
      stored = false;
    }
    bg.busy = false;
    updateBackground({ preset: "custom", customLuma: prepared.luma, customColor: prepared.color }, true);
    setBackgroundStatus(stored ? "bg.uploadSaved" : "bg.uploadSessionOnly", !stored);
  }

  function setBackgroundPickerOpen(open, restoreFocus) {
    if (!els.bgPopover) return;
    bg.open = !!open;
    setHidden(els.bgPopover, !bg.open);
    els.bgPopover.classList.toggle("is-active", bg.open);
    renderBackgroundControls();
    if (bg.open) {
      const selected = els.bgPresetButtons.find((button) => button.classList.contains("is-selected") && !button.hidden);
      (selected || els.bgPresetButtons[0]).focus();
    } else if (restoreFocus) {
      els.bgPickerButton.focus();
    }
  }

  function initBackground() {
    if (!bg.api) {
      setHidden(els.bgPickerButton, true);
      return;
    }
    bg.settings = bg.api.read();
    bg.api.apply(bg.settings);
    renderBackgroundControls();
    void loadStoredWallpaper();
  }

  function bindBackgroundEvents() {
    if (!bg.api || !els.bgPopover) return;
    els.bgPickerButton.addEventListener("click", () => setBackgroundPickerOpen(!bg.open, false));
    els.bgPopoverClose.addEventListener("click", () => setBackgroundPickerOpen(false, true));
    els.bgDoneButton.addEventListener("click", () => setBackgroundPickerOpen(false, true));
    els.bgPresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.getAttribute("data-bg-preset");
        if (preset === "custom" && !bg.customAvailable) return;
        updateBackground({ preset }, true);
      });
    });
    els.bgToneButtons.forEach((button) => {
      button.addEventListener("click", () => updateBackground({ tone: button.getAttribute("data-bg-tone") }, true));
    });
    [[els.bgBlurInput, "blur"], [els.bgDimInput, "dim"], [els.bgOpacityInput, "opacity"]].forEach(([input, field]) => {
      if (!input) return;
      // Live while dragging; written to storage once the value settles.
      input.addEventListener("input", () => updateBackground({ [field]: Number(input.value) }, false));
      input.addEventListener("change", () => persistBackground());
    });
    els.bgUploadButton.addEventListener("click", () => els.bgUploadInput.click());
    els.bgUploadInput.addEventListener("change", () => {
      const file = els.bgUploadInput.files && els.bgUploadInput.files[0];
      els.bgUploadInput.value = "";
      void handleWallpaperUpload(file);
    });
    els.bgResetButton.addEventListener("click", () => {
      const defaults = bg.api.defaults;
      updateBackground({ preset: defaults.preset, tone: defaults.tone, blur: defaults.blur, dim: defaults.dim, opacity: defaults.opacity }, true);
      setBackgroundStatus("bg.resetDone", false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && bg.open) {
        event.preventDefault();
        setBackgroundPickerOpen(false, true);
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!bg.open) return;
      if (els.bgPopover.contains(event.target) || els.bgPickerButton.contains(event.target)) return;
      setBackgroundPickerOpen(false, false);
    });
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
    syncNavItems();
  }

  function syncNavItems() {
    els.navItems.forEach((button) => {
      const devPanel = button.getAttribute("data-dev-panel");
      const isActive = devPanel
        ? state.activeView === "devToolsView" && devPanel === state.activePanel
        : button.getAttribute("data-nav-target") === state.activeView;
      button.classList.toggle("is-active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function syncPageTitle() {
    const key = VIEW_TITLE_KEYS[state.activeView] || "nav.home";
    els.pageTitle.setAttribute("data-i18n", key);
    setText(els.pageTitle, t(key));
  }

  function activateView(viewId) {
    let nextView = VIEW_TITLE_KEYS[viewId] ? viewId : "homeView";
    if (nextView === "devToolsView" && !state.devToolsEnabled) nextView = "homeView";
    state.activeView = nextView;
    els.appViews.forEach((view) => {
      view.classList.toggle("is-active", view.id === nextView);
    });
    syncNavItems();
    syncPageTitle();
    if (nextView === "homeView") {
      void refreshHomeData(false);
    }
    if (nextView === "devToolsView") {
      void ensureDevToolsLoaded();
    }
  }

  function readDevToolsPreference() {
    try {
      return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function setDevToolsEnabled(enabled, persist) {
    state.devToolsEnabled = !!enabled;
    if (els.devToolsToggle.checked !== state.devToolsEnabled) els.devToolsToggle.checked = state.devToolsEnabled;
    setHidden(els.devToolsNavGroup, !state.devToolsEnabled);
    if (persist) {
      try {
        window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, state.devToolsEnabled ? "1" : "0");
      } catch (_error) {
        // Ignore storage write errors.
      }
    }
    if (!state.devToolsEnabled && state.activeView === "devToolsView") {
      activateView("homeView");
    }
  }

  // The legacy panels load their data the first time Developer tools is opened, not on every page load.
  async function ensureDevToolsLoaded() {
    if (state.devToolsLoaded) return;
    state.devToolsLoaded = true;
    try {
      await loadLlmConfig();
      await loadRecords("ledger.loading");
      if (!state.digestSchedulerPayload) {
        await loadDailyDigestSchedulerConfig();
      }
      if (els.dailyDigestProjectSelect.value) {
        await loadDailyDigestStatus();
      } else {
        renderDailyDigest();
      }
      if (els.proceduralProjectSelect.value) {
        await loadProceduralWorkspaceData();
      } else {
        renderProceduralWorkspace();
      }
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
      state.devToolsLoaded = false;
      setRawStatusLine("runtime", els.runtimeStatusLine, error.message || t("status.initializationFailed"), "error");
    }
  }

  async function pollActiveData() {
    // Skip hidden tabs and never stack polls when the worker answers slower than the interval.
    if (document.hidden || state.isPolling) return;
    state.isPolling = true;
    try {
      await pollVisibleView();
    } finally {
      state.isPolling = false;
    }
  }

  async function pollVisibleView() {
    try {
      await loadOverview();
    } catch (error) {
      // The Worker card and the attention list already show the failed poll.
      return;
    }
    if (state.activeView === "homeView") {
      await refreshHomeData(false);
      return;
    }
    if (state.activeView !== "devToolsView" || !state.devToolsLoaded) return;
    try {
      if (state.activePanel === "observationLedgerPanel") {
        await loadRecords("ledger.polling");
      }
      if (state.activePanel === "proceduralSkillsPanel" && els.proceduralProjectSelect.value && !state.isRefreshingProcedural && !state.isPromotingProceduralCandidate && !state.updatingProceduralSkillId && !state.isSubmittingProceduralFeedback) {
        await loadProceduralWorkspaceData();
      }
      if (state.activePanel === "projectContextPanel" && els.contextProjectSelect.value) {
        await loadProjectContext();
      }
      if (state.activePanel === "runtimePanel" && !state.isSavingDigestScheduler) {
        await loadDailyDigestSchedulerConfig();
      }
      if (state.activePanel === "runtimePanel" && els.dailyDigestProjectSelect.value && !state.isRunningDigest) {
        await loadDailyDigestStatus();
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

    // One delegated handler for the sidebar, health cards, attention items and "View all".
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-nav-target]");
      if (!trigger) return;
      if (trigger.hasAttribute("data-requires-dev-tools") && !state.devToolsEnabled) {
        setDevToolsEnabled(true, true);
      }
      const devPanel = trigger.getAttribute("data-dev-panel");
      if (devPanel) {
        activatePanel(devPanel);
      }
      activateView(trigger.getAttribute("data-nav-target"));
      // Legacy panels sit below the hero and the tab dock, and "View all" is clicked from the bottom of Home,
      // so bring the opened panel (or the top of any other view) into sight.
      const panel = devPanel && state.activeView === "devToolsView" ? document.getElementById(devPanel) : null;
      if (panel) {
        panel.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    });

    els.devToolsToggle.addEventListener("change", () => {
      setDevToolsEnabled(els.devToolsToggle.checked, true);
    });

    if (els.homeHealthRing) {
      els.homeHealthRing.addEventListener("animationend", () => els.homeHealthRing.classList.remove("is-pulsing"));
    }

    // Turning a memory switch off affects every agent, so it needs an explicit confirmation.
    [els.readToggle, els.writeToggle].forEach((toggle) => {
      toggle.addEventListener("click", (event) => {
        if (toggle.checked) return;
        const key = toggle === els.readToggle ? "shell.confirmReadOff" : "shell.confirmWriteOff";
        if (!window.confirm(t(key))) {
          event.preventDefault();
        }
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        void pollActiveData();
      }
    });

    els.llmReloadButton.addEventListener("click", async () => {
      await loadLlmConfig();
    });
    els.llmSaveButton.addEventListener("click", async () => {
      await saveLlmSettings();
    });
    els.llmOutputBudgetEnabledInput.addEventListener("change", renderLlmBudgetFields);
    els.llmTestButton.addEventListener("click", async () => {
      await runLlmConnectionTest();
    });
    els.releaseCheckButton.addEventListener("click", async () => {
      await loadReleaseCheck();
    });
    els.releaseOpenButton.addEventListener("click", () => {
      const releaseUrl = getReleasePageUrl();
      if (!releaseUrl) return;
      window.open(releaseUrl, "_blank", "noopener,noreferrer");
    });
    els.dailyDigestProjectSelect.addEventListener("change", async () => {
      state.digestPayload = null;
      renderDailyDigest();
      await loadDailyDigestStatus();
    });
    els.dailyDigestRunButton.addEventListener("click", async () => {
      try {
        await runDailyDigest();
      } catch (error) {
        els.dailyDigestStatusText.textContent = error.message || t("runtime.dailyDigestFailed");
        els.dailyDigestStatusBadge.textContent = t("runtime.dailyDigestFailed");
        els.dailyDigestStatusBadge.className = "statusChip error";
      }
    });
    els.dailyDigestSchedulerSaveButton.addEventListener("click", async () => {
      try {
        await saveDailyDigestSchedulerConfig();
      } catch (error) {
        els.dailyDigestSchedulerStatusText.textContent = error.message || t("runtime.dailyDigestSchedulerSaveFailed");
        els.dailyDigestSchedulerRuntimeBadge.textContent = t("runtime.dailyDigestSchedulerSaveFailed");
        els.dailyDigestSchedulerRuntimeBadge.className = "statusChip error";
      }
    });
    els.proceduralRefreshButton.addEventListener("click", async () => {
      try {
        await loadProceduralWorkspaceData();
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralProjectSelect.addEventListener("change", async () => {
      els.proceduralLocalDateInput.value = "";
      state.proceduralQueryPayload = null;
      state.selectedProceduralSkillId = null;
      renderProceduralWorkspace();
      try {
        await loadProceduralWorkspaceData();
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralLocalDateInput.addEventListener("change", () => {
      renderProceduralWorkspace();
    });
    els.proceduralStatusFilter.addEventListener("change", async () => {
      state.selectedProceduralSkillId = null;
      try {
        await loadProceduralWorkspaceData();
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralAsOfInput.addEventListener("change", async () => {
      state.proceduralQueryPayload = null;
      renderProceduralWorkspace();
      try {
        await loadProceduralWorkspaceData();
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralLimitInput.addEventListener("change", async () => {
      try {
        await loadProceduralWorkspaceData();
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralCandidateList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-procedural-promote]");
      if (!button) return;
      try {
        await promoteProceduralCandidate(
          button.getAttribute("data-procedural-local-date"),
          Number(button.getAttribute("data-procedural-candidate-index"))
        );
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralSkillsList.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-procedural-skill-status]");
      if (actionButton) {
        event.stopPropagation();
        try {
          await updateProceduralSkillStatus(
            actionButton.getAttribute("data-procedural-skill-id"),
            actionButton.getAttribute("data-procedural-skill-status")
          );
        } catch (error) {
          showProceduralError(error);
        }
        return;
      }

      const skillCard = event.target.closest("[data-procedural-skill-select]");
      if (!skillCard) return;
      state.selectedProceduralSkillId = skillCard.getAttribute("data-procedural-skill-id");
      renderProceduralWorkspace();
    });
    els.proceduralSkillsList.addEventListener("keydown", (event) => {
      const skillCard = event.target.closest("[data-procedural-skill-select]");
      if (!skillCard) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedProceduralSkillId = skillCard.getAttribute("data-procedural-skill-id");
        renderProceduralWorkspace();
      }
    });
    els.proceduralSkillDetail.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-procedural-skill-status]");
      if (!actionButton) return;
      try {
        await updateProceduralSkillStatus(
          actionButton.getAttribute("data-procedural-skill-id"),
          actionButton.getAttribute("data-procedural-skill-status")
        );
      } catch (error) {
        showProceduralError(error);
      }
    });
    els.proceduralFeedbackButton.addEventListener("click", async () => {
      try {
        await submitProceduralFeedback();
      } catch (error) {
        els.proceduralFeedbackStatus.textContent = error.message || t("procedural.feedbackSubmitFailed");
        showProceduralError(error);
      }
    });
    els.proceduralQueryButton.addEventListener("click", async () => {
      try {
        await runProceduralValidationQuery();
      } catch (error) {
        els.proceduralQueryStatus.textContent = error.message || t("procedural.queryFailed");
        showProceduralError(error);
      }
    });
    els.proceduralQueryInput.addEventListener("keydown", async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        try {
          await runProceduralValidationQuery();
        } catch (error) {
          els.proceduralQueryStatus.textContent = error.message || t("procedural.queryFailed");
          showProceduralError(error);
        }
      }
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
    initBackground();
    applyLocale(true);
    setDevToolsEnabled(readDevToolsPreference(), false);
    bindEvents();
    bindBackgroundEvents();
    activateView("homeView");
    try {
      await loadOverview();
      renderReleaseCheck();
      void loadReleaseCheck();
    } catch (error) {
      setRawStatusLine("runtime", els.runtimeStatusLine, error.message || t("status.initializationFailed"), "error");
    }
    await refreshHomeData(false);

    state.pollHandle = window.setInterval(() => {
      pollActiveData();
    }, POLL_INTERVAL_MS);
  }

  initialize();
  `;
}
