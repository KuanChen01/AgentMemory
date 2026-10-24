import { ACTIVITY_BG_DARK_WEBP, ACTIVITY_BG_LIGHT_WEBP } from './admin-ui-bg-assets';

export interface AdminUiWallpaper {
  id: string;
  key: string;
  label: string;
  tone: 'light' | 'dark';
  // Approximate perceived brightness (0-1). Auto glass tone compares it, scaled by the Dim slider, against 0.5.
  luma: number;
  angle: number;
  stops: Array<[string, number]>;
  blobs: Array<{ size: string; at: string; rgb: [number, number, number]; alpha: number }>;
  swatch: string;
}

// Wallpaper presets, drawn with gradients only. Light presets keep their blobs pale enough for dark text on
// light glass; dark presets keep theirs dim enough for light text on dark glass (see the contrast test).
export const ADMIN_UI_WALLPAPERS: AdminUiWallpaper[] = [
  {
    id: 'aurora', key: 'bg.presetAurora', label: 'Aurora', tone: 'light', luma: 0.9, angle: 165,
    stops: [['#edf3f9', 0], ['#e7eef6', 50], ['#f2ebe7', 100]],
    blobs: [
      { size: '46% 30%', at: '58% 14%', rgb: [125, 200, 240], alpha: 0.70 },
      { size: '30% 36%', at: '84% 28%', rgb: [112, 192, 240], alpha: 0.62 },
      { size: '30% 20%', at: '32% 10%', rgb: [140, 208, 242], alpha: 0.55 },
      { size: '18% 22%', at: '10% 16%', rgb: [140, 208, 242], alpha: 0.40 },
      { size: '28% 32%', at: '12% 56%', rgb: [186, 172, 250], alpha: 0.52 },
      { size: '24% 22%', at: '42% 64%', rgb: [196, 186, 255], alpha: 0.30 },
      { size: '36% 34%', at: '84% 88%', rgb: [255, 190, 150], alpha: 0.60 },
      { size: '24% 22%', at: '62% 98%', rgb: [255, 204, 170], alpha: 0.38 },
    ],
    swatch: 'linear-gradient(135deg, #7dc8f0, #baacfa 55%, #ffbe96)',
  },
  {
    id: 'sunset', key: 'bg.presetSunset', label: 'Sunset', tone: 'light', luma: 0.82, angle: 160,
    stops: [['#ffe2c2', 0], ['#ffc9b8', 40], ['#f8b6cf', 72], ['#d4c6f7', 100]],
    blobs: [
      { size: '44% 36%', at: '16% 12%', rgb: [255, 214, 120], alpha: 0.70 },
      { size: '30% 22%', at: '80% 12%', rgb: [255, 236, 214], alpha: 0.55 },
      { size: '34% 32%', at: '60% 40%', rgb: [255, 122, 160], alpha: 0.40 },
      { size: '28% 28%', at: '14% 88%', rgb: [255, 160, 100], alpha: 0.45 },
      { size: '40% 40%', at: '90% 90%', rgb: [150, 130, 250], alpha: 0.50 },
    ],
    swatch: 'linear-gradient(135deg, #ffd678, #ff8fae 55%, #a596f6)',
  },
  {
    id: 'lagoon', key: 'bg.presetLagoon', label: 'Lagoon', tone: 'light', luma: 0.84, angle: 150,
    stops: [['#d8f8f1', 0], ['#b3e8eb', 45], ['#a9cff3', 100]],
    blobs: [
      { size: '44% 38%', at: '14% 10%', rgb: [220, 255, 245], alpha: 0.80 },
      { size: '36% 36%', at: '82% 22%', rgb: [90, 200, 230], alpha: 0.45 },
      { size: '28% 28%', at: '18% 82%', rgb: [255, 200, 140], alpha: 0.38 },
      { size: '40% 36%', at: '70% 92%', rgb: [90, 140, 235], alpha: 0.38 },
    ],
    swatch: 'linear-gradient(135deg, #c8f5ec, #5ac8e6 55%, #5a8ceb)',
  },
  {
    id: 'mist', key: 'bg.presetMist', label: 'Mist', tone: 'light', luma: 0.93, angle: 160,
    stops: [['#f5f7fb', 0], ['#e8ecf5', 50], ['#e1e6f2', 100]],
    blobs: [
      { size: '38% 38%', at: '14% 10%', rgb: [207, 224, 255], alpha: 0.85 },
      { size: '30% 26%', at: '70% 20%', rgb: [226, 232, 250], alpha: 0.60 },
      { size: '40% 40%', at: '88% 90%', rgb: [255, 226, 209], alpha: 0.80 },
    ],
    swatch: 'linear-gradient(135deg, #f5f7fb, #cfe0ff 55%, #ffe2d1)',
  },
  {
    id: 'night', key: 'bg.presetNight', label: 'Night', tone: 'dark', luma: 0.1, angle: 150,
    stops: [['#070b1f', 0], ['#0e1440', 45], ['#1b0f3d', 100]],
    blobs: [
      { size: '46% 38%', at: '14% 8%', rgb: [43, 92, 255], alpha: 0.50 },
      { size: '40% 44%', at: '88% 40%', rgb: [155, 60, 255], alpha: 0.40 },
      { size: '22% 22%', at: '64% 46%', rgb: [255, 79, 163], alpha: 0.20 },
      { size: '44% 30%', at: '50% 100%', rgb: [0, 194, 199], alpha: 0.26 },
    ],
    swatch: 'linear-gradient(135deg, #0e1440, #2b5cff 50%, #9b3cff)',
  },
  {
    id: 'graphite', key: 'bg.presetGraphite', label: 'Graphite', tone: 'dark', luma: 0.16, angle: 150,
    stops: [['#1d1f24', 0], ['#2b2e36', 50], ['#15161a', 100]],
    blobs: [
      { size: '40% 40%', at: '12% 10%', rgb: [74, 84, 104], alpha: 0.75 },
      { size: '40% 44%', at: '90% 90%', rgb: [90, 74, 58], alpha: 0.65 },
    ],
    swatch: 'linear-gradient(135deg, #2b2e36, #4a5468 55%, #5a4a3a)',
  },
];

function renderWallpaperLayers(wallpaper: AdminUiWallpaper): string {
  const blobs = wallpaper.blobs.map(({ size, at, rgb, alpha }) =>
    `radial-gradient(${size} at ${at}, rgba(${rgb.join(', ')}, ${alpha.toFixed(2)}), rgba(${rgb.join(', ')}, 0) 74%)`);
  const base = `linear-gradient(${wallpaper.angle}deg, ${wallpaper.stops.map(([color, at]) => `${color} ${at}%`).join(', ')})`;
  return [...blobs, base].join(',\n      ');
}

// The selected preset feeds --wallpaper (the one fixed background layer) and the sidebar swatch; each picker
// thumbnail paints its own preset. Aurora doubles as the :root default so a page without settings looks unchanged.
const WALLPAPER_CSS = ADMIN_UI_WALLPAPERS.map((wallpaper, index) => `
  ${index === 0 ? ':root,\n  ' : ''}html[data-bg="${wallpaper.id}"] {
    --wallpaper: ${renderWallpaperLayers(wallpaper)};
    --wallpaper-base: ${wallpaper.stops[0][0]};
    --wallpaper-swatch: ${wallpaper.swatch};
  }

  .bgThumb[data-wall="${wallpaper.id}"] {
    background: ${renderWallpaperLayers(wallpaper)};
  }
`).join('');

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
    --text: var(--glass-text);
    --text-2: var(--glass-text-2);
    --text-3: var(--glass-text-3);
    --ok: #30d158;
    --warn: #ff9f0a;
    --err: #ff453a;
    --kind-outcome: #0a84ff;
    --kind-context: #8e6cf6;
    --kind-legacy: #a7adb8;
    /* Translucent glass. Every shell surface reads these, so the background picker can retune them live:
       --glass-scale comes from the Glass opacity slider, and html[data-glass="dark"] swaps the tint and text. */
    --glass-rgb-top: 255, 255, 255;
    --glass-rgb-bottom: 255, 255, 255;
    --glass-a-top: 0.30;
    --glass-a-bottom: 0.16;
    --glass-scale: 1;
    --glass-fill: linear-gradient(180deg, rgba(var(--glass-rgb-top), calc(var(--glass-a-top) * var(--glass-scale))), rgba(var(--glass-rgb-bottom), calc(var(--glass-a-bottom) * var(--glass-scale))));
    --glass-specular:
      linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0) 38%),
      radial-gradient(120% 60% at 0% 0%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 60%);
    /* Glass edge, shared by every glass surface (see "Glass edge" below). Light falls from the top left:
       --glass-border is the 1px rim (bright where it faces the light, lavender-grey where the edge turns
       away, a softer catch-light where light exits at the bottom), --glass-edge the slab's thickness
       (a crisp inner highlight, a faint shade under the top bevel, light pooling along the lower edge and a
       hairline contact shadow). --glass-border-well is the same rim lit from inside, for recessed tracks. */
    --glass-border:
      radial-gradient(130% 90% at 0% 0%, rgba(255, 255, 255, 0.70), rgba(255, 255, 255, 0) 55%),
      radial-gradient(90% 80% at 100% 100%, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 60%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.40) 24%, rgba(150, 140, 214, 0.26) 56%, rgba(255, 255, 255, 0.70));
    --glass-border-well: linear-gradient(180deg, rgba(120, 110, 196, 0.24), rgba(150, 140, 214, 0.08) 45%, rgba(255, 255, 255, 0.92));
    --glass-edge:
      inset 0 1px 0.5px rgba(255, 255, 255, 0.85),
      inset 0 0 3px 1px rgba(255, 255, 255, 0.22),
      inset 0 8px 10px -10px rgba(96, 84, 186, 0.20),
      inset 0 -12px 16px -14px rgba(255, 255, 255, 0.85),
      0 0.5px 1px rgba(64, 54, 150, 0.14);
    --glass-shadow:
      var(--glass-edge),
      0 12px 32px -8px rgba(20, 24, 70, 0.22),
      0 2px 6px rgba(20, 24, 70, 0.06);
    --glass-blur: blur(32px) saturate(175%);
    --glass-text: #0b1220;
    --glass-text-2: rgba(15, 23, 42, 0.74);
    --glass-text-3: rgba(15, 23, 42, 0.64);
    --shell-accent: #0a6fe0;
    --shell-line: rgba(15, 23, 42, 0.08);
    --shell-hover: rgba(255, 255, 255, 0.42);
    --nav-active-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.36));
    --nav-active-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.92);
    --chip-fill: rgba(255, 255, 255, 0.40);
    --chip-border: rgba(255, 255, 255, 0.55);
    --chip-highlight: rgba(255, 255, 255, 0.85);
    --pill-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0.38));
    --pill-shadow: var(--glass-edge), 0 10px 24px -12px rgba(30, 64, 120, 0.28);
    --popover-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.48));
    --popover-border: rgba(255, 255, 255, 0.7);
    --chart-axis: rgba(15, 23, 42, 0.16);
    --bar-legacy: #b9bfca;
    --warn-ink: #8a4b00;
    --err-ink: #a8231b;
    --ring-ok-ink: #0d9c86;
    --ring-warn-ink: #e07d0c;
    --ring-err-ink: #e5254a;
    --ring-track: rgba(140, 150, 180, 0.28);
    --pill-outcome-ink: #0059b8;
    --pill-context-ink: #5a3cc8;
    --pill-legacy-ink: #4b5563;
    --ring-disc-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.18));
    --ring-disc-border: rgba(255, 255, 255, 0.6);
    --ring-disc-highlight: rgba(255, 255, 255, 0.9);
    --bg-blur: 12px;
    --bg-brightness: 1;
    --r-card: 22px;
    --r-sidebar: 24px;
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
    background: var(--wallpaper-base, #e9f0f7);
    -webkit-font-smoothing: antialiased;
  }
