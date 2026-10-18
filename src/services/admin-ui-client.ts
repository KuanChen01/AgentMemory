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
        customColor: /^#[0-9a-f]{6}$/i.test(String(source.customColor || "")) ? String(source.customColor) : null,
        // A stored choice is pinned, including settings saved before this flag existed. Only Reset
        // (pinned: false) or a fresh profile lets Activity use its own backdrop.
        pinned: !!(raw && typeof raw === "object") && source.pinned !== false
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
  // Activity reads one window of at most 120 local days. The first request asks for 50 cards and later pages follow
  // next_cursor; a refresh re-reads the loaded head (up to the API's 100) and merges it by memory id.
  const ACTIVITY_DAY_MS = 86400000;
  const ACTIVITY_MAX_DAYS = 120;
  const ACTIVITY_PAGE = 50;
  const ACTIVITY_MAX_PAGE = 100;
  const ACTIVITY_REFRESH_HEADROOM = 20;
  const ACTIVITY_HUES = 10;
  // Earlier shows a few days per group until expanded.
  const EARLIER_V21_ROWS = 5;
  const EARLIER_LEGACY_ROWS = 4;
  const EARLIER_REFRESH_MS = 10 * 60 * 1000;
  const ACTIVITY_SKELETON = '<div class="actCard is-skeleton" aria-hidden="true"><span class="actSkel is-short"></span><span class="actSkel is-long"></span><span class="actSkel is-mid"></span></div>';
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
    activity: {
      range: "7d",
      customFrom: "",
      customTo: "",
      project: "",
      agent: "",
      kind: "typed",
      payload: null,
      cards: [],
      nextCursor: null,
      // from|to|project|agent|kind of the window last fetched. The poll compares it so Today and Yesterday move at midnight.
      windowKey: "",
      loadedAt: 0,
      error: "",
      readsDisabled: false,
      message: "",
      refreshFailed: false,
      stale: false,
      seq: 0,
      busySeq: 0,
      moreSeq: 0,
      openPopover: "",
      cardNodes: new Map(),
      signatures: {},
      // Project path (lower case) -> palette slot, assigned once per session so visible projects never share a dot.
      hues: new Map(),
      // Earlier: one stats-only request for the 120 days before the window ends. anchor is the oldest column day
      // when the window was last set from the toolbar; opening a day from the list keeps it, so the list stays put.
      earlier: { key: "", payload: null, loading: false, error: "", readsDisabled: false, message: "", seq: 0, loadedAt: 0, anchor: "", showAllV21: false, showAllLegacy: false },
    },
    // Memory: page 1 carries the stats; later pages follow next_cursor, which is bound to the filters.
    memory: {
      query: "",
      project: "",
      agent: "",
      // "default" sends no kind (outcome + context); otherwise outcome, context, legacy or all.
      kind: "default",
      source: "",
      range: "any",
      customFrom: "",
      customTo: "",
      items: [],
      days: [],
      stats: null,
      nextCursor: null,
      // Filters of the list on screen; a change drops the cursor and reloads page 1.
      key: "",
      loaded: false,
      loadedAt: 0,
      error: "",
      readsDisabled: false,
      refreshFailed: false,
      stale: false,
      seq: 0,
      busySeq: 0,
      moreSeq: 0,
      searchTimer: 0,
      lastScrollAt: 0,
      openPopover: "",
      rowNodes: new Map(),
      groupNodes: new Map(),
      signatures: {},
    },
    // The one memory detail drawer. host is the view that opened it; the drawer node moves into that view.
    drawer: { id: "", host: "", payload: null, error: "", missing: false, readsDisabled: false, seq: 0, returnFocus: null, summaryOpen: false, factsOpen: false, copied: false, signature: "" },
  };

  const els = {
    localeToggle: document.getElementById("localeToggle"),
    localeButtons: Array.from(document.querySelectorAll("[data-locale-choice]")),
    localeMenu: document.getElementById("localeToggle"),
    localeMenuButton: document.getElementById("localeMenuButton"),
    localeMenuList: document.getElementById("localeMenuList"),
    localeMenuValue: document.getElementById("localeMenuValue"),
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
    activityView: document.getElementById("activityView"),
    activitySumMemories: document.getElementById("activitySumMemories"),
    activitySumOutcome: document.getElementById("activitySumOutcome"),
    activitySumContext: document.getElementById("activitySumContext"),
    activitySumLegacy: document.getElementById("activitySumLegacy"),
    activitySparkline: document.getElementById("activitySparkline"),
    activityRangeButtons: Array.from(document.querySelectorAll("[data-activity-range]")),
    activityRangeCustom: document.getElementById("activityRangeCustom"),
    activityProjectButton: document.getElementById("activityProjectButton"),
    activityProjectValue: document.getElementById("activityProjectValue"),
    activityAgentButton: document.getElementById("activityAgentButton"),
    activityAgentValue: document.getElementById("activityAgentValue"),
    activityRangeLabel: document.getElementById("activityRangeLabel"),
    activityUpdated: document.getElementById("activityUpdated"),
    activityChips: document.getElementById("activityChips"),
    activityColumns: document.getElementById("activityColumns"),
    activityNotice: document.getElementById("activityNotice"),
    activityNoticeTitle: document.getElementById("activityNoticeTitle"),
    activityNoticeLead: document.getElementById("activityNoticeLead"),
    activityNoticeAction: document.getElementById("activityNoticeAction"),
    activityNoticeSecondary: document.getElementById("activityNoticeSecondary"),
    activityProjectPopover: document.getElementById("activityProjectPopover"),
    activityAgentPopover: document.getElementById("activityAgentPopover"),
    activityCustomPopover: document.getElementById("activityCustomPopover"),
    activityCustomFrom: document.getElementById("activityCustomFrom"),
    activityCustomTo: document.getElementById("activityCustomTo"),
    activityCustomError: document.getElementById("activityCustomError"),
    activityEarlierTitle: document.getElementById("activityEarlierTitle"),
    activityEarlierLead: document.getElementById("activityEarlierLead"),
    activityEarlierNote: document.getElementById("activityEarlierNote"),
    activityEarlierBody: document.getElementById("activityEarlierBody"),
    activityEarlierPanel: document.getElementById("activityEarlierPanel"),
    activityDrawer: document.getElementById("activityDrawer"),
    activityDrawerScrim: document.getElementById("activityDrawerScrim"),
    activityDrawerMeta: document.getElementById("activityDrawerMeta"),
    activityDrawerTitle: document.getElementById("activityDrawerTitle"),
    activityDrawerSub: document.getElementById("activityDrawerSub"),
    activityDrawerBody: document.getElementById("activityDrawerBody"),
    activityDrawerClose: document.getElementById("activityDrawerClose"),
    memoryDrawerCopy: document.getElementById("memoryDrawerCopy"),
    memoryView: document.getElementById("memoryView"),
    memoryToolbar: document.getElementById("memoryToolbar"),
    memorySearchInput: document.getElementById("memorySearchInput"),
    memorySearchClear: document.getElementById("memorySearchClear"),
    memoryRangeButtons: Array.from(document.querySelectorAll("[data-memory-range]")),
    memoryRangeCustom: document.getElementById("memoryRangeCustom"),
    memoryProjectButton: document.getElementById("memoryProjectButton"),
    memoryProjectValue: document.getElementById("memoryProjectValue"),
    memoryAgentButton: document.getElementById("memoryAgentButton"),
    memoryAgentValue: document.getElementById("memoryAgentValue"),
    memoryKindButton: document.getElementById("memoryKindButton"),
    memoryKindValue: document.getElementById("memoryKindValue"),
    memorySourceButton: document.getElementById("memorySourceButton"),
    memorySourceValue: document.getElementById("memorySourceValue"),
    memoryProjectPopover: document.getElementById("memoryProjectPopover"),
    memoryAgentPopover: document.getElementById("memoryAgentPopover"),
    memoryKindPopover: document.getElementById("memoryKindPopover"),
    memorySourcePopover: document.getElementById("memorySourcePopover"),
    memoryCustomPopover: document.getElementById("memoryCustomPopover"),
    memoryCustomFrom: document.getElementById("memoryCustomFrom"),
    memoryCustomTo: document.getElementById("memoryCustomTo"),
    memoryCustomError: document.getElementById("memoryCustomError"),
    memorySummary: document.getElementById("memorySummary"),
    memorySumTotal: document.getElementById("memorySumTotal"),
    memorySumKinds: Array.from(document.querySelectorAll("[data-memory-sum-kind]")),
    memoryUpdated: document.getElementById("memoryUpdated"),
    memoryTopProjects: document.getElementById("memoryTopProjects"),
    memoryTopBar: document.getElementById("memoryTopBar"),
    memoryListHead: document.getElementById("memoryListHead"),
    memoryList: document.getElementById("memoryList"),
    memoryNotice: document.getElementById("memoryNotice"),
    memoryNoticeTitle: document.getElementById("memoryNoticeTitle"),
    memoryNoticeLead: document.getElementById("memoryNoticeLead"),
    memoryNoticeAction: document.getElementById("memoryNoticeAction"),
    memoryLoadMore: document.getElementById("memoryLoadMore"),
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
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive && els.localeMenuValue) {
        const code = button.querySelector(".localeCode");
        setText(els.localeMenuValue, code ? code.textContent : button.textContent);
      }
    });
  }

  // The language menu in the top bar. is-active marks it open (and is what lets its list blur the page).
  function setLocaleMenuOpen(open, restoreFocus) {
    if (!els.localeMenu || !els.localeMenuList) return;
    els.localeMenu.classList.toggle("is-active", open);
    setHidden(els.localeMenuList, !open);
    setAttr(els.localeMenuButton, "aria-expanded", open ? "true" : "false");
    if (open) {
      const current = els.localeMenuList.querySelector(".localeButton.is-active") || els.localeButtons[0];
      if (current) current.focus();
    } else if (restoreFocus) {
      els.localeMenuButton.focus();
    }
  }

  function bindLocaleMenu() {
    if (!els.localeMenuButton || !els.localeMenuList) return;
    els.localeMenuButton.addEventListener("click", () => setLocaleMenuOpen(els.localeMenuList.hidden, false));
    els.localeMenu.addEventListener("keydown", (event) => {
      if (els.localeMenuList.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setLocaleMenuOpen(false, true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = els.localeButtons.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = els.localeButtons[(index + step + els.localeButtons.length) % els.localeButtons.length];
        if (next) next.focus();
      }
    });
    els.localeMenu.addEventListener("focusout", (event) => {
      if (!els.localeMenu.contains(event.relatedTarget)) setLocaleMenuOpen(false, false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!els.localeMenuList.hidden && !els.localeMenu.contains(event.target)) setLocaleMenuOpen(false, false);
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
    renderActivity();
    renderMemory();
    renderMemoryDrawer();
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
    // The Read/Write controls share one compact pill in the top bar; the long explanation lives in Settings.
    setClass(card, "policyPill " + variant + " " +
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
      const error = new Error(payload.error || "Request failed (" + response.status + ")");
      error.status = response.status;
      throw error;
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
    applyReadPolicyToViews(nextOverview.policy);
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

  // ---------- Activity ----------

  function localDayKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function shiftDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString(state.locale);
  }

  // The selected window as local midnights, half-open [from, to). Presets are recomputed on every call, so Today
  // and 7 days roll over at midnight.
  function getActivityWindow() {
    const act = state.activity;
    const today = shiftDays(new Date(), 0);
    let from = shiftDays(today, -6);
    let to = shiftDays(today, 1);
    if (act.range === "today") {
      from = today;
    } else if (act.range === "yesterday") {
      from = shiftDays(today, -1);
      to = today;
    } else if (act.range === "custom") {
      const start = parseLocalDay(act.customFrom);
      const end = parseLocalDay(act.customTo);
      if (start && end && start <= end) {
        from = start;
        to = shiftDays(end, 1);
      }
    }
    // A DST change can stretch 120 local days past the API's 120 x 24 h limit; trim the extra hour off the start.
    if (to.getTime() - from.getTime() > ACTIVITY_MAX_DAYS * ACTIVITY_DAY_MS) {
      from = new Date(to.getTime() - ACTIVITY_MAX_DAYS * ACTIVITY_DAY_MS);
    }
    return { from, to, firstDay: localDayKey(from), lastDay: localDayKey(shiftDays(to, -1)) };
  }

  function activityIncludesToday(win) {
    const now = Date.now();
    return win.from.getTime() <= now && now < win.to.getTime();
  }

  // Today and Yesterday are relative to the local date. Compare the fetched window with the one those
  // presets name now: the key is stored when the window loads, so the first poll after midnight still sees
  // the change. Yesterday never contains "now", and the includes-today refresh would leave it in place.
  function activityWindowStale() {
    const act = state.activity;
    if ((act.range !== "today" && act.range !== "yesterday") || !act.windowKey) return false;
    return activityKey(getActivityWindow()) !== act.windowKey;
  }

  function activityKey(win) {
    const act = state.activity;
    return [win.from.toISOString(), win.to.toISOString(), act.project, act.agent, act.kind].join("|");
  }

  function activityUrl(win, limit, cursor) {
    const act = state.activity;
    const params = new URLSearchParams({
      from: win.from.toISOString(),
      to: win.to.toISOString(),
      tz_offset_minutes: String(-new Date().getTimezoneOffset()),
      kind: act.kind,
      limit: String(limit),
    });
    if (act.project) params.set("project", act.project);
    if (act.agent) params.set("agent", act.agent);
    if (cursor) params.set("cursor", cursor);
    return "/admin/api/activity?" + params.toString();
  }

  // Memories counted under the current kind filter: typed = outcome + context, plus legacy when it is shown.
  function activityMeasure(row) {
    const typed = Number(row && row.outcome || 0) + Number(row && row.context || 0);
    const legacy = Number(row && row.legacy || 0);
    const kind = state.activity.kind;
    return kind === "legacy" ? legacy : kind === "all" ? typed + legacy : typed;
  }

  // A project keeps one palette slot for the session. The slot starts at a hash of the path and steps to the next
  // free one, so two visible projects only share a colour once every slot is taken.
  function projectHue(projectPath) {
    const text = String(projectPath || "").toLowerCase();
    if (!text) return "none";
    const hues = state.activity.hues;
    if (hues.has(text)) return hues.get(text);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    const used = new Set(hues.values());
    let slot = hash % ACTIVITY_HUES;
    for (let step = 0; step < ACTIVITY_HUES && used.has(slot); step += 1) slot = (slot + 1) % ACTIVITY_HUES;
    hues.set(text, slot);
    return slot;
  }

  // Slots are handed out in path order, so the same set of projects gets the same colours on every visit.
  function assignActivityHues(rows) {
    const paths = Array.from(new Set(rows.map((row) => String(row.project_path || "").toLowerCase()).filter(Boolean))).sort();
    paths.forEach(projectHue);
  }

  // mode: "reset" loads the first page of a new window or filter, "more" appends the next page, and "refresh"
  // re-reads the loaded head and merges it by id. Only the newest request may write state; a refresh never
  // overlaps a reset or a load-more.
  async function loadActivity(mode) {
    const act = state.activity;
    const win = getActivityWindow();
    const key = activityKey(win);
    if (mode !== "reset" && key !== act.windowKey) mode = "reset";
    if (mode === "refresh" && act.busySeq) return;
    if (mode === "more" && (!act.nextCursor || act.moreSeq)) return;
    const seq = act.seq + 1;
    act.seq = seq;
    const loaded = act.cards.length;
    const limit = mode === "refresh"
      ? Math.min(ACTIVITY_MAX_PAGE, Math.max(ACTIVITY_PAGE, loaded + ACTIVITY_REFRESH_HEADROOM))
      : ACTIVITY_PAGE;
    if (mode !== "refresh") act.busySeq = seq;
    if (mode === "reset") {
      act.windowKey = key;
      act.error = "";
      act.stale = true;
      act.moreSeq = 0;
      // The old cursor belongs to the previous window or filter; Load more waits for the new first page.
      act.nextCursor = null;
    }
    if (mode === "more") act.moreSeq = seq;
    renderActivity();
    try {
      const payload = await fetchJson(activityUrl(win, limit, mode === "more" ? act.nextCursor : null));
      if (seq !== act.seq) return;
      // 200 with disabled: true is the read switch, not a failed load. Drop cards so null lists never render.
      if (payload.disabled) {
        act.cards = [];
        act.nextCursor = null;
        act.payload = null;
        act.readsDisabled = true;
        act.message = payload.message || "";
        act.error = "";
        act.refreshFailed = false;
        act.loadedAt = Date.now();
      } else {
        act.readsDisabled = false;
        act.message = "";
        const incoming = Array.isArray(payload.cards) ? payload.cards : [];
        if (mode === "more") {
          const seen = new Set(act.cards.map((card) => card.id));
          act.cards = act.cards.concat(incoming.filter((card) => !seen.has(card.id)));
          act.nextCursor = payload.next_cursor || null;
        } else if (mode === "refresh" && loaded + ACTIVITY_REFRESH_HEADROOM > ACTIVITY_MAX_PAGE && incoming.length) {
          // More cards are loaded than one request returns: keep the older pages behind the refreshed head.
          const lastId = incoming[incoming.length - 1].id;
          const index = act.cards.findIndex((card) => card.id === lastId);
          if (index >= 0) {
            act.cards = incoming.concat(act.cards.slice(index + 1));
          } else {
            act.cards = incoming;
            act.nextCursor = payload.next_cursor || null;
          }
        } else {
          act.cards = incoming;
          act.nextCursor = payload.next_cursor || null;
        }
        act.payload = payload;
        act.loadedAt = Date.now();
        act.refreshFailed = false;
        act.error = "";
      }
    } catch (error) {
      if (seq !== act.seq) return;
      if (mode === "reset") {
        act.payload = null;
        act.cards = [];
        act.nextCursor = null;
        act.readsDisabled = false;
        act.message = "";
        act.error = (error && error.message) || t("activity.errorTitle");
      } else {
        act.refreshFailed = true;
      }
    } finally {
      if (act.busySeq === seq) act.busySeq = 0;
      if (act.moreSeq === seq) act.moreSeq = 0;
      if (seq === act.seq) {
        act.stale = false;
        renderActivity();
      }
    }
  }

  // Splits a "{n} …" template around the count so the number can be bold, with the rest escaped.
  function richCount(key, value) {
    return t(key).split("{n}").map(escapeHtml).join("<strong>" + escapeHtml(value) + "</strong>");
  }

  function renderActivitySparkline(days) {
    if (!days.length) return "";
    const values = days.map(activityMeasure);
    const max = Math.max(1, ...values);
    const height = 24;
    const step = Math.max(2, Math.min(9, 120 / days.length));
    const barWidth = Math.max(1.2, step * 0.64);
    const width = step * days.length;
    const parts = days.map((day, index) => {
      const x = index * step + (step - barWidth) / 2;
      const label = '<title>' + escapeHtml(t("activity.sparkDay", { date: formatShortDate(parseLocalDay(day.day)), n: formatCount(values[index]) })) + '</title>';
      if (!values[index]) {
        return '<g>' + label + '<circle class="sparkZero" cx="' + (x + barWidth / 2).toFixed(1) + '" cy="' + (height - 1.6) + '" r="' + Math.min(1.6, barWidth / 2 + 0.2).toFixed(1) + '"/></g>';
      }
      const barHeight = Math.max(3, (values[index] / max) * height);
      return '<g>' + label + '<rect class="sparkBar" x="' + x.toFixed(1) + '" y="' + (height - barHeight).toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="' + Math.min(1.5, barWidth / 2).toFixed(1) + '"/></g>';
    });
    return '<svg class="actSparkSvg" width="' + Math.ceil(width) + '" height="' + height + '" viewBox="0 0 ' + width.toFixed(1) + ' ' + height + '" aria-hidden="true" focusable="false">' + parts.join("") + '</svg>';
  }

  function renderActivitySummary() {
    const act = state.activity;
    const payload = act.payload;
    const totals = payload && payload.totals;
    const signature = [state.locale, act.kind, JSON.stringify(totals || null)].join("|");
    if (act.signatures.summary !== signature) {
      act.signatures.summary = signature;
      const count = (name) => (totals ? formatCount(totals[name]) : "—");
      const memories = Number(totals && totals.memories || 0);
      const legacy = Number(totals && totals.legacy || 0);
      els.activitySumMemories.innerHTML = richCount(totals && memories === 1 ? "activity.sumMemory" : "activity.sumMemories", count("memories"));
      els.activitySumOutcome.innerHTML = richCount("activity.sumOutcome", count("outcome"));
      els.activitySumContext.innerHTML = richCount("activity.sumContext", count("context"));
      els.activitySumLegacy.innerHTML = richCount(totals && legacy === 1 ? "activity.sumLegacyOne" : "activity.sumLegacy", count("legacy"));
    }
    setAttr(els.activitySumLegacy, "aria-pressed", act.kind === "all" ? "true" : "false");
    setAttr(els.activitySumLegacy, "title", t(act.kind === "all" ? "activity.legacyHide" : "activity.legacyShow"));
    const days = payload && Array.isArray(payload.days) ? payload.days : [];
    const sparkSignature = [state.locale, act.kind, JSON.stringify(days)].join("|");
    if (act.signatures.spark !== sparkSignature) {
      act.signatures.spark = sparkSignature;
      els.activitySparkline.innerHTML = renderActivitySparkline(days);
    }
  }

  function renderActivityToolbar() {
    const act = state.activity;
    els.activityRangeButtons.forEach((button) => {
      setAttr(button, "aria-pressed", button.getAttribute("data-activity-range") === act.range ? "true" : "false");
    });
    setText(els.activityProjectValue, act.project ? projectBasename(act.project) : t("activity.all"));
    setAttr(els.activityProjectButton, "title", act.project);
    setClass(els.activityProjectButton, "actPopup" + (act.project ? " is-filtered" : ""));
    setText(els.activityAgentValue, act.agent || t("activity.all"));
    setAttr(els.activityAgentButton, "title", act.agent);
    setClass(els.activityAgentButton, "actPopup" + (act.agent ? " is-filtered" : ""));

    const win = getActivityWindow();
    const withYear = win.from.getFullYear() !== new Date().getFullYear();
    const options = withYear
      ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
      : { weekday: "short", month: "short", day: "numeric" };
    const format = (day) => parseLocalDay(day).toLocaleDateString(state.locale, options);
    // Chinese dates carry no spaces, so the range dash sits tight there; English sets it off with spaces.
    const dash = state.locale === "zh-CN" ? "–" : " – ";
    setText(els.activityRangeLabel, win.firstDay === win.lastDay ? format(win.lastDay) : format(win.firstDay) + dash + format(win.lastDay));
    const updated = act.refreshFailed
      ? t("activity.refreshFailed", { time: formatClock(new Date()) })
      : act.loadedAt ? t("activity.updated", { time: formatClock(new Date(act.loadedAt)) }) : "";
    setText(els.activityUpdated, updated ? " · " + updated : "");
    setClass(els.activityUpdated, "actUpdated" + (act.refreshFailed ? " is-warn" : ""));
  }

  // Projects and agents come from breakdown, which ignores the project and agent filters; each list is narrowed
  // by the other filter here so its counts match what selecting an entry would show.
  function getActivityFacet(name) {
    const act = state.activity;
    const rows = act.payload && Array.isArray(act.payload.breakdown) ? act.payload.breakdown : [];
    const field = name === "project" ? "project_path" : "agent_id";
    const otherField = name === "project" ? "agent_id" : "project_path";
    const other = (name === "project" ? act.agent : act.project).toLowerCase();
    const selected = name === "project" ? act.project : act.agent;
    const counts = new Map();
    rows.forEach((row) => {
      if (other && String(row[otherField] || "").toLowerCase() !== other) return;
      const value = String(row[field] || "");
      counts.set(value, (counts.get(value) || 0) + activityMeasure(row));
    });
    const items = Array.from(counts, (entry) => ({ value: entry[0], n: entry[1] })).filter((item) => item.n > 0);
    if (selected && !items.some((item) => item.value.toLowerCase() === selected.toLowerCase())) {
      items.push({ value: selected, n: 0 });
    }
    const label = (value) => (name === "project" ? projectBasename(value) : value);
    items.sort((left, right) => right.n - left.n || label(left.value).localeCompare(label(right.value)));
    return { items, total: items.reduce((sum, item) => sum + item.n, 0), selected, label };
  }

  function isActivitySelected(value, selected) {
    return String(value || "").toLowerCase() === String(selected || "").toLowerCase();
  }

  function updateActivityChipsOverflow() {
    const strip = els.activityChips;
    if (!strip) return;
    strip.classList.toggle("is-overflowing", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
  }

  function renderActivityChips() {
    const act = state.activity;
    const facet = getActivityFacet("project");
    const signature = [state.locale, act.project, JSON.stringify(facet.items), facet.total, !!act.payload].join("|");
    if (act.signatures.chips === signature) return;
    act.signatures.chips = signature;
    const chip = (value, inner, title) => {
      const pressed = value ? isActivitySelected(value, act.project) : !act.project;
      return '<button class="actChip" type="button" data-activity-project="' + escapeHtml(value) + '" aria-pressed="' + pressed + '"' +
        (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + inner + '</button>';
    };
    els.activityChips.innerHTML = chip("", '<span class="actChipName">' + escapeHtml(t("activity.allProjects")) + '</span>' +
      '<span class="actChipCount">' + escapeHtml(act.payload ? formatCount(facet.total) : "—") + '</span>') +
      facet.items.map((item) => chip(item.value,
        '<span class="actDot" data-hue="' + projectHue(item.value) + '" aria-hidden="true"></span>' +
        '<span class="actChipName">' + escapeHtml(projectBasename(item.value)) + '</span>' +
        '<span class="actChipCount">' + escapeHtml(formatCount(item.n)) + '</span>', item.value)).join("");
    updateActivityChipsOverflow();
  }

  function renderActivityMenu(name, popover) {
    const act = state.activity;
    const facet = getActivityFacet(name);
    const signature = [state.locale, facet.selected, JSON.stringify(facet.items), facet.total].join("|");
    if (act.signatures[name] === signature) return;
    act.signatures[name] = signature;
    const attribute = "data-activity-" + name;
    const focused = popover.contains(document.activeElement) ? document.activeElement.getAttribute(attribute) : null;
    const option = (value, label, count, title) => {
      const selected = value ? isActivitySelected(value, facet.selected) : !facet.selected;
      return '<button class="actOption" type="button" role="option" tabindex="-1" ' + attribute + '="' + escapeHtml(value) + '" aria-selected="' + selected + '"' +
        (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + svgIcon("check", "actOptionCheck") +
        (name === "project" && value ? '<span class="actDot" data-hue="' + projectHue(value) + '" aria-hidden="true"></span>' : '') +
        '<span class="actOptionName">' + escapeHtml(label) + '</span>' +
        '<span class="actOptionCount">' + escapeHtml(count) + '</span></button>';
    };
    popover.innerHTML = option("", t(name === "project" ? "activity.allProjects" : "activity.allAgents"), act.payload ? formatCount(facet.total) : "—") +
      (facet.items.length ? '<div class="actMenuSep" aria-hidden="true"></div>' : '') +
      facet.items.map((item) => option(item.value, facet.label(item.value), formatCount(item.n), name === "project" ? item.value : "")).join("");
    if (focused !== null) {
      const target = Array.from(popover.querySelectorAll("[" + attribute + "]")).find((node) => node.getAttribute(attribute) === focused);
      if (target) target.focus();
    }
    if (act.openPopover === name) positionActivityPopover(popover, name === "project" ? els.activityProjectButton : els.activityAgentButton);
  }

  function renderActivityCardBody(card) {
    const created = parseTimestamp(card.created_at);
    const kind = card.kind === "outcome" || card.kind === "context" ? card.kind : "legacy";
    const kindLabel = t(kind === "outcome" ? "home.kindOutcome" : kind === "context" ? "home.kindContext" : "home.kindLegacy");
    const badges = [];
    if (card.source === "explicit") {
      badges.push('<span class="actBadge is-mcp" title="' + escapeHtml(t("activity.mcpHint")) + '">' + escapeHtml(t("activity.mcp")) + '</span>');
    }
    if (card.fallback) {
      badges.push('<span class="actBadge is-fallback" title="' + escapeHtml(t("activity.fallbackHint")) + '">' + escapeHtml(t("activity.fallback")) + '</span>');
    }
    const meta = [];
    // The review mark sits with the other quiet counts on the right rather than among the coloured badges.
    if (card.has_review) {
      meta.push('<span class="actReview" role="img" aria-label="' + escapeHtml(t("activity.reviewHint")) + '" title="' + escapeHtml(t("activity.reviewHint")) + '">' + svgIcon("review", "actMetaIcon") + '</span>');
    }
    const metaItem = (icon, count, hint) => '<span class="actMetaItem" role="img" aria-label="' + escapeHtml(hint) + '" title="' + escapeHtml(hint) + '">' +
      svgIcon(icon, "actMetaIcon") + escapeHtml(formatCount(count)) + '</span>';
    const files = Number(card.files_count || 0);
    const facts = Number(card.facts_count || 0);
    if (files > 0) meta.push(metaItem("file", files, t(files === 1 ? "activity.filesHintOne" : "activity.filesHint", { n: formatCount(files), m: formatCount(card.files_modified_count) })));
    if (facts > 0) meta.push(metaItem("facts", facts, t(facts === 1 ? "activity.factsHintOne" : "activity.factsHint", { n: formatCount(facts) })));
    const title = String(card.title || "").trim();
    return '<div class="actCardHead">' +
        '<time class="actTime" datetime="' + escapeHtml(created ? created.toISOString() : "") + '" title="' + escapeHtml(created ? created.toLocaleString(state.locale) : "") + '">' + escapeHtml(created ? formatClock(created) : "—") + '</time>' +
        '<span class="kindPill kind-' + kind + '">' + escapeHtml(kindLabel) + '</span>' + badges.join("") +
        (meta.length ? '<span class="actMeta">' + meta.join("") + '</span>' : '') +
      '</div>' +
      '<p class="actTitle"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + escapeHtml(title || t("activity.untitled")) + '</p>' +
      '<div class="actCardFoot">' +
        '<span class="actProject" title="' + escapeHtml(card.project_path || "") + '"><span class="actDot" data-hue="' + projectHue(card.project_path) + '" aria-hidden="true"></span>' +
        '<span class="actProjectName">' + escapeHtml(projectBasename(card.project_path) || "—") + '</span></span>' +
        (card.agent_id ? '<span class="actAgent">' + escapeHtml(card.agent_id) + '</span>' : '') +
      '</div>';
  }

  // Keyed reconcile: a card node is created once per memory id, its body is rewritten only when that memory's
  // fields (or the locale) change, and nodes are moved rather than rebuilt when the order shifts.
  function syncActivityCards(container, cards) {
    const nodes = state.activity.cardNodes;
    let cursor = container.firstElementChild;
    cards.forEach((card) => {
      let entry = nodes.get(card.id);
      if (!entry) {
        const node = document.createElement("article");
        node.className = "actCard";
        node.setAttribute("data-memory-id", card.id);
        // The whole card opens the detail drawer, by pointer or by Enter / Space.
        node.setAttribute("tabindex", "0");
        node.setAttribute("aria-haspopup", "dialog");
        entry = { node, signature: "" };
        nodes.set(card.id, entry);
      }
      entry.node.classList.toggle("is-open", state.drawer.id === card.id);
      const signature = state.locale + "|" + JSON.stringify(card);
      if (entry.signature !== signature) {
        entry.signature = signature;
        entry.node.innerHTML = renderActivityCardBody(card);
      }
      if (entry.node === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        container.insertBefore(entry.node, cursor);
      }
    });
    while (cursor) {
      const next = cursor.nextElementSibling;
      cursor.remove();
      cursor = next;
    }
  }

  function renderActivityColumn(index, dayKey, stats, visible) {
    const act = state.activity;
    const prefix = "activityColumn" + index;
    const date = parseLocalDay(dayKey);
    const ago = calendarDaysAgo(date);
    // "Today Sat, Oct 17" and "Yesterday Fri, Oct 16"; any other day is headed by its date alone ("Thu, Oct 15").
    const dateOptions = { weekday: "short", month: "short", day: "numeric" };
    if (date.getFullYear() !== new Date().getFullYear()) dateOptions.year = "numeric";
    const dateText = date.toLocaleDateString(state.locale, dateOptions);
    const relative = ago === 0 ? t("home.today") : ago === 1 ? t("home.yesterday") : "";
    setText(document.getElementById(prefix + "Title"), relative || dateText);
    const dateNode = document.getElementById(prefix + "Date");
    setText(dateNode, relative ? dateText : "");
    setHidden(dateNode, !relative);

    // Zero counts are noise: a pill only shows once its kind has at least one memory that day.
    [["Outcome", "outcome", "activity.dayOutcome"], ["Context", "context", "activity.dayContext"], ["Legacy", "legacy", "activity.dayLegacy"]].forEach((entry) => {
      const pill = document.getElementById(prefix + entry[0]);
      const count = Number(stats && stats[entry[1]] || 0);
      setText(pill.querySelector(".actDayCount"), formatCount(count));
      setAttr(pill, "title", t(entry[2], { n: formatCount(count) }));
      setHidden(pill, !act.payload || count === 0 || (entry[1] === "legacy" && act.kind === "typed"));
    });

    const container = document.getElementById(prefix + "Cards");
    const empty = document.getElementById(prefix + "Empty");
    const more = document.getElementById(prefix + "More");
    if (!act.payload) {
      if (!container.querySelector(".is-skeleton")) container.innerHTML = ACTIVITY_SKELETON + ACTIVITY_SKELETON + ACTIVITY_SKELETON;
      setHidden(empty, true);
      setHidden(more, true);
      return;
    }
    const cards = act.cards.filter((card) => card.day === dayKey);
    cards.forEach((card) => visible.add(card.id));
    syncActivityCards(container, cards);
    // A column is short of cards while the cursor has more and its day count says so; both columns share one cursor.
    const needsMore = !!act.nextCursor && cards.length < activityMeasure(stats);
    setHidden(empty, cards.length > 0 || needsMore);
    setHidden(more, !needsMore);
    setText(more, t(act.moreSeq ? "activity.loadingMore" : "activity.loadMore"));
    setAttr(more, "aria-busy", act.moreSeq ? "true" : null);
  }

  function renderActivityBoard() {
    const act = state.activity;
    const payload = act.payload;
    const win = getActivityWindow();
    const days = [win.lastDay];
    if (win.firstDay !== win.lastDay) days.push(localDayKey(shiftDays(parseLocalDay(win.lastDay), -1)));

    let notice = null;
    if (act.readsDisabled) {
      notice = {
        error: false,
        title: t("activity.readsDisabledTitle"),
        lead: t("activity.readsDisabledLead"),
        action: null,
        secondary: null,
      };
    } else if (!payload && act.error) {
      notice = { error: true, title: t("activity.errorTitle"), lead: act.error, action: ["retry", t("activity.retry")] };
    } else if (payload && activityMeasure(payload.totals) === 0) {
      const legacy = Number(payload.totals && payload.totals.legacy || 0);
      const filtered = !!(act.project || act.agent);
      const offerLegacy = act.kind === "typed" && legacy > 0;
      notice = {
        error: false,
        title: t("activity.emptyTitle"),
        lead: offerLegacy ? t("activity.emptyLeadLegacy", { n: formatCount(legacy) }) : t(filtered ? "activity.emptyLeadFiltered" : "activity.emptyLead"),
        action: offerLegacy ? ["legacy", t("activity.showLegacy")] : null,
        secondary: filtered ? ["clear", t("activity.clearFilters")] : null,
      };
    }
    setHidden(els.activityNotice, !notice);
    setHidden(els.activityColumns, !!notice);
    if (notice) {
      setClass(els.activityNotice, "actNotice glassCard glassBlur" + (notice.error ? " is-error" : ""));
      setText(els.activityNoticeTitle, notice.title);
      setText(els.activityNoticeLead, notice.lead);
      [[els.activityNoticeAction, notice.action], [els.activityNoticeSecondary, notice.secondary]].forEach((entry) => {
        setHidden(entry[0], !entry[1]);
        setAttr(entry[0], "data-activity-action", entry[1] ? entry[1][0] : null);
        setText(entry[0], entry[1] ? entry[1][1] : "");
      });
    }

    setAttr(els.activityColumns, "aria-busy", !payload || act.stale ? "true" : "false");
    setClass(els.activityColumns, "actColumns" + (days.length === 1 ? " is-single" : "") + (payload && act.stale ? " is-stale" : ""));
    setHidden(document.getElementById("activityColumn1"), days.length < 2);
    const byDay = new Map((payload && Array.isArray(payload.days) ? payload.days : []).map((day) => [day.day, day]));
    const visible = new Set();
    days.forEach((day, index) => renderActivityColumn(index, day, byDay.get(day), visible));
    if (days.length < 2) syncActivityCards(document.getElementById("activityColumn1Cards"), []);
    // Forget nodes of cards that left both columns so the cache stays bounded by what is on screen.
    act.cardNodes.forEach((_entry, id) => {
      if (!visible.has(id)) act.cardNodes.delete(id);
    });
  }

  function renderActivity() {
    if (!els.activityView) return;
    const payload = state.activity.payload;
    if (payload && Array.isArray(payload.breakdown)) assignActivityHues(payload.breakdown);
    renderActivitySummary();
    renderActivityToolbar();
    renderActivityChips();
    renderActivityMenu("project", els.activityProjectPopover);
    renderActivityMenu("agent", els.activityAgentPopover);
    renderActivityBoard();
    renderActivityEarlier();
    if (state.drawer.host === "activityView") renderMemoryDrawer();
  }

  // ---------- Activity: Earlier ----------

  // Oldest day shown as a column for the current window; Earlier lists the days before it.
  function anchorActivityEarlier() {
    const win = getActivityWindow();
    const early = state.activity.earlier;
    early.anchorTo = win.to.toISOString();
    early.anchor = win.firstDay === win.lastDay ? win.lastDay : localDayKey(shiftDays(parseLocalDay(win.lastDay), -1));
  }

  // One stats-only request (limit=0) for the 120 days before the anchored window end. It runs when Activity opens,
  // a filter changes, or Today/Yesterday rolls past midnight. The ordinary 5 s tick does not call it.
  async function loadActivityEarlier(force) {
    const act = state.activity;
    const early = act.earlier;
    if (!early.anchorTo) anchorActivityEarlier();
    const key = [early.anchorTo, act.project.toLowerCase(), act.agent.toLowerCase()].join("|");
    const fresh = Date.now() - early.loadedAt < EARLIER_REFRESH_MS;
    if (!force && key === early.key && (early.loading || (early.payload && fresh))) return;
    if (key !== early.key) early.payload = null;
    early.key = key;
    early.loading = true;
    early.error = "";
    const seq = early.seq + 1;
    early.seq = seq;
    renderActivityEarlier();
    const to = new Date(early.anchorTo);
    const params = new URLSearchParams({
      from: new Date(to.getTime() - ACTIVITY_MAX_DAYS * ACTIVITY_DAY_MS).toISOString(),
      to: to.toISOString(),
      tz_offset_minutes: String(-new Date().getTimezoneOffset()),
      limit: "0",
    });
    if (act.project) params.set("project", act.project);
    if (act.agent) params.set("agent", act.agent);
    try {
      const payload = await fetchJson("/admin/api/activity?" + params.toString());
      if (seq !== early.seq) return;
      // A disabled payload is not a fresh cache: loadedAt stays 0 so the next open refetches.
      if (payload.disabled) {
        early.payload = null;
        early.loadedAt = 0;
        early.readsDisabled = true;
        early.message = payload.message || "";
        early.error = "";
        applyReadPolicyToViews({ readEnabled: false });
      } else {
        early.payload = payload;
        early.loadedAt = Date.now();
        early.readsDisabled = false;
        early.message = "";
      }
    } catch (error) {
      if (seq !== early.seq) return;
      early.readsDisabled = false;
      early.message = "";
      early.error = (error && error.message) || t("activity.earlierError");
    } finally {
      if (seq === early.seq) {
        early.loading = false;
        renderActivityEarlier();
      }
    }
  }

  function earlierTyped(day) {
    return Number(day.outcome || 0) + Number(day.context || 0);
  }

  // Compacted memories are stored as outcome/context, while the day stays era "legacy" or "mixed".
  // Counting only day.legacy shows 0 for a compacted day and drops those memories on a mixed day.
  function earlierShownCount(day) {
    const typed = earlierTyped(day);
    if (day && (day.era === "legacy" || day.era === "mixed")) return typed + Number(day.legacy || 0);
    return typed;
  }

  function renderEarlierRow(day, value, max, selectedDay) {
    const date = parseLocalDay(day.day);
    const typed = earlierTyped(day);
    const legacyGroup = day.era === "legacy";
    const width = max > 0 ? Math.max(4, Math.round((Math.sqrt(value) / Math.sqrt(max)) * 100)) : 0;
    const full = date.toLocaleDateString(state.locale, { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
    // The breakdown line sits under v2.1 rows; legacy rows stay one quiet line and carry it in the tooltip.
    const parts = [];
    if (Number(day.outcome || 0) > 0) parts.push([t("activity.sumOutcome", { n: formatCount(day.outcome) }), false]);
    if (Number(day.context || 0) > 0) parts.push([t("activity.sumContext", { n: formatCount(day.context) }), false]);
    const fallback = Number(day.fallback || 0);
    if (fallback > 0) parts.push([t(fallback === 1 ? "activity.earlierFallbackOne" : "activity.earlierFallbacks", { n: formatCount(fallback) }), true]);
    if (Number(day.legacy || 0) > 0) parts.push([t("activity.earlierLegacyCount", { n: formatCount(day.legacy) }), false]);
    const sub = legacyGroup ? [] : parts.map((part) => part[1] ? '<span class="actEarlierWarn">' + escapeHtml(part[0]) + '</span>' : escapeHtml(part[0]));
    const tooltip = [full].concat(parts.map((part) => part[0])).join(" · ");
    return '<button class="actEarlierRow' + (legacyGroup ? ' is-legacy' : '') + '" type="button" data-earlier-day="' + escapeHtml(day.day) + '" data-earlier-typed="' + typed + '"' +
      (day.day === selectedDay ? ' aria-current="date"' : '') +
      ' aria-label="' + escapeHtml(t("activity.earlierOpenDay", { date: full, n: formatCount(value) })) + '" title="' + escapeHtml(tooltip) + '">' +
      '<span class="actEarlierDay"><span class="actEarlierWeek">' + escapeHtml(date.toLocaleDateString(state.locale, { weekday: "short" })) + '</span>' +
      '<span class="actEarlierNum">' + escapeHtml(date.toLocaleDateString(state.locale, { day: "numeric" })) + '</span></span>' +
      '<span class="actEarlierTrack" aria-hidden="true"><span class="actEarlierBar" style="width:' + width + '%"></span></span>' +
      '<span class="actEarlierCount">' + escapeHtml(formatCount(value)) + '</span>' +
      (sub.length ? '<span class="actEarlierSub">' + sub.join('<span class="actEarlierDot" aria-hidden="true"> · </span>') + '</span>' : '') +
      '</button>';
  }

  // Rows of one group, with a month label wherever the month changes (the list can span four months).
  function renderEarlierRows(days, measure, max, selectedDay, anchorMonth) {
    let month = anchorMonth;
    return days.map((day) => {
      const date = parseLocalDay(day.day);
      const key = date.getFullYear() + "-" + date.getMonth();
      let label = "";
      if (key !== month) {
        month = key;
        label = '<p class="actEarlierMonth">' + escapeHtml(date.toLocaleDateString(state.locale, { month: "long", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined })) + '</p>';
      }
      return label + renderEarlierRow(day, measure(day), max, selectedDay);
    }).join("");
  }

  // Keep the Earlier panel inside the viewport. Measured from where it actually sits, so an expanded
  // legacy list scrolls inside the card instead of pushing the card past the bottom of the window.
  function fitActivityEarlierPanel() {
    const rail = els.activityEarlierPanel;
    if (!rail || !els.activityView || !els.activityView.classList.contains("is-active")) return;
    if (rail.getClientRects().length === 0) return;
    // Inline max-height wins over the stylesheet cap. Measure from the rail's real top so a list
    // opened under the toolbar cannot run past the bottom of the window.
    const top = Math.max(16, rail.getBoundingClientRect().top);
    const room = Math.max(220, Math.round(window.innerHeight - top - 16));
    const next = room + "px";
    if (rail.style.maxHeight !== next) rail.style.maxHeight = next;
  }

  let activityEarlierFitFrame = 0;
  function scheduleActivityEarlierFit() {
    if (activityEarlierFitFrame) return;
    activityEarlierFitFrame = window.requestAnimationFrame(() => {
      activityEarlierFitFrame = 0;
      fitActivityEarlierPanel();
    });
  }

  function renderActivityEarlier() {
    const body = els.activityEarlierBody;
    if (!body) return;
    const act = state.activity;
    const early = act.earlier;
    // Reads-off: only the disabled notice. Title, lead and note stay in the markup and come back with reads.
    setHidden(els.activityEarlierTitle, !!early.readsDisabled);
    setHidden(els.activityEarlierLead, !!early.readsDisabled);
    setHidden(els.activityEarlierNote, !!early.readsDisabled);
    const selectedDay = act.range === "custom" && act.customFrom && act.customFrom === act.customTo ? act.customFrom : "";
    const days = early.payload && Array.isArray(early.payload.days) ? early.payload.days : [];
    const signature = [state.locale, early.loading, early.error, early.readsDisabled, early.anchor, early.showAllV21, early.showAllLegacy, selectedDay, JSON.stringify(days)].join("|");
    if (act.signatures.earlier === signature) {
      fitActivityEarlierPanel();
      return;
    }
    act.signatures.earlier = signature;
    body.classList.toggle("is-expanded", early.showAllLegacy || early.showAllV21);

    if (!early.payload) {
      if (early.readsDisabled && !early.loading) {
        body.innerHTML = '<p class="actEarlierState">' + escapeHtml(t("activity.readsDisabledTitle")) + '</p>' +
          '<p class="actEarlierState">' + escapeHtml(t("activity.readsDisabledLead")) + '</p>';
      } else if (early.error) {
        body.innerHTML = '<p class="actEarlierState is-error">' + escapeHtml(t("activity.earlierError")) + '</p>' +
          '<button class="actRailLink" type="button" data-earlier-action="retry">' + escapeHtml(t("activity.retry")) + '</button>';
      } else {
        body.innerHTML = '<div class="actEarlierSkeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
          '<p class="visuallyHidden">' + escapeHtml(t("activity.earlierLoading")) + '</p>';
      }
      fitActivityEarlierPanel();
      return;
    }

    const older = days.filter((day) => day.day < early.anchor && earlierTyped(day) + Number(day.legacy || 0) > 0)
      .sort((left, right) => (left.day < right.day ? 1 : -1));
    if (!older.length) {
      body.innerHTML = '<p class="actEarlierState">' + escapeHtml(t("activity.earlierEmpty")) + '</p>';
      fitActivityEarlierPanel();
      return;
    }
    // v2.1 rows count typed memories. Legacy and mixed rows add the raw records on the same √ scale.
    const v21 = older.filter((day) => day.era !== "legacy");
    const legacy = older.filter((day) => day.era === "legacy");
    const max = Math.max(1, ...v21.map(earlierShownCount), ...legacy.map(earlierShownCount));
    const anchorDate = parseLocalDay(early.anchor);
    const anchorMonth = anchorDate ? anchorDate.getFullYear() + "-" + anchorDate.getMonth() : "";
    const group = (title, rows, measure, limit, expanded, toggle) => {
      if (!rows.length) return "";
      const shown = expanded ? rows : rows.slice(0, limit);
      const hiddenCount = rows.length - shown.length;
      let link = "";
      if (toggle === "legacy" && rows.length > limit) {
        link = t(expanded ? "activity.earlierCollapse" : "activity.earlierExpand");
      } else if (toggle === "v21" && rows.length > limit) {
        link = expanded ? t("activity.earlierFewerDays") : t("activity.earlierMoreDays", { n: formatCount(hiddenCount) });
      }
      return '<section class="actEarlierGroup is-' + toggle + '">' +
        '<h3 class="actEarlierTitle">' + escapeHtml(title) + '</h3>' +
        '<div class="actEarlierRows">' + renderEarlierRows(shown, measure, max, selectedDay, anchorMonth) + '</div>' +
        (link ? '<button class="actRailLink" type="button" data-earlier-toggle="' + toggle + '" aria-expanded="' + expanded + '">' + escapeHtml(link) + '</button>' : '') +
        '</section>';
    };
    body.innerHTML = group(t("activity.earlierV21"), v21, earlierShownCount, EARLIER_V21_ROWS, early.showAllV21, "v21") +
      group(t("activity.earlierLegacy"), legacy, earlierShownCount, EARLIER_LEGACY_ROWS, early.showAllLegacy, "legacy");
    fitActivityEarlierPanel();
  }

  // ---------- Memory detail drawer (shared by Activity and Memory) ----------

  function isMemoryDrawerOpen() {
    return !!state.drawer.id;
  }

  // The drawer markup lives in Activity. It moves into the view that opens it, so its blur only runs inside the
  // visible view. Activity always shows it as a modal sheet over a scrim. Memory docks it beside the list only
  // at 1440px and wider; below that it uses the same modal sheet, scrim and focus handling as Activity.
  function memoryDrawerIsDocked(host) {
    const query = window.matchMedia ? window.matchMedia("(min-width: 1440px)") : null;
    return host === "memoryView" && !!(query && query.matches);
  }

  function mountMemoryDrawer(host) {
    const view = document.getElementById(host);
    const drawerEl = els.activityDrawer;
    if (!view || !drawerEl) return;
    if (drawerEl.parentNode !== view) {
      view.appendChild(els.activityDrawerScrim);
      view.appendChild(drawerEl);
    }
    const docked = memoryDrawerIsDocked(host);
    setAttr(drawerEl, "aria-modal", docked ? "false" : "true");
    drawerEl.classList.toggle("is-docked", docked);
  }

  // Marks the open memory on the Activity cards and Memory rows without re-rendering either list.
  function markOpenMemory() {
    const id = state.drawer.id;
    state.activity.cardNodes.forEach((entry, key) => entry.node.classList.toggle("is-open", key === id));
    state.memory.rowNodes.forEach((entry, key) => {
      entry.node.classList.toggle("is-open", key === id);
      setAttr(entry.node, "aria-expanded", key === id ? "true" : "false");
    });
  }

  async function openMemoryDrawer(id, trigger, host) {
    const drawer = state.drawer;
    const wasOpen = isMemoryDrawerOpen();
    const nextHost = host || drawer.host || state.activeView;
    if (drawer.id !== id) {
      drawer.summaryOpen = false;
      drawer.factsOpen = false;
    }
    drawer.id = id;
    drawer.host = nextHost;
    drawer.payload = null;
    drawer.error = "";
    drawer.missing = false;
    drawer.readsDisabled = false;
    drawer.copied = false;
    if (!wasOpen || trigger) drawer.returnFocus = trigger || document.activeElement;
    const seq = drawer.seq + 1;
    drawer.seq = seq;
    setActivityPopover("");
    setMemoryPopover("");
    mountMemoryDrawer(nextHost);
    renderMemoryDrawer();
    markOpenMemory();
    placeMemoryDrawer();
    // The modal sheet takes focus; the docked drawer leaves it on the row so the list stays easy to walk.
    if (!memoryDrawerIsDocked(nextHost) && els.activityDrawerClose) els.activityDrawerClose.focus();
    try {
      const payload = await fetchJson("/admin/api/memory-detail?id=" + encodeURIComponent(id));
      if (seq !== drawer.seq) return;
      if (payload.disabled) {
        drawer.readsDisabled = true;
        drawer.payload = null;
        drawer.error = "";
        drawer.missing = false;
        applyReadPolicyToViews({ readEnabled: false });
      } else {
        drawer.payload = payload;
        drawer.readsDisabled = false;
      }
    } catch (error) {
      if (seq !== drawer.seq) return;
      drawer.readsDisabled = false;
      drawer.missing = !!(error && error.message === "Unknown memory ID");
      drawer.error = (error && error.message) || t("activity.drawerError");
    } finally {
      if (seq === drawer.seq) renderMemoryDrawer();
    }
  }

  function closeMemoryDrawer(restoreFocus) {
    const drawer = state.drawer;
    if (!drawer.id) return;
    const target = drawer.returnFocus;
    drawer.id = "";
    drawer.payload = null;
    drawer.error = "";
    drawer.missing = false;
    drawer.readsDisabled = false;
    drawer.copied = false;
    drawer.seq += 1;
    drawer.returnFocus = null;
    renderMemoryDrawer();
    markOpenMemory();
    drawer.host = "";
    placeMemoryDrawer();
    if (restoreFocus && target && document.contains(target)) target.focus({ preventScroll: true });
  }

  // Docked in Memory, the drawer starts under the summary line and climbs to the top as the page scrolls.
  // Below 1440px it is a modal sheet, so the inline top is cleared and the stylesheet places it like Activity.
  function placeMemoryDrawer() {
    const drawerEl = els.activityDrawer;
    if (!drawerEl) return;
    if (!memoryDrawerIsDocked(state.drawer.host) || !state.drawer.id || !els.memorySummary) {
      if (drawerEl.style.top) drawerEl.style.top = "";
      return;
    }
    const anchor = els.memorySummary.hidden ? els.memoryToolbar : els.memorySummary;
    const next = Math.round(Math.max(16, anchor.getBoundingClientRect().bottom + 10)) + "px";
    if (drawerEl.style.top !== next) drawerEl.style.top = next;
  }

  let memoryDrawerPlaceFrame = 0;
  function scheduleMemoryDrawerPlace() {
    if (memoryDrawerPlaceFrame) return;
    memoryDrawerPlaceFrame = window.requestAnimationFrame(() => {
      memoryDrawerPlaceFrame = 0;
      placeMemoryDrawer();
    });
  }

  function copyMemoryId() {
    const drawer = state.drawer;
    const id = drawer.id;
    if (!id || !navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      if (drawer.id !== id) return;
      drawer.copied = true;
      renderMemoryDrawerCopy();
      window.setTimeout(() => {
        drawer.copied = false;
        renderMemoryDrawerCopy();
      }, 1600);
    }).catch(() => {});
  }

  function renderMemoryDrawerCopy() {
    const button = els.memoryDrawerCopy;
    if (!button) return;
    const label = t(state.drawer.copied ? "memory.drawerCopied" : "memory.drawerCopyId");
    setAttr(button, "title", label);
    setAttr(button, "aria-label", label);
    button.classList.toggle("is-done", !!state.drawer.copied);
    button.innerHTML = svgIcon(state.drawer.copied ? "check" : "copy", "actIcon");
  }

  function drawerList(items, className) {
    return '<ul class="' + className + '">' + items.map((item) => '<li>' + escapeHtml(typeof item === "string" ? item : JSON.stringify(item)) + '</li>').join("") + '</ul>';
  }

  function drawerSection(title, count, inner) {
    return '<section class="actSection"><h3 class="actSectionTitle">' + escapeHtml(title) +
      (count !== null && count !== undefined ? '<span class="actSectionCount">' + escapeHtml(formatCount(count)) + '</span>' : '') +
      '</h3>' + inner + '</section>';
  }

  function drawerEmpty(text) {
    return '<p class="actSectionEmpty">' + escapeHtml(text) + '</p>';
  }

  function taskStatusTone(status) {
    const value = String(status || "").toLowerCase();
    if (value === "saved" || value === "done" || value === "ok" || value === "completed") return "ok";
    if (value === "fallback" || value === "duplicate" || value === "skipped" || value === "pending") return "warn";
    if (value === "error" || value === "failed") return "err";
    return "neutral";
  }

  // Review recommendation entries are objects of varying shape; show the readable fields when there are any.
  function describeRecommendation(entry) {
    if (!entry || typeof entry !== "object") return String(entry);
    const name = entry.title || entry.skill_title || entry.name || entry.skill_id || entry.id || "";
    const stateText = entry.state || entry.status || entry.recommendation || "";
    return [name, stateText].filter(Boolean).join(" · ") || JSON.stringify(entry);
  }

  // Tool dumps and other raw JSON are a wall of text. A few wrapped lines, then Show more.
  function narrativeLooksRaw(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") return true;
    const marks = trimmed.match(/[{}\\[\\]]/g);
    return !!(marks && marks.length >= 4);
  }

  function narrativeNeedsToggle(text) {
    const value = String(text || "");
    if (value.length > 320) return true;
    if (value.split(String.fromCharCode(10)).length > 5) return true;
    return narrativeLooksRaw(value) && value.length > 180;
  }

  function renderDrawerNarrative(text, forceRaw) {
    const raw = !!forceRaw || narrativeLooksRaw(text);
    const clamp = narrativeNeedsToggle(text);
    const open = !!state.drawer.summaryOpen;
    const body = '<p class="actNarrative' + (raw ? " is-raw" : "") + '">' + escapeHtml(text) + '</p>';
    if (!clamp) return body;
    return '<div class="actNarrativeClamp' + (open ? " is-open" : "") + '">' + body +
      '<button class="actNarrativeToggle" type="button" data-narrative-toggle="true" aria-expanded="' + (open ? "true" : "false") + '">' +
      escapeHtml(t(open ? "activity.drawerShowLess" : "activity.drawerShowMore")) + '</button></div>';
  }

  // Fallback facts are often one long "N tool calls (a, b, c)" line. Same few-line clamp as the summary.
  function factsNeedToggle(facts) {
    const list = Array.isArray(facts) ? facts : [];
    if (list.length > 5) return true;
    let text = "";
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      text += (i ? String.fromCharCode(10) : "") + (typeof item === "string" ? item : JSON.stringify(item));
    }
    if (text.length > 320) return true;
    return text.split(String.fromCharCode(10)).length > 5;
  }

  // A comma is a soft break, so each tool name stays whole and the list wraps between names.
  function renderFactText(item) {
    const text = typeof item === "string" ? item : JSON.stringify(item);
    return escapeHtml(text).replace(/, /g, ",<wbr> ");
  }

  function renderDrawerFacts(facts) {
    const list = '<ul class="actFacts">' + facts.map((item) => '<li>' + renderFactText(item) + '</li>').join("") + '</ul>';
    if (!factsNeedToggle(facts)) return list;
    const open = !!state.drawer.factsOpen;
    return '<div class="actNarrativeClamp' + (open ? " is-open" : "") + '">' + list +
      '<button class="actNarrativeToggle" type="button" data-facts-toggle="true" aria-expanded="' + (open ? "true" : "false") + '">' +
      escapeHtml(t(open ? "activity.drawerShowLess" : "activity.drawerShowMore")) + '</button></div>';
  }

  // Long paths keep their last three segments on screen; the full path is in the tooltip.
  function drawerFileTail(text) {
    const parts = String(text).split(String.fromCharCode(92)).join("/").split("/").filter(Boolean);
    return parts.length > 3 ? parts.slice(-3).join("/") : String(text);
  }

  function renderDrawerFiles(title, files, modified) {
    const rows = files.map((file) => {
      const text = typeof file === "string" ? file : JSON.stringify(file);
      return '<li title="' + escapeHtml(text) + '">' + svgIcon("file", "actFileIcon") + '<span class="actFileName">' + escapeHtml(drawerFileTail(text)) + '</span></li>';
    }).join("");
    return '<section class="actPane actFilesPane">' +
      '<h3 class="actPaneTitle">' + svgIcon("file", "actPaneIcon") + '<span>' + escapeHtml(title) + '</span><span class="actSectionCount">' + escapeHtml(formatCount(files.length)) + '</span></h3>' +
      '<ul class="actFiles' + (modified ? ' is-modified' : '') + '">' + rows + '</ul></section>';
  }

  function renderDrawerTask(task) {
    const created = parseTimestamp(task.created_at);
    const tone = taskStatusTone(task.status);
    const stat = (label, value) => '<div class="actStat"><span class="actStatLabel">' + escapeHtml(label) + '</span><span class="actStatValue">' + value + '</span></div>';
    const notes = ['<code class="actMono" title="' + escapeHtml(task.task_id || "") + '">' + escapeHtml(String(task.task_id || "").slice(0, 8)) + '</code>'];
    if (Number(task.segment_count || 0) > 1) notes.push(escapeHtml(t("activity.drawerTaskSegment", { i: formatCount(Number(task.segment_index || 0) + 1), n: formatCount(task.segment_count) })));
    if (task.trigger) notes.push(escapeHtml(t("activity.drawerTaskTrigger", { name: task.trigger })));
    if (created) notes.push('<time datetime="' + escapeHtml(created.toISOString()) + '">' + escapeHtml(formatShortDate(created) + " · " + formatClock(created)) + '</time>');
    return '<li class="actPane actTask">' +
      '<div class="actStats">' +
        stat(t("memory.drawerStatus"), '<span class="actStatusDot tone-' + tone + '" aria-hidden="true"></span><span class="actStatusWord tone-' + tone + '">' + escapeHtml(task.status || "—") + '</span>') +
        stat(t("memory.drawerEvents"), escapeHtml(formatCount(task.event_count))) +
        stat(t("memory.drawerEvidence"), escapeHtml(formatCount(task.evidence_count))) +
        stat(t("memory.drawerLlmCalls"), escapeHtml(formatCount(task.llm_calls))) +
      '</div>' +
      '<p class="actTaskFacts">' + notes.join('<span aria-hidden="true"> · </span>') + '</p>' +
      (task.last_error ? '<p class="actTaskError">' + escapeHtml(task.last_error) + '</p>' : '') +
      '</li>';
  }

  function renderMemoryDrawerBody(detail) {
    const memory = detail.memory || {};
    const parts = [];
    const narrative = String(memory.narrative || "").trim();
    // The summary reads as the drawer's lead paragraph; its heading is for screen readers.
    parts.push('<section class="actSection is-lead"><h3 class="visuallyHidden">' + escapeHtml(t("activity.drawerSummary")) + '</h3>' +
      (narrative ? renderDrawerNarrative(narrative, memory.fallback && narrative.length > 180) : drawerEmpty(t("activity.drawerNoSummary"))) + '</section>');
    const facts = Array.isArray(memory.facts) ? memory.facts : [];
    if (facts.length) parts.push(drawerSection(t("activity.drawerFacts"), facts.length, renderDrawerFacts(facts)));
    const concepts = Array.isArray(memory.concepts) ? memory.concepts : [];
    if (concepts.length) {
      parts.push(drawerSection(t("activity.drawerConcepts"), concepts.length, '<div class="actTags">' +
        concepts.map((concept) => '<span class="actTag is-concept">' + escapeHtml(typeof concept === "string" ? concept : JSON.stringify(concept)) + '</span>').join("") + '</div>'));
    }
    const modified = Array.isArray(memory.files_modified) ? memory.files_modified : [];
    const read = Array.isArray(memory.files_read) ? memory.files_read : [];
    if (modified.length || read.length) {
      parts.push('<div class="actPanes' + (modified.length && read.length ? ' is-pair' : '') + '">' +
        (modified.length ? renderDrawerFiles(t("activity.drawerFilesModified"), modified, true) : '') +
        (read.length ? renderDrawerFiles(t("activity.drawerFilesRead"), read, false) : '') + '</div>');
    }

    const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
    parts.push(drawerSection(t("activity.drawerTasks"), tasks.length || null,
      tasks.length ? '<ul class="actTasks">' + tasks.map(renderDrawerTask).join("") + '</ul>' + (detail.evidence_available ? '<p class="actSectionNote">' + escapeHtml(t("activity.drawerEvidence")) + '</p>' : '')
        : drawerEmpty(t("activity.drawerTasksEmpty"))));

    const flags = Array.isArray(detail.duplicate_flags) ? detail.duplicate_flags : [];
    parts.push(drawerSection(t("activity.drawerDuplicates"), flags.length || null, flags.length
      ? '<ul class="actFlags">' + flags.map((flag) => '<li class="actFlag"><span class="actStatus tone-' + taskStatusTone(flag.status) + '">' + escapeHtml(flag.status || "—") + '</span>' +
        '<span class="actFlagTask">' + escapeHtml(t("activity.drawerDuplicateTask", { id: String(flag.task_id || "").slice(0, 8) })) + '</span>' +
        (flag.reason ? '<span class="actFlagReason">' + escapeHtml(flag.reason) + '</span>' : '') + '</li>').join("") + '</ul>'
      : drawerEmpty(t("activity.drawerDuplicatesEmpty"))));

    const review = detail.review;
    let reviewHtml = drawerEmpty(t("activity.drawerReviewEmpty"));
    if (review) {
      const generated = parseTimestamp(review.generated_at);
      const skills = Array.isArray(review.matched_skill_titles) ? review.matched_skill_titles : [];
      const states = Array.isArray(review.recommendation_states) ? review.recommendation_states : [];
      reviewHtml = '<div class="actPane actReviewBox">' +
        '<div class="actReviewHead"><span class="actStatus tone-' + (review.status === "open" ? "info" : taskStatusTone(review.status)) + '">' + escapeHtml(review.status || "—") + '</span>' +
        (generated ? '<span class="actReviewTime">' + escapeHtml(t("activity.drawerReviewGenerated", { time: generated.toLocaleString(state.locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) })) + '</span>' : '') + '</div>' +
        '<dl class="actReviewFields">' +
        '<dt>' + escapeHtml(t("activity.drawerReviewQuery")) + '</dt><dd>' + escapeHtml(review.query_text || "—") + '</dd>' +
        '<dt>' + escapeHtml(t("activity.drawerReviewSkills")) + '</dt><dd>' + (skills.length
          ? '<div class="actTags">' + skills.map((skill) => '<span class="actTag">' + escapeHtml(String(skill)) + '</span>').join("") + '</div>'
          : escapeHtml(t("activity.drawerReviewNone"))) + '</dd>' +
        '<dt>' + escapeHtml(t("activity.drawerReviewStates")) + '</dt><dd>' + (states.length
          ? drawerList(states.map(describeRecommendation), "actFacts")
          : escapeHtml(t("activity.drawerReviewNone"))) + '</dd>' +
        '</dl></div>';
    }
    parts.push(drawerSection(t("activity.drawerReview"), null, reviewHtml));

    const idRows = [[t("activity.drawerId"), memory.id], [t("activity.drawerSession"), memory.session_id], [t("activity.drawerSource"), memory.source]];
    let footer = '<dl class="actIds">' + idRows.filter((row) => row[1]).map((row) => '<dt>' + escapeHtml(row[0]) + '</dt><dd><code class="actMono">' + escapeHtml(row[1]) + '</code></dd>').join("");
    if (detail.compacted_into) {
      footer += '<dt>' + escapeHtml(t("activity.drawerCompacted")) + '</dt><dd><button class="actLinkButton" type="button" data-drawer-open="' + escapeHtml(detail.compacted_into) + '"><code class="actMono">' + escapeHtml(detail.compacted_into) + '</code></button></dd>';
    }
    parts.push('<section class="actSection is-ids">' + footer + '</dl></section>');
    return parts.join("");
  }

  function memorySourceLabel(source) {
    if (source === "task") return t("memory.sourceTask");
    if (source === "tool") return t("memory.sourceTool");
    if (source === "legacy_compacted") return t("memory.sourceCompacted");
    return "";
  }

  // Header chips: kind, source, agent, project and time, as in a list row.
  function renderMemoryDrawerMeta(memory) {
    const created = parseTimestamp(memory.created_at);
    const kind = memory.kind === "outcome" || memory.kind === "context" ? memory.kind : "legacy";
    const chips = ['<span class="kindPill kind-' + kind + '">' + escapeHtml(memoryKindLabel(kind)) + '</span>'];
    if (memory.source === "explicit") chips.push('<span class="actBadge is-mcp" title="' + escapeHtml(t("activity.mcpHint")) + '">' + escapeHtml(t("activity.mcp")) + '</span>');
    if (memory.fallback) chips.push('<span class="actBadge is-fallback" title="' + escapeHtml(t("activity.fallbackHint")) + '">' + escapeHtml(t("activity.fallback")) + '</span>');
    const items = [];
    const source = memorySourceLabel(memory.source);
    if (source) items.push('<span class="actMetaChip">' + svgIcon(memory.source === "tool" ? "terminal" : "file", "actMetaChipIcon") + escapeHtml(source) + '</span>');
    if (memory.agent_id) items.push('<span class="actMetaChip is-agent">' + escapeHtml(memory.agent_id) + '</span>');
    if (memory.project_path) items.push('<span class="actMetaChip" title="' + escapeHtml(memory.project_path) + '">' + escapeHtml(projectBasename(memory.project_path)) + '</span>');
    if (created) {
      const ago = calendarDaysAgo(created);
      const when = ago === 0 ? formatClock(created) : formatShortDate(created) + " · " + formatClock(created);
      items.push('<time class="actMetaChip actDrawerTime" datetime="' + escapeHtml(created.toISOString()) + '" title="' + escapeHtml(created.toLocaleString(state.locale)) + '">' + escapeHtml(when) + '</time>');
    }
    return chips.join("") + (items.length ? '<span class="actMetaChips">' + items.join("") + '</span>' : '');
  }

  function renderMemoryDrawer() {
    const drawerEl = els.activityDrawer;
    if (!drawerEl) return;
    const drawer = state.drawer;
    const open = !!drawer.id;
    setHidden(drawerEl, !open);
    setHidden(els.memoryDrawerCopy, !!drawer.readsDisabled);
    // Activity's sheet is always modal over the scrim. Memory hides the scrim only while docked (1440px and wider).
    // is-drawer-open stays on for Memory so the wide-viewport CSS can reserve list space; that reserve is itself
    // limited to min-width 1440px.
    setHidden(els.activityDrawerScrim, !open || memoryDrawerIsDocked(drawer.host));
    if (els.activityView) els.activityView.classList.toggle("has-drawer", open && drawer.host === "activityView");
    if (els.memoryView) els.memoryView.classList.toggle("is-drawer-open", open && drawer.host === "memoryView");
    const card = !open || drawer.readsDisabled ? null : findDrawerCard(drawer.id);
    const signature = [state.locale, drawer.id, drawer.host, drawer.error, drawer.readsDisabled, JSON.stringify(drawer.payload), drawer.payload ? "" : JSON.stringify(card)].join("|");
    if (drawer.signature === signature) return;
    drawer.signature = signature;
    renderMemoryDrawerCopy();
    if (!open) {
      els.activityDrawerMeta.innerHTML = "";
      els.activityDrawerSub.innerHTML = "";
      els.activityDrawerBody.innerHTML = "";
      setText(els.activityDrawerTitle, "");
      return;
    }
    // Until the detail arrives, the row or card already on screen supplies the header.
    const memory = drawer.payload && drawer.payload.memory ? drawer.payload.memory : card;
    els.activityDrawerSub.innerHTML = "";
    if (memory) {
      els.activityDrawerMeta.innerHTML = renderMemoryDrawerMeta(memory);
      const title = String(memory.title || "").trim();
      setText(els.activityDrawerTitle, title || t("activity.untitled"));
      setAttr(els.activityDrawerTitle, "title", title);
    } else {
      els.activityDrawerMeta.innerHTML = "";
      setText(els.activityDrawerTitle, drawer.readsDisabled ? t("activity.readsDisabledTitle") : (drawer.error ? t("activity.drawerError") : t("activity.drawerLoading")));
      setAttr(els.activityDrawerTitle, "title", "");
    }
    if (drawer.readsDisabled) {
      els.activityDrawerBody.innerHTML = '<div class="actDrawerState"><p>' + escapeHtml(t("activity.drawerReadsDisabled")) + '</p></div>';
    } else if (drawer.payload) {
      els.activityDrawerBody.innerHTML = renderMemoryDrawerBody(drawer.payload);
    } else if (drawer.error) {
      els.activityDrawerBody.innerHTML = '<div class="actDrawerState is-error"><p>' + escapeHtml(drawer.missing ? t("activity.drawerMissing") : drawer.error) + '</p>' +
        (drawer.missing ? '' : '<button class="bgButton" type="button" data-drawer-open="' + escapeHtml(drawer.id) + '">' + escapeHtml(t("activity.retry")) + '</button>') + '</div>';
    } else {
      els.activityDrawerBody.innerHTML = '<div class="actDrawerSkeleton" aria-hidden="true"><span class="is-long"></span><span class="is-long"></span><span class="is-mid"></span><span class="is-short"></span></div>' +
        '<p class="visuallyHidden">' + escapeHtml(t("activity.drawerLoading")) + '</p>';
    }
  }

  function findDrawerCard(id) {
    const list = state.drawer.host === "memoryView" ? state.memory.items : state.activity.cards;
    return list.find((item) => item.id === id) || null;
  }

  function trapMemoryDrawerFocus(event) {
    const focusable = Array.from(els.activityDrawer.querySelectorAll("button, [href], input, [tabindex]:not([tabindex='-1'])"))
      .filter((node) => !node.disabled && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === els.activityDrawer)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // The drawer's own controls. Listeners sit on the drawer node, so they follow it into either view.
  function bindMemoryDrawerEvents() {
    const drawerEl = els.activityDrawer;
    if (!drawerEl) return;
    drawerEl.addEventListener("click", (event) => {
      const drawer = state.drawer;
      if (event.target.closest("#activityDrawerClose")) {
        closeMemoryDrawer(true);
        return;
      }
      if (event.target.closest("#memoryDrawerCopy")) {
        copyMemoryId();
        return;
      }
      const reopen = event.target.closest("[data-drawer-open]");
      if (reopen) {
        void openMemoryDrawer(reopen.getAttribute("data-drawer-open"), null, drawer.host);
        return;
      }
      const narrativeToggle = event.target.closest("[data-narrative-toggle]");
      if (narrativeToggle) {
        drawer.summaryOpen = !drawer.summaryOpen;
        const wrap = narrativeToggle.closest(".actNarrativeClamp");
        if (wrap) wrap.classList.toggle("is-open", drawer.summaryOpen);
        narrativeToggle.setAttribute("aria-expanded", drawer.summaryOpen ? "true" : "false");
        narrativeToggle.textContent = t(drawer.summaryOpen ? "activity.drawerShowLess" : "activity.drawerShowMore");
        return;
      }
      const factsToggle = event.target.closest("[data-facts-toggle]");
      if (factsToggle) {
        drawer.factsOpen = !drawer.factsOpen;
        const wrap = factsToggle.closest(".actNarrativeClamp");
        if (wrap) wrap.classList.toggle("is-open", drawer.factsOpen);
        factsToggle.setAttribute("aria-expanded", drawer.factsOpen ? "true" : "false");
        factsToggle.textContent = t(drawer.factsOpen ? "activity.drawerShowLess" : "activity.drawerShowMore");
      }
    });
    drawerEl.addEventListener("keydown", (event) => {
      if (!isMemoryDrawerOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMemoryDrawer(true);
      } else if (event.key === "Tab" && !memoryDrawerIsDocked(state.drawer.host)) {
        trapMemoryDrawerFocus(event);
      }
    });
    if (els.activityDrawerScrim) els.activityDrawerScrim.addEventListener("click", () => closeMemoryDrawer(true));
    // Escape with focus outside the drawer (after a click on the scrim, say) still closes it.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.defaultPrevented && isMemoryDrawerOpen()) closeMemoryDrawer(true);
    });
    // One listener: crossing 1440px while Memory's drawer is open flips docked and modal (scrim, aria-modal, focus).
    const memoryDrawerDockQuery = window.matchMedia ? window.matchMedia("(min-width: 1440px)") : null;
    if (memoryDrawerDockQuery && memoryDrawerDockQuery.addEventListener) {
      memoryDrawerDockQuery.addEventListener("change", () => {
        if (!isMemoryDrawerOpen() || state.drawer.host !== "memoryView") return;
        mountMemoryDrawer(state.drawer.host);
        renderMemoryDrawer();
        placeMemoryDrawer();
        if (!memoryDrawerIsDocked(state.drawer.host) && els.activityDrawerClose) els.activityDrawerClose.focus();
      });
    }
  }

  function getActivityPopoverParts(name) {
    if (name === "project") return [els.activityProjectPopover, els.activityProjectButton];
    if (name === "agent") return [els.activityAgentPopover, els.activityAgentButton];
    if (name === "custom") return [els.activityCustomPopover, els.activityRangeCustom];
    return null;
  }

  // Popovers are children of the view (position: relative), so they scroll with the page and only need placing
  // when they open or their content changes width.
  function positionActivityPopover(popover, anchor) {
    placeViewPopover(els.activityView, popover, anchor);
  }

  function placeViewPopover(viewEl, popover, anchor) {
    const view = viewEl.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(0, Math.min(rect.left - view.left, view.width - popover.offsetWidth));
    popover.style.left = Math.round(left) + "px";
    popover.style.top = Math.round(rect.bottom - view.top + 8) + "px";
  }

  function setActivityPopover(name) {
    const act = state.activity;
    act.openPopover = getActivityPopoverParts(name) ? name : "";
    ["project", "agent", "custom"].forEach((key) => {
      const parts = getActivityPopoverParts(key);
      const open = key === act.openPopover;
      setHidden(parts[0], !open);
      setAttr(parts[1], "aria-expanded", open ? "true" : "false");
      if (open) positionActivityPopover(parts[0], parts[1]);
    });
  }

  function closeActivityPopover(restoreFocus) {
    const parts = getActivityPopoverParts(state.activity.openPopover);
    setActivityPopover("");
    if (parts && restoreFocus) parts[1].focus();
  }

  function openActivityMenu(name) {
    if (state.activity.openPopover === name) {
      closeActivityPopover(false);
      return;
    }
    setActivityPopover(name);
    const popover = getActivityPopoverParts(name)[0];
    const target = popover.querySelector('[aria-selected="true"]') || popover.querySelector(".actOption");
    if (target) target.focus();
  }

  function openActivityCustom() {
    if (state.activity.openPopover === "custom") {
      closeActivityPopover(false);
      return;
    }
    const act = state.activity;
    const win = getActivityWindow();
    const today = localDayKey(new Date());
    els.activityCustomFrom.value = act.customFrom || win.firstDay;
    els.activityCustomTo.value = act.customTo || win.lastDay;
    els.activityCustomFrom.max = today;
    els.activityCustomTo.max = today;
    setHidden(els.activityCustomError, true);
    setActivityPopover("custom");
    els.activityCustomFrom.focus();
  }

  function applyActivityCustomRange() {
    const from = els.activityCustomFrom.value;
    const to = els.activityCustomTo.value;
    const start = parseLocalDay(from);
    const end = parseLocalDay(to);
    let error = "";
    if (!start || !end) {
      error = t("activity.customMissing");
    } else if (start > end) {
      error = t("activity.customOrder");
    } else if (Math.round((shiftDays(end, 1).getTime() - start.getTime()) / ACTIVITY_DAY_MS) > ACTIVITY_MAX_DAYS) {
      error = t("activity.customTooLong");
    }
    if (error) {
      setText(els.activityCustomError, error);
      setHidden(els.activityCustomError, false);
      return;
    }
    const act = state.activity;
    act.customFrom = from;
    act.customTo = to;
    act.range = "custom";
    closeActivityPopover(true);
    setActivityFilters({}, false);
  }

  // keepEarlier: a day opened from the Earlier list keeps that list where it is instead of re-anchoring it.
  function setActivityFilters(patch, keepEarlier) {
    Object.assign(state.activity, patch);
    if (!keepEarlier) anchorActivityEarlier();
    void loadActivity("reset");
    void loadActivityEarlier(false);
  }

  function bindActivityEvents() {
    if (!els.activityView) return;
    els.activityView.addEventListener("click", (event) => {
      const act = state.activity;
      // The shared drawer and its scrim handle their own clicks (see bindMemoryDrawerEvents).
      if (els.activityDrawer.contains(event.target) || event.target === els.activityDrawerScrim) return;
      const card = event.target.closest(".actCard[data-memory-id]");
      if (card) {
        void openMemoryDrawer(card.getAttribute("data-memory-id"), card, "activityView");
        return;
      }
      const earlierDay = event.target.closest("[data-earlier-day]");
      if (earlierDay) {
        const day = earlierDay.getAttribute("data-earlier-day");
        // A day with only legacy records would open empty under the typed filter, so it brings them along.
        const legacyOnly = earlierDay.getAttribute("data-earlier-typed") === "0";
        setActivityPopover("");
        setActivityFilters({ range: "custom", customFrom: day, customTo: day, kind: legacyOnly ? "all" : act.kind }, true);
        return;
      }
      const earlierToggle = event.target.closest("[data-earlier-toggle]");
      if (earlierToggle) {
        const which = earlierToggle.getAttribute("data-earlier-toggle");
        if (which === "legacy") act.earlier.showAllLegacy = !act.earlier.showAllLegacy;
        else act.earlier.showAllV21 = !act.earlier.showAllV21;
        renderActivityEarlier();
        // Keep focus on the toggle without scrolling the list down to where it now sits.
        const again = els.activityEarlierBody.querySelector('[data-earlier-toggle="' + which + '"]');
        if (again) again.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-earlier-action="retry"]')) {
        void loadActivityEarlier(true);
        return;
      }
      const range = event.target.closest("[data-activity-range]");
      if (range) {
        const value = range.getAttribute("data-activity-range");
        if (value === "custom") {
          openActivityCustom();
        } else {
          setActivityPopover("");
          setActivityFilters({ range: value });
        }
        return;
      }
      if (event.target.closest("#activityProjectButton")) {
        openActivityMenu("project");
        return;
      }
      if (event.target.closest("#activityAgentButton")) {
        openActivityMenu("agent");
        return;
      }
      const project = event.target.closest("[data-activity-project]");
      if (project) {
        const value = project.getAttribute("data-activity-project") || "";
        const fromChip = project.classList.contains("actChip");
        if (!fromChip) closeActivityPopover(true);
        // A chip toggles: clicking the selected project again goes back to all projects.
        setActivityFilters({ project: fromChip && value && isActivitySelected(value, act.project) ? "" : value });
        return;
      }
      const agent = event.target.closest("[data-activity-agent]");
      if (agent) {
        closeActivityPopover(true);
        setActivityFilters({ agent: agent.getAttribute("data-activity-agent") || "" });
        return;
      }
      if (event.target.closest("[data-activity-more]")) {
        void loadActivity("more");
        return;
      }
      if (event.target.closest("#activitySumLegacy")) {
        setActivityFilters({ kind: act.kind === "typed" ? "all" : "typed" });
        return;
      }
      const action = event.target.closest("[data-activity-action]");
      if (action) {
        const name = action.getAttribute("data-activity-action");
        if (name === "legacy") setActivityFilters({ kind: "all" });
        else if (name === "clear") setActivityFilters({ project: "", agent: "" });
        else void loadActivity("reset");
        return;
      }
      if (event.target.closest("#activityCustomApply")) {
        applyActivityCustomRange();
        return;
      }
      if (event.target.closest("#activityCustomCancel")) {
        closeActivityPopover(true);
      }
    });

    els.activityView.addEventListener("keydown", (event) => {
      if (els.activityDrawer.contains(event.target)) return;
      if ((event.key === "Enter" || event.key === " ") && event.target.matches(".actCard[data-memory-id]")) {
        event.preventDefault();
        void openMemoryDrawer(event.target.getAttribute("data-memory-id"), event.target, "activityView");
        return;
      }
      const open = state.activity.openPopover;
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeActivityPopover(true);
        return;
      }
      if (open === "custom") {
        if (event.key === "Enter" && event.target.matches(".actDateInput")) {
          event.preventDefault();
          applyActivityCustomRange();
        }
        return;
      }
      const popover = getActivityPopoverParts(open)[0];
      const options = Array.from(popover.querySelectorAll(".actOption"));
      const index = options.indexOf(document.activeElement);
      let next = -1;
      if (event.key === "ArrowDown") next = Math.min(options.length - 1, index + 1);
      else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Tab") {
        event.preventDefault();
        closeActivityPopover(true);
        return;
      }
      if (next >= 0 && options[next]) {
        event.preventDefault();
        options[next].focus();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      const parts = getActivityPopoverParts(state.activity.openPopover);
      if (!parts || parts[0].contains(event.target) || parts[1].contains(event.target)) return;
      setActivityPopover("");
    });

    window.addEventListener("resize", () => {
      if (state.activity.openPopover) setActivityPopover("");
      updateActivityChipsOverflow();
      scheduleActivityEarlierFit();
    });

    window.addEventListener("scroll", scheduleActivityEarlierFit, { passive: true });

    els.activityChips.addEventListener("scroll", updateActivityChipsOverflow, { passive: true });
  }

  // ---------- Memory ----------

  const MEMORY_PAGE = 50;
  const MEMORY_MAX_PAGE = 100;
  const MEMORY_REFRESH_HEADROOM = 20;
  const MEMORY_SEARCH_DELAY_MS = 300;
  const MEMORY_SCROLL_IDLE_MS = 1500;
  const MEMORY_SKELETON = '<div class="memGroup is-skeleton" aria-hidden="true"><div class="memDayHead"><span class="actSkel is-short"></span></div><div class="memRows">' +
    '<div class="memRow is-skeleton"><span class="actSkel is-short"></span><span class="actSkel is-long"></span></div>'.repeat(6) + '</div></div>';
  const MEMORY_KINDS = [["default", "memory.kindDefault"], ["outcome", "memory.kindOutcome"], ["context", "memory.kindContext"], ["legacy", "memory.kindLegacy"], ["all", "memory.kindEverything"]];
  const MEMORY_SOURCES = [["", "memory.allSources"], ["task", "memory.sourceTask"], ["tool", "memory.sourceTool"], ["explicit", "memory.sourceExplicit"], ["legacy_compacted", "memory.sourceCompacted"]];

  // Any time sends no bounds; 7 and 30 days start at a local midnight and stay open-ended, so the cursor survives
  // the poll; Custom covers whole local days.
  function getMemoryRange() {
    const mem = state.memory;
    const today = shiftDays(new Date(), 0);
    if (mem.range === "7d") return { from: shiftDays(today, -6), to: null };
    if (mem.range === "30d") return { from: shiftDays(today, -29), to: null };
    if (mem.range === "custom") {
      const start = parseLocalDay(mem.customFrom);
      const end = parseLocalDay(mem.customTo);
      if (start && end && start <= end) return { from: start, to: shiftDays(end, 1) };
    }
    return { from: null, to: null };
  }

  function memoryKey() {
    const mem = state.memory;
    const range = getMemoryRange();
    return JSON.stringify([mem.query, mem.project.toLowerCase(), mem.agent.toLowerCase(), mem.kind, mem.source,
      range.from ? range.from.toISOString() : "", range.to ? range.to.toISOString() : ""]);
  }

  function memoryUrl(limit, cursor) {
    const mem = state.memory;
    const range = getMemoryRange();
    const params = new URLSearchParams({
      tz_offset_minutes: String(-new Date().getTimezoneOffset()),
      limit: String(limit),
      stats: cursor ? "0" : "1",
    });
    if (mem.query) params.set("query", mem.query);
    if (mem.project) params.set("project", mem.project);
    if (mem.agent) params.set("agent", mem.agent);
    if (mem.kind !== "default") params.set("kind", mem.kind);
    if (mem.source) params.set("source", mem.source);
    if (range.from) params.set("from", range.from.toISOString());
    if (range.to) params.set("to", range.to.toISOString());
    if (cursor) params.set("cursor", cursor);
    return "/admin/api/memories?" + params.toString();
  }

  function isMemoryFiltered() {
    const mem = state.memory;
    return !!(mem.query || mem.project || mem.agent || mem.kind !== "default" || mem.source || mem.range !== "any");
  }

  // The 5 s poll only refreshes the plain list. isMemoryFiltered covers search text, project, agent, kind,
  // source and range; a debounce that has not fired yet still sits in searchTimer.
  function memoryCanPoll() {
    const mem = state.memory;
    return state.activeView === "memoryView" && !document.hidden && (mem.loaded || mem.readsDisabled) &&
      !isMemoryFiltered() && !mem.searchTimer &&
      !isMemoryDrawerOpen() && !mem.openPopover && Date.now() - mem.lastScrollAt > MEMORY_SCROLL_IDLE_MS;
  }

  // days[] holds full-day counts for the days on a page; the boundary day repeats on the next page.
  function mergeMemoryDays(current, incoming) {
    const counts = new Map(current.map((day) => [day.day, day.count]));
    incoming.forEach((day) => counts.set(day.day, Number(day.count) || 0));
    return Array.from(counts, (entry) => ({ day: entry[0], count: entry[1] })).sort((left, right) => (left.day < right.day ? 1 : left.day > right.day ? -1 : 0));
  }

  // mode: "reset" loads page 1 of new filters, "more" appends the next page, "refresh" re-reads the loaded head and
  // keeps older pages behind it. Only the newest request may write state.
  async function loadMemories(mode) {
    const mem = state.memory;
    const key = memoryKey();
    // After reads were off, page 1 is the next load. A poll or load-more must not resume the old cursor.
    if (mem.readsDisabled) mode = "reset";
    if (mode !== "reset" && key !== mem.key) mode = "reset";
    if (mode === "refresh" && mem.busySeq) return;
    if (mode === "refresh" && !mem.loaded) mode = "reset";
    if (mode === "more" && (!mem.nextCursor || mem.moreSeq)) return;
    const seq = mem.seq + 1;
    mem.seq = seq;
    const loaded = mem.items.length;
    const limit = mode === "refresh" ? Math.min(MEMORY_MAX_PAGE, Math.max(MEMORY_PAGE, loaded + MEMORY_REFRESH_HEADROOM)) : MEMORY_PAGE;
    const cursor = mode === "more" ? mem.nextCursor : null;
    if (mode !== "refresh") mem.busySeq = seq;
    if (mode === "reset") {
      mem.key = key;
      mem.error = "";
      mem.stale = true;
      mem.moreSeq = 0;
      // The old cursor is bound to the old filters.
      mem.nextCursor = null;
    }
    if (mode === "more") mem.moreSeq = seq;
    renderMemory();
    try {
      const payload = await fetchJson(memoryUrl(limit, cursor));
      if (seq !== mem.seq) return;
      if (payload.disabled) {
        mem.items = [];
        mem.days = [];
        mem.stats = null;
        mem.nextCursor = null;
        mem.loaded = false;
        mem.readsDisabled = true;
        mem.error = "";
        mem.refreshFailed = false;
        // Drop rows that are already on screen. Page 1, a poll and load-more all land here.
        mem.groupNodes.clear();
        mem.rowNodes.clear();
        if (els.memoryList) els.memoryList.innerHTML = "";
        applyReadPolicyToViews({ readEnabled: false });
      } else {
        // Reads came back on this response: do not merge onto pages from before the gap.
        if (mem.readsDisabled) mode = "reset";
        mem.readsDisabled = false;
        const incoming = Array.isArray(payload.items) ? payload.items : [];
        const days = Array.isArray(payload.days) ? payload.days : [];
        if (mode === "more") {
          const seen = new Set(mem.items.map((item) => item.id));
          mem.items = mem.items.concat(incoming.filter((item) => !seen.has(item.id)));
          mem.days = mergeMemoryDays(mem.days, days);
          mem.nextCursor = payload.next_cursor || null;
        } else if (mode === "refresh" && loaded + MEMORY_REFRESH_HEADROOM > MEMORY_MAX_PAGE && incoming.length && payload.next_cursor) {
          // More rows are loaded than one request returns: the refreshed head replaces its part and the older
          // pages stay behind it, with the cursor that already points past them.
          const index = mem.items.findIndex((item) => item.id === incoming[incoming.length - 1].id);
          if (index >= 0) {
            mem.items = incoming.concat(mem.items.slice(index + 1));
            mem.days = mergeMemoryDays(mem.days, days);
          } else {
            mem.items = incoming;
            mem.days = mergeMemoryDays([], days);
            mem.nextCursor = payload.next_cursor || null;
          }
        } else {
          mem.items = incoming;
          mem.days = mergeMemoryDays([], days);
          mem.nextCursor = payload.next_cursor || null;
        }
        if (!cursor) mem.stats = payload.stats || null;
        mem.loaded = true;
        mem.refreshFailed = false;
        mem.error = "";
      }
      mem.loadedAt = Date.now();
    } catch (error) {
      if (seq !== mem.seq) return;
      if (mode === "more" && error && error.status === 400) {
        // A stale cursor: start over from page 1 under the same filters.
        void loadMemories("reset");
        return;
      }
      if (mode === "reset") {
        mem.items = [];
        mem.days = [];
        mem.stats = null;
        mem.nextCursor = null;
        mem.loaded = false;
        mem.readsDisabled = false;
        mem.error = (error && error.message) || t("memory.errorTitle");
      } else {
        mem.refreshFailed = true;
      }
    } finally {
      if (mem.busySeq === seq) mem.busySeq = 0;
      if (mem.moreSeq === seq) mem.moreSeq = 0;
      if (seq === mem.seq) {
        mem.stale = false;
        renderMemory();
      }
    }
  }

  function setMemoryFilters(patch) {
    const mem = state.memory;
    if (mem.searchTimer) {
      window.clearTimeout(mem.searchTimer);
      mem.searchTimer = 0;
    }
    // A search typed but not yet sent goes along with the new filter.
    if (!Object.prototype.hasOwnProperty.call(patch, "query") && els.memorySearchInput) {
      patch.query = els.memorySearchInput.value.trim().slice(0, 200);
    }
    Object.assign(mem, patch);
    void loadMemories("reset");
  }

  function clearMemoryFilters() {
    if (els.memorySearchInput) els.memorySearchInput.value = "";
    setMemoryFilters({ query: "", project: "", agent: "", kind: "default", source: "", range: "any", customFrom: "", customTo: "" });
  }

  function applyMemorySearch() {
    const value = els.memorySearchInput.value.trim().slice(0, 200);
    if (state.memory.searchTimer) {
      window.clearTimeout(state.memory.searchTimer);
      state.memory.searchTimer = 0;
    }
    if (value === state.memory.query) return;
    setMemoryFilters({ query: value });
  }

  function memoryKindLabel(kind) {
    const entry = MEMORY_KINDS.find((item) => item[0] === kind);
    return entry ? t(entry[1]) : kind;
  }

  function memorySourceName(source) {
    const entry = MEMORY_SOURCES.find((item) => item[0] === source);
    return entry ? t(entry[1]) : source;
  }

  // Project and agent lists come from the 5 s overview.
  function memoryFacetValues(name) {
    const mem = state.memory;
    const raw = state.overview && Array.isArray(state.overview[name === "project" ? "projects" : "agents"]) ? state.overview[name === "project" ? "projects" : "agents"] : [];
    const values = raw.map((value) => (typeof value === "string" ? value : String(value && (value.project_path || value.agent_id || value.name) || ""))).filter(Boolean);
    const selected = name === "project" ? mem.project : mem.agent;
    if (selected && !values.some((value) => isActivitySelected(value, selected))) values.push(selected);
    const label = (value) => (name === "project" ? projectBasename(value) : value);
    return values.sort((left, right) => label(left).localeCompare(label(right))).map((value) => ({ value, label: label(value), title: name === "project" ? value : "" }));
  }

  function memoryMenuOptions(name) {
    const mem = state.memory;
    if (name === "project") return [{ value: "", label: t("memory.allProjects") }].concat(memoryFacetValues("project"));
    if (name === "agent") return [{ value: "", label: t("memory.allAgents") }].concat(memoryFacetValues("agent"));
    if (name === "kind") return MEMORY_KINDS.map((item) => ({ value: item[0], label: t(item[1]), dot: item[0] === "outcome" || item[0] === "context" || item[0] === "legacy" ? item[0] : "" }));
    return MEMORY_SOURCES.map((item) => ({ value: item[0], label: t(item[1]) }));
  }

  function renderMemoryMenu(name, popover) {
    const mem = state.memory;
    const options = memoryMenuOptions(name);
    const selected = mem[name];
    const signature = [state.locale, selected, JSON.stringify(options)].join("|");
    if (mem.signatures["menu-" + name] === signature) return;
    mem.signatures["menu-" + name] = signature;
    const focused = popover.contains(document.activeElement) ? document.activeElement.getAttribute("data-memory-value") : null;
    popover.innerHTML = options.map((option, index) => {
      const isSelected = name === "project" || name === "agent" ? (option.value ? isActivitySelected(option.value, selected) : !selected) : option.value === selected;
      return (index === 1 ? '<div class="actMenuSep" aria-hidden="true"></div>' : '') +
        '<button class="actOption" type="button" role="option" tabindex="-1" data-memory-option="' + name + '" data-memory-value="' + escapeHtml(option.value) + '" aria-selected="' + isSelected + '"' +
        (option.title ? ' title="' + escapeHtml(option.title) + '"' : '') + '>' + svgIcon("check", "actOptionCheck") +
        (option.dot ? '<span class="memOptDot kind-' + option.dot + '" aria-hidden="true"></span>' : '') +
        '<span class="actOptionName">' + escapeHtml(option.label) + '</span></button>';
    }).join("");
    if (focused !== null) {
      const target = Array.from(popover.querySelectorAll("[data-memory-value]")).find((node) => node.getAttribute("data-memory-value") === focused);
      if (target) target.focus();
    }
  }

  function renderMemoryMenus() {
    if (!els.memoryView) return;
    renderMemoryMenu("project", els.memoryProjectPopover);
    renderMemoryMenu("agent", els.memoryAgentPopover);
    renderMemoryMenu("kind", els.memoryKindPopover);
    renderMemoryMenu("source", els.memorySourcePopover);
    const parts = getMemoryPopoverParts(state.memory.openPopover);
    if (parts) placeViewPopover(els.memoryView, parts[0], parts[1]);
  }

  function renderMemoryToolbar() {
    const mem = state.memory;
    els.memoryRangeButtons.forEach((button) => {
      setAttr(button, "aria-pressed", button.getAttribute("data-memory-range") === mem.range ? "true" : "false");
    });
    // A custom range names its days on the segment itself.
    const range = getMemoryRange();
    let customText = t("memory.rangeCustom");
    if (mem.range === "custom" && range.from && range.to) {
      const format = (date) => formatShortDate(date);
      const last = shiftDays(range.to, -1);
      customText = localDayKey(range.from) === localDayKey(last) ? format(last) : format(range.from) + (state.locale === "zh-CN" ? "–" : " – ") + format(last);
    }
    setText(els.memoryRangeCustom, customText);
    const popup = (button, valueEl, value, text, title) => {
      setText(valueEl, text);
      setAttr(button, "title", title || "");
      setClass(button, "actPopup" + (value ? " is-filtered" : ""));
    };
    popup(els.memoryProjectButton, els.memoryProjectValue, mem.project, mem.project ? projectBasename(mem.project) : t("memory.all"), mem.project);
    popup(els.memoryAgentButton, els.memoryAgentValue, mem.agent, mem.agent || t("memory.all"), mem.agent);
    popup(els.memoryKindButton, els.memoryKindValue, mem.kind !== "default",
      mem.kind === "default" ? t("memory.all") : mem.kind === "all" ? t("memory.kindEverythingShort") : memoryKindLabel(mem.kind), memoryKindLabel(mem.kind));
    popup(els.memorySourceButton, els.memorySourceValue, mem.source, mem.source ? memorySourceName(mem.source) : t("memory.all"), "");
    const input = els.memorySearchInput;
    if (input && document.activeElement !== input && !mem.searchTimer && input.value.trim() !== mem.query) input.value = mem.query;
    setHidden(els.memorySearchClear, !(input && input.value));
  }

  function renderMemorySummary() {
    const mem = state.memory;
    const stats = mem.stats;
    setHidden(els.memorySummary, mem.readsDisabled || (!mem.loaded && !!mem.error));
    const total = Number(stats && stats.total || 0);
    const kinds = stats && stats.kinds || {};
    const signature = [state.locale, mem.kind, JSON.stringify(stats ? [stats.total, kinds] : null)].join("|");
    if (mem.signatures.summary !== signature) {
      mem.signatures.summary = signature;
      els.memorySumTotal.innerHTML = richCount(stats && total === 1 ? "memory.sumMemory" : "memory.sumMemories", stats ? formatCount(total) : "—");
      els.memorySumKinds.forEach((button) => {
        const kind = button.getAttribute("data-memory-sum-kind");
        const key = kind === "outcome" ? "memory.sumOutcome" : kind === "context" ? "memory.sumContext" : "memory.sumLegacy";
        button.querySelector(".memSumText").innerHTML = richCount(key, stats ? formatCount(kinds[kind]) : "—");
        const pressed = mem.kind === kind;
        setAttr(button, "aria-pressed", pressed ? "true" : "false");
        setAttr(button, "title", pressed ? t("memory.sumShowDefault") : t("memory.sumShowOnly", { kind: memoryKindLabel(kind) }));
      });
    }
    const updated = mem.refreshFailed
      ? t("memory.refreshFailed", { time: formatClock(new Date()) })
      : mem.loaded && mem.loadedAt ? t("memory.updated", { time: formatClock(new Date(mem.loadedAt)) }) : "";
    setText(els.memoryUpdated, updated);
    setClass(els.memoryUpdated, "memUpdated" + (mem.refreshFailed ? " is-warn" : ""));
  }

  // Top five projects as one proportional bar; the remainder is a quiet "Other" sliver when no project is picked.
  function renderMemoryTopProjects() {
    const mem = state.memory;
    const stats = mem.stats;
    const rows = stats && Array.isArray(stats.top_projects) ? stats.top_projects.filter((row) => Number(row.count) > 0).slice(0, 5) : [];
    setHidden(els.memoryTopProjects, mem.readsDisabled || !rows.length);
    if (!rows.length) return;
    const sum = rows.reduce((total, row) => total + Number(row.count), 0);
    const other = mem.project ? 0 : Math.max(0, Number(stats.total || 0) - sum);
    const signature = [state.locale, mem.project, JSON.stringify(rows), other].join("|");
    if (mem.signatures.top === signature) return;
    mem.signatures.top = signature;
    const segments = rows.map((row, index) => {
      const pressed = isActivitySelected(row.project_path, mem.project);
      const name = projectBasename(row.project_path);
      return '<button class="memTopSeg' + (mem.project && !pressed ? ' is-dim' : '') + '" type="button" data-memory-top="' + escapeHtml(row.project_path) + '" data-rank="' + index + '" aria-pressed="' + pressed + '"' +
        ' style="flex-grow:' + Number(row.count) + '" title="' + escapeHtml(t("memory.topProjectHint", { name: row.project_path, n: formatCount(row.count) })) + '">' +
        '<span class="memTopFill" aria-hidden="true"></span>' +
        '<span class="memTopLegend"><span class="memTopDot" aria-hidden="true"></span><span class="memTopName">' + escapeHtml(name) + '</span>' +
        '<span class="memTopCount">' + escapeHtml(formatCount(row.count)) + '</span></span></button>';
    }).join("");
    els.memoryTopBar.innerHTML = segments + (other > 0
      ? '<span class="memTopSeg is-other" style="flex-grow:' + other + '" title="' + escapeHtml(t("memory.topProjectHint", { name: t("memory.topOther"), n: formatCount(other) })) + '"><span class="memTopFill" aria-hidden="true"></span></span>'
      : '');
  }

  function memoryDayLabel(dayKey) {
    const date = parseLocalDay(dayKey);
    if (!date) return { name: dayKey, date: "" };
    const ago = calendarDaysAgo(date);
    const withYear = date.getFullYear() !== new Date().getFullYear();
    const full = date.toLocaleDateString(state.locale, { weekday: "short", month: "short", day: "numeric", year: withYear ? "numeric" : undefined });
    if (ago === 0) return { name: t("home.today"), date: full };
    if (ago === 1) return { name: t("home.yesterday"), date: full };
    return {
      name: date.toLocaleDateString(state.locale, { month: "short", day: "numeric", year: withYear ? "numeric" : undefined }),
      date: date.toLocaleDateString(state.locale, { weekday: "long" }),
    };
  }

  function renderMemoryRowBody(item) {
    const created = parseTimestamp(item.created_at);
    const kind = item.kind === "outcome" || item.kind === "context" ? item.kind : "legacy";
    const badges = [];
    if (item.source === "explicit") badges.push('<span class="actBadge is-mcp" title="' + escapeHtml(t("memory.mcpHint")) + '">' + escapeHtml(t("memory.mcp")) + '</span>');
    if (item.fallback) badges.push('<span class="actBadge is-fallback" title="' + escapeHtml(t("memory.fallbackHint")) + '">' + escapeHtml(t("memory.fallback")) + '</span>');
    if (item.has_review) badges.push('<span class="actReview" role="img" aria-label="' + escapeHtml(t("memory.reviewHint")) + '" title="' + escapeHtml(t("memory.reviewHint")) + '">' + svgIcon("review", "actMetaIcon") + '</span>');
    const title = String(item.title || "").trim();
    const preview = String(item.preview || "").trim();
    const facts = Number(item.facts_count || 0);
    const files = Number(item.files_count || 0);
    const factsHint = t(facts === 1 ? "memory.factsHintOne" : "memory.factsHint", { n: formatCount(facts) });
    const filesHint = t(files === 1 ? "memory.filesHintOne" : "memory.filesHint", { n: formatCount(files), m: formatCount(item.files_modified_count) });
    return '<time class="memCell memTime" datetime="' + escapeHtml(created ? created.toISOString() : "") + '" title="' + escapeHtml(created ? created.toLocaleString(state.locale) : "") + '">' + escapeHtml(created ? formatClock(created) : "—") + '</time>' +
      '<span class="memCell memKind"><span class="kindPill kind-' + kind + '">' + escapeHtml(memoryKindLabel(kind)) + '</span></span>' +
      '<span class="memCell memMain"><span class="memTitleLine"><span class="memTitle"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + escapeHtml(title || t("memory.untitled")) + '</span>' + badges.join("") + '</span>' +
        (preview ? '<span class="memPreview">' + escapeHtml(preview + (item.preview_truncated ? " …" : "")) + '</span>' : '') + '</span>' +
      '<span class="memCell memProject" title="' + escapeHtml(item.project_path || "") + '">' + escapeHtml(projectBasename(item.project_path) || "—") + '</span>' +
      '<span class="memCell memAgent">' + escapeHtml(item.agent_id || "—") + '</span>' +
      '<span class="memCell memNum' + (facts ? '' : ' is-zero') + '" role="img" aria-label="' + escapeHtml(factsHint) + '" title="' + escapeHtml(factsHint) + '">' + svgIcon("facts", "memNumIcon") + escapeHtml(formatCount(facts)) + '</span>' +
      '<span class="memCell memNum' + (files ? '' : ' is-zero') + '" role="img" aria-label="' + escapeHtml(filesHint) + '" title="' + escapeHtml(filesHint) + '">' + svgIcon("file", "memNumIcon") + escapeHtml(formatCount(files)) + '</span>';
  }

  // Keyed reconcile, as on Activity: one node per memory id, rewritten only when its fields or the locale change.
  function syncMemoryRows(container, items) {
    const nodes = state.memory.rowNodes;
    let cursor = container.firstElementChild;
    items.forEach((item) => {
      let entry = nodes.get(item.id);
      if (!entry) {
        const node = document.createElement("article");
        node.className = "memRow";
        node.setAttribute("data-memory-id", item.id);
        node.setAttribute("tabindex", "0");
        node.setAttribute("aria-haspopup", "dialog");
        entry = { node, signature: "" };
        nodes.set(item.id, entry);
      }
      entry.node.classList.toggle("is-open", state.drawer.id === item.id);
      setAttr(entry.node, "aria-expanded", state.drawer.id === item.id ? "true" : "false");
      const signature = state.locale + "|" + JSON.stringify(item);
      if (entry.signature !== signature) {
        entry.signature = signature;
        entry.node.innerHTML = renderMemoryRowBody(item);
      }
      if (entry.node === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        container.insertBefore(entry.node, cursor);
      }
    });
    while (cursor) {
      const next = cursor.nextElementSibling;
      cursor.remove();
      cursor = next;
    }
  }

  function renderMemoryNotice() {
    const mem = state.memory;
    let notice = null;
    if (mem.readsDisabled) {
      notice = { tone: "", title: t("memory.readsDisabledTitle"), lead: t("memory.readsDisabledLead"), action: null };
    } else if (!mem.loaded && mem.error) {
      notice = { tone: " is-error", title: t("memory.errorTitle"), lead: mem.error, action: ["retry", t("memory.retry")] };
    } else if (mem.loaded && !mem.stale && !mem.items.length) {
      notice = isMemoryFiltered()
        ? { tone: "", title: t("memory.noResultsTitle"), lead: mem.query ? t("memory.noResultsQuery", { query: mem.query }) : t("memory.noResultsLead"), action: ["clear", t("memory.clearFilters")] }
        : { tone: "", title: t("memory.emptyTitle"), lead: t("memory.emptyLead"), action: null };
    }
    setHidden(els.memoryNotice, !notice);
    if (notice) {
      setClass(els.memoryNotice, "actNotice memNotice glassCard glassBlur" + notice.tone);
      setText(els.memoryNoticeTitle, notice.title);
      setText(els.memoryNoticeLead, notice.lead);
      setHidden(els.memoryNoticeAction, !notice.action);
      setAttr(els.memoryNoticeAction, "data-memory-action", notice.action ? notice.action[0] : null);
      setText(els.memoryNoticeAction, notice.action ? notice.action[1] : "");
    }
    return !!notice;
  }

  function renderMemoryList() {
    const mem = state.memory;
    const list = els.memoryList;
    // Clear before the notice early-return, so a disabled payload cannot leave the previous rows up.
    if (mem.readsDisabled && list) {
      list.innerHTML = "";
      mem.groupNodes.clear();
      mem.rowNodes.clear();
    }
    const noticed = renderMemoryNotice();
    setHidden(list, noticed);
    setHidden(els.memoryListHead, noticed);
    setAttr(list, "aria-busy", mem.stale || !mem.loaded ? "true" : "false");
    list.classList.toggle("is-stale", mem.stale && mem.items.length > 0);
    setHidden(els.memoryLoadMore, noticed || !mem.nextCursor);
    setText(els.memoryLoadMore, t(mem.moreSeq ? "memory.loadingMore" : "memory.loadMore"));
    setAttr(els.memoryLoadMore, "aria-busy", mem.moreSeq ? "true" : null);
    if (noticed) return;
    if (!mem.items.length) {
      // First load or a reload of an empty list: skeleton rows.
      if (!list.querySelector(".is-skeleton")) {
        list.innerHTML = MEMORY_SKELETON;
        mem.groupNodes.clear();
        mem.rowNodes.clear();
      }
      return;
    }
    const skeleton = list.querySelector(".memGroup.is-skeleton");
    if (skeleton) skeleton.remove();
    const order = [];
    const byDay = new Map();
    mem.items.forEach((item) => {
      const created = parseTimestamp(item.created_at);
      const day = item.day || (created ? localDayKey(created) : "");
      if (!byDay.has(day)) {
        byDay.set(day, []);
        order.push(day);
      }
      byDay.get(day).push(item);
    });
    const counts = new Map(mem.days.map((day) => [day.day, day.count]));
    const visible = new Set();
    let cursor = list.firstElementChild;
    order.forEach((day) => {
      let group = mem.groupNodes.get(day);
      if (!group) {
        const node = document.createElement("section");
        node.className = "memGroup";
        node.innerHTML = '<h3 class="memDayHead"></h3><div class="memRows"></div>';
        group = { node, head: node.firstElementChild, rows: node.lastElementChild, signature: "" };
        mem.groupNodes.set(day, group);
      }
      const label = memoryDayLabel(day);
      const count = counts.has(day) ? counts.get(day) : byDay.get(day).length;
      const signature = [state.locale, label.name, label.date, count].join("|");
      if (group.signature !== signature) {
        group.signature = signature;
        group.head.innerHTML = '<span class="memDayName">' + escapeHtml(label.name) + '</span>' +
          (label.date ? '<span class="memDayDate">' + escapeHtml(label.date) + '</span>' : '') +
          '<span class="memDayCount">' + escapeHtml(t("memory.dayCount", { n: formatCount(count) })) + '</span>';
      }
      syncMemoryRows(group.rows, byDay.get(day));
      byDay.get(day).forEach((item) => visible.add(item.id));
      if (group.node === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        list.insertBefore(group.node, cursor);
      }
    });
    while (cursor) {
      const next = cursor.nextElementSibling;
      cursor.remove();
      cursor = next;
    }
    mem.groupNodes.forEach((_group, day) => {
      if (!byDay.has(day)) mem.groupNodes.delete(day);
    });
    mem.rowNodes.forEach((_entry, id) => {
      if (!visible.has(id)) mem.rowNodes.delete(id);
    });
  }

  function renderMemory() {
    if (!els.memoryView) return;
    renderMemoryToolbar();
    renderMemorySummary();
    renderMemoryTopProjects();
    renderMemoryMenus();
    renderMemoryList();
    if (state.drawer.host === "memoryView") renderMemoryDrawer();
    placeMemoryDrawer();
  }

  function getMemoryPopoverParts(name) {
    if (name === "project") return [els.memoryProjectPopover, els.memoryProjectButton];
    if (name === "agent") return [els.memoryAgentPopover, els.memoryAgentButton];
    if (name === "kind") return [els.memoryKindPopover, els.memoryKindButton];
    if (name === "source") return [els.memorySourcePopover, els.memorySourceButton];
    if (name === "custom") return [els.memoryCustomPopover, els.memoryRangeCustom];
    return null;
  }

  function setMemoryPopover(name) {
    if (!els.memoryView) return;
    const mem = state.memory;
    mem.openPopover = getMemoryPopoverParts(name) ? name : "";
    ["project", "agent", "kind", "source", "custom"].forEach((key) => {
      const parts = getMemoryPopoverParts(key);
      const open = key === mem.openPopover;
      setHidden(parts[0], !open);
      setAttr(parts[1], "aria-expanded", open ? "true" : "false");
      if (open) placeViewPopover(els.memoryView, parts[0], parts[1]);
    });
  }

  function closeMemoryPopover(restoreFocus) {
    const parts = getMemoryPopoverParts(state.memory.openPopover);
    setMemoryPopover("");
    if (parts && restoreFocus) parts[1].focus();
  }

  function openMemoryMenu(name) {
    if (state.memory.openPopover === name) {
      closeMemoryPopover(false);
      return;
    }
    setMemoryPopover(name);
    const popover = getMemoryPopoverParts(name)[0];
    const target = popover.querySelector('[aria-selected="true"]') || popover.querySelector(".actOption");
    if (target) target.focus();
  }

  function openMemoryCustom() {
    if (state.memory.openPopover === "custom") {
      closeMemoryPopover(false);
      return;
    }
    const mem = state.memory;
    const today = localDayKey(new Date());
    els.memoryCustomFrom.value = mem.customFrom || localDayKey(shiftDays(new Date(), -6));
    els.memoryCustomTo.value = mem.customTo || today;
    els.memoryCustomFrom.max = today;
    els.memoryCustomTo.max = today;
    setHidden(els.memoryCustomError, true);
    setMemoryPopover("custom");
    els.memoryCustomFrom.focus();
  }

  function applyMemoryCustomRange() {
    const from = els.memoryCustomFrom.value;
    const to = els.memoryCustomTo.value;
    const start = parseLocalDay(from);
    const end = parseLocalDay(to);
    const error = !start || !end ? t("memory.customMissing") : start > end ? t("memory.customOrder") : "";
    if (error) {
      setText(els.memoryCustomError, error);
      setHidden(els.memoryCustomError, false);
      return;
    }
    closeMemoryPopover(true);
    setMemoryFilters({ range: "custom", customFrom: from, customTo: to });
  }

  function bindMemoryEvents() {
    if (!els.memoryView) return;
    els.memoryView.addEventListener("click", (event) => {
      const mem = state.memory;
      if (els.activityDrawer.contains(event.target)) return;
      const row = event.target.closest(".memRow[data-memory-id]");
      if (row) {
        const id = row.getAttribute("data-memory-id");
        // The open row closes the drawer again; any other row swaps its content.
        if (state.drawer.id === id) closeMemoryDrawer(false);
        else void openMemoryDrawer(id, row, "memoryView");
        return;
      }
      const range = event.target.closest("[data-memory-range]");
      if (range) {
        const value = range.getAttribute("data-memory-range");
        if (value === "custom") {
          openMemoryCustom();
        } else {
          setMemoryPopover("");
          if (value !== mem.range) setMemoryFilters({ range: value });
        }
        return;
      }
      const popup = event.target.closest("#memoryProjectButton, #memoryAgentButton, #memoryKindButton, #memorySourceButton");
      if (popup) {
        openMemoryMenu(popup.id.replace("memory", "").replace("Button", "").toLowerCase());
        return;
      }
      const option = event.target.closest("[data-memory-option]");
      if (option) {
        const name = option.getAttribute("data-memory-option");
        closeMemoryPopover(true);
        setMemoryFilters({ [name]: option.getAttribute("data-memory-value") || (name === "kind" ? "default" : "") });
        return;
      }
      const top = event.target.closest("[data-memory-top]");
      if (top) {
        const value = top.getAttribute("data-memory-top");
        setMemoryFilters({ project: isActivitySelected(value, mem.project) ? "" : value });
        return;
      }
      const sumKind = event.target.closest("[data-memory-sum-kind]");
      if (sumKind) {
        const kind = sumKind.getAttribute("data-memory-sum-kind");
        setMemoryFilters({ kind: mem.kind === kind ? "default" : kind });
        return;
      }
      if (event.target.closest("#memorySearchClear")) {
        els.memorySearchInput.value = "";
        applyMemorySearch();
        renderMemoryToolbar();
        els.memorySearchInput.focus();
        return;
      }
      if (event.target.closest("#memoryLoadMore")) {
        void loadMemories("more");
        return;
      }
      const action = event.target.closest("[data-memory-action]");
      if (action) {
        if (action.getAttribute("data-memory-action") === "clear") clearMemoryFilters();
        else void loadMemories("reset");
        return;
      }
      if (event.target.closest("#memoryCustomApply")) {
        applyMemoryCustomRange();
        return;
      }
      if (event.target.closest("#memoryCustomCancel")) closeMemoryPopover(true);
    });

    els.memoryView.addEventListener("keydown", (event) => {
      if (els.activityDrawer.contains(event.target)) return;
      if ((event.key === "Enter" || event.key === " ") && event.target.matches(".memRow[data-memory-id]")) {
        event.preventDefault();
        event.target.click();
        return;
      }
      const open = state.memory.openPopover;
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMemoryPopover(true);
        return;
      }
      if (open === "custom") {
        if (event.key === "Enter" && event.target.matches(".actDateInput")) {
          event.preventDefault();
          applyMemoryCustomRange();
        }
        return;
      }
      const options = Array.from(getMemoryPopoverParts(open)[0].querySelectorAll(".actOption"));
      const index = options.indexOf(document.activeElement);
      let next = -1;
      if (event.key === "ArrowDown") next = Math.min(options.length - 1, index + 1);
      else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Tab") {
        event.preventDefault();
        closeMemoryPopover(true);
        return;
      }
      if (next >= 0 && options[next]) {
        event.preventDefault();
        options[next].focus();
      }
    });

    const input = els.memorySearchInput;
    input.addEventListener("input", () => {
      const mem = state.memory;
      setHidden(els.memorySearchClear, !input.value);
      if (mem.searchTimer) window.clearTimeout(mem.searchTimer);
      mem.searchTimer = window.setTimeout(() => {
        mem.searchTimer = 0;
        applyMemorySearch();
      }, MEMORY_SEARCH_DELAY_MS);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyMemorySearch();
      } else if (event.key === "Escape" && input.value) {
        event.preventDefault();
        event.stopPropagation();
        input.value = "";
        applyMemorySearch();
        renderMemoryToolbar();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      const parts = getMemoryPopoverParts(state.memory.openPopover);
      if (!parts || parts[0].contains(event.target) || parts[1].contains(event.target)) return;
      setMemoryPopover("");
    });
    window.addEventListener("resize", () => {
      if (state.memory.openPopover) setMemoryPopover("");
      scheduleMemoryDrawerPlace();
    });
    window.addEventListener("scroll", () => {
      if (state.activeView !== "memoryView") return;
      state.memory.lastScrollAt = Date.now();
      scheduleMemoryDrawerPlace();
    }, { passive: true });
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

  // The Memory poll does not run while a filter, a pending search or the drawer is open, so a read
  // switch has to clear those views itself. Bumping the seqs drops an in-flight list or detail response.
  function applyReadPolicyToViews(policy) {
    if (!policy) return;
    const mem = state.memory;
    const early = state.activity.earlier;
    const drawer = state.drawer;
    if (policy.readEnabled) {
      if (!mem.readsDisabled && !early.readsDisabled && !drawer.readsDisabled) return;
      mem.readsDisabled = false;
      early.readsDisabled = false;
      early.message = "";
      early.payload = null;
      early.loadedAt = 0;
      early.key = "";
      early.loading = false;
      early.seq += 1;
      const refreshDrawer = !!drawer.id && drawer.readsDisabled;
      drawer.readsDisabled = false;
      if (state.activeView === "memoryView") void loadMemories("reset");
      if (state.activeView === "activityView") void loadActivityEarlier(true);
      if (refreshDrawer) void openMemoryDrawer(drawer.id, null, drawer.host);
      return;
    }
    if (mem.readsDisabled && mem.items.length === 0 && !mem.nextCursor && !drawer.payload && (!drawer.id || drawer.readsDisabled) && early.payload === null && early.key === "" && !early.loadedAt && early.readsDisabled) return;
    mem.items = [];
    mem.days = [];
    mem.stats = null;
    mem.nextCursor = null;
    mem.loaded = false;
    mem.error = "";
    mem.refreshFailed = false;
    mem.stale = false;
    mem.readsDisabled = true;
    mem.groupNodes.clear();
    mem.rowNodes.clear();
    mem.busySeq = 0;
    mem.moreSeq = 0;
    mem.seq += 1;
    if (els.memoryList) els.memoryList.innerHTML = "";
    drawer.payload = null;
    drawer.error = "";
    drawer.missing = false;
    drawer.copied = false;
    drawer.signature = "";
    drawer.seq += 1;
    if (drawer.id) drawer.readsDisabled = true;
    early.payload = null;
    early.loadedAt = 0;
    early.key = "";
    early.loading = false;
    early.error = "";
    early.readsDisabled = true;
    early.seq += 1;
    renderMemory();
    renderActivityEarlier();
    if (drawer.id) renderMemoryDrawer();
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
      applyReadPolicyToViews(payload.policy);
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
    applyBackdrop();
    renderBackgroundControls();
    if (persist) persistBackground();
  }

  // Activity and Memory have their own default backdrop (artwork, light or dark with the system). It shows while the
  // user has not picked a preset or image and the tone is Auto; any explicit choice wins everywhere.
  function usesActivityBackdrop() {
    const settings = bg.settings;
    return (state.activeView === "activityView" || state.activeView === "memoryView") && !!settings && !settings.pinned &&
      settings.preset === bg.api.defaults.preset && settings.tone === "auto";
  }

  function applyBackdrop() {
    if (!bg.api || !bg.settings) return;
    bg.api.apply(bg.settings);
    const root = document.documentElement;
    if (!usesActivityBackdrop()) {
      if (root.hasAttribute("data-act-bg")) root.removeAttribute("data-act-bg");
      return;
    }
    const scheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.setAttribute("data-act-bg", scheme);
    root.setAttribute("data-glass", scheme);
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
      updateBackground({ preset: bg.api.defaults.preset, pinned: false }, true);
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
    updateBackground({ preset: "custom", customLuma: prepared.luma, customColor: prepared.color, pinned: true }, true);
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
    applyBackdrop();
    renderBackgroundControls();
    void loadStoredWallpaper();
  }

  function bindBackgroundEvents() {
    if (!bg.api || !els.bgPopover) return;
    const schemeQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (schemeQuery && schemeQuery.addEventListener) schemeQuery.addEventListener("change", applyBackdrop);
    els.bgPickerButton.addEventListener("click", () => setBackgroundPickerOpen(!bg.open, false));
    els.bgPopoverClose.addEventListener("click", () => setBackgroundPickerOpen(false, true));
    els.bgDoneButton.addEventListener("click", () => setBackgroundPickerOpen(false, true));
    els.bgPresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.getAttribute("data-bg-preset");
        if (preset === "custom" && !bg.customAvailable) return;
        updateBackground({ preset, pinned: true }, true);
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
      updateBackground({ preset: defaults.preset, tone: defaults.tone, blur: defaults.blur, dim: defaults.dim, opacity: defaults.opacity, pinned: false }, true);
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
    applyBackdrop();
    if (nextView === "homeView") {
      void refreshHomeData(false);
    }
    if (nextView === "activityView") {
      void loadActivity(state.activity.payload ? "refresh" : "reset");
      void loadActivityEarlier(false);
      window.requestAnimationFrame(() => {
        updateActivityChipsOverflow();
        fitActivityEarlierPanel();
      });
    } else if (state.activity.openPopover) {
      setActivityPopover("");
    }
    if (nextView === "memoryView") {
      void loadMemories(state.memory.loaded ? "refresh" : "reset");
    } else if (state.memory.openPopover) {
      setMemoryPopover("");
    }
    if (state.drawer.id && state.drawer.host !== nextView) closeMemoryDrawer(false);
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

  // Midnight moves Today and Yesterday. Reload the columns and the Earlier list once; a custom range stays put.
  async function reloadActivityWindow() {
    anchorActivityEarlier();
    await loadActivity("reset");
    await loadActivityEarlier(true);
  }

  async function pollVisibleView() {
    let overviewOk = true;
    try {
      await loadOverview();
    } catch (error) {
      // The Worker card and the attention list already show the failed poll.
      overviewOk = false;
    }
    // Activity follows the 5 s poll only while its window includes today; past windows cannot change.
    // Today and Yesterday are the exception at midnight: the local date moved, so reload that window.
    if (state.activeView === "activityView") {
      if (activityWindowStale()) {
        await reloadActivityWindow();
        return;
      }
      if (activityIncludesToday(getActivityWindow())) await loadActivity("refresh");
      return;
    }
    if (state.activeView === "memoryView") {
      renderMemoryMenus();
      if (memoryCanPoll()) await loadMemories("refresh");
      return;
    }
    if (!overviewOk) return;
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
        setLocaleMenuOpen(false, true);
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
      // Activity's search button lands in the Memory search field.
      const focusTarget = document.getElementById(trigger.getAttribute("data-focus-target") || "");
      if (focusTarget) focusTarget.focus({ preventScroll: true });
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
    bindLocaleMenu();
    bindActivityEvents();
    bindMemoryEvents();
    bindMemoryDrawerEvents();
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
