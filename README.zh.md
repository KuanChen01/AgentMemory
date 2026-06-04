# AgentMemory 🛡️

🌐 English | [中文版](./README.md)

---

AgentMemory 是一个免编译、轻量化的全局持久化智能体记忆系统 (Universal Agent Memory - UAM)。它支持多个主流 AI 辅助编程助理（如 **Claude Code**、**OpenCode**、**Codex**、**Antigravity CLI** 等）在不同工作区开发时共同读取和沉淀开发经验、技术决策和历史上下文。

### 🌟 核心特性

*   **跨 Agent 记忆共享**：允许不同的 AI 编码助理共享同一个项目的历史诊断事实、设计决策和排障记录。
*   **免编译与轻量化**：基于纯 JS 实现的 Feature Hashing 局部敏感向量编码和 WebAssembly 版本的 SQLite (`node-sqlite3-wasm`)，完美避开了复杂的 C++ 本地编译依赖（如 `node-gyp`）。
*   **混合检索检索**：集成 SQLite FTS5 的 BM25 全文关键字匹配与 Cosine Similarity 向量相似度算法，提供高相关的召回效果。
*   **异步后台摘要**：在后台队列中通过 DeepSeek Flash API 异步提炼繁杂的工具执行日志，最大化节省上下文 Token。
*   **全局配置隔离**：API Key 等敏感配置保存在全局用户路径 (`~/.agentmem/.env`) 下，确保源码仓库干净、密钥安全不泄漏。
*   **本地管理控制台**：提供仅 loopback 可访问的 `/admin` 页面，用于查看数据库、筛选 observation，并在运行时切换全局记忆读写开关。
*   **持久化运行时策略**：`readEnabled` 和 `writeEnabled` 会持久化到 SQLite，worker 重启后继续保持上次的策略状态。

---

### 🏗️ 系统架构

```mermaid
graph TD
    subgraph Clients [智能体客户端]
        CC[Claude Code]
        OC[OpenCode]
        CX[Codex]
        AG[Antigravity CLI]
    end

    subgraph AgentMemory Core [AgentMemory 系统核心]
        CLI[全局 CLI 工具]
        Worker[本地 Worker 服务 监听端口 38888]
        MCP[Stdio MCP 服务端]
        DB[(WASM SQLite + FTS5)]
    end

    CC -- Stdio MCP / Hooks --> MCP
    OC -- Stdio MCP / ESM Plugin --> MCP
    CX -- Stdio MCP --> MCP
    AG -- Stdio MCP --> MCP

    CC -- 拦截工具日志 --> Worker
    OC -- 拦截工具日志 --> Worker

    Worker -- 异步摘要提取 --> LLM[DeepSeek Flash API]
    Worker -- 写入观测记录 --> DB
    MCP -- 检索 / 写入 --> DB
```

---

### 🚀 快速上手

#### 1. 环境依赖
*   Node.js (v18+)

#### 2. 安装与构建
克隆本仓库并执行编译：
```bash
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
npm install
npm run build
```

全局注册快捷命令：
```bash
npm link
```

#### 3. 配置密钥
在您当前操作系统的**用户根目录**下创建配置目录与文件：

**配置文件路径**：`~/.agentmem/.env` (若 `.agentmem` 文件夹不存在请先手动创建)
```env
# 通用 LLM 接口凭证 (支持 OpenAI, DeepSeek, Mimo, 火山方舟, 本地 Ollama 等)
AGENTMEM_LLM_API_KEY=您的_api_key
AGENTMEM_LLM_API_URL=https://api.deepseek.com/v1
AGENTMEM_LLM_MODEL=deepseek-chat

# 可选：如果中转平台/网关不支持 JSON Mode 参数，设置为 true
AGENTMEM_LLM_DISABLE_JSON_MODE=false

# 可选：针对中转网关或订阅令牌池的自定义 JSON 请求头 (如火山引擎方舟)
# AGENTMEM_LLM_HEADERS={"X-Custom-Auth":"value"}

# 本地后台服务监听端口
AGENTMEM_PORT=38888
```

#### 4. 自动注册集成
运行内置的安装器，它会自动向 **Claude Code**、**OpenCode** 和 **Codex** 写入相应的 hooks 与 MCP 注册参数：
```bash
agentmem install
```

---

### 💻 常用命令

您可以在终端中的任何工作路径直接调用全局快捷命令：

