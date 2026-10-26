# Changelog

## [Unreleased]

Upgrade note: run `npm run build`, then restart the worker (`agentmem stop`, or `.\start-workbench.cmd restart`) and restart your agents. A running worker keeps its old code until it restarts. Open the workbench at `http://127.0.0.1:38888/admin` (`.\start-workbench.cmd start` / `open-admin` on Windows, or `npm run workbench`). Any local process on the machine may query the worker; the LLM API key and custom LLM header values are treated as secrets (see the known limits below). Older versions left `.env.bak-<timestamp>` copies of `.env`, with your API key, in `~/.agentmem`; AgentMemory never deletes them, so delete old ones yourself if you do not need them.

### Security
- The worker now listens on `127.0.0.1` only, instead of all network interfaces, and every route rejects non-loopback clients (before this only `/admin` did). Before this fix anyone on the same LAN could read memories through `/context` or `/search`, write state through `/state`, or stop the worker through `/shutdown`. There is no setting to expose the worker on the network. The hook client and `agentmem stop`/`status` now connect to `127.0.0.1` instead of `localhost`.
- DNS rebinding and cross-site requests are refused: the worker accepts only its own `Host` (`127.0.0.1`, `localhost` or `[::1]` with its port) and, when a browser sends one, its own `Origin`; requests a browser marks `cross-site` or `same-site` are refused. Request bodies must be JSON (`415` otherwise), so a form or `text/plain` POST from another site can no longer reach state-changing routes. `POST /admin/api/settings` without a boolean `readEnabled`/`writeEnabled` now answers `400` and changes nothing; it used to turn both switches back on.
- The admin LLM config API and the admin UI no longer show custom header values (`AGENTMEM_LLM_HEADERS`). Each value is masked as `••••`; sending `••••` back when saving or testing keeps the saved value.
- Auto-recall respects the memory switches. With reads off it sends nothing to the LLM (no query rewrite of your prompt) and keeps nothing on disk. With capture (writes) off it still injects recall in the same hook call but does not keep the prompt or the prepared context in `~/.agentmem/auto-recall/`; delayed delivery (Grok's first tool event) therefore has nothing to deliver while capture is off.
- Owner-only files on macOS/Linux: `~/.agentmem` (0700), `.env`, auto-recall state and installer baselines in `~/.agentmem/backups` (0600). Existing installs are tightened on the next worker start, bootstrap or install. `.env` writes (bootstrap and the admin LLM settings) are atomic. On Windows those writes stay atomic with no ACL changes.
- LLM gateway error text is redacted on a best-effort basis before it reaches exceptions, task error and fallback memories, digest errors or the worker log: the API key, auth-named header values and credential-shaped tokens are removed, and the text is clipped to 300 characters. A malformed `AGENTMEM_LLM_HEADERS` no longer quotes itself in the parse error.
- Captured tool calls are redacted before they are stored, routed or sent to the summary model, on a best-effort basis. A call that reads or writes a secret file (`.env*` except `.env.example`/`.sample`/`.template`, `*.pem`/`*.key`, SSH private keys and their backups but not `.pub` keys, `.npmrc`, `.netrc`, `~/.aws/credentials`, `credentials*.json`, `*secrets.json|yaml|toml`, ...) keeps its path but not the content: by a path field, a shell command that runs a reader on the file (`cat .env`, `Get-Content .env`, `grep X .env`), or a patch that edits it. Known token formats (`sk-`, GitHub, AWS, Google, Slack, GitLab, npm, Hugging Face, Stripe, JWT, private key blocks), `Bearer`/`Basic` credentials, URL passwords, credential-named assignments (`DB_PASSWORD=...`, `"client_secret": "..."`, a quoted value redacted whole) and AgentMemory's own saved key and header values become `<redacted:...>` markers. Ordinary keys and values are left alone: `sort_key`, `cache_key`, `primary_key` and other `*_key` names count only as upper-case environment variables (`STRIPE_KEY`), and paths, typed digests (`sha256:...`) and short code identifiers are never taken for credentials. JSON is redacted value by value, so redacted JSON still parses (edit-tool file paths keep working). Every pattern is length-bounded, so redaction stays linear on large tool output. Stored memories (title, narrative, facts, concepts, including memories saved with `record_memory`) get only the high-precision rules (known formats, URL passwords, AgentMemory's own credentials), not the assignment heuristic, and are redacted before their content hash and embedding are computed, so deduplication and search match the stored text. A task whose synthesis fails no longer copies raw tool input/output into its fallback memory; it lists the tool names. Rows captured before this change are redacted again when `/admin/api/work-evidence` returns them and when they are sent to the model; the rows themselves are not rewritten.
- Known limits, tracked separately: the connection test still sends the saved key and headers to a caller-supplied URL; header redaction is chosen by header name, so a gateway that echoes a value under another name, or some fetch exceptions, can still expose it. Tool-call redaction matches known shapes, so a secret with no recognizable format or name (for example a bare password in free text) can still be captured.
- The Windows bootstrap no longer passes the API key on a command line. Run `.\bootstrap-second-machine.cmd` without `-ApiKey` and type the key at the hidden prompt (shown when `~/.agentmem/.env` has no key yet); the script hands it to Node in an environment variable. `-ApiKey` still works but warns, because the key ends up in your shell history.

