export const ADMIN_UI_THEME = `
  :root {
    --bg: #edf2f7;
    --bg-deep: #d8e2ec;
    --material: rgba(255, 255, 255, 0.60);
    --material-strong: rgba(255, 255, 255, 0.78);
    --material-soft: rgba(255, 255, 255, 0.42);
    --material-line: rgba(255, 255, 255, 0.74);
    --ink: #102033;
    --muted: #526579;
    --muted-soft: #718196;
    --line: rgba(16, 32, 51, 0.12);
    --line-strong: rgba(16, 32, 51, 0.18);
    --accent: #0a84ff;
    --accent-soft: rgba(10, 132, 255, 0.13);
    --accent-strong: #0066d5;
    --success: #14855d;
    --danger: #b93b42;
    --warning: #b46f08;
    --panel-radius: 18px;
    --card-radius: 12px;
    --control-radius: 10px;
    --pill-radius: 999px;
    --shadow-soft: 0 8px 14px rgba(33, 54, 78, 0.12);
    --shadow-tight: 0 4px 8px rgba(33, 54, 78, 0.10);
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  * {
    box-sizing: border-box;
  }

  html {
    min-height: 100%;
    scroll-behavior: smooth;
  }

  body {
    min-height: 100%;
    margin: 0;
    font-family: "SF Pro Display", "Segoe UI", "PingFang SC", system-ui, sans-serif;
    color: var(--ink);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.66), rgba(236, 243, 250, 0.14) 42%, rgba(206, 222, 233, 0.50)),
      linear-gradient(180deg, var(--bg), var(--bg-deep));
    background-attachment: fixed;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.42;
    background:
      linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent),
      linear-gradient(180deg, rgba(255, 255, 255, 0.30), transparent 34%, rgba(87, 110, 132, 0.05));
    mix-blend-mode: screen;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button,
  input,
  select,
  textarea,
  [tabindex] {
    outline: none;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  [tabindex]:focus-visible {
    box-shadow:
      0 0 0 3px rgba(10, 132, 255, 0.18),
      inset 0 0 0 1px rgba(10, 132, 255, 0.34);
  }

  .shell {
    position: relative;
    z-index: 1;
    width: min(1540px, calc(100% - 40px));
    margin: 0 auto;
    padding: 28px 0 40px;
  }

  .hero,
  .glassPanel,
  .dock,
  .card,
  .metricTile,
  .recordItem,
  .scoreCard,
  .factCard,
  .summaryCard,
  .obsCard {
    background: linear-gradient(180deg, var(--material-strong), var(--material));
    border: 1px solid var(--material-line);
    box-shadow: var(--shadow-soft), inset 0 1px 0 rgba(255, 255, 255, 0.84);
    backdrop-filter: blur(26px) saturate(1.45);
    -webkit-backdrop-filter: blur(26px) saturate(1.45);
  }

  .hero {
    position: relative;
    overflow: hidden;
    border-radius: 22px;
    padding: 24px;
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: 1px;
    pointer-events: none;
    border-radius: 21px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.90),
      inset 0 -1px 0 rgba(52, 74, 96, 0.08);
  }

  .heroLayout {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.82fr);
    gap: 20px;
  }

  .heroTopRow,
  .policyTitleRow,
  .toolbarFooter,
  .metaRow {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .heroTopRow,
  .toolbarFooter {
    justify-content: space-between;
  }

  .eyebrow,
  .localeToggle,
  .pill,
  .policyBadge,
  .scoreBadge,
  .tag,
  .statusChip,
  .metricBadge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 10px;
    border-radius: var(--pill-radius);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .eyebrow,
  .localeToggle {
    min-height: 36px;
    background: rgba(255, 255, 255, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.78);
    color: var(--accent-strong);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  }

  .localeToggle {
    gap: 12px;
    padding: 6px 8px 6px 12px;
  }

  .localeToggleLabel,
  .statusLabel,
  .sectionEyebrow,
  .fieldLabel,
  .metaLabel {
    color: var(--muted-soft);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .localeToggleButtons {
    display: inline-flex;
    gap: 4px;
  }

  .localeButton {
    min-width: 46px;
    min-height: 30px;
    border: 0;
    border-radius: var(--pill-radius);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), color 160ms var(--ease-out);
  }

  .localeButton:hover,
  .segmentButton:hover,
  .button:hover {
    transform: translateY(-1px);
  }

  .localeButton:active,
  .segmentButton:active,
  .button:active {
    transform: translateY(1px) scale(0.99);
  }

  .localeButton.is-active {
    background: rgba(10, 132, 255, 0.14);
    color: var(--accent-strong);
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h1 {
    max-width: 780px;
    margin-top: 16px;
    font-size: 3.1rem;
    line-height: 1.02;
    letter-spacing: 0;
    text-wrap: balance;
  }

  .lead,
  .panelLead {
    color: var(--muted);
    line-height: 1.62;
    text-wrap: pretty;
  }

  .lead {
    max-width: 760px;
    margin-top: 14px;
  }

  .heroAside {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .statusCard,
  .infoCard {
    border-radius: var(--panel-radius);
    padding: 18px;
  }

  .statusValue {
    margin-top: 10px;
    font-size: 1.05rem;
    line-height: 1.45;
    font-weight: 700;
  }

  .statusValue.is-saving {
    color: var(--warning);
  }

  .subtle {
    color: var(--muted);
  }

  .statsGrid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 20px;
  }

  .metricTile {
    border-radius: var(--card-radius);
    padding: 16px;
    transition: transform 180ms var(--ease-out), background 180ms var(--ease-out);
  }

  .metricTile:hover,
  .card:hover,
  .recordItem:hover,
  .scoreCard:hover,
  .factCard:hover,
  .summaryCard:hover,
  .obsCard:hover {
    transform: translateY(-1px);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.62));
  }

  .metricValue {
    margin-top: 10px;
    font-size: 2rem;
    line-height: 1;
    letter-spacing: 0;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .policyRow {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .policyCard {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    border-radius: var(--panel-radius);
    padding: 18px;
    background: rgba(255, 255, 255, 0.56);
    border: 1px solid rgba(255, 255, 255, 0.72);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
    transition: transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 180ms var(--ease-out), background 180ms var(--ease-out);
  }

  .policyCard.is-enabled.readPolicy {
    border-color: rgba(10, 132, 255, 0.34);
    background: linear-gradient(180deg, rgba(245, 250, 255, 0.84), rgba(255, 255, 255, 0.52));
  }

  .policyCard.is-enabled.writePolicy {
    border-color: rgba(20, 133, 93, 0.30);
    background: linear-gradient(180deg, rgba(243, 255, 250, 0.78), rgba(255, 255, 255, 0.52));
  }

  .policyCard.is-saving {
    transform: translateY(-1px);
  }

  .policyTitle {
    font-size: 1.08rem;
    letter-spacing: 0;
  }

  .policyBadge.enabled,
  .statusChip.success {
    background: rgba(20, 133, 93, 0.13);
    color: var(--success);
  }

  .policyBadge.disabled,
  .statusChip.error {
    background: rgba(185, 59, 66, 0.12);
    color: var(--danger);
  }

  .policyBadge.saving,
  .statusChip.warning {
    background: rgba(180, 111, 8, 0.13);
    color: var(--warning);
  }

  .switch {
    position: relative;
    width: 58px;
    height: 34px;
    flex: 0 0 auto;
  }

  .switch input {
    position: absolute;
    inset: 0;
    opacity: 0;
  }

  .slider {
    position: absolute;
    inset: 0;
    border-radius: var(--pill-radius);
    background: rgba(91, 106, 124, 0.24);
    box-shadow: inset 0 0 0 1px rgba(16, 32, 51, 0.12);
    transition: background 170ms var(--ease-out), box-shadow 170ms var(--ease-out);
    cursor: pointer;
  }

  .slider::before {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #fff;
    box-shadow: var(--shadow-tight);
    transition: transform 180ms var(--ease-out);
  }

  .switch input:checked + .slider {
    background: rgba(10, 132, 255, 0.50);
  }

  .switch input:checked + .slider::before {
    transform: translateX(24px);
  }

  .switch input:disabled + .slider {
    cursor: wait;
    opacity: 0.72;
  }

  .dock {
    position: sticky;
    top: 12px;
    z-index: 5;
    margin-top: 18px;
    border-radius: 16px;
    padding: 8px;
  }

  .segmented {
    display: flex;
    gap: 6px;
    overflow: auto;
    scrollbar-width: none;
  }

  .segmented::-webkit-scrollbar {
    display: none;
  }

  .segmentButton {
    border: 0;
    border-radius: 11px;
    background: transparent;
    padding: 11px 14px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
    font-weight: 720;
    transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), color 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
  }

  .segmentButton.is-active {
    background: rgba(255, 255, 255, 0.82);
    color: var(--ink);
    box-shadow: var(--shadow-tight), inset 0 1px 0 rgba(255, 255, 255, 0.78);
  }

  .viewStack {
    display: grid;
    gap: 18px;
    margin-top: 20px;
  }

  .viewPanel {
    display: none;
    border-radius: var(--panel-radius);
    padding: 22px;
  }

  .viewPanel.is-active {
    display: block;
    animation: panelEnter 230ms var(--ease-out) both;
  }

  .panelHeader {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 18px;
    margin-bottom: 18px;
  }

  .panelTitle {
    margin-top: 6px;
    font-size: 1.7rem;
    line-height: 1.15;
    letter-spacing: 0;
    text-wrap: balance;
  }

  .panelLead {
    max-width: 780px;
    margin-top: 8px;
  }

  .toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .toolbar.compact {
    grid-template-columns: 1.2fr 0.7fr auto;
  }

  .toolbar.wide {
    grid-template-columns: 1fr 1fr 1fr 1fr auto;
  }

  .fieldLabel {
    display: block;
    margin-bottom: 7px;
  }

  .textInput,
  .selectInput,
  .textArea,
  .button,
  .dateInput,
  .numberInput {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.78);
    border-radius: var(--control-radius);
    background: rgba(255, 255, 255, 0.68);
    color: var(--ink);
    padding: 12px 13px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
    transition: border-color 160ms var(--ease-out), background 160ms var(--ease-out), box-shadow 160ms var(--ease-out), transform 160ms var(--ease-out);
  }

  .textInput:hover,
  .selectInput:hover,
  .textArea:hover,
  .dateInput:hover,
  .numberInput:hover {
    background: rgba(255, 255, 255, 0.80);
    border-color: rgba(10, 132, 255, 0.24);
  }

  .textArea {
    min-height: 108px;
    resize: vertical;
  }

  .button {
    border: 0;
    cursor: pointer;
    font-weight: 730;
  }

  .button:disabled {
    cursor: wait;
    opacity: 0.66;
    transform: none;
  }

  .button.primary {
    background: linear-gradient(180deg, #2997ff, #0871dc);
    color: #fff;
  }

  .button.secondary {
    background: rgba(255, 255, 255, 0.74);
    color: var(--ink);
  }

  .button.ghost {
    background: rgba(255, 255, 255, 0.34);
    color: var(--muted);
  }

  .buttonSlot {
    display: flex;
    align-items: end;
  }

  .metricsRow,
  .chipsRow,
  .tagGrid,
  .llmStatusGrid,
  .actionCluster {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .actionCluster {
    justify-content: flex-end;
  }

  .metricBadge,
  .tag,
  .scoreBadge {
    max-width: 100%;
    background: rgba(255, 255, 255, 0.58);
    color: var(--muted);
    border: 1px solid rgba(255, 255, 255, 0.76);
    overflow-wrap: anywhere;
  }

  .scoreBadge strong,
  .metricBadge strong {
    color: var(--ink);
  }

  .sectionGrid,
  .llmLayout {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
    gap: 16px;
    margin-top: 16px;
  }

  .stack {
    display: grid;
    gap: 14px;
  }

  .card {
    border-radius: var(--card-radius);
    padding: 16px;
  }

  .listBlock {
    display: grid;
    gap: 12px;
  }

  .factCard,
  .summaryCard,
  .obsCard,
  .scoreCard,
  .recordItem {
    border-radius: var(--card-radius);
    padding: 14px;
    transition: transform 180ms var(--ease-out), background 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 180ms var(--ease-out);
  }

  .factValue,
  .recordSummary,
  .summaryLine,
  .mono,
  pre {
    line-height: 1.58;
  }

  .mono,
  pre {
    font-family: "Cascadia Code", "SF Mono", Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .renderedBlock {
    max-height: 680px;
    overflow: auto;
  }

  .emptyState {
    border: 1px dashed rgba(16, 32, 51, 0.18);
    border-radius: var(--card-radius);
    padding: 16px;
    text-align: center;
    color: var(--muted);
    background: rgba(255, 255, 255, 0.30);
  }

  .statusLine {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    color: var(--muted);
    font-weight: 650;
  }

  .statusDot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 4px rgba(20, 133, 93, 0.10);
  }

  .statusLine.error .statusDot {
    background: var(--danger);
    box-shadow: 0 0 0 4px rgba(185, 59, 66, 0.10);
  }

  .statusLine.warning .statusDot {
    background: var(--warning);
    box-shadow: 0 0 0 4px rgba(180, 111, 8, 0.10);
  }

  .ledgerLayout {
    display: grid;
    grid-template-columns: minmax(340px, 1fr) minmax(320px, 0.9fr);
    gap: 16px;
  }

  .recordsList {
    display: grid;
    gap: 12px;
    max-height: 760px;
    overflow: auto;
    padding-right: 4px;
  }

  .recordItem {
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .recordItem.active {
    border-color: rgba(10, 132, 255, 0.34);
    box-shadow:
      0 6px 12px rgba(10, 132, 255, 0.10),
      inset 0 0 0 1px rgba(10, 132, 255, 0.14);
  }

  .detailPanel {
    min-height: 760px;
  }

  .detailCard {
    border-top: 1px solid var(--line);
    padding: 14px 0 0;
    margin-top: 14px;
  }

  .listMeta,
  .finePrint {
    color: var(--muted-soft);
    font-size: 13px;
  }

  .listDetails {
    margin: 0;
    padding-left: 18px;
    line-height: 1.7;
  }

  .factsTable,
  .scoreGrid {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .splitGrid,
  .runtimeMetaGrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }

  .runtimeProjectList,
  .runtimeAgentList {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 12px;
  }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(16, 32, 51, 0.13), transparent);
    margin: 16px 0;
  }

  .checkRow {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: var(--muted);
    line-height: 1.5;
  }

  .checkRow input {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    accent-color: var(--accent);
  }

  .llmControlCard,
  .llmTestCard {
    min-width: 0;
  }

  .llmTestResult {
    border-radius: var(--card-radius);
    padding: 14px;
    background: rgba(255, 255, 255, 0.36);
    border: 1px solid rgba(255, 255, 255, 0.68);
    overflow-wrap: anywhere;
  }

  .llmTestResult.success {
    background: rgba(20, 133, 93, 0.08);
    border-color: rgba(20, 133, 93, 0.20);
  }

  .llmTestResult.error {
    background: rgba(185, 59, 66, 0.08);
    border-color: rgba(185, 59, 66, 0.22);
  }

  .hidden {
    display: none !important;
  }

  @keyframes panelEnter {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.992);
      filter: blur(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  @media (max-width: 1180px) {
    .heroLayout,
    .sectionGrid,
    .llmLayout,
    .ledgerLayout,
    .runtimeMetaGrid,
    .splitGrid,
    .policyRow,
    .statsGrid,
    .toolbar,
    .toolbar.compact,
    .toolbar.wide {
      grid-template-columns: 1fr;
    }

    .panelHeader,
    .toolbarFooter {
      flex-direction: column;
      align-items: stretch;
    }

    .localeToggle {
      width: 100%;
      justify-content: space-between;
    }
  }

  @media (max-width: 720px) {
    .shell {
      width: min(100% - 24px, 1540px);
      padding-top: 16px;
    }

    .hero,
    .viewPanel {
      padding: 16px;
      border-radius: 16px;
    }

    h1 {
      font-size: 2.25rem;
    }

    .panelTitle {
      font-size: 1.42rem;
    }

    .policyCard {
      align-items: flex-start;
    }

    .actionCluster {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
    }
  }
`;
