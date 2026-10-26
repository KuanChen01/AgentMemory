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

1. 已安装 `Node.js 22+`（推荐 Node 24；已有 WASM 安装需先按 [Native SQLite Migration](Native%20SQLite%20Migration.md) 完成停机备份）
2. 已安装五个目标 agent
3. 已安装可用的 `Antigravity` CLI；安装器会创建官方全局 MCP registry
4. 已拿到可用的 `AGENTMEM_LLM_API_KEY`

如果旧安装使用了额外的 Antigravity MCP registry，可在升级时指定其路径，让安装器清理其中指向本项目的重复项：

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
- 正常使用不要求你手工常驻一个终端；worker 不在线时，受管 lifecycle hook 默认会用跨进程锁后台拉起它
- 如需完全关闭自动拉起，设置 `AGENTMEM_HOOK_AUTOSTART=false`；响应超时与冷启动宽限分别由 `AGENTMEM_HOOK_TIMEOUT_MS`、`AGENTMEM_HOOK_STARTUP_TIMEOUT_MS` 控制

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

`.env` 已存在时，bootstrap 只就地更新上面这四项（缺少的补在末尾），其余行（注释、网关 headers、预算、`AGENTMEM_DB_PATH` 等）都保留。文件以原子方式替换、只有你能读，不再生成备份；没有改动则不重写。旧版本留下的 `%USERPROFILE%\.agentmem\.env.bak-<时间戳>` 包含 API key，不会被自动删除，如不需要请自行删除。

worker 只监听 `127.0.0.1`，所有接口都只接受本机访问；从局域网里的另一台电脑无法连接这台电脑的 worker。本机上的任意本地进程都可以查询 worker。

## Useful Variants

不自动打开浏览器：

```powershell
.\bootstrap-second-machine.cmd -NoOpen
```

显式指定需要清理的旧 Antigravity registry：

```powershell
.\bootstrap-second-machine.cmd -AntigravityConfig "C:\Users\YourName\.gemini\antigravity-cli\mcp_config.json"
```

首次执行时直接配置接口和模型（`.env` 里还没有 key 时，脚本会用隐藏输入的提示询问 key；key 不要写在命令行上，否则会留在 shell 历史里）：

