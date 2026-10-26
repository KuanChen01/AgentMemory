// Credential redaction of captured tool calls and stored memory text (src/services/secret-redaction.ts).
// Every credential here is a fixture built at runtime; temp dirs, ephemeral ports and a local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { withWorker, ev } = require('./helpers/task-worker.cjs');
const { redactSecrets, redactToolEvent, redactObservation, knownSecrets, isSecretFilePath, SECRET_FILE_OMITTED } = require('../dist/services/secret-redaction.js');
const { summaryHashV2 } = require('../dist/services/event-classifier.js');
const { getLocalHashingEmbedding } = require('../dist/services/embedding.js');

// Assembled from parts so no complete credential-shaped literal sits in the source.
const OPENAI = ['sk', 'proj', 'Fx7Qa9Lm2Zt4Wc8Rb1Nd6Hk3'].join('-');
const GITHUB = 'ghp' + '_' + 'Fx7Qa9Lm2Zt4Wc8Rb1Nd6Hk3Pv5Ys0Ue2Tj';
const AWS = 'AKIA' + 'FX7QA9LM2ZT4WC8R';
const JWT = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiJmaXh0dXJlIn0', 'Fx7Qa9Lm2Zt4Wc8Rb1Nd'].join('.');
const DB_PASSWORD = 'hunter-fixture';
const PEM_BODY = 'MIIEfixtureFx7Qa9Lm2Zt4Wc8Rb1Nd6Hk3Pv5Ys0Ue2Tj';
const PEM = `-----BEGIN RSA PRIVATE KEY-----\n${PEM_BODY}\n-----END RSA PRIVATE KEY-----`;
const ENV_FILE = `OPENAI_API_KEY=${OPENAI}\nDB_PASSWORD=${DB_PASSWORD}\nPORT=3000\n`;

function assertClean(text, secrets, label) {
  for (const secret of secrets) assert.ok(!String(text).includes(secret), `${label}: leaked ${secret.slice(0, 4)}…`);
}

test('reading a secret file keeps the path but drops the content on both sides', () => {
  const read = redactToolEvent(JSON.stringify({ file_path: 'E:/Fixture/App/.env' }), JSON.stringify({ type: 'text', file: { content: ENV_FILE } }), []);
  assert.equal(read.output, SECRET_FILE_OMITTED);
  assert.deepEqual(JSON.parse(read.input), { file_path: 'E:/Fixture/App/.env' });

  const write = redactToolEvent(JSON.stringify({ file_path: '/srv/app/.env.production', content: ENV_FILE }), 'File written', []);
  assert.deepEqual(JSON.parse(write.input), { file_path: '/srv/app/.env.production', content: SECRET_FILE_OMITTED });
  assert.equal(write.output, SECRET_FILE_OMITTED);

  const edit = redactToolEvent(JSON.stringify({ file_path: 'C:\\keys\\deploy.pem', old_string: PEM, new_string: 'x', replace_all: false }), 'ok', []);
  assert.deepEqual(JSON.parse(edit.input), { file_path: 'C:\\keys\\deploy.pem', old_string: SECRET_FILE_OMITTED, new_string: SECRET_FILE_OMITTED, replace_all: false });

  for (const command of ['cat .env', 'Get-Content -Raw "E:\\Fixture\\App\\.env.local"', 'grep -n KEY .env', 'type %USERPROFILE%\\.npmrc',
    'ls; tail -5 certs/server.key', '$raw = Get-Content .env', 'cd app && sudo cat .env | sort']) {
    assert.equal(redactToolEvent(JSON.stringify({ command }), ENV_FILE, []).output, SECRET_FILE_OMITTED, command);
  }
  // Codex exec_command passes an argv array.
  assert.equal(redactToolEvent(JSON.stringify({ command: ['bash', '-lc', 'cat ~/.aws/credentials'] }), ENV_FILE, []).output, SECRET_FILE_OMITTED);
});

