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
- 已将网页 `/admin` 升级为完整的 Admin Workbench，并补齐 Windows 一键启动入口；当前目标是用新的 `Project Context` / `Search Diagnostics` / `State Lab` 工作台继续验证宽查询排序是否仍需收敛，以及 `Raw Execution:*` 是否还值得进一步过滤，同时保持 structured state 的 explicit-only 写入边界。

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
- 已向真实项目 `E:\Kuan\Projects\Codex\AgentMemory` 写入 7 条受控 structured state facts：`state_write_mode`、`rollout_stage`、`service:worker.port`，以及 `claudecode` / `codex` / `opencode` / `antigravity` 的 `startup_context_mode`。
- 已完成 Claude Code、Codex、OpenCode 的 live startup validation：三份 session-start stdout 都显示同一组 7 条 `current_state`，且 `Current structured state` 区块都排在 `Recent summary blocks` 之前。
- 已完成 Antigravity 的 MCP-only validation：通过直连 stdio MCP server 的 `get_memory_state`、`memory_timeline` 与 `search_memory`，确认无需 hook 也能取回同一组 current state 和最近记忆，但恢复等价上下文仍需多步显式调用。
- 已在 `src/services/context-view.ts` 中将 `recent_observations` 收敛为 startup-oriented slim metadata，只保留 `id`、`title`、`created_at`、`agent_id`，并在 `summary_blocks` 生成阶段加入 low-signal filtering 与 duplicate-title dedupe。
- 已在 `src/services/worker.ts` 中改为先基于完整 timeline 生成 `ProjectContextView`，再由 context-view 层统一做去噪、去重和 limit 应用，避免预切片把高信号 observation 挤掉。
- 已完成 phase 2 follow-up live validation：`/context?limit=10` 对真实项目当前返回约 `9589` bytes，不再携带 `embedding`，前 10 条 `summary_blocks` 中按“低信号 + 重复标题”口径仅剩 `1/10`，唯一残余低信号标题为 `Raw Execution: Bash`。
- 已抽出共享 `src/services/project-context.ts`，把 worker `/context` 与 MCP `get_project_context` 统一到同一套 state + summary + recent-observation loader，避免两边各自拼装 startup context。
- 已在 MCP server 中新增 `get_project_context` 聚合工具：默认使用当前工作目录和 `limit=10`，返回与 hooks 一致的 `ProjectContextView` 文本渲染；read gate 关闭时返回同样的 disabled 语义，空项目时返回明确空态提示。
- 已完成真实 helper validation：`get_project_context` 在 `E:\Kuan\Projects\Codex\AgentMemory` 上与 worker `/context` 渲染结果逐字一致，`helper_matches_worker_render=true`，并确认 Antigravity 现在可以用“一次 startup call + 按需 `search_memory` / `get_memory_details`”完成恢复。
- 已将双语 README 的 Antigravity 入口改为 `get_project_context` 优先，`memory_timeline` / `search_memory` / `get_memory_details` 下沉为 drill-down 工具。
- 已将真实项目的 structured state 进一步推进到 `rollout_stage = phase2-antigravity-startup-helper`，并将 `agent:antigravity.startup_context_mode` 更新为 `mcp+get_project_context`。
- 已将 `/admin` 重构为零前端构建链的 Admin Workbench：新增 `Runtime`、`Project Context`、`State Lab`、`Search Diagnostics` 和 `Observation Ledger` 五个工作区，并采用偏 iOS 风格的 glass-heavy 控制台视觉。
- 已新增 loopback-only 的 admin API：`GET /admin/api/context`、`GET /admin/api/state`、`POST /admin/api/state`、`POST /admin/api/search`；其中 context 现在同时返回原始 `view`、渲染文本和 payload / summary 健康度指标，search diagnostics 返回 raw hybrid scores 与 low-signal title 标记。
- 已新增 `src/services/workbench-launcher.ts`、`src/bin/workbench.ts`、`scripts/start-workbench.ps1` 和 `start-workbench.cmd`，支持 `npm run workbench` / 双击脚本一键构建、探测、复用或拉起 worker，并自动打开 `/admin`。

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
- `node --test tests\context-view.test.cjs tests\context-worker.test.cjs`
- `node --test tests\mcp-context.test.cjs`
- `node --test tests\db-state.test.cjs`
- `node --test tests\embedding-config.test.cjs`
- `node --test tests\mcp-state.test.cjs`
- `node --test tests\worker-admin.test.cjs`
- `node --test tests\mcp-policy.test.cjs`
- `node dist/services/worker.js`
- `node dist/hooks/claude-session-start.js`
- `node dist/hooks/codex-session-start.js`
- `node dist/hooks/opencode-session-start.js`
- `node dist/servers/mcp-server.js`

