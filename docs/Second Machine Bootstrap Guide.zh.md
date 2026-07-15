# Second Machine Bootstrap Guide

## Goal

这份指南面向第二台 Windows 电脑，目标是把 `AgentMemory` 以“同样五个 agent、同样配置方式、但不复制本机历史数据库”的方式准确落地。

目标覆盖的五个 agent：

- `Claude Code`
- `ChatGPT desktop（Codex runtime）`
- `OpenCode`
- `Antigravity`
- `Grok`

## What Gets Replicated

- 会复制的内容：
  - 仓库代码
  - `agentmem` CLI
  - `Claude Code` / `ChatGPT desktop（Codex runtime）` / `OpenCode` / `Antigravity` / `Grok` 的本机配置
  - `OpenCode` 的桥接插件 `agentmem-plugin.mjs`
  - `~/.agentmem/.env` 配置骨架
  - Windows 一键 bootstrap 与 `/admin` workbench 入口

- 不会复制的内容：
  - 本机现有 `~/.agentmem/agentmemory.db`
  - 本机 worker 日志
  - 本机历史 observation / structured state

## Prerequisites

第二台电脑需要先具备这些前提：

1. 已安装 `Node.js 18+`
2. 已安装五个目标 agent
3. 已把 `Antigravity` 的 Gemini-compatible plugin registry 建好
4. 已拿到可用的 `AGENTMEM_LLM_API_KEY`

如果第 3 项尚未建立，bootstrap 会严格失败，并提示你传入：

```powershell
--antigravity-config "C:\path\to\mcp_config.json"
```

## One-Step Path

在第二台电脑的 PowerShell 中执行：

```powershell
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
.\bootstrap-second-machine.cmd
```

这条入口会做这些事情：

1. `npm install`
2. `npm run build`
3. 生成或检查 `%USERPROFILE%\.agentmem\.env`
4. `npm link`
5. 配置五个 agent
6. 探测或拉起 worker
7. 打开 `/admin`
8. 输出严格安装结果

bootstrap 完成后：

- 需要继续沿用旧的一键启动体验时，运行 `npm run workbench`
- 需要本机交互式控制 `Start / Stop / Restart / Status / Open Admin` 时，运行 `start-workbench.cmd`

## First Run Behavior

如果 `%USERPROFILE%\.agentmem\.env` 不存在，第一次运行会：

1. 自动生成 `%USERPROFILE%\.agentmem\.env`
2. 写入“空 API key + 默认 URL/model”的安全骨架
3. 立即停止，不会继续假装安装成功

你需要把它改成真实配置，例如：

```env
AGENTMEM_LLM_API_KEY=your_real_key
AGENTMEM_LLM_API_URL=https://api.deepseek.com/v1
AGENTMEM_LLM_MODEL=deepseek-chat
AGENTMEM_PORT=38888
```

然后重新运行：

```powershell
.\bootstrap-second-machine.cmd
```

## Useful Variants

不自动打开浏览器：

```powershell
.\bootstrap-second-machine.cmd -NoOpen
```

显式指定 Antigravity registry：

```powershell
.\bootstrap-second-machine.cmd -AntigravityConfig "C:\Users\YourName\.gemini\antigravity-cli\mcp_config.json"
```

首次执行时直接注入凭证：

```powershell
.\bootstrap-second-machine.cmd `
  -ApiKey "your_real_key" `
  -ApiUrl "https://api.deepseek.com/v1" `
  -Model "deepseek-chat"