*   **启动 Worker 服务**：`agentmem start`（前台运行；使用期间请保持这个终端窗口处于运行状态）
*   **停止后台服务**：`agentmem stop`
*   **查询运行状态**：`agentmem status`
*   **一键注册配置**：`agentmem install`（更新 Claude Code、OpenCode 和 Codex 的设置）

---

### 🧭 `/admin` 管理页

在 worker 运行后，打开：

```text
http://127.0.0.1:38888/admin
```

该页面仅允许本机 loopback 访问，不对非本机网络地址开放。

Windows 下一键启动可直接使用：

*   `npm run workbench`
*   `start-workbench.cmd`

这两个入口都会先构建仓库，再探测 `http://127.0.0.1:38888/admin/api/overview`；如果已有 worker 可复用就直接复用，否则后台拉起 `node dist/services/worker.js`，等待就绪后再打开 `/admin`。

管理页提供：

*   **Runtime**：管理全局 `readEnabled` / `writeEnabled`，并展示 project / agent 覆盖面
*   **Project Context**：查看当前 `ProjectContextView`、渲染后的 startup 文本，以及 payload / summary 健康度指标
*   **State Lab**：显式读取和写入 structured state
*   **Search Diagnostics**：直接查看 hybrid search 的 `hybrid_score`、`fts_score`、`vector_score` 和低信号标题标记
*   **Observation Ledger**：保留全库台账浏览和 observation 细节 drill-down

#### Structured state 与 context view

AgentMemory 现在把记忆拆成两层：

*   **Observations** 继续作为 append-only 的历史账本，用于 hybrid search 和细节回溯。
*   **State facts** 用来存储显式的当前/历史真相，并带有 `effective_at`、`recorded_at` 和 `superseded_at` 时间语义。

这一阶段新增的接口：

*   `GET /context?project_path=&limit=`：返回 `ProjectContextView` 对象，不再直接返回 observation 数组
*   `GET /state?project_path=&entity_type=&entity_key=&fact_key=&as_of=`：读取当前或历史结构化状态
*   `POST /state`：显式写入结构化状态
*   MCP 工具：`get_project_context`、`get_memory_state`、`set_memory_state`

`ProjectContextView` 当前包含：

*   `current_state`
*   `summary_blocks`：基于最近 observation 生成，但会过滤低信号标题并合并重复标题
*   `recent_observations`：面向 startup 的精简元数据列表，只保留 `id`、`title`、`created_at`、`agent_id`，不再附带完整 narrative 或 embedding
*   `generated_at`

这一阶段的 structured state 仍然是 **explicit-write only**：observation、hook 日志和 LLM 摘要不会自动晋升为 state。

#### Workbench 专用诊断 API

workbench 还会通过 loopback-only 的 admin API 驱动网页交互：

*   `GET /admin/api/context?project_path=&limit=`：返回
    *   `view`：原始 `ProjectContextView`
    *   `rendered`：与 `renderProjectContextView(view)` 一致的启动文本
    *   `metrics`：`payloadBytes`、`summaryCount`、`lowSignalCount`、`duplicateTitleCount`
*   `GET /admin/api/state?project_path=&entity_type=&entity_key=&fact_key=&as_of=`：供 workbench 读取 structured state
*   `POST /admin/api/state`：供 workbench 显式写入 structured state fact
*   `POST /admin/api/search`：返回当前 project 的 hybrid search 原始诊断分数，但不在这一步修改排序算法

#### 运行时策略语义

*   `readEnabled=false` 时，会阻断记忆恢复和显式读取接口：
    *   HTTP：`/context`、`/search`、`/state`
    *   MCP：`get_project_context`、`search_memory`、`memory_timeline`、`get_memory_details`、`get_memory_state`
    *   SessionStart hook 不再向 agent 启动上下文注入历史记忆
*   `writeEnabled=false` 时，会阻断新记忆写入：
    *   HTTP：`/tools`、`/sessions`、`/sessions/close`、`/state`
    *   MCP：`record_memory`、`set_memory_state`
    *   PostToolUse hook 不再生成新的 observation

这两个开关都保存在 SQLite `app_settings` 中，因此 worker 重启后会保留上次选中的策略。

#### 基本操作流程

