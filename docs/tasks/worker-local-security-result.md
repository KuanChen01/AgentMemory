# Worker local-only access and non-destructive bootstrap `.env`: result

Branch: `fix/worker-local-security` (based on `master` 063e678). Local commits only; nothing pushed.

## Problems

**A. Network exposure.** `src/services/worker.ts` called `app.listen(PORT)`, so the worker listened on every network interface. Only `/admin` routes (`adminOnlyGuard`) checked that the client was on loopback. `/context`, `/state`, `/search`, `/memory/query`, `/tools`, `/sessions*`, `/tasks/boundary`, `/import/*` and `/shutdown` had no authentication and no address check. Anyone on the same LAN could read memories, inject state or tool logs, or stop the worker.

**B. Settings loss.** `ensureBootstrapEnvFile` in `src/services/bootstrap.ts` rewrote `~/.agentmem/.env` on every bootstrap from a four-line template (key, URL, model, port) and made no backup. Every other line was silently dropped: comments, `AGENTMEM_LLM_HEADERS`, output budgets, `AGENTMEM_DB_PATH`, task/digest options and so on.

## What changed and why

### A: loopback only

- `src/services/worker.ts`
  - `app.listen(Number(PORT), HOST, ...)` with `const HOST = '127.0.0.1'`. The worker has no authentication, so it must not be reachable from the network at all. Binding to loopback is the real fix: LAN clients cannot even connect.
  - A global `loopbackOnlyGuard` (`app.use`) is registered before `express.json`. It returns 403 for any non-loopback socket address on every route, as a second layer, and it runs before a remote client's body (up to 10 MB) is parsed. The existing per-route `adminOnlyGuard` is left as it was.
  - The startup log line now says `running on port N (127.0.0.1 only)`. Existing readiness checks match `worker service running`, which is unchanged.
  - **No setting to change the bind address was added.** An opt-in `AGENTMEM_HOST` would bring back exactly this hole, because there is still no authentication.
- `src/hooks/worker-client.ts` (used by every Claude Code / Codex / OpenCode / Antigravity / Grok hook) and `src/bin/cli.ts` (`agentmem stop`, `agentmem status`) now connect to `http://127.0.0.1:<port>` instead of `http://localhost:<port>`. On Windows and some Linux setups `localhost` resolves to `::1` first, and nothing listens there now. Node's dual-stack fallback would usually recover, but an explicit address is deterministic and avoids a wasted connection attempt inside the hook's 1.5 s budget.

Other in-repo clients, checked:

| Client | How it reaches the worker | Status |
| --- | --- | --- |
| Hooks (Claude Code, Codex, OpenCode, Antigravity, Grok) | `fetchAgentMemoryWorker` → `127.0.0.1` | changed, tested |
| Hook autostart (`spawnDetachedWorker`, readiness probe) | same client | works, tested (`hook-worker-client.test.cjs` autostart test) |
| CLI `stop` / `status` | `127.0.0.1` | changed, `status` tested |
| CLI `start`, `bootstrap-win`, `npm run workbench` | `workbench-launcher.ts` already used `127.0.0.1` | unchanged |
| `scripts/start-workbench.ps1`, `start-workbench.cmd`, `bootstrap-second-machine.cmd` | already `http://127.0.0.1:$Port` | unchanged |
| MCP server (`src/servers/mcp-server.ts`) | opens the SQLite DB directly, no HTTP | unaffected |
| Admin UI (`admin-ui-client.ts`) | relative `fetch(url)` from the page it was served from | unaffected |
| Browsers at `http://localhost:38888/admin` | browsers fall back from `::1` to `127.0.0.1` | works; docs recommend `127.0.0.1` |

The behaviour is the same on Windows and Linux: `127.0.0.1` always exists, and the hook/CLI code has no platform-specific branch.

### B: merge instead of rewrite

