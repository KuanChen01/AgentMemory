# AgentMemory 🛡️

🌐 [中文版](./README.zh.md) | English

---

AgentMemory is a compilation-free, lightweight, and universal persistent memory system (Universal Agent Memory - UAM). It allows multiple developer agents (such as **Claude Code**, **OpenCode**, **Codex**, and **Antigravity CLI**) to share, record, and query context observations and decisions across different workspaces.

### 🌟 Features

*   **Cross-Agent Memory Sharing**: Shares historical session facts, architectural decisions, and bug-fixing notes across different development assistants.
*   **Compilation-Free & Lightweight**: Built with a pure JavaScript in-memory Feature Hashing Vectorizer and WebAssembly SQLite (`node-sqlite3-wasm`), bypassing complex C++ native compiler dependencies (`node-gyp`).
*   **Hybrid Search**: Combines SQLite FTS5 BM25 keyword matching with Cosine Similarity vector retrieval for highly relevant results.
*   **Background Summarization**: Uses the DeepSeek Flash API to summarize session tool logs asynchronously in the background.
*   **Secure Global Config**: Stores API keys and settings globally (`~/.agentmem/.env`) to keep codebase repositories clean and credentials safe.
*   **Loopback Admin Console**: Exposes a local-only `/admin` page for inspecting the database, filtering observations, and toggling global memory read/write gates at runtime.
*   **Persistent Runtime Policy**: Persists `readEnabled` and `writeEnabled` flags in SQLite so runtime gating survives worker restarts.

---

### 🏗️ Architecture

```mermaid
graph TD
    subgraph Clients [Developer Assistants]
        CC[Claude Code]
        OC[OpenCode]
        CX[Codex]
        AG[Antigravity CLI]
    end

    subgraph AgentMemory Core [AgentMemory System]
        CLI[Global CLI Wrapper]
        Worker[Background HTTP Worker Port 38888]
        MCP[Stdio MCP Server]
        DB[(WASM SQLite + FTS5)]
    end

    CC -- Stdio MCP / Hooks --> MCP
    OC -- Stdio MCP / ESM Plugin --> MCP
    CX -- Stdio MCP --> MCP
    AG -- Stdio MCP --> MCP

    CC -- Post-Tool Event --> Worker
    OC -- Post-Tool Event --> Worker

    Worker -- Async Summarization --> LLM[DeepSeek Flash API]
    Worker -- Write Obs --> DB
    MCP -- Query / Write --> DB
```

---

### 🚀 Getting Started

#### 1. Prerequisites
*   Node.js (v18+)

#### 2. Installation
Clone the repository and build the distribution files:
```bash
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
npm install
npm run build
```

Link the executable globally to register the `agentmem` CLI:
```bash
npm link
```

#### 3. Configuration
Set up your global configuration file in your user home directory:

