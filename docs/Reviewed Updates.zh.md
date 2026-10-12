# Reviewed Updates

AgentMemory 的共享代码采用 **开发分支 → 上传 PR → 审核与修复 → 合并 master → 发布版本 → 各电脑独立升级**。此流程沿用 Vault 共享 Skill 的审查方式；每台电脑保留自己的记忆和配置。

## Development and Review

1. 在 `codex/<change-name>` 分支开发。完成构建、相关测试和必要的完整回归后，上传分支并建立以 `master` 为目标的 Draft PR。
2. PR 写清问题、最终行为、验证结果、升级步骤及尚未验证的机器。代码、测试和通用文档进入仓库；API key、真实 `.env`、数据库、usage 日志及个人取证材料留在本机。
3. 审核者检查 PR 的实际代码和当前 head commit，必要时在隔离环境复现。可以使用另一聊天或另一台电脑审核，不要求在生产数据库上试验。
4. 发现问题后在同一分支修复、重跑相关验证、推送并复审。PR head 改变后，先前通过的审核不能自动代表新提交通过。
5. 审核通过且维护者明确同意后，按已审 head 合并到 `master`。不自动合并、不自动把候选版本部署到所有机器。没有设置 GitHub 分支保护时，这些是维护流程约定，而非服务器强制门禁。
6. 按 [Release Process](Release%20Process.md) 准备版本。版本变更也经 PR 审核，正式 tag 和 GitHub Release 只从已合并的 `master` 创建。

本机可以在明确标记候选提交的前提下先试用；另一台默认选择已认可、已合并的提交或正式版本。手动 ZIP 补丁保留为应急移交方式，正常更新使用 GitHub 上的已审版本。

## Per-machine Upgrade

每台电脑分别执行升级。先确定同一个正式 tag 或已认可的完整 commit SHA，不自动跟随最新开发分支。记录本机当前提交、目标提交和 Node 版本。

1. 暂停 agent 工具活动，等待 Worker 摘要队列排空。新版 `/admin/api/overview` 的 `queue.pending=0` 且 `queue.processing=false` 表示工具摘要队列空闲；还需确认没有正在生成的日摘要。
2. 停止 Worker，并关闭或断开会继续访问本机 AgentMemory 数据库的 MCP 客户端。确认相关旧进程退出后，对本机 `.agentmem` 配置和数据库做一致的冷备份，保留仍存在的 WAL/SHM/journal 文件。不要拷贝正在打开的数据库。
3. 检查 Git 工作区。存在本机改动时先保留并审查，不强制覆盖、不重置工作区来完成升级。
4. `git fetch origin --tags`，选择已认可的 tag 或完整提交。保持 `master` 的 checkout 应只做 fast-forward，并确认结果等于选定版本；需要固定版本时可以 checkout 指定 tag/commit，但不能在 detached checkout 上随意开发。
5. 在选定源码运行 `npm ci --ignore-scripts` 和 `npm run build`。首次安装、集成规则变更或需要重新注册 agent 时，再使用 `bootstrap-second-machine.cmd`。**仅拉取源码不会重启已有 Worker，也不会刷新正在运行的 MCP 进程。**
6. 启动 `node dist/bin/workbench.js --no-open`，重新连接 MCP 客户端。检查 admin、真实记忆检索和新记忆保存，并记录本机源码提交及 Worker 运行位置。两台分别验收，不能用一台的通过代替另一台。

从旧 SQLite WASM 实现升级或涉及 schema 变化时，另外遵循 [Native SQLite Migration](Native%20SQLite%20Migration.md) 的兼容和回退规则。

## Local State

共享的是 `src/`、脚本、测试、通用文档及版本信息。各机保留自己的 API key、`.agentmem/.env`、预算选择、数据库、使用量日志、运行状态和 Vault/Daily Review 进度。默认不会把两台数据库合并，也不会把主机配置覆盖到另一台。

当前摘要预算功能默认关闭。升级后在本机 LLM 设置面板确认开关；已明确保存的本机选择继续保留。关闭思考和用量记录属于代码行为，不依赖传递密钥或数据库。

## Rollback

先停止新 Worker/MCP，保留升级后的本机数据快照，再选择之前的已审代码并重新安装、构建、启动与验收。不能为了回退代码而丢弃升级期间新增的记忆。数据库格式不兼容时，按对应迁移文档处理一致备份和后续数据核对，不能直接让旧驱动打开新库。
