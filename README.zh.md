# AgentMemory 🛡️

🌐 English | [中文版](./README.md)

---

AgentMemory 是一个免编译、轻量化的全局持久化智能体记忆系统 (Universal Agent Memory - UAM)。它支持多个主流 AI 辅助编程助理（如 **Claude Code**、**OpenCode**、**ChatGPT desktop（Codex runtime）**、**Antigravity CLI**、**Grok** 等）在不同工作区开发时共同读取和沉淀开发经验、技术决策和历史上下文。

### 🌟 核心特性

*   **跨 Agent 记忆共享**：允许不同的 AI 编码助理共享同一个项目的历史诊断事实、设计决策和排障记录。
*   **免编译与轻量化**：基于纯 JS 实现的 Feature Hashing 局部敏感向量编码和 WebAssembly 版本的 SQLite (`node-sqlite3-wasm`)，完美避开了复杂的 C++ 本地编译依赖（如 `node-gyp`）。
*   **混合检索检索**：集成 SQLite FTS5 的 BM25 全文关键字匹配与 Cosine Similarity 向量相似度算法，提供高相关的召回效果。
*   **异步后台摘要**：在后台队列中通过 DeepSeek Flash API 异步提炼繁杂的工具执行日志，最大化节省上下文 Token。
*   **每日记忆总结**：按项目每日运行一次总结任务，过滤低信号 observation，写入紧凑的事实、决策、命令、开放问题和下一步列表，并把最近成功总结注入启动上下文。
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
        CX[ChatGPT desktop<br/>(Codex runtime)]
        AG[Antigravity CLI]
        GK[Grok]
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
    GK -- Stdio MCP / Hooks --> MCP

    CC -- 拦截工具日志 --> Worker
    OC -- 拦截工具日志 --> Worker
    GK -- 生命周期事件 --> Worker

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
运行内置的安装器，它会自动向 **Claude Code**、**OpenCode**、**ChatGPT desktop（Codex runtime）**、**Antigravity** 和 **Grok** 写入相应的 hooks / plugin / MCP 注册参数：
```bash
agentmem install
```

如果你希望“五个 agent 任意一个没配好就立刻失败”，请使用：
```bash
agentmem install --strict
```

安装器现在已经改为“先备份，再 merge”：

- 安装状态保存在 `~/.agentmem/install-state.json`
- 能拿到干净基线时，会把原始配置备份到 `~/.agentmem/backups/`
- 只 merge / upsert AgentMemory 自己的 hooks 与 MCP 项，不再直接整段覆盖 hooks 数组

如果要把 AgentMemory 从当前机器卸载掉，但不删除仓库 checkout，请使用：
```bash
agentmem uninstall --strict
```

如果连保留的安装状态与备份也要一起清掉，再追加 `--purge-all`。

如果是给第二台 Windows 电脑做一次性落地，不要手工重复所有步骤，直接使用：
```powershell
.\bootstrap-second-machine.cmd
```

中文分步教程见：[docs/Second Machine Bootstrap Guide.zh.md](./docs/Second%20Machine%20Bootstrap%20Guide.zh.md)

---

### 💻 常用命令

您可以在终端中的任何工作路径直接调用全局快捷命令：

*   **启动 Worker 服务**：`agentmem start`（前台运行；使用期间请保持这个终端窗口处于运行状态）
*   **停止后台服务**：`agentmem stop`
*   **查询运行状态**：`agentmem status`
*   **查看当前版本**：`agentmem version`
*   **一键注册配置**：`agentmem install`（更新 Claude Code、OpenCode、Codex、Antigravity 和 Grok 的设置）
*   **严格注册模式**：`agentmem install --strict`（任意一项失败即退出）
*   **卸载本机集成**：`agentmem uninstall --strict`（移除当前机器上的 AgentMemory hooks、MCP 注册、插件产物、`.env` 与数据库文件）
*   **彻底清掉安装状态**：`agentmem uninstall --strict --purge-all`（同时删除保留的备份与 install-state）
*   **第二台电脑 Bootstrap**：`agentmem bootstrap-win --strict` 或 `bootstrap-second-machine.cmd`
*   **查看 Release Manifest**：`agentmem release-manifest --json`（输出机器可读的版本与发布策略元数据）
*   **生成 Release Plan**：`npm run release:plan -- --next patch|minor|major`
*   **执行版本号 Bump**：`npm run release:bump -- --next patch|minor|major`

### 🪟 Windows 二机 Bootstrap