**File Path**: `~/.agentmem/.env` (Create parent directory `.agentmem` if it doesn't exist)
```env
# General LLM credentials (supports OpenAI, DeepSeek, Mimo, Ark, local Ollama, etc.)
AGENTMEM_LLM_API_KEY=your_api_key_here
AGENTMEM_LLM_API_URL=https://api.deepseek.com/v1
AGENTMEM_LLM_MODEL=deepseek-chat

# Optional: Set to true if your proxy platform doesn't support JSON Mode parameters
AGENTMEM_LLM_DISABLE_JSON_MODE=false

# Optional: Custom JSON headers required by your proxy pools or gateway (e.g. Volcengine Ark)
# AGENTMEM_LLM_HEADERS={"X-Custom-Auth":"value"}

# Local service port
AGENTMEM_PORT=38888
```

#### 4. Automatic Agent Registration
Run the installer to automatically configure settings for **Claude Code**, **OpenCode**, **Codex**, and **Antigravity**:
```bash
agentmem install
```

If you want the command to fail whenever any one of the four agents cannot be configured, use:
```bash
agentmem install --strict
```

The installer is now backup-first and merge-first:

- It stores install state in `~/.agentmem/install-state.json`
- It keeps pristine baselines under `~/.agentmem/backups/` when available
- It merges only AgentMemory-owned hooks / MCP entries instead of replacing whole hook arrays

To remove AgentMemory from the current machine without deleting the repo checkout, use:
```bash
agentmem uninstall --strict
```

Add `--purge-all` if you also want to remove the retained install-state and backup artifacts after cleanup.

For a second Windows machine, use the dedicated bootstrap entry instead of repeating the setup manually:
```powershell
.\bootstrap-second-machine.cmd
```

Detailed Chinese walkthrough: [docs/Second Machine Bootstrap Guide.zh.md](./docs/Second%20Machine%20Bootstrap%20Guide.zh.md)

---

### 💻 Command Reference

Run these commands globally from any directory:

*   **Start Worker**: `agentmem start` (launches the memory worker service; keep the terminal open while it is running)
*   **Stop Worker**: `agentmem stop` (sends a graceful shutdown trigger to the local worker)
*   **Check Status**: `agentmem status` (verifies if the port `38888` is active)
*   **Print Version**: `agentmem version`
*   **Run Setup**: `agentmem install` (updates Claude Code, OpenCode, Codex, and Antigravity settings)
*   **Strict Setup**: `agentmem install --strict` (fails if any one of the four agents cannot be configured)
*   **Uninstall Local Integration**: `agentmem uninstall --strict` (removes AgentMemory-managed hooks, MCP entries, plugin artifacts, `.env`, and database files from the current machine)
*   **Purge Local Install State**: `agentmem uninstall --strict --purge-all` (also removes retained backup and install-state artifacts)
*   **Second-Machine Bootstrap**: `agentmem bootstrap-win --strict` or `bootstrap-second-machine.cmd`
*   **Release Manifest**: `agentmem release-manifest --json` (prints the machine-readable release policy and current version)
*   **Release Plan**: `npm run release:plan -- --next patch|minor|major` (prints the manual release checklist for the next version)
*   **Release Bump**: `npm run release:bump -- --next patch|minor|major` (updates the root package version metadata before a release commit)

### 🪟 Windows Bootstrap

For a same-shape second Windows machine, the recommended path is:

```powershell
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
.\bootstrap-second-machine.cmd
```

The bootstrap script runs `npm install`, `npm run build`, creates or validates `%USERPROFILE%\.agentmem\.env`, runs `npm link`, configures all four agents, probes or starts the worker, and opens `/admin`.

If `%USERPROFILE%\.agentmem\.env` is missing, bootstrap writes a blank scaffold and stops with an actionable error. Fill the `AGENTMEM_LLM_*` values, then rerun the command.

### 📦 Release Discipline

AgentMemory now treats product releases as a first-class maintainer workflow:

*   Official releases are published from `master` only.
*   Versioning is strict `SemVer` with tags shaped like `v1.2.3`.
*   The current v1 distribution channel is **GitHub Release + default source archives**.
*   Release metadata is exposed through the CLI (`agentmem release-manifest`) and `/admin/api/overview`, and `/admin/api/release-check` now compares the current checkout against the latest published GitHub Release.

Detailed maintainer workflow: [docs/Release Process.md](./docs/Release%20Process.md)

---

### 🧭 Admin Console

After the worker is running, open:

```text
http://127.0.0.1:38888/admin
```

The admin console is intentionally restricted to loopback clients. It is not exposed to non-local network addresses.

For a one-click local launch on Windows, use either:

*   `npm run workbench`
*   `start-workbench.cmd`

Both paths build the repo, probe `http://127.0.0.1:38888/admin/api/overview`, reuse an already-running worker when possible, otherwise start `node dist/services/worker.js`, wait for readiness, and open `/admin`.

The page provides:

*   **Runtime** for global `readEnabled` / `writeEnabled` control, project inventory, workbench posture, and a read-only GitHub Release update check with manual upgrade guidance
*   **LLM Settings** for switching `AGENTMEM_LLM_MODEL`, updating the OpenAI-compatible API base URL, preserving or replacing the API key, and running a live connection test
*   **Project Context** for the current `ProjectContextView`, rendered startup text, and payload / summary health metrics
*   **State Lab** for explicit structured state reads and writes
*   **Search Diagnostics** for raw hybrid search scores (`hybrid_score`, `fts_score`, `vector_score`) and low-signal title visibility
*   **Observation Ledger** for filterable observation browsing and detailed drill-down

#### Structured state and context view

AgentMemory now separates two memory layers:

*   **Observations** remain the append-only historical ledger used for hybrid search and detailed recall.
*   **State facts** store explicit current or historical truth with `effective_at`, `recorded_at`, and `superseded_at`.

New interfaces in this first cut:

*   `GET /context?project_path=&limit=` returns a `ProjectContextView` object instead of a raw observation array.
*   `GET /state?project_path=&entity_type=&entity_key=&fact_key=&as_of=` reads current or historical structured state.
*   `POST /state` explicitly writes a structured state fact.
*   MCP tools: `get_project_context`, `get_memory_state`, `set_memory_state`

`ProjectContextView` combines:

*   `current_state`
*   `summary_blocks` built from curated recent observations with low-signal titles filtered out and duplicate titles collapsed
*   `recent_observations` as a slim startup-oriented metadata list (`id`, `title`, `created_at`, `agent_id`) without full narratives or embeddings
*   `generated_at`

Structured state is **explicit-write only** in this phase. Observations, hook logs, and LLM summaries do not automatically promote themselves into the state layer.

#### Admin-only diagnostics APIs

The workbench also exposes loopback-only admin APIs for the UI:

*   `GET /admin/api/context?project_path=&limit=` returns:
    *   `view`: raw `ProjectContextView`
    *   `rendered`: the same text block produced by `renderProjectContextView(view)`
    *   `metrics`: `payloadBytes`, `summaryCount`, `lowSignalCount`, `duplicateTitleCount`
*   `GET /admin/api/state?project_path=&entity_type=&entity_key=&fact_key=&as_of=` reads structured state for the workbench
*   `POST /admin/api/state` explicitly writes a structured state fact from the workbench
*   `POST /admin/api/search` returns raw hybrid search diagnostics for the current project without changing the ranking algorithm
*   `GET /admin/api/release-check` compares the current checkout against the latest published GitHub Release and returns manual upgrade guidance for either git checkouts or source archives
*   `GET /admin/api/llm-config` returns a sanitized LLM config snapshot without exposing the full API key
*   `POST /admin/api/llm-config` persists model, API URL, JSON-mode, headers, and optional API key changes to `~/.agentmem/.env` and updates the running worker process
*   `POST /admin/api/llm-test` sends a small OpenAI-compatible `chat/completions` request with the current form values and returns pass/fail diagnostics

#### Runtime policy semantics

*   `readEnabled=false` blocks memory restoration and explicit read APIs:
    *   HTTP: `/context`, `/search`, `/state`
    *   MCP: `get_project_context`, `search_memory`, `memory_timeline`, `get_memory_details`, `get_memory_state`
    *   Session-start hooks stop printing restored memory into the agent session
*   `writeEnabled=false` blocks new memory creation:
    *   HTTP: `/tools`, `/sessions`, `/sessions/close`, `/state`
    *   MCP: `record_memory`, `set_memory_state`
    *   Post-tool hooks stop producing new observations

Both flags are stored in SQLite `app_settings`, so the selected policy survives worker restarts.

#### Operating workflow

1. Start the workbench with `npm run workbench`, `start-workbench.cmd`, or start the worker manually with `agentmem start`
2. Open `http://127.0.0.1:38888/admin`
3. Use the `Read Memory` and `Write Memory` switches to change runtime policy
4. Use the Runtime release card to compare the current checkout with the latest GitHub Release and choose the recommended manual upgrade path
5. Use `LLM Settings` to switch models or endpoints, save the env-file change, and test the connection before the next summary job
6. Use `Project Context`, `State Lab`, and `Search Diagnostics` to inspect startup context quality, structured state, and current hybrid ranking behavior
7. Use `Observation Ledger` to drill into the raw observation history when needed
8. Use `agentmem status` to confirm the worker is still reachable, and `agentmem stop` when finished

---

### 🔌 Agent Integration Specifications

#### 1. OpenCode (`~/.config/opencode/opencode.jsonc`)
`agentmem install` now writes both the `mcp.agentmem` block and the generated bridge plugin `%USERPROFILE%/.config/opencode/plugins/agentmem-plugin.mjs`. The resulting config shape is:
```jsonc
{
  "mcp": {
    "agentmem": {
      "type": "local",
      "command": ["node", "path/to/AgentMemory/dist/servers/mcp-server.js"],
      "enabled": true
    }
  },
  "plugin": [
    "file:///C:/Users/YourUsername/.config/opencode/plugins/agentmem-plugin.mjs"
  ]
}
```

#### 2. Claude Code
Claude Code uses two different files:

*   `~/.claude.json` for global stdio MCP servers
*   `~/.claude/settings.json` for hooks and other session settings

**`~/.claude.json`**
```json
{
  "mcpServers": {
    "agentmem": {
      "type": "stdio",
      "command": "node",
      "args": ["path/to/AgentMemory/dist/servers/mcp-server.js"],
      "env": {}
    }
  }
}
```

**`~/.claude/settings.json`**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"path/to/AgentMemory/dist/hooks/claude-session-start.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"path/to/AgentMemory/dist/hooks/claude-post-tool.js\"" }]
      }
    ]
  }
}
```

#### 3. Codex (`~/.codex/config.toml` and `~/.codex/hooks.json`)
Expose the MCP server in `config.toml`, and register lifecycle hooks in `hooks.json`:

**`~/.codex/config.toml`**
```toml
[features]
hooks = true

