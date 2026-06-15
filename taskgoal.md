# Task Goal

## Objective

在 `2026-06-15` 对照本地参考视频 `E:\Temp\15\AgenticMem Reference\AgenticMem.mp4` 之后，确认 AgentMemory 已经超过“向量库 + RAG + 拼 Prompt”的 demo 阶段，但距离“分层、受策略驱动、具备时间约束与程序性技能闭环的 agentic memory system”仍有五个关键缺口。

本任务的目标，是在不破坏现有稳定能力的前提下，把 AgentMemory 从“共享记忆底座 + 管理工作台”推进到“更接近 AgenticMem 参考架构的可执行记忆系统”。

## Scope

本轮优化聚焦以下五项差距，按从高到低优先级执行：

1. `Policy brain` 仍然过弱
   当前系统主要依赖 session-start hook、post-tool hook、MCP 手动调用和人工判断，缺少一个显式的策略层来决定：
   - 什么时候应该读取记忆
   - 什么时候应该写入 observation
   - 什么时候应该提升为 structured state
   - 什么时候应该生成、采用、拒绝或淘汰 procedural skill
   - 什么时候应该触发压缩、去噪、回顾或跳过

2. `Procedural memory` 仍停留在候选层
   当前 `daily_memory_digests` 里已经有 `skill_candidates`，但它们只是可审阅 JSON，尚未成为可检索、可执行、可追踪成功率的第一类对象。

3. `Temporal memory` 只完成了存储层的一半
   当前 `state_facts` 已具备 `effective_at`、`recorded_at`、`superseded_at`，但时间语义尚未统一扩展到检索、上下文构建和查询接口，系统还不能稳定地按“某一时间切片下的真相”工作。

4. Memory layers 还不够显式
   当前系统已经有 observations、state facts、daily digests、startup context，但距离参考视频中的清晰四层仍差一步：
   - 会话元数据层
   - 用户/项目结构化档案层
   - 近期摘要层
   - 当前滑动窗口接口层

5. `Sliding window` 仍然完全外置
   当前 AgentMemory 假设宿主 agent 或模型自己管理近程上下文窗口，系统本身没有明确的窗口契约、预算接口或滚动摘要接口，因此还没有形成完整的“长期记忆 + 近期上下文”闭环。

## Reference Baseline

本 goal 参考本地视频 `E:\Temp\15\AgenticMem Reference\AgenticMem.mp4`，但视频仅作为架构意图来源，不作为逐句验收文本。

本 goal 仅把下列视频原则视为约束：

- memory 必须分层，而不是退回到“纯向量检索 + 拼 prompt”
- `policy` 必须成为显式系统组件，而不是散落在多处的隐式行为
- `procedural memory` 必须从候选概念推进到第一类对象
- `temporal memory` 不能只停留在存储字段，必须进入查询与上下文路径
- `sliding window` 即使不完全由 AgentMemory 托管，也必须有明确契约

## Non-binding Video Aspects

下列内容不作为验收标准：

- 视频中的类比、口头表述、演讲顺序和示意图布局
- 与当前 repo 产品边界不一致的能力假设
- 无法转换为代码、接口、测试或诊断项的抽象判断
- 单纯“是否和视频讲法一致”的主观对比

## Required Outcomes

本轮完成后，系统至少要达到以下结果：

1. 新增一个显式的 memory policy/orchestrator 层
   它必须是代码中的一等组件，而不是分散在 hook、worker、digest 和 admin UI 里的隐式规则集合。

2. 新增第一版 procedural memory pipeline
   至少包括：
   - procedural skill 的持久化存储
   - 基于触发条件或相似任务的检索
   - 面向 agent 的可执行呈现格式
   - 成功/失败反馈记录
   - 审核、启用、停用或淘汰机制

3. 把时间约束扩展为统一查询能力
   至少包括：
   - `state` 查询按 `as_of` 工作
   - `context` 构建支持时间切片
   - 相关检索接口避免把过期真相当成当前真相
   - 明确区分现实生效时间与系统记录时间

4. 把 memory layers 在接口与数据模型中显式化
   至少包括：
   - metadata/profile/recent-summary/ledger 的清晰职责边界
   - `ProjectContextView` 或其后继结构按层消费这些数据
   - startup path 与 drill-down path 的职责分离

5. 给 sliding window 补上明确契约
   不要求 AgentMemory 自己实现 LLM token window，但必须提供：
   - 面向宿主 agent 的近期上下文输入契约
   - 近程摘要或滚动压缩接口
   - 与长期记忆的边界说明
   - 至少一条实际调用路径或验证路径

## Guardrails

- 不要破坏现有四端集成：Claude Code、Codex、OpenCode、Antigravity。
- 不要破坏现有 `/admin` workbench、runtime policy、release/install/bootstrap 流程。
- 尽量采用 additive schema 和 additive API，而不是推翻现有 `observations`、`state_facts`、`daily_memory_digests`。
- 保持“reviewable before promotion”原则：
  `state_fact_candidates` 和 `skill_candidates` 不能在没有显式 gate 的情况下直接变成长期真相。
- 如果必须引入自动提升或自动执行，必须同时提供：
  - 可见性
  - 可回滚性
  - 关闭开关
  - 测试覆盖

## Suggested Execution Order

1. 先抽出显式 `policy` 服务与统一决策入口。
2. 再把 `skill_candidates` 升级为 procedural memory 的第一版正式数据层与查询层。
3. 然后把 temporal semantics 扩展到 `context`、`search`、`state` 三条读路径。
4. 再重构 startup context，使 memory layers 更显式。
5. 最后补 sliding-window contract、验证路径与文档。

## Acceptance Criteria

- 有新的代码级 policy/orchestrator 组件，并由测试证明读写/提升/跳过规则不是散落实现。
- procedural skills 成为正式存储对象，不再只是 digest 里的候选字段。
- 至少一条 agent 读取路径能基于 policy 决定“是否查记忆、查哪类记忆、是否采用 skill”。
- 时间切片语义能覆盖当前真相读取与至少一类检索/上下文构建路径。
- `ProjectContextView` 或替代结构能更清晰地区分 metadata、profile、recent summary、ledger-derived context。
- README 和 `/admin` 必要界面或 diagnostics 已同步到新能力。
- `npm run build` 与相关 `tests/*.test.cjs` 通过。
- 视频只用于校验方向是否对齐，不用于替代 repo 内可执行验收条件。

## Non-Goals

- 本轮不要求重做整个 UI 视觉系统。
- 本轮不要求替换现有 installer/bootstrap/release discipline。
- 本轮不要求把所有候选结论都改成全自动 promotion。

## Completion Definition

当以上五项差距都至少完成一版可运行、可测试、可验证的实现，并且不破坏现有稳定能力时，视为本 goal 完成。