${WALLPAPER_CSS}
  /* A custom upload: the object URL arrives from IndexedDB after first paint, so its average colour
     (saved with the settings) fills in until then. */
  html[data-bg="custom"] {
    --wallpaper: var(--bg-image, none) center / cover no-repeat, var(--bg-custom-color, #8a93a6);
    --wallpaper-base: var(--bg-custom-color, #8a93a6);
    --wallpaper-swatch: var(--bg-image, none) center / cover no-repeat, var(--bg-custom-color, #8a93a6);
  }

  /* Activity's default backdrop (only while no background has been picked; see applyBackdrop in the client).
     The artwork is inline. The solid colour is the field of each image, so it shows until the WebP paints. */
  html[data-act-bg="light"] {
    --wallpaper: url("${ACTIVITY_BG_LIGHT_WEBP}") center / cover no-repeat, #e7eefb;
    --wallpaper-base: #e7eefb;
    --wallpaper-swatch: #e7eefb;
  }

  html[data-act-bg="dark"] {
    --wallpaper: url("${ACTIVITY_BG_DARK_WEBP}") center / cover no-repeat, #0b1226;
    --wallpaper-base: #0b1226;
    --wallpaper-swatch: #0b1226;
  }

  /* The only background layer: one fixed, static element that the poll never repaints. The Wallpaper blur and
     Dim sliders only change its filter. */
  body::before {
    content: "";
    position: fixed;
    inset: -10%;
    z-index: -1;
    pointer-events: none;
    background: var(--wallpaper);
    filter: blur(var(--bg-blur)) brightness(var(--bg-brightness));
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

  /* Frosted glass: a thin translucent tint over the blurred wallpaper. isolation keeps the specular ::before
     (z-index -1) above the card's own fill but under its content. */
  .glassCard,
  .glassSurface {
    position: relative;
    isolation: isolate;
    background: var(--glass-fill);
    border: 1px solid transparent;
    box-shadow: var(--glass-shadow);
  }

  .glassCard {
    border-radius: var(--r-card);
  }

  .glassCard::before,
  .glassSurface::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background: var(--glass-specular);
  }

  /* Real blur only on static surfaces of the visible view: the sidebar, the five health cards and the three
     content cards on Home (9 elements). Rows, chips, pills and the ring stay plain tints, and the 5 s poll only
     edits text and classes inside these cards, so no blurred element is ever re-created. */
  .sidebar.glassBlur,
  .appView.is-active .glassBlur {
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }

  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    :root {
      --glass-a-top: 0.84;
      --glass-a-bottom: 0.74;
    }

    html[data-glass="dark"]:root {
      --glass-a-top: 0.86;
      --glass-a-bottom: 0.80;
    }
  }

  /* Glass edge. Every glass surface keeps a transparent 1px border (so nothing moves) and paints its rim on
     top of it: a gradient ring cut out with a mask, so the edge catches light unevenly like a real slab
     instead of a flat white stroke. The thickness half lives in --glass-edge, inside each surface's shadow. */
  .glassPill,
  .actChip,
  .actPopup,
  .actIconButton,
  .actSegment,
  .actSegmented,
  .actDrawerClose,
  .actPane,
  .memGroup,
  .memSearch,
  .memMore {
    position: relative;
  }

  .glassCard::after,
  .glassSurface::after,
  .glassPill::after,
  .actCard::after,
  .actChip::after,
  .actPopup::after,
  .actIconButton::after,
  .actSegment[aria-pressed="true"]::after,
  .actSegmented::after,
  .actDrawer::after,
  .actDrawerClose::after,
  .actPane::after,
  .memGroup::after,
  .memSearch::after,
  .memMore::after,
  .memRow.is-open::after {
    content: "";
    position: absolute;
    inset: -1px;
    padding: 1px;
    border-radius: inherit;
    pointer-events: none;
    background: var(--glass-border);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
  }

  .actSegmented::after,
  .memSearch::after {
    background: var(--glass-border-well);
  }

  /* Drawer panes sit inside the drawer's own glass: same rim, a little less light. */
  .actPane::after {
    opacity: 0.75;
  }

  .appShell {
    min-height: 100vh;
    color: var(--text);
    font-size: 13.5px;
  }

  /* Legacy panels keep their original 16px base size and their own light surfaces and ink. */
  .devToolsView {
    color: var(--ink);
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
    background: var(--shell-hover);
  }

  .navItem.is-active {
    background: var(--nav-active-fill);
    color: var(--shell-accent);
    font-weight: 600;
    box-shadow: var(--nav-active-shadow);
  }

  .navIcon {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    color: var(--text-2);
  }

  .navItem.is-active .navIcon {
    color: var(--shell-accent);
  }

  .navLabel {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navGroupLabel {
    margin: 10px 0 2px;
    padding: 0 12px;
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
  }

  .navGroupLabel:first-child {
    margin-top: 0;
  }

  .navGroup {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--shell-line);
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
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 10px;
    padding: 10px 4px 2px;
    border-top: 1px solid var(--shell-line);
  }

  .devToggle,
  .sidebarRow {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 4px 8px;
    border-radius: 12px;
    color: var(--text-2);
    font-size: 13.5px;
    cursor: pointer;
  }

  .sidebarRow {
    width: 100%;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: left;
    transition: background 180ms var(--ease-out);
  }

  .sidebarRow:hover,
  .sidebarRow[aria-expanded="true"] {
    background: var(--shell-hover);
  }

  /* Same pill as Developer tools, shown on: the row still opens the background picker. */
  .bgSwatch {
    position: relative;
    width: 44px;
    height: 26px;
    flex: 0 0 44px;
    border-radius: 999px;
    background: #0a84ff;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
  }

  .bgSwatch::after {
    content: "";
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22), 0 0 0 0.5px rgba(15, 23, 42, 0.06);
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
    font-size: 40px;
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
    background: var(--pill-fill);
    border: 1px solid transparent;
    box-shadow: var(--pill-shadow);
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  /* Read and Write share one glass pill; each switch is a soft segment inside it. */
  .policyGroup {
    gap: 2px;
    padding: 0 5px;
  }

  .policyPill {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 11px;
    border: 1px solid transparent;
    border-radius: 999px;
    cursor: pointer;
    user-select: none;
    transition: background 180ms var(--ease-out), border-color 180ms var(--ease-out), color 180ms var(--ease-out);
  }

  .policyPill:hover {
    background: var(--shell-hover);
  }

  .policyPill:focus-within {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.24);
  }

  .pillLabel {
    font-weight: 500;
  }

  .pillDot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 50%;
    background: var(--kind-legacy);
  }

  .policyPill.readPolicy.is-enabled .pillDot {
    background: var(--accent);
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.16);
  }

  .policyPill.writePolicy.is-enabled .pillDot {
    background: var(--ok);
    box-shadow: 0 0 0 3px rgba(48, 209, 88, 0.18);
  }

  /* "On" is the quiet default and stays for screen readers only; Off and Saving show as words. */
  .policyPill.is-enabled:not(.is-saving) .policyBadge {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
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

  /* Language menu: a compact "EN ⌄" pill and a small glass list under it. */
  .localeMenu {
    position: relative;
  }

  .localeTrigger {
    gap: 10px;
    min-width: 84px;
    padding: 0 14px 0 18px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms var(--ease-out);
  }

  .localeTrigger:hover,
  .localeTrigger[aria-expanded="true"] {
    background: var(--shell-hover);
  }

  .localeTrigger:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.3);
  }

  .localeTriggerValue {
    flex: 1 1 auto;
  }

  .localeTriggerIcon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--text-2);
  }

  .localeList {
    position: absolute;
    z-index: 45;
    top: calc(100% + 8px);
    right: 0;
    display: grid;
    gap: 2px;
    min-width: 168px;
    padding: 6px;
    border: 1px solid var(--popover-border);
    border-radius: 16px;
    background: var(--glass-specular), var(--popover-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 24px 60px -20px rgba(20, 24, 80, 0.45), 0 4px 14px rgba(20, 24, 80, 0.10);
    animation: popoverEnter 160ms var(--ease-out) both;
  }

  .localeMenu.is-active .localeList {
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }

  .topActions .localeButton {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
  }

  .topActions .localeButton:hover,
  .topActions .localeButton:focus-visible {
    transform: none;
    background: var(--shell-hover);
    outline: none;
  }

  .topActions .localeButton.is-active {
    background: transparent;
    color: var(--shell-accent);
    font-weight: 600;
  }

  .localeCode {
    min-width: 30px;
    font-weight: 600;
  }

  .localeName {
    color: var(--text-2);
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
    border: 1px solid var(--chip-border);
    background: var(--chip-fill);
    box-shadow: inset 0 1px 0 var(--chip-highlight);
    color: var(--text);
    font-size: 14px;
    white-space: nowrap;
  }

  .kindChip.kind-legacy { color: var(--text-2); }

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

  .chartSvg .chartGrid { stroke: var(--shell-line); stroke-width: 1; }
  .chartSvg .chartAxis { stroke: var(--chart-axis); stroke-width: 1; }
  .chartSvg .barOutcome { fill: var(--kind-outcome); }
  .chartSvg .barContext { fill: var(--kind-context); }
  .chartSvg .barLegacy { fill: var(--bar-legacy); }
  .chartSvg .chartMarker { stroke: var(--text-2); stroke-width: 1.4; stroke-dasharray: 4 4; }
  .chartSvg .chartMarkerDot { fill: var(--text); }
  .chartSvg .chartMarkerLabel { fill: var(--text-2); font-size: 11.5px; }
  .chartSvg .barGroup:hover rect { opacity: 0.82; }

  .chipRow {
    margin-top: 12px;
  }

  .metaChip {
    font-size: 13.5px;
  }

  .metaChip.is-agent {
    color: var(--shell-accent);
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

  /* Status hero: the health ring above the title when nothing needs attention, a compact row above the list
     otherwise. */
  .statusHero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    min-height: 280px;
    padding: 10px;
    text-align: center;
  }

  .statusHero.is-compact {
    flex-direction: row;
    justify-content: flex-start;
    gap: 16px;
    min-height: 0;
    padding: 10px 2px 2px;
    text-align: left;
  }

  .statusText,
  .allClear {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .statusHero.is-compact .statusText,
  .statusHero.is-compact .allClear {
    align-items: flex-start;
    gap: 4px;
  }

  .allClearTitle {
    color: var(--text);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .statusHero.is-compact .allClearTitle {
    font-size: 19px;
  }

  .allClearLead {
    max-width: 320px;
    color: var(--text-2);
    font-size: 13.5px;
    line-height: 1.5;
  }

  .statusMeta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }

  .statusHero.is-compact .statusMeta {
    justify-content: flex-start;
    margin-top: 4px;
  }

  .statusMetaChip {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 11px;
    border: 1px solid var(--chip-border);
    border-radius: 999px;
    background: var(--chip-fill);
    color: var(--text-2);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .statusMetaChip[data-tone="warn"] { color: var(--warn-ink); }
  .statusMetaChip[data-tone="error"] { color: var(--err-ink); }

  /* Health ring: glyph in a frosted disc, five arc segments (one per health check). The disc is a plain tint,
     not a backdrop-filter: inside the already-blurred card a nested blur would only see the card itself. */
  .healthRing {
    --ring-c1: #34e0a1;
    --ring-c2: #0fb5a8;
    --ring-glow: rgba(30, 210, 160, 0.55);
    --ring-ink: var(--ring-ok-ink);
    position: relative;
    flex: 0 0 auto;
    width: var(--ring-size, 116px);
    height: var(--ring-size, 116px);
  }

  .statusHero.is-compact .healthRing {
    --ring-size: 64px;
  }

  .healthRing[data-tone="warn"] {
    --ring-c1: #ffc845;
    --ring-c2: #ff8a1f;
    --ring-glow: rgba(255, 170, 40, 0.55);
    --ring-ink: var(--ring-warn-ink);
  }

  .healthRing[data-tone="error"] {
    --ring-c1: #ff6b7a;
    --ring-c2: #e5254a;
    --ring-glow: rgba(240, 60, 90, 0.55);
    --ring-ink: var(--ring-err-ink);
  }

  .healthRing[data-tone="unknown"] {
    --ring-glow: rgba(140, 150, 180, 0.35);
    --ring-ink: var(--text-3);
  }

  .ringGlow,
  .ringDisc {
    position: absolute;
    border-radius: 50%;
  }

  .ringGlow {
    inset: -14%;
    background: radial-gradient(circle, var(--ring-glow), rgba(0, 0, 0, 0) 62%);
    opacity: 0.45;
  }

  .ringDisc {
    inset: 12%;
    border: 1px solid var(--ring-disc-border);
    background: var(--ring-disc-fill);
    box-shadow: inset 0 1px 0 var(--ring-disc-highlight), 0 8px 22px -6px var(--ring-glow), 0 2px 6px rgba(20, 24, 70, 0.08);
  }

  .ringArcs {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    transform: rotate(-90deg);
  }

  .ringStopA { stop-color: var(--ring-c1); }
  .ringStopB { stop-color: var(--ring-c2); }

  .ringSeg {
    fill: none;
    stroke: var(--ring-track);
    stroke-width: 4.2;
    stroke-linecap: round;
    transition: stroke 240ms var(--ease-out);
  }

  .ringSeg[data-state="ok"] { stroke: url(#amRingGradient); }
  .ringSeg[data-state="warn"] { stroke: rgba(255, 159, 10, 0.42); }
  .ringSeg[data-state="error"] { stroke: rgba(255, 69, 58, 0.48); }

  .ringGlyph {
    position: absolute;
    inset: 0;
    width: 34%;
    height: 34%;
    margin: auto;
    fill: none;
    stroke: var(--ring-ink);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ringGlyph circle {
    fill: var(--ring-ink);
    stroke: none;
  }

  .glyphOk,
  .glyphWarn,
  .glyphError {
    display: none;
  }

  .healthRing[data-tone="ok"] .glyphOk,
  .healthRing[data-tone="warn"] .glyphWarn,
  .healthRing[data-tone="error"] .glyphError {
    display: inline;
  }

  /* One glow swell when the overall state changes; never a looping animation. */
  .healthRing.is-pulsing .ringGlow {
    animation: ringPulse 1.4s var(--ease-out) 2;
  }

  @keyframes ringPulse {
    0%, 100% { opacity: 0.45; transform: scale(1); }
    45% { opacity: 0.9; transform: scale(1.08); }
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
    border: 1px solid var(--chip-border);
    border-radius: 14px;
    background: var(--chip-fill);
    box-shadow: inset 0 1px 0 var(--chip-highlight);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    transition: background 160ms var(--ease-out);
  }

  .attentionItem:hover {
    background: var(--shell-hover);
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
    color: var(--shell-accent);
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
    border-bottom: 1px solid var(--shell-line);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }

  .recentTable td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--shell-line);
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
    background: var(--shell-hover);
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

  .kindPill.kind-outcome { background: rgba(10, 132, 255, 0.14); color: var(--pill-outcome-ink); }
  .kindPill.kind-context { background: rgba(142, 108, 246, 0.16); color: var(--pill-context-ink); }
  .kindPill.kind-legacy { background: rgba(167, 173, 184, 0.22); color: var(--pill-legacy-ink); }
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
    background: linear-gradient(180deg, rgba(10, 132, 255, 0.16), rgba(10, 132, 255, 0.06)), var(--chip-fill);
    box-shadow: inset 0 1px 0 var(--chip-highlight), 0 8px 20px -12px rgba(10, 132, 255, 0.5);
    color: var(--shell-accent);
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
    background: rgba(10, 132, 255, 0.14);
    color: var(--pill-outcome-ink);
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
    border-top: 1px solid var(--shell-line);
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

  /* Dark glass (dark presets, dark uploads, or the Dark tone): the same surfaces with a deep-blue tint and
     light text. Legacy Developer tools panels keep their own light surfaces. */
  html[data-glass="dark"] {
    --glass-rgb-top: 40, 48, 90;
    --glass-rgb-bottom: 20, 24, 56;
    --glass-a-top: 0.34;
    --glass-a-bottom: 0.22;
    --glass-specular:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 35%),
      radial-gradient(120% 60% at 0% 0%, rgba(150, 180, 255, 0.12), rgba(255, 255, 255, 0) 60%);
    --glass-border:
      radial-gradient(130% 90% at 0% 0%, rgba(214, 226, 255, 0.42), rgba(214, 226, 255, 0) 55%),
      radial-gradient(90% 80% at 100% 100%, rgba(150, 180, 255, 0.26), rgba(150, 180, 255, 0) 60%),
      linear-gradient(180deg, rgba(206, 220, 255, 0.46), rgba(160, 185, 255, 0.16) 24%, rgba(110, 140, 240, 0.07) 56%, rgba(150, 178, 255, 0.24));
    --glass-border-well: linear-gradient(180deg, rgba(0, 3, 16, 0.50), rgba(110, 140, 240, 0.06) 45%, rgba(160, 188, 255, 0.30));
    --glass-edge:
      inset 0 1px 0.5px rgba(225, 233, 255, 0.16),
      inset 0 0 3px 1px rgba(150, 180, 255, 0.06),
      inset 0 8px 10px -10px rgba(0, 3, 18, 0.50),
      inset 0 -12px 16px -14px rgba(130, 160, 255, 0.30),
      0 0.5px 1px rgba(0, 2, 14, 0.45);
    --glass-shadow:
      var(--glass-edge),
      0 16px 40px -10px rgba(0, 0, 0, 0.5);
    --glass-text: #f2f5ff;
    --glass-text-2: rgba(235, 240, 255, 0.78);
    --glass-text-3: rgba(235, 240, 255, 0.62);
    --shell-accent: #9fc2ff;
    --shell-line: rgba(255, 255, 255, 0.12);
    --shell-hover: rgba(255, 255, 255, 0.09);
    --nav-active-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06));
    --nav-active-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
    --chip-fill: rgba(255, 255, 255, 0.08);
    --chip-border: rgba(255, 255, 255, 0.14);
    --chip-highlight: rgba(255, 255, 255, 0.10);
    --pill-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.07));
    --pill-shadow: var(--glass-edge), 0 10px 24px -12px rgba(0, 0, 0, 0.5);
    --popover-fill: linear-gradient(180deg, rgba(36, 42, 82, 0.78), rgba(22, 26, 58, 0.70));
    --popover-border: rgba(255, 255, 255, 0.18);
    --chart-axis: rgba(255, 255, 255, 0.22);
    --bar-legacy: rgba(235, 240, 255, 0.42);
    --warn-ink: #ffc46b;
    --err-ink: #ffa19a;
    --ring-ok-ink: #34e0a1;
    --ring-warn-ink: #ffc845;
    --ring-err-ink: #ff7b88;
    --ring-track: rgba(200, 210, 240, 0.2);
    --ring-disc-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05));
    --ring-disc-border: rgba(255, 255, 255, 0.25);
    --ring-disc-highlight: rgba(255, 255, 255, 0.35);
    --pill-outcome-ink: #a8c8ff;
    --pill-context-ink: #cdb8ff;
    --pill-legacy-ink: #d3d8e2;
  }

  html[data-glass="dark"] .brandName,
  html[data-glass="dark"] .brand {
    color: var(--text);
  }

  html[data-glass="dark"] .iosSwitch .track {
    background: rgba(255, 255, 255, 0.18);
  }

  html[data-glass="dark"] .policyPill.is-disabled {
    background: rgba(255, 69, 58, 0.2);
    border-color: rgba(255, 120, 110, 0.45);
    color: #ffc2bd;
  }

  html[data-glass="dark"] .countBadge {
    background: rgba(255, 159, 10, 0.2);
    color: var(--warn-ink);
  }

  html[data-glass="dark"] .countBadge.is-error {
    background: rgba(255, 69, 58, 0.2);
    color: var(--err-ink);
  }

  html[data-glass="dark"] .linkButton:hover {
    background: rgba(159, 194, 255, 0.12);
  }

  /* ---------- Activity ---------- */

  /* Activity tokens. Light glass is milky white with a faint periwinkle shadow; dark glass is deep navy with a
     cool rim. The shell's own tokens (--text, --shell-hover, ...) still drive ink, so a user background keeps
     working; these only shape Activity's surfaces. Memory and Pipeline share them. */
  .skillsView,
  .projectsView,
  .activityView,
  .memoryView,
  .pipelineView,
  .digestsView {
    position: relative;
    --a-glass: linear-gradient(180deg, rgba(255, 255, 255, calc(0.62 * var(--glass-scale))), rgba(255, 255, 255, calc(0.40 * var(--glass-scale))));
    --a-glass-shadow: var(--glass-edge), 0 1px 2px rgba(60, 70, 150, 0.05), 0 18px 40px -22px rgba(70, 80, 180, 0.38);
    --a-card-fill: linear-gradient(180deg, rgba(255, 255, 255, calc(0.26 * var(--glass-scale))), rgba(255, 255, 255, calc(0.12 * var(--glass-scale))));
    --a-card-shadow: var(--glass-edge), 0 1px 2px rgba(60, 70, 150, 0.04), 0 12px 26px -16px rgba(70, 80, 180, 0.28);
    --a-card-hover-shadow: var(--glass-edge), 0 2px 4px rgba(60, 70, 150, 0.05), 0 18px 34px -16px rgba(70, 80, 180, 0.38);
    --a-control-fill: linear-gradient(180deg, rgba(255, 255, 255, calc(0.62 * var(--glass-scale))), rgba(255, 255, 255, calc(0.42 * var(--glass-scale))));
    --a-control-shadow: var(--glass-edge), 0 6px 16px -12px rgba(60, 70, 160, 0.40);
    --a-track-fill: rgba(236, 238, 250, calc(0.46 * var(--glass-scale)));
    --a-seg-on-fill: linear-gradient(180deg, #ffffff, rgba(244, 248, 255, 0.94));
    --a-seg-on-border: transparent;
    --a-seg-on-ink: var(--glass-text);
    --a-seg-on-shadow: var(--glass-edge), 0 1px 2px rgba(40, 70, 170, 0.08), 0 8px 18px -8px rgba(40, 90, 220, 0.38);
    --a-on-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 250, 255, 0.70));
    --a-on-border: rgba(10, 122, 255, 0.40);
    --a-on-ink: #0a63d1;
    --a-on-shadow: var(--glass-edge), 0 6px 16px -10px rgba(10, 100, 240, 0.45);
    --a-tag-fill: rgba(118, 126, 168, 0.12);
    --a-outcome-fill: rgba(10, 132, 255, 0.11);
    --a-outcome-ink: #0a63d1;
    --a-outcome-dot: #0a84ff;
    --a-context-fill: rgba(130, 100, 240, 0.12);
    --a-context-ink: #5a3fc4;
    --a-context-dot: #8e6cf6;
    --a-legacy-fill: rgba(140, 148, 170, 0.16);
    --a-legacy-ink: #525a6e;
    --a-mcp-fill: rgba(240, 160, 70, 0.16);
    --a-mcp-border: rgba(226, 150, 74, 0.42);
    --a-mcp-ink: #9a5212;
    --a-fallback-fill: rgba(255, 159, 10, 0.15);
    --a-warn: #d46f08;
    --a-link: #0a6fe0;
    --a-bar: linear-gradient(90deg, #2a7fff, #64adff);
    --a-bar-legacy: linear-gradient(90deg, rgba(140, 148, 172, 0.80), rgba(170, 176, 198, 0.70));
    --a-bar-track: rgba(120, 128, 170, 0.13);
    --a-spark: #3b88ff;
    --a-spark-zero: rgba(59, 136, 255, 0.50);
    --a-line: rgba(40, 50, 100, 0.10);
    --a-drawer-fill: linear-gradient(180deg, rgba(252, 252, 255, 0.84), rgba(246, 247, 255, 0.74));
    --a-drawer-shadow: var(--glass-edge), 0 40px 90px -30px rgba(40, 50, 140, 0.45), 0 6px 18px rgba(40, 50, 140, 0.10);
    --a-scrim: rgba(40, 46, 90, 0.22);
    --a-section-fill: rgba(255, 255, 255, 0.52);
    --a-well-blur: blur(18px) saturate(145%);
    /* Project dots: ten evenly spread, muted hues; the client hands each visible project its own slot. */
    --proj-0: #5fb08a;
    --proj-1: #7a86ea;
    --proj-2: #e58a4e;
    --proj-3: #a07ae6;
    --proj-4: #cda23c;
    --proj-5: #e46f8a;
    --proj-6: #46a8dc;
    --proj-7: #9bbd4a;
    --proj-8: #d877c8;
    --proj-9: #4fb8b0;
    --proj-none: #a3a9b6;
  }

  html[data-glass="dark"] .skillsView,
  html[data-glass="dark"] .projectsView,
  html[data-glass="dark"] .activityView,
  html[data-glass="dark"] .memoryView,
  html[data-glass="dark"] .pipelineView,
  html[data-glass="dark"] .digestsView {
    --a-well-blur: blur(22px) saturate(160%);
    --a-glass: linear-gradient(180deg, rgba(30, 42, 88, calc(0.50 * var(--glass-scale))), rgba(12, 18, 46, calc(0.46 * var(--glass-scale))));
    --a-glass-shadow: var(--glass-edge), 0 22px 48px -20px rgba(0, 0, 0, 0.70);
    --a-card-fill: linear-gradient(180deg, rgba(30, 42, 88, calc(0.62 * var(--glass-scale))), rgba(14, 20, 50, calc(0.58 * var(--glass-scale))));
    --a-card-shadow: var(--glass-edge), 0 16px 30px -18px rgba(0, 0, 0, 0.80);
    --a-card-hover-shadow: var(--glass-edge), 0 0 0 1px rgba(110, 160, 255, 0.18), 0 20px 36px -18px rgba(0, 0, 0, 0.85);
    --a-control-fill: linear-gradient(180deg, rgba(40, 52, 100, calc(0.55 * var(--glass-scale))), rgba(20, 28, 64, calc(0.45 * var(--glass-scale))));
    --a-control-shadow: var(--glass-edge);
    --a-track-fill: rgba(8, 12, 32, calc(0.42 * var(--glass-scale)));
    --a-seg-on-fill: linear-gradient(180deg, #3586ff, #1556dc);
    --a-seg-on-border: rgba(140, 190, 255, 0.55);
    --a-seg-on-ink: #ffffff;
    --a-seg-on-shadow: var(--glass-edge), 0 0 0 1px rgba(60, 130, 255, 0.30), 0 0 24px -4px rgba(40, 110, 255, 0.80);
    --a-on-fill: linear-gradient(180deg, rgba(36, 92, 220, 0.42), rgba(20, 60, 170, 0.32));
    --a-on-border: rgba(90, 160, 255, 0.85);
    --a-on-ink: #d6e6ff;
    --a-on-shadow: var(--glass-edge), 0 0 18px -4px rgba(40, 120, 255, 0.75);
    --a-tag-fill: rgba(255, 255, 255, 0.10);
    --a-outcome-fill: rgba(30, 110, 255, 0.24);
    --a-outcome-ink: #a9cbff;
    --a-outcome-dot: #3d8bff;
    --a-context-fill: rgba(140, 110, 255, 0.24);
    --a-context-ink: #cbb8ff;
    --a-context-dot: #9a7cff;
    --a-legacy-fill: rgba(255, 255, 255, 0.10);
    --a-legacy-ink: #d3d8e6;
    --a-mcp-fill: rgba(255, 170, 90, 0.16);
    --a-mcp-border: rgba(255, 170, 90, 0.45);
    --a-mcp-ink: #ffc58a;
    --a-fallback-fill: rgba(255, 159, 10, 0.18);
    --a-warn: #ffad42;
    --a-link: #6fb0ff;
    --a-bar: linear-gradient(90deg, #2f7cff, #6bb2ff);
    --a-bar-legacy: linear-gradient(90deg, rgba(150, 160, 190, 0.75), rgba(190, 198, 220, 0.70));
    --a-bar-track: rgba(255, 255, 255, 0.09);
    --a-spark: #4b93ff;
    --a-spark-zero: rgba(110, 165, 255, 0.60);
    --a-line: rgba(255, 255, 255, 0.10);
    --a-drawer-fill: linear-gradient(180deg, rgba(24, 34, 74, 0.86), rgba(10, 15, 40, 0.82));
    --a-drawer-shadow: var(--glass-edge), 0 40px 90px -30px rgba(0, 0, 0, 0.85);
    --a-scrim: rgba(2, 4, 16, 0.50);
    --a-section-fill: rgba(255, 255, 255, 0.05);
    --proj-0: #5cc596;
    --proj-1: #8b96ff;
    --proj-2: #f29a5c;
    --proj-3: #b08cff;
    --proj-4: #e2b84a;
    --proj-5: #f2809b;
    --proj-6: #4fb8f0;
    --proj-7: #acd25a;
    --proj-8: #e888d8;
    --proj-9: #5ccac2;
    --proj-none: #8a91a6;
  }

  /* Summary: the subtitle of the page title in the shared top bar. */
  .actSummary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: -14px 0 20px 2px;
    color: var(--text-2);
    font-size: 15.5px;
    font-variant-numeric: tabular-nums;
  }

  .policyBanner:not([hidden]) ~ .activityView .actSummary {
    margin-top: 0;
  }

  .actSum strong {
    color: var(--text);
    font-weight: 600;
  }

  .actSumSep {
    color: var(--text-3);
  }

  .actSumToggle {
    margin: 0 -6px;
    padding: 2px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: background 160ms var(--ease-out), color 160ms var(--ease-out);
  }

  .actSumToggle:hover {
    background: var(--shell-hover);
  }

  .actSumToggle[aria-pressed="true"],
  .actSumToggle[aria-pressed="true"] strong {
    color: var(--a-link);
  }

  .actSpark {
    display: inline-flex;
    align-items: flex-end;
    height: 24px;
    margin-left: 10px;
  }

  .actSparkSvg {
    display: block;
    height: 24px;
    overflow: visible;
  }

  .actSparkSvg .sparkBar { fill: var(--a-spark); }
  .actSparkSvg .sparkZero { fill: var(--a-spark-zero); }

  /* Toolbar: one long glass capsule. */
  .activityView .actToolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    padding: 7px 8px 7px 7px;
    border: 1px solid transparent;
    border-radius: 34px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .actSegmented {
    display: inline-flex;
    gap: 2px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 28px;
    background: var(--a-track-fill);
    box-shadow: inset 0 1px 3px rgba(20, 30, 80, 0.06);
  }

  .actSegment {
    min-height: 40px;
    padding: 0 24px;
    border: 1px solid transparent;
    border-radius: 22px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 200ms var(--ease-out), color 200ms var(--ease-out), box-shadow 200ms var(--ease-out), border-color 200ms var(--ease-out);
  }

  .actSegment:hover {
    background: var(--shell-hover);
  }

  .actSegment[aria-pressed="true"] {
    border-color: var(--a-seg-on-border);
    background: var(--a-seg-on-fill);
    box-shadow: var(--a-seg-on-shadow);
    color: var(--a-seg-on-ink);
    font-weight: 600;
  }

  .actToolbarSep {
    width: 1px;
    height: 28px;
    margin: 0 2px;
    background: var(--a-line);
  }

  .actPopup {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
    min-height: 42px;
    padding: 0 14px 0 17px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
    transition: background 160ms var(--ease-out), border-color 160ms var(--ease-out);
  }

  .actPopup:hover,
  .actPopup[aria-expanded="true"] {
    background: var(--shell-hover);
  }

  .actPopupLabel {
    color: var(--text-2);
    white-space: nowrap;
  }

  .actPopupValue {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actPopup.is-filtered {
    border-color: var(--a-on-border);
  }

  .actPopup.is-filtered .actPopupValue {
    color: var(--a-on-ink);
  }

  .actPopupIcon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    color: var(--text-2);
  }

  .actToolbarEnd {
    display: flex;
    flex: 1 1 240px;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    min-width: 0;
    margin-left: auto;
  }

  .actRangeText {
    min-width: 0;
    overflow: hidden;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actRange {
    color: var(--text);
  }

  .actUpdated {
    color: var(--text-2);
  }

  .actUpdated.is-warn {
    color: var(--warn-ink);
    font-weight: 600;
  }

  .actIconButton {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 50%;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--text);
    cursor: pointer;
  }

  .actIconButton[aria-disabled="true"] {
    cursor: default;
  }

  .actIcon {
    width: 18px;
    height: 18px;
  }

  /* Project chips: one slim row that scrolls sideways and never wraps. */
  .actChips {
    display: flex;
    gap: 10px;
    margin: 14px -6px 0;
    padding: 4px 6px 10px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .actChips::-webkit-scrollbar {
    display: none;
  }

  .actChips.is-overflowing {
    -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent);
    mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent);
  }

  .actChip {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 9px;
    min-height: 38px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 160ms var(--ease-out), border-color 160ms var(--ease-out), color 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
  }

  .actChip:hover {
    background: var(--shell-hover);
  }

  .actChip[aria-pressed="true"] {
    border-color: var(--a-on-border);
    background: var(--a-on-fill);
    box-shadow: var(--a-on-shadow);
    color: var(--a-on-ink);
  }

  .actChipName {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actChipCount {
    margin-left: 4px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .actChip[aria-pressed="true"] .actChipCount {
    color: inherit;
  }

  .actDot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 50%;
    background: var(--proj-none);
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08);
  }

  .actDot[data-hue="0"] { background: var(--proj-0); }
  .actDot[data-hue="1"] { background: var(--proj-1); }
  .actDot[data-hue="2"] { background: var(--proj-2); }
  .actDot[data-hue="3"] { background: var(--proj-3); }
  .actDot[data-hue="4"] { background: var(--proj-4); }
  .actDot[data-hue="5"] { background: var(--proj-5); }
  .actDot[data-hue="6"] { background: var(--proj-6); }
  .actDot[data-hue="7"] { background: var(--proj-7); }
  .actDot[data-hue="8"] { background: var(--proj-8); }
  .actDot[data-hue="9"] { background: var(--proj-9); }

  /* Board: two day columns and the Earlier rail. */
  .actBoard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
    align-items: start;
    gap: 22px;
    margin-top: 14px;
  }

  .actMain {
    min-width: 0;
  }

  .actColumns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px;
  }

  .actColumns.is-single {
    grid-template-columns: minmax(0, 1fr);
  }

  .actColumns.is-single .actCards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  }

  .actColumn {
    min-width: 0;
  }

  .actColumnHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 34px;
    padding: 0 4px;
  }

  .actColumnTitle {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    margin: 0;
    color: var(--text);
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.015em;
    white-space: nowrap;
  }

  .actColumnDate {
    min-width: 0;
    overflow: hidden;
    color: var(--text-2);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0;
    text-overflow: ellipsis;
  }

  .actDayPills {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 6px;
  }

  .actDayPill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 13.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .actDayPill .kindDot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .actDayPill.kind-outcome { background: var(--a-outcome-fill); color: var(--a-outcome-ink); box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.16); }
  .actDayPill.kind-context { background: var(--a-context-fill); color: var(--a-context-ink); box-shadow: inset 0 0 0 1px rgba(130, 100, 240, 0.16); }
  .actDayPill.kind-legacy { background: var(--a-legacy-fill); color: var(--a-legacy-ink); }
  .actDayPill.kind-outcome .kindDot { background: var(--a-outcome-dot); }
  .actDayPill.kind-context .kindDot { background: var(--a-context-dot); }

  .actColumnBody {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
  }

  .actCards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .actCard {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding: 13px 18px 13px;
    border: 1px solid transparent;
    border-radius: 18px;
    background: var(--a-card-fill);
    box-shadow: var(--a-card-shadow);
    color: var(--text);
    cursor: pointer;
    outline: none;
    transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out), border-color 200ms var(--ease-out);
  }

  /* Frost lives on the card, only while Activity is showing. The gaps around cards stay the bare backdrop. */
  .appView.is-active .actCard {
    -webkit-backdrop-filter: var(--a-well-blur);
    backdrop-filter: var(--a-well-blur);
  }

  .actCard::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0) 46%);
  }

  html[data-glass="dark"] .actCard::before {
    background: linear-gradient(180deg, rgba(160, 190, 255, 0.07), rgba(255, 255, 255, 0) 40%);
  }

  .actCard:not(.is-skeleton):hover {
    transform: translateY(-1px);
    box-shadow: var(--a-card-hover-shadow);
  }

  .actCard:focus-visible {
    box-shadow: var(--a-card-shadow), 0 0 0 3px rgba(10, 132, 255, 0.35);
  }

  .actCard.is-open {
    border-color: var(--a-on-border);
    box-shadow: var(--a-card-shadow), 0 0 0 1px var(--a-on-border);
  }

  .actCard.is-skeleton {
    cursor: default;
  }

  /* Dim the cards while a new window loads. The frost is on the card, so it dims with the content. */
  .actColumns.is-stale .actCard {
    opacity: 0.5;
  }

  .actCardHead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-width: 0;
    color: var(--text-2);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .actTime {
    margin-right: 2px;
    color: var(--text-2);
  }

  .activityView .kindPill,
  .memoryView .kindPill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 22px;
    padding: 0 9px 0 8px;
    border: 0;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
  }

  .activityView .kindPill::before,
  .memoryView .kindPill::before {
    content: "";
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .activityView .kindPill.kind-outcome, .memoryView .kindPill.kind-outcome { background: var(--a-outcome-fill); color: var(--a-outcome-ink); }
  .activityView .kindPill.kind-context, .memoryView .kindPill.kind-context { background: var(--a-context-fill); color: var(--a-context-ink); }
  .activityView .kindPill.kind-legacy, .memoryView .kindPill.kind-legacy { background: var(--a-legacy-fill); color: var(--a-legacy-ink); }
  .activityView .kindPill.kind-outcome::before, .memoryView .kindPill.kind-outcome::before { background: var(--a-outcome-dot); }
  .activityView .kindPill.kind-context::before, .memoryView .kindPill.kind-context::before { background: var(--a-context-dot); }
  .memoryView .kindPill.kind-legacy::before { background: var(--m-legacy-dot); }

  .actBadge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .actBadge.is-mcp {
    border-color: var(--a-mcp-border);
    background: var(--a-mcp-fill);
    color: var(--a-mcp-ink);
  }

  .actBadge.is-fallback {
    background: var(--a-fallback-fill);
    color: var(--warn-ink);
  }

  .actReview {
    display: inline-grid;
    place-items: center;
    color: var(--text-2);
  }

  .actMeta {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 14px;
    margin-left: auto;
  }

  .actMetaItem {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .actMetaIcon {
    width: 15px;
    height: 15px;
  }

  .actTitle {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 15.5px;
    font-weight: 500;
    line-height: 1.38;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .actCardFoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .actProject {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-2);
    font-size: 14px;
  }

  .actProjectName {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actAgent {
    flex: 0 0 auto;
    max-width: 45%;
    overflow: hidden;
    padding: 3px 13px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 13.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actCard.is-skeleton {
    gap: 12px;
    min-height: 112px;
    padding-top: 17px;
  }

  .actSkel {
    display: block;
    height: 10px;
    border-radius: 6px;
    background: var(--a-tag-fill);
  }

  .actSkel.is-short { width: 34%; }
  .actSkel.is-long { width: 88%; }
  .actSkel.is-mid { width: 58%; }

  .actColumnEmpty {
    margin: 0;
    padding: 22px 16px;
    border: 1px dashed var(--a-line);
    border-radius: 18px;
    color: var(--text-3);
    font-size: 13.5px;
    text-align: center;
  }

  .actMore {
    align-self: center;
    min-height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--a-link);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .actMore:hover {
    background: var(--shell-hover);
  }

  .actMore[aria-busy="true"] {
    color: var(--text-3);
    cursor: default;
  }

  .actNotice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 32px;
    text-align: center;
  }

  .activityView .actNotice,
  .memoryView .actNotice,
  .pipelineView .actNotice {
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .actNotice.is-error .placeholderIcon {
    background: rgba(255, 69, 58, 0.12);
    box-shadow: inset 0 1px 0 var(--chip-highlight);
    color: var(--err-ink);
  }

  .actNoticeTitle {
    margin: 6px 0 0;
    color: var(--text);
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .actNoticeLead {
    max-width: 460px;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .actNoticeActions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }

  /* Earlier rail. The client sets an inline max-height from the rail's real top. Expanded legacy
     days scroll in the body; the title, lead and note stay put. */
  .activityView .actRail {
    position: sticky;
    top: 20px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 40px);
    margin-top: -6px;
    /* overflow clips at the padding box, so the rail drops its border (padding grows by the same 1px) and
       its glass rim sits at inset 0 instead of over the border. */
    padding: 23px 23px 21px;
    overflow: hidden;
    border: 0;
    border-radius: 28px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .activityView .actRail::after {
    inset: 0;
  }

  .actRailTitle,
  .actRailLead,
  .actRailNote {
    flex: 0 0 auto;
  }

  .actRailTitle {
    margin: 0;
    color: var(--text);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .actRailLead {
    margin: 6px 0 0;
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.45;
  }

  .actRailBody {
    flex: 1 1 auto;
    min-height: 0;
    margin: 4px -8px 0;
    padding: 0 8px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }

  .actRailNote {
    margin: 16px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--a-line);
    color: var(--text-2);
    font-size: 13px;
    line-height: 1.45;
  }

  .actEarlierGroup {
    margin-top: 18px;
  }

  .actEarlierTitle {
    margin: 0 0 6px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .actEarlierRows {
    display: flex;
    flex-direction: column;
  }

  .actEarlierMonth {
    margin: 8px 0 2px;
    color: var(--text-3);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .actEarlierRow {
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 12px;
    width: calc(100% + 16px);
    min-height: 38px;
    margin: 0 -8px;
    padding: 4px 8px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
    transition: background 160ms var(--ease-out);
  }

  .actEarlierRow:hover {
    background: var(--shell-hover);
  }

  .actEarlierRow:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.32);
  }

  .actEarlierRow[aria-current="date"] {
    background: var(--a-on-fill);
    box-shadow: inset 0 0 0 1px var(--a-on-border);
  }

  .actEarlierDay {
    display: inline-flex;
    gap: 6px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .actEarlierTrack {
    position: relative;
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--a-bar-track);
  }

  .actEarlierBar {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: var(--a-bar);
  }

  .actEarlierRow.is-legacy .actEarlierBar {
    background: var(--a-bar-legacy);
  }

  .actEarlierCount {
    min-width: 34px;
    color: var(--text);
    font-weight: 600;
    text-align: right;
  }

  .actEarlierSub {
    grid-column: 2 / 4;
    margin-top: 2px;
    color: var(--text-2);
    font-size: 12.5px;
    text-align: right;
  }

  .actEarlierWarn {
    color: var(--a-warn);
  }

  .actEarlierState {
    margin: 18px 0 4px;
    color: var(--text-2);
    font-size: 14px;
  }

  .actEarlierState.is-error {
    color: var(--err-ink);
  }

  .actEarlierSkeleton {
    display: grid;
    gap: 14px;
    margin-top: 20px;
  }

  .actEarlierSkeleton span {
    height: 10px;
    border-radius: 6px;
    background: var(--a-tag-fill);
  }

  .actEarlierSkeleton span:nth-child(odd) { width: 86%; }
  .actEarlierSkeleton span:nth-child(even) { width: 64%; }

  .actRailLink {
    margin: 10px 0 0 -8px;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--a-link);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
  }

  .actRailLink:hover {
    background: var(--shell-hover);
  }

  /* Memory detail drawer: a tall glass sheet from the right. Inside the view, so its blur only runs on Activity.
     A transform animation that keeps filling would make the view the containing block of the fixed drawer and
     scrim, so Activity's entry animation does not fill forwards (its end state is transform: none anyway). */
  .skillsView.is-active,
  .projectsView.is-active,
  .activityView.is-active,
  .memoryView.is-active,
  .pipelineView.is-active,
  .digestsView.is-active {
    animation-fill-mode: none;
  }

  .actScrim {
    position: fixed;
    inset: 0;
    z-index: 48;
    background: var(--a-scrim);
    animation: scrimEnter 200ms var(--ease-out) both;
  }

  /* Soft blur only while the view is showing, same gate as the drawer, so a hidden view never blurs.
     Activity, Memory and Pipeline share this scrim; none of them paint it transparent. */
  .appView.is-active .actScrim {
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  .actDrawer {
    position: fixed;
    z-index: 50;
    top: 16px;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    width: min(560px, calc(100vw - 32px));
    padding: 20px 8px 0 24px;
    border: 1px solid transparent;
    border-radius: 28px;
    background: var(--a-drawer-fill);
    box-shadow: var(--a-drawer-shadow);
    color: var(--text);
    outline: none;
    animation: drawerEnter 260ms var(--ease-out) both;
  }

  .appView.is-active .actDrawer {
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    backdrop-filter: blur(40px) saturate(180%);
  }

  .actDrawerHead,
  .actDrawerTitle,
  .actDrawerSub {
    flex: 0 0 auto;
  }

  .actDrawerHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-right: 16px;
  }

  .actDrawerMeta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-width: 0;
  }

  .actDrawerTime {
    color: var(--text-2);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .actDrawerClose {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 50%;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--text);
    cursor: pointer;
  }

  .actDrawerClose:hover {
    background: var(--shell-hover);
  }

  .actDrawerClose:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.35);
  }

  /* Fallback titles can be long lists of tool names; two lines at most, the full text is in the title tooltip. */
  .actDrawerTitle {
    display: -webkit-box;
    margin: 14px 16px 0 0;
    overflow: hidden;
    color: var(--text);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.28;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .actDrawerSub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 10px 16px 0 0;
  }

  .actDrawerSub:empty {
    display: none;
  }

  .actDrawerBody {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 16px;
    padding: 0 16px 24px 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .actSection {
    margin-top: 12px;
    padding: 14px 16px 16px;
    border: 1px solid transparent;
    border-radius: 18px;
    background: var(--a-section-fill);
  }

  .actSection:first-child {
    margin-top: 0;
  }

  .actSectionTitle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .actSectionCount {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .actSectionEmpty,
  .actSectionNote {
    margin: 0;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.5;
  }

  .actSectionNote {
    margin-top: 10px;
    font-size: 13px;
  }

  .actNarrative {
    margin: 0;
    color: var(--text);
    font-size: 15px;
    line-height: 1.6;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .actNarrative.is-raw {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .actNarrativeClamp:not(.is-open) .actNarrative {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
  }

  .actNarrativeToggle {
    margin: 8px 0 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--a-link);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .actNarrativeToggle:hover {
    text-decoration: underline;
  }

  .actNarrativeToggle:focus-visible {
    outline: none;
    border-radius: 6px;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.35);
  }

  /* Facts use the same five-line clip. Gap is removed so five list rows land on the same budget as one wrapping row. */
  .actNarrativeClamp:not(.is-open) .actFacts {
    gap: 0;
    max-height: calc(14.5px * 1.5 * 5);
    overflow: hidden;
  }

  .actNarrativeClamp:not(.is-open) .actFacts li {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
  }

  .actFacts,
  .actFiles,
  .actTasks,
  .actFlags {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .actFacts li {
    position: relative;
    min-width: 0;
    padding-left: 16px;
    color: var(--text);
    font-size: 14.5px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  .actFacts li::before {
    content: "";
    position: absolute;
    top: 0.62em;
    left: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--a-outcome-dot);
    opacity: 0.7;
  }

  .actFiles li,
  .actMono {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12.5px;
  }

  .actFiles li {
    color: var(--text-2);
    overflow-wrap: anywhere;
  }

  .actFiles.is-modified li {
    color: var(--text);
  }

  .actTags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .actTag {
    padding: 3px 11px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text);
    font-size: 13px;
  }

  .actTask {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--a-tag-fill);
  }

  .actTaskHead {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .actTaskHead .actMono {
    color: var(--text-2);
  }

  .actTaskTime {
    margin-left: auto;
    color: var(--text-2);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .actTaskFacts {
    margin: 6px 0 0;
    color: var(--text-2);
    font-size: 13px;
  }

  .actTaskError {
    margin: 6px 0 0;
    color: var(--err-ink);
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .actStatus {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 12.5px;
    font-weight: 600;
  }

  .actStatus.tone-ok { background: rgba(48, 209, 88, 0.16); color: var(--ring-ok-ink); }
  .actStatus.tone-warn { background: var(--a-fallback-fill); color: var(--warn-ink); }
  .actStatus.tone-err { background: rgba(255, 69, 58, 0.14); color: var(--err-ink); }
  .actStatus.tone-info { background: var(--a-outcome-fill); color: var(--a-outcome-ink); }

  .actFlag {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    font-size: 13.5px;
  }

  .actFlagTask {
    color: var(--text-2);
  }

  .actFlagReason {
    flex-basis: 100%;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .actReviewHead {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .actReviewTime {
    color: var(--text-2);
    font-size: 13px;
  }

  .actReviewFields,
  .actIds {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px 14px;
    margin: 12px 0 0;
    font-size: 14px;
  }

  .actReviewFields dt,
  .actIds dt {
    color: var(--text-2);
  }

  .actReviewFields dd,
  .actIds dd {
    min-width: 0;
    margin: 0;
    color: var(--text);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .actSection.is-ids {
    padding: 4px 4px 0;
    background: transparent;
  }

  .actSection.is-ids::after {
    content: none;
  }

  .actSection.is-ids .actIds {
    margin: 0;
    font-size: 13px;
  }

  .actLinkButton {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--a-link);
    text-align: left;
    cursor: pointer;
  }

  .actLinkButton:hover {
    text-decoration: underline;
  }

  .actDrawerState {
    display: grid;
    justify-items: start;
    gap: 12px;
    color: var(--text-2);
    font-size: 14.5px;
  }

  .actDrawerState.is-error p {
    margin: 0;
    color: var(--err-ink);
  }

  .actDrawerSkeleton {
    display: grid;
    gap: 14px;
    padding: 16px;
    border-radius: 18px;
    background: var(--a-section-fill);
  }

  .actDrawerSkeleton span {
    height: 11px;
    border-radius: 6px;
    background: var(--a-tag-fill);
  }

  .actDrawerSkeleton .is-long { width: 92%; }
  .actDrawerSkeleton .is-mid { width: 64%; }
  .actDrawerSkeleton .is-short { width: 38%; }

  @keyframes drawerEnter {
    from { transform: translateX(28px); }
    to { transform: none; }
  }

  @keyframes scrimEnter {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Popovers: children of the view (not of the blurred toolbar), placed under their trigger by the client. */
  .actPopover {
    position: absolute;
    z-index: 30;
    min-width: 220px;
    max-width: min(360px, 100%);
    padding: 6px;
    border: 1px solid var(--popover-border);
    border-radius: 18px;
    background: var(--glass-specular), var(--popover-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 24px 60px -20px rgba(20, 24, 80, 0.45), 0 4px 14px rgba(20, 24, 80, 0.10);
    color: var(--text);
    font-size: 14px;
    animation: popoverEnter 160ms var(--ease-out) both;
  }

  .appView.is-active .actPopover {
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }

  .actMenu {
    max-height: min(420px, 60vh);
    overflow-y: auto;
  }

  .actOption {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 0 12px 0 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .actOption:hover,
  .actOption:focus-visible {
    background: var(--shell-hover);
    box-shadow: none;
  }

  .actOption[aria-selected="true"] {
    color: var(--a-on-ink);
    font-weight: 600;
  }

  .actOptionCheck {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    visibility: hidden;
  }

  .actOption[aria-selected="true"] .actOptionCheck {
    visibility: visible;
  }

  .actOptionName {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actOptionCount {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .actMenuSep {
    height: 1px;
    margin: 4px 8px;
    background: var(--shell-line);
  }

  .actCustom {
    width: 320px;
    padding: 16px 16px 14px;
  }

  .actCustomTitle {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 650;
  }

  .actCustomFields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .actField {
    display: grid;
    gap: 6px;
  }

  .actFieldLabel {
    color: var(--text-2);
    font-size: 12.5px;
  }

  .actDateInput {
    width: 100%;
    min-height: 36px;
    padding: 0 8px;
    border: 1px solid var(--chip-border);
    border-radius: 10px;
    background: var(--chip-fill);
    color: var(--text);
    font-size: 13.5px;
    color-scheme: light;
  }

  html[data-glass="dark"] .actDateInput {
    color-scheme: dark;
  }

  .actCustomHint {
    margin-top: 10px;
    color: var(--text-3);
    font-size: 12.5px;
  }

  .actCustomError {
    margin-top: 6px;
    color: var(--err-ink);
    font-size: 12.5px;
    font-weight: 600;
  }

  .actCustomActions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }

  /* The Activity default backdrop retunes the shell glass a touch so the sidebar and top pills sit in the same
     material as the page (only while that backdrop shows; a user background keeps the stock shell glass). */
  html[data-act-bg="light"] {
    --glass-rgb-top: 255, 255, 255;
    --glass-rgb-bottom: 250, 250, 255;
    --glass-a-top: 0.46;
    --glass-a-bottom: 0.30;
    --pill-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.44));
    --nav-active-fill: linear-gradient(180deg, rgba(232, 240, 255, 0.92), rgba(214, 228, 255, 0.64));
    --nav-active-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.96);
    --shell-accent: #0a63d1;
  }

  html[data-act-bg="dark"] {
    --glass-rgb-top: 26, 36, 80;
    --glass-rgb-bottom: 10, 15, 40;
    --glass-a-top: 0.46;
    --glass-a-bottom: 0.40;
    --pill-fill: linear-gradient(180deg, rgba(36, 48, 96, 0.60), rgba(16, 22, 56, 0.50));
    --nav-active-fill: linear-gradient(180deg, rgba(48, 120, 255, 0.55), rgba(22, 76, 210, 0.42));
    --nav-active-shadow: inset 0 0 0 1px rgba(160, 190, 255, 0.50);
    --shell-accent: #ffffff;
  }

  html[data-act-bg="light"] .navIcon {
    color: #2d7cf0;
  }

  html[data-act-bg="dark"] .navIcon {
    color: #6fa8ff;
  }

  html[data-act-bg] .navItem.is-active .navIcon {
    color: var(--shell-accent);
  }

  @media (max-width: 1360px) {
    .actBoard {
      grid-template-columns: minmax(0, 1fr) minmax(250px, 290px);
      gap: 20px;
    }

    .actColumns {
      gap: 20px;
    }

    .actSegment {
      padding: 0 16px;
    }
  }

  @media (max-width: 1180px) {
    .actBoard {
      grid-template-columns: minmax(0, 1fr);
    }

    .activityView .actRail {
      position: static;
      margin-top: 0;
    }
  }

  @media (max-width: 860px) {
    .actColumns {
      grid-template-columns: minmax(0, 1fr);
    }

    .actToolbarSep {
      display: none;
    }

    .actToolbarEnd {
      flex-basis: 100%;
      justify-content: space-between;
      padding-left: 8px;
    }
  }

  @media (max-width: 720px) {
    .actSummary {
      margin-top: -10px;
    }

    .activityView .actToolbar {
      border-radius: 24px;
    }

    .actSegmented {
      width: 100%;
    }

    .actSegment {
      flex: 1 1 0;
      padding: 0 8px;
    }

    .actDrawer {
      top: 8px;
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .actDrawer,
    .actScrim {
      animation: none;
    }

    .actCard:not(.is-skeleton):hover {
      transform: none;
    }
  }

  /* ---------- Memory detail drawer (shared by Activity and Memory) ---------- */

  .skillsView,
  .projectsView,
  .activityView,
  .memoryView,
  .pipelineView,
  .digestsView {
    --a-pane-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.46));
    --a-pane-shadow: var(--glass-edge), 0 10px 24px -16px rgba(60, 70, 160, 0.34);
    --a-concept-fill: rgba(10, 132, 255, 0.09);
    --a-concept-ink: #0a63d1;
    --a-concept-ring: rgba(10, 132, 255, 0.20);
  }

  html[data-glass="dark"] .skillsView,
  html[data-glass="dark"] .projectsView,
  html[data-glass="dark"] .activityView,
  html[data-glass="dark"] .memoryView,
  html[data-glass="dark"] .pipelineView,
  html[data-glass="dark"] .digestsView {
    --a-pane-fill: linear-gradient(180deg, rgba(40, 54, 110, 0.46), rgba(16, 24, 60, 0.42));
    --a-pane-shadow: var(--glass-edge), 0 14px 30px -18px rgba(0, 0, 0, 0.80);
    --a-concept-fill: rgba(40, 110, 255, 0.20);
    --a-concept-ink: #a9cbff;
    --a-concept-ring: rgba(110, 165, 255, 0.34);
  }

  .actDrawer {
    width: min(456px, calc(100vw - 32px));
    padding: 18px 8px 0 22px;
    border-radius: 30px;
  }

  /* Docked beside the Memory list: no scrim, the top follows the summary line (set by the client). */
  .actDrawer.is-docked {
    z-index: 26;
    top: 200px;
    animation-duration: 220ms;
  }

  .actDrawerHead {
    align-items: flex-start;
    padding-right: 14px;
  }

  .actDrawerMeta {
    gap: 6px;
    padding-top: 6px;
    font-size: 13px;
  }

  .actDrawerMeta .kindPill {
    min-height: 22px;
    font-size: 12.5px;
  }

  /* Keep the drawer meta row on one line: kind, badges and the time never wrap or shrink;
     the source / agent / project chips give way instead (the project chip carries a title tooltip). */
  .actDrawerMeta {
    flex-wrap: nowrap;
  }

  .actDrawerMeta > .kindPill,
  .actDrawerMeta > .actBadge,
  .actDrawerTime {
    flex-shrink: 0;
  }

  .actMetaChip {
    min-width: 0;
    overflow: hidden;
  }

  /* The chips flow in the meta row itself, so they wrap one at a time rather than as a block. */
  .actMetaChips {
    display: contents;
  }

  .actMetaChip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    color: var(--text-2);
    font-size: 12.5px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .actMetaChip + .actMetaChip {
    border-left: 1px solid var(--a-line);
  }

  .actMetaChip.is-agent {
    color: var(--text);
    font-weight: 500;
  }

  .actMetaChipIcon {
    width: 14px;
    height: 14px;
  }

  .actDrawerTools {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
  }

  .actDrawerClose {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }

  .actDrawerClose.is-done {
    color: var(--ring-ok-ink);
  }

  .actDrawerTitle {
    margin: 22px 14px 0 0;
    font-size: 26px;
    line-height: 1.22;
    letter-spacing: -0.02em;
  }

  .actDrawerBody {
    margin-top: 12px;
    padding: 0 14px 22px 0;
  }

  .actSection {
    margin-top: 22px;
    padding: 0;
    background: none;
  }

  .actSection.is-lead {
    margin-top: 0;
  }

  .actSection.is-lead .actNarrative {
    color: var(--text-2);
    font-size: 15px;
    line-height: 1.55;
  }

  .actSectionTitle {
    margin: 0 0 10px;
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .actSectionCount {
    min-width: 24px;
    padding: 1px 8px;
    text-align: center;
  }

  .actFacts li {
    font-size: 14px;
  }

  .actTag.is-concept {
    padding: 4px 12px;
    background: var(--a-concept-fill);
    box-shadow: inset 0 0 0 1px var(--a-concept-ring);
    color: var(--a-concept-ink);
    font-size: 13px;
    font-weight: 500;
  }

  .actPanes {
    display: grid;
    gap: 12px;
    margin-top: 22px;
  }

  .actPanes.is-pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .actPane {
    min-width: 0;
    padding: 12px 14px 12px;
    border: 1px solid transparent;
    border-radius: 18px;
    background: var(--a-pane-fill);
    box-shadow: var(--a-pane-shadow);
  }

  .actPaneTitle {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 8px;
    color: var(--text);
    font-size: 13.5px;
    font-weight: 600;
  }

  .actPaneIcon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--a-link);
  }

  .actFiles {
    gap: 4px;
  }

  .actFiles li {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: 12px;
  }

  .actFileIcon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    color: var(--a-link);
    opacity: 0.8;
  }

  .actFileName {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actTasks {
    gap: 10px;
  }

  .actTask.actPane {
    padding: 14px 16px 12px;
  }

  .actStats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, auto));
    justify-content: space-between;
    gap: 10px;
  }

  .actStat {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .actStat + .actStat {
    padding-left: 12px;
    border-left: 1px solid var(--a-line);
  }

  .actStatLabel {
    color: var(--text-2);
    font-size: 12.5px;
    white-space: nowrap;
  }

  .actStatValue {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .actStatusDot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--text-3);
  }

  .actStatusDot.tone-ok { background: #30c26b; box-shadow: 0 0 0 3px rgba(48, 194, 107, 0.18); }
  .actStatusDot.tone-warn { background: #ff9f0a; box-shadow: 0 0 0 3px rgba(255, 159, 10, 0.18); }
  .actStatusDot.tone-err { background: #ff453a; box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.16); }
  .actStatusWord.tone-ok { color: var(--ring-ok-ink); }
  .actStatusWord.tone-warn { color: var(--warn-ink); }
  .actStatusWord.tone-err { color: var(--err-ink); }

  .actTask .actTaskFacts {
    margin-top: 10px;
    font-size: 12.5px;
  }

  .actReviewBox.actPane {
    padding: 12px 14px;
  }

  /* ---------- Memory ---------- */

  .skillsView,
  .projectsView,
  .memoryView,
  .pipelineView,
  .digestsView {
    --m-legacy-fill: rgba(255, 170, 40, 0.15);
    --m-legacy-ink: #9a5800;
    --m-legacy-dot: #f5a524;
    --a-legacy-fill: var(--m-legacy-fill);
    --a-legacy-ink: var(--m-legacy-ink);
    --m-group-fill: linear-gradient(180deg, rgba(255, 255, 255, calc(0.50 * var(--glass-scale))), rgba(255, 255, 255, calc(0.30 * var(--glass-scale))));
    --m-group-shadow: var(--glass-edge), 0 1px 2px rgba(60, 70, 150, 0.04), 0 16px 34px -22px rgba(70, 80, 180, 0.40);
    --m-row-line: rgba(40, 50, 110, 0.07);
    --m-row-hover: rgba(255, 255, 255, 0.46);
    --m-row-on-fill: linear-gradient(180deg, rgba(226, 238, 255, 0.92), rgba(208, 226, 255, 0.70));
    --m-row-on-rim: linear-gradient(180deg, rgba(60, 140, 255, 0.55), rgba(60, 140, 255, 0.30));
    --m-row-on-shadow: 0 8px 20px -12px rgba(30, 100, 230, 0.45);
    --m-well-fill: rgba(232, 236, 250, calc(0.42 * var(--glass-scale)));
    --m-rank-0: linear-gradient(180deg, #6aa8ff, #2f7cf6);
    --m-rank-1: linear-gradient(180deg, #c3a8ff, #9a78f2);
    --m-rank-2: linear-gradient(180deg, #8fdcae, #4fbf86);
    --m-rank-3: linear-gradient(180deg, #ffd27a, #f2ac3c);
    --m-rank-4: linear-gradient(180deg, #ff9aa5, #f2697a);
    --m-rank-other: linear-gradient(180deg, #b9c6ff, #8ea2f0);
    --m-dot-0: #2f7cf6;
    --m-dot-1: #9a78f2;
    --m-dot-2: #4fbf86;
    --m-dot-3: #f2ac3c;
    --m-dot-4: #f2697a;
  }

  html[data-glass="dark"] .skillsView,
  html[data-glass="dark"] .projectsView,
  html[data-glass="dark"] .memoryView,
  html[data-glass="dark"] .pipelineView,
  html[data-glass="dark"] .digestsView {
    --m-legacy-fill: rgba(255, 176, 50, 0.20);
    --m-legacy-ink: #ffc76a;
    --m-legacy-dot: #ffb340;
    --m-group-fill: linear-gradient(180deg, rgba(28, 40, 86, calc(0.56 * var(--glass-scale))), rgba(12, 18, 46, calc(0.50 * var(--glass-scale))));
    --m-group-shadow: var(--glass-edge), 0 20px 40px -22px rgba(0, 0, 0, 0.80);
    --m-row-line: rgba(255, 255, 255, 0.07);
    --m-row-hover: rgba(255, 255, 255, 0.05);
    --m-row-on-fill: linear-gradient(180deg, rgba(40, 92, 210, 0.36), rgba(22, 58, 160, 0.26));
    --m-row-on-rim: linear-gradient(180deg, rgba(120, 175, 255, 0.95), rgba(70, 130, 255, 0.60));
    --m-row-on-shadow: 0 0 22px -6px rgba(50, 120, 255, 0.70);
    --m-well-fill: rgba(6, 10, 30, calc(0.40 * var(--glass-scale)));
    --m-rank-0: linear-gradient(180deg, #5d9bff, #2c6cf0);
    --m-rank-1: linear-gradient(180deg, #b49aff, #8462ea);
    --m-rank-2: linear-gradient(180deg, #7fdca2, #3fae74);
    --m-rank-3: linear-gradient(180deg, #ffcb6e, #e89e2c);
    --m-rank-4: linear-gradient(180deg, #ff8f9c, #e65a6c);
    --m-rank-other: linear-gradient(180deg, #8ea2f0, #5f72d0);
  }

  .memLead {
    margin: -16px 0 20px 2px;
    color: var(--text-2);
    font-size: 15.5px;
  }

  .policyBanner:not([hidden]) ~ .memoryView .memLead {
    margin-top: 0;
  }

  /* Toolbar: one glass capsule with an inset search well, the four pickers and the range control. */
  .memToolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 7px;
    border-radius: 34px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .memSearch {
    display: flex;
    flex: 1 1 220px;
    align-items: center;
    gap: 10px;
    min-width: 200px;
    min-height: 42px;
    padding: 0 8px 0 16px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--m-well-fill);
    box-shadow: inset 0 1px 3px rgba(20, 30, 80, 0.07);
    cursor: text;
  }

  .memSearch:focus-within {
    box-shadow: inset 0 1px 3px rgba(20, 30, 80, 0.07), 0 0 0 3px rgba(10, 132, 255, 0.22);
  }

  .memSearchIcon {
    width: 17px;
    height: 17px;
    flex: 0 0 17px;
    color: var(--text-2);
  }

  .memSearchInput {
    flex: 1 1 auto;
    min-width: 0;
    height: 40px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 15px;
  }

  .memSearchInput::placeholder {
    color: var(--text-3);
  }

  .memSearchInput:focus-visible {
    box-shadow: none;
  }

  .memSearchInput::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .memSearchClear {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--a-tag-fill);
    color: var(--text-2);
    cursor: pointer;
  }

  .memSearchClearIcon {
    width: 13px;
    height: 13px;
  }

  .memFilters {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    gap: 8px;
  }

  .memToolbar .actPopup {
    max-width: 200px;
    min-height: 42px;
    padding: 0 12px 0 15px;
    font-size: 14.5px;
  }

  .memSegmented {
    margin-left: auto;
  }

  .memSegmented .actSegment {
    min-height: 38px;
    padding: 0 18px;
    font-size: 14.5px;
  }

  /* Summary line: total, then the three kinds as quiet toggles. */
  .memSummary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 16px 0 0 4px;
    color: var(--text-2);
    font-size: 15.5px;
    font-variant-numeric: tabular-nums;
  }

  .memSumTotal {
    color: var(--text);
  }

  .memSumTotal strong {
    font-size: 17px;
    font-weight: 650;
  }

  .memSumSep {
    color: var(--text-3);
  }

  .memSumKind {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: 0 -6px;
    padding: 2px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: background 160ms var(--ease-out);
  }

  .memSumKind strong {
    margin-left: 4px;
    color: var(--text-2);
    font-weight: 500;
  }

  .memSumKind:hover {
    background: var(--shell-hover);
  }

  .memSumKind[aria-pressed="true"] {
    background: var(--a-on-fill);
    box-shadow: inset 0 0 0 1px var(--a-on-border);
    color: var(--a-on-ink);
  }

  .memSumDot,
  .memOptDot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
  }

  .memSumKind.kind-outcome .memSumDot, .memOptDot.kind-outcome { background: var(--a-outcome-dot); }
  .memSumKind.kind-context .memSumDot, .memOptDot.kind-context { background: var(--a-context-dot); }
  .memSumKind.kind-legacy .memSumDot, .memOptDot.kind-legacy { background: var(--m-legacy-dot); }

  .memUpdated {
    margin-left: auto;
    color: var(--text-3);
    font-size: 13px;
  }

  .memUpdated.is-warn {
    color: var(--warn-ink);
    font-weight: 600;
  }

  /* Top projects: a glass strip with the five largest projects as one proportional bar. */
  .memTop {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 12px;
    padding: 9px 16px 9px 10px;
    border-radius: 22px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .memTopLabel {
    flex: 0 0 auto;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }

  .memTopBar {
    display: flex;
    flex: 1 1 auto;
    gap: 5px;
    min-width: 0;
  }

  .memTopSeg {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 6px;
    min-width: 92px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: opacity 180ms var(--ease-out);
  }

  .memTopSeg.is-other {
    min-width: 18px;
    cursor: default;
  }

  .memTopSeg.is-dim {
    opacity: 0.42;
  }

  .memTopSeg:hover {
    opacity: 1;
  }

  .memTopFill {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: var(--m-rank-other);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 2px 6px -2px rgba(40, 60, 160, 0.30);
  }

  .memTopSeg[data-rank="0"] .memTopFill { background: var(--m-rank-0); }
  .memTopSeg[data-rank="1"] .memTopFill { background: var(--m-rank-1); }
  .memTopSeg[data-rank="2"] .memTopFill { background: var(--m-rank-2); }
  .memTopSeg[data-rank="3"] .memTopFill { background: var(--m-rank-3); }
  .memTopSeg[data-rank="4"] .memTopFill { background: var(--m-rank-4); }

  .memTopSeg[aria-pressed="true"] .memTopFill {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 0 2px var(--a-on-border);
  }

  .memTopLegend {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 2px;
    font-size: 12.5px;
    white-space: nowrap;
  }

  .memTopDot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 2px;
    background: var(--text-3);
  }

  .memTopSeg[data-rank="0"] .memTopDot { background: var(--m-dot-0); }
  .memTopSeg[data-rank="1"] .memTopDot { background: var(--m-dot-1); }
  .memTopSeg[data-rank="2"] .memTopDot { background: var(--m-dot-2); }
  .memTopSeg[data-rank="3"] .memTopDot { background: var(--m-dot-3); }
  .memTopSeg[data-rank="4"] .memTopDot { background: var(--m-dot-4); }

  .memTopName {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .memTopCount {
    flex: 0 0 auto;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  /* List: a header row, then one glass card per local day. Columns line up across cards. */
  .memBoard {
    --m-cols: 64px 108px minmax(0, 1fr) minmax(90px, 150px) minmax(64px, 96px) 54px 54px;
    margin-top: 14px;
  }

  .memHead,
  .memRow {
    display: grid;
    grid-template-columns: var(--m-cols);
    align-items: center;
    column-gap: 12px;
  }

  .memHead {
    padding: 0 18px 8px;
    color: var(--text-2);
    font-size: 13px;
  }

  /* The title track is the only flexible column, so a narrow list ellipsizes this label instead of the others. */
  .memHead .memCol:nth-child(3) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memCol.is-num,
  .memNum {
    justify-self: start;
  }

  .memList {
    display: grid;
    gap: 14px;
  }

  .memList.is-stale .memGroup {
    opacity: 0.55;
  }

  .memGroup {
    isolation: isolate;
    min-width: 0;
    padding: 6px 6px 6px;
    border: 1px solid transparent;
    border-radius: 22px;
    background: var(--m-group-fill);
    box-shadow: var(--m-group-shadow);
    transition: opacity 200ms var(--ease-out);
  }

  /* Frost lives on the day cards, only while Memory is showing. */
  .appView.is-active .memGroup {
    -webkit-backdrop-filter: var(--a-well-blur);
    backdrop-filter: var(--a-well-blur);
  }

  .memDayHead {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0;
    padding: 8px 12px 6px;
    color: var(--text);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .memDayDate,
  .memDayCount {
    color: var(--text-2);
    font-size: 14.5px;
    font-weight: 500;
    letter-spacing: 0;
  }

  .memDayCount {
    margin-left: -4px;
    font-variant-numeric: tabular-nums;
  }

  .memRows {
    display: grid;
    min-width: 0;
  }

  .memRow {
    position: relative;
    min-width: 0;
    min-height: 48px;
    padding: 5px 12px;
    border: 1px solid transparent;
    border-radius: 14px;
    color: var(--text);
    cursor: pointer;
    outline: none;
    transition: background 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
  }

  .memRow + .memRow {
    box-shadow: 0 -1px 0 var(--m-row-line);
  }

  .memRow:hover {
    background: var(--m-row-hover);
  }

  .memRow:focus-visible {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.32);
  }

  .memRow.is-open {
    background: var(--m-row-on-fill);
    box-shadow: var(--m-row-on-shadow);
  }

  .memRow.is-open + .memRow {
    box-shadow: none;
  }

  .memRow.is-open::after {
    background: var(--m-row-on-rim);
  }

  .memCell {
    min-width: 0;
  }

  .memTime {
    color: var(--text-2);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .memKind .kindPill {
    min-width: 88px;
    min-height: 24px;
    padding: 0 10px 0 9px;
    font-size: 13px;
  }

  .memMain {
    display: grid;
    gap: 2px;
  }

  .memTitleLine {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .memTitle {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 14.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memTitleLine .actBadge {
    flex: 0 0 auto;
    min-height: 20px;
    padding: 0 8px;
    font-size: 12px;
  }

  .memPreview {
    min-width: 0;
    overflow: hidden;
    color: var(--text-2);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memProject,
  .memAgent {
    overflow: hidden;
    color: var(--text-2);
    font-size: 13.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memNum {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-2);
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }

  .memNum.is-zero {
    opacity: 0.45;
  }

  .memNumIcon {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
  }

  .memRow.is-skeleton {
    grid-template-columns: 64px minmax(0, 1fr);
    cursor: default;
  }

  .memRow.is-skeleton .actSkel.is-long { width: 62%; }
  .memGroup.is-skeleton .memDayHead .actSkel { width: 120px; height: 14px; }

  .memNotice {
    margin-top: 6px;
  }

  .memMoreRow {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }

  .memMore {
    min-height: 40px;
    padding: 0 26px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--a-control-fill);
    box-shadow: var(--a-control-shadow);
    color: var(--a-link);
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .memMore:hover {
    background: var(--shell-hover);
  }

  .memMore[aria-busy="true"] {
    color: var(--text-3);
    cursor: default;
  }

  /* The docked sheet is position:fixed (width and the 16px right offset live on .actDrawer).
     On a wide viewport the toolbar stays full width and the list area steps aside so Project, Agent,
     Facts and Files stay on screen. The title column is minmax(0, 1fr) and takes the squeeze.
     Below 1440px the sheet floats over the list as an overlay (scrim, full list layout). */
  @media (min-width: 1440px) {
    .memoryView.is-drawer-open .memSummary,
    .memoryView.is-drawer-open .memTop,
    .memoryView.is-drawer-open .memHead,
    .memoryView.is-drawer-open .memGroup,
    .memoryView.is-drawer-open .memMoreRow {
      margin-right: calc(min(456px, calc(100vw - 32px)) + 16px);
    }

    .memoryView.is-drawer-open .memTopSeg {
      min-width: 0;
    }

    .memoryView.is-drawer-open .memTopSeg.is-other {
      min-width: 18px;
    }
  }

  /* With the sheet docked (wide screens, space reserved above), drop Project and Agent so the
     Title / Summary column gets the room. The sheet itself already shows both for the open memory. */
  @media (min-width: 1440px) {
    .memoryView.is-drawer-open .memBoard {
      --m-cols: 52px 96px minmax(0, 1fr) 44px 44px;
    }

    .memoryView.is-drawer-open .memHead,
    .memoryView.is-drawer-open .memRow {
      column-gap: 10px;
    }

    .memoryView.is-drawer-open .memHead .memCol:nth-child(4),
    .memoryView.is-drawer-open .memHead .memCol:nth-child(5),
    .memoryView.is-drawer-open .memProject,
    .memoryView.is-drawer-open .memAgent {
      display: none;
    }
  }

  @media (max-width: 1199px) {
    .memBoard {
      --m-cols: 56px 100px minmax(0, 1fr) minmax(80px, 120px) 54px 48px;
    }

    .memHead .memCol:nth-child(5),
    .memAgent {
      display: none;
    }

    .memSegmented {
      margin-left: 0;
    }
  }

  /* Below 1440px, tighten the toolbar so search, the four pickers and the range control fit on one line at ~1280. */
  @media (max-width: 1439px) {
    .memToolbar {
      column-gap: 6px;
    }

    .memSearch {
      flex-basis: 140px;
      min-width: 140px;
    }

    .memToolbar .actPopup {
      padding: 0 9px 0 12px;
    }

    .memSegmented .actSegment {
      padding: 0 11px;
    }
  }

  @media (max-width: 860px) {
    .memBoard {
      --m-cols: 50px minmax(0, 1fr) 46px;
    }

    .memHead .memCol:nth-child(2),
    .memHead .memCol:nth-child(4),
    .memHead .memCol:nth-child(7),
    .memKind,
    .memProject,
    .memNum:last-child {
      display: none;
    }

    .memTop {
      display: none;
    }

    .actPanes.is-pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 720px) {
    .actDrawer,
    .actDrawer.is-docked {
      top: 8px;
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
    }
  }

  /* ---------- Pipeline ---------- */

  /* Pipeline tokens. Colour only marks problems: saved and processing stay neutral, queued and skipped muted,
     stuck amber, failed and fallback red, duplicate purple. Glass fills multiply --glass-scale like Activity's. */
  .pipelineView {
    --p-neutral-fill: rgba(112, 120, 156, 0.12);
    --p-neutral-ink: #394156;
    --p-neutral-dot: #7d869e;
    --p-muted-fill: rgba(140, 148, 172, 0.08);
    --p-muted-ink: #6a7187;
    --p-muted-dot: #b3b8c7;
    --p-warn-fill: rgba(255, 159, 10, 0.16);
    --p-warn-ink: #9a5200;
    --p-warn-dot: #f59e0b;
    --p-err-fill: rgba(255, 69, 58, 0.12);
    --p-err-ink: #b42318;
    --p-err-dot: #ff453a;
    --p-dup-fill: rgba(130, 100, 240, 0.13);
    --p-dup-ink: #5a3fc4;
    --p-dup-dot: #8e6cf6;
    --p-orb-fill: linear-gradient(180deg, rgba(255, 255, 255, calc(0.92 * var(--glass-scale))), rgba(232, 236, 250, calc(0.62 * var(--glass-scale))));
    --p-orb-shadow: var(--glass-edge), 0 4px 10px -4px rgba(60, 70, 160, 0.32);
    --p-stuck-fill: linear-gradient(180deg, rgba(255, 238, 206, calc(0.86 * var(--glass-scale))), rgba(255, 216, 156, calc(0.58 * var(--glass-scale))));
    --p-stuck-shadow: var(--glass-edge), inset 0 0 0 1px rgba(245, 158, 11, 0.22), 0 16px 32px -18px rgba(220, 130, 20, 0.60);
    --p-stuck-orb: linear-gradient(180deg, #ffc65a, #f29a0e);
    --p-well: rgba(232, 236, 250, 0.58);
  }

  html[data-glass="dark"] .pipelineView {
    --p-neutral-fill: rgba(255, 255, 255, 0.10);
    --p-neutral-ink: #d9e0f0;
    --p-neutral-dot: #9aa5c2;
    --p-muted-fill: rgba(255, 255, 255, 0.06);
    --p-muted-ink: #a2aac2;
    --p-muted-dot: #6b738e;
    --p-warn-fill: rgba(255, 170, 50, 0.20);
    --p-warn-ink: #ffc766;
    --p-warn-dot: #ffad33;
    --p-err-fill: rgba(255, 82, 72, 0.20);
    --p-err-ink: #ff9d95;
    --p-err-dot: #ff5a4f;
    --p-dup-fill: rgba(140, 110, 255, 0.24);
    --p-dup-ink: #cbb8ff;
    --p-dup-dot: #9a7cff;
    --p-orb-fill: linear-gradient(180deg, rgba(64, 78, 136, calc(0.80 * var(--glass-scale))), rgba(18, 26, 62, calc(0.72 * var(--glass-scale))));
    --p-orb-shadow: var(--glass-edge), 0 4px 12px -4px rgba(0, 0, 0, 0.65);
    --p-stuck-fill: linear-gradient(180deg, rgba(118, 74, 20, calc(0.66 * var(--glass-scale))), rgba(64, 40, 14, calc(0.60 * var(--glass-scale))));
    --p-stuck-shadow: var(--glass-edge), inset 0 0 0 1px rgba(255, 176, 70, 0.42), 0 0 28px -8px rgba(255, 150, 30, 0.60);
    --p-well: rgba(6, 10, 30, 0.44);
  }

  .pipeLeadRow {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin: -16px 0 20px 2px;
  }

  .policyBanner:not([hidden]) ~ .pipelineView .pipeLeadRow {
    margin-top: 0;
  }

  .pipeLeadRow .pipeLead {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
  }

  .pipeLeadRow .memUpdated {
    flex: 0 0 auto;
  }

  /* Toolbar: the three pickers share the left, the range control keeps its own width on the right. */
  .pipeFilters {
    display: flex;
    flex: 1 1 auto;
    gap: 8px;
    min-width: 0;
  }

  .pipeFilters .actPopup {
    flex: 1 1 0;
    min-width: 0;
    max-width: 230px;
    min-height: 42px;
    padding: 0 14px 0 17px;
    font-size: 14.5px;
  }

  .pipeFilters .actPopupIcon {
    margin-left: auto;
  }

  .pipeFlagChip {
    flex: 0 0 auto;
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-height: 32px;
    padding: 0 10px 0 12px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--p-dup-fill);
    color: var(--p-dup-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .pipeFlagChip::after {
    content: "×";
    font-weight: 500;
    opacity: 0.75;
  }

  .pipeFlagChip[hidden] {
    display: none !important;
  }

  /* All time is an internal range (Home links). It is a state of this control, not a fifth permanent button. */
  .pipeRangeAll {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 24px;
    border: 1px solid var(--a-seg-on-border);
    border-radius: 22px;
    background: var(--a-seg-on-fill);
    box-shadow: var(--a-seg-on-shadow);
    color: var(--a-seg-on-ink);
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }

  .pipeRangeAll[hidden] {
    display: none !important;
  }

  .pipePause {
    display: flex;
    justify-content: flex-end;
    margin: 2px 18px 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-3);
    font: inherit;
    font-size: 12.5px;
    line-height: 1.4;
    cursor: pointer;
  }

  .pipePause:hover {
    color: var(--text-2);
  }

  .pipePause[hidden] {
    display: none !important;
  }

  /* Flow strip: one glass capsule with the in-flight stages joined by chevrons, then the outcomes. Stuck sits
     apart as its own chip. Each stage is an orb with a dot and a label over the count. */
  .pipeFlowRow {
    display: flex;
    align-items: stretch;
    gap: 12px;
    margin-top: 14px;
  }

  .pipeFlow {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 0;
    padding: 7px 10px 7px 8px;
    border-radius: 32px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
  }

  .pipeFlowGroup {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .pipeFlowGroup:not(.is-flow) {
    flex: 1 1 auto;
    justify-content: space-between;
  }

  .pipeFlowSep {
    flex: 0 0 1px;
    align-self: stretch;
    margin: 6px 10px;
    background: var(--a-line);
  }

  .pipeChevron {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    color: var(--text-3);
    opacity: 0.8;
  }

  .pipeStage {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 6px;
    border: 1px solid transparent;
    border-radius: 24px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
  }

  .pipeStage:hover {
    background: var(--shell-hover);
  }

  .pipeStage.is-static {
    cursor: default;
  }

  .pipeStage.is-static:hover {
    background: transparent;
  }

  .pipeStage[aria-pressed="true"] {
    background: var(--a-on-fill);
    box-shadow: inset 0 0 0 1px var(--a-on-border), var(--a-on-shadow);
  }

  .pipeOrb {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border-radius: 50%;
    background: var(--p-orb-fill);
    box-shadow: var(--p-orb-shadow);
  }

  .pipeOrbDot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--p-muted-dot);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.45);
  }

  .pipeStage.has-count .pipeOrbDot {
    background: var(--p-neutral-dot);
  }

  /* Processing breathes while it has work; problem stages only take their colour once they count something. */
  .pipeStage.stage-processing.has-count .pipeOrbDot {
    animation: pipeBreathe 2.2s ease-in-out infinite;
  }

  .pipeStage.stage-duplicate.has-count .pipeOrbDot {
    background: var(--p-dup-dot);
    box-shadow: 0 0 0 3px rgba(142, 108, 246, 0.16), 0 0 10px rgba(142, 108, 246, 0.45);
  }

  .pipeStage.stage-fallback.has-count .pipeOrbDot,
  .pipeStage.stage-failed.has-count .pipeOrbDot {
    background: var(--p-err-dot);
    box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.14), 0 0 10px rgba(255, 69, 58, 0.45);
  }

  @keyframes pipeBreathe {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(0.72); opacity: 0.6; }
  }

  .pipeStageText {
    display: grid;
    gap: 2px;
    min-width: 0;
    line-height: 1.15;
  }

  .pipeStageLabel {
    overflow: hidden;
    color: var(--text-2);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pipeStageCount {
    color: var(--text);
    font-size: 15.5px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .pipeStuck {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    min-width: 132px;
    padding: 7px 24px 7px 9px;
    border-radius: 32px;
    background: var(--a-glass);
    box-shadow: var(--a-glass-shadow);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: box-shadow 180ms var(--ease-out), background 180ms var(--ease-out);
  }

  .pipeStuckIcon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border-radius: 50%;
    background: var(--p-orb-fill);
    box-shadow: var(--p-orb-shadow);
    color: var(--text-3);
  }

  .pipeStuckGlyph {
    width: 18px;
    height: 18px;
  }

  .pipeStuck.has-count {
    background: var(--p-stuck-fill);
    box-shadow: var(--p-stuck-shadow);
  }

  .pipeStuck.has-count .pipeStuckIcon {
    background: var(--p-stuck-orb);
    box-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.75), inset 0 -6px 10px -6px rgba(150, 70, 0, 0.45), 0 4px 12px -4px rgba(230, 130, 10, 0.65);
    color: #ffffff;
  }

  .pipeStuck.has-count .pipeStageLabel,
  .pipeStuck.has-count .pipeStageCount {
    color: var(--p-warn-ink);
  }

  .pipeStuck[aria-pressed="true"] {
    box-shadow: var(--p-stuck-shadow), 0 0 0 2px rgba(245, 158, 11, 0.70);
  }

  .pipeStuck:not(.has-count)[aria-pressed="true"] {
    box-shadow: var(--a-glass-shadow), 0 0 0 2px var(--a-on-border);
  }

  /* State pills. The dot carries the state too: hollow while waiting or running, solid once settled. */
  .pipePill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 0 10px 0 9px;
    border-radius: 999px;
    background: var(--p-neutral-fill);
    color: var(--p-neutral-ink);
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  .pipePill::before {
    content: "";
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--p-neutral-dot);
  }

  .pipePill.state-processing::before {
    box-sizing: border-box;
    border: 1.6px solid var(--p-neutral-dot);
    background: transparent;
    animation: pipeBreathe 2.2s ease-in-out infinite;
  }

  .pipePill.state-queued,
  .pipePill.state-skipped,
  .pipePill.state-unknown {
    background: var(--p-muted-fill);
    color: var(--p-muted-ink);
  }

  .pipePill.state-queued::before {
    box-sizing: border-box;
    border: 1.6px solid var(--p-muted-dot);
    background: transparent;
  }

  .pipePill.state-skipped::before,
  .pipePill.state-unknown::before { background: var(--p-muted-dot); }
  .pipePill.state-stuck { background: var(--p-warn-fill); color: var(--p-warn-ink); }
  .pipePill.state-stuck::before { background: var(--p-warn-dot); }
  .pipePill.state-failed,
  .pipePill.state-fallback { background: var(--p-err-fill); color: var(--p-err-ink); }
  .pipePill.state-failed::before,
  .pipePill.state-fallback::before { background: var(--p-err-dot); }
  .pipePill.state-duplicate { background: var(--p-dup-fill); color: var(--p-dup-ink); }
  .pipePill.state-duplicate::before { background: var(--p-dup-dot); }

  .pipeOptDot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--p-neutral-dot);
  }

  .pipeOptDot.state-queued,
  .pipeOptDot.state-skipped { background: var(--p-muted-dot); }
  .pipeOptDot.state-stuck { background: var(--p-warn-dot); }
  .pipeOptDot.state-failed,
  .pipeOptDot.state-fallback { background: var(--p-err-dot); }
  .pipeOptDot.state-duplicate { background: var(--p-dup-dot); }

  /* List: Memory's day cards and rows, with a state column and two counts. */
  .pipeBoard {
    --m-cols: 60px 112px minmax(0, 1fr) minmax(90px, 140px) minmax(64px, 96px) 72px 64px;
  }

  .pipeHead .memCol {
    white-space: nowrap;
  }

  .pipeRow .memKind .pipePill {
    min-width: 100px;
  }

  .pipeRow .memTitle.is-fallback {
    color: var(--text-2);
  }

  .pipeRow .memPreview.tone-warn {
    color: var(--p-warn-ink);
  }

  .pipeRow .memPreview.tone-err {
    color: var(--p-err-ink);
  }

  .pipeAttempts {
    font-variant-numeric: tabular-nums;
  }

  /* Drawer, task body: chips, then the state pill above the title (the flex order puts the sub row first). */
  .actDrawer.is-task .actDrawerSub {
    order: 1;
    margin-top: 18px;
  }

  .actDrawer.is-task .actDrawerTitle {
    order: 2;
    margin-top: 12px;
  }

  .actDrawer.is-task .actDrawerBody {
    order: 3;
  }

  .actDrawerSub .pipePill {
    min-height: 24px;
  }

  /* The task chips may wrap to a second line rather than squeeze the project name away. */
  .actDrawer.is-task .actDrawerMeta,
  .actDrawer.is-from-task .actDrawerMeta {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .actDrawer.is-task .actDrawerMeta {
    column-gap: 5px;
  }

  .actDrawer.is-task .actMetaChip:not(.actDrawerTime) {
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--a-tag-fill);
  }

  .actDrawer.is-task .actMetaChip + .actMetaChip {
    border-left: 0;
  }

  .pipeChipProject {
    flex-shrink: 0;
    max-width: 220px;
    gap: 6px;
  }

  .pipeChipName {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pipeChipDot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--a-outcome-dot);
  }

  .pipeBack {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    min-height: 26px;
    margin-right: 4px;
    padding: 0 10px 0 4px;
    border: 0;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--a-link);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .pipeBack:hover {
    background: var(--shell-hover);
  }

  .pipeBackIcon {
    width: 16px;
    height: 16px;
  }

  .pipeNote {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 18px 0 0;
    padding: 11px 14px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.45;
  }

  .pipeNote.tone-warn {
    background: var(--p-warn-fill);
    color: var(--p-warn-ink);
  }

  .pipeNote.tone-err {
    background: var(--p-err-fill);
    color: var(--p-err-ink);
  }

  .pipeNoteIcon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    margin-top: 1px;
  }

  .pipeNote span {
    font-weight: 600;
  }

  .pipeNoteHint {
    display: block;
    margin-top: 2px;
    color: var(--text-2);
    font-weight: 400;
  }

  .pipeNote .pipeNoteHint {
    font-weight: 400;
  }

  .pipeStats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-top: 20px;
  }

  .pipeStat.actPane {
    display: grid;
    align-content: start;
    gap: 9px;
    padding: 11px 8px 12px 10px;
    border-radius: 16px;
  }

  .pipeStatLabel {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  .pipeStatLabel span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pipeStatIcon {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    color: var(--a-link);
  }

  .pipeStatValue {
    color: var(--text);
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.01em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .pipeStatSub {
    margin-top: -2px;
    color: var(--p-warn-ink);
    font-size: 12px;
  }

  .pipeLink.actPane {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    margin-top: 12px;
    padding: 14px 16px;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: box-shadow 160ms var(--ease-out);
  }

  .pipeLink.actPane:hover {
    box-shadow: var(--a-pane-shadow), 0 0 0 1px var(--a-on-border);
  }

  .pipeLinkIcon {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    color: var(--a-link);
  }

  .pipeLinkText {
    display: grid;
    flex: 1 1 auto;
    gap: 3px;
    min-width: 0;
  }

  .pipeLinkLabel {
    color: var(--text-2);
    font-size: 13px;
  }

  .pipeLinkAction {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--a-link);
    font-size: 15px;
    font-weight: 600;
  }

  .pipeLinkArrow {
    width: 16px;
    height: 16px;
  }

  .pipeLinkEnd {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    color: var(--a-link);
  }

  .pipeError.actPane {
    margin-top: 12px;
    padding: 14px 16px 16px;
  }

  .pipeErrorTitle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .pipeErrorIcon {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    color: var(--p-err-dot);
  }

  .pipeErrorText {
    margin: 0;
    padding: 11px 14px;
    border-radius: 12px;
    background: var(--p-well);
    box-shadow: inset 0 1px 3px rgba(20, 30, 80, 0.08);
    color: var(--text);
    font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 12.5px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  /* Docked beside the list (1440px and wider): the toolbar and flow strip stay full width, the list steps aside
     and drops Agent (the drawer shows it). Below 1440px the sheet floats over the full list with the scrim. */
  @media (min-width: 1440px) {
    .pipelineView.is-drawer-open .pipeHead,
    .pipelineView.is-drawer-open .memGroup,
    .pipelineView.is-drawer-open .memMoreRow,
    .pipelineView.is-drawer-open .memNotice {
      margin-right: calc(min(456px, calc(100vw - 32px)) + 16px);
    }

    .pipelineView.is-drawer-open .pipeBoard {
      --m-cols: 50px 106px minmax(0, 1fr) minmax(70px, 104px) 64px 58px;
    }

    .pipelineView.is-drawer-open .pipeHead,
    .pipelineView.is-drawer-open .pipeRow {
      column-gap: 10px;
    }

    .pipelineView.is-drawer-open .pipeHead .memCol:nth-child(5),
    .pipelineView.is-drawer-open .pipeRow .memAgent {
      display: none;
    }
  }

  /* Below 1440px the strip tightens so all nine stages fit on one line at about 1280. */
  @media (max-width: 1439px) {
    .pipeFlow {
      padding: 6px 8px 6px 6px;
    }

    .pipeFlowSep {
      margin: 6px 6px;
    }

    .pipeStage {
      gap: 7px;
      padding: 4px 9px 4px 4px;
    }

    .pipeOrb {
      width: 26px;
      height: 26px;
      flex-basis: 26px;
    }

    .pipeOrbDot {
      width: 9px;
      height: 9px;
    }

    .pipeStageLabel {
      font-size: 12.5px;
    }

    .pipeChevron {
      width: 13px;
      height: 13px;
      flex-basis: 13px;
    }

    .pipeStuck {
      min-width: 0;
      gap: 10px;
      padding: 6px 18px 6px 7px;
    }

    .pipeStuckIcon {
      width: 30px;
      height: 30px;
      flex-basis: 30px;
    }
  }

  @media (max-width: 1199px) {
    .pipeBoard {
      --m-cols: 56px 106px minmax(0, 1fr) minmax(80px, 120px) 64px 58px;
    }

    .pipeFlowRow {
      flex-wrap: wrap;
    }

    .pipeFlow {
      flex-wrap: wrap;
      row-gap: 4px;
    }
  }

  @media (max-width: 860px) {
    .pipeBoard {
      --m-cols: 50px minmax(0, 1fr) 46px;
    }

    .pipeFilters {
      flex-wrap: wrap;
    }

    .pipeStats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pipeStage.stage-processing.has-count .pipeOrbDot,
    .pipePill.state-processing::before {
      animation: none;
    }
  }

  /* Background picker popover. */
  .bgPopover {
    position: fixed;
    z-index: 40;
    left: calc(28px + var(--sidebar-w));
    bottom: 16px;
    width: min(520px, calc(100vw - var(--sidebar-w) - 44px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 22px 22px 18px;
    border: 1px solid var(--popover-border);
    border-radius: 26px;
    background: var(--glass-specular), var(--popover-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 30px 70px -20px rgba(20, 24, 80, 0.45), 0 4px 14px rgba(20, 24, 80, 0.12);
    color: var(--text);
    font-size: 13.5px;
    animation: popoverEnter 180ms var(--ease-out) both;
  }

  .bgPopover.is-active {
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }

  @keyframes popoverEnter {
    from { transform: translateY(8px) scale(0.98); }
    to { transform: none; }
  }

  .bgHead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .bgTitle {
    margin: 0;
    color: var(--text);
    font-size: 18px;
    font-weight: 700;
  }

  .bgLead {
    margin-top: 4px;
    color: var(--text-2);
    font-size: 12.5px;
  }

  .bgClose {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
  }

  .bgClose:hover {
    background: var(--shell-hover);
  }

  .bgCloseIcon {
    width: 18px;
    height: 18px;
  }

  .bgTiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 16px;
  }

  .bgTile {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .bgTile:focus-visible {
    box-shadow: none;
  }

  .bgTile:focus-visible .bgThumb {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.45);
  }

  .bgTile.is-selected {
    color: var(--text);
    font-weight: 600;
  }

  .bgThumb {
    position: relative;
    display: block;
    height: 74px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 14px;
    box-shadow: 0 4px 12px -4px rgba(20, 30, 80, 0.3);
    background-size: cover;
  }

  .bgTile.is-selected .bgThumb {
    outline: 2.5px solid #2a6bff;
    outline-offset: 2px;
  }

  .bgTile.is-selected .bgThumb::after {
    content: "";
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #2a6bff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 12.5 4 4L18 8'/%3E%3C/svg%3E") center / 14px no-repeat;
    box-shadow: 0 2px 6px rgba(42, 107, 255, 0.5);
  }

  .bgPane {
    position: absolute;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.32);
  }

  .bgThumb[data-wall="night"] .bgPane,
  .bgThumb[data-wall="graphite"] .bgPane {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
  }

  .bgPaneSide { left: 8px; top: 8px; bottom: 8px; width: 18%; }
  .bgPaneTop { left: calc(18% + 14px); right: 8px; top: 8px; height: 18%; }
  .bgPaneMain { left: calc(18% + 14px); right: 8px; top: calc(18% + 14px); bottom: 8px; }

  .bgThumbCustom {
    background: var(--bg-image, none) center / cover no-repeat, var(--bg-custom-color, #8a93a6);
  }

  .bgThumbUpload {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1.5px dashed var(--text-3);
    background: var(--chip-fill);
    box-shadow: none;
    color: var(--text-2);
    font-size: 11.5px;
  }

  .bgPlusIcon {
    width: 20px;
    height: 20px;
  }

  .bgFields {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  .bgField {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 10px;
  }

  .bgFieldLabel {
    color: var(--text);
    font-size: 13.5px;
    font-weight: 500;
  }

  .bgFieldValue {
    color: var(--text-2);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .bgSegmented {
    grid-column: 2 / 4;
    display: inline-flex;
    justify-self: start;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(120, 130, 170, 0.18);
  }

  .bgSegment {
    min-height: 30px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .bgSegment[aria-pressed="true"] {
    background: rgba(255, 255, 255, 0.88);
    color: #0b1220;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .bgRange {
    --fill: 0%;
    width: 100%;
    height: 22px;
    margin: 0;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .bgRange:focus-visible {
    box-shadow: none;
  }

  .bgRange::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, #5aa0ff, #2a6bff) 0 0 / var(--fill) 100% no-repeat, rgba(120, 130, 170, 0.28);
  }

  .bgRange::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
    margin-top: -8px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.08);
    -webkit-appearance: none;
    appearance: none;
  }

  .bgRange:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  .bgRange::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: rgba(120, 130, 170, 0.28);
  }

  .bgRange::-moz-range-progress {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, #5aa0ff, #2a6bff);
  }

  .bgRange::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  .bgRange:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  .bgFoot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--shell-line);
  }

  .bgStatus {
    flex: 1 1 200px;
    min-width: 0;
    color: var(--text-2);
    font-size: 12.5px;
  }

  .bgStatus.is-error {
    color: var(--err-ink);
    font-weight: 600;
  }

  .bgActions {
    display: inline-flex;
    gap: 8px;
  }

  .bgButton {
    min-height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 10px;
    background: var(--chip-fill);
    box-shadow: inset 0 0 0 1px var(--chip-border);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .bgButton.is-primary {
    background: linear-gradient(180deg, #4b8bff, #2a63ff);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 12px rgba(42, 99, 255, 0.35);
    color: #fff;
  }

  .bgButton:focus-visible,
  .bgSegment:focus-visible,
  .bgClose:focus-visible,
  .sidebarRow:focus-visible {
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.4);
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
    .navGroupLabel,
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

    .devToggle .navIcon,
    .bgPickerButton .navIcon {
      display: none;
    }

    .sidebarRow {
      justify-content: center;
      padding: 4px 0;
    }

    .mainArea {
      margin-left: calc(var(--sidebar-w) + 32px);
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
      border-left: 1px solid var(--shell-line);
    }

    .navItem {
      width: 44px;
      flex: 0 0 44px;
    }

    .sidebarFooter {
      flex-direction: row;
      align-items: center;
      margin: 0 0 0 auto;
      padding: 0 0 0 8px;
      border-top: 0;
      border-left: 1px solid var(--shell-line);
    }

    .sidebarRow {
      width: auto;
      padding: 4px 8px;
    }

    .bgPopover {
      top: 72px;
      right: 8px;
      bottom: auto;
      left: 8px;
      width: auto;
      max-height: calc(100vh - 80px);
      padding: 18px 16px 14px;
    }

    .bgField {
      grid-template-columns: 96px minmax(0, 1fr) 44px;
    }

    .statusHero.is-compact {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .statusHero.is-compact .statusText,
    .statusHero.is-compact .allClear {
      align-items: center;
    }

    .statusHero.is-compact .statusMeta {
      justify-content: center;
    }

    .mainArea {
      margin-left: 0;
      padding: 8px 12px 32px;
    }

    h1.pageTitle {
      font-size: 32px;
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

    .healthRing .ringGlow,
    .bgPopover {
      animation: none !important;
    }
  }

  /* ---------- Digests & Reviews ---------- */

  /* Digests material: Liquid Glass with a real edge. Light falls from the top left, so the rim (--d-rim) is
     brightest along the top and the upper-left corner and fades as it runs down the sides, with a faint
     catch-light where it reaches the bottom. --d-edge gives the slab its thickness: a crisp top bevel, a softer
     left one, a soft inner refraction glow and a thin reflection along the bottom edge. --d-sheen is the specular
     wash on the face. Fills multiply --glass-scale like the other views. */
  .skillsView,
  .projectsView,
  .digestsView {
    --d-glass: linear-gradient(180deg, rgba(255, 255, 255, calc(0.58 * var(--glass-scale))), rgba(248, 250, 255, calc(0.38 * var(--glass-scale))));
    --d-rim: linear-gradient(168deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.86) 12%, rgba(255, 255, 255, 0.40) 34%, rgba(190, 198, 238, 0.28) 62%, rgba(210, 216, 248, 0.34) 86%, rgba(255, 255, 255, 0.88) 100%);
    --d-edge:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.95),
      inset 1.5px 0 0 -0.5px rgba(255, 255, 255, 0.55),
      inset 0 16px 24px -20px rgba(255, 255, 255, 0.95),
      inset 0 0 22px rgba(176, 192, 255, 0.10),
      inset 0 -14px 20px -18px rgba(120, 132, 220, 0.18),
      inset 0 -1px 0 rgba(255, 255, 255, 0.72),
      0 0.5px 1px rgba(64, 54, 150, 0.12);
    --d-sheen:
      radial-gradient(120% 80% at 0% 0%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 46%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0) 30%),
      linear-gradient(0deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0) 10%);
    --d-shadow: var(--d-edge), 0 1px 2px rgba(60, 70, 150, 0.05), 0 24px 46px -28px rgba(70, 80, 180, 0.42);
    --d-drawer-shadow: var(--d-edge), 0 40px 90px -30px rgba(40, 50, 140, 0.45), 0 6px 18px rgba(40, 50, 140, 0.10);
    --d-well: linear-gradient(180deg, rgba(255, 255, 255, calc(0.42 * var(--glass-scale))), rgba(255, 255, 255, calc(0.26 * var(--glass-scale))));
    --d-well-edge: inset 0 1px 0 rgba(255, 255, 255, 0.90), inset 0 -1px 0 rgba(255, 255, 255, 0.50), 0 0 0 0.5px rgba(120, 130, 200, 0.10), 0 1px 2px rgba(60, 70, 150, 0.04);
    --d-row-line: rgba(40, 50, 110, 0.08);
    --d-tile: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(242, 245, 255, 0.70));
    --d-tile-shadow: inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(255, 255, 255, 0.6), 0 0 0 0.5px rgba(80, 90, 170, 0.14), 0 4px 10px -5px rgba(60, 70, 160, 0.30);
    --d-ok-fill: rgba(52, 199, 89, 0.14);
    --d-ok-ink: #16793a;
    --d-ok-dot: #34c759;
    --d-warn-fill: rgba(255, 159, 10, 0.15);
    --d-warn-ink: #9a5200;
    --d-warn-dot: #f59e0b;
    --d-err-fill: rgba(255, 69, 58, 0.11);
    --d-err-ink: #b42318;
    --d-err-dot: #ff453a;
    --d-muted-fill: rgba(130, 138, 166, 0.14);
    --d-muted-ink: #5d6478;
    --d-muted-dot: #a3aabb;
    --d-open-ink: #c46a00;
    --d-dot-none: rgba(150, 158, 190, 0.32);
    --d-ran: radial-gradient(circle at 35% 30%, #93f0b4, #24b85c 72%);
    --d-ran-glow: 0 0 0 3px rgba(52, 199, 89, 0.14), 0 2px 6px -1px rgba(30, 160, 80, 0.55);
    --d-reads: radial-gradient(circle at 35% 30%, #ffd78f, #f59e0b 72%);
    --d-reads-glow: 0 0 0 3px rgba(245, 158, 11, 0.14), 0 2px 6px -1px rgba(220, 130, 20, 0.50);
    --d-decision: #8e6cf6;
    --d-next: #34c759;
    --d-accent: #2f7cf6;
  }

  html[data-glass="dark"] .skillsView,
  html[data-glass="dark"] .projectsView,
  html[data-glass="dark"] .digestsView {
    --d-glass: linear-gradient(180deg, rgba(32, 44, 92, calc(0.52 * var(--glass-scale))), rgba(12, 18, 46, calc(0.48 * var(--glass-scale))));
    --d-rim: linear-gradient(168deg, rgba(222, 232, 255, 0.62) 0%, rgba(196, 212, 255, 0.38) 12%, rgba(150, 175, 255, 0.14) 36%, rgba(100, 128, 230, 0.08) 64%, rgba(120, 150, 240, 0.14) 86%, rgba(170, 196, 255, 0.42) 100%);
    --d-edge:
      inset 0 1.5px 0 rgba(226, 234, 255, 0.20),
      inset 1.5px 0 0 -0.5px rgba(200, 214, 255, 0.10),
      inset 0 16px 24px -20px rgba(170, 195, 255, 0.20),
      inset 0 0 22px rgba(90, 130, 255, 0.08),
      inset 0 -14px 20px -18px rgba(110, 150, 255, 0.26),
      inset 0 -1px 0 rgba(160, 190, 255, 0.22),
      0 0.5px 1px rgba(0, 2, 14, 0.45);
    --d-sheen:
      radial-gradient(120% 80% at 0% 0%, rgba(150, 180, 255, 0.15), rgba(150, 180, 255, 0) 46%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 30%),
      linear-gradient(0deg, rgba(140, 170, 255, 0.08), rgba(140, 170, 255, 0) 10%);
    --d-shadow: var(--d-edge), 0 24px 48px -22px rgba(0, 0, 0, 0.72);
    --d-drawer-shadow: var(--d-edge), 0 40px 90px -30px rgba(0, 0, 0, 0.85);
    --d-well: linear-gradient(180deg, rgba(255, 255, 255, calc(0.06 * var(--glass-scale))), rgba(255, 255, 255, calc(0.02 * var(--glass-scale))));
    --d-well-edge: inset 0 1px 0 rgba(200, 215, 255, 0.12), inset 0 -1px 0 rgba(150, 180, 255, 0.08), 0 0 0 0.5px rgba(150, 175, 255, 0.10);
    --d-row-line: rgba(255, 255, 255, 0.07);
    --d-tile: linear-gradient(180deg, rgba(72, 90, 152, 0.62), rgba(30, 40, 86, 0.56));
    --d-tile-shadow: inset 0 1px 0 rgba(220, 230, 255, 0.22), 0 0 0 0.5px rgba(150, 175, 255, 0.18), 0 6px 14px -6px rgba(0, 0, 0, 0.60);
    --d-ok-fill: rgba(52, 199, 89, 0.20);
    --d-ok-ink: #7ee8a6;
    --d-ok-dot: #3ad46e;
    --d-warn-fill: rgba(255, 170, 50, 0.20);
    --d-warn-ink: #ffc766;
    --d-warn-dot: #ffad33;
    --d-err-fill: rgba(255, 82, 72, 0.20);
    --d-err-ink: #ff9d95;
    --d-err-dot: #ff5a4f;
    --d-muted-fill: rgba(255, 255, 255, 0.08);
    --d-muted-ink: #b4bbd0;
    --d-muted-dot: #6b738e;
    --d-open-ink: #ffb84d;
    --d-dot-none: rgba(160, 175, 220, 0.22);
    --d-ran-glow: 0 0 0 3px rgba(52, 199, 89, 0.18), 0 0 10px -1px rgba(60, 220, 120, 0.65);
    --d-reads-glow: 0 0 0 3px rgba(255, 170, 50, 0.18), 0 0 10px -1px rgba(255, 170, 50, 0.60);
    --d-decision: #a98bff;
    --d-next: #3ad46e;
    --d-accent: #6fb0ff;
  }

  .policyBanner:not([hidden]) ~ .digestsView .pipeLeadRow {
    margin-top: 0;
  }

  .digestsView .digGlass,
  .projectsView .digGlass,
  .skillsView .digGlass {
    position: relative;
    isolation: isolate;
    border: 1px solid transparent;
    background: var(--d-glass);
    box-shadow: var(--d-shadow);
  }

  .digestsView .digGlass::before,
  .projectsView .digGlass::before,
  .skillsView .digGlass::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background: var(--d-sheen);
  }

  .digestsView .digGlass::after,
  .digestsView .actDrawer::after,
  .projectsView .digGlass::after,
  .projectsView .actDrawer::after,
  .skillsView .digGlass::after,
  .skillsView .actDrawer::after {
    content: "";
    position: absolute;
    inset: -1px;
    padding: 1.5px;
    border-radius: inherit;
    pointer-events: none;
    background: var(--d-rim);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
  }

  /* Toolbar: the two pickers (and the Failed chip from Home) on the left, the range on the right. */
  .digFilters {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .digToolbar .actPopup {
    flex: 0 1 250px;
    min-width: 150px;
    max-width: 260px;
  }

  .digToolbar .actPopupIcon {
    margin-left: auto;
  }

  .digStatusChip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 0 9px 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--d-err-fill);
    box-shadow: inset 0 0 0 0.5px rgba(255, 69, 58, 0.22);
    color: var(--d-err-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .digStatusChip[hidden],
  .digCards[hidden] {
    display: none;
  }

  .digStatusChipDot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--d-err-dot);
  }

  .digStatusChipIcon {
    width: 13px;
    height: 13px;
    opacity: 0.75;
  }

  /* Status cards. */
  .digCards {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 16px;
    margin-top: 16px;
  }

  .digCard {
    min-width: 0;
    padding: 16px 20px 18px;
    border-radius: 24px;
  }

  .digCardHead {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .digCardIcon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border-radius: 12px;
    background: var(--d-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .digCardIcon.is-vault {
    color: var(--d-decision);
  }

  .digCardGlyph {
    width: 21px;
    height: 21px;
  }

  .digCardTitle {
    margin: 0;
    color: var(--text);
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.015em;
    white-space: nowrap;
  }

  .digChip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 0 10px 0 9px;
    border-radius: 999px;
    background: var(--d-muted-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    color: var(--d-muted-ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .digChipDot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--d-muted-dot);
  }

  .digChip.is-ok { background: var(--d-ok-fill); color: var(--d-ok-ink); }
  .digChip.is-ok .digChipDot { background: var(--d-ok-dot); box-shadow: 0 0 6px rgba(52, 199, 89, 0.55); }
  .digChip.is-warn { background: var(--d-warn-fill); color: var(--d-warn-ink); }
  .digChip.is-warn .digChipDot { background: var(--d-warn-dot); }
  .digChip.is-err { background: var(--d-err-fill); color: var(--d-err-ink); }
  .digChip.is-err .digChipDot { background: var(--d-err-dot); }

  #digVaultChip {
    margin-left: auto;
  }

  .digStats {
    display: flex;
    align-items: center;
    margin-top: 14px;
  }

  .digStat {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 2px 16px;
  }

  .digStat:first-child {
    padding-left: 4px;
  }

  .digStat + .digStat,
  .digDots {
    box-shadow: -1px 0 0 var(--a-line);
  }

  .digStatIcon {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    color: var(--d-accent);
  }

  .digStatText {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .digStatLabel {
    color: var(--text-2);
    font-size: 13.5px;
    white-space: nowrap;
  }

  /* The projects stat reads "3 projects" over their names; its label is for screen readers only. */
  #digLastProjectsLabel {
    display: none;
  }

  #digNextRun,
  #digLastRun {
    flex: 0 0 auto;
    padding-right: 22px;
  }

  #digLastRun {
    padding-left: 18px;
  }

  .digStatValue {
    overflow: hidden;
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digStatSub {
    overflow: hidden;
    color: var(--text-2);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digVaultStats .digStat {
    flex: 0 0 auto;
    padding-right: 20px;
  }

  /* Fourteen days, oldest first: green ran, amber read but no checkpoint, grey nothing, today hollow until it runs. */
  .digDots {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: repeat(14, minmax(0, 1fr));
    min-width: 0;
    padding-left: 12px;
  }

  .digDot {
    display: grid;
    justify-items: center;
    gap: 8px;
    min-width: 0;
  }

  .digDotMark {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--d-dot-none);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.45);
  }

  .digDot.is-ran .digDotMark {
    background: var(--d-ran);
    box-shadow: var(--d-ran-glow);
  }

  .digDot.is-reads .digDotMark {
    background: var(--d-reads);
    box-shadow: var(--d-reads-glow);
  }

  .digDot.is-today:not(.is-ran) .digDotMark {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--d-ok-dot);
  }

  .digDotLabel {
    color: var(--text-3);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* "Oct 6" ends under its dot and runs left into the gutter, so it never meets the next label. */
  .digDot:first-child .digDotLabel {
    justify-self: end;
    margin-right: calc(50% - 0.6em);
  }

  @media (max-width: 1439px) {
    .digCards {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .digCard {
      padding: 14px 16px 16px;
    }

    .digStat {
      gap: 9px;
      padding: 2px 12px;
    }

    #digNextRun,
    #digLastRun {
      padding-right: 14px;
    }

    #digLastRun {
      padding-left: 12px;
    }

    .digStatIcon {
      width: 21px;
      height: 21px;
      flex-basis: 21px;
    }

    .digVaultStats .digStat {
      padding-right: 14px;
    }

    .digDots {
      padding-left: 8px;
    }
  }

  /* Day cards: a glass card with the day on top and the rows on an inset well. */
  .digBoard {
    margin-top: 16px;
  }

  .digestsView .digGroup {
    padding: 4px 6px 6px;
    border-radius: 24px;
  }

  .digDayHead {
    padding: 10px 12px 8px;
    font-size: 18px;
  }

  .digDayCount {
    margin-left: 5px;
    font-variant-numeric: tabular-nums;
  }

  .digRows {
    --m-row-line: transparent;
    border-radius: 18px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
  }

  .digestsView .digRow {
    grid-template-columns: 38px minmax(96px, 150px) minmax(0, 1fr) minmax(48px, max-content);
    column-gap: 14px;
    min-height: 62px;
    padding: 8px 14px;
    border-radius: 16px;
  }

  /* Hairlines start after the icon, as in a grouped list. */
  .digRow + .digRow::before {
    content: "";
    position: absolute;
    top: -0.5px;
    right: 14px;
    left: 66px;
    height: 1px;
    background: var(--d-row-line);
    pointer-events: none;
  }

  .digRow.is-open::before,
  .digRow.is-open + .digRow::before,
  .digRow:hover::before,
  .digRow:hover + .digRow::before {
    opacity: 0;
  }

  .digIcon,
  .digDrawerIcon {
    --d-hue: var(--d-accent);
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--d-hue) 7%, rgba(255, 255, 255, 0.96)), color-mix(in srgb, var(--d-hue) 15%, rgba(242, 245, 255, 0.74)));
    box-shadow: var(--d-tile-shadow);
    color: var(--d-hue);
  }

  html[data-glass="dark"] .digIcon,
  html[data-glass="dark"] .digDrawerIcon {
    background: linear-gradient(180deg, color-mix(in srgb, var(--d-hue) 22%, rgba(64, 80, 140, 0.62)), color-mix(in srgb, var(--d-hue) 12%, rgba(26, 36, 80, 0.58)));
  }

  .digIcon[data-hue="0"], .digDrawerIcon[data-hue="0"] { --d-hue: var(--proj-0); }
  .digIcon[data-hue="1"], .digDrawerIcon[data-hue="1"] { --d-hue: var(--proj-1); }
  .digIcon[data-hue="2"], .digDrawerIcon[data-hue="2"] { --d-hue: var(--proj-2); }
  .digIcon[data-hue="3"], .digDrawerIcon[data-hue="3"] { --d-hue: var(--proj-3); }
  .digIcon[data-hue="4"], .digDrawerIcon[data-hue="4"] { --d-hue: var(--proj-4); }
  .digIcon[data-hue="5"], .digDrawerIcon[data-hue="5"] { --d-hue: var(--proj-5); }
  .digIcon[data-hue="6"], .digDrawerIcon[data-hue="6"] { --d-hue: var(--proj-6); }
  .digIcon[data-hue="7"], .digDrawerIcon[data-hue="7"] { --d-hue: var(--proj-7); }
  .digIcon[data-hue="8"], .digDrawerIcon[data-hue="8"] { --d-hue: var(--proj-8); }
  .digIcon[data-hue="9"], .digDrawerIcon[data-hue="9"] { --d-hue: var(--proj-9); }

  .digIcon.is-skipped,
  .digDrawerIcon.is-skipped {
    --d-hue: var(--d-muted-dot);
  }

  .digIcon.is-failed,
  .digDrawerIcon.is-failed {
    --d-hue: var(--d-err-dot);
  }

  .digIconGlyph {
    width: 20px;
    height: 20px;
  }

  .digProject {
    overflow: hidden;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.005em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digMain {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .digSummary {
    overflow: hidden;
    color: var(--text-2);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digSummary.is-quiet {
    color: var(--text-3);
  }

  .digMeta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    color: var(--text-3);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .digSep {
    opacity: 0.8;
  }

  .digCount.is-open {
    color: var(--d-open-ink);
    font-weight: 500;
  }

  .digMeta.is-error {
    display: block;
    color: var(--d-err-ink);
    text-overflow: ellipsis;
  }

  .digFailDot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 8px;
    border-radius: 50%;
    background: var(--d-err-dot);
    box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.14);
    vertical-align: 1px;
  }

  .digTime {
    justify-self: end;
    color: var(--text-3);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .digRow.is-skipped {
    min-height: 54px;
  }

  .digRow.is-skipped .digProject {
    color: var(--text-2);
    font-weight: 500;
  }

  /* Docked beside the list (1440px and wider): the toolbar and cards stay full width, the list steps aside. */
  @media (min-width: 1440px) {
    .digestsView.is-drawer-open .digList,
    .digestsView.is-drawer-open .memMoreRow,
    .digestsView.is-drawer-open .memNotice {
      margin-right: calc(min(456px, calc(100vw - 32px)) + 16px);
    }

    .digestsView.is-drawer-open .digRow {
      grid-template-columns: 38px minmax(120px, 176px) minmax(0, 1fr) minmax(44px, max-content);
      column-gap: 12px;
    }
  }

  @media (max-width: 1180px) {
    .digCards {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Digest body of the shared drawer. */
  .digestsView .actDrawer,
  .projectsView .actDrawer,
  .skillsView .actDrawer {
    box-shadow: var(--d-drawer-shadow);
  }

  .digestsView .actDrawer::before,
  .projectsView .actDrawer::before,
  .skillsView .actDrawer::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background: var(--d-sheen);
  }

  .actDrawer.is-digest .actDrawerTitle {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .actDrawer.is-digest .actDrawerMeta {
    flex: 1 1 auto;
    align-items: center;
    gap: 14px;
    padding-top: 0;
  }

  .digDrawerIcon {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    border-radius: 14px;
  }

  .digDrawerIcon .digIconGlyph {
    width: 24px;
    height: 24px;
  }

  .digDrawerHeading {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .digDrawerProject {
    overflow: hidden;
    color: var(--text);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digDrawerWhen {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-2);
    font-size: 14px;
    white-space: nowrap;
  }

  .actDrawer.is-digest .actDrawerBody {
    margin-top: 18px;
  }

  .digestsView .actSection.digSection {
    margin-top: 20px;
  }

  .digestsView .actSection.digSection:first-child {
    margin-top: 0;
  }

  .digSectionTitle {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0 0 8px;
    color: var(--text);
    font-size: 16.5px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .digSectionCount {
    color: var(--text-2);
    font-size: 14.5px;
    font-weight: 500;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .digNarrative {
    margin: 0;
    color: var(--text-2);
    font-size: 15px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .digBullets,
  .digCommands,
  .digStateFacts,
  .digSources {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .digBullets {
    --d-bullet: var(--a-outcome-dot);
    gap: 5px;
  }

  .digBullets.tone-decisions { --d-bullet: var(--d-decision); }
  .digBullets.tone-next { --d-bullet: var(--d-next); }
  .digBullets.tone-open { --d-bullet: var(--d-warn-dot); }
  .digBullets.tone-quiet { --d-bullet: var(--d-muted-dot); }

  .digBullets li {
    position: relative;
    min-width: 0;
    padding-left: 22px;
    color: var(--text);
    font-size: 14.5px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  .digBullets li::before {
    content: "";
    position: absolute;
    top: 0.45em;
    left: 3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--d-bullet);
    box-shadow: inset 0 1px 1.5px rgba(255, 255, 255, 0.55), 0 1px 3px -1px var(--d-bullet);
  }

  .digShowAll {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--a-link);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .digShowAll:hover span {
    text-decoration: underline;
  }

  .digShowAllIcon {
    width: 15px;
    height: 15px;
  }

  .digSkills.actPane {
    display: flex;
    gap: 14px;
    margin-top: 22px;
    padding: 14px 16px 16px;
    border-radius: 18px;
  }

  .digSkillsIcon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border-radius: 11px;
    background: var(--d-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .digSkillsGlyph {
    width: 19px;
    height: 19px;
  }

  .digSkillsBody {
    flex: 1 1 auto;
    min-width: 0;
  }

  .digSkillsTitle {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 6px 0 10px;
    color: var(--text);
    font-size: 15px;
    font-weight: 650;
  }

  .digSkillChips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .digSkillChip {
    max-width: 100%;
    padding: 5px 12px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--d-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The quieter sections: smaller headings, secondary ink. */
  .digSection.is-quiet .digSectionTitle {
    color: var(--text-2);
    font-size: 14px;
    font-weight: 600;
  }

  .digSection.is-quiet .digSectionCount {
    font-size: 13.5px;
  }

  .digCommands {
    gap: 6px;
  }

  .digCommands code {
    display: block;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--a-tag-fill);
    color: var(--text);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .digStateFacts {
    gap: 8px;
  }

  .digStateFacts li {
    display: grid;
    gap: 2px;
    min-width: 0;
    font-size: 13.5px;
  }

  .digStateKey {
    color: var(--text-2);
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .digStateValue {
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .digDetails > summary {
    align-items: center;
    cursor: pointer;
    list-style: none;
  }

  .digDetails > summary::-webkit-details-marker {
    display: none;
  }

  .digDetailsIcon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    align-self: center;
    transition: transform 160ms var(--ease-out);
  }

  .digDetails[open] .digDetailsIcon {
    transform: rotate(90deg);
  }

  .digSources {
    grid-template-columns: minmax(0, 1fr);
    gap: 1px;
  }

  .digSources li {
    min-width: 0;
  }

  .digSource {
    display: flex;
    align-items: center;
    gap: 10px;
    width: calc(100% + 16px);
    min-height: 34px;
    margin: 0 -8px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  button.digSource:hover {
    background: var(--shell-hover);
  }

  .digSource.is-missing {
    color: var(--text-3);
    cursor: default;
  }

  .digSourceIcon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--text-3);
  }

  .digSourceTitle {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .digSourceTime {
    flex: 0 0 auto;
    color: var(--text-3);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  .digError.actPane {
    margin-top: 0;
    padding: 14px 16px 16px;
    border-radius: 18px;
  }

  .digError + .actSection {
    margin-top: 20px;
  }

  .digErrorTitle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .digErrorIcon {
    width: 19px;
    height: 19px;
    flex: 0 0 19px;
    color: var(--d-err-dot);
  }

  .digErrorText {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--d-err-fill);
    color: var(--d-err-ink);
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .digestsView .actSection.digFooter {
    margin-top: 24px;
    padding-top: 14px;
    border-top: 1px solid var(--a-line);
    border-radius: 0;
  }

  /* ---------- Projects ---------- */

  /* A sibling of Digests: the same glass material (--d-* tokens, .digGlass), toolbar, chips and drawer. Folder
     tiles share one calm blue tint; nothing here is colour-coded per project. */
  .projectsView,
  .skillsView {
    --prj-cols: 42px minmax(0, 1fr) 96px 120px 84px 84px;
    --prj-tile: linear-gradient(180deg, color-mix(in srgb, var(--d-accent) 7%, rgba(255, 255, 255, 0.96)), color-mix(in srgb, var(--d-accent) 15%, rgba(242, 245, 255, 0.74)));
    --prj-tile-on: linear-gradient(180deg, color-mix(in srgb, var(--d-accent) 14%, rgba(255, 255, 255, 0.96)), color-mix(in srgb, var(--d-accent) 26%, rgba(236, 242, 255, 0.80)));
    --prj-bar: linear-gradient(180deg, #62a8ff, #2f7cf6);
    --prj-bar-glow: inset 0 1px 0 rgba(255, 255, 255, 0.50), 0 4px 10px -6px rgba(47, 124, 246, 0.75);
    --prj-bar-zero: rgba(150, 160, 200, 0.20);
  }

  html[data-glass="dark"] .projectsView,
  html[data-glass="dark"] .skillsView {
    --prj-tile: linear-gradient(180deg, color-mix(in srgb, var(--d-accent) 22%, rgba(64, 80, 140, 0.62)), color-mix(in srgb, var(--d-accent) 12%, rgba(26, 36, 80, 0.58)));
    --prj-tile-on: linear-gradient(180deg, color-mix(in srgb, var(--d-accent) 38%, rgba(64, 86, 160, 0.70)), color-mix(in srgb, var(--d-accent) 22%, rgba(30, 44, 100, 0.64)));
    --prj-bar: linear-gradient(180deg, #74b4ff, #2f7cff);
    --prj-bar-glow: inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 0 12px -3px rgba(60, 140, 255, 0.70);
    --prj-bar-zero: rgba(160, 180, 230, 0.16);
  }

  .policyBanner:not([hidden]) ~ .projectsView .pipeLeadRow {
    margin-top: 0;
  }

  /* Toolbar: the search well, a quiet Sort picker after a hairline, the range on the right. */
  .prjToolbar .prjSearch {
    flex: 0 1 340px;
  }

  .prjToolbar .prjSort {
    gap: 10px;
    margin-left: 4px;
    padding: 0 14px 0 20px;
    border-color: transparent;
    border-radius: 14px;
    background: transparent;
    box-shadow: none;
  }

  .prjToolbar .prjSort::after {
    content: none;
  }

  .prjToolbar .prjSort::before {
    content: "";
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 0;
    width: 1px;
    background: var(--a-line);
  }

  .prjToolbar .prjSort:hover,
  .prjToolbar .prjSort[aria-expanded="true"] {
    background: var(--shell-hover);
  }

  .prjToolbar .prjSort .actPopupValue {
    font-weight: 500;
  }

  .prjToolbar .prjSort .actPopupIcon {
    color: var(--text);
  }

  /* Summary tiles. */
  .prjStats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-top: 16px;
  }

  .prjStats[hidden],
  .prjCard[hidden] {
    display: none;
  }

  .prjStat {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    min-height: 86px;
    padding: 14px 18px;
    border-radius: 22px;
  }

  .prjStatIcon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    border-radius: 14px;
    background: var(--d-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .prjStatGlyph {
    width: 24px;
    height: 24px;
  }

  .prjStatText {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .prjStatLabel {
    overflow: hidden;
    color: var(--text);
    font-size: 14.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjStatLine {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .prjStatValue {
    color: var(--text);
    font-size: 27px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .prjStatValue.is-zero {
    color: var(--text-3);
  }

  .prjStatNote {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjStatNote[hidden] {
    display: none;
  }

  .prjStatNote.is-candidates {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--d-warn-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    color: var(--d-warn-ink);
    font-size: 13px;
    font-weight: 500;
  }

  .prjStatNote.is-quiet {
    color: var(--text-3);
    font-size: 13.5px;
  }

  .prjStatSub {
    min-width: 0;
    overflow: hidden;
    color: var(--text-3);
    font-size: 12.5px;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* List card: one glass card, column headers, rows on the card itself. */
  .prjBoard {
    margin-top: 16px;
  }

  .prjCard {
    padding: 4px 8px 6px;
    border-radius: 24px;
  }

  .prjHead,
  .projectsView .prjRow {
    display: grid;
    grid-template-columns: var(--prj-cols);
    align-items: center;
    column-gap: 14px;
  }

  .prjHead {
    padding: 14px 16px 10px;
    color: var(--text-2);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .prjCol {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjCol.is-name {
    grid-column: span 2;
  }

  .prjList {
    display: grid;
    transition: opacity 200ms var(--ease-out);
  }

  .prjList.is-stale {
    opacity: 0.55;
  }

  .projectsView .prjRow {
    min-height: 78px;
    padding: 10px 14px;
    border-radius: 16px;
  }

  .projectsView .prjRow + .prjRow {
    box-shadow: none;
  }

  .prjRow + .prjRow::before {
    content: "";
    position: absolute;
    top: -0.5px;
    right: 14px;
    left: 14px;
    height: 1px;
    background: var(--d-row-line);
    pointer-events: none;
  }

  .prjRow.is-open::before,
  .prjRow.is-open + .prjRow::before,
  .prjRow:hover::before,
  .prjRow:hover + .prjRow::before {
    opacity: 0;
  }

  .prjIcon,
  .prjDrawerIcon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: var(--prj-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .prjRow.is-open .prjIcon {
    background: var(--prj-tile-on);
  }

  .prjIconGlyph {
    width: 22px;
    height: 22px;
  }

  .prjMain {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .prjName {
    overflow: hidden;
    color: var(--text);
    font-size: 16.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjChips {
    display: flex;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .prjChip {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 12.5px;
    line-height: 1.45;
    white-space: nowrap;
  }

  .prjChip.is-more {
    flex: 0 0 auto;
  }

  .prjChipName {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    opacity: 0.82;
    text-overflow: ellipsis;
  }

  .prjChipCount {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  .prjQuiet {
    overflow: hidden;
    color: var(--text-3);
    font-size: 13.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjMem {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .prjNum {
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .prjSub {
    overflow: hidden;
    color: var(--text-3);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjWhen,
  .prjDigests {
    overflow: hidden;
    color: var(--text);
    font-size: 14.5px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjDigests.is-zero {
    color: var(--text-3);
  }

  .prjSkills {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .prjSkillCount {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .prjDash {
    color: var(--text-3);
  }

  .prjCand {
    display: inline-grid;
    place-items: center;
    min-width: 32px;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--d-warn-fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    color: var(--d-warn-ink);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* No activity in the range: the row steps back, the folder goes neutral. */
  .prjRow.is-quiet .prjIcon {
    background: var(--d-tile);
    color: var(--d-muted-dot);
  }

  .prjRow.is-quiet .prjName {
    color: var(--text-2);
    font-weight: 550;
  }

  .prjRow.is-quiet .prjNum,
  .prjRow.is-quiet .prjWhen,
  .prjRow.is-quiet .prjSkillCount {
    color: var(--text-2);
    font-weight: 500;
  }

  .prjRow.is-skeleton {
    cursor: default;
  }

  .prjRow.is-skeleton .prjIcon {
    background: var(--prj-bar-zero);
    box-shadow: none;
  }

  .prjRow.is-skeleton .actSkel.is-mid { width: 38%; }
  .prjRow.is-skeleton .actSkel.is-short { width: 22%; }

  .prjFoot {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 52px;
    padding: 6px 0 4px;
  }

  .prjCount {
    color: var(--text-2);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .prjCount[hidden],
  .prjFoot .memMore[hidden] {
    display: none;
  }

  /* Docked beside the list (1440px and wider): the toolbar and tiles stay full width, the list steps aside. */
  @media (min-width: 1440px) {
    .projectsView.is-drawer-open .prjBoard {
      margin-right: calc(min(456px, calc(100vw - 32px)) + 16px);
    }

    .projectsView.is-drawer-open {
      --prj-cols: 40px minmax(0, 1fr) 76px 96px 66px 66px;
    }

    .projectsView.is-drawer-open .prjHead,
    .projectsView.is-drawer-open .prjRow {
      column-gap: 12px;
    }
  }

  @media (max-width: 1180px) {
    .prjStats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Project body of the shared drawer. */
  .actDrawer.is-project .actDrawerTitle {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .actDrawer.is-project .actDrawerMeta {
    flex: 1 1 auto;
    align-items: center;
    gap: 14px;
    padding-top: 0;
  }

  .prjDrawerIcon {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    border-radius: 14px;
    background: var(--prj-tile-on);
  }

  .prjDrawerIcon .prjIconGlyph {
    width: 24px;
    height: 24px;
  }

  .prjDrawerWhen {
    gap: 8px;
  }

  .prjSep {
    color: var(--text-3);
  }

  .actDrawer.is-project .actDrawerBody {
    margin-top: 16px;
  }

  .projectsView .actSection.prjSection {
    margin-top: 20px;
  }

  .projectsView .actSection.prjSection:first-child {
    margin-top: 0;
  }

  .prjSectionTitle {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0 0 9px;
    color: var(--text);
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .prjSectionSub,
  .prjSectionCount {
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .prjSectionMeta {
    margin-left: auto;
    color: var(--text-2);
    font-size: 13.5px;
    font-weight: 400;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Fourteen slim bars, oldest first; empty days keep a faint stub. */
  .prjBars {
    display: grid;
    grid-template-columns: repeat(14, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
    height: 46px;
    padding: 0 2px;
  }

  .prjBars.is-empty {
    height: 10px;
  }

  .prjBar {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 100%;
  }

  .prjBarFill {
    width: 100%;
    max-width: 22px;
    border-radius: 5px 5px 4px 4px;
    background: var(--prj-bar);
    box-shadow: var(--prj-bar-glow);
  }

  .prjBar.is-zero .prjBarFill {
    height: 6px;
    background: var(--prj-bar-zero);
    box-shadow: none;
  }

  .prjBarDays {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding: 0 2px;
    color: var(--text-3);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  .prjNote {
    margin: 6px 0 0;
    color: var(--text-3);
    font-size: 12.5px;
    line-height: 1.5;
  }

  .prjBars.is-empty + .prjBarDays + .prjNote {
    color: var(--text-2);
    font-size: 13.5px;
  }

  .prjContext {
    margin: 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
    color: var(--text);
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
  }

  /* Expanded, the whole preview wraps inside its own scroll box. */
  .prjContext.is-open {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 280px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .prjShowAll {
    margin-top: 6px;
    font-size: 13.5px;
  }

  .prjWell {
    margin: 0;
    padding: 4px 12px;
    border-radius: 14px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
    list-style: none;
  }

  .prjFact {
    display: grid;
    grid-template-columns: minmax(0, 40%) minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
    padding: 5px 0;
    font-size: 13.5px;
  }

  .prjFact + .prjFact {
    box-shadow: 0 -1px 0 var(--d-row-line);
  }

  .prjFact dt,
  .prjFact dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjFact dt {
    color: var(--text-2);
  }

  .prjFact dd {
    color: var(--text);
    font-weight: 500;
  }

  .prjFactScope {
    color: var(--text-3);
  }

  .prjFactScope::after {
    content: " · ";
  }

  .prjDigestList {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 4px 6px;
  }

  .prjDigest {
    display: grid;
    grid-template-columns: 4.4em 8px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 30px;
    padding: 2px 6px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }

  .prjDigest:hover {
    background: var(--shell-hover);
  }

  .prjDigest:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.30);
  }

  .prjDigestDay {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .prjDigestDot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--d-ok-dot);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--d-ok-dot) 16%, transparent);
  }

  .prjDigest.is-skipped .prjDigestDot {
    background: var(--d-muted-dot);
    box-shadow: none;
  }

  .prjDigest.is-failed .prjDigestDot {
    background: var(--d-err-dot);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--d-err-dot) 16%, transparent);
  }

  .prjDigestText {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjDigestText.is-quiet {
    color: var(--text-2);
  }

  .prjSkillList {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .prjSkill {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    padding: 2px 4px;
    font-size: 14px;
  }

  .prjSkillIcon {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    color: var(--d-accent);
  }

  .prjSkillName {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prjSkill .digChip {
    flex: 0 0 auto;
    min-height: 22px;
    padding: 0 9px 0 8px;
    font-size: 12px;
  }

  .prjSkillMeta {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--text-2);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .prjSkill.is-disabled .prjSkillName,
  .prjSkill.is-disabled .prjSkillIcon {
    opacity: 0.55;
  }

  /* One quiet line for an empty section, on the same inset well as the filled ones. */
  .prjEmpty {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
    color: var(--text-2);
    font-size: 13.5px;
    line-height: 1.4;
  }

  .prjEmptyIcon {
    width: 17px;
    height: 17px;
    flex: 0 0 17px;
    color: var(--text-3);
  }

  /* ---------- Skills ---------- */

  /* A sibling of Projects: the same toolbar, tiles, list card, chips and drawer. Icons stay in the family's blue,
     or neutral once a skill stops matching; only the status chips carry a tone. */
  .skillsView {
    --skl-cols: 48px minmax(0, 1fr) 132px 124px 56px 112px;
    --skl-ink: #1f6fe8;
    --skl-outline: color-mix(in srgb, var(--d-accent) 62%, transparent);
    --skl-button: rgba(255, 255, 255, calc(0.72 * var(--glass-scale)));
    --skl-primary: linear-gradient(180deg, #3a8bff, #1f6ff0);
    --skl-primary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 6px 16px -8px rgba(31, 111, 240, 0.80);
    --skl-ring: 0 0 0 1.5px color-mix(in srgb, var(--d-accent) 58%, transparent), 0 8px 22px -14px rgba(47, 124, 246, 0.55);
  }

  html[data-glass="dark"] .skillsView {
    --skl-ink: #8cc2ff;
    --skl-outline: color-mix(in srgb, var(--d-accent) 55%, transparent);
    --skl-button: rgba(255, 255, 255, 0.07);
    --skl-primary: linear-gradient(180deg, #3d8dff, #2365e6);
    --skl-primary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 18px -6px rgba(60, 140, 255, 0.70);
    --skl-ring: 0 0 0 1.5px color-mix(in srgb, var(--d-accent) 60%, transparent), 0 0 22px -10px rgba(60, 140, 255, 0.60);
  }

  .skillsView .sklCard[data-skill-mode="matches"] {
    --skl-cols: 48px minmax(0, 1fr) 132px 172px 96px 112px;
  }

  .policyBanner:not([hidden]) ~ .skillsView .pipeLeadRow {
    margin-top: 0;
  }

  /* Tile sub-lines carry the quiet "why" (no active skill yet, no reviews in the range). */
  .sklStats .prjStatSub {
    margin-top: 1px;
    font-size: 12px;
    line-height: 1.3;
    white-space: normal;
  }

  .sklStats .prjStatSub[hidden] {
    display: none;
  }

  .sklCard {
    padding: 14px 10px 8px;
  }

  .sklCardTop {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 6px 4px;
  }

  .sklSegments .sklSeg {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 22px;
    font-size: 14.5px;
    font-weight: 500;
  }

  .sklSegCount {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .sklSeg[aria-pressed="true"] .sklSegCount {
    color: var(--text);
  }

  .sklSeg:not([aria-pressed="true"]) .sklSegName {
    color: var(--text-2);
  }

  .sklBanner {
    margin: 8px 6px 2px;
    padding: 9px 14px;
    border-radius: 12px;
    background: var(--a-concept-fill);
    color: var(--a-concept-ink);
    font-size: 13.5px;
  }

  .sklBanner[hidden],
  .sklHead[hidden],
  .sklList[hidden],
  .sklFoot[hidden],
  .sklEmpty[hidden],
  .sklDrawerFoot[hidden] {
    display: none;
  }

  .sklHead,
  .skillsView .sklRow {
    grid-template-columns: var(--skl-cols);
  }

  .sklHead {
    padding: 16px 16px 10px;
  }

  .skillsView .sklRow {
    display: grid;
    align-items: center;
    column-gap: 14px;
    min-height: 76px;
    padding: 10px 14px;
    border-radius: 16px;
  }

  .skillsView .sklRow + .sklRow {
    box-shadow: none;
  }

  .sklRow + .sklRow::before {
    content: "";
    position: absolute;
    top: -0.5px;
    right: 14px;
    left: 14px;
    height: 1px;
    background: var(--d-row-line);
    pointer-events: none;
  }

  .sklRow.is-open::before,
  .sklRow.is-open + .sklRow::before,
  .sklRow:hover::before,
  .sklRow:hover + .sklRow::before {
    opacity: 0;
  }

  .skillsView .sklRow.is-open {
    box-shadow: var(--skl-ring);
  }

  .sklIcon,
  .sklDrawerIcon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 13px;
    background: var(--prj-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .sklRow.is-open .sklIcon {
    background: var(--prj-tile-on);
  }

  .sklIcon.is-disabled,
  .sklIcon.is-retired,
  .sklDrawerIcon.is-disabled,
  .sklDrawerIcon.is-retired {
    background: var(--d-tile);
    color: var(--d-muted-dot);
  }

  .sklIconGlyph {
    width: 24px;
    height: 24px;
  }

  .sklMain {
    gap: 3px;
  }

  .sklNameLine {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .sklName {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 16px;
  }

  .sklSummary,
  .sklRowNote {
    overflow: hidden;
    color: var(--text-2);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sklRowNote.is-ok {
    color: var(--skl-ink);
    font-weight: 500;
  }

  .sklRowNote.is-error {
    color: var(--d-err-ink);
  }

  .sklProject {
    display: flex;
    min-width: 0;
  }

  .sklProjectChip {
    padding: 3px 11px;
    font-size: 13.5px;
  }

  .sklSource {
    overflow: hidden;
    color: var(--text-2);
    font-size: 14.5px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sklSource.is-removed {
    color: var(--text-3);
    font-style: italic;
  }

  .sklSteps {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .sklSteps.is-zero {
    color: var(--text-3);
  }

  .sklActions {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }

  /* Buttons: outline for the row's next step, quiet for Disable, a solid blue for the drawer's primary action. */
  .sklAction {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 160ms var(--ease-out), box-shadow 160ms var(--ease-out), opacity 160ms var(--ease-out);
  }

  .sklAction:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.32);
  }

  .sklAction.is-outline {
    border-color: var(--skl-outline);
    background: var(--skl-button);
    color: var(--skl-ink);
  }

  .sklAction.is-outline:hover {
    background: color-mix(in srgb, var(--d-accent) 10%, var(--skl-button));
  }

  .sklAction.is-quiet {
    border-color: var(--a-line);
    color: var(--text-2);
  }

  .sklAction.is-quiet:hover,
  .sklAction.is-secondary:hover {
    background: var(--shell-hover);
  }

  .sklAction.is-secondary {
    min-height: 40px;
    padding: 0 18px;
    border-color: var(--a-line);
    background: var(--skl-button);
    color: var(--text);
  }

  .sklAction.is-primary {
    min-height: 40px;
    padding: 0 22px;
    background: var(--skl-primary);
    box-shadow: var(--skl-primary-shadow);
    color: #ffffff;
    font-weight: 600;
  }

  .sklAction.is-primary:hover {
    filter: brightness(1.05);
  }

  .sklAction.is-wide {
    flex: 1 1 auto;
    min-height: 44px;
    border-radius: 12px;
    font-size: 16px;
  }

  .sklAction[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
    filter: none;
  }

  .sklAction[aria-busy="true"] {
    opacity: 0.7;
    cursor: progress;
  }

  /* Status chips: Candidate amber, Draft amber outline, Active green, Disabled and Retired grey. No dot. */
  .sklChip {
    flex: 0 0 auto;
    min-height: 22px;
    padding: 0 10px;
    font-size: 12.5px;
    white-space: nowrap;
  }

  .sklChip .digChipDot {
    display: none;
  }

  .sklChip.is-draft {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--d-warn-dot) 70%, transparent);
    color: var(--d-warn-ink);
  }

  .sklChip.is-muted {
    background: var(--d-muted-fill);
    color: var(--d-muted-ink);
  }

  /* Active rows: the count, a hairline sparkline of 14 days and when it last matched. */
  .sklMatches {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .sklMatchLine {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sklMatchNum {
    min-width: 1.6em;
    color: var(--text);
    font-size: 16px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .sklMatchNum.is-zero {
    color: var(--text-3);
  }

  .sklSpark {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 18px;
  }

  .sklSparkBar {
    width: 4px;
    min-height: 3px;
    border-radius: 2px;
    background: var(--prj-bar);
  }

  .sklSparkBar.is-zero {
    height: 3px;
    background: var(--prj-bar-zero);
  }

  .sklMatchWhen {
    overflow: hidden;
    color: var(--text-3);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sklFeedback {
    display: flex;
    gap: 12px;
  }

  .sklVote {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .sklVote.is-zero {
    color: var(--text-3);
  }

  .sklVoteIcon {
    width: 15px;
    height: 15px;
    color: var(--text-2);
  }

  /* Retired rows step back; their Re-enable stays at full strength. */
  .sklRow.is-retired .sklMain,
  .sklRow.is-retired .sklProject,
  .sklRow.is-retired .sklMatches,
  .sklRow.is-retired .sklFeedback {
    opacity: 0.58;
  }

  .sklRow.is-disabled .sklName {
    color: var(--text-2);
  }

  .sklRow.is-skeleton .sklIcon {
    background: var(--prj-bar-zero);
    box-shadow: none;
  }

  .sklRow.is-skeleton .actSkel.is-mid { width: 38%; }
  .sklRow.is-skeleton .actSkel.is-short { width: 22%; }

  /* An empty segment inside the card: a real invitation for Active, one quiet line for the others. */
  .sklEmpty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 46px 24px 50px;
    text-align: center;
  }

  .sklEmptyIcon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    margin-bottom: 8px;
    border-radius: 17px;
    background: var(--prj-tile);
    box-shadow: var(--d-tile-shadow);
    color: var(--d-accent);
  }

  .sklEmptyGlyph {
    width: 28px;
    height: 28px;
  }

  .sklEmptyTitle {
    margin: 0;
    color: var(--text);
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .sklEmptyLead {
    margin: 0;
    color: var(--text-2);
    font-size: 14.5px;
  }

  .sklEmptyLead[hidden],
  .sklEmpty .sklAction[hidden] {
    display: none;
  }

  .sklEmpty .sklAction {
    margin-top: 12px;
  }

  .sklEmpty.is-quiet {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    padding: 30px 24px 34px;
  }

  .sklEmpty.is-quiet .sklEmptyIcon {
    width: 34px;
    height: 34px;
    margin: 0;
    border-radius: 11px;
    background: var(--d-tile);
    color: var(--d-muted-dot);
  }

  .sklEmpty.is-quiet .sklEmptyGlyph {
    width: 18px;
    height: 18px;
  }

  .sklEmpty.is-quiet .sklEmptyTitle {
    color: var(--text-2);
    font-size: 14.5px;
    font-weight: 500;
  }

  .sklFoot {
    flex-direction: column;
    gap: 4px;
    min-height: 64px;
    padding: 10px 0 6px;
  }

  .sklMore {
    padding: 2px 10px;
    border: 0;
    background: none;
    color: var(--skl-ink);
    font: inherit;
    font-size: 14.5px;
    font-weight: 500;
    cursor: pointer;
  }

  .sklMore:hover {
    text-decoration: underline;
  }

  .sklMore[hidden] {
    display: none;
  }

  .sklMore[aria-busy="true"] {
    color: var(--text-2);
    cursor: progress;
  }

  /* Confirm for Disable and Retire: a small glass card under (or above) its button, over the drawer too. */
  .sklConfirm {
    z-index: 60;
    width: 300px;
    padding: 14px 16px;
  }

  .sklConfirmText {
    margin: 0 0 12px;
    color: var(--text);
    font-size: 14px;
    line-height: 1.45;
  }

  .sklConfirmActions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .sklConfirmActions .sklAction {
    min-height: 34px;
    padding: 0 14px;
    font-size: 14px;
  }

  /* Docked beside the list (1440px and wider): the toolbar and tiles stay full width, the list steps aside. */
  @media (min-width: 1440px) {
    .skillsView.is-drawer-open .prjBoard {
      margin-right: calc(min(456px, calc(100vw - 32px)) + 16px);
    }

    .skillsView.is-drawer-open .sklCard {
      --skl-cols: 40px minmax(0, 1fr) 96px 84px 40px 90px;
      padding-right: 6px;
      padding-left: 6px;
    }

    .skillsView.is-drawer-open .sklCard[data-skill-mode="matches"] {
      --skl-cols: 40px minmax(0, 1fr) 96px 100px 66px 90px;
    }

    .skillsView.is-drawer-open .sklHead,
    .skillsView.is-drawer-open .sklRow {
      column-gap: 6px;
    }

    .skillsView.is-drawer-open .sklRow {
      padding: 10px 8px;
    }

    .skillsView.is-drawer-open .sklIcon {
      width: 40px;
      height: 40px;
    }

    .skillsView.is-drawer-open .sklName {
      font-size: 15.5px;
    }

    .skillsView.is-drawer-open .sklSummary,
    .skillsView.is-drawer-open .sklRowNote {
      font-size: 13.5px;
    }

    .skillsView.is-drawer-open .sklProjectChip {
      max-width: 100%;
      padding-right: 8px;
      padding-left: 8px;
    }

    .skillsView.is-drawer-open .sklSource {
      font-size: 13.5px;
    }

    .skillsView.is-drawer-open .sklSpark {
      gap: 1px;
    }

    .skillsView.is-drawer-open .sklSparkBar {
      width: 3px;
    }

    .skillsView.is-drawer-open .sklMatchLine {
      gap: 6px;
    }

    .skillsView.is-drawer-open .sklFeedback {
      gap: 8px;
    }

    .skillsView.is-drawer-open .sklAction.is-outline,
    .skillsView.is-drawer-open .sklAction.is-quiet {
      padding: 0 10px;
      font-size: 14px;
    }
  }

  @media (max-width: 1180px) {
    .skillsView .sklCard,
    .skillsView .sklCard[data-skill-mode="matches"] {
      --skl-cols: 44px minmax(0, 1fr) 112px 108px 44px 100px;
    }
  }

  /* Skill body of the shared drawer. */
  .actDrawer.is-skill .actDrawerTitle {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .actDrawer.is-skill .actDrawerMeta {
    flex: 1 1 auto;
    align-items: center;
    gap: 14px;
    padding-top: 0;
  }

  .sklDrawerIcon {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    border-radius: 14px;
    background: var(--prj-tile-on);
  }

  .sklDrawerIcon .sklIconGlyph {
    width: 24px;
    height: 24px;
  }

  .sklDrawerHeading {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .sklDrawerTitleLine {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .sklDrawerName {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .sklDrawerTitleLine .sklChip {
    align-self: flex-start;
    margin-top: 1px;
  }

  .sklDrawerSub {
    display: flex;
    gap: 7px;
    min-width: 0;
    overflow: hidden;
    color: var(--text-2);
    font-size: 14px;
    white-space: nowrap;
  }

  .actDrawer.is-skill .actDrawerBody {
    margin-top: 16px;
  }

  .skillsView .actSection.sklSection {
    margin-top: 18px;
  }

  .skillsView .actSection.sklSection:first-child {
    margin-top: 0;
  }

  .sklSection .prjSectionTitle {
    margin-bottom: 6px;
  }

  .sklText {
    margin: 0;
    color: var(--text);
    font-size: 15px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .sklText.is-quiet {
    color: var(--text-2);
    font-size: 14px;
  }

  .sklConfidence {
    margin: 3px 0 0;
    color: var(--text-2);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .sklStepList {
    margin: 0;
    padding: 10px 14px 10px 42px;
    border-radius: 12px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
    color: var(--text);
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 13.5px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .sklStepList li::marker {
    color: var(--text-2);
  }

  /* Zero matches: fourteen flat, faint tiles rather than a blank strip. */
  .prjBars.sklBars.is-empty {
    height: 28px;
  }

  .sklBars.is-empty .prjBar.is-zero .prjBarFill {
    height: 100%;
    border-radius: 7px;
  }

  .sklBars + .prjBarDays + .sklText {
    margin-top: 6px;
  }

  .sklMatchList,
  .sklFeedList {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin: 0;
    padding: 4px 12px;
  }

  .sklMatchRow,
  .sklFeedRow {
    display: grid;
    grid-template-columns: 4.6em minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 34px;
    font-size: 13.5px;
  }

  .sklFeedRow {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .sklMatchRow + .sklMatchRow,
  .sklFeedRow + .sklFeedRow {
    box-shadow: 0 -1px 0 var(--d-row-line);
  }

  .sklMatchAt {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .sklMatchTask,
  .sklFeedText {
    overflow: hidden;
    color: var(--text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sklAgentChip {
    max-width: 130px;
    font-size: 12px;
  }

  .sklFeedHead {
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .sklFeedChips {
    display: inline-flex;
    gap: 6px;
    margin-left: 8px;
  }

  .sklFeedChip {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .sklFeedChip.is-up,
  .sklFeedChip.is-down {
    color: var(--text);
  }

  .sklLocked {
    margin-left: auto;
    color: var(--text-2);
    font-size: 13.5px;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0;
  }

  .sklOutcomeTag {
    padding: 1px 9px;
    border-radius: 999px;
    background: var(--d-muted-fill);
    color: var(--d-muted-ink);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  .sklOutcomeTag.is-success { background: var(--d-ok-fill); color: var(--d-ok-ink); }
  .sklOutcomeTag.is-failure { background: var(--d-err-fill); color: var(--d-err-ink); }
  .sklOutcomeTag.is-rejected { background: var(--d-warn-fill); color: var(--d-warn-ink); }

  .sklRecord {
    margin: 4px 0 10px;
    padding: 12px;
    border-radius: 14px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
  }

  .sklRecordTitle {
    margin: 0 0 8px;
    color: var(--text);
    font-size: 13.5px;
    font-weight: 600;
  }

  .sklOutcomes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sklOutcome {
    min-height: 30px;
    padding: 0 12px;
    border: 1px solid var(--a-line);
    border-radius: 999px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }

  .sklOutcome[aria-pressed="true"] {
    border-color: var(--skl-outline);
    background: color-mix(in srgb, var(--d-accent) 12%, transparent);
    color: var(--skl-ink);
    font-weight: 600;
  }

  .sklRecordRow {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .sklNoteInput {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--a-line);
    border-radius: 10px;
    background: var(--skl-button);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }

  .sklNoteInput:focus {
    outline: none;
    border-color: var(--skl-outline);
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.18);
  }

  .sklStale {
    margin: 0 0 14px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 13px;
  }

  /* The action bar: a glass slab under the scrolling body. */
  .sklDrawerFoot {
    flex: 0 0 auto;
    margin: 8px 14px 14px 0;
    padding: 12px;
    border-radius: 20px;
    background: var(--d-well);
    box-shadow: var(--d-well-edge);
  }

  .sklFootNote {
    margin: 0 0 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--a-tag-fill);
    color: var(--text-2);
    font-size: 13.5px;
    line-height: 1.4;
  }

  .sklFootNote.is-ok {
    background: var(--a-concept-fill);
    color: var(--a-concept-ink);
    font-weight: 500;
  }

  .sklFootNote.is-error {
    background: var(--d-err-fill);
    color: var(--d-err-ink);
  }

  .sklFootBar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sklFootBar.is-bare {
    justify-content: flex-end;
  }

  .sklFootActions {
    display: flex;
    flex: 1 1 auto;
    gap: 8px;
    min-width: 0;
  }

  .sklFootActions .sklAction.is-wide {
    max-width: 280px;
  }

  .sklDevLink {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--skl-ink);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
  }

  .sklDevLink:hover {
    background: var(--shell-hover);
  }

  .sklDevLinkIcon {
    width: 15px;
    height: 15px;
  }
`;