test('a command that only names a secret file, or a PowerShell .Key member, keeps its output', () => {
  for (const command of ['git add .env.example .gitignore .env', 'git status --short .env', 'git commit -m "stop tracking .env"',
    'docker run --env-file=.env app', '$h.GetEnumerator() | ForEach-Object { $_.Key }', 'echo credentials are rotated',
    'git log --oneline -- .env | head -5', 'git status --short .env; tail -3 build.log']) {
    assert.equal(redactToolEvent(JSON.stringify({ command }), 'M .env\nok', []).output, 'M .env\nok', command);
  }
});

test('a patch that edits a secret file keeps its file headers only; other patches are untouched', () => {
  const patch = `*** Begin Patch\n*** Update File: deploy/.env\n@@\n-DB_PASSWORD=old\n+DB_PASSWORD=${DB_PASSWORD}\n*** End Patch`;
  const raw = redactToolEvent(patch, 'Success. Updated: deploy/.env', []);
  assert.equal(raw.input, `*** Update File: deploy/.env\n${SECRET_FILE_OMITTED}`);
  assert.equal(raw.output, 'Success. Updated: deploy/.env');
  // JSON-encoded string and argv forms.
  assert.equal(JSON.parse(redactToolEvent(JSON.stringify(patch), '', []).input), `*** Update File: deploy/.env\n${SECRET_FILE_OMITTED}`);
  const argv = JSON.parse(redactToolEvent(JSON.stringify({ command: ['apply_patch', patch] }), '', []).input);
  assert.deepEqual(argv.command, ['apply_patch', `*** Update File: deploy/.env\n${SECRET_FILE_OMITTED}`]);
  // A patch to ordinary code that merely mentions credentials stays whole.
  const code = '*** Begin Patch\n*** Update File: src/auth.ts\n@@\n+// credentials are loaded elsewhere\n*** End Patch';
  assert.equal(redactToolEvent(code, 'ok', []).input, code);
});

test('secret-file detection leaves templates, public keys and ordinary files alone', () => {
  for (const p of ['.env', 'a/.env.local', 'C:\\x\\.env.production', 'id_ed25519', '/home/u/.ssh/id_rsa', 'tls.key', 'cert.pem', '.npmrc', 'service-account-prod.json', 'config/secrets.yaml', '.git-credentials']) {
    assert.ok(isSecretFilePath(p), p);
  }
  for (const p of ['.env.example', '.env.sample', 'a/.env.template', 'id_rsa.pub', 'src/env.ts', 'README.md', 'environment.yml', 'keyboard.ts',
    'credentials', '$_.Key', '$entry.key', 'core.Key']) {
    assert.ok(!isSecretFilePath(p), p);
  }
  // An example env file is kept, but credential-shaped values inside it are still removed.
  const example = redactToolEvent(JSON.stringify({ file_path: '.env.example' }), `OPENAI_API_KEY=${OPENAI}\nPORT=3000`, []);
  assert.match(example.output, /OPENAI_API_KEY=<redacted:openai-style-key>/);
  assert.match(example.output, /PORT=3000/);
  assert.equal(redactToolEvent(JSON.stringify({ command: 'ls -la src' }), 'a.ts\nb.ts', []).output, 'a.ts\nb.ts');
});

