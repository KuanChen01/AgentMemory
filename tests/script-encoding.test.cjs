// Shipped PowerShell and cmd scripts must survive Windows PowerShell 5.1 / cmd.exe on any system code page.
// PS 5.1 decodes a BOM-less .ps1 with the ANSI code page (e.g. 936/GBK), so raw UTF-8 text corrupts
// string literals and breaks parsing; cmd.exe reads .cmd files in the OEM code page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WIN } = require('./helpers/platform.cjs');

const projectRoot = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'logs']);
const UTF8_BOM = [0xef, 0xbb, 0xbf];

function listScripts(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listScripts(path.join(dir, entry.name), out);
      continue;
    }
    if (/\.(ps1|psm1|psd1|cmd|bat)$/i.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

function hasNonAscii(buffer) {
  return buffer.some((byte) => byte > 0x7f);
}

function hasUtf8Bom(buffer) {
  return UTF8_BOM.every((byte, index) => buffer[index] === byte);
}

const scripts = listScripts(projectRoot);
const psScripts = scripts.filter((file) => /\.ps(1|m1|d1)$/i.test(file));

test('the repository ships PowerShell and cmd scripts to check', () => {
  const names = scripts.map((file) => path.relative(projectRoot, file).replace(/\\/g, '/'));
  for (const expected of [
    'start-workbench.cmd',
    'bootstrap-second-machine.cmd',
    'scripts/start-workbench.ps1',
    'scripts/bootstrap-second-machine.ps1',
  ]) {
    assert.ok(names.includes(expected), `${expected} should be scanned (found: ${names.join(', ')})`);
  }
});

test('every .ps1 is pure ASCII or UTF-8 with BOM', () => {
  const offenders = psScripts
    .filter((file) => {
      const buffer = fs.readFileSync(file);
      return hasNonAscii(buffer) && !hasUtf8Bom(buffer);
    })
    .map((file) => path.relative(projectRoot, file));
  assert.deepEqual(offenders, [], 'non-ASCII .ps1 files must be pure ASCII (preferred) or start with a UTF-8 BOM');
});

test('every .cmd/.bat is pure ASCII', () => {
  const offenders = scripts
    .filter((file) => /\.(cmd|bat)$/i.test(file) && hasNonAscii(fs.readFileSync(file)))
    .map((file) => path.relative(projectRoot, file));
  assert.deepEqual(offenders, []);
});

test('Windows PowerShell 5.1 parses every .ps1 without errors', { skip: WIN ? false : 'Windows-only: needs powershell.exe 5.1' }, () => {
  const fileList = psScripts.map((file) => `'${file.replace(/'/g, "''")}'`).join(',');
  const command = [
    `foreach ($f in @(${fileList})) {`,
    '  $tokens = $null; $errors = $null',
    '  [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$errors)',
    '  foreach ($e in $errors) { Write-Output ("{0}:{1}:{2} {3}" -f $f, $e.Extent.StartLineNumber, $e.Extent.StartColumnNumber, $e.ErrorId) }',
    '}',
    'Write-Output ("PSVERSION=" + $PSVersionTable.PSVersion.Major)',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.pop(), 'PSVERSION=5');
  assert.deepEqual(lines, []);
});
