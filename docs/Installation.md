# Installation

🌐 English | [中文](./Installation.zh.md)

Everything the [README](../README.md) quick start leaves out: the Windows bootstrap step by step, setting up the LLM, opening the workbench, other platforms, options and what the installer changes on your machine.

## Requirements

- Windows 10/11 is the primary, most tested platform. macOS and Linux are available but lightly tested; the one-command bootstrap is Windows only.
- [Node.js](https://nodejs.org/) 22 or newer (24 recommended) and Git
- On Windows: Windows PowerShell 5.1 or PowerShell 7
- Platforms without a prebuilt native SQLite binary need native build tools
- An OpenAI-compatible LLM endpoint (a cloud provider or a local runtime) and, if it needs one, an API key

## Windows: one command

```powershell
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
.\bootstrap-second-machine.cmd
```

The bootstrap script:

1. Runs `npm install --ignore-scripts` and `npm run build`.
2. Creates or updates `%USERPROFILE%\.agentmem\.env`. On a first run the file does not exist yet: bootstrap writes a scaffold with an empty key and **stops with a message**. Fill in the three `AGENTMEM_LLM_*` values (see [Set up the LLM](#set-up-the-llm)) and run the same command again. On later runs bootstrap only sets the key, URL, model and port, in place; every other line is kept. Before changing the file it saves the previous version as `.env.bak-<timestamp>` next to it (reported as `envBackupPath`).
3. Runs `npm link --ignore-scripts` so the global `agentmem` command works.
4. Configures all five agents in strict mode (see [What the installer sets up](#what-the-installer-sets-up)).
5. Reuses a running worker or starts one, and opens the workbench.

You can skip the stop-and-rerun step by passing the LLM settings directly:

```powershell
.\bootstrap-second-machine.cmd -ApiKey <key> -ApiUrl <openai-compatible-url> -Model <model>
```

Other parameters: `-NoOpen` (don't open the browser), `-Port <n>` (worker port, default 38888, written to `~/.agentmem/.env`) and `-AntigravityConfig <path>` (an extra Antigravity MCP registry to check and de-duplicate).

Bootstrap is strict: if one of the five agents cannot be configured on this machine, it stops and lists the problem. To connect only what is available, use `agentmem install` without `--strict` instead (it configures what it can and reports the rest).

Restart your agents afterwards so they pick up the new hooks and MCP server. A step-by-step Chinese walkthrough lives in [Second Machine Bootstrap Guide](./Second%20Machine%20Bootstrap%20Guide.zh.md).

## Set up the LLM

The background worker sends tool events to an OpenAI-compatible chat endpoint to turn them into memories and daily digests. Settings live in `~/.agentmem/.env`, never in the repository:

```env
AGENTMEM_LLM_API_KEY=your_api_key_here
AGENTMEM_LLM_API_URL=https://your-llm-endpoint.example/v1
AGENTMEM_LLM_MODEL=your-model-name

# Optional: set to true if the endpoint does not support JSON mode
AGENTMEM_LLM_DISABLE_JSON_MODE=false

# Optional: extra JSON headers some gateways require
# AGENTMEM_LLM_HEADERS={"X-Custom-Auth":"value"}

AGENTMEM_PORT=38888
```

Once the worker is running, open **LLM Settings** in the workbench to switch the model or endpoint, keep or replace the key and run a live connection test. Changes are saved to the same `.env` file. See the [full reference](./Reference.md) for every setting and the [LLM cost controls](./LLM%20Cost%20Controls.md).

## Network note

The worker listens on `127.0.0.1` only, and every endpoint (agent memory reads and writes, `/shutdown` and the admin workbench) rejects requests that do not come from this machine. Other computers, containers and VMs on your network cannot reach it, and there is no setting to expose it, because the worker has no authentication.

## Open the workbench

```powershell
.\start-workbench.cmd           # menu: Start / Stop / Restart / Status / Open Admin
.\start-workbench.cmd start     # start if needed and open the browser
npm run workbench               # same as above
```

Then browse to <http://127.0.0.1:38888/admin>. The launcher defaults to port 38888; if you changed the port, pass it with `.\start-workbench.cmd start --port <n>`.

## macOS and Linux (lightly tested)

```bash
git clone https://github.com/KuanChen01/AgentMemory.git && cd AgentMemory
npm install && npm run build
npm link --ignore-scripts       # registers the global `agentmem` command
agentmem install                # configures the five agents
agentmem start                  # foreground worker; agent hooks also start it on demand
```

Set the LLM in `~/.agentmem/.env` or in the workbench's **LLM Settings** at <http://127.0.0.1:38888/admin>.

## Installer options

```bash
agentmem install                                # configure all five agents, report any that fail
agentmem install --strict                       # fail if any agent cannot be configured
agentmem install --no-claude-capture            # Claude Code without automatic tool capture
agentmem bootstrap-win --api-key <key> --api-url <openai-compatible-url> --model <model>
```

| Flag | Meaning |
| --- | --- |
| `--strict` | Fail if any of the five agents cannot be configured |
| `--claude-capture` / `--no-claude-capture` | Turn Claude Code's automatic tool capture on or off |
| `--antigravity-config <path>` | An extra Antigravity MCP registry to check and de-duplicate |
| `--api-key`, `--api-url`, `--model` | LLM settings for `bootstrap-win` |
| `--no-open`, `--port <n>` | `bootstrap-win`: don't open the browser; use another worker port |

## Uninstall

```bash
agentmem uninstall --strict             # remove AgentMemory's hooks, MCP entries and plugin files
agentmem uninstall --strict --purge-all # also remove retained install state and backups
```

Uninstall also removes `~/.agentmem/.env` and the local memory database (`~/.agentmem/agentmemory.db`). To keep your memories, first stop the worker (`agentmem stop`) and close every agent that uses AgentMemory, then copy the database together with any `-wal`, `-shm` and `-journal` files next to it. Copying only the `.db` file while AgentMemory is running can miss recent memories. The [Native SQLite migration](./Native%20SQLite%20Migration.md) guide describes the same cold backup.

## What the installer sets up

| Agent | What the installer sets up |
| --- | --- |
| Claude Code | MCP server in `~/.claude.json`; SessionStart and optional PostToolUse hooks in `~/.claude/settings.json` |
| Codex (ChatGPT desktop / Codex CLI) | MCP server in `~/.codex/config.toml`; SessionStart, UserPromptSubmit and PostToolUse hooks in `~/.codex/hooks.json` |
| Antigravity | One MCP registration in `~/.gemini/config/mcp_config.json`; a hooks plugin activated with `agy plugin install` |
| OpenCode | MCP server, bridge plugin and global rules under `~/.config/opencode/` |
| Grok | MCP server, `agentmem` profile and lifecycle hooks under `~/.grok/` |

Every change is backup-first and merge-only: AgentMemory edits just its own entries and records them in `~/.agentmem/install-state.json` so `uninstall` can restore them.

## How the pieces fit

Hooks send tool events to a small background worker, which summarizes them with your chosen LLM and stores them in a local SQLite database with full-text and vector search. Agents read memory back through the stdio MCP server and their session-start hooks. Everything fails open: if the worker is down, your agent keeps working. See the [full reference](./Reference.md) for configuration, the CLI, admin APIs and per-agent details.

## Screenshots

The README screenshots come from a disposable demo instance filled with made-up data.
