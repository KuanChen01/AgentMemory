# Changelog

## [2.1.1] - 2026-10-17

### Fixed
- LLM JSON parsing strips ``` code fences and extracts the first balanced `{...}` object; unparseable or empty content is re-asked exactly once.
- LLM requests retry transient network errors (`fetch failed`, `terminated`, resets, timeouts) and HTTP 429/5xx up to 2 times with exponential backoff (`AGENTMEM_LLM_RETRY_BASE_MS`, default 1000). 4xx is never retried.
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