- `src/services/bootstrap.ts`
  - New exported `mergeBootstrapEnvText(text, values)`. For each of the four managed keys it rewrites a line only if the value actually differs, and appends the key if it is missing. Every other line is kept byte-for-byte, including comments, blank lines, quoting and CRLF line endings (the file's own EOL is reused).
  - `ensureBootstrapEnvFile` resolves the four values with **exactly the same precedence as before** (CLI seed → existing `AGENTMEM_LLM_*` → legacy `DEEPSEEK_*` → defaults; port from seed → existing → 38888). It then writes only if the merged text differs from the file. Before any write to an existing file it copies it to `~/.agentmem/.env.bak-<ISO timestamp>` with `fs.copyFileSync`, which keeps the file mode on POSIX. A freshly scaffolded file gets no backup, and a no-op run writes nothing.
  - The result gains `backupPath`, and `runWindowsBootstrap` reports it as `envBackupPath` in the JSON that `agentmem bootstrap-win` prints.
  - `src/services/llm-config.ts` (it has its own private `upsertEnvText`), `llm-client.ts` and LLM config precedence are **not** touched.

## Files

- `src/services/worker.ts`: bind address, global loopback guard
- `src/hooks/worker-client.ts`, `src/bin/cli.ts`: connect to `127.0.0.1`
- `src/services/bootstrap.ts`: in-place `.env` merge and backup
- `tests/worker-local-security.test.cjs`: new regression tests (6)
- `tests/helpers/task-worker.cjs`: `assertLanRefused` helper
- `tests/admin-activity|admin-digests|admin-memories|admin-memory-detail|admin-pipeline|admin-vault-reviews|worker-admin-shell.test.cjs`: these expected a 403 from the LAN address. They now assert that the connection is refused, because the worker no longer listens there.
- `tests/hook-worker-client.test.cjs`: fake workers listen on `127.0.0.1` (the client no longer dials `localhost`)
- `tests/english-records.test.cjs`: pre-existing Windows-only failure, test-only fix (see below)
- `README.md`, `README.zh.md`, `docs/Second Machine Bootstrap Guide.zh.md`, `CHANGELOG.md` (`[Unreleased]`): docs
- `docs/tasks/worker-local-security-result.md`: this file

## Behaviour changes users must know

1. The worker is reachable only from the same machine (`127.0.0.1`). Another computer, a container or VM using the host's LAN IP, or a WSL2 distro in NAT mode calling the Windows host IP can no longer use it. No setting brings back network access.
2. A running worker keeps its old bind until it is restarted (`agentmem stop`, then start it again, or let a hook autostart it).
3. Use `http://127.0.0.1:<port>`. `localhost` still works in browsers and in clients that fall back to IPv4. A third-party script that only tries `::1` will fail.
4. Bootstrap keeps every `.env` line it does not manage. When it changes the file it leaves `~/.agentmem/.env.bak-<timestamp>` next to it. The backup holds the API key just like `.env`, so delete old backups if you don't need them. Nothing is cleaned up automatically.
5. No new environment variables or settings.

## Tests

New `tests/worker-local-security.test.cjs` (6 tests):

- The built worker binds `127.0.0.1` and registers the guard before the body parser. The hook client and CLI use `127.0.0.1` with no `localhost`.
- A real isolated worker (temp DB, temp runtime dir, random free port, local LLM stub) is reachable from `127.0.0.1`, `localhost`, `fetchAgentMemoryWorker` and `agentmem status` (with a temp HOME).
- From this machine's LAN IPv4 address, `GET /context`, `GET /state`, `POST /state`, `POST /search` and `POST /shutdown` are all refused. Afterwards the worker is still up and no state was injected. Skipped if the machine has no non-internal IPv4 interface.
- Bootstrap keeps gateway headers, budgets, DB path, other options and comments; it updates the key and port; the backup equals the original; a second identical run writes nothing and adds no backup.
- A complete CRLF file with a quoted key stays byte-for-byte unchanged, with no backup.
- A new scaffold gets no backup. Unit checks for `mergeBootstrapEnvText`.

On the unfixed code, test 1 fails (no `HOST`), the LAN test fails (the request gets a response), and the bootstrap test fails (lines dropped, no backup).

Commands, run on Windows 11, Node 24.14.0:

- `npx tsc --noEmit`: clean
- `npm run build`: clean
- `node --test --test-concurrency=1 tests/*.test.cjs`: **500 tests, 500 pass, 0 fail, 0 cancelled, 0 skipped**. The LAN-address tests ran rather than skipped, because this machine has a non-internal IPv4 interface. Before this branch the suite had 494 tests; the 6 new ones are in `worker-local-security.test.cjs`.

Pre-existing failure found and fixed (test only): the first full run on this branch had 499/500. `english-records.test.cjs` "prompt v2 ... never regenerated" stored the fixture `project_path: '/work/App'` raw, but `DatabaseManager.getTimeline` compares against `path.resolve(projectPath)`. On Windows that adds a drive letter (`E:/work/App`), so the timeline was empty and the digest took the `skipped_no_observations` path. That test file, `db.ts` and `daily-digest.ts` are identical to base 063e678, so this was failing on Windows before this branch. I did not run the base build separately; the conclusion comes from the identical code and the debug trace. On Linux `path.resolve('/work/App')` is unchanged, so the fix (normalize the fixture path the same way the DB does) does not change what the test checks there.

No test binds port 38888. Workers use random free ports and temp `AGENTMEM_RUNTIME_DIR` / `AGENTMEM_DB_PATH` / `AGENTMEM_ENV_PATH`. Bootstrap tests use temp home directories.

## PR #33 (`feat/ps51-readme`): text to change after this fix

PR #33 (commit 2b62493) documents the old behaviour. After this branch lands, change:

1. `docs/Installation.md`, section **"Network note"** (line ~65). Replace the whole paragraph "The worker listens on port 38888 (or the port you chose) on every network interface. The admin workbench and its APIs reject requests that do not come from this machine, but the endpoints agents use to read and write memory do not. On a shared or untrusted network, make sure your firewall blocks inbound connections to that port." with something like: "The worker listens on `127.0.0.1` only, and every endpoint (agent memory reads and writes, `/shutdown` and the admin workbench) rejects requests that do not come from this machine. Other computers, containers and VMs on your network cannot reach it, and there is no setting to expose it, because the worker has no authentication."
2. `docs/Installation.zh.md`, section **"网络说明"** (line ~65). Replace "worker 会在所有网卡上监听 38888 端口（或你设置的端口）。管理面板和它的 API 会拒绝非本机请求，但 agent 用来读写记忆的接口不会。在共享或不可信的网络里，请确认防火墙拦截了这个端口的入站连接。" with: "worker 只监听 `127.0.0.1`，所有接口（agent 读写记忆、`/shutdown`、管理面板）都会拒绝非本机请求；局域网里的其他电脑、容器和虚拟机都连不上它。worker 没有身份认证，因此不提供对外开放的设置。"
3. `docs/Installation.md` bootstrap **step 2** (line ~26). Replace "Creates or rewrites ... Every bootstrap run rewrites this file with only the key, URL, model and port; other settings in it are dropped, so back it up first if you added any." with "Creates or updates `%USERPROFILE%\.agentmem\.env`. ... (first-run sentences unchanged) ... On later runs bootstrap only sets the key, URL, model and port, in place; every other line is kept. Before changing the file it saves the previous version as `.env.bak-<timestamp>` next to it (reported as `envBackupPath`)."
4. `docs/Installation.zh.md` bootstrap **step 2** (line ~26). Replace "创建或重写 ... 每次运行 bootstrap 都会重写这个文件，只保留 key、URL、模型和端口，其他配置会被丢掉；如果你加过别的配置，请先备份。" with "创建或更新 ……（首次运行的说明不变）…… 之后再运行时，bootstrap 只就地设置 key、URL、模型和端口，其余行全部保留；改动前会先把原文件备份为同目录下的 `.env.bak-<时间戳>`（输出中的 `envBackupPath`）。"
5. `README.md` / `README.zh.md` line 26 ("the admin workbench only answers requests from this machine" / "管理面板只响应本机发来的请求"). This is now an understatement. It can go back to the stronger claim: "the worker only listens on this machine (127.0.0.1)" / "worker 只监听本机（127.0.0.1）".
6. `docs/Reference.md` / `docs/Reference.zh.md` (PR #33 moves the old README body here). Port the two paragraphs this branch adds to `README.md` / `README.zh.md`: the "whole worker is local-only" paragraph after "The admin console is intentionally restricted to loopback clients..." (Reference line ~191), and the `.env` merge/backup paragraph after the Windows Bootstrap scaffold paragraph. If PR #33 is merged first, these README additions will conflict with its rewrite and should be moved into `docs/Reference*.md` at that point.
7. PR #33's `CHANGELOG.md` entries: no change needed. This branch adds its own `[Unreleased]` section.

## Deferred / not done

- **Browser-originated requests (CSRF / DNS rebinding).** Loopback binding stops LAN access, but a malicious web page open in a local browser can still send "simple" requests to `http://127.0.0.1:38888`, for example a form `POST /shutdown`. With DNS rebinding it could also read responses. The proper fix is a `Host`-header allowlist (`127.0.0.1:<port>`, `localhost:<port>`) and/or requiring `Content-Type: application/json` or a custom header on state-changing routes. This is outside "Problem A (LAN exposure)" and needs checking against every client, so it is left for a follow-up.
- **No local authentication.** Any process on the same machine, including other users on a shared Linux host, can still use the worker. That matches the product's single-user local design. A per-user token or a Unix socket would be a larger change.
- **Port precedence in bootstrap.** `runWindowsBootstrap` always passes a port (`--port`, `AGENTMEM_PORT` or 38888), so a custom `AGENTMEM_PORT` in `.env` is still replaced by that value, as before. This was left unchanged on purpose: the worker that bootstrap starts uses that same port, so keeping the old `.env` value would make them disagree.
- **Backup retention.** `.env.bak-*` files accumulate, one per changing bootstrap run. There is no automatic cleanup.
- Remote access (WSL2 NAT, containers, other machines) is intentionally unsupported now. If it is ever needed, it should come with authentication, not a bind-address switch.