test('known credential formats are removed from plain and JSON-encoded text, and the JSON still parses', () => {
  const plain = [
    `export GITHUB_TOKEN=${GITHUB}`, `aws ${AWS}`, `jwt ${JWT}`, PEM,
    `Authorization: Bearer ${OPENAI}`, `postgres://app:${DB_PASSWORD}@db.local:5432/app`,
    `DB_PASSWORD=${DB_PASSWORD}`, `"client_secret": "Zx9-fixture-77"`,
  ].join('\n');
  const secrets = [OPENAI, GITHUB, AWS, JWT, PEM_BODY, DB_PASSWORD, 'Zx9-fixture-77'];
  assertClean(redactSecrets(plain, []), secrets, 'plain');
  const encoded = JSON.stringify({ stdout: plain, exit_code: 0 });
  const redacted = redactSecrets(encoded, []);
  assertClean(redacted, secrets, 'json');
  const parsed = JSON.parse(redacted);
  assert.equal(parsed.exit_code, 0);
  assert.match(parsed.stdout, /Authorization: Bearer <redacted/);
  assert.match(parsed.stdout, /postgres:\/\/app:<redacted:password>@db\.local/);
  assert.match(parsed.stdout, /DB_PASSWORD=<redacted>/);
  // A PEM block cut off by a capture limit (inside JSON, newlines escaped) is removed to its end.
  const cut = JSON.stringify({ out: `-----BEGIN PRIVATE KEY-----\n${PEM_BODY}\n${PEM_BODY}` });
  const cutRedacted = redactSecrets(cut, []);
  assertClean(cutRedacted, [PEM_BODY], 'cut pem');
  assert.equal(JSON.parse(cutRedacted).out, '<redacted:private-key>');
});

test('AgentMemory\'s own saved key and every custom header value are removed whatever their shape or header name', () => {
  const env = { AGENTMEM_LLM_API_KEY: 'zz-plain-Qw8rT2', AGENTMEM_LLM_HEADERS: JSON.stringify({ 'X-Tenant': 'tenant-Value-77', 'X-Gw': 'Token gwcred-55', 'Content-Type': 'application/json' }) };
  const known = knownSecrets(env);
  assert.ok(known.includes('gwcred-55'), 'scheme credential part');
  assert.ok(!known.includes('application/json'));
  const text = 'key zz-plain-Qw8rT2 tenant tenant-Value-77 gw gwcred-55 type application/json';
  const out = redactSecrets(text, known);
  assertClean(out, ['zz-plain-Qw8rT2', 'tenant-Value-77', 'gwcred-55'], 'known');
  assert.match(out, /application\/json/);
  // Short values are never used for matching: they would blank ordinary text.
  assert.deepEqual(knownSecrets({ AGENTMEM_LLM_API_KEY: 'abc' }), []);
});

test('code, identifiers, hashes, paths and prose stay readable', () => {
  const keep = [
    'const FACT_KEY = /(?:^|[_.\\-\\s])(?:api[_-]?key)$/i;',
    'apiKeyMasked: maskApiKey(apiKey),',
    'max_tokens: 4096, prompt_tokens: 1200',
    'author: Jane12345',
    'commit 43b84a7c9e1f0d2b3a4c5d6e7f8091a2b3c4d5e6',
    'path E:/Kuan/Projects/Codex/AgentMemory/src/x.ts',
    'tokens.map(token => token.trim())',
    'Bearer authentication is required for this endpoint',
    'API_KEY=process.env.OPENAI_API_KEY',
    'OPENAI_API_KEY=your_api_key_here',
    'const storageKey = "agentmem-admin-theme"',
    'sk-learn is a library',
    'const secret = String(value); secret: string; headerSecrets = llmHeaderSecrets(headers);',
    'apiKey: env.apiKey, apiKey: settings?.apiKey, password: this.password',
  ].join('\n');
  assert.equal(redactSecrets(keep, []), keep);
});