```powershell
.\bootstrap-second-machine.cmd `
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
- `%USERPROFILE%\.gemini\config\mcp_config.json`
- `%USERPROFILE%\.gemini\config\plugins\agentmem\plugin.json`
- `%USERPROFILE%\.gemini\config\import_manifest.json`
- `%USERPROFILE%\.agentmem\backups\`
- `%USERPROFILE%\.claude.json`
- `%USERPROFILE%\.claude\settings.json`
- `%USERPROFILE%\.codex\config.toml`
- `%USERPROFILE%\.codex\hooks.json`
- `%USERPROFILE%\.grok\config.toml`
- `%USERPROFILE%\.grok\agents\agentmem.md`
- `%USERPROFILE%\.grok\hooks\agentmem.json`
- `%USERPROFILE%\.config\opencode\opencode.jsonc`
- `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs`
- `%USERPROFILE%\.config\opencode\AGENTS.md`（仅含 AgentMemory managed block，保留其它全局规则）
- 旧 `%USERPROFILE%\.gemini\antigravity-cli\mcp_config.json` 等 registry 中，指向同一 AgentMemory 服务的重复项会被移除；其它 MCP 项保留

## Cleanup and Reinstall

如果第二台机器后续需要卸载当前集成，不需要删仓库重装，直接执行：

```powershell
agentmem uninstall --strict
```

这条命令会：

1. 停掉本地 worker 并清理 `worker.pid`
2. 移除五个 agent 中由 AgentMemory 管理的 hooks / MCP 注册 / OpenCode 插件与全局规则 block
3. 删除 `%USERPROFILE%\.agentmem\.env` 与 `agentmemory.db`
4. 在有干净基线备份时恢复原配置；如果该文件是旧安装遗留或你在安装后又手改过，则只做“定向清理 AgentMemory 项”，不会强行覆盖你的后续改动

安装器不会生成 `%USERPROFILE%\.grok\AGENTS.md`；OpenCode 使用原生 `%USERPROFILE%\.config\opencode\AGENTS.md`，并只合并或移除带标记的 AgentMemory block，其它全局规则会被保留。如果旧 `~/.grok/AGENTS.md` 中仍有 AgentMemory managed block，Grok 清理逻辑也只移除该 block。

如果还要连备份与安装状态一起清掉，再执行：

```powershell
agentmem uninstall --strict --purge-all
```

## Manual Acceptance

bootstrap 成功后，再做以下 live acceptance：

1. `Claude Code` 新开一个会话，确认能看到 `SessionStart` 恢复内容
2. `ChatGPT desktop（Codex runtime）` 新开一个会话，确认能看到 `SessionStart` 恢复内容；提交实质性任务时确认 `UserPromptSubmit` 自动查找相关记忆。配置仍位于 `%USERPROFILE%\.codex\config.toml` 与 `%USERPROFILE%\.codex\hooks.json`
3. `OpenCode` 重启后新开会话，确认项目上下文和任务相关记忆进入模型上下文；执行普通工具后在 AgentMemory Observation Ledger 中确认 `agent_id=opencode` 且 `project_path` 对应当前工作区。连续两次出现同类工具失败后，插件会尝试补充一次相关记忆。
4. `agy plugin list` 能看到已导入的 `agentmem` plugin；MCP 列表中只有一个 `agentmem`。新开 Antigravity 会话后，`PreInvocation` 自动检索当前任务、`PostToolUse` 自动写入且记录的 `agent_id` / `project_path` 分别为 `antigravity` 和当前 workspace，`Stop` 会关闭 session
5. `grok mcp doctor agentmem` 通过，`grok inspect --json` 显示默认 `agentmem` profile、Grok lifecycle hooks 与本机 MCP server；实质性任务会预查记忆，首次工具结果后注入。执行一次非 AgentMemory 工具后，Observation Ledger 仅产生 `agent_id=grok-build` 的记录
6. 对任意受管理 repo，确认 Antigravity 与 Grok 会把 `agentmem` search/timeline 结果视为未验证工作记忆，并在 durable use 前用当前 workspace 文件、diff、命令、测试或产物验证

## Troubleshooting

- Antigravity 中仍显示多个 `agentmem`
  - 安装器只在 `%USERPROFILE%\.gemini\config\mcp_config.json` 注册一个 `agentmem`
  - 如果旧配置位于额外的非标准 registry，请带 `-AntigravityConfig` 重跑，让安装器清理指向同一 AgentMemory 服务的重复项；然后新开 Antigravity 会话

- `AGENTMEM_ANTIGRAVITY.md` 不存在
  - 先重新运行 `agentmem install --strict`
  - 如果旧 Antigravity registry 路径不标准，带上 `--antigravity-config` 清理重复项
  - 这个文件是 AgentMemory 为 Antigravity 生成的窄规则面，只负责 working-memory 恢复、证据验证和里程碑记录边界

- `agy plugin list` 中没有 `agentmem`
  - 重新执行 `agentmem install --strict`；安装器会调用官方 `agy plugin install` 激活 hooks plugin
  - 检查 `%USERPROFILE%\.gemini\config\import_manifest.json` 与 `%USERPROFILE%\.gemini\config\plugins\agentmem\hooks.json`

- `Bootstrap scaffolded ...\.agentmem\.env`
  - 说明 `.env` 只是模板，还没有真实凭证
  - 填完 `AGENTMEM_LLM_*` 再重跑

- `/admin` 没有起来
  - 先运行 `agentmem status`
  - 新开一次受管 Agent 会话可触发安全按需启动
  - 检查 `%USERPROFILE%\.agentmem\worker-status.json`、`worker.pid`、`logs\worker-autostart.log` 与 `logs\worker.err.log`
  - 手动 workbench 启动问题再检查仓库 `logs/workbench/` 下最新 `worker-*.err.log`

- `OpenCode` 成功写入了 `opencode.jsonc` 但仍无效果
  - 先确认 `%USERPROFILE%\.config\opencode\plugins\agentmem-plugin.mjs` 存在
  - 确认插件指向当前 checkout 的 `dist/hooks/opencode-session-start.js`、`dist/hooks/opencode-user-prompt.js` 与 `dist/hooks/opencode-post-tool.js`
  - 确认 `mcp.agentmem.environment.AGENTMEM_AGENT_ID` 为 `opencode`，且 `%USERPROFILE%\.config\opencode\AGENTS.md` 有 AgentMemory managed block
  - 完全退出并重启 OpenCode，使新插件文件生效
  - 如需使用 Vault，同一份 `vault-sync` 技能可通过 junction 暴露在 `%USERPROFILE%\.agents\skills\vault-sync\SKILL.md`；OpenCode 的 `skill` 工具应能列出 `vault-sync`
