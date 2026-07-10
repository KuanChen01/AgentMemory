# obsiguide.md

## Repo Identity
- repo_path:
- repo_kind:
- primary_stack:

## Obsidian Target
- vault_path:
- project_note:
- entry:
- areas:
- domain:

## Sync Rules
- project_contract:
  - `obsiguide.md` is the only project-level Obsidian sync contract for this workspace.
  - Do not create or rely on repo-root `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` as project sync contracts.
- memory_boundary:
  - `agentmem` is working memory for session recovery across agents and threads.
  - `vault_path` is the durable Obsidian knowledge base, not a raw session-log sink.
  - Treat `agentmem` search, timeline, and startup context results as unverified until checked against current repo evidence, this `obsiguide.md`, or existing vault notes.
  - Do not copy raw `agentmem` summaries or session recaps directly into vault notes.
  - Record concise session outcomes to `agentmem` at finish; promote durable knowledge to the vault only when this contract says to do so.
- note_language_contract:
  - Filenames, H1 titles, section titles, frontmatter keys, controlled values, tags, and Dataview syntax stay in English.
  - Narrative body content in vault notes stays in Chinese.
  - Repo names, tool names, commands, paths, config keys, versions, and raw error text stay in the original form.
- daily_contract:
  - Daily notes use `## Focus`, `## Summary`, and `## Project Ledger`.
  - Project-specific daily entries go under `### [[Project Note]]`.
- write_obsidian_when:
  - reusable issue
  - stable decision
  - cross-project knowledge
  - clear project state change
  - verified experiment result
- keep_local_only_when:
  - current goal or next action
  - temporary working context
  - open questions without durable conclusions
- do_not_record:
  - speculative conclusions
  - noisy intermediate steps
  - low-value activity logs
  - raw logs without conclusions

## Current Goal
- 

## Current State
- 

## Verified Commands
- 

## Known Constraints
- 

## Open Questions
- Fill all blank identity and vault mapping fields from verified local evidence before normal repo work.

## Latest Durable Changes
- 

## Next Action
- 

## Last Sync
- 
