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
  .actSection {
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
  .actSection::after {
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

  .actSegmented::after {
    background: var(--glass-border-well);
  }

  /* Drawer sections are panes inside the drawer's own glass: same rim, half the light. */
  .actSection::after {
    opacity: 0.5;
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
     working; these only shape Activity's surfaces. */
  .activityView {
    position: relative;
    --a-glass: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.40));
    --a-glass-shadow: var(--glass-edge), 0 1px 2px rgba(60, 70, 150, 0.05), 0 18px 40px -22px rgba(70, 80, 180, 0.38);
    --a-card-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.12));
    --a-card-shadow: var(--glass-edge), 0 1px 2px rgba(60, 70, 150, 0.04), 0 12px 26px -16px rgba(70, 80, 180, 0.28);
    --a-card-hover-shadow: var(--glass-edge), 0 2px 4px rgba(60, 70, 150, 0.05), 0 18px 34px -16px rgba(70, 80, 180, 0.38);
    --a-control-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.42));
    --a-control-shadow: var(--glass-edge), 0 6px 16px -12px rgba(60, 70, 160, 0.40);
    --a-track-fill: rgba(236, 238, 250, 0.46);
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
    --a-scrim: rgba(40, 46, 90, 0.10);
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

  html[data-glass="dark"] .activityView {
    --a-well-blur: blur(22px) saturate(160%);
    --a-glass: linear-gradient(180deg, rgba(30, 42, 88, 0.50), rgba(12, 18, 46, 0.46));
    --a-glass-shadow: var(--glass-edge), 0 22px 48px -20px rgba(0, 0, 0, 0.70);
    --a-card-fill: linear-gradient(180deg, rgba(30, 42, 88, 0.62), rgba(14, 20, 50, 0.58));
    --a-card-shadow: var(--glass-edge), 0 16px 30px -18px rgba(0, 0, 0, 0.80);
    --a-card-hover-shadow: var(--glass-edge), 0 0 0 1px rgba(110, 160, 255, 0.18), 0 20px 36px -18px rgba(0, 0, 0, 0.85);
    --a-control-fill: linear-gradient(180deg, rgba(40, 52, 100, 0.55), rgba(20, 28, 64, 0.45));
    --a-control-shadow: var(--glass-edge);
    --a-track-fill: rgba(8, 12, 32, 0.42);
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
    --a-scrim: rgba(2, 4, 16, 0.38);
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

  .activityView .kindPill {
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

  .activityView .kindPill::before {
    content: "";
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .activityView .kindPill.kind-outcome { background: var(--a-outcome-fill); color: var(--a-outcome-ink); }
  .activityView .kindPill.kind-context { background: var(--a-context-fill); color: var(--a-context-ink); }
  .activityView .kindPill.kind-legacy { background: var(--a-legacy-fill); color: var(--a-legacy-ink); }
  .activityView .kindPill.kind-outcome::before { background: var(--a-outcome-dot); }
  .activityView .kindPill.kind-context::before { background: var(--a-context-dot); }

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

  .activityView .actNotice {
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
  .activityView.is-active {
    animation-fill-mode: none;
  }

  .actScrim {
    position: fixed;
    inset: 0;
    z-index: 48;
    background: var(--a-scrim);
    animation: scrimEnter 200ms var(--ease-out) both;
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
`;
