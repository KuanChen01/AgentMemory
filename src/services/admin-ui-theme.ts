export const ADMIN_UI_THEME = `
  :root {
    --bg-top: #f3f6fb;
    --bg-bottom: #dfe8f5;
    --glass: rgba(255, 255, 255, 0.58);
    --glass-strong: rgba(255, 255, 255, 0.76);
    --glass-border: rgba(255, 255, 255, 0.72);
    --glass-shadow: 0 24px 60px rgba(43, 71, 110, 0.18);
    --ink: #10243d;
    --muted: #62738a;
    --muted-soft: #7d8ea5;
    --line: rgba(16, 36, 61, 0.12);
    --line-strong: rgba(16, 36, 61, 0.18);
    --accent: #2f7cf7;
    --accent-soft: rgba(47, 124, 247, 0.14);
    --success: #13815b;
    --danger: #c5494e;
    --warning: #d58416;
    --card-radius: 28px;
    --panel-radius: 24px;
    --pill-radius: 999px;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
  }

  body {
    font-family: "SF Pro Display", "Segoe UI", "PingFang SC", sans-serif;
    color: var(--ink);
    background:
      radial-gradient(circle at 0% 0%, rgba(47, 124, 247, 0.20), transparent 28%),
      radial-gradient(circle at 100% 12%, rgba(115, 193, 255, 0.22), transparent 25%),
      radial-gradient(circle at 76% 100%, rgba(151, 113, 255, 0.16), transparent 24%),
      linear-gradient(180deg, var(--bg-top), var(--bg-bottom));
    background-attachment: fixed;
  }

  body::before,
  body::after {
    content: "";
    position: fixed;
    inset: auto;
    pointer-events: none;
    filter: blur(12px);
    z-index: 0;
  }

  body::before {
    top: 64px;
    left: 48px;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.42);
  }

  body::after {
    right: 80px;
    bottom: 40px;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: rgba(126, 184, 255, 0.18);
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  .shell {
    position: relative;
    z-index: 1;
    max-width: 1560px;
    margin: 0 auto;
    padding: 32px 28px 40px;
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
  .obsCard,
  .detailCard {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.46));
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .hero {
    border-radius: 34px;
    padding: 28px;
    overflow: hidden;
    position: relative;
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.38), transparent 28%),
      linear-gradient(180deg, transparent 52%, rgba(47, 124, 247, 0.05));
    pointer-events: none;
  }

  .heroLayout {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.9fr);
    gap: 24px;
    position: relative;
    z-index: 1;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 14px;
    border-radius: var(--pill-radius);
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.82);
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 700;
  }

  .heroTopRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .localeToggle {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px 8px 14px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.82);
    box-shadow: 0 10px 24px rgba(43, 71, 110, 0.08);
  }

  .localeToggleLabel {
    color: var(--muted-soft);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .localeToggleButtons {
    display: inline-flex;
    gap: 6px;
  }

  .localeButton {
    border: 0;
    min-width: 52px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    transition: 180ms ease;
  }

  .localeButton:hover {
    background: rgba(47, 124, 247, 0.08);
    color: var(--ink);
  }

  .localeButton.is-active {
    background: rgba(47, 124, 247, 0.16);
    color: var(--accent);
    box-shadow: inset 0 0 0 1px rgba(47, 124, 247, 0.14);
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 16px;
    font-size: clamp(34px, 4vw, 54px);
    line-height: 0.98;
    letter-spacing: -0.04em;
  }

  .lead {
    margin-top: 14px;
    max-width: 760px;
    line-height: 1.7;
    color: var(--muted);
  }

  .heroAside {
    display: grid;
    gap: 16px;
    align-content: start;
  }

  .statusCard,
  .infoCard {
    border-radius: var(--card-radius);
    padding: 20px 22px;
  }

  .statusLabel,
  .sectionEyebrow,
  .fieldLabel,
  .metaLabel {
    color: var(--muted-soft);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .statusValue {
    margin-top: 12px;
    font-size: 18px;
    line-height: 1.45;
    font-weight: 650;
  }

  .subtle {
    color: var(--muted);
  }

  .statusValue.is-saving {
    color: var(--warning);
  }

  .statsGrid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
    margin-top: 24px;
  }

  .metricTile {
    border-radius: 24px;
    padding: 18px 18px 20px;
  }

  .metricValue {
    margin-top: 12px;
    font-size: clamp(28px, 3vw, 38px);
    line-height: 1;
    letter-spacing: -0.04em;
    font-weight: 700;
  }

  .policyRow {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
  }

  .policyCard {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    border-radius: 26px;
    padding: 20px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(247, 250, 255, 0.5));
    border: 1px solid rgba(255, 255, 255, 0.74);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .policyCard.is-enabled.readPolicy {
    border-color: rgba(47, 124, 247, 0.34);
    box-shadow:
      0 20px 44px rgba(47, 124, 247, 0.10),
      inset 0 1px 0 rgba(255, 255, 255, 0.88);
  }

  .policyCard.is-enabled.writePolicy {
    border-color: rgba(19, 129, 91, 0.28);
    box-shadow:
      0 20px 44px rgba(19, 129, 91, 0.09),
      inset 0 1px 0 rgba(255, 255, 255, 0.88);
  }

  .policyCard.is-saving {
    transform: translateY(-1px);
  }

  .policyTitleRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 8px;
  }

  .policyTitle {
    font-size: 19px;
    letter-spacing: -0.02em;
  }

  .pill,
  .policyBadge,
  .scoreBadge,
  .tag,
  .statusChip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 12px;
    border-radius: var(--pill-radius);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .policyBadge.enabled,
  .statusChip.success {
    background: rgba(19, 129, 91, 0.14);
    color: var(--success);
  }

  .policyBadge.disabled,
  .statusChip.error {
    background: rgba(197, 73, 78, 0.12);
    color: var(--danger);
  }

  .policyBadge.saving,
  .statusChip.warning {
    background: rgba(213, 132, 22, 0.14);
    color: var(--warning);
  }

  .switch {
    position: relative;
    width: 62px;
    height: 36px;
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
    background: rgba(107, 125, 148, 0.28);
    box-shadow: inset 0 0 0 1px rgba(16, 36, 61, 0.10);
    transition: 180ms ease;
    cursor: pointer;
  }

  .slider::before {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 8px 18px rgba(16, 36, 61, 0.18);
    transition: 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .switch input:checked + .slider {
    background: rgba(47, 124, 247, 0.52);
  }

  .switch input:checked + .slider::before {
    transform: translateX(26px);
  }

  .switch input:disabled + .slider {
    cursor: wait;
    opacity: 0.7;
  }

  .dock {
    margin-top: 20px;
    border-radius: 24px;
    padding: 10px;
    position: sticky;
    top: 14px;
    z-index: 4;
  }

  .segmented {
    display: flex;
    gap: 8px;
    overflow: auto;
  }

  .segmentButton {
    border: 0;
    border-radius: 18px;
    background: transparent;
    padding: 12px 16px;
    color: var(--muted);
    cursor: pointer;
    transition: 180ms ease;
    white-space: nowrap;
    font-weight: 700;
  }

  .segmentButton.is-active {
    background: rgba(255, 255, 255, 0.84);
    color: var(--ink);
    box-shadow: 0 12px 28px rgba(43, 71, 110, 0.12);
  }

  .viewStack {
    margin-top: 22px;
    display: grid;
    gap: 18px;
  }

  .viewPanel {
    display: none;
    border-radius: 30px;
    padding: 24px;
  }

  .viewPanel.is-active {
    display: block;
  }

  .panelHeader {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: start;
    margin-bottom: 20px;
  }

  .panelTitle {
    margin-top: 6px;
    font-size: clamp(24px, 3vw, 34px);
    letter-spacing: -0.04em;
  }

  .panelLead {
    margin-top: 8px;
    max-width: 760px;
    line-height: 1.7;
    color: var(--muted);
  }

  .toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .toolbar.compact {
    grid-template-columns: 1.2fr 0.7fr auto;
  }

  .toolbar.wide {
    grid-template-columns: 1fr 1fr 1fr 1fr auto;
  }

  .fieldLabel {
    display: block;
    margin-bottom: 8px;
  }

  .textInput,
  .selectInput,
  .textArea,
  .button,
  .dateInput,
  .numberInput {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.78);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.76);
    color: var(--ink);
    padding: 13px 14px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
  }

  .textArea {
    min-height: 110px;
    resize: vertical;
  }

  .button {
    border: 0;
    cursor: pointer;
    font-weight: 700;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .button:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 28px rgba(43, 71, 110, 0.14);
  }

  .button.primary {
    background: linear-gradient(180deg, #3b8cff, #2369ef);
    color: white;
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
  .tagGrid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .metricBadge,
  .tag,
  .scoreBadge {
    background: rgba(255, 255, 255, 0.68);
    color: var(--muted);
    border: 1px solid rgba(255, 255, 255, 0.82);
  }

  .scoreBadge strong,
  .metricBadge strong {
    color: var(--ink);
  }

  .sectionGrid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
    gap: 18px;
    margin-top: 18px;
  }

  .stack {
    display: grid;
    gap: 16px;
  }

  .card,
  .detailCard {
    border-radius: 24px;
    padding: 18px 18px 20px;
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
    border-radius: 22px;
    padding: 16px 16px 18px;
  }

  .factValue,
  .recordSummary,
  .summaryLine,
  .mono,
  pre {
    line-height: 1.6;
  }

  .mono,
  pre {
    font-family: "Cascadia Code", "SF Mono", Consolas, monospace;
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
    border: 1px dashed rgba(16, 36, 61, 0.16);
    border-radius: 22px;
    padding: 18px;
    text-align: center;
    color: var(--muted);
    background: rgba(255, 255, 255, 0.32);
  }

  .statusLine {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }

  .statusDot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--success);
  }

  .statusLine.error .statusDot {
    background: var(--danger);
  }

  .statusLine.warning .statusDot {
    background: var(--warning);
  }

  .ledgerLayout {
    display: grid;
    grid-template-columns: minmax(340px, 1fr) minmax(320px, 0.9fr);
    gap: 18px;
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
    transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }

  .recordItem:hover {
    transform: translateY(-1px);
  }

  .recordItem.active {
    border-color: rgba(47, 124, 247, 0.32);
    box-shadow:
      0 18px 38px rgba(47, 124, 247, 0.10),
      inset 0 0 0 1px rgba(47, 124, 247, 0.14);
  }

  .detailPanel {
    min-height: 760px;
  }

  .metaRow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
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

  .factsTable {
    display: grid;
    gap: 12px;
  }

  .scoreGrid {
    display: grid;
    gap: 12px;
  }

  .splitGrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }

  .runtimeMetaGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .runtimeProjectList,
  .runtimeAgentList {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  .toolbarFooter {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(16, 36, 61, 0.12), transparent);
    margin: 18px 0;
  }

  .hidden {
    display: none !important;
  }

  @media (max-width: 1180px) {
    .heroTopRow {
      align-items: flex-start;
    }

    .localeToggle {
      width: 100%;
      justify-content: space-between;
    }

    .heroLayout,
    .sectionGrid,
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
  }
`;