## Known Constraints
- 不同 agent 的配置文件格式不一致，安装器需要分别处理 OpenCode 与 Claude Code 的差异。

## Open Questions
- `Raw Execution:*` 这类标题是否也应该纳入更严格的 low-signal 过滤规则，还是保留为少量原始执行证据。
- `search_memory` 对较宽泛查询仍可能先命中低信号 observation；helper 已解决启动恢复，但后续是否还需要检索排序或 query guidance 的收敛仍待观察。
- 如果后续要接具体供应商的真实 embedding 端点，仍需要再做一次供应商真实接口的在线校验。

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
- 已在真实项目上完成 phase 1 live validation：写入 7 条受控 state facts，并验证了 Claude Code / Codex / OpenCode 的 hook 恢复一致性、Antigravity 的 MCP-only 取回路径，以及多仓切换下的 state 隔离。
- `ProjectContextView` 现在对 startup path 使用 slim `recent_observations` projection，并在 summary 层完成 low-signal filter + dedupe；真实 follow-up 验证显示 payload 已从约 `50.8 KB` 降到 `9589` bytes，`embedding` 已完全移出 `/context` 返回。
- 共享 `project-context` loader 现在同时服务 worker `/context` 与 MCP `get_project_context`；Antigravity 可通过一次 MCP 调用拿到与 hooks 一致的 startup context，而 lower-level MCP 工具退回到 drill-down 角色。
- README / README.zh 已补充新的 `ProjectContextView` 语义，并将 Antigravity 的推荐启动入口升级为 `get_project_context`。
- 已将 `Experiment - AgentMemory live validation of ProjectContextView and structured state` 更新为带 follow-up 的完整实验记录，并归档两个已被实现与复验关闭的 issue：`ProjectContextView returns oversized context payload with embedded observation vectors` 与 `ProjectContextView summary blocks are dominated by low-signal observation noise`。
- 新增 decision note：`Decision - MCP-only agents use get_project_context as the canonical ProjectContextView entrypoint`。
- `/admin` 现已升级为 Admin Workbench，并通过新增的 admin-only diagnostics API 把 `ProjectContextView`、structured state 和 raw hybrid search scores 同步进网页 UI。
- 已新增 Windows 一键启动入口：`npm run workbench`、`scripts/start-workbench.ps1` 和 `start-workbench.cmd`，用于构建、探测 / 复用 worker、等待 `/admin` 就绪并打开浏览器。

## Next Action
- 用新的 `Search Diagnostics` 和 `Project Context` 面板在真实项目上继续跑宽查询与 startup context 观测，重点判断 `search_memory` 的宽查询排序是否仍需收敛，并继续观察 `Raw Execution:*` 是否还值得进一步过滤；保持 structured state 的 explicit-only 写入模式。

## Last Sync
- date: 2026-06-03
- status: 已完成 Admin Workbench 落地与真实 smoke：`/admin` 现在包含 `Runtime`、`Project Context`、`State Lab`、`Search Diagnostics` 和 `Observation Ledger` 五个工作区；新增 admin-only diagnostics API 与 Windows 一键启动入口 `npm run workbench` / `start-workbench.cmd`，浏览器本地 smoke 已验证页面可打开且无新的前端控制台错误。
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
