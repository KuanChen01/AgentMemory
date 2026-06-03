# obsiguide.md

## Repo Identity
- repo_path: E:\Kuan\Projects\Codex\AgentMemory
- repo_kind: Universal Agent Memory / MCP Integration
- primary_stack: TypeScript / Node.js / MCP

## Obsidian Target
- vault_path: E:\Kuan\Vault
- project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
- entry: [[03_Areas/MCP]]
- areas: MCP, AI Interaction
- domain: agent-tooling

## Sync Rules
- project_contract:
  - `obsiguide.md` 是这个工作区唯一的项目级同步合同。
  - 不要再创建或依赖 repo 根目录 `AGENTS.md`、`CLAUDE.md` 或 `GEMINI.md`。
- note_language_contract:
  - 文件名、H1 标题、章节标题、frontmatter 字段名、受控值、tags 和 Dataview 语法保持英文。
  - 正文叙述内容使用中文。
  - repo 名、工具名、命令、路径、配置键、版本号和原始报错文本保持原文。
- daily_contract:
  - daily 使用 `## Focus`、`## Summary` 和 `## Project Ledger`。
  - 项目专属记录放进 `### [[Project Note]]` 区块。
- write_obsidian_when:
  - 产生可复用 issue
  - 形成稳定 decision
  - 沉淀跨项目 knowledge
  - 项目状态发生明确变化
  - experiment 结果被验证
- keep_local_only_when:
  - 当前目标或当前下一步
  - 临时工作上下文
  - 尚未形成 durable 结论的开放问题
- do_not_record:
  - 推测性结论
  - 噪音式中间步骤
  - 低价值流水账
  - 没有结论的原始日志
- finish_checklist:
  - 更新 Current State
  - 更新 Latest Durable Changes
  - 更新 Next Action
  - 更新 Last Sync
  - 按需提升 durable Issue、Decision、Knowledge 或 Experiment 笔记

## Current Goal
- 将 AgentMemory 从 observation-only 的共享记忆账本扩展为分层记忆第一阶段：落地 structured state + derived summary，并在 worker、MCP 和 session-start hooks 上验证闭环。

## Current State
- 彻底解决了 Codex 持久化记忆未记录的问题，在 `~/.codex/hooks.json` 中配置了会话钩子并启用了 `hooks` 功能旗标。
- 在 `src/hooks/` 下新增了 Codex 专用的 `codex-session-start.ts` 和 `codex-post-tool.ts` 钩子脚本。
- 在 Codex 的 `AGENTS.md` 尾部追加了独立的 `AgentMemory Sync Rules` 章节，保持原有 Obsidian 规则不受修改或混淆。
- 已将历史数据库迁移到 `C:\Users\Admin\.agentmem\agentmemory.db`，并把项目路径统一改到 `AgentMemory`。
- 已完成 OpenCode、Claude Code、Codex 和 Antigravity 的基础配置对接。
- 已验证 Claude Code 的 PostToolUse hook 到数据库写入链路。
- 已修复 OpenCode 启动闪退问题：安装器会写入合规 of `opencode.jsonc`，并自动删除冲突的 `opencode.json`。
- 已在 worker 内新增仅 loopback 可访问的 `/admin` 管理页，支持全局 read/write runtime policy 开关、全库 observation 总览和带筛选的台账视图。
- runtime policy 现在持久化保存在 SQLite `app_settings` 中；关闭 read 或 write 后，HTTP 与 MCP 入口会统一返回 disabled 结果而不继续检索或落库。
- 已为数据库策略持久化、admin HTTP API 和 MCP policy gate 补上 Node `node:test` 回归测试，并通过 `npm run build` 与三组测试验证。
- 已将 `/admin` 管理页、runtime policy 语义、Claude/Codex/OpenCode/Antigravity CLI 的当前配置入口补进 `README.md` / `README.zh.md`。
- 已基于本机真实配置完成 Claude Code、Codex、OpenCode 和 Antigravity CLI 的 live smoke matrix：验证了 `read on/write on`、`read off/write on`、`read on/write off` 和恢复默认开启，并确认策略在 worker 重启后仍然持久化。
- 已修复 `/admin` 开关的可视反馈问题：点击后 UI 不再被旧 policy 立即刷回，两个开关卡片现在会明确显示 `Enabled` / `Disabled`、顶部组合态、保存中文案和高亮样式。
- 已将 worker 与 MCP server 的 embedding 配置解析收敛到共享 helper，只保留 `AGENTMEM_*` / `DEEPSEEK_*` 命名，不再接受遗留的 AgentVault 前缀环境变量。
- 已按本机当前生效的 `C:\Users\Admin\.gemini\config\plugins\local-game-mcps\mcp_config.json` 再次拉起 Antigravity CLI 的 `agentmem` MCP server，并通过只读 `memory_timeline` 调用确认真实集成链路仍然可用。
- 已清理本地浏览器检查噪音产物 `.playwright-mcp/` 与 `admin-toggle-feedback.png`，并把 `.playwright-mcp/` 补进 `.gitignore`，避免再次污染工作树。
- 已用临时端口、临时数据库和本地 mock embedding 服务完成一次端到端验证：MCP `record_memory` 与 worker `/search` 都实际向 `EMBEDDING_API_URL` 发出了带 `Bearer` 认证的请求，数据库中的最新 observation embedding 长度为 `7` 且值与 mock 返回一致，worker `/search` 的 `vector_score` 为 `1`，说明返回向量被真正使用而不是静默回退到本地 1024 维 hashing。
- 已修复 Codex 安装器的两个配置缺陷：`agentmem install` 现在会为 Codex fresh install 创建 `~/.codex/config.toml` 并注册 `[mcp_servers.agentmem]`，同时以幂等方式把 `[features]` 中的 `hooks` 统一收敛为单个 `hooks = true`，不再留下重复键。
- 已新增 `state_facts` 结构化状态层：同一 `(project_path, entity_type, entity_key, fact_key)` 现在采用追加新版本并通过 `superseded_at` 标记失效区间，不再依赖 observation 模糊召回来承载“当前真相”。
- `GET /context` 已切换为返回 `ProjectContextView`，由 `current_state`、`summary_blocks`、`recent_observations` 和 `generated_at` 组成；三种 session-start hook 现在统一渲染该结构化上下文，而不再逐条打印原始 observation 列表。
- 已新增 HTTP `/state` 与 MCP `get_memory_state` / `set_memory_state`，并复用现有 runtime policy gate：关闭 read 时不再返回 state/context，关闭 write 时 state 写入不会落库。
- 已补齐 `tests\\db-state.test.cjs`、`tests\\context-worker.test.cjs`、`tests\\mcp-state.test.cjs`，并完成 `npm run build` 与全量 Node `node:test` 回归验证。

