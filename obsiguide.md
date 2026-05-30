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
- Completed full implementation of database service, background worker, MCP server, hooks, and CLI installer.
- Migrated database driver to WebAssembly-based `node-sqlite3-wasm` to bypass Windows compilation issues.
- Verified FTS5 and vector similarity scoring with a local scratch test.
- Automatically registered hooks and MCP configuration in Claude Code and OpenCode settings.
- Staged and committed all code to Git.

## Verified Commands
<!-- AGENT-MAINTAINED: update during work -->
- `git init`: Initializes git repository.
- `git add <files>`: Stages files.
- `git commit -m "<msg>"`: Commits staged files.
- `npm run build`: Compiles TypeScript.
- `node dist/bin/cli.js install`: Installs configuration hooks and servers.
- `npx ts-node scratch/test-db.ts`: Runs database validation test.

## Known Constraints
<!-- AGENT-MAINTAINED: update during work -->

## Open Questions
<!-- AGENT-MAINTAINED: update during work -->
- None (All design and development tasks completed).

## Latest Durable Changes
<!-- AGENT-MAINTAINED: update during work -->
- Implemented and committed all AgentVault codebase files to Git.
- Created [walkthrough.md](file:///C:/Users/Admin/.gemini/antigravity-cli/brain/17450e12-ec79-4e78-b58e-e445581fe52e/walkthrough.md) report.

## Next Action
<!-- AGENT-MAINTAINED: update during work -->
- Hand over to the user for production usage.

## Last Sync
<!-- AGENT-MAINTAINED: update during work -->
- date: 2026-05-30
- status: Completed Development & Git Commit
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentVault.md
