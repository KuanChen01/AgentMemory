# 安装说明

🌐 [English](./Installation.md) | 中文

这里补充 [README](../README.zh.md) 快速开始里省略的内容：Windows bootstrap 的每一步、LLM 配置、打开面板、其他平台、参数，以及安装器会在本机改动哪些文件。

## 环境要求

- Windows 10/11 是主要、测试最充分的平台。macOS 和 Linux 可用但测试较少；一条命令的 bootstrap 只支持 Windows。
- [Node.js](https://nodejs.org/) 22 及以上（推荐 24）和 Git
- Windows 上可以用 Windows PowerShell 5.1 或 PowerShell 7
- 没有预编译原生 SQLite 二进制的平台需要本地编译工具
- 一个 OpenAI 兼容的 LLM 接口（云端服务或本地运行时都行），如果接口需要，再准备一个 API key

## Windows：一条命令

```powershell
git clone https://github.com/KuanChen01/AgentMemory.git
cd AgentMemory
.\bootstrap-second-machine.cmd
```

bootstrap 脚本会依次：

1. 运行 `npm install --ignore-scripts` 和 `npm run build`。
2. 创建或更新 `%USERPROFILE%\.agentmem\.env`。第一次运行时这个文件还不存在：bootstrap 会写入一个 key 为空的骨架，然后**报错停下**。填好其中三项 `AGENTMEM_LLM_*`（见[配置 LLM](#配置-llm)），再运行一次同样的命令。之后再运行时，bootstrap 只就地设置 key、URL、模型和端口，其余行全部保留。文件以原子方式替换，且只有你自己能读，不再写任何备份副本。（旧版本会在同目录留下 `.env.bak-<时间戳>` 备份，其中包含 API key。AgentMemory 不会自动删除它们；如果不需要，请自行删除。）
3. 运行 `npm link --ignore-scripts`，注册全局 `agentmem` 命令。
4. 以严格模式配置全部五个 agent（见[安装器会改动什么](#安装器会改动什么)）。
5. 复用已在运行的 worker 或启动一个新的，然后打开面板。

也可以省掉“停下再重跑”这一步：`.env` 里还没有 key 时，脚本会弹出隐藏输入的提示让你输入 key（直接回车可跳过），接口地址和模型可以直接传入：

```powershell
.\bootstrap-second-machine.cmd -ApiUrl <OpenAI 兼容地址> -Model <模型名>
```

key 不会出现在命令行里（否则会留在 shell 历史和进程列表中），脚本通过环境变量把它交给 Node。（为兼容旧脚本仍接受 `-ApiKey`，但会给出警告。）

其他参数：`-NoOpen`（不打开浏览器）、`-Port <n>`（worker 端口，默认 38888，会写入 `~/.agentmem/.env`）、`-AntigravityConfig <path>`（额外检查并去重的 Antigravity MCP 注册文件）。

bootstrap 是严格模式：五个 agent 里只要有一个在这台电脑上配置不了，就会停下并列出问题。只想接入当前可用的 agent，可以改用不带 `--strict` 的 `agentmem install`（能配的都配上，配不了的会报告出来）。

装好后重启各个 agent，让新的 hooks / MCP 配置生效。更详细的中文分步教程见 [第二台电脑 Bootstrap 教程](./Second%20Machine%20Bootstrap%20Guide.zh.md)。

## 配置 LLM

后台 worker 会把工具事件发给一个 OpenAI 兼容的 chat 接口，整理成记忆和每日总结。配置保存在 `~/.agentmem/.env`，不会进入代码仓库：

```env
AGENTMEM_LLM_API_KEY=your_api_key_here
AGENTMEM_LLM_API_URL=https://your-llm-endpoint.example/v1
AGENTMEM_LLM_MODEL=your-model-name

# 可选：接口不支持 JSON mode 时设为 true
AGENTMEM_LLM_DISABLE_JSON_MODE=false

# 可选：某些网关需要的额外 JSON headers
# AGENTMEM_LLM_HEADERS={"X-Custom-Auth":"value"}

AGENTMEM_PORT=38888
```

worker 运行后，可以在面板的 **LLM 设置**里切换模型或接口地址、保留或更换 key，并做实时连接测试，改动会保存到同一个 `.env`。全部配置项见[完整参考文档](./Reference.zh.md)，成本相关见 [LLM 成本控制](./LLM%20Cost%20Controls.md)。

## 网络说明

worker 只监听 `127.0.0.1`，所有接口（agent 读写记忆、`/shutdown`、管理面板）都会拒绝非本机请求；局域网里的其他电脑、容器和虚拟机都连不上它，也不提供对外开放的设置。本机上的任意本地进程都可以查询 worker。请求必须发往 worker 自己的源（`Host` 为 `127.0.0.1`/`localhost`/`[::1]` 加端口；浏览器发送 `Origin` 时也必须一致，否则返回 `403`），请求体必须是 JSON（否则返回 `415`），因此网页无法用 DNS rebinding 或 CSRF 访问它。macOS/Linux 上 `~/.agentmem` 只对你开放（目录 0700、文件 0600）。

## 打开面板

```powershell
.\start-workbench.cmd           # 菜单：启动 / 停止 / 重启 / 状态 / 打开面板
.\start-workbench.cmd start     # 需要时启动，并打开浏览器
npm run workbench               # 同上
```

面板地址：<http://127.0.0.1:38888/admin>。启动器默认使用 38888 端口；如果改过端口，用 `.\start-workbench.cmd start --port <n>`。

## macOS 和 Linux（少量测试）

```bash
git clone https://github.com/KuanChen01/AgentMemory.git && cd AgentMemory
npm install && npm run build
npm link --ignore-scripts       # 注册全局 agentmem 命令
agentmem install                # 配置五个 agent
agentmem start                  # 前台运行 worker；agent 的 hooks 也会按需自动启动它
```

LLM 可以在 `~/.agentmem/.env` 里配置，也可以在面板 <http://127.0.0.1:38888/admin> 的 **LLM 设置**里配置。

## 安装参数

```bash
agentmem install                                # 配置全部五个 agent，配置失败的会报告出来
agentmem install --strict                       # 任何一个 agent 配置失败就报错
agentmem install --no-claude-capture            # Claude Code 不开工具调用自动捕获
agentmem bootstrap-win --api-url <OpenAI 兼容地址> --model <模型名>
```

| 参数 | 作用 |
| --- | --- |
| `--strict` | 五个 agent 里任何一个配置失败就报错 |
| `--claude-capture` / `--no-claude-capture` | 开启或关闭 Claude Code 的工具调用自动捕获 |
| `--antigravity-config <path>` | 额外检查并去重的 Antigravity MCP 注册文件 |
| `--api-url`、`--model` | `bootstrap-win` 的 LLM 配置（key 请写在 `.env`、面板或 bootstrap 脚本的隐藏输入里，不要放在命令行上） |
| `--no-open`、`--port <n>` | `bootstrap-win`：不打开浏览器；使用另一个 worker 端口 |

## 卸载

```bash
agentmem uninstall --strict             # 移除 AgentMemory 的 hooks、MCP 条目和插件文件
agentmem uninstall --strict --purge-all # 同时清除保留的安装记录和备份
```

卸载也会删除 `~/.agentmem/.env` 和本地记忆数据库（`~/.agentmem/agentmemory.db`）。想保留记忆，请先停止 worker（`agentmem stop`）并关闭所有接入了 AgentMemory 的 agent，再把数据库连同旁边的 `-wal`、`-shm`、`-journal` 文件一起复制出来。AgentMemory 还在运行时只复制 `.db` 文件，可能会漏掉最近的记忆。同样的冷备份步骤见 [Native SQLite migration](./Native%20SQLite%20Migration.md)。

## 安装器会改动什么

| Agent | 安装器写入的内容 |
| --- | --- |
| Claude Code | `~/.claude.json` 里的 MCP server；`~/.claude/settings.json` 里的 SessionStart 和可选的 PostToolUse hooks |
| Codex（ChatGPT desktop / Codex CLI） | `~/.codex/config.toml` 里的 MCP server；`~/.codex/hooks.json` 里的 SessionStart、UserPromptSubmit、PostToolUse hooks |
| Antigravity | `~/.gemini/config/mcp_config.json` 里的一条 MCP 注册；通过 `agy plugin install` 启用的 hooks 插件 |
| OpenCode | `~/.config/opencode/` 下的 MCP server、桥接插件和全局规则 |
| Grok | `~/.grok/` 下的 MCP server、`agentmem` profile 和生命周期 hooks |

所有改动都先备份、只做合并：AgentMemory 只修改自己的条目，并记录在 `~/.agentmem/install-state.json` 里，`uninstall` 可以据此还原。

## 各部分如何配合

Hooks 把工具事件发给一个小型后台 worker，worker 用你选择的 LLM 做总结，存进本地 SQLite 数据库（全文检索 + 向量检索）。Agent 通过 stdio MCP server 和会话启动 hooks 读回记忆。任何环节出问题都不会阻塞：worker 没启动时，agent 照常工作。配置、CLI、面板 API 和各 agent 细节见[完整参考文档](./Reference.zh.md)。

## 截图

README 里的截图来自一个灌入虚构数据的一次性演示实例。