1. 使用 `npm run workbench`、`start-workbench.cmd` 一键启动，或者手动运行 `agentmem start`
2. 打开 `http://127.0.0.1:38888/admin`
3. 通过 `Read Memory` / `Write Memory` 开关切换运行时策略
4. 在 `Project Context`、`State Lab`、`Search Diagnostics` 中检查 startup context 质量、structured state 和当前 hybrid ranking 行为
5. 如需深挖原始 observation，再切到 `Observation Ledger`
6. 使用 `agentmem status` 检查 worker 是否可达，完成后使用 `agentmem stop` 停止服务

---

### 🔌 智能体手动集成配置

#### 1. OpenCode 客户端 (`~/.config/opencode/opencode.jsonc`)
在 `mcp` 块中加入配置，并在 `plugin` 数组中添加对应的钩子插件文件协议地址：
```jsonc
{
  "mcp": {
    "agentmem": {
      "type": "local",
      "command": ["node", "您的开发路径/AgentMemory/dist/servers/mcp-server.js"],
      "enabled": true
    }
  },
  "plugin": [
    "file:///C:/Users/您的用户名/.config/opencode/plugins/agentmem-plugin.mjs"
  ]
}
```

#### 2. Claude Code 客户端
Claude Code 当前使用两份不同配置文件：

*   `~/.claude.json`：注册全局 stdio MCP server
*   `~/.claude/settings.json`：注册 hooks 和其他会话设置

**`~/.claude.json`**
```json
{
  "mcpServers": {
    "agentmem": {
      "type": "stdio",
      "command": "node",
      "args": ["您的开发路径/AgentMemory/dist/servers/mcp-server.js"],
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
        "hooks": [{ "type": "command", "command": "node \"您的开发路径/AgentMemory/dist/hooks/claude-session-start.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"您的开发路径/AgentMemory/dist/hooks/claude-post-tool.js\"" }]
      }
    ]
  }
}
```

#### 3. Codex 客户端（`~/.codex/config.toml` 与 `~/.codex/hooks.json`）
MCP server 注册在 `config.toml`，生命周期 hooks 注册在 `hooks.json`：

**`~/.codex/config.toml`**
```toml
[features]
hooks = true

[mcp_servers.agentmem]
command = "node"
args = [ "您的开发路径/AgentMemory/dist/servers/mcp-server.js" ]
```

**`~/.codex/hooks.json`**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"您的开发路径/AgentMemory/dist/hooks/codex-session-start.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node \"您的开发路径/AgentMemory/dist/hooks/codex-post-tool.js\"" }]
      }
    ]
  }
}
```

#### 4. Antigravity CLI
在当前生效的 Antigravity CLI MCP 注册表中暴露 `agentmem`。在这台机器上，实际验证通过的是 Gemini 兼容配置根目录下的插件 `mcp_config.json`。

通用结构如下：
```json
{
  "mcpServers": {
    "agentmem": {
      "command": "node",
      "args": ["您的开发路径/AgentMemory/dist/servers/mcp-server.js"],
      "disabled": false
    }
  }
}
```

推荐的 Antigravity 启动入口（MCP-only，无 session-start hook）：

1. 用当前 `project_path` 调用 `get_project_context`，必要时可附带 `limit`，一次拿到与 hook-backed agent 等价的 `ProjectContextView` 启动文本。
2. 如果启动后还需要进一步展开细节，再调用 `memory_timeline` 或 `search_memory` 做 drill-down。
3. 如果 timeline 或 search 结果里有值得展开的条目，再调用 `get_memory_details` 查看完整 narrative 和文件列表。

这样可以把 Antigravity 的启动恢复收敛成一次 MCP 调用，同时继续保留按需展开历史细节的能力。

### ✅ Smoke 验证清单

对本机 live 安装做联调时，建议按下面的最小矩阵执行：

1. 预检：worker 能启动，`/admin` 可访问，当前 observation 数量可读
2. `read on / write on`：能恢复旧记忆，并能新增一条 observation
3. `read off / write on`：旧记忆不再恢复，显式读取工具返回 disabled，但写入仍然成功
4. `read on / write off`：旧记忆仍可读取，但新写入不再让 observation 计数增长
5. 恢复默认：把两个开关都重新打开，并确认 worker 重启后策略仍然保持

如果 smoke 验证失败，只修与 `/admin`、runtime policy gate、当前 agent 集成路径直接相关的问题；修复后重新运行 `npm run build` 和受影响的 `tests/*.test.cjs`。

---

### 📄 开源协议
Apache-2.0 License
