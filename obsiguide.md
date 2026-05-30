# obsiguide.md

## Repo Identity
<!-- USER-OWNED: keep short -->
- repo_path: E:\Kuan\Projects\Codex\AgentVault
- repo_kind: OpenCode Memory Adapter / System
- primary_stack: Python / Node.js / MCP

## Obsidian Target
<!-- USER-OWNED: keep short -->
- vault_path: E:\Kuan\Vault
- project_note: E:\Kuan\Vault\02_Projects\AgentVault.md
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
- Build and verify the Universal Agent Memory (AgentVault) system for OpenCode, Claude Code, Codex, and Antigravity.

## Current State
<!-- AGENT-MAINTAINED: update during work -->
- Resolved OpenCode startup crash by using a native plugin `agentvault-plugin.mjs` loaded via `opencode.jsonc` instead of raw static root fields in `opencode.json`.
- Configured Antigravity CLI MCP server registration inside the active plugin config `local-game-mcps/mcp_config.json`.
- Formatted the Obsidian project note `AgentVault.md` to match the exact project card template.
- Verified MCP server `tools/list` JSON-RPC response over STDIO and confirmed background daemon status is ACTIVE.
- Refactored dotenv loader globally to read from `C:\Users\Admin\.agentvault\.env` and removed local `.env` from source repository to protect privacy.
- Registered the `agentvault` MCP server inside the global Codex config (`C:\Users\Admin\.codex\config.toml`).

## Verified Commands
<!-- AGENT-MAINTAINED: update during work -->
- `git init`: Initializes git repository.
- `git add <files>`: Stages files.
- `git commit -m "<msg>"`: Commits staged files.
- `npm run build`: Compiles TypeScript.
- `node dist/bin/cli.js install`: Installs configuration hooks and servers.
- `npx ts-node scratch/test-db.ts`: Runs database validation test.
- `npx ts-node scratch/test-mcp.ts`: Runs MCP server JSON-RPC test.
- `node dist/bin/cli.js start`: Starts the background memory daemon.
- `node dist/bin/cli.js status`: Verifies memory daemon status.

## Known Constraints
<!-- AGENT-MAINTAINED: update during work -->

## Open Questions
<!-- AGENT-MAINTAINED: update during work -->
- None.

## Latest Durable Changes
<!-- AGENT-MAINTAINED: update during work -->
- Registered MCP server for Antigravity at `C:\Users\Admin\.gemini\config\plugins\local-game-mcps\mcp_config.json`.
- Created native OpenCode plugin `agentvault-plugin.mjs` and registered in `opencode.jsonc`.
- Restructured `E:\Kuan\Vault\02_Projects\AgentVault.md` project card.
- Implemented global configuration directory `.env` loading, removing local config from source repo.
- Registered MCP server for Codex at `C:\Users\Admin\.codex\config.toml`.

## Next Action
<!-- AGENT-MAINTAINED: update during work -->
- Hand over to the user to test memory capture across OpenCode, Claude Code, Codex, and Antigravity.

## Last Sync
<!-- AGENT-MAINTAINED: update during work -->
- date: 2026-05-30
- status: Completed Bug Fixes, Agent Registrations & Env Global Refactor
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentVault.md
