# Changelog

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