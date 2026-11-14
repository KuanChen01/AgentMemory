// AgentMemory no longer manages Vault rules. Installer guidance carries no vault-sync rule, doctor does not ask for one,
// and a vault-sync line an older install wrote inside the OpenCode managed block survives reinstall and uninstall.
// Installer runs against a temp HOME. Nothing outside os.tmpdir() is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const installer = require('../dist/services/agent-installer.js');
const { renderGrokAgentProfile, renderGrokGlobalRules } = require('../dist/services/grok-installer.js');

const START = '<!-- AgentMemory OpenCode Rules: START -->';
const END = '<!-- AgentMemory OpenCode Rules: END -->';
const LEGACY_VAULT_LINE = '- For a verified, durable project outcome, load and follow the vault-sync skill when it is available. Do not sync read-only investigations or temporary debugging to Vault.';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

test('installer guidance for every managed agent carries no Vault rule', () => {
  for (const text of [installer.renderAntigravityGuidance(), installer.renderAntigravityPluginRule(), renderGrokAgentProfile(), renderGrokGlobalRules()]) {
    assert.doesNotMatch(text, /vault-sync|sync .*to Vault/i);
  }
});

test('OpenCode: a legacy vault-sync line moves out of the managed block on reinstall and survives uninstall', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmemory-vault-home-'));
  const saved = {}; for (const k of ['AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION', 'AGENTMEM_SKIP_GLOBAL_UNLINK', 'AGENTMEM_PORT', 'XDG_CONFIG_HOME', 'APPDATA']) saved[k] = process.env[k];
  Object.assign(process.env, { AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION: '1', AGENTMEM_SKIP_GLOBAL_UNLINK: '1', AGENTMEM_PORT: '0' });
  delete process.env.XDG_CONFIG_HOME; delete process.env.APPDATA;
  try {
    const repoRoot = path.resolve(__dirname, '..');
    installer.installAgentMemory({ repoRoot, homeDir: home });
    const rulesFiles = walk(home).filter(f => f.endsWith('AGENTS.md') && fs.readFileSync(f, 'utf8').includes(START));
    assert.equal(rulesFiles.length, 1, 'OpenCode rules written');
    const rulesPath = rulesFiles[0];
    const fresh = fs.readFileSync(rulesPath, 'utf8');
    assert.doesNotMatch(fresh, /vault-sync/, 'a fresh install writes no Vault rule');

    // Simulate a file written by an older version: user text, then the managed block with the vault-sync line inside.
    const block = fresh.slice(fresh.indexOf(START), fresh.indexOf(END) + END.length);
    const legacyBlock = block.replace(END, `${LEGACY_VAULT_LINE}\n${END}`);
    fs.writeFileSync(rulesPath, `# My OpenCode notes\n\n${legacyBlock}\n\n## After\nkeep me\n`);

    const paths = installer.resolveInstallPaths(repoRoot, home);
    const issues = installer.validateInstalledFiles(paths, paths.antigravityOfficialConfigPath);
    assert.equal(issues.filter(i => /Vault/i.test(i)).length, 0, issues.join('\n'));

    installer.installAgentMemory({ repoRoot, homeDir: home });
    const migrated = fs.readFileSync(rulesPath, 'utf8');
    const managed = migrated.slice(migrated.indexOf(START), migrated.indexOf(END) + END.length);
    assert.doesNotMatch(managed, /vault-sync/, 'the managed block no longer holds the Vault rule');
    assert.equal(count(migrated, LEGACY_VAULT_LINE), 1, 'the Vault rule is kept exactly once');
    assert.ok(migrated.indexOf(LEGACY_VAULT_LINE) > migrated.indexOf(END), 'kept below the managed block');
    assert.match(migrated, /^# My OpenCode notes/);
    assert.match(migrated, /## After\nkeep me\n$/);

    // A second reinstall is a no-op for the user-owned line.
    installer.installAgentMemory({ repoRoot, homeDir: home });
    assert.equal(fs.readFileSync(rulesPath, 'utf8'), migrated);

    // Once the user edits the file, uninstall strips only the managed block and keeps the Vault rule.
    fs.appendFileSync(rulesPath, 'user edit\n');
    await installer.uninstallAgentMemory({ repoRoot, homeDir: home, skipGlobalUnlink: true });
    const after = fs.readFileSync(rulesPath, 'utf8');
    assert.doesNotMatch(after, /AgentMemory OpenCode Rules/);
    assert.equal(count(after, LEGACY_VAULT_LINE), 1, 'uninstall keeps the Vault rule');
    assert.match(after, /keep me/);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir())));
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('OpenCode: uninstalling a legacy block that only held AgentMemory rules plus the Vault line keeps the file with that line', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmemory-vault-only-'));
  const saved = {}; for (const k of ['AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION', 'AGENTMEM_SKIP_GLOBAL_UNLINK', 'AGENTMEM_PORT', 'XDG_CONFIG_HOME', 'APPDATA']) saved[k] = process.env[k];
  Object.assign(process.env, { AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION: '1', AGENTMEM_SKIP_GLOBAL_UNLINK: '1', AGENTMEM_PORT: '0' });
  delete process.env.XDG_CONFIG_HOME; delete process.env.APPDATA;
  try {
    const repoRoot = path.resolve(__dirname, '..');
    installer.installAgentMemory({ repoRoot, homeDir: home });
    const rulesPath = walk(home).find(f => f.endsWith('AGENTS.md') && fs.readFileSync(f, 'utf8').includes(START));
    const fresh = fs.readFileSync(rulesPath, 'utf8');
    fs.writeFileSync(rulesPath, fresh.replace(END, `${LEGACY_VAULT_LINE}\n${END}`));
    await installer.uninstallAgentMemory({ repoRoot, homeDir: home, skipGlobalUnlink: true });
    assert.ok(fs.existsSync(rulesPath), 'the file is kept because it still holds a user-owned line');
    assert.equal(fs.readFileSync(rulesPath, 'utf8').trim(), LEGACY_VAULT_LINE);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir())));
    fs.rmSync(home, { recursive: true, force: true });
  }
});
