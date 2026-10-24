# Changelog

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
  
  `activity` and `memory-detail` respect the memory read switch. The pipeline, projects and skills responses redact keys, emails and local paths from their free-text fields.
- `agentmem install --claude-capture` / `--no-claude-capture` choose whether the Claude Code `PostToolUse` capture hook is installed. With neither flag, the installer keeps the current choice: an existing managed setup without the hook stays without it, and a fresh install enables capture as before.

### Changed
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
- Admin `llm-test` redacts the effective API key (saved or typed) from every text field of its response and errors. Settings load and save can no longer race.
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