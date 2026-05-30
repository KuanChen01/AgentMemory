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
Run the installer to automatically configure settings for **Claude Code** and **OpenCode**:
```bash
agentmem install
```

---

### 💻 Command Reference

Run these commands globally from any directory:

*   **Start Daemon**: `agentmem start` (launches the background memory consumer service)
*   **Stop Daemon**: `agentmem stop` (sends a graceful shutdown trigger to the daemon)
*   **Check Status**: `agentmem status` (verifies if the port `38888` is active)
*   **Run Setup**: `agentmem install` (updates Claude Code and OpenCode settings configurations)

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

#### 2. Claude Code (`~/.claude/settings.json`)
Registers stdio MCP tool definitions and workspace lifecycle hooks:
```json
{
  "mcpServers": {
    "agentmem": {
      "command": "node",
      "args": ["path/to/AgentMemory/dist/servers/mcp-server.js"]
    }
  },
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

#### 3. Codex (`~/.codex/config.toml`)
Expose tools globally inside the Codex environment config:
```toml
[mcp_servers.agentmem]
command = "node"
args = [ "path/to/AgentMemory/dist/servers/mcp-server.js" ]
```

#### 4. Antigravity CLI
Expose memory tools inside your configured plugin's `mcp_config.json`:
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

---

### 📄 License
Apache-2.0 License
