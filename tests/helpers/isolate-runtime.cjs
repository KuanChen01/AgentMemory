// Pin AGENTMEM_RUNTIME_DIR to a temp directory for the test process so in-process
// LLM usage logs never land in the real ~/.agentmem/logs (os.homedir() on Windows is USERPROFILE).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const created = !process.env.AGENTMEM_RUNTIME_DIR;
if (created) {
  process.env.AGENTMEM_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-testruntime-'));
}
const runtimeDir = process.env.AGENTMEM_RUNTIME_DIR;

if (created) {
  const dir = runtimeDir;
  process.on('exit', () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
}

module.exports = { runtimeDir };
