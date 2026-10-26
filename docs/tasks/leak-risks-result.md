# Leak risks: result (P1-P9)

Branch `fix/leak-risks`, based on master `a5bdc5e`. Local commits only; nothing pushed.

Checks run on Windows 11 (Node 24):

- `npx tsc --noEmit`: clean
- `npm run build`: clean
- `node --test --test-concurrency=1 tests/*.test.cjs`: **521 tests, 521 pass, 0 fail** (baseline before the change: 506 pass). The 15 new tests are in `tests/leak-risks.test.cjs`.

Tests only use temp dirs and ephemeral ports. None binds port 38888, and none touches the running worker or the real `~/.agentmem`.

## Upgrade steps for users (all platforms)

1. `npm run build` (or `npm ci && npm run build`).
2. Restart the worker (`agentmem stop`, then let a hook start it, or `.\start-workbench.cmd restart`), and restart the agents. The new worker creates `~/.agentmem/worker-token` on its first start. Hooks, the CLI and the launchers find it by themselves. Agent hook configs and `.env` do not change, and no reinstall is needed.
3. Open the workbench with `.\start-workbench.cmd start` / `open-admin`, `npm run workbench`, or the link printed by the new `agentmem admin-url`. A plain `http://127.0.0.1:38888/admin` bookmark still loads, and the page asks once per tab for the token (the contents of `~/.agentmem/worker-token`).
4. Optional: delete old `~/.agentmem/.env.bak-<timestamp>` files. They contain the API key, and AgentMemory never deletes them.

Until step 2 the old worker keeps running the old code. The new hooks still work against it, because it ignores the extra header.

## P1: local-user access (HIGH)

**Change.** The worker now requires a per-user token on every route except the static `GET /admin` page. Without it the worker answers `401 {auth_required: true}`.

- New `src/services/worker-auth.ts`. The token is 32 random bytes in hex, stored in `<AGENTMEM_RUNTIME_DIR or ~/.agentmem>/worker-token`. It is created atomically with mode 0600 at worker start, before the port opens, and re-created if the file is deleted. The comparison is constant-time. The header is `X-AgentMem-Token`.
- `worker.ts`: new `workerTokenGuard`, which runs before body parsing.
- Clients that now send the token:
  - `src/hooks/worker-client.ts`, which every hook uses for Claude Code, Codex, Antigravity, Grok and OpenCode. The token is read on each attempt, so a worker that autostart just spawned works.
  - `src/bin/cli.ts` (`stop`, `status`, new `admin-url`).
  - `src/services/workbench-launcher.ts` (overview probe, used by `workbench.js` and bootstrap).
  - `scripts/start-workbench.ps1` (status probe and Open Admin).
  - `scripts/demo-seed.cjs` (screenshots).
- The MCP server reads the database directly and does not call the worker, so it needed no change.
- Admin UI (`admin-ui-client.ts`):
  - Launchers open `/admin#token=<token>`. The fragment is never sent to the server. The page stores the token in that tab's `sessionStorage`, removes it from the address bar with `history.replaceState`, and adds it to every `fetchJson` call.
  - If the token is missing or wrong, the page asks once with a prompt and retries. The prompt text is new: `auth.tokenPrompt` in en and zh-CN.
- The admin LLM config API no longer returns custom header values: each value is shown as `••••`. Saving or testing with `••••` keeps the saved value (`restoreSavedHeaderValues` in `llm-config.ts`). The placeholder cannot be a real value, because fetch rejects non-Latin-1 header values. Header names stay visible.
- `agentmem uninstall` also removes `worker-token`.

