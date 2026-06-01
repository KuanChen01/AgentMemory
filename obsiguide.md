# obsiguide.md

## Repo Identity
<!-- USER-OWNED: keep short -->
- repo_path: E:\Kuan\Projects\Codex\AgentMemory
- repo_kind: OpenCode Memory Adapter / System
- primary_stack: Python / Node.js / MCP

## Obsidian Target
<!-- USER-OWNED: keep short -->
- vault_path: E:\Kuan\Vault
- project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
- entry:
- areas:
- domain:

## Sync Rules
<!-- USER-OWNED: keep short -->
- write_obsidian_when:
  - reusable issue is confirmed
  - stable decision is made
  - cross-project knowledge is established
  - project state changes meaningfully
  - experiment result is verified
- keep_local_only_when:
  - current goal or current next action
  - repo-local working context
  - temporary open questions without durable answer yet
- do_not_record:
  - speculative conclusions
  - noisy intermediate steps
  - low-value recap
  - raw logs without takeaway
- finish_checklist:
  - update Current State
  - update Latest Durable Changes
  - update Next Action
  - update Last Sync
  - promote durable Issue, Decision, Knowledge, or Experiment notes into Obsidian when required

## Current Goal
<!-- AGENT-MAINTAINED: update during work -->
- Build and verify the Universal Agent Memory (AgentMemory) system for OpenCode, Claude Code, Codex, and Antigravity.

## Current State
<!-- AGENT-MAINTAINED: update during work -->
- Migrated the historical database from C:\Users\Admin\.agentvault\agentvault.db to C:\Users\Admin\.agentmem\agentmemory.db and converted project paths from AgentVault to AgentMemory.
- Configured Antigravity CLI, Codex, and OpenCode settings to point to the renamed AgentMemory workspace.
- Re-launched the background memory daemon and verified that historical observations (such as "Rename project to AgentMemory") are correctly queried.
- Successfully verified the Claude Code PostToolUse integration by running a print command task and observing it register a new summarized observation in the database.
- Resolved OpenCode startup crash by refactoring the installer script to write valid configurations to `opencode.jsonc` (using a character-by-character JSONC stripper to protect URLs like `file:///`) and automatically deleting the legacy incompatible `opencode.json`.

## Verified Commands
<!-- AGENT-MAINTAINED: update during work -->
- git init: Initializes git repository.
- git add <files>: Stages files.
- git commit -m "<msg>": Commits staged files.
- npm run build: Compiles TypeScript.
- node dist/bin/cli.js install: Installs configuration hooks and servers.
- npx ts-node scratch/test-db.ts: Runs database validation test.
- npx ts-node scratch/test-mcp.ts: Runs MCP server JSON-RPC test.
- node dist/bin/cli.js start: Starts the background memory daemon.
- node dist/bin/cli.js status: Verifies memory daemon status.
- npx ts-node scratch/migrate-db.ts: Migrates historical agentvault database to agentmemory database.
- npx ts-node scratch/test-search.ts: Validates hybrid search via daemon HTTP endpoint.

## Known Constraints
<!-- AGENT-MAINTAINED: update during work -->

## Open Questions
<!-- AGENT-MAINTAINED: update during work -->
- None.

## Latest Durable Changes
<!-- AGENT-MAINTAINED: update during work -->
- Migrated all database entries and updated paths to AgentMemory.
- Corrected Antigravity CLI, Codex, and OpenCode path configurations.
- Verified end-to-end Claude Code hook capture and LLM integration.
- Implemented robust character-level JSONC parser in `cli.ts` to configure `opencode.jsonc` and delete legacy `opencode.json`.

## Next Action
<!-- AGENT-MAINTAINED: update during work -->
- Complete handover to user for normal multi-agent operation using AgentMemory.

## Last Sync
<!-- AGENT-MAINTAINED: update during work -->
- date: 2026-06-01
- status: Fixed OpenCode startup crash by refactoring config parser, updating paths to AgentMemory, and removing incompatible legacy config files.
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