test('ordinary keys, ids, paths, digests and code values are not credentials', () => {
  const keep = [
    'sort_key=created_at2', 'const secret = value123;', 'primary_key=6f1c2a9e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
    'idempotency_key: 6f1c2a9e-3b4d-4e5f-8a9b-0c1d2e3f4a5b', 'API_KEY=config/tenant1.json', 'object_key: uploads/2026/a.png',
    'cache_key = sha256:abc123def4567890', 'hash_key = "a1b2c3d4e5f6"', 'auth_mode=oauth2client', 'partition_key=user_id_2',
    'SORT_KEY=created_at2', 'token_type: bearer2', 'api_key_file=./secrets/key.txt', 'author_id=Jane12345678',
  ];
  for (const line of keep) assert.equal(redactSecrets(line, []), line, line);
  for (const [key, value] of [['sort_key', 'created_at2'], ['partition_key', 'user_id_2'], ['hash_key', 'a1b2c3d4e5f6'], ['auth_mode', 'oauth2client']]) {
    const input = JSON.stringify({ [key]: value });
    assert.equal(redactToolEvent(input, input, []).output, input, key);
  }
  // Real credentials under the same kinds of names still go.
  for (const line of ['STRIPE_KEY=rk9Lm2Zt4Wc8Rb1Nd6Hk', 'api_key=Fx7Qa9Lm2Zt4Wc8Rb1Nd6Hk', 'client_secret: Zx9-fixture-77', 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY1fixture']) {
    assert.match(redactSecrets(line, []), /<redacted>$/, line);
  }
});

test('quoted passwords are redacted whole, and secret-file names cover variants', () => {
  for (const [line, expected] of [
    ['DB_PASSWORD="hunter2 with spaces"', 'DB_PASSWORD="<redacted>"'],
    ["password: 'hunter2 with spaces'", "password: '<redacted>'"],
    ['{"password": "hunter2 with spaces"}', '{"password": "<redacted>"}'],
  ]) assert.equal(redactSecrets(line, []), expected, line);
  const escaped = JSON.stringify({ log: 'DB_PASSWORD="hunter2 with spaces"' });
  assert.deepEqual(JSON.parse(redactSecrets(escaped, [])), { log: 'DB_PASSWORD="<redacted>"' });
  for (const p of ['credentials-prod.json', 'config/credentials.staging.json', 'id_rsa.backup', '~/.ssh/id_ed25519_old']) assert.ok(isSecretFilePath(p), p);
  for (const p of ['id_rsa.pub', 'id_ed25519_old.pub']) assert.ok(!isSecretFilePath(p), p);
});

test('redacted JSON always parses, so a Write event keeps its modified file', () => {
  const { modifiedFiles } = require('../dist/services/event-classifier.js');
  const write = JSON.stringify({ file_path: 'src/config.ts', content: 'export const x = 1;', password: 123456 });
  const redacted = redactToolEvent(write, '{"success":true,"token":987654321098,"secret":"Zx9-fixture-77"}', []);
  assert.deepEqual(JSON.parse(redacted.input), { file_path: 'src/config.ts', content: 'export const x = 1;', password: '<redacted>' });
  assert.deepEqual(JSON.parse(redacted.output), { success: true, token: 987654321098, secret: '<redacted>' });
  assert.deepEqual(modifiedFiles('Write', redacted.input), ['src/config.ts']);
  // Text redaction keeps JSON and dict literals valid too.
  assert.deepEqual(JSON.parse(redactSecrets('{"password":123456,"n":1}', [])), { password: '<redacted>', n: 1 });
  assert.equal(redactSecrets("{'password': 123456}", []), "{'password': '<redacted>'}");
  const nested = JSON.stringify({ stdout: '{"password":123456}' });
  assert.deepEqual(JSON.parse(JSON.parse(redactSecrets(nested, [])).stdout), { password: '<redacted>' });
  // Every shape that parsed before redaction still parses after it.
  for (const value of [{ password: 123456 }, { api_key: 'Fx7Qa9Lm2Zt4Wc8Rb1Nd6Hk' }, [{ token: OPENAI }], OPENAI, `DB_PASSWORD=${DB_PASSWORD}`,
    { nested: { client_secret: ['Zx9-fixture-77'] }, pem: PEM }]) {
    const text = JSON.stringify(value);
    const out = redactToolEvent(text, text, []);
    JSON.parse(out.input); JSON.parse(out.output);
  }
});

test('memory text uses only the high-precision rules', () => {
  const memory = redactObservation({ title: `Rotated ${GITHUB}`, narrative: 'sort_key=created_at2; DB_PASSWORD=hunter-fixture', facts: [`key ${OPENAI}`], concepts: ['env'] }, []);
  assert.equal(memory.title, 'Rotated <redacted:github-token>');
  assert.equal(memory.facts[0], 'key <redacted:openai-style-key>');
  // No assignment heuristic: a deliberately saved line is never guessed away.
  assert.equal(memory.narrative, 'sort_key=created_at2; DB_PASSWORD=hunter-fixture');
  assert.deepEqual(redactObservation(memory, []), memory, 'idempotent');
});

test('redaction is idempotent and linear on large adversarial input', () => {
  const once = redactSecrets(ENV_FILE + PEM + ` ${GITHUB}`, []);
  assert.equal(redactSecrets(once, []), once);
  const base64url = require('node:crypto').randomBytes(800000).toString('base64url').slice(0, 1000000);
  const shapes = {
    'a. run': 'a.'.repeat(500000),
    'api_key run': 'api_key'.repeat(200000),
    'api_key= run': 'api_key='.repeat(125000),
    'base64url': base64url,
    'sk- run': 'sk-'.repeat(333333),
    'Bearer run': 'Bearer '.repeat(140000),
    'url run': 'x://u:'.repeat(160000),
    'pem headers': '-----BEGIN PRIVATE KEY-----'.repeat(37000),
    'quoted password run': '"password": "'.repeat(70000),
    'patch headers': '*** Update File: src/a.ts\n'.repeat(38000),
  };
  for (const [label, text] of Object.entries(shapes)) {
    const started = Date.now();
    redactSecrets(text, []);
    redactToolEvent(JSON.stringify({ command: text.slice(0, 200000) }), JSON.stringify({ stdout: text }), []);
    const ms = Date.now() - started;
    assert.ok(ms < 1500, `${label}: ${ms}ms`);
  }
});

test('secret-file command detection is linear on long commands and argv lists', () => {
  const commands = {
    '$var run': '$x '.repeat(200000),
    'sudo run': 'sudo '.repeat(200000),
    'argv of $vars': Array(200000).fill('$x'),
    'many segments': '$x | '.repeat(200000),
  };
  for (const [label, command] of Object.entries(commands)) {
    const started = Date.now();
    const r = redactToolEvent(JSON.stringify({ command }), 'ok', []);
    const ms = Date.now() - started;
    assert.equal(r.output, 'ok', label);
    assert.ok(ms < 1500, `${label}: ${ms}ms`);
  }
  // Skipping a long run of prefixes still finds the reader behind them.
  const read = redactToolEvent(JSON.stringify({ command: `${'$x '.repeat(200000)}Get-Content .env` }), 'TOKEN=abc', []);
  assert.equal(read.output, SECRET_FILE_OMITTED);
});

test('worker: captured credentials never reach the buffer, the model prompt, the evidence API or stored memory', async () => {
  await withWorker(async ({ post, get, idle, stub, dbPath }) => {
    // The model echoes a credential back: the stored memory must not keep it.
    stub.setFixed({ record_kind: 'outcome', title: 'Read env', narrative: `Saw key ${GITHUB}`, facts: [`key ${OPENAI}`],
      concepts: ['env'], files_read: [], files_modified: ['src/x.ts'] });
    await post('/tools', ev('s1', 'Read', JSON.stringify({ file_path: 'E:/Fixture/App/.env' }), JSON.stringify({ file: { content: ENV_FILE } })));
    await post('/tools', ev('s1', 'Bash', JSON.stringify({ command: 'env' }), `OPENAI_API_KEY=${OPENAI}\nGITHUB_TOKEN=${GITHUB}\nHOME=/home/u`));
    await post('/tools', ev('s1', 'apply_patch', 'edit src/x.ts', 'ok'));
    await post('/sessions/close', { id: 's1' }); await idle();

    const secrets = [OPENAI, GITHUB, DB_PASSWORD];
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.prepare('SELECT input, output FROM task_event_buffer').all();
      assert.equal(rows.length, 3);
      assertClean(JSON.stringify(rows), secrets, 'buffer');
      const memories = db.prepare('SELECT o.id, o.project_path, o.title, o.narrative, o.facts, o.concepts, o.files_read, o.files_modified, o.embedding, f.narrative AS fts_narrative, f.facts AS fts_facts FROM observations o JOIN observations_fts f ON f.observation_id = o.id').all();
      assert.equal(memories.length, 1);
      assertClean(JSON.stringify(memories), secrets, 'memory');
      assert.match(memories[0].narrative, /<redacted:github-token>/);
      // The content hash and the embedding describe the stored (redacted) text, so dedup and crash recovery agree.
      const m = memories[0];
      const stored = { title: m.title, narrative: m.narrative, facts: JSON.parse(m.facts), files_read: JSON.parse(m.files_read), files_modified: JSON.parse(m.files_modified) };
      const day = String(db.prepare('SELECT MAX(created_at) AS d FROM task_event_buffer').get().d).slice(0, 10);
      const hash = db.prepare('SELECT sha256 FROM observation_content_hashes WHERE observation_id = ? AND hash_version = 2').get(m.id);
      assert.equal(hash.sha256, summaryHashV2(m.project_path, stored, day));
      const embedText = `${m.title} ${m.narrative} ${stored.facts.join(' ')} ${JSON.parse(m.concepts).join(' ')}`;
      assert.deepEqual(JSON.parse(m.embedding), getLocalHashingEmbedding(embedText));
      assertClean(stub.calls.map(c => c.user).join('\n'), secrets, 'prompt');
      assert.ok(stub.calls.some(c => c.user.includes(SECRET_FILE_OMITTED)));
      const evidence = await get('/admin/api/work-evidence?' + new URLSearchParams({ id: memories[0].id }));
      assert.equal(evidence.items.length, 3);
      assertClean(JSON.stringify(evidence), secrets, 'evidence');
    } finally { db.close(); }
  });
});

