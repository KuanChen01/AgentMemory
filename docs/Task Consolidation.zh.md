# 任务级合并（PR #3，叠加在 PR #2 之上）

必须与 Obsidian-Vault-Starter 的 PR #6b 一起审核、一起发布。

## 1. 采集：只用 hook，规则只做确定的事
采集来源只有各 agent 的 hook（Codex/OpenCode/Grok 的 post-tool 与 user-prompt hook）。**不读取 Codex transcript 文件**（第 4 轮曾加入的 transcript 读取器已在第 5 轮移除）。

规则（`src/services/event-classifier.ts`）只按工具名做确定的判断，在任何 LLM 调用之前：
- `drop`：`purpose=daily_review` 会话的全部事件、AgentMemory 自身记录、内务事件（sleep/wait 等），以及**成功的** plan/todo/skill/提问类工具（`update_plan`、`TodoWrite`、`Skill`、`AskUserQuestion` 等）。失败事件永不丢弃。
- 其余全部进入 `task_event_buffer`（`task`）。

**有意移除三类路由**：早期设计中的 `drop / evidence_only / candidate` 三路分流（只读命令只写证据、不进模型）已被有意取消。逐命令判断“是否只读”是前四轮审查大部分问题的来源（Windows 写命令被误判、证据窗口遗漏、分段续传等）。现在 Read/搜索/只读命令与其他调用一样进入任务，由**每个任务唯一的一次**模型调用决定是否值得记忆。代价是每任务输入更大（合成一天约 3k token/任务），但调用次数不变、超大任务从多段调用降为一次。审查时请不要把缺少 `evidence_only/candidate` 视为缺陷。

同时记录确定的“修改文件”信号：`apply_patch` 头部（支持 Windows 路径与 JSON 编码的补丁）和编辑类工具的路径参数。

## 2. 任务边界与一次调用
任务在以下时刻冻结（之后的事件不会再并入）：
- 下一次用户提问（user-prompt hook 调 `POST /tasks/boundary`）；
- `POST /sessions/close`；
- 空闲超时：会话 20 分钟无新事件（`AGENTMEM_TASK_IDLE_MINUTES`，默认 20）。

每个任务**只调用一次** LLM，发送整个任务。超过 `AGENTMEM_TASK_PROMPT_CHARS`（默认 24000 字符）时不分段：单个过大的调用保留头尾，再按调用保留前 60%/后 40%，中间用明确的 `[... omitted N chars ...]` 标记，结果记录 `omitted_chars`。
- 来源不完整（采集时超长，或工具自带的截断标记如 `Warning: truncated output`）、失败、或修改了文件的任务，模型返回 skip 也会保留为 observation。
- 每个工具事件有唯一 id（`hook:<session>:<call_id>`），重复投递只入库一次；每个任务结果 id 唯一，崩溃后重试复用已保存结果。
- 旧版分段任务（`segment_count > 1`）不会因第 0 段完成而视为完成；剩余内容生成新的整任务结果（`<task>-whole`），旧行保留为历史。
- 重试 5 次仍失败的任务在 overview 的 `stuck_tasks` 中显示。post-task review 每任务一次。

## 3. 去重
- 任务结果按内容 sha256 比对；看起来重复的结果**只关联到已有记忆并写入 `duplicate_flags`（`needs_confirmation`）待人工确认**，不删除任何数据。
- 每日 digest：同项目同日期、同一组来源、同 prompt 版本且已成功时，不再调用模型。

## 4. 不重复读取
- `GET /admin/api/work-overview?reader=<id>`：每条带 `sha256`；该 reader 已确认过且 sha256 未变的条目只返回 `{id, sha256, unchanged:true}`，不再发正文。
- `POST /admin/api/review-reads {reader, run_id, items:[{id, sha256}]}`：记录已核实的版本。
- `POST /admin/api/review-runs {reader, since, until}`：创建或续跑（按区间 + cursor）；`POST /admin/api/review-runs/progress` 保存 cursor/状态/指标。

## 5. 旧数据压缩
`agentmem compact-legacy [--days 7] [--apply]`：默认只演练（dry-run），统计计划调用次数与字符量；`--apply` 时把最近 7 天的旧逐步记录按会话合成任务级结果，**不删除、不修改任何旧行**，通过 `legacy_compaction_links` 关联，可重复执行（已压缩的不再处理）。

## 6. 迁移
全部为新增表/列（`CREATE TABLE IF NOT EXISTS`），旧表（如 `tool_evidence`）只读保留；`user_version` 仍为 1；没有删除、没有 TTL 清理。从旧版升级：未完成的旧任务（含分段任务、旧证据行）会继续排队并按新方式各调用一次。

## 7. 兼容开关
`AGENTMEM_TASK_CONSOLIDATION=false` 保留旧的逐事件摘要路径（仍先经过上述工具名规则），只用于对比测试。
