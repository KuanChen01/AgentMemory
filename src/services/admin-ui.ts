export function renderAdminPageHtml(pollIntervalMs: number = 5000): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentMemory Console</title>
  <style>
    :root {
      --bg: #f5efe4;
      --panel: rgba(255, 255, 255, 0.84);
      --panel-solid: #fffdf8;
      --ink: #1d2a22;
      --muted: #617066;
      --line: rgba(29, 42, 34, 0.12);
      --accent: #b86138;
      --accent-soft: rgba(184, 97, 56, 0.14);
      --success: #386b53;
      --danger: #a5483d;
      --shadow: 0 20px 50px rgba(47, 35, 16, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(184, 97, 56, 0.14), transparent 26%),
        radial-gradient(circle at bottom right, rgba(56, 107, 83, 0.16), transparent 30%),
        linear-gradient(180deg, #f7f2e9, var(--bg));
    }

    .shell {
      max-width: 1380px;
      margin: 0 auto;
      padding: 28px;
    }

    .hero,
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 26px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .hero {
      display: grid;
      gap: 22px;
      padding: 24px;
    }

    .heroHeader {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: start;
    }

    .eyebrow {
      display: inline-flex;
      padding: 6px 11px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h1 {
      margin: 14px 0 8px;
      font-size: 34px;
      line-height: 1.1;
    }

    .lead,
    .statusText,
    .cardLabel,
    .subtle,
    .empty,
    .meta,
    .listMeta {
      color: var(--muted);
    }

    .lead {
      margin: 0;
      max-width: 720px;
      line-height: 1.6;
    }

    .statusText {
      font-weight: 700;
      line-height: 1.5;
    }

    .statusText.saving {
      color: var(--accent);
    }

    .heroMeta {
      min-width: 220px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.75);
    }

    .heroMeta strong {
      display: block;
      margin-bottom: 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .statCard {
      padding: 16px 18px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: var(--panel-solid);
    }

    .statValue {
      margin-top: 10px;
      font-size: 30px;
      font-weight: 700;
      line-height: 1;
    }

    .policyRow {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .policyCard {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: center;
      padding: 18px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: var(--panel-solid);
      transition: 220ms ease;
    }

    .policyCard.readPolicy.is-enabled {
      border-color: rgba(184, 97, 56, 0.34);
      background: linear-gradient(180deg, rgba(184, 97, 56, 0.12), rgba(255, 253, 248, 0.95));
      box-shadow: inset 0 0 0 1px rgba(184, 97, 56, 0.12);
    }

    .policyCard.writePolicy.is-enabled {
      border-color: rgba(56, 107, 83, 0.3);
      background: linear-gradient(180deg, rgba(56, 107, 83, 0.12), rgba(255, 253, 248, 0.95));
      box-shadow: inset 0 0 0 1px rgba(56, 107, 83, 0.12);
    }

    .policyCard.is-disabled {
      border-color: rgba(97, 112, 102, 0.18);
      background: linear-gradient(180deg, rgba(97, 112, 102, 0.08), rgba(255, 253, 248, 0.95));
    }

    .policyCard.is-saving {
      box-shadow:
        var(--shadow),
        inset 0 0 0 1px rgba(184, 97, 56, 0.18);
      animation: policyPulse 1.1s ease-in-out infinite;
    }

    .policyBody {
      min-width: 0;
    }

    .policyHeader {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .policyTitle {
      margin: 0 0 6px;
      font-size: 18px;
    }

    .policyStateBadge {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border: 1px solid transparent;
      transition: 220ms ease;
    }

    .policyStateBadge.enabled {
      background: rgba(56, 107, 83, 0.12);
      color: var(--success);
      border-color: rgba(56, 107, 83, 0.18);
    }

    .policyStateBadge.disabled {
      background: rgba(165, 72, 61, 0.12);
      color: var(--danger);
      border-color: rgba(165, 72, 61, 0.18);
    }

    .policyStateBadge.saving {
      background: rgba(184, 97, 56, 0.14);
      color: var(--accent);
      border-color: rgba(184, 97, 56, 0.18);
    }

    .policyMeta {
      margin-top: 10px;
      min-height: 20px;
      font-size: 13px;
      color: var(--muted);
    }

    .switch {
      position: relative;
      width: 60px;
      height: 34px;
      flex: 0 0 auto;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    .slider {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: #cfd8d1;
      transition: 220ms cubic-bezier(0.22, 1, 0.36, 1);
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(29, 42, 34, 0.08);
    }

    .slider::before {
      content: "";
      position: absolute;
      top: 4px;
      left: 4px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
      transition: 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .switch input:checked + .slider {
      background: rgba(56, 107, 83, 0.62);
    }

    .switch input:checked + .slider::before {
      transform: translateX(26px);
    }

    .switch input:disabled + .slider {
      cursor: wait;
      opacity: 0.78;
    }

    .switch input:disabled + .slider::before {
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(320px, 1fr) minmax(320px, 420px);
      gap: 20px;
      margin-top: 22px;
    }

    .panel {
      padding: 20px;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1.1fr 1fr 1fr auto;
      gap: 12px;
      align-items: end;
      margin-bottom: 18px;
    }

    .fieldLabel {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .textInput,
    .selectInput,
    .button {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-solid);
      padding: 12px 14px;
      font: inherit;
      color: inherit;
    }

    .button {
      cursor: pointer;
      font-weight: 600;
      transition: 150ms ease;
    }

    .button:hover {
      border-color: rgba(29, 42, 34, 0.24);
      transform: translateY(-1px);
    }

    .button.primary {
      background: var(--ink);
      color: white;
      border-color: var(--ink);
    }

    .toolbarFooter,
    .detailFooter {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }

    .recordsList {
      display: grid;
      gap: 10px;
      max-height: 680px;
      overflow: auto;
      padding-right: 4px;
    }

    .recordItem {
      width: 100%;
      text-align: left;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel-solid);
      cursor: pointer;
      transition: 150ms ease;
    }

    .recordItem:hover {
      border-color: rgba(29, 42, 34, 0.24);
      transform: translateY(-1px);
    }

    .recordItem.active {
      border-color: rgba(184, 97, 56, 0.34);
      box-shadow: inset 0 0 0 1px rgba(184, 97, 56, 0.22);
      background: rgba(255, 250, 245, 0.96);
    }

    .recordTitle {
      margin: 0 0 8px;
      font-size: 17px;
      line-height: 1.35;
    }

    .recordSummary {
      margin: 0;
      line-height: 1.5;
      color: var(--muted);
    }

    .recordMeta,
    .detailMeta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(97, 112, 102, 0.1);
      color: var(--muted);
      font-size: 12px;
    }

    .detailPanel {
      min-height: 680px;
      display: flex;
      flex-direction: column;
    }

    .detailTitle {
      margin: 0;
      font-size: 24px;
      line-height: 1.25;
    }

    .detailNarrative {
      margin: 16px 0 0;
      line-height: 1.7;
      white-space: pre-wrap;
    }

    .detailSection {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
    }

    .detailSection h3 {
      margin: 0 0 12px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .tagList {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .detailList {
      margin: 0;
      padding-left: 18px;
      line-height: 1.7;
    }

    .inlineStatus {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .inlineStatus::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--success);
    }

    .inlineStatus.error::before {
      background: var(--danger);
    }

    @keyframes policyPulse {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-1px);
      }
    }

    .empty {
      padding: 26px 18px;
      border-radius: 18px;
      border: 1px dashed var(--line);
      background: rgba(255, 255, 255, 0.54);
      text-align: center;
      line-height: 1.6;
    }

    @media (max-width: 1180px) {
      .stats,
      .policyRow,
      .workspace,
      .toolbar {
        grid-template-columns: 1fr;
      }

      .heroHeader,
      .toolbarFooter,
      .detailFooter {
        flex-direction: column;
        align-items: stretch;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="heroHeader">
        <div>
          <span class="eyebrow">AgentMemory Admin</span>
          <h1>Global Runtime Console</h1>
          <p class="lead">
            Control whether agents can read or write shared memory, while browsing the current database
            through filterable observation records and per-entry details.
          </p>
        </div>
        <div class="heroMeta">
          <strong>Current Status</strong>
          <div id="statusText" class="statusText">Loading overview...</div>
          <div id="policyUpdatedAt" class="subtle" style="margin-top: 10px;"></div>
        </div>
      </div>

      <div class="stats">
        <div class="statCard">
          <div class="cardLabel">Observations</div>
          <div id="observationsCount" class="statValue">-</div>
        </div>
        <div class="statCard">
          <div class="cardLabel">Sessions</div>
          <div id="sessionsCount" class="statValue">-</div>
        </div>
        <div class="statCard">
          <div class="cardLabel">Projects Seen</div>
          <div id="projectsCount" class="statValue">-</div>
        </div>
        <div class="statCard">
          <div class="cardLabel">Agents Seen</div>
          <div id="agentsCount" class="statValue">-</div>
        </div>
      </div>

      <div class="policyRow">
        <section id="readPolicyCard" class="policyCard readPolicy">
          <div class="policyBody">
            <div class="policyHeader">
              <h2 class="policyTitle">Read Memory</h2>
              <span id="readPolicyState" class="policyStateBadge">Loading</span>
            </div>
            <div class="subtle">Controls \`/context\`, \`/search\`, and MCP read tools.</div>
            <div id="readPolicyMeta" class="policyMeta">Loading current state...</div>
          </div>
          <label class="switch">
            <input id="readToggle" type="checkbox" />
            <span class="slider"></span>
          </label>
        </section>
        <section id="writePolicyCard" class="policyCard writePolicy">
          <div class="policyBody">
            <div class="policyHeader">
              <h2 class="policyTitle">Write Memory</h2>
              <span id="writePolicyState" class="policyStateBadge">Loading</span>
            </div>
            <div class="subtle">Controls \`/tools\`, session writes, and MCP \`record_memory\`.</div>
            <div id="writePolicyMeta" class="policyMeta">Loading current state...</div>
          </div>
          <label class="switch">
            <input id="writeToggle" type="checkbox" />
            <span class="slider"></span>
          </label>
        </section>
      </div>
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="toolbar">
          <label>
            <span class="fieldLabel">Query</span>
            <input id="queryInput" class="textInput" type="text" placeholder="Search title, narrative, files, project, agent" />
          </label>
          <label>
            <span class="fieldLabel">Project</span>
            <select id="projectSelect" class="selectInput">
              <option value="">All projects</option>
            </select>
          </label>
          <label>
            <span class="fieldLabel">Agent</span>
            <select id="agentSelect" class="selectInput">
              <option value="">All agents</option>
            </select>
          </label>
          <button id="refreshButton" class="button primary" type="button">Refresh</button>
        </div>

        <div class="toolbarFooter">
          <div id="listStatus" class="inlineStatus">Ready</div>
          <div id="listMeta" class="listMeta">Showing latest records</div>
        </div>

        <div id="recordsList" class="recordsList">
          <div class="empty">Loading observations...</div>
        </div>
      </div>

      <div class="panel detailPanel">
        <div class="detailFooter">
          <div>
            <div class="fieldLabel">Selected Observation</div>
            <h2 id="detailTitle" class="detailTitle">Choose a record</h2>
          </div>
          <div id="detailTimestamp" class="subtle"></div>
        </div>

        <div id="detailContent" class="empty">
          Select an observation from the ledger to inspect narrative, facts, concepts, and touched files.
        </div>
      </div>
    </section>
  </main>

  <script>
    const POLL_INTERVAL_MS = ${JSON.stringify(pollIntervalMs)};
    const state = {
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
      pollHandle: null,
    };

    const els = {
      observationsCount: document.getElementById("observationsCount"),
      sessionsCount: document.getElementById("sessionsCount"),
      projectsCount: document.getElementById("projectsCount"),
      agentsCount: document.getElementById("agentsCount"),
      statusText: document.getElementById("statusText"),
      policyUpdatedAt: document.getElementById("policyUpdatedAt"),
      readPolicyCard: document.getElementById("readPolicyCard"),
      writePolicyCard: document.getElementById("writePolicyCard"),
      readPolicyState: document.getElementById("readPolicyState"),
      writePolicyState: document.getElementById("writePolicyState"),
      readPolicyMeta: document.getElementById("readPolicyMeta"),
      writePolicyMeta: document.getElementById("writePolicyMeta"),
      readToggle: document.getElementById("readToggle"),
      writeToggle: document.getElementById("writeToggle"),
      queryInput: document.getElementById("queryInput"),
      projectSelect: document.getElementById("projectSelect"),
      agentSelect: document.getElementById("agentSelect"),
      refreshButton: document.getElementById("refreshButton"),
      listStatus: document.getElementById("listStatus"),
      listMeta: document.getElementById("listMeta"),
      recordsList: document.getElementById("recordsList"),
      detailTitle: document.getElementById("detailTitle"),
      detailTimestamp: document.getElementById("detailTimestamp"),
      detailContent: document.getElementById("detailContent"),
    };

    function formatDate(value) {
      if (!value) return "Unknown timestamp";
      const parsed = new Date(value.replace(" ", "T") + "Z");
      if (Number.isNaN(parsed.getTime())) return value;
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
      return normalized.length > max ? normalized.slice(0, max - 1) + "…" : normalized;
    }

    function setStatus(message, isError = false) {
      els.listStatus.textContent = message;
      els.listStatus.className = "inlineStatus" + (isError ? " error" : "");
    }

    function comparePolicyFreshness(left, right) {
      const leftStamp = String(left?.updatedAt || "");
      const rightStamp = String(right?.updatedAt || "");
      if (!leftStamp || !rightStamp || leftStamp === rightStamp) {
        return 0;
      }
      return leftStamp > rightStamp ? 1 : -1;
    }

    function getDisplayedPolicy() {
      if (state.pendingPolicy) {
        return state.pendingPolicy;
      }
      if (state.overview?.policy) {
        return state.overview.policy;
      }
      return {
        readEnabled: false,
        writeEnabled: false,
        updatedAt: "",
      };
    }

    function getPolicySummary(policy) {
      return "Read: " + (policy.readEnabled ? "Enabled" : "Disabled") +
        " · Write: " + (policy.writeEnabled ? "Enabled" : "Disabled");
    }

    function getPolicyMeta(kind, enabled) {
      if (state.isSavingPolicy) {
        return "Saving... Waiting for worker confirmation.";
      }
      if (kind === "read") {
        return enabled
          ? "Agents can restore memory and use explicit read tools."
          : "Agents cannot restore memory or use explicit read tools.";
      }
      return enabled
        ? "Agents can record new observations and session activity."
        : "Agents cannot write new observations or session activity.";
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
      badge.textContent = enabled ? "Enabled" : "Disabled";
      badge.className = "policyStateBadge " +
        (state.isSavingPolicy ? "saving" : enabled ? "enabled" : "disabled");
      meta.textContent = getPolicyMeta(kind, enabled);
    }

    function renderOverview() {
      if (!state.overview) return;

      const { stats, projects, agents, refreshedAt } = state.overview;
      const policy = getDisplayedPolicy();
      els.observationsCount.textContent = String(stats.observations);
      els.sessionsCount.textContent = String(stats.sessions);
      els.projectsCount.textContent = String(stats.projects);
      els.agentsCount.textContent = String(stats.agents);
      renderPolicyCard("read", !!policy.readEnabled);
      renderPolicyCard("write", !!policy.writeEnabled);
      els.statusText.textContent = (state.isSavingPolicy ? "Saving policy... " : "") + getPolicySummary(policy);
      els.statusText.className = "statusText" + (state.isSavingPolicy ? " saving" : "");
      els.policyUpdatedAt.textContent = state.isSavingPolicy
        ? "Saving... The switches stay on the requested target state until confirmation."
        : "Policy updated: " + formatDate(policy.updatedAt || refreshedAt);

      syncSelect(els.projectSelect, projects, "All projects", state.filters.project);
      syncSelect(els.agentSelect, agents, "All agents", state.filters.agent);
    }

    function syncSelect(select, values, emptyLabel, selectedValue) {
      const nextOptions = ['<option value="">' + escapeHtml(emptyLabel) + '</option>']
        .concat(values.map((value) => {
          const escaped = escapeHtml(value);
          const selected = value === selectedValue ? ' selected' : '';
          return '<option value="' + escaped + '"' + selected + '>' + escaped + '</option>';
        }))
        .join("");
      select.innerHTML = nextOptions;
    }

    function renderRecords(total) {
      if (!state.records.length) {
        els.recordsList.innerHTML = '<div class="empty">No observations matched the current filters.</div>';
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
          '<h3 class="recordTitle">' + escapeHtml(record.title) + '</h3>' +
          '<p class="recordSummary">' + escapeHtml(summarize(record.narrative)) + '</p>' +
          '<div class="recordMeta">' +
            '<span class="chip">' + escapeHtml(record.agent_id) + '</span>' +
            '<span class="chip">' + escapeHtml(record.project_path) + '</span>' +
            '<span class="chip">' + escapeHtml(formatDate(record.created_at)) + '</span>' +
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

    function getSelectedRecord() {
      return state.records.find((record) => record.id === state.selectedId) || null;
    }

    function renderDetail(record) {
      if (!record) {
        els.detailTitle.textContent = "Choose a record";
        els.detailTimestamp.textContent = "";
        els.detailContent.className = "empty";
        els.detailContent.innerHTML = "Select an observation from the ledger to inspect narrative, facts, concepts, and touched files.";
        return;
      }

      els.detailTitle.textContent = record.title;
      els.detailTimestamp.textContent = formatDate(record.created_at);
      els.detailContent.className = "";
      els.detailContent.innerHTML = [
        '<div class="detailMeta">',
          '<span class="chip">' + escapeHtml(record.agent_id) + '</span>',
          '<span class="chip">' + escapeHtml(record.project_path) + '</span>',
          '<span class="chip">' + escapeHtml(record.id) + '</span>',
        '</div>',
        '<p class="detailNarrative">' + escapeHtml(record.narrative || "No narrative available.") + '</p>',
        renderTagSection("Facts", record.facts),
        renderTagSection("Concepts", record.concepts),
        renderListSection("Files Read", record.files_read),
        renderListSection("Files Modified", record.files_modified),
      ].join("");
    }

    function renderTagSection(title, items) {
      if (!Array.isArray(items) || items.length === 0) {
        return '<section class="detailSection"><h3>' + title + '</h3><div class="subtle">None</div></section>';
      }
      return '<section class="detailSection"><h3>' + title + '</h3><div class="tagList">' +
        items.map((item) => '<span class="chip">' + escapeHtml(item) + '</span>').join("") +
        '</div></section>';
    }

    function renderListSection(title, items) {
      if (!Array.isArray(items) || items.length === 0) {
        return '<section class="detailSection"><h3>' + title + '</h3><div class="subtle">None</div></section>';
      }
      return '<section class="detailSection"><h3>' + title + '</h3><ul class="detailList">' +
        items.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") +
        '</ul></section>';
    }

    async function loadOverview() {
      const response = await fetch("/admin/api/overview");
      if (!response.ok) {
        throw new Error("Failed to load overview (" + response.status + ")");
      }
      const nextOverview = await response.json();
      if (state.overview && comparePolicyFreshness(nextOverview.policy, state.overview.policy) < 0) {
        nextOverview.policy = state.overview.policy;
      }
      state.overview = nextOverview;
      renderOverview();
    }

    async function loadRecords() {
      const params = new URLSearchParams({
        page: String(state.filters.page),
        pageSize: String(state.filters.pageSize),
      });

      if (state.filters.project) params.set("project", state.filters.project);
      if (state.filters.agent) params.set("agent", state.filters.agent);
      if (state.filters.query) params.set("query", state.filters.query);

      const response = await fetch("/admin/api/records?" + params.toString());
      if (!response.ok) {
        throw new Error("Failed to load records (" + response.status + ")");
      }
      const payload = await response.json();
      state.records = Array.isArray(payload.records) ? payload.records : [];
      renderRecords(Number(payload.total || 0));
    }

    async function loadAll(statusMessage = "Refreshing...") {
      setStatus(statusMessage, false);
      try {
        await Promise.all([loadOverview(), loadRecords()]);
        setStatus("Synced " + new Date().toLocaleTimeString(), false);
      } catch (error) {
        setStatus(error.message || "Failed to refresh", true);
      }
    }

    async function savePolicy() {
      if (!state.overview || state.isSavingPolicy) return;

      const previousPolicy = {
        readEnabled: !!state.overview.policy?.readEnabled,
        writeEnabled: !!state.overview.policy?.writeEnabled,
        updatedAt: state.overview.policy?.updatedAt || "",
      };
      const nextPolicy = {
        readEnabled: els.readToggle.checked,
        writeEnabled: els.writeToggle.checked,
      };
      state.pendingPolicy = nextPolicy;
      state.isSavingPolicy = true;
      renderOverview();
      setStatus("Saving policy...", false);

      try {
        const response = await fetch("/admin/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextPolicy),
        });

        if (!response.ok) {
          throw new Error("Failed to update runtime policy (" + response.status + ")");
        }

        const payload = await response.json();
        state.overview.policy = payload.policy;
        state.pendingPolicy = null;
        state.isSavingPolicy = false;
        renderOverview();
        setStatus("Policy updated at " + new Date().toLocaleTimeString(), false);
      } catch (error) {
        state.pendingPolicy = null;
        state.isSavingPolicy = false;
        state.overview.policy = previousPolicy;
        renderOverview();
        try {
          await loadOverview();
        } catch (refreshError) {
          // Keep the last confirmed policy if the recovery refresh also fails.
        }
        setStatus(error.message || "Failed to update runtime policy", true);
      }
    }

    function syncFiltersFromInputs() {
      state.filters.project = els.projectSelect.value;
      state.filters.agent = els.agentSelect.value;
      state.filters.query = els.queryInput.value.trim();
      state.filters.page = 1;
    }

    function bindEvents() {
      els.refreshButton.addEventListener("click", () => loadAll("Manual refresh..."));
      els.projectSelect.addEventListener("change", async () => {
        syncFiltersFromInputs();
        await loadRecords();
      });
      els.agentSelect.addEventListener("change", async () => {
        syncFiltersFromInputs();
        await loadRecords();
      });
      els.queryInput.addEventListener("change", async () => {
        syncFiltersFromInputs();
        await loadRecords();
      });
      els.queryInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          syncFiltersFromInputs();
          await loadRecords();
        }
      });
      els.readToggle.addEventListener("change", savePolicy);
      els.writeToggle.addEventListener("change", savePolicy);
    }

    async function initialize() {
      bindEvents();
      await loadAll("Loading admin console...");
      state.pollHandle = window.setInterval(() => {
        loadAll("Polling latest state...");
      }, POLL_INTERVAL_MS);
    }

    initialize();
  </script>
</body>
</html>`;
}