### Changed
- README screenshots and `scripts/demo-seed.cjs` use generic fake LLM values (`llm.example.com` / `my-model`); platform badges and install docs mark Windows as primary and macOS/Linux as lightly tested.
- README rewritten as a short overview with screenshots made from demo data; the previous README now lives in `docs/Reference.md` / `docs/Reference.zh.md`, and install details in `docs/Installation.md` / `docs/Installation.zh.md`. The architecture diagrams no longer name a specific LLM vendor or model.

### Fixed
- `agentmem bootstrap-win` no longer drops `.env` settings. It updates only `AGENTMEM_LLM_API_KEY`, `AGENTMEM_LLM_API_URL`, `AGENTMEM_LLM_MODEL` and `AGENTMEM_PORT` in place and keeps every other line. It writes no backup copy of `.env` (a copy would be one more file holding the key) and replaces the file atomically, so an interrupted run leaves either the old or the new file.
- `start-workbench.ps1` failed to parse under Windows PowerShell 5.1 on non-UTF-8 code pages (e.g. GBK/936); it is now pure ASCII. Under 5.1 it also reported every running worker as INACTIVE (`ConvertFrom-Json -Depth` is PowerShell 6.2+), which made `start` rebuild and start a second worker.

## [2.2.4] - 2026-10-25

Upgrade note: run `npm ci && npm run build`, then re-run `agentmem install` (keep `--claude-capture` where used) so every agent's managed guidance gains the English-records line. No schema change. Existing memories and digests are left as they are: nothing is backfilled, translated or regenerated. Install validation (`agentmem install --strict`, `agentmem bootstrap-win`) now also requires the English line in the OpenCode rules, Antigravity guidance and Grok profile. Both commands rewrite those files first, so the check only flags files that were edited afterwards or written by an older version.

### Changed
- AgentMemory-generated records are written in English, whatever language the source events use. Identifiers, paths, commands and proper names stay verbatim.
  - The shared work-memory prompt (used by task consolidation, legacy compaction and per-event synthesis) asks for an English title, narrative, facts and concepts.
  - The daily digest prompt asks for an English summary and list entries. The prompt version is now `daily-digest-v2`. An existing successful digest with the same sources is kept whatever its prompt version, and scheduler catch-up never reruns a successful day, so the bump does not regenerate old digests.
  - The `record_memory` MCP tool description and its title, narrative, facts and concepts field docs ask for English.
  - Installer-managed guidance for OpenCode (global rules), Antigravity (guidance and plugin rule) and Grok Build (agent profile) carries the English rule, so it survives reinstalls. The installer still never writes `~/.claude/CLAUDE.md`; Claude Code gets the rule from the `record_memory` tool docs.

### Added
- Consolidation retry: if a synthesis answer's title (skip answers included, since a refused skip can still be saved) and narrative are mainly CJK (ideographs, kana or hangul at 30% or more of the prose letters, with paths, identifiers and code spans ignored), the model is asked once more with a stronger English reminder and the second answer is kept regardless. If the retry fails, the first answer is kept. There is at most one English-language retry per synthesis; the existing malformed-JSON and network retries inside each request still apply. Legacy compaction records both calls in `task_results.llm_calls`.

## [2.2.3] - 2026-10-25

Upgrade note: run `npm ci && npm run build`, then re-run `agentmem install --claude-capture` on machines that use Claude Code capture. The schema change is additive (a nullable column on `task_event_buffer` and a new `task_import_times` table; task schema revision 12). It is applied automatically on first start, and v2.2.2 still runs on the upgraded database.