如果第二台电脑同样是 Windows，推荐路径是：

```powershell
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
.\bootstrap-second-machine.cmd
```

这个入口会自动执行 `npm install`、`npm run build`、创建或校验 `%USERPROFILE%\.agentmem\.env`、执行 `npm link`、配置五个 agent、探测或拉起 worker，并打开 `/admin`。

如果 `%USERPROFILE%\.agentmem\.env` 不存在，bootstrap 会先写一个“空 API key + 默认 URL/model”的安全模板，然后立即停止，不会假装成功。你只需要填好 `AGENTMEM_LLM_*` 后重新运行。

### 📦 正式版本发布纪律

AgentMemory 现在把正式版本发布视为仓库内的一条固定维护流程：

*   正式版本只从 `master` 发布
*   版本号采用严格 `SemVer`，tag 固定为 `vX.Y.Z`
*   v1 阶段的正式分发渠道固定为 **GitHub Release + 默认源码归档**
*   CLI `agentmem release-manifest` 与 `/admin/api/overview` 会暴露 release metadata，`/admin/api/release-check` 现在会直接对比当前 checkout 与最新正式 GitHub Release

维护者分步流程见：[docs/Release Process.md](./docs/Release%20Process.md)

---

### 🧭 `/admin` 管理页

在 worker 运行后，打开：

```text
http://127.0.0.1:38888/admin
```

该页面仅允许本机 loopback 访问，不对非本机网络地址开放。

Windows 下现在有两个本机控制入口：

*   `npm run workbench`
*   `start-workbench.cmd`

`npm run workbench` 保留原来的一键路径：先构建仓库，再探测 `http://127.0.0.1:38888/admin/api/overview`；如果已有 worker 可复用就直接复用，否则后台拉起 `node dist/services/worker.js`，等待就绪后再打开 `/admin`。

`start-workbench.cmd` 现在是交互式控制入口。无参数执行时，会先探测当前状态，再显示一次性菜单：`Start`、`Stop`、`Restart`、`Status`、`Open Admin`、`Exit`。带参数时支持：

*   `start-workbench.cmd start|stop|restart|status|open-admin|menu`
*   `start-workbench.cmd start --no-open`
*   `start-workbench.cmd restart --port 38889 --no-open`

管理页提供：

*   **Runtime**：管理全局 `readEnabled` / `writeEnabled`，展示 project / agent 覆盖面，查看/手动运行每日总结并调整 scheduler 设置，同时提供只读的 GitHub Release 更新检查与手动升级指引
*   **Procedural Skills**：查看 digest `skill_candidates`，将可复用条目提升为 draft，切换 `enabled / disabled / retired` 生命周期状态，记录 success / failure / rejected / skipped 反馈，并在任务级 query 校验旁直接查看 feedback history、evidence、lifecycle、recommendation signals，以及最新自动生成的 post-task review artifacts
*   **LLM Settings**：切换 `AGENTMEM_LLM_MODEL`，更新 OpenAI-compatible API base URL，保留或替换 API key，并运行实时连接测试
*   **Project Context**：查看当前 `ProjectContextView`、最近每日总结、渲染后的 startup 文本，以及 bounded context package、temporal slice diagnostics 与 policy decision trace 指标
*   **State Lab**：显式读取和写入 structured state
*   **Search Diagnostics**：直接查看 hybrid search 的 `hybrid_score`、`fts_score`、`vector_score` 和低信号标题标记
*   **Observation Ledger**：保留全库台账浏览和 observation 细节 drill-down

#### Structured state 与 context view

AgentMemory 现在把记忆拆成显式层次：

*   **Observations** 继续作为 append-only 的历史账本，用于 hybrid search 和细节回溯。
*   **State facts** 用来存储显式的当前/历史真相，并带有 `effective_at`、`recorded_at` 和 `superseded_at` 时间语义。
*   **Daily digests** 保存按计划或手动触发的项目级每日总结，包含事实、决策、命令、开放问题和下一步；digest 输出不会自动晋升为 state fact。
*   **Procedural skills** 现在已经成为一等可审阅记忆对象，具备 `draft / enabled / disabled / retired` 生命周期和 success/failure 反馈账本。

现在的 policy brain 已经显式化，不再把策略分散在 hooks 和临时调用点里：