test('worker: rows stored before redaction are redacted in the evidence API and in the model prompt', async () => {
  await withWorker(async ({ post, get, idle, stub, dbPath }) => {
    await post('/tools', ev('s2', 'Bash', JSON.stringify({ command: 'echo placeholder' }), 'placeholder'));
    await post('/tools', ev('s2', 'apply_patch', 'edit src/y.ts', 'ok'));
    // Simulate a row captured by an older build: write the raw credential straight into the buffer.
    const writer = new Database(dbPath);
    try { writer.prepare('UPDATE task_event_buffer SET output = ? WHERE output = ?').run(`GITHUB_TOKEN=${GITHUB}`, 'placeholder'); }
    finally { writer.close(); }
    await post('/sessions/close', { id: 's2' }); await idle();
    assertClean(stub.calls.map(c => c.user).join('\n'), [GITHUB], 'prompt');
    const overview = await get('/admin/api/work-overview?' + new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z', reader: 'vault' }));
    const evidence = await get('/admin/api/work-evidence?' + new URLSearchParams({ id: overview.memories[0].id }));
    assert.ok(evidence.items.length >= 2);
    assertClean(JSON.stringify(evidence), [GITHUB], 'evidence');
  });
});

test('worker: when synthesis fails, the fallback memory names the calls without copying their input or output', async () => {
  await withWorker(async ({ post, idle, stub, dbPath }) => {
    stub.state.failNext = 1000;
    await post('/tools', ev('s3', 'Bash', JSON.stringify({ command: 'run-report --verbose' }), 'REPORT-BODY-fixture-line'));
    await post('/tools', ev('s3', 'apply_patch', 'edit src/z.ts', 'PATCH-BODY-fixture'));
    await post('/sessions/close', { id: 's3' }); await idle();
    const db = new Database(dbPath, { readonly: true });
    try {
      const memories = db.prepare('SELECT narrative FROM observations').all();
      const fallback = memories.find(m => /Memory synthesis unavailable/.test(m.narrative));
      assert.ok(fallback, 'fallback memory saved');
      assert.match(fallback.narrative, /Bash \(success\)/);
      assert.match(fallback.narrative, /apply_patch \(success\)/);
      assert.doesNotMatch(fallback.narrative, /REPORT-BODY|PATCH-BODY|run-report/);
    } finally { db.close(); }
  });
});