## Verified Commands
- `npm run build`
- `node dist/bin/cli.js install`
- `node dist/bin/cli.js start`
- `node dist/bin/cli.js status`
- `npx ts-node scratch/test-db.ts`
- `npx ts-node scratch/test-mcp.ts`
- `npx ts-node scratch/test-search.ts`
- `node --test tests\db-admin.test.cjs`
- `node --test tests\codex-installer.test.cjs`
- `node --test tests\context-worker.test.cjs`
- `node --test tests\db-state.test.cjs`
- `node --test tests\embedding-config.test.cjs`
- `node --test tests\mcp-state.test.cjs`
- `node --test tests\worker-admin.test.cjs`
- `node --test tests\mcp-policy.test.cjs`

## Known Constraints
- 不同 agent 的配置文件格式不一致，安装器需要分别处理 OpenCode 与 Claude Code 的差异。

## Open Questions
- 需要继续观察不同 agent 在长会话和多仓库切换下的记忆召回质量。
- 当前只完成了 OpenAI-compatible mock 响应的端到端验证；如果后续要接具体供应商，还需要再做一次供应商真实接口的在线校验。

## Latest Durable Changes
- 实现了 Codex 自动化钩子配置并集成了全局 `hooks.json` 规则。
- 数据库和工作区路径已完成从 `AgentVault` 到 `AgentMemory` 的迁移。
- OpenCode 安装器已改用字符级 JSONC 注释剥离器。
- Claude Code 的 hooks 与 MCP server 配置分离规则已被沉淀为知识笔记。
- 新增 `/admin` 管理页和 `RuntimeMemoryPolicy` 持久化策略，允许从浏览器统一控制记忆读取与写入。
- worker 与 MCP server 现在共享 read/write disabled 语义；关闭写入后不会再入队或落库，关闭读取后不会再向 agent 返回历史记忆。
- 双语 README 现在明确记录 `/admin` 管理页、runtime policy 行为，以及 Claude/Codex/OpenCode/Antigravity CLI 的实际配置入口。
- 已在本机对四个 agent 的真实集成路径完成 live 开关联调，并确认 read/write gate 与策略持久化在 restart 后仍然生效。
- `/admin` 前端现在使用 pending policy 渲染保存中的目标状态，避免切换时先跳回旧值；同时补上显式状态 badge、卡片高亮和保存中提示。
- embedding 配置命名已统一为 `AGENTMEM_*`；worker 与 MCP server 共享同一套解析逻辑，避免再出现单边遗留读取旧 AgentVault 前缀变量的漂移。
- 已按 Antigravity CLI 当前真实 MCP 注册表重新完成只读 `memory_timeline` 验证，并清理掉 `.playwright-mcp/` 与 `admin-toggle-feedback.png` 这类本地检查噪音。
- 已在不污染正式数据库和仓库的前提下，完成外部 embedding 路径的 mock 端到端验证，并确认 `EMBEDDING_API_URL` 返回的向量会被 MCP 写入和 worker 检索真正消费。
- Codex installer 现在通过共享 helper 以 upsert 方式维护 `~/.codex/config.toml`，确保 `[features].hooks = true` 与 `[mcp_servers.agentmem]` 都会被正确写入且重复执行保持幂等；同时为该行为补上了 fresh install 和 rewrite 场景的 Node `node:test` 回归测试。
- AgentMemory 现在具备 observation ledger 之外的第一阶段分层记忆能力：新增 `state_facts`、`/state`、`get_memory_state` / `set_memory_state`，并将 `/context` 与 session-start 注入统一切换到 `ProjectContextView`。

## Next Action
- 用真实 agent 工作流继续验证 `ProjectContextView` 和 structured state 的使用价值，并据此决定第二阶段是否需要加入 state 的管理页可见性、人工审核候选 state，或更明确的 skill / playbook 层。

## Last Sync
- date: 2026-06-03
- status: 已完成第一阶段 state + summary 切换：新增 `state_facts` 结构化状态层、HTTP `/state`、MCP `get_memory_state` / `set_memory_state`，并将 `/context` 与三种 session-start hook 切换为 `ProjectContextView`；同时补上 `tests\\db-state.test.cjs`、`tests\\context-worker.test.cjs`、`tests\\mcp-state.test.cjs` 并通过全量 Node `node:test` 回归。
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