**Why.** The audit asked for a way to tie requests to the owning user. The secret lives in a file only that user can read: 0600 inside a 0700 directory on POSIX, and the private user-profile ACL on Windows. A peer-credential check (the socket's uid) is not portable to Windows from Node, so a file-based secret was used instead.

**Residual risks** (documented, not fixed):

- Port squatting: if the worker is down, another local user could bind 38888 first. Hooks would then send their events and the token to that process. This was already true for the events before this change.
- The tokenized URL passes through the browser launch command line and browser history, both inside the user's own account.
- An already-running old worker stays open until it restarts.

## P2: DNS rebinding (HIGH)

**Change.** New `localOriginGuard` in `worker.ts`:

- `Host` must be `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`.
- If a browser sends an `Origin`, it must be `http://` plus one of those hosts.
- `Sec-Fetch-Site: cross-site` and `same-site` are refused (403). One exception: a top-level navigation to the data-free `/admin` page, so a link to the workbench still opens.

A rebinding page sends its own hostname in `Host`. It also cannot read the token, which lives in another origin's sessionStorage or in the file.

## P3: browser CSRF (MED)

**Change.**

- Any request with a body must be `application/json`. Otherwise the worker answers 415 before parsing, so form and `text/plain` "simple" requests are refused. Bodyless POSTs (`/shutdown` from the CLI) still work.
- `POST /admin/api/settings` without a boolean `readEnabled` or `writeEnabled` answers 400 and changes nothing. It used to apply `normalizeRuntimePolicy({})`, which turned both switches on. The admin UI always sends booleans.
- `/admin/api/tasks/flush` and `/shutdown` are behind the token (P1) and the origin checks (P2).

## P4: auto-recall ignores "memory disabled" (MED)

**Change** (`src/hooks/auto-recall.ts`, `worker.ts`):

- `query()` returns `null` when the worker reports `disabled` or does not answer. In that case `recallWithinDeadline` stops: no LLM query rewrite, so none of the raw prompt goes to the external LLM.
- `/memory/query` now also returns `write_enabled`. A new turn (prompt plus prepared context) is written to `~/.agentmem/auto-recall/*.json` only after the worker confirmed in this hook process that reads and capture are both on.
- Otherwise the state stays in process memory for this hook call, and any stale state file for that session is removed. Updates to a turn that is already on disk (tool failure counters in a later hook process) are still written, unless the worker just reported memory disabled.
- State files are written atomically with mode 0600.
- No change was needed in `codex-user-prompt.ts` or `opencode-user-prompt.ts`: they go through `recallForTask` and `beginRecallTurn`, which now consult the switches.

**Behaviour change.**

- With capture (writes) off and reads on, recall is still injected within the same hook call (Codex, OpenCode, Antigravity pre-invocation).
- Grok delivers recall at its first tool event, in a separate process. That needs the stored context, so Grok gets no auto-recall while capture is off.
- Prompts the hook does not query for ("ok", "thanks") are no longer kept on disk.

## P5: file permissions (MED)

**Change.** New `src/services/private-files.ts`:

- `ensurePrivateDir`: 0700.
- `restrictToOwner`: 0600 for files and 0700 for directories, best effort.
- `writePrivateFileAtomic`: a temp file in the same directory is written with mode 0600 and fsync, then renamed over the target. On Windows the rename is retried on EPERM, EBUSY or EACCES.

Used for:

- `~/.agentmem`: tightened at worker start, bootstrap and install, including existing installs.
- `.env`: bootstrap and the admin LLM save. An existing `.env` is chmodded to 0600 at worker start and at bootstrap.
- `worker-token`, the auto-recall state, and installer baselines (P7).
- The CLI creates `~/.agentmem` private.

**Windows.**

- Inside the user profile, the directory keeps the profile ACL, which is already owner, SYSTEM and Administrators only.
- Outside the profile (for example `AGENTMEM_RUNTIME_DIR` on another drive), `icacls` replaces the inherited ACL with the current user, SYSTEM and Administrators.

**Why not always reset the ACL on Windows.** On this machine the user profile ACL deliberately grants `CodexSandboxUsers` and other sandbox SIDs access. Stripping inheritance inside the profile could break tools that the user set up on purpose, and that path cannot be verified here.

## P6: `.env` backups (MED), owner decision applied

**Change.**

- `bootstrap.ts` no longer creates `.env.bak-<timestamp>`. The result no longer has `backupPath` or `envBackupPath`.
- `.env` is written atomically (P5), so an interrupted run leaves the old file or the new one, never a truncated file.
- No code deletes existing `.env.bak-*` files. A regression test checks that an old backup survives bootstrap untouched.
- `.gitignore` now covers `.env.bak-*` and `.env.tmp-*`.
- Docs (README, README.zh, Installation en/zh, Reference en/zh, Second Machine guide, CHANGELOG) no longer describe backup creation. They carry the short note that older versions created `.env.bak-<timestamp>` files containing the API key, and that users may delete old ones themselves.

## P7: installer baselines (MED)

**Change** (`install-state.ts`):

- The `~/.agentmem/backups` directory is created or tightened to 0700, and `~/.agentmem` is tightened too.
- New baselines are written with `writePrivateFileAtomic` (0600). Existing baselines are chmodded to 0600 when they are seen again.
- On POSIX the 0700 parent directory already blocks other users from older 0644 baselines.

**Not changed.** The baseline still holds the complete original config text. Uninstall needs it to restore the file byte for byte, and `--purge-all` still removes it.

## P8: secrets in error text (MED)

**Change.**

- New `llmErrorExcerpt` in `llm-config.ts`. It removes:
  - the API key;
  - auth-header secrets (`llmHeaderSecrets`);
  - every custom header value of 6 or more characters;
  - credential-shaped tokens, paths and emails (`sanitizeText`).
- It then clips the text to 300 characters.
- It is used for the HTTP error body in `llm-client.ts` (`callLlmJson`) and in `daily-digest.ts`. These are the sources of the exception text that ends up in task `last_error`, fallback memories, digest errors and stderr (`worker.ts`).
- A malformed `AGENTMEM_LLM_HEADERS` no longer quotes itself in the JSON parse error. Before, the message quoted the start of the header text, which could hold a credential (`resolveLlmSettings` and the daily-digest `parseHeaders`).
- The LLM request logic, endpoint/key resolution and config precedence are unchanged.

## P9: key on the command line (MED)

**Change.**

- `scripts/bootstrap-second-machine.ps1` no longer forwards `--api-key`. When `-ApiKey` is not given and `~/.agentmem/.env` has no key, it asks with `Read-Host -AsSecureString`; only in an interactive session with console input that is not redirected.
- The key reaches Node in the `AGENTMEM_BOOTSTRAP_API_KEY` environment variable. The script removes the variable afterwards. `cli.ts` deletes it from its own environment before it starts the worker, so the worker does not inherit it.
- `-ApiKey` still works but warns that the key ends up in shell history.
- `cli.ts` still accepts `--api-key` for old scripts, but help and docs no longer show it.
- Docs replace `-ApiKey <key>` and `--api-key <key>` with the prompt, the workbench or `.env`.

## Tests

New `tests/leak-risks.test.cjs` (15 tests):

| Problem | What the tests check |
| --- | --- |
| P1 | Token required on reads, admin, LLM config, LLM test, `/tools` and `/shutdown`; a wrong token is refused; the page loads without a token; token file 0600 and runtime dir 0700 on POSIX; header values are never returned and a masked round trip keeps them; CLI `status` and `admin-url` work; the page takes the token from the fragment, strips the URL, sends the header and asks once on 401 (vm test) |
| P2 | Rebound `Host`, foreign `Origin` and `cross-site` are refused even with the token; same-origin and navigating to `/admin` work |
| P3 | `text/plain` and form POSTs get 415 (401 without a token); an empty or string-typed settings body gets 400 and capture stays off; flush and shutdown without a token get 401 |
| P4 | Reads off: no rewrite call and no state file; capture off: recall still injected, no state file; on: state file 0600 |
| P5 | Atomic write leaves no temp file and gives 0600/0700; tightening an existing directory; Windows ACL replacement for a directory outside the profile (runs on Windows only; the POSIX mode checks skip on Windows) |
| P6 | No backup is written, an old backup is untouched, `.env` is tightened to 0600; `.gitignore` covers `.env.bak-*` |
| P7 | The baseline still has the full content for restore, and is 0600 inside 0700 directories |
| P8 | A stub gateway echoes the key, the headers and the request: the error carries none of the secrets and is clipped; the malformed-headers error is checked too |
| P9 | The script has no `--api-key`, uses the environment variable and the secure prompt; docs have no `-ApiKey <key>` or `--api-key <key>` |

Existing tests adapted:

- New `tests/helpers/worker-token.cjs`: test processes register the workers they spawn, and fetch calls to those ports carry the token. `rawFetch` sends requests without it, for the 401/403 checks.
- One `registerWorker` line in each worker spawn helper.
- Runtime-dir cleanup lists now include `worker-token`.
- The CLI and hook calls in tests get `AGENTMEM_RUNTIME_DIR`.
- The `.env` backup assertions are replaced by "no backup" assertions.
- The saved-headers test expects masked values in the admin API. It still checks that the real values reach the model requests.

On POSIX the mode assertions run. This Windows run covered the Windows ACL test instead.

## Deferred or not fixed

- **Out of scope, untouched as instructed:** credentials carried over when the LLM or embedding endpoint changes, including the connection test sending the saved key to a typed URL (now only the owner can trigger it); redaction inside captured tool events; case-insensitive project path matching in `db.ts`; fixture usernames.
- **Residual P1 risks** (port squatting, the token in browser history and the browser launch command line): see P1. Fully preventing port squatting would need the client to verify the server's identity, which is a larger design change.
- **`apiKeyMasked`** still shows the first 4 and last 4 characters of the key in the admin API. This is unchanged pre-existing behaviour, and the audit did not list it.
- **Existing hook tests** (`grok-hook`, `claude-hook-payload`, `hook-skip-capture`, `grok-build-agent-id`) spawn hooks against fake servers without `AGENTMEM_RUNTIME_DIR`. Those hooks therefore read the token path under the real `~/.agentmem` and may use its auto-recall directory. This was already true before this change for the auto-recall state, and the requests only reach the in-process fake server. To keep the diff tight these tests were not changed; giving them a temp `AGENTMEM_RUNTIME_DIR` is a small follow-up.
- **Not run on real hosts:** the PowerShell scripts were not run against a live install (no live worker or real `~/.agentmem` may be used here). `script-encoding` and `workbench-orchestration` tests pass, and both scripts stay pure ASCII.
