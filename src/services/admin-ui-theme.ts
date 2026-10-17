export const ADMIN_UI_THEME = `
  :root {
    --bg: #edf2f7;
    --bg-deep: #d8e2ec;
    --material: rgba(255, 255, 255, 0.60);
    --material-strong: rgba(255, 255, 255, 0.78);
    --material-soft: rgba(255, 255, 255, 0.42);
    --material-line: rgba(255, 255, 255, 0.74);
    --ink: #0b1220;
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
    --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif;
    --text: #0b1220;
    --text-2: rgba(15, 23, 42, 0.72);
    --text-3: rgba(15, 23, 42, 0.64);
    --ok: #30d158;
    --warn: #ff9f0a;
    --err: #ff453a;
    --kind-outcome: #0a84ff;
    --kind-context: #8e6cf6;
    --kind-legacy: #a7adb8;
    --glass-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.42));
    --glass-sheen: radial-gradient(110% 70% at 0% 0%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0) 52%);
    --glass-border: rgba(255, 255, 255, 0.30);
    --glass-rim: linear-gradient(135deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0.9) 10%, rgba(255, 255, 255, 0.38) 30%, rgba(255, 255, 255, 0.06) 52%, rgba(255, 255, 255, 0.14) 78%, rgba(255, 255, 255, 0.6));
    --glass-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 0 18px 26px -20px rgba(255, 255, 255, 0.9),
      inset 0 -1px 0 rgba(255, 255, 255, 0.22),
      0 1px 2px rgba(20, 40, 80, 0.05),
      0 6px 16px -8px rgba(30, 64, 120, 0.10),
      0 26px 60px -24px rgba(30, 64, 120, 0.28);
    --glass-blur: blur(24px) saturate(1.6);
    --r-card: 24px;
    --r-sidebar: 28px;
    --r-control: 12px;
    --sidebar-w: 232px;
    --gutter: 24px;
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
    font-family: var(--font);
    color: var(--ink);
    background: #e9f0f7;
    -webkit-font-smoothing: antialiased;
  }

  /* The only background layer: static pastel shapes, blurred once and never repainted by the poll.
     Aqua flows across the top (behind the top bar and health cards), lavender washes the middle-left,
     peach glows bottom-right. Centres stay off the corners so nothing reads as a hot spot. */
  body::before {
    content: "";
    position: fixed;
    inset: -10%;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(46% 30% at 58% 14%, rgba(125, 200, 240, 0.70), rgba(125, 200, 240, 0) 74%),
      radial-gradient(30% 36% at 84% 28%, rgba(112, 192, 240, 0.62), rgba(112, 192, 240, 0) 74%),
      radial-gradient(30% 20% at 32% 10%, rgba(140, 208, 242, 0.55), rgba(140, 208, 242, 0) 74%),
      radial-gradient(18% 22% at 10% 16%, rgba(140, 208, 242, 0.40), rgba(140, 208, 242, 0) 74%),
      radial-gradient(28% 32% at 12% 56%, rgba(186, 172, 250, 0.52), rgba(186, 172, 250, 0) 74%),
      radial-gradient(24% 22% at 42% 64%, rgba(196, 186, 255, 0.30), rgba(196, 186, 255, 0) 74%),
      radial-gradient(36% 34% at 84% 88%, rgba(255, 190, 150, 0.60), rgba(255, 190, 150, 0) 74%),
      radial-gradient(24% 22% at 62% 98%, rgba(255, 204, 170, 0.38), rgba(255, 204, 170, 0) 74%),
      linear-gradient(165deg, #edf3f9, #e7eef6 50%, #f2ebe7);
    filter: blur(44px);
    transform: translateZ(0);
  }

  [hidden] {
    display: none !important;
  }

  .visuallyHidden {
    position: absolute !important;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
    opacity: 0;
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
  }

  /* Only the visible outer legacy surfaces blur (hero, tab dock, the open panel); nested and hidden
     cards stay plain translucent to keep GPU cost low. */
  .devToolsView.is-active .hero,
  .devToolsView.is-active .dock,
  .devToolsView.is-active .viewPanel.is-active {
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
    /* Clears the sticky tab dock when a sidebar link scrolls the panel into view. */
    scroll-margin-top: 96px;
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

  .toolbar.proceduralToolbar {
    grid-template-columns: minmax(220px, 1.35fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) minmax(220px, 1fr) minmax(120px, 0.5fr) auto;
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
  .llmLayout,
  .proceduralLayout {
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

  .proceduralSkillCard {
    cursor: pointer;
  }

  .proceduralSkillCard.is-selected {
    border-color: rgba(10, 132, 255, 0.34);
    box-shadow:
      0 6px 12px rgba(10, 132, 255, 0.10),
      inset 0 0 0 1px rgba(10, 132, 255, 0.14);
    background: linear-gradient(180deg, rgba(246, 251, 255, 0.88), rgba(255, 255, 255, 0.64));
  }

  .proceduralCandidateGroup {
    display: grid;
    gap: 12px;
  }

  .proceduralSteps {
    margin: 10px 0 0;
    padding-left: 18px;
    color: var(--muted);
    line-height: 1.7;
  }

  .proceduralDetailStats {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 10px;
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

  .budgetSettings {
    border: 0;
    padding: 10px 0 0;
    margin: 6px 0 0;
    min-width: 0;
  }

  .budgetFields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 12px;
    margin: 12px 0;
  }

  .budgetFields .textInput:disabled {
    cursor: not-allowed;
    opacity: 0.65;
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
    .proceduralLayout,
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

  /* ---------- Liquid-glass shell (sidebar, top bar, Home) ---------- */

  .glassCard,
  .glassSurface {
    position: relative;
    background: var(--glass-sheen), var(--glass-fill);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
  }

  .glassCard {
    border-radius: var(--r-card);
  }

  /* Bright 1px liquid-glass rim: white at the top-left, fading out across the card, catching light again bottom-right. */
  .glassCard::before,
  .glassSurface::before {
    content: "";
    position: absolute;
    inset: -1px;
    padding: 1px;
    border-radius: inherit;
    pointer-events: none;
    background: var(--glass-rim);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  /* Real blur only on the sidebar and the five health cards of the visible view (6 surfaces on Home);
     content cards rely on translucency over the already-blurred background instead. */
  .sidebar.glassBlur,
  .appView.is-active .glassBlur {
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }

  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .glassBlur {
      background: var(--glass-sheen), linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.86));
    }
  }

  .appShell {
    min-height: 100vh;
    font-size: 13.5px;
  }

  /* Legacy panels keep their original 16px base size. */
  .devToolsView {
    font-size: 16px;
  }

  /* Sidebar: one floating blurred panel. */
  .sidebar {
    position: fixed;
    z-index: 20;
    top: 16px;
    bottom: 16px;
    left: 16px;
    width: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    padding: 18px 12px 12px;
    border-radius: var(--r-sidebar);
    background: var(--glass-sheen), linear-gradient(180deg, rgba(255, 255, 255, 0.50), rgba(255, 255, 255, 0.36));
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 18px;
    color: var(--text);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .brandMark {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    filter: drop-shadow(0 4px 6px rgba(30, 90, 200, 0.28));
  }

  .sideNav {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .sideNav::-webkit-scrollbar {
    display: none;
  }

  .navItem {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 180ms var(--ease-out), color 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
  }

  .navItem:hover {
    background: rgba(255, 255, 255, 0.58);
  }

  .navItem.is-active {
    background: rgba(10, 132, 255, 0.12);
    color: var(--accent);
    font-weight: 600;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), inset 0 0 0 1px rgba(10, 132, 255, 0.08);
  }

  .navIcon {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    color: rgba(15, 23, 42, 0.72);
  }

  .navItem.is-active .navIcon {
    color: var(--accent);
  }

  .navLabel {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navGroup {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(15, 23, 42, 0.07);
  }

  .navSubItem {
    min-height: 34px;
    padding-left: 18px;
    font-size: 13.5px;
    color: var(--text-2);
  }

  .navBullet {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    margin: 0 7px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.45;
  }

  .navSubItem.is-active .navBullet {
    opacity: 1;
  }

  .sidebarFooter {
    margin-top: 10px;
    padding: 12px 4px 2px;
    border-top: 1px solid rgba(15, 23, 42, 0.07);
  }

  .devToggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    color: var(--text-2);
    font-size: 13.5px;
    cursor: pointer;
  }

  .devToggleLabel {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .iosSwitch {
    position: relative;
    width: 44px;
    height: 26px;
    flex: 0 0 44px;
  }

  .iosSwitch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .iosSwitch .track {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: rgba(120, 130, 150, 0.26);
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
    pointer-events: none;
    transition: background 200ms var(--ease-out);
  }

  .iosSwitch .track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22), 0 0 0 0.5px rgba(15, 23, 42, 0.06);
    transition: transform 200ms var(--ease-out);
  }

  .iosSwitch input:checked + .track {
    background: var(--ok);
  }

  .iosSwitch input:checked + .track::after {
    transform: translateX(18px);
  }

  .iosSwitch input:focus-visible + .track {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.3);
  }

  /* Main column */
  .mainArea {
    min-width: 0;
    margin-left: calc(var(--sidebar-w) + 32px);
    padding: 20px var(--gutter) 40px 0;
  }

  .mainInner {
    max-width: 1540px;
    margin: 0 auto;
  }

  .topBar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px 16px;
    min-height: 64px;
    margin-bottom: 18px;
  }

  h1.pageTitle {
    max-width: none;
    margin: 0;
    color: var(--text);
    font-size: 34px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .topActions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .glassPill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.70), rgba(255, 255, 255, 0.52));
    border: 1px solid rgba(255, 255, 255, 0.8);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 1), inset 0 10px 14px -10px rgba(255, 255, 255, 0.9), 0 1px 2px rgba(20, 40, 80, 0.05), 0 12px 28px -12px rgba(30, 64, 120, 0.28);
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  .policyPill {
    position: relative;
    cursor: pointer;
    user-select: none;
    transition: background 180ms var(--ease-out), border-color 180ms var(--ease-out), color 180ms var(--ease-out);
  }

  .policyPill:hover {
    background: rgba(255, 255, 255, 0.9);
  }

  .policyPill:focus-within {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.95);
  }

  .pillDot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--kind-legacy);
  }

  .policyPill.is-enabled .pillDot {
    background: var(--ok);
    box-shadow: 0 0 0 3px rgba(48, 209, 88, 0.18);
  }

  .policyPill.is-disabled {
    background: rgba(255, 236, 234, 0.9);
    border-color: rgba(255, 69, 58, 0.38);
    color: #b0231a;
  }

  .policyPill.is-disabled .pillDot {
    background: var(--err);
    box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.18);
  }

  .policyPill.is-saving .pillDot {
    background: var(--warn);
  }

  .policyPill .policyBadge,
  .policyPill .policyBadge.enabled,
  .policyPill .policyBadge.disabled,
  .policyPill .policyBadge.saving {
    min-height: 0;
    padding: 0;
    background: none;
    color: inherit;
    font-size: 14px;
    font-weight: 500;
  }

  .topActions .localeToggle {
    width: auto;
    gap: 2px;
    padding: 0 12px;
    color: var(--text-3);
  }

  .topActions .localeButton {
    min-width: 0;
    min-height: 30px;
    padding: 0 6px;
    border-radius: 8px;
    background: transparent;
    color: var(--text-3);
    font-size: 14px;
    font-weight: 600;
  }

  .topActions .localeButton.is-active {
    background: transparent;
    color: var(--text);
    font-weight: 700;
  }

  .policyBanner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -4px 0 18px;
    padding: 12px 18px;
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(255, 236, 234, 0.92), rgba(255, 226, 222, 0.82));
    border: 1px solid rgba(255, 69, 58, 0.32);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 10px 24px -14px rgba(255, 69, 58, 0.45);
    color: #9f1d14;
    font-size: 14px;
    font-weight: 600;
  }

  .bannerIcon {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
  }

  .appView {
    display: none;
  }

  .appView.is-active {
    display: block;
    animation: viewEnter 200ms var(--ease-out) both;
  }

  /* Home */
  .homeHealth {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
  }

  .healthCard {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
    min-height: 136px;
    padding: 18px 20px;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 180ms var(--ease-out), border-color 180ms var(--ease-out);
  }

  .healthCard:hover {
    transform: translateY(-2px);
  }

  .healthCard:active {
    transform: translateY(0) scale(0.99);
  }

  .healthCard.is-warn {
    border-color: rgba(255, 159, 10, 0.55);
  }

  .healthCard.is-error {
    border-color: rgba(255, 69, 58, 0.55);
  }

  .healthHead {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font-size: 15px;
    font-weight: 650;
  }

  .healthDot {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    border-radius: 50%;
    background: var(--kind-legacy);
    box-shadow: 0 0 0 4px rgba(167, 173, 184, 0.18);
    transition: background 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
  }

  .is-ok .healthDot { background: var(--ok); box-shadow: 0 0 0 4px rgba(48, 209, 88, 0.18); }
  .is-warn .healthDot { background: var(--warn); box-shadow: 0 0 0 4px rgba(255, 159, 10, 0.2); }
  .is-error .healthDot { background: var(--err); box-shadow: 0 0 0 4px rgba(255, 69, 58, 0.2); }

  .healthValue {
    margin-top: 4px;
    overflow: hidden;
    color: var(--text);
    font-size: clamp(22px, 1.9vw, 28px);
    font-weight: 650;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .healthMeta {
    overflow: hidden;
    color: var(--text-2);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .homeRow {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
    gap: 16px;
    margin-top: 16px;
  }

  .homeCard {
    min-width: 0;
    padding: 20px 22px;
  }

  .homeRecent {
    margin-top: 16px;
  }

  .cardHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
  }

  .cardTitle {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .cardHint {
    color: var(--text-3);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .todayTop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px 20px;
    margin-top: 8px;
  }

  .todayCount {
    color: var(--text);
    font-size: 46px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .kindChips,
  .chipRow {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .kindChip,
  .metaChip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.66);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 1px 2px rgba(15, 23, 42, 0.03);
    color: var(--text);
    font-size: 14px;
    white-space: nowrap;
  }

  .kindChip.kind-outcome { background: linear-gradient(180deg, rgba(10, 132, 255, 0.10), rgba(10, 132, 255, 0.06)), rgba(255, 255, 255, 0.6); }
  .kindChip.kind-context { background: linear-gradient(180deg, rgba(142, 108, 246, 0.12), rgba(142, 108, 246, 0.07)), rgba(255, 255, 255, 0.6); }
  .kindChip.kind-legacy { background: linear-gradient(180deg, rgba(167, 173, 184, 0.16), rgba(167, 173, 184, 0.08)), rgba(255, 255, 255, 0.6); color: var(--text-2); }

  .kindDot {
    width: 10px;
    height: 10px;
    flex: 0 0 10px;
    border-radius: 50%;
  }

  .kind-outcome .kindDot { background: var(--kind-outcome); }
  .kind-context .kindDot { background: var(--kind-context); }
  .kind-legacy .kindDot { background: var(--kind-legacy); }

  .kindCount {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .chartWrap {
    margin-top: 14px;
    min-height: 120px;
  }

  .chartSvg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .chartSvg text {
    fill: var(--text-2);
    font-family: var(--font);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .chartSvg .chartGrid { stroke: rgba(15, 23, 42, 0.08); stroke-width: 1; }
  .chartSvg .chartAxis { stroke: rgba(15, 23, 42, 0.16); stroke-width: 1; }
  .chartSvg .barOutcome { fill: var(--kind-outcome); }
  .chartSvg .barContext { fill: var(--kind-context); }
  .chartSvg .barLegacy { fill: #c3c8d1; }
  .chartSvg .chartMarker { stroke: rgba(15, 23, 42, 0.62); stroke-width: 1.4; stroke-dasharray: 4 4; }
  .chartSvg .chartMarkerDot { fill: #1c2740; }
  .chartSvg .chartMarkerLabel { fill: var(--text-2); font-size: 11.5px; }
  .chartSvg .barGroup:hover rect { opacity: 0.82; }

  .chipRow {
    margin-top: 12px;
  }

  .metaChip {
    font-size: 13.5px;
  }

  .metaChip.is-agent {
    color: var(--accent);
  }

  .metaChip.is-muted {
    color: var(--text-3);
  }

  .chipIcon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
  }

  .metaChipCount {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .metaChip.is-agent .metaChipCount {
    color: var(--text);
  }

  .countBadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(255, 159, 10, 0.16);
    color: #a45b00;
    font-size: 12.5px;
    font-weight: 700;
  }

  .countBadge.is-error {
    background: rgba(255, 69, 58, 0.14);
    color: #b0231a;
  }

  .attentionLoading {
    padding: 40px 0;
    color: var(--text-3);
    text-align: center;
  }

  .allClear {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 250px;
    padding: 10px;
    text-align: center;
  }

  .allClearOrb {
    display: grid;
    place-items: center;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0) 46%),
      radial-gradient(circle at 50% 60%, rgba(48, 209, 88, 0.30), rgba(48, 209, 88, 0.20));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 0 0 1px rgba(255, 255, 255, 0.5),
      0 14px 30px -12px rgba(48, 209, 88, 0.5);
  }

  .allClearIcon {
    width: 46px;
    height: 46px;
    color: #1f9e45;
    stroke-width: 2.4;
  }

  .allClearTitle {
    margin-top: 6px;
    color: var(--text);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .allClearLead {
    max-width: 300px;
    color: var(--text-2);
    font-size: 13.5px;
    line-height: 1.5;
  }

  .attentionList {
    display: grid;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  .attentionItem {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.58);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    transition: background 160ms var(--ease-out);
  }

  .attentionItem:hover {
    background: rgba(255, 255, 255, 0.82);
  }

  .attentionDot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--warn);
  }

  .attentionItem.is-error .attentionDot {
    background: var(--err);
  }

  .linkButton {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
  }

  .linkButton:hover {
    background: rgba(10, 132, 255, 0.08);
  }

  .linkIcon {
    width: 18px;
    height: 18px;
  }

  .tableWrap {
    margin-top: 6px;
    overflow-x: auto;
  }

  .recentTable {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 14px;
  }

  .recentTable .colTime { width: 118px; }
  .recentTable .colKind { width: 120px; }
  .recentTable .colAgent { width: 120px; }
  .recentTable .colProject { width: 210px; }

  .recentTable th {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }

  .recentTable td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.05);
    overflow: hidden;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recentTable tbody tr:last-child td {
    border-bottom: 0;
  }

  .recentTable tbody tr:hover td {
    background: rgba(255, 255, 255, 0.42);
  }

  .recentTable .tableEmpty {
    padding: 28px 10px;
    color: var(--text-3);
    text-align: center;
  }

  .cellMuted {
    color: var(--text-2);
  }

  .kindPill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 10px 2px 8px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
  }

  .kindPill::before {
    content: "";
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .kindPill.kind-outcome { background: rgba(10, 132, 255, 0.10); color: #0068d6; }
  .kindPill.kind-context { background: rgba(142, 108, 246, 0.12); color: #6c4fd8; }
  .kindPill.kind-legacy { background: rgba(167, 173, 184, 0.18); color: #6b7280; }
  .kindPill.is-explicit { border-style: dashed; border-color: currentColor; }

  /* Placeholder sections */
  .placeholderCard {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    max-width: 760px;
    padding: 36px 34px;
  }

  .placeholderIcon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(10, 132, 255, 0.14), rgba(10, 132, 255, 0.06)), rgba(255, 255, 255, 0.7);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 8px 20px -12px rgba(10, 132, 255, 0.5);
    color: var(--accent);
  }

  .placeholderGlyph {
    width: 28px;
    height: 28px;
  }

  .placeholderTitle {
    margin: 4px 0 0;
    color: var(--text);
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.015em;
  }

  .placeholderLead,
  .switchesLead,
  .switchLead {
    max-width: 640px;
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.55;
  }

  .soonChip {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    margin-top: 6px;
    padding: 0 14px;
    border-radius: 999px;
    background: rgba(10, 132, 255, 0.1);
    color: #0068d6;
    font-size: 13px;
    font-weight: 600;
  }

  .settingsGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
    gap: 16px;
    align-items: start;
  }

  .settingsGrid .placeholderCard {
    max-width: none;
  }

  .switchesCard {
    display: grid;
    gap: 14px;
  }

  .switchRow {
    padding-top: 14px;
    border-top: 1px solid rgba(15, 23, 42, 0.07);
  }

  .switchTitle {
    margin: 0 0 4px;
    font-size: 14.5px;
    font-weight: 650;
  }

  .switchLead {
    font-size: 13.5px;
  }

  .switchMeta {
    margin-top: 6px;
    color: var(--text-3);
    font-size: 12.5px;
  }

  /* Developer tools wraps the legacy workbench untouched. */
  .devToolsLead {
    margin: -6px 0 16px;
    color: var(--text-2);
    font-size: 14px;
  }

  .legacyHeroTitle {
    margin-top: 14px;
    font-size: 2rem;
    line-height: 1.1;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  /* Transform only: animating opacity would make the view a backdrop root and drop the cards' blur mid-transition. */
  @keyframes viewEnter {
    from { transform: translateY(6px); }
    to { transform: none; }
  }

  @media (max-width: 1360px) {
    .healthCard {
      padding: 16px;
    }

    .healthHead {
      font-size: 14px;
    }
  }

  @media (max-width: 1180px) {
    :root {
      --sidebar-w: 72px;
    }

    .sidebar {
      padding: 16px 10px 10px;
    }

    .brand {
      justify-content: center;
      padding: 2px 0 16px;
    }

    .brandName,
    .navLabel,
    .devToggleLabel,
    .navSubItem {
      display: none;
    }

    .navItem {
      justify-content: center;
      padding: 0;
    }

    .devToggle {
      flex-direction: column;
      gap: 8px;
      padding: 4px 0;
    }

    .devToggle .navIcon {
      display: none;
    }

    .mainArea {
      margin-left: calc(var(--sidebar-w) + 32px);
    }

    .topActions .localeToggle {
      width: auto;
      justify-content: center;
    }
  }

  @media (max-width: 960px) {
    .homeRow {
      grid-template-columns: 1fr;
    }

    .homeHealth {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }

  @media (max-width: 720px) {
    .sidebar {
      position: sticky;
      top: 8px;
      bottom: auto;
      left: auto;
      width: auto;
      margin: 8px;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 20px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .brand {
      padding: 0 4px;
    }

    .sideNav,
    .navGroup {
      flex: 0 0 auto;
      flex-direction: row;
      overflow: visible;
    }

    .navGroup {
      margin: 0;
      padding: 0 0 0 6px;
      border-top: 0;
      border-left: 1px solid rgba(15, 23, 42, 0.07);
    }

    .navItem {
      width: 44px;
      flex: 0 0 44px;
    }

    .sidebarFooter {
      margin: 0 0 0 auto;
      padding: 0 0 0 8px;
      border-top: 0;
      border-left: 1px solid rgba(15, 23, 42, 0.07);
    }

    .mainArea {
      margin-left: 0;
      padding: 8px 12px 32px;
    }

    h1.pageTitle {
      font-size: 28px;
    }

    .homeHealth {
      grid-template-columns: 1fr;
    }

    .healthCard {
      min-height: 0;
    }

    .placeholderCard {
      padding: 26px 22px;
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
