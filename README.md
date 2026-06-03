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
Run the installer to automatically configure settings for **Claude Code**, **OpenCode**, and **Codex**:
```bash
agentmem install
```

---

### 💻 Command Reference

Run these commands globally from any directory:

*   **Start Worker**: `agentmem start` (launches the memory worker service; keep the terminal open while it is running)
*   **Stop Worker**: `agentmem stop` (sends a graceful shutdown trigger to the local worker)
*   **Check Status**: `agentmem status` (verifies if the port `38888` is active)
*   **Run Setup**: `agentmem install` (updates Claude Code, OpenCode, and Codex settings configurations)

---

### 🧭 Admin Console

After the worker is running, open:

```text
http://127.0.0.1:38888/admin
```

The admin console is intentionally restricted to loopback clients. It is not exposed to non-local network addresses.

The page provides:

*   **Overview cards** for total observations, sessions, projects, and agents
*   **Global runtime toggles** for `readEnabled` and `writeEnabled`
*   **Filterable ledger view** across the whole database by project, agent, and free-text query
*   **Observation detail panel** showing narrative, facts, concepts, files read, and files modified

#### Structured state and context view

AgentMemory now separates two memory layers:

*   **Observations** remain the append-only historical ledger used for hybrid search and detailed recall.
*   **State facts** store explicit current or historical truth with `effective_at`, `recorded_at`, and `superseded_at`.

New interfaces in this first cut:

*   `GET /context?project_path=&limit=` returns a `ProjectContextView` object instead of a raw observation array.
*   `GET /state?project_path=&entity_type=&entity_key=&fact_key=&as_of=` reads current or historical structured state.
*   `POST /state` explicitly writes a structured state fact.
*   MCP tools: `get_memory_state`, `set_memory_state`

`ProjectContextView` combines:

*   `current_state`
*   `summary_blocks`
*   `recent_observations`
*   `generated_at`

Structured state is **explicit-write only** in this phase. Observations, hook logs, and LLM summaries do not automatically promote themselves into the state layer.

#### Runtime policy semantics

*   `readEnabled=false` blocks memory restoration and explicit read APIs:
    *   HTTP: `/context`, `/search`, `/state`
    *   MCP: `search_memory`, `memory_timeline`, `get_memory_details`, `get_memory_state`
    *   Session-start hooks stop printing restored memory into the agent session
*   `writeEnabled=false` blocks new memory creation:
    *   HTTP: `/tools`, `/sessions`, `/sessions/close`, `/state`
    *   MCP: `record_memory`, `set_memory_state`
    *   Post-tool hooks stop producing new observations

Both flags are stored in SQLite `app_settings`, so the selected policy survives worker restarts.

#### Operating workflow

1. Start the worker with `agentmem start`
2. Open `http://127.0.0.1:38888/admin`
3. Use the `Read Memory` and `Write Memory` switches to change runtime policy
4. Watch the observation counters and ledger entries to confirm whether new memory is still being read or recorded
5. Use `agentmem status` to confirm the worker is still reachable, and `agentmem stop` when finished

---

### 🔌 Agent Integration Specifications

#### 1. OpenCode (`~/.config/opencode/opencode.jsonc`)
Add `agentmem` to the `mcp` server config and append the native bridge plugin to the `plugin` array:
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
Expose memory tools inside the active Antigravity CLI MCP registry. On this machine, the validated registration path is the plugin MCP config under the Gemini-compatible config root.

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