[mcp_servers.agentmem]
command = "node"
args = [ "path/to/AgentMemory/dist/servers/mcp-server.js" ]
```

**`~/.codex/hooks.json`**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"path/to/AgentMemory/dist/hooks/codex-session-start.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"path/to/AgentMemory/dist/hooks/codex-post-tool.js\"" }]
      }
    ]
  }
}
```

#### 4. Antigravity CLI
`agentmem install` now also updates the active Antigravity MCP registry. On this machine, the validated registration path is the plugin MCP config under the Gemini-compatible config root. If your second machine keeps that registry somewhere else, pass:

```bash
agentmem install --strict --antigravity-config "C:\\path\\to\\mcp_config.json"
```

Generic shape:
```json
{
  "mcpServers": {
    "agentmem": {
      "command": "node",
      "args": ["path/to/AgentMemory/dist/servers/mcp-server.js"],
      "disabled": false
    }
  }
}
```

Preferred startup call for Antigravity (MCP-only, no session-start hook):

1. Call `get_project_context` with the current `project_path` and an optional `limit` to retrieve the same curated structured startup context that hook-backed agents render from `ProjectContextView`.
2. If you need more detail after startup, use `memory_timeline` or `search_memory` for drill-down.
3. If a timeline or search hit looks relevant, follow up with `get_memory_details` for the full narrative and file lists.

This keeps Antigravity aligned with the hook-backed agents while collapsing startup recovery into one MCP call.

### ✅ Smoke Validation Checklist

Use this when validating a live local installation:

1. Precheck: worker starts, `/admin` loads, and the current observation count is readable
2. `read on / write on`: previous memory is restored and a new observation can be recorded
3. `read off / write on`: restored memory disappears, explicit read tools return disabled messages, but new writes still succeed
4. `read on / write off`: memory can still be read, but new writes no longer increase the observation count
5. Restore defaults: turn both toggles back on and verify the persisted policy survives a worker restart

If a smoke check fails, fix only issues directly related to `/admin`, runtime policy gating, or the current agent integration path, then re-run `npm run build` and the affected `tests/*.test.cjs`.

---

### 📄 License
Apache-2.0 License
