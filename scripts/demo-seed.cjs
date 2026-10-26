#!/usr/bin/env node
// Disposable demo instance for README screenshots.
//
//   npm run build
//   node scripts/demo-seed.cjs --root C:\agentmem-demo --port 38990 --screenshots docs/images
//
// Creates a brand-new sandbox under --root (HOME, USERPROFILE, APPDATA, LOCALAPPDATA, DB, .env and
// runtime dir all live there), seeds it with fake data (fake projects, people, paths and key), starts a
// worker from this checkout on --port, and either captures the admin views with a headless Edge/Chrome
// (--screenshots) or keeps serving until Ctrl+C. It only ever stops the worker process it started.
// Pick a --root without your real user name in it: the LLM Settings page shows the .env path.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const LIVE_PORT = 38888;

function parseArgs(argv) {
  const options = { port: 38990, root: '', screenshots: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--root') { options.root = next; index += 1; }
    else if (token === '--port') { options.port = Number(next); index += 1; }
    else if (token === '--screenshots') { options.screenshots = next; index += 1; }
    else throw new Error(`Unknown option ${token}`);
  }
  if (!options.root) throw new Error('--root <empty directory> is required.');
  if (!Number.isInteger(options.port) || options.port <= 0) throw new Error('--port must be a number.');
  if (options.port === LIVE_PORT) throw new Error(`Refusing port ${LIVE_PORT}: that is the real worker.`);
  options.root = path.resolve(options.root);
  const realAgentmem = path.join(os.homedir(), '.agentmem');
  if (options.root.toLowerCase().startsWith(realAgentmem.toLowerCase())) {
    throw new Error(`Refusing ${options.root}: it is inside the real ${realAgentmem}.`);
  }
  if (fs.existsSync(options.root) && fs.readdirSync(options.root).length > 0) {
    throw new Error(`Refusing ${options.root}: the demo root must be new or empty.`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const home = path.join(options.root, 'home', 'demo');
const runtimeDir = path.join(home, '.agentmem');
fs.mkdirSync(runtimeDir, { recursive: true });

// Isolate this process (and the worker it spawns) before any AgentMemory module is loaded.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('AGENTMEM_') || key.startsWith('DEEPSEEK_')) delete process.env[key];
}
Object.assign(process.env, {
  AGENTMEM_DAILY_DIGEST_DISABLED: 'true',
  AGENTMEM_DB_PATH: path.join(runtimeDir, 'agentmemory.db'),
  AGENTMEM_ENV_PATH: path.join(runtimeDir, '.env'),
  AGENTMEM_HOOK_AUTOSTART: 'false',
  AGENTMEM_PORT: String(options.port),
  AGENTMEM_RUNTIME_DIR: runtimeDir,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  EMBEDDING_API_URL: '',
  HOME: home,
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  USERPROFILE: home,
});

// Fake LLM settings: the key is a placeholder and no request is made unless someone clicks "Test".
fs.writeFileSync(process.env.AGENTMEM_ENV_PATH, [
  'AGENTMEM_LLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx',
  'AGENTMEM_LLM_API_URL=https://llm.example.com/v1',
  'AGENTMEM_LLM_MODEL=my-model',
  `AGENTMEM_PORT=${options.port}`,
  '',
].join('\n'));

const { DatabaseManager } = require(path.join(repoRoot, 'dist', 'services', 'db.js'));
const { getLocalHashingEmbedding } = require(path.join(repoRoot, 'dist', 'services', 'embedding.js'));
const { DAILY_DIGEST_PROMPT_VERSION } = require(path.join(repoRoot, 'dist', 'services', 'daily-digest.js'));

const PROJECTS = {
  web: 'C:/Users/demo/projects/acme-storefront',
  api: 'C:/Users/demo/projects/billing-api',
  app: 'C:/Users/demo/projects/field-notes-app',
};

let counter = 0;
const id = (prefix) => `${prefix}-${String(++counter).padStart(4, '0')}-demo`;
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
const localDate = (daysAgo) => {
  const at = new Date(Date.now() - daysAgo * 86400 * 1000);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

// [project, agent, hoursAgo, title, narrative, facts, files]
const MEMORIES = [
  ['web', 'claudecode', 1, 'Fixed checkout total rounding for multi-currency carts',
    'Totals were rounded per line item before currency conversion. Moved rounding to the final total and added a regression test with EUR and JPY carts.',
    ['Rounding now happens once on the converted total.', 'JPY has zero minor units; formatter reads it from Intl.'],
    ['src/cart/totals.ts', 'tests/cart/totals.test.ts']],
  ['web', 'codex', 3, 'Migrated product images to the CDN loader',
    'Replaced the custom image proxy with the framework CDN loader and kept width presets at 320/640/1280.',
    ['Image proxy route removed after loader migration.', 'Width presets: 320, 640, 1280.'],
    ['next.config.mjs', 'src/components/ProductImage.tsx']],
  ['web', 'antigravity', 6, 'Decided to keep server-side search over Algolia for now',
    'Compared hosted search with the existing Postgres full-text search. Kept Postgres: catalog is under 20k items and latency is 40 ms p95.',
    ['Catalog size ~18k SKUs.', 'Postgres FTS p95 latency 40 ms in staging.'],
    ['docs/adr/0007-search.md']],
  ['web', 'opencode', 20, 'Added Playwright smoke test for guest checkout',
    'New smoke test covers cart, address form, and payment sandbox. Runs in CI on every pull request.',
    ['Smoke suite runtime 48 s on CI.'], ['e2e/guest-checkout.spec.ts', '.github/workflows/ci.yml']],
  ['web', 'claudecode', 30, 'Tracked down flaky cart badge test',
    'The badge test raced the optimistic update. Awaited the mutation promise instead of a fixed timeout.',
    ['Flake rate dropped from 6% to 0 over 50 runs.'], ['tests/cart/badge.test.tsx']],
  ['api', 'codex', 2, 'Invoice PDF renderer now streams pages',
    'Large invoices exceeded the 30 s function limit. Switched to a streaming renderer and paginated line items at 200 rows.',
    ['Streaming renderer cut a 1,200-line invoice from 41 s to 6 s.', 'Page size: 200 rows.'],
    ['src/invoices/render.ts', 'src/invoices/render.test.ts']],
  ['api', 'grok-build', 5, 'Webhook retries use exponential backoff with jitter',
    'Payment-provider webhooks were retried every 10 s. Now 2^n seconds with full jitter, capped at 15 minutes, max 8 attempts.',
    ['Retry cap 15 minutes, 8 attempts.', 'Idempotency key is the provider event id.'],
    ['src/webhooks/retry.ts']],
  ['api', 'claudecode', 26, 'Root-caused duplicate charges on double submit',
    'Two requests with the same cart id raced past the pending-payment check. Added a unique index on (cart_id, status=pending).',
    ['Unique partial index prevents concurrent pending payments.'],
    ['migrations/0042_pending_payment_unique.sql', 'src/payments/create.ts']],
  ['api', 'antigravity', 50, 'Documented the tax rate refresh job',
    'Tax rates refresh nightly at 02:00 UTC from the provider feed; failures alert the on-call channel.',
    ['Nightly refresh at 02:00 UTC.'], ['docs/runbooks/tax-refresh.md']],
  ['app', 'opencode', 4, 'Offline sync queue survives app restarts',
    'Pending note edits are persisted to SQLite and replayed in order after reconnect.',
    ['Queue replays edits in creation order.', 'Conflicts resolve last-writer-wins per field.'],
    ['src/sync/queue.ts', 'src/sync/queue.test.ts']],
  ['app', 'codex', 9, 'Camera permission prompt moved behind an explainer screen',
    'Users who denied the first prompt could not attach photos. An explainer now precedes the system prompt.',
    ['Photo attach rate +14% in beta cohort.'], ['src/screens/CameraExplainer.tsx']],
  ['app', 'claudecode', 52, 'Upgraded the map SDK and fixed marker clustering',
    'Clustering broke after the SDK upgrade because the cluster radius moved to density-independent pixels.',
    ['Cluster radius now 60 dp.'], ['src/map/Clusters.tsx', 'package.json']],
];

async function seed() {
  const db = new DatabaseManager();
  await db.initialize();
  try {
    const sessions = new Map();
    for (const [projectKey, agent, ago, title, narrative, facts, files] of MEMORIES) {
      const project = PROJECTS[projectKey];
      const sessionKey = `${projectKey}:${agent}:${Math.floor(ago / 12)}`;
      if (!sessions.has(sessionKey)) {
        const session = { id: id('session'), project_path: project, agent_id: agent, status: ago > 8 ? 'completed' : 'active', created_at: hoursAgo(ago + 0.5), purpose: 'work' };
        await db.saveSession(session);
        sessions.set(sessionKey, session.id);
      }
      await db.saveObservation({
        id: id('obs'),
        session_id: sessions.get(sessionKey),
        project_path: project,
        agent_id: agent,
        title,
        narrative,
        facts,
        concepts: [projectKey === 'api' ? 'payments' : projectKey === 'web' ? 'storefront' : 'mobile'],
        files_read: [],
        files_modified: files,
        embedding: getLocalHashingEmbedding(`${title}\n${narrative}`),
        created_at: hoursAgo(ago),
        record_kind: 'outcome',
        source_kind: ago % 2 === 0 ? 'task' : 'explicit',
      });
    }

    const digests = [
      ['web', 0, 'Checkout totals fixed for multi-currency carts; images now load through the CDN; search stays on Postgres.',
        ['Rounding happens once on the converted total.'], ['Keep Postgres full-text search until the catalog passes 50k items.'], ['npm test -- cart'], ['Do we need per-region price rounding rules?'], ['Ship the CDN loader behind a flag to 10% of traffic.']],
      ['web', 1, 'Guest checkout smoke test added to CI; the flaky cart badge test was stabilized.',
        ['Smoke suite runs on every pull request.'], [], ['npx playwright test e2e/guest-checkout.spec.ts'], [], ['Add a payment-failure path to the smoke suite.']],
      ['api', 0, 'Invoice rendering streams pages; webhook retries back off with jitter.',
        ['A 1,200-line invoice renders in 6 s.'], ['Webhook retries cap at 15 minutes and 8 attempts.'], ['npm run test:invoices'], [], ['Load-test the renderer with 5k-line invoices.']],
      ['api', 1, 'Duplicate charges on double submit are prevented by a unique pending-payment index.',
        ['Unique partial index on (cart_id) where status = pending.'], ['Fix at the database layer rather than with an app lock.'], ['npm run migrate'], ['Backfill check for historical duplicates?'], []],
      ['app', 0, 'Offline edits persist and replay in order; camera permission flow has an explainer.',
        ['Edits replay in creation order after reconnect.'], ['Last-writer-wins per field for conflicts.'], [], ['Should deletes win over edits?'], ['Ship sync queue to the beta channel.']],
    ];
    for (const [projectKey, daysAgo, summary, facts, decisions, commands, questions, actions] of digests) {
      await db.saveDailyMemoryDigest({
        project_path: PROJECTS[projectKey],
        local_date: localDate(daysAgo),
        status: 'success',
        digest: {
          summary, facts, decisions, verified_commands: commands, open_questions: questions, next_actions: actions,
          state_fact_candidates: [], skill_candidates: [],
        },
        source_observation_ids: [],
        source_count: 3,
        model: 'my-model',
        prompt_version: DAILY_DIGEST_PROMPT_VERSION,
        generated_at: hoursAgo(daysAgo * 24 + 1),
      });
    }

    await db.saveStateFact({ project_path: PROJECTS.web, entity_type: 'project', entity_key: 'acme-storefront', fact_key: 'search_backend', value: 'postgres-fts' });
    await db.saveStateFact({ project_path: PROJECTS.api, entity_type: 'service', entity_key: 'webhooks', fact_key: 'retry_policy', value: { base_seconds: 2, cap_minutes: 15, attempts: 8 } });

    await db.saveProceduralSkill({
      project_path: PROJECTS.web,
      title: 'Reproduce a flaky UI test',
      summary: 'Loop the test, capture traces, and replace fixed timeouts with awaited state.',
      trigger_text: 'A UI test fails intermittently in CI',
      steps: ['Run the test 50 times with tracing on.', 'Find the awaited promise the assertion races.', 'Replace the timeout with an explicit wait.'],
      tags: ['testing', 'flaky'],
      status: 'enabled',
      confidence: 0.82,
    });
    await db.saveProceduralSkill({
      project_path: PROJECTS.api,
      title: 'Ship a schema change safely',
      summary: 'Additive migration first, backfill, then switch reads.',
      trigger_text: 'A database schema change touches live payment tables',
      steps: ['Add new columns or indexes without dropping anything.', 'Backfill in batches.', 'Switch reads, then clean up in a later release.'],
      tags: ['database', 'migrations'],
      status: 'draft',
      confidence: 0.64,
    });
  } finally {
    db.close();
  }
}

function startWorker() {
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [path.join(repoRoot, 'dist', 'services', 'worker.js')], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let log = '';
    const timer = setTimeout(() => reject(new Error(`demo worker did not start:\n${log}`)), 20000);
    worker.once('exit', (code) => { clearTimeout(timer); reject(new Error(`demo worker exited (${code}):\n${log}`)); });
    worker.stdout.on('data', (chunk) => {
      log += chunk;
      if (String(chunk).includes('worker service running')) { clearTimeout(timer); resolve(worker); }
    });
    worker.stderr.on('data', (chunk) => { log += chunk; });
  });
}

function stopWorker(worker) {
  return new Promise((resolve) => {
    if (worker.exitCode !== null) { resolve(); return; }
    worker.once('exit', () => resolve());
    // Only the worker this script spawned, by its own PID.
    try { process.kill(worker.pid); } catch { resolve(); }
  });
}

function findBrowser() {
  const candidates = [
    process.env.DEMO_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const VIEWS = [
  ['overview', 'homeView'],
  ['memory', 'memoryView'],
  ['digests', 'digestsView'],
  ['projects', 'projectsView'],
  ['settings', 'settingsView'],
];

function captureScreenshots(outDir) {
  const browser = findBrowser();
  if (!browser) throw new Error('No Edge/Chrome found; set DEMO_BROWSER to a Chromium executable.');
  fs.mkdirSync(outDir, { recursive: true });
  const profile = path.join(options.root, 'browser-profile');
  const written = [];
  for (const [name, view] of VIEWS) {
    const file = path.join(path.resolve(outDir), `admin-${name}.png`);
    const result = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      // English UI for the public README (the workbench follows navigator.language).
      '--lang=en-US', '--accept-lang=en-US',
      `--user-data-dir=${profile}`, '--window-size=1440,1000', '--force-device-scale-factor=1',
      '--virtual-time-budget=10000', `--screenshot=${file}`,
      `http://127.0.0.1:${options.port}/admin#${view}`,
    ], { encoding: 'utf8', timeout: 90000, windowsHide: true });
    if (result.error || !fs.existsSync(file)) {
      throw new Error(`screenshot of ${view} failed: ${result.error?.message || result.stderr}`);
    }
    written.push(file);
  }
  return written;
}

async function main() {
  await seed();
  const worker = await startWorker();
  const url = `http://127.0.0.1:${options.port}/admin`;
  console.log(`Demo worker PID ${worker.pid} serving ${url} (sandbox: ${options.root})`);
  if (options.screenshots) {
    try {
      for (const file of captureScreenshots(options.screenshots)) console.log(`screenshot: ${file}`);
    } finally {
      await stopWorker(worker);
      console.log(`Stopped demo worker PID ${worker.pid}.`);
    }
    return;
  }
  console.log('Press Ctrl+C to stop the demo worker.');
  const shutdown = async () => {
    await stopWorker(worker);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
