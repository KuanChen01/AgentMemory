# Second Machine Bootstrap Guide

## Goal

这份指南面向第二台 Windows 电脑，目标是把 `AgentMemory` 以“同样四个 agent、同样配置方式、但不复制本机历史数据库”的方式准确落地。

目标覆盖的四个 agent：

- `Claude Code`
- `Codex`
- `OpenCode`
- `Antigravity`

## What Gets Replicated

- 会复制的内容：
  - 仓库代码
  - `agentmem` CLI
  - `Claude Code` / `Codex` / `OpenCode` / `Antigravity` 的本机配置
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
2. 已安装四个目标 agent
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
5. 配置四个 agent
6. 探测或拉起 worker
7. 打开 `/admin`
8. 输出严格安装结果

## First Run Behavior

如果 `%USERPROFILE%\.agentmem\.env` 不存在，第一次运行会：

1. 自动生成 `%USERPROFILE%\.agentmem\.env`
2. 写入占位值 `fill-me`
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
.\bootstrap-second-machine.cmd -AntigravityConfig "C:\Users\YourName\.gemini\config\plugins\local-game-mcps\mcp_config.json"
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
- `%USERPROFILE%\.claude.json`
- `%USERPROFILE%\.claude\settings.json`
- `%USERPROFILE%\.codex\config.toml`
- `%USERPROFILE%\.codex\hooks.json`
- `%USERPROFILE%\.config\opencode\opencode.jsonc`
- `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs`
- `%USERPROFILE%\.gemini\config\plugins\...\mcp_config.json`

## Manual Acceptance

bootstrap 成功后，再做这四项 live acceptance：

1. `Claude Code` 新开一个会话，确认能看到 `SessionStart` 恢复内容
2. `Codex` 新开一个会话，确认能看到 `SessionStart` 恢复内容
3. `OpenCode` 新开一个会话并执行一次工具，确认插件桥接仍能恢复并写入
4. `Antigravity` 对当前项目调用 `get_project_context`，确认能一次取回启动上下文

## Troubleshooting

- `Antigravity MCP registry was not found`
  - 说明 `%USERPROFILE%\.gemini\config\plugins\*\mcp_config.json` 没找到
  - 先建立插件目录，或显式传 `-AntigravityConfig`

- `Bootstrap scaffolded ...\.agentmem\.env`
  - 说明 `.env` 只是模板，还没有真实凭证
  - 填完 `AGENTMEM_LLM_*` 再重跑

- `/admin` 没有起来
  - 先运行 `agentmem status`
  - 再检查 `logs/workbench/` 下最新 `worker-*.err.log`

- `OpenCode` 成功写入了 `opencode.jsonc` 但仍无效果
  - 先确认 `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs` 存在
  - 再确认其中指向的是当前 checkout 的 `dist/hooks/opencode-session-start.js` 与 `dist/hooks/opencode-post-tool.js`
