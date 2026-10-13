# 任务级合并（PR #3，叠加在 PR #2 之上）

必须与 Obsidian-Vault-Starter 的 PR #6b 一起审核、一起发布。

## 1. 先分流，再花钱
每个工具事件在任何 LLM 调用或 embedding 之前按规则分成三类（`src/services/event-classifier.ts`）：
- `drop`：空事件、内务事件（sleep/update_plan 等）、AgentMemory 自身记录、以及 `purpose=daily_review` 会话的全部事件。
- `evidence_only`：只读检查（Read/Grep/搜索、只读 shell 命令如 `rg`、`git status`、`cat`）。写入 `tool_evidence` 小表（输入/输出各前 400 字符 + 字节数 + sha256），永久保留，**从不调用模型**。
- `candidate`：写操作、构建/测试、失败事件等，进入 `task_event_buffer` 等待任务结束。

## 2. 任务级合并
一个任务的全部 candidate 事件只做**一次** LLM 调用，生成一条任务结果（`task_results` 表 + 一条 observation，`source_kind='task'`）。触发条件：
- 下一次用户提问（Codex / OpenCode / Grok 的 user-prompt hook 调 `POST /tasks/boundary`）；
- `POST /sessions/close`；
- 空闲超时：会话 20 分钟无新事件（`AGENTMEM_TASK_IDLE_MINUTES`，默认 20）。

超大任务按 `AGENTMEM_TASK_SEGMENT_CHARS`（默认 24000 字符）切段，每段一次调用。post-task review 每个任务只跑一次。Claude Code 本轮不加 hook。

原始 candidate 行保留并通过 `task_result_id` 关联到结果；崩溃中断的认领在重启时归还缓冲区。

## 3. 去重
- 任务结果按内容 sha256（`observation_content_hashes`）去重，重复结果不再保存、不再 embedding。
- 每日 digest：同项目同日期、同一组来源、同 prompt 版本且已成功时，不再调用模型。

## 4. 不重复读取
- `GET /admin/api/work-overview?reader=<id>`：每条带 `sha256`；该 reader 已确认过且 sha256 未变的条目只返回 `{id, sha256, unchanged:true}`，不再发正文。
- `POST /admin/api/review-reads {reader, run_id, items:[{id, sha256}]}`：记录已核实的版本。
- `POST /admin/api/review-runs {reader, since, until}`：创建或续跑（按区间 + cursor）；`POST /admin/api/review-runs/progress` 保存 cursor/状态/指标。

## 5. 旧数据压缩
`agentmem compact-legacy [--days 7] [--apply]`：默认只演练（dry-run），统计计划调用次数与字符量；`--apply` 时把最近 7 天的旧逐步记录按会话合成任务级结果，**不删除、不修改任何旧行**，通过 `legacy_compaction_links` 关联，可重复执行（已压缩的不再处理）。

## 6. 迁移
全部为新增表（`CREATE TABLE IF NOT EXISTS`），`user_version` 仍为 1；没有删除、没有 TTL 清理。

## 7. 兼容开关
`AGENTMEM_TASK_CONSOLIDATION=false` 保留旧的逐事件摘要路径（仍先经过规则分流），只用于对比测试。