### Fixed
- Claude Code capture: the PostToolUse hook now reads Claude Code's documented `tool_input`, `tool_response`, `tool_use_id` and `cwd` (the old field names are still accepted as fallbacks). Before this, every Claude Code event reached the worker empty and was dropped. `tool_use_id` is sent as `call_id` for insert-once dedupe, `cwd` becomes the project path, and success is read from the tool response's error flags.

### Added
- Import endpoints for backfilling captured sessions with their **original** time:
  - `POST /import/tools`: the `/tools` body plus `timestamp` (ISO 8601 with a time zone, or epoch ms) and a required `call_id`. It uses the same insert-once id `hook:<session_id>:<call_id>` as live capture.
  - `POST /import/tasks/boundary`: `{ session_id, timestamp }`.
- Imported events, task results, completions and memories keep the original time, so day stats and digests count them on the original day. Task start and end come from event and boundary times.
- Requests are rejected with 400 for a future time (beyond 5 minutes of skew), a value before 2020, a zone-less, unparseable or impossible time, or a missing call id. Live `/tools` and `/tasks/boundary` keep using server time.
- Caveat: a digest that was already generated for a past day is not regenerated automatically.

## [2.2.2] - 2026-10-25

### Changed
- Admin UI: the Background setting is now **Theme** (主题). The sidebar row is a navigation row showing the current mode with a chevron and a new theme icon.
- Theme has a Mode (Auto follows the system, Light, Dark) and two sets, Light and Dark. Each set has its own wallpaper (preset or uploaded image), glass tone, blur, dim and glass opacity; an upload replaces only that set's image.
- Built-in wallpapers reduced to Mist (Light default) and Graphite (Dark default).

### Fixed
- Home and the other sections no longer render different themes; one theme applies to every view, including on first paint.

### Migration
- Saved `am.bg` settings migrate once to `am.theme`. Removed presets fall back to the mode default. An existing uploaded image is copied to the set of the mode it was shown in. `am.bg` and the original stored image are never removed.

## [2.2.1] - 2026-10-25

Upgrade note: run `npm ci && npm run build`, then **re-run `agentmem install`** so Grok's `~/.grok/config.toml` gets `AGENTMEM_AGENT_ID = "grok-build"` (`agentmem install --strict` now checks for it). No schema change and no data is rewritten.

### Changed
- The Grok CLI is now recorded as agent `grok-build` (hook, installer and Grok agent notes). Reinstalling replaces an old `AGENTMEM_AGENT_ID = "grok"` entry.
- Existing `grok` rows stay as stored. The admin panel and admin APIs show `grok` and `grok-build` as **Grok Build**, and filtering by either (or by "Grok Build") includes both. Agent facets merge them into one `grok-build` option.

### Added
- `agent_labels` (id → display name) next to agent facet lists, and `agent_label` on agent rows, in the admin APIs. Existing `agents` arrays keep their string type.
- Reserved agent id `grok-bot`, shown as **Grok Bot**.

## [2.2.0] - 2026-10-24

Upgrade note: back up the AgentMemory DB, then run `npm ci && npm run build` and **re-run `agentmem install` on every machine**. The installer now writes `AGENTMEM_AGENT_ID=claudecode` into the Claude Code MCP server `env`, and `agentmem install --strict` reports any machine that is missing it. The only schema changes are new indexes (`CREATE INDEX IF NOT EXISTS`); they are built automatically on first start, and no data is rewritten.

### Added
- New admin panel (`/admin`): a liquid-glass home screen and sidebar shell with health ring, translucent cards and a background picker, plus these pages:
  - **Activity**: window stats, era and fallback markers, cursor-paged cards.
  - **Memory**: LIKE search, filters, cached stats and memory detail.
  - **Pipeline**: task pipeline with flagged filter, project and agent facets.
  - **Digests & Reviews**: daily digests and Vault review history.
  - **Projects**: per-project activity bars, state facts, digests and a sanitized startup-context preview.
  - **Skills**: candidates, a promote-then-enable flow, and confirmed disable or retire.
  - **Settings**: memory switches, LLM connection with a masked, write-only key, digest scheduler, and an About card with a release check.
  - Developer tools panels restyled to match.
- New read-only admin APIs, all behind the admin guard:
  - `GET /admin/api/home-summary`
  - `activity`
  - `memories`
  - `memory-detail`
  - `pipeline`
  - `digest-list`
  - `digest-detail`
  - `vault-reviews`
  - `project-list`
  - `project-detail`
  - `skills-summary`
  - `skill-detail`
  
  `activity` and `memory-detail` respect the memory read switch; with reads off, `home-summary` keeps its counts but drops recent memories and project paths. The pipeline, projects and skills responses, and stored task and digest errors, redact keys, emails, local paths and JSON-style credential pairs from their free-text fields; state facts with a credential-named key show `<redacted>`.