*   `memory-policy.ts` 集中承载读取决策、低信号 ledger 写入决策，以及 procedural skill candidate 的 draft promotion gate。
*   `memory-orchestrator.ts` 是共享的 Stage 2 读取编排层，worker startup context、MCP `get_project_context` 和任务级 query 都复用它。
*   `memory-query.ts` 现在复用这条共享 orchestrator 路径，决定该读哪些 layers、何时查 procedural memory，并附带 bounded context、temporal diagnostics 和 decision trace。

这一阶段新增的接口：

*   `GET /context?project_path=&limit=&as_of=`：返回 `ProjectContextView` 对象，不再直接返回 observation 数组
*   `GET /state?project_path=&entity_type=&entity_key=&fact_key=&as_of=`：读取当前或历史结构化状态
*   `POST /state`：显式写入结构化状态
*   `POST /memory/query`：返回 task query 的 policy 决策、分层上下文、匹配 observation、匹配 procedural skills，以及 bounded context package、temporal slice diagnostics 和 decision trace
*   `POST /search` 和 `POST /admin/api/search`：现在都支持可选 `as_of`，用于历史时间切片
*   MCP 工具：`get_project_context`、`query_memory`、`get_memory_state`、`set_memory_state`、`list_procedural_skills`、`promote_skill_candidate`、`set_procedural_skill_status`、`record_procedural_skill_feedback`

`ProjectContextView` 当前包含：

*   `as_of`：时间切片下的重建边界
*   `current_state`
*   `daily_digests`：最近成功的每日总结，已裁剪为 startup 可用的紧凑结构
*   `procedural_skills`：来自一等 procedural memory 的 `enabled` / `draft` 技能，并在相关路径上带出 feedback summary/history、lifecycle signal 和 recommendation state
*   `summary_blocks`：基于最近 observation 生成，但会过滤低信号标题并合并重复标题
*   `recent_observations`：面向 startup 的精简元数据列表，只保留 `id`、`title`、`created_at`、`agent_id`，不再附带完整 narrative 或 embedding
*   `sliding_window`：作为 Stage 2 bounded context package 的兼容别名继续保留
*   `bounded_context`：面向宿主 agent 的 bounded context package，包含 layer budgets、trimming order、rendered package 和 host responsibilities
*   `temporal_diagnostics`：逐层说明 `as_of` / latest 时间切片语义
*   `decision_trace`：解释当前 policy、procedural recommendation 和 bounded context 为什么这样形成
*   `memory_layers`：显式区分 metadata / profile / recent-summary / ledger / procedural / window
*   `generated_at`

这一阶段的 structured state 仍然是 **explicit-write only**：observation、hook 日志和 LLM 摘要不会自动晋升为 state。Procedural skill candidate 同样保持 **reviewable before promotion**：可以显式提升成 draft skill，但不会自动启用。

#### Workbench 专用诊断 API

workbench 还会通过 loopback-only 的 admin API 驱动网页交互：

*   `GET /admin/api/context?project_path=&limit=`：返回
    *   `view`：原始 `ProjectContextView`
    *   `rendered`：与 `renderProjectContextView(view)` 一致的启动文本
    *   `metrics`：`payloadBytes`、`summaryCount`、`lowSignalCount`、`duplicateTitleCount`、`proceduralSkillCount`、`slidingWindowEntryCount`、`boundedContextBudget`、`boundedContextCharsUsed`、`boundedContextTrimmedEntries`、`temporalDiagnosticLayerCount`、`decisionTraceStepCount`
