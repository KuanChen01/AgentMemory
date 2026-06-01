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
- 构建并验证一个可在 OpenCode、Claude Code、Codex 和 Antigravity 之间共享的持久化记忆系统。

## Current State
- 彻底解决了 Codex 持久化记忆未记录的问题，在 `~/.codex/hooks.json` 中配置了会话钩子并启用了 `hooks` 功能旗标。
- 在 `src/hooks/` 下新增了 Codex 专用的 `codex-session-start.ts` 和 `codex-post-tool.ts` 钩子脚本。
- 在 Codex 的 `AGENTS.md` 尾部追加了独立的 `AgentMemory Sync Rules` 章节，保持原有 Obsidian 规则不受修改或混淆。
- 已将历史数据库迁移到 `C:\Users\Admin\.agentmem\agentmemory.db`，并把项目路径统一改到 `AgentMemory`。
- 已完成 OpenCode、Claude Code、Codex 和 Antigravity 的基础配置对接。
- 已验证 Claude Code 的 PostToolUse hook 到数据库写入链路。
- 已修复 OpenCode 启动闪退问题：安装器会写入合规 of `opencode.jsonc`，并自动删除冲突的 `opencode.json`。

## Verified Commands
- `npm run build`
- `node dist/bin/cli.js install`
- `node dist/bin/cli.js start`
- `node dist/bin/cli.js status`
- `npx ts-node scratch/test-db.ts`
- `npx ts-node scratch/test-mcp.ts`
- `npx ts-node scratch/test-search.ts`

## Known Constraints
- 不同 agent 的配置文件格式不一致，安装器需要分别处理 OpenCode 与 Claude Code 的差异。

## Open Questions
- 需要继续观察不同 agent 在长会话和多仓库切换下的记忆召回质量。

## Latest Durable Changes
- 实现了 Codex 自动化钩子配置并集成了全局 `hooks.json` 规则。
- 数据库和工作区路径已完成从 `AgentVault` 到 `AgentMemory` 的迁移。
- OpenCode 安装器已改用字符级 JSONC 注释剥离器。
- Claude Code 的 hooks 与 MCP server 配置分离规则已被沉淀为知识笔记。

## Next Action
- 对齐 `README.md` 中的 Claude Code 配置说明与安装器实际行为，然后继续在四个 agent 中联调验证记忆写入与拦截效果。

## Last Sync
- date: 2026-06-01
- status: 实现了 Codex 持久化记忆自动化集成，在 hooks.json 和 config.toml 中配置并启用了相关钩子，同时更新了 AGENTS.md 行为规范。
- linked_project_note: E:\Kuan\Vault\02_Projects\AgentMemory.md