- `agentmem install --claude-capture` / `--no-claude-capture` choose whether the Claude Code `PostToolUse` capture hook is installed. With neither flag, the installer keeps the current choice: an existing managed setup without the hook stays without it, and a fresh install enables capture as before.

### Changed
- Admin panel consistency pass: every page shares one header (title, subtitle, Updated stamp), one segmented date-range control, a left-hand search field, locale-aware dates, a shared empty state and status chips. zh-CN copy is fully translated, the dark-mode sidebar uses the glass style, and the Developer tools toggle is the single switch for the dev pages.
- `agentmem install --strict` now fails when the Claude Code MCP server lacks `AGENTMEM_AGENT_ID=claudecode`. Re-run `agentmem install` after upgrading.

### Fixed
- Claude Code integration:
  - Direct MCP writes are attributed to agent `claudecode`.
  - The `SessionStart` hook prints a compact context (latest summaries and digests, capped lines) that stays under the hook preview limit.
  - CJK search queries are scored by bigram overlap and no longer raise FTS5 syntax errors.
- Pipeline:
  - All views share one task classifier. A task is stuck when it is incomplete and either exhausted or stale; partially closed tasks count as failed.
  - Fallback lookups use a result-time window.
  - Path redaction handles quoted paths.
  - Facet queries are SQL-capped.
  - A covering index was added for task-buffer lookups.
- Admin `llm-test` redacts the effective API key (saved or typed) and the values of custom auth headers from every text field of its response and errors, before clipping. A malformed headers JSON no longer echoes its input. Settings load and save can no longer race.
- Memory search matches JSON-escaped text; Memory stats are cheaper on large databases.
- `start-workbench.ps1` writes UTF-8 when its output is redirected, so piped or logged status lines are readable on zh-CN Windows.

## [2.1.1] - 2026-10-17

### Fixed
- LLM JSON parsing strips ``` code fences and extracts the first balanced `{...}` object; unparseable or empty content is re-asked exactly once, with a correction turn.
- LLM requests retry transient network errors (`fetch failed`, `terminated`, connection resets) and HTTP 429/5xx up to 2 times with exponential backoff (`AGENTMEM_LLM_RETRY_BASE_MS`, default 1000). Other 4xx and per-attempt timeouts are never retried.
- The per-event summarizer now uses the shared LLM client (removes a duplicate request/parse path).
- Missing or non-array LLM list fields (`facts`, `concepts`, `files_read`, `files_modified`) are treated as `[]` and logged.
- Worker startup waits up to ~10 s (`AGENTMEM_DB_INIT_RETRY_MS`) when SQLite reports `database is locked`.
- Hook autostart does not spawn a second worker when `worker.pid` names a live process that `worker-status.json` reports as running.
- Every line written to `worker.err.log` is prefixed with an ISO timestamp.

## [2.1.0] - 2026-10-17

Upgrade note: back up the AgentMemory DB before upgrading. Schema migrations are additive and run automatically on first start, but the `tool_evidence` table rebuild is one-way.

### Added
- Rule-based event routing before any LLM spend (whole tool classes filtered by name).
- Task-level consolidation: task event buffer, results, attempts and completions; duplicate flags and content hashes.
- Review tracking (`review_reads`, `review_runs`) so the daily review never re-reads processed work, with checkpoint support.
- New MCP tool `get_work_overview`; work-details responses return structured `project_path`, `agent_id`, `created_at` and a bounded title, including continuations and `detail_required` stubs.
- Legacy observations shown as paged title stubs; daily digests as routing clues; `/admin/api/work-digest`.
- `compact-legacy --since/--until` to segment long legacy sessions (additive, idempotent).
- Optional LLM output budgets (`AGENTMEM_OUTPUT_BUDGET_ENABLED`, `AGENTMEM_OBSERVATION_MAX_TOKENS`, `AGENTMEM_DIGEST_MAX_TOKENS`) and LLM usage recording.

### Changed
- `.env` parsing now uses dotenv consistently at startup and in the admin API (JSON-quoted values handled the same way).

### Compatibility
- No MCP tools, CLI commands or hook entry points were removed or renamed; existing `.env` files keep working.
- Required by the Vault daily-review skill (Vault #6b).