*   `GET /admin/api/state?project_path=&entity_type=&entity_key=&fact_key=&as_of=`：供 workbench 读取 structured state
*   `POST /admin/api/state`：供 workbench 显式写入 structured state fact
*   `POST /admin/api/search`：返回当前 project 的 hybrid search 原始诊断分数，但不在这一步修改排序算法；同时支持可选 `as_of`
*   `POST /admin/api/memory/query`：暴露 policy-driven 的任务级记忆解析路径，并返回 bounded context packaging、temporal diagnostics 与 decision trace
*   `GET /admin/api/skills?project_path=&status=&as_of=&limit=`：读取当前 procedural skills，并附带 feedback history、evidence summary、lifecycle signal 和 recommendation metadata
*   `GET /admin/api/post-task-reviews?project_path=&limit=`：读取真实 observation 写路径自动生成的 post-task review artifacts，其中包含 matched skills、recommendation states、bounded context、temporal diagnostics 和 decision trace
*   `POST /admin/api/skills/promote-candidate`：把 digest 里的 `skill_candidate` 显式提升成 draft procedural skill
*   `POST /admin/api/skills/status`：把 procedural skill 切到 `draft`、`enabled`、`disabled` 或 `retired`
*   `POST /admin/api/skills/feedback`：为 procedural skill 记录 success / failure / rejected / skipped 反馈
*   `GET /admin/api/digests?project_path=&limit=`：读取某个项目最近保存的每日记忆总结
*   `POST /admin/api/digests/run`：为所选项目和可选 `local_date` 手动运行一次每日记忆总结任务
*   `GET /admin/api/digest-scheduler`：返回已持久化的每日总结 scheduler 配置和当前运行态
*   `POST /admin/api/digest-scheduler`：保存 scheduler 的 `enabled`、`schedule_time`、`time_zone` 和 `lookback_days`，并立即应用到当前 worker 的 timer
*   `GET /admin/api/release-check`：对比当前 checkout 与最新正式 GitHub Release，并返回适用于 git checkout 或源码归档的手动升级指引
*   `GET /admin/api/llm-config`：返回已脱敏的 LLM 配置快照，不暴露完整 API key
*   `POST /admin/api/llm-config`：把 model、API URL、JSON mode、headers 和可选 API key 变更持久化到 `~/.agentmem/.env`，并同步更新当前 worker 进程
*   `POST /admin/api/llm-test`：用当前表单值发送一个很小的 OpenAI-compatible `chat/completions` 请求，并返回连接测试结果

#### 运行时策略语义

*   `readEnabled=false` 时，会阻断记忆恢复和显式读取接口：
    *   HTTP：`/context`、`/search`、`/state`、`/memory/query`
    *   MCP：`get_project_context`、`query_memory`、`search_memory`、`memory_timeline`、`get_memory_details`、`get_memory_state`、`list_procedural_skills`
    *   SessionStart hook 不再向 agent 启动上下文注入历史记忆
*   `writeEnabled=false` 时，会阻断新记忆写入：
    *   HTTP：`/tools`、`/sessions`、`/sessions/close`、`/state`、`/admin/api/skills/*`
    *   MCP：`record_memory`、`set_memory_state`、`promote_skill_candidate`、`set_procedural_skill_status`、`record_procedural_skill_feedback`
    *   PostToolUse hook 不再生成新的 observation

这两个开关都保存在 SQLite `app_settings` 中，因此 worker 重启后会保留上次选中的策略。

每日总结读取复用 read gate；手动运行每日总结复用 write gate，和 observation / state 写入保持同一套运行时策略。Scheduler 设置会持久化在 SQLite `app_settings` 中；旧的 `AGENTMEM_DAILY_DIGEST_DISABLED=true` 环境变量只在还没有保存过 scheduler 设置时作为默认值种子。

#### 基本操作流程

1. 需要一键启动时使用 `npm run workbench`；需要交互式 `Start / Stop / Restart / Status / Open Admin` 控制时使用 `start-workbench.cmd`
2. 打开 `http://127.0.0.1:38888/admin`
3. 通过 `Read Memory` / `Write Memory` 开关切换运行时策略
4. 在 Runtime 面板的 release 卡片中对比当前 checkout 与最新正式 GitHub Release，并选择推荐的手动升级路径
5. 在 Runtime 面板的每日总结卡片中查看最近项目 digest、为指定本地日期手动运行一次总结，或调整自动 scheduler 的启停、运行时间、时区和 catch-up 窗口
6. 在 `Procedural Skills` 中评审 digest 候选技能，把可复用条目提升为 draft，切换 `enabled / disabled / retired`，记录操作反馈，检查自动生成的 post-task reviews，并运行验证查询以确认命中的 skill titles 与当前 `rollout_stage`
7. 在 `LLM Settings` 中切换模型或 endpoint，保存 env 文件变更，并在下一次摘要任务前测试连接
8. 在 `Project Context`、`State Lab`、`Search Diagnostics` 中检查 startup context 质量、structured state 和当前 hybrid ranking 行为
9. 如需深挖原始 observation，再切到 `Observation Ledger`
10. 使用 `agentmem status` 检查 worker 是否可达，完成后使用 `agentmem stop` 停止服务

---

### 🔌 智能体手动集成配置

#### 1. OpenCode 客户端 (`~/.config/opencode/opencode.jsonc`)
`agentmem install` 现在会同时写入 `mcp.agentmem` 和自动生成的桥接插件 `%USERPROFILE%/.config/opencode/plugins/agentmem-plugin.mjs`。落盘后的结构如下：
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