```

## Installed Files

bootstrap 成功后，关键落点应为：

- `%USERPROFILE%\.agentmem\.env`
- `%USERPROFILE%\.agentmem\install-state.json`
- `%USERPROFILE%\.agentmem\AGENTMEM_ANTIGRAVITY.md`
- `%USERPROFILE%\.agentmem\antigravity-plugins\agentmem\plugin.json`
- `%USERPROFILE%\.agentmem\antigravity-plugins\agentmem\hooks.json`
- `%USERPROFILE%\.gemini\config\plugins.json`
- `%USERPROFILE%\.gemini\config\import_manifest.json`
- `%USERPROFILE%\.agentmem\backups\`
- `%USERPROFILE%\.claude.json`
- `%USERPROFILE%\.claude\settings.json`
- `%USERPROFILE%\.codex\config.toml`
- `%USERPROFILE%\.codex\hooks.json`
- `%USERPROFILE%\.grok\config.toml`
- `%USERPROFILE%\.grok\AGENTS.md`
- `%USERPROFILE%\.grok\agents\agentmem.md`
- `%USERPROFILE%\.grok\hooks\agentmem.json`
- `%USERPROFILE%\.config\opencode\opencode.jsonc`
- `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs`
- `%USERPROFILE%\.gemini\antigravity-cli\mcp_config.json`，或安装器探测到的其它 Antigravity `mcp_config.json`

## Cleanup and Reinstall

如果第二台机器后续需要卸载当前集成，不需要删仓库重装，直接执行：

```powershell
agentmem uninstall --strict
```

这条命令会：

1. 停掉本地 worker 并清理 `worker.pid`
2. 移除五个 agent 中由 AgentMemory 管理的 hooks / MCP 注册 / OpenCode 插件
3. 删除 `%USERPROFILE%\.agentmem\.env` 与 `agentmemory.db`
4. 在有干净基线备份时恢复原配置；如果该文件是旧安装遗留或你在安装后又手改过，则只做“定向清理 AgentMemory 项”，不会强行覆盖你的后续改动

如果还要连备份与安装状态一起清掉，再执行：

```powershell
agentmem uninstall --strict --purge-all
```

## Manual Acceptance

bootstrap 成功后，再做这四项 live acceptance：

1. `Claude Code` 新开一个会话，确认能看到 `SessionStart` 恢复内容
2. `ChatGPT desktop（Codex runtime）` 新开一个会话，确认能看到 `SessionStart` 恢复内容；配置仍位于 `%USERPROFILE%\.codex\config.toml` 与 `%USERPROFILE%\.codex\hooks.json`
3. `OpenCode` 新开一个会话并执行一次工具，确认插件桥接仍能恢复并写入
4. `agy plugin list` 能看到已导入的 `agentmem` plugin；新开 Antigravity 会话后，`PreInvocation` 自动注入 context、`PostToolUse` 自动写入且记录的 `agent_id` / `project_path` 分别为 `antigravity` 和当前 workspace，`Stop` 会关闭 session
5. `grok mcp doctor agentmem` 通过，`grok inspect --json` 显示默认 `agentmem` profile、Grok lifecycle hooks 与本机 MCP server；执行一次非 AgentMemory 工具后，Observation Ledger 仅产生 `agent_id=grok` 的记录
6. 对任意受管理 repo，确认 Antigravity 与 Grok 都会先读或 bootstrap 根目录 `obsiguide.md`，把 `agentmem` search/timeline 结果视为未验证工作记忆，且写入 `E:\Kuan\Vault` 前先按 `obsiguide.md` 和现有 vault notes 验证

## Troubleshooting

- `Antigravity MCP registry was not found`
  - 说明 `%USERPROFILE%\.gemini\antigravity-cli\mcp_config.json`、`antigravity-ide`、`antigravity`、`.gemini\config\mcp_config.json` 和 `%USERPROFILE%\.gemini\config\plugins\*\mcp_config.json` 都没找到
  - 先确认 Antigravity 已创建 MCP registry，或显式传 `-AntigravityConfig`

- `AGENTMEM_ANTIGRAVITY.md` 不存在
  - 先重新运行 `agentmem install --strict`
  - 如果 Antigravity registry 路径不标准，带上 `--antigravity-config`
  - 这个文件是 AgentMemory 为 Antigravity 生成的规则面，用来区分 `obsiguide.md`、Obsidian Vault 和 `agentmem` working memory 的边界

- `agy plugin list` 中没有 `agentmem`
  - 重新执行 `agentmem install --strict`；安装器会调用官方 `agy plugin install` 激活 hooks plugin
  - 检查 `%USERPROFILE%\.gemini\config\import_manifest.json` 与 `%USERPROFILE%\.gemini\config\plugins\agentmem\hooks.json`

- `Bootstrap scaffolded ...\.agentmem\.env`
  - 说明 `.env` 只是模板，还没有真实凭证
  - 填完 `AGENTMEM_LLM_*` 再重跑

- `/admin` 没有起来
  - 先运行 `agentmem status`
  - 再检查 `logs/workbench/` 下最新 `worker-*.err.log`

- `OpenCode` 成功写入了 `opencode.jsonc` 但仍无效果
  - 先确认 `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs` 存在
  - 再确认其中指向的是当前 checkout 的 `dist/hooks/opencode-session-start.js` 与 `dist/hooks/opencode-post-tool.js`
