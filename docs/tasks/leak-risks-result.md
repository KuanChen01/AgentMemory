# Leak risks: result (P1-P9)

Branch `fix/leak-risks`, based on master `a5bdc5e`. Reviewed and pushed for a PR to master.

**Owner decision:** the per-user worker access token (`~/.agentmem/worker-token`, `X-AgentMem-Token`, `agentmem admin-url`) and the Windows `icacls` ACL replacement were removed. The original model stays: any local process on the machine may query the worker. Only the LLM API key and custom LLM header values are treated as secret: they are masked in API responses and the admin UI, and LLM error text is redacted on a best-effort basis (by header name). An old leftover `worker-token` file is ignored (not deleted, not required). Host/Origin checks, JSON-only bodies, key masking, error redaction, atomic `.env` writes, the hidden bootstrap key prompt, auto-recall switch respect, and POSIX owner-only files remain.

Checks run on Windows 11 (Node 24):

- `npx tsc --noEmit`: clean
- `npm run build`: clean
- `node --test --test-concurrency=1 tests/*.test.cjs`: after the token/ACL removal, **517 tests**: Windows 517 pass, 0 fail; Linux 494 pass, 0 fail, 23 Windows-only skipped. New tests are in `tests/leak-risks.test.cjs`.

Tests only use temp dirs and ephemeral ports. None binds port 38888, and none touches the running worker or the real `~/.agentmem`.

## Upgrade steps for users (all platforms)

1. `npm run build` (or `npm ci && npm run build`).
2. Restart the worker (`agentmem stop`, then let a hook start it, or `.\start-workbench.cmd restart`), and restart the agents. Agent hook configs and `.env` do not change, and no reinstall is needed.
3. Open the workbench at `http://127.0.0.1:38888/admin` (`.\start-workbench.cmd start` / `open-admin`, or `npm run workbench`).
4. Optional: delete old `~/.agentmem/.env.bak-<timestamp>` files. They contain the API key, and AgentMemory never deletes them.

Until step 2 the old worker keeps running the old code.

## P1: local-user access (HIGH)

**Removed by owner decision.** A per-user worker token was added, then subtracted: any local process on the machine may query the worker. An old leftover `worker-token` file is ignored. Header-value masking in the admin LLM config API remains: each value is shown as `••••`, and saving or testing with `••••` keeps the saved value (`restoreSavedHeaderValues` in `llm-config.ts`).

**Residual risk:** if the worker is down, another local process could bind 38888 first.

## P2: DNS rebinding (HIGH)

**Change.** New `localOriginGuard` in `worker.ts`:

- `Host` must be `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`.
- If a browser sends an `Origin`, it must be `http://` plus one of those hosts.
- `Sec-Fetch-Site: cross-site` and `same-site` are refused (403). One exception: a top-level navigation to the data-free `/admin` page, so a link to the workbench still opens.

A rebinding page sends its own hostname in `Host`.

## P3: browser CSRF (MED)

**Change.**

- Any request with a body must be `application/json`. Otherwise the worker answers 415 before parsing, so form and `text/plain` "simple" requests are refused. Bodyless POSTs (`/shutdown` from the CLI) still work.
- `POST /admin/api/settings` without a boolean `readEnabled` or `writeEnabled` answers 400 and changes nothing. It used to apply `normalizeRuntimePolicy({})`, which turned both switches on. The admin UI always sends booleans.
- `/admin/api/tasks/flush` and `/shutdown` are behind the origin checks (P2).

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
- the auto-recall state, and installer baselines (P7).
- The CLI creates `~/.agentmem` private.

**Windows.** Private file writes stay atomic with no ACL changes. The `icacls` replacement of inherited ACLs was removed by owner decision.

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

New `tests/leak-risks.test.cjs` (token and Windows ACL cases removed by owner decision):

| Problem | What the tests check |
| --- | --- |
| P1 | Header values are masked in the config API and a masked round trip keeps them |
| P2 | Rebound `Host`, foreign `Origin` and `cross-site` are refused; same-origin and navigating to `/admin` work |
| P3 | `text/plain` and form POSTs get 415; an empty or string-typed settings body gets 400 and capture stays off |
| P4 | Reads off: no rewrite call and no state file; capture off: recall still injected, no state file; on: state file 0600 |
| P5 | Atomic write leaves no temp file and gives 0600/0700; tightening an existing directory |
| P6 | No backup is written, an old backup is untouched, `.env` is tightened to 0600; `.gitignore` covers `.env.bak-*` |
| P7 | The baseline still has the full content for restore, and is 0600 inside 0700 directories |
| P8 | A stub gateway echoes the key, the headers and the request: the error carries none of the echoed key or auth header values and is clipped; the malformed-headers error is checked too |
| P9 | The script has no `--api-key`, uses the environment variable and the secure prompt; docs have no `-ApiKey <key>` or `--api-key <key>` |

Existing tests adapted:

- The `.env` backup assertions are replaced by "no backup" assertions.
- The saved-headers test expects masked values in the admin API. It still checks that the real values reach the model requests.

On POSIX the mode assertions run.

## Deferred or not fixed

- **Out of scope, untouched as instructed:** credentials carried over when the LLM or embedding endpoint changes, including the connection test sending the saved key to a typed URL (now only the owner can trigger it); redaction inside captured tool events; case-insensitive project path matching in `db.ts`; fixture usernames.
- **Residual P1:** any local process on the machine may query the worker (owner decision). Port squatting remains if another local process binds 38888 first.
- **`apiKeyMasked`** still shows the first 4 and last 4 characters of the key in the admin API. This is unchanged pre-existing behaviour, and the audit did not list it.
- **Existing hook tests** (`grok-hook`, `claude-hook-payload`, `hook-skip-capture`, `grok-build-agent-id`) spawn hooks against fake servers without `AGENTMEM_RUNTIME_DIR` and may use the real `~/.agentmem` auto-recall directory. The requests only reach the in-process fake server.
- **Not run on real hosts:** the PowerShell scripts were not run against a live install (no live worker or real `~/.agentmem` may be used here). `script-encoding` and `workbench-orchestration` tests pass, and both scripts stay pure ASCII.

## Known limits (tracked separately)

- L03: the connection test (`/admin/api/llm-test`) still sends the saved key and headers to a caller-supplied `apiUrl`.
- Header redaction in errors is selected by header name; a gateway echoing a value saved under another name, short values, or fetch header-validation exceptions can still expose it.
- L05: captured tool output is stored and shown (for example by `/admin/api/work-evidence`) without credential redaction.