#### 3. ChatGPT desktop（Codex runtime）（`~/.codex/config.toml` 与 `~/.codex/hooks.json`）
桌面应用当前显示为 **ChatGPT**，但内部 Codex runtime 仍使用 `~/.codex`。MCP server 注册在 `config.toml`，生命周期 hooks 注册在 `hooks.json`；请保留 `codex-*` hook 文件名不变：

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
`agentmem install` 现在也会更新当前生效的 Antigravity MCP 注册表。安装器会先检查 Antigravity 直接使用的 registry：`%USERPROFILE%\.gemini\antigravity-cli\mcp_config.json`，再依次检查 `antigravity-ide`、`antigravity` 和 `.gemini\config\mcp_config.json`，最后才回退到 `%USERPROFILE%\.gemini\config\plugins\*\mcp_config.json` 这类 Gemini-compatible plugin registry。如果你的机器把注册表放在别处，可以显式传入：

```bash
agentmem install --strict --antigravity-config "C:\\path\\to\\mcp_config.json"
```

通用结构如下：
```json
{
  "mcpServers": {
    "agentmem": {
      "command": "node",
      "args": ["您的开发路径/AgentMemory/dist/servers/mcp-server.js"],
      "env": { "AGENTMEM_AGENT_ID": "antigravity" },
      "disabled": false
    }
  }
}
```

安装器还会在 `%USERPROFILE%\.agentmem\antigravity-plugins\agentmem` 创建并激活 Antigravity plugin。它通过 `PreInvocation`、`PostToolUse` 和 `Stop` 自动注入 `ProjectContextView`、把工具工作记录为 canonical `antigravity` 并关闭 session；MCP registry 同时注入 `AGENTMEM_AGENT_ID=antigravity`，因此显式 `record_memory` 即使省略 `agent_id` 也不会再落到 `mcp-client`。`%USERPROFILE%\.agentmem\AGENTMEM_ANTIGRAVITY.md` 继续作为 plugin rule 的可读兼容副本。

推荐的 Antigravity 工作流：

1. 先读当前 workspace 根目录 `obsiguide.md`；如果缺失但存在 `obsiguide.template.md`，先按模板创建并用已验证 repo evidence 填好关键字段，再做 feature work。
2. 让 `PreInvocation` hook 自动注入启动上下文；只有需要进一步展开时才调用 `get_project_context`、`search_memory` 或 `memory_timeline`，并把结果先用 repo evidence 和 `obsiguide.md` 验证。
3. 写入 `E:\Kuan\Vault` 前，必须检查当前 repo evidence、`obsiguide.md` 和现有 vault notes；不要把 AgentMemory 原始摘要或 session recap 直接倒入 vault。
4. 普通工具工作由 `PostToolUse` 自动记录，`Stop` 自动关闭 session；只有需要单独标记里程碑时才显式调用 `record_memory(agent_id="antigravity")`。
5. 如果启动后还需要进一步展开细节，再用 `memory_timeline`、`search_memory` 和 `get_memory_details` 做 drill-down。

这样 Antigravity 也具备与其他 hook-backed agent 一致的自动读写生命周期。

#### 5. Grok（`~/.grok/config.toml`）
`agentmem install` 会为 Grok 注册带 `AGENTMEM_AGENT_ID=grok` 的 stdio MCP server，生成受管的全局 `~/.grok/AGENTS.md` Vault 规则、默认 `~/.grok/agents/agentmem.md` profile，并在 `~/.grok/hooks/agentmem.json` 写入全局 lifecycle hooks。

```toml
[agent]
name = "agentmem"

[compat.claude]
hooks = false

[mcp_servers.agentmem]
command = "node"
args = [ "您的开发路径/AgentMemory/dist/servers/mcp-server.js" ]
env = { AGENTMEM_AGENT_ID = "grok" }
```

全局 `AGENTS.md` 会被每个 Grok profile 加载，包含 `obsiguide.md` bootstrap、AgentMemory / Vault 边界、证据优先级、durable note 与收尾报告规则。默认 profile 会启用 `AGENTS.md` 加载，并把 `get_project_context` 作为首个记忆读取入口。Grok 的被动 hook stdout 不能注入模型，因此启动恢复由 profile 负责；`SessionStart`、`PostToolUse`、`PostToolUseFailure`、`Stop` 与 `SessionEnd` hooks 则负责注册 session、记录工具工作和关闭 session。安装器只关闭 Grok 的 Claude-hook compatibility，避免现有 Claude post-tool hook 把 Grok 记录误标为 `claudecode`；Claude skills 与 MCP compatibility 仍然启用。

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
