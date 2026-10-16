// Platform gates for tests that exercise Windows-only behavior. On Windows they always run.
// Linux note: run the suite with Node 24 (better-sqlite3's prebuilt binary segfaults on Node 20/22 here).
const WIN = process.platform === 'win32';
const SHELL = 'Windows-only: spawns PowerShell/cmd (pwsh/cmd.exe not available)';
const DRIVE = 'Windows-only: fixtures use drive-letter project paths (E:/...), which non-Windows path.resolve treats as relative';
module.exports = { WIN, skipShell: WIN ? false : SHELL, skipDrive: WIN ? false : DRIVE };
