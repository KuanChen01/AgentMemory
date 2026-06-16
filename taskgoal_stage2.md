# Task Goal Stage 2

## Objective

在 `2026-06-16` 的当前实现基础上，AgentMemory 已经完成从 demo memory 到“分层、受策略驱动、具备时间语义与 procedural skill 基础闭环”的 v1 过渡，但距离“成熟生产级 agentic memory 闭环”仍有明显差距。

本阶段的目标，不再只是补齐架构组件，而是把现有能力推进到一个更可持续的运行闭环：让 AgentMemory 不仅能“存、查、展示”，还要能在真实任务里更稳定地决定什么时候读、什么时候写、什么时候压缩、什么时候推荐技能、什么时候跳过，并把这些决定以可验证、可回放、可运维的形式落地。

换句话说，Stage 2 的验收标准不是“又多了一层能力”，而是 AgentMemory 必须更接近一个真正可上线、可审计、可长期维护的 agentic memory runtime。

## Scope

本轮优化聚焦以下五个 Stage 2 差距，按优先级执行：

1. `Policy brain` 仍然只是显式规则集合，不是成熟 orchestrator
   当前 `memory-policy.ts` 已经集中承载部分读写与 promotion 规则，但它仍偏静态 helper。Stage 2 需要把它推进成一个更完整的决策层，至少能够：
   - 在 startup / task_query / drill_down / post-task 等不同场景下做分层决策
   - 决定何时读取 observation、state、digest、procedural skills、sliding window
   - 决定何时写 observation、何时只更新 state、何时跳过写入
   - 决定何时推荐 skill、何时抑制 skill、何时触发压缩或回顾
   - 产出可追踪的 decision trace，而不是只返回最终结果

2. `Procedural memory` 仍是 operator-managed library，不是持续学习闭环
   当前 procedural skills 已经是一等对象，也有 promote / status / feedback，但还缺少更成熟的学习回路：
   - 从成功轨迹中更稳定地提炼 skill candidate
   - 对相似 skill 做去重、合并或版本演进
   - 依据反馈对 skill 的推荐强度、启用状态或退役建议做调整
   - 提供 evidence、history 和 adoption reason，而不仅是当前计数
   - 让 agent 真正能在任务流中“采用 skill”，而不只是被动展示

3. `Temporal memory` 还没有成为系统级硬约束
   当前 `as_of` 已进入多条读路径，但还没有形成“默认不会混时间”的系统保证。Stage 2 需要把时间语义提升为硬约束：
   - 明确区分 `effective_at` 与 `recorded_at`
   - 为 state / context / search / memory query / procedural skill read 建立统一时间切片语义
   - 避免 future leakage、stale truth resurrection 和跨层时间混淆
   - 在 diagnostics 和 tests 中能直接看出系统为什么读到某个时间切片下的真相

4. `Sliding window` 仍是静态 contract，不是可消费的近程上下文服务
   当前系统已经返回 `sliding_window` contract，但更像一个说明书，而不是实际可用的上下文构建层。Stage 2 需要把它推进成真正的 bounded context package：
   - 可按任务生成近期上下文包
   - 带预算、来源层、压缩规则和裁剪顺序
   - 能清楚区分“长期记忆层”和“本轮输入窗口”
   - 至少有一条真实调用路径把这个 package 注入 host 读路径

5. `Host integration + ops visibility` 仍偏手动
   当前很多高级能力仍通过 MCP 手动调用、admin workbench 操作或开发者显式验证完成。Stage 2 需要把“系统闭环”推进到至少一条真实宿主链路：
   - 至少一条 host 路径能自动触发 policy-driven memory read
   - 至少一条 host 路径能消费 procedural skill recommendation 或 bounded context package
   - `/admin` 能展示 decision trace、skill evidence、feedback history、time-slice diagnostics、window package 指标
   - 运维者能够判断“系统为什么这么做”，而不是只能看到最终结果

## Reference Baseline

本 goal 继续参考本地视频 `E:\Temp\15\AgenticMem Reference\AgenticMem.mp4`，以及转录文件 `E:\Temp\15\AgenticMem Reference\transcriber-output\expanded\transcript.md`。

Stage 2 主要继承视频中的以下约束：

- 记忆系统必须是 `ledger -> views -> policy` 的系统工程，而不是单纯检索层
- agentic memory 的关键不只是“能查记忆”，而是“把记忆变成 agent 主动调度的工具”
- 时间语义必须通过双时间轴和时间切片进入底层约束
- procedural memory 必须从“记住是什么”升级到“记住怎么干”
- 近期窗口不能只存在于宿主脑补中，必须有明确边界与可消费接口

## Non-binding Video Aspects

下列内容不作为验收标准：

- 视频中的叙事顺序、类比、示意图风格和口头表达
- 与当前 repo 产品边界不一致的自动化假设
- 无法落成代码、接口、测试、文档或诊断项的抽象判断
- 单纯“看起来更像视频”但缺少工程可验证性的实现

## Required Outcomes

本轮完成后，系统至少要达到以下结果：

1. 新增 Stage 2 级别的 policy/orchestrator
   至少包括：
   - 统一的 decision input / output model
   - 适用于不同 read/write 场景的策略入口
   - 可解释的 decision trace / reasons
   - 至少一条真实调用路径自动使用它，而不是只在测试里存在

2. procedural memory 进入持续学习闭环
   至少包括：
   - skill candidate 到正式 skill 的更稳健提炼路径
   - feedback history 或 adoption evidence
   - 相似 skill 的 dedupe / merge / supersede 机制之一
   - 基于反馈或证据的 recommendation / retirement signal
   - 至少一条任务路径能真实消费 skill recommendation

3. temporal semantics 升级为系统级 invariant
   至少包括：
   - `effective_at` / `recorded_at` 的清晰职责
   - `as_of` 贯通 state、context、search、query_memory、skills 读路径
   - 至少一组 regression tests 防止 future leakage
   - diagnostics 能说明命中的“当时真相”和“记录时间”

4. sliding window 变成可消费的 bounded context layer
   至少包括：
   - 生成可注入的 task-scoped context package
   - budget / ordering / trimming / provenance 元数据
   - 长期层与近程层的边界说明
   - 至少一条真实调用或 live smoke 路径

5. `/admin` 升级到 Stage 2 运维可见性
   至少包括：
   - policy decision trace 可视化
   - procedural skill evidence / feedback history / recommendation signal
   - temporal slice diagnostics
   - sliding-window/context package 指标或预览

## Guardrails

- 不要破坏现有四端集成：Claude Code、Codex、OpenCode、Antigravity。
- 不要破坏现有 `/admin` workbench、runtime policy、release / install / bootstrap 流程。
- 优先 additive 设计，除非某个 Stage 1 结构明确阻碍 Stage 2 闭环。
- 保持 `reviewable before promotion` 为默认原则；如果引入更自动化的 adoption / recommendation，必须同时提供：
  - 可见性
  - 可关闭性
  - 可回滚性
  - 测试覆盖
- 不要把“自动执行 skill”当成默认目标；Stage 2 重点是 recommendation / orchestration / bounded context，不是无门槛自动化。
- 任何新的自动策略都必须留下可解释证据，而不是 silent magic。

## Suggested Execution Order

1. 先定义 Stage 2 目标架构：orchestrator、decision trace、bounded context package、procedural adoption loop 的职责边界。
2. 把 `memory-policy` 演进为统一的 policy/orchestrator 入口，并补 decision trace 数据模型。
3. 把 sliding-window contract 升级为可消费的 context package / runtime interface。
4. 把 procedural skill lifecycle 推进到 feedback-aware recommendation / evidence / dedupe / retirement loop。
5. 强化 temporal invariants，把 `as_of` 与 dual-time semantics 统一到读路径和 diagnostics。
6. 选定至少一条真实 host 或 hook 路径，接入自动的 policy-driven memory read / context package consumption。
7. 最后补 `/admin`、README、tests 和 live smoke，证明这不是只在源码里存在的架构。

## Acceptance Criteria

- 有一个新的或显著演进的代码级 orchestrator / policy 层，不再只是静态 helper 函数集合。
- 至少一条真实 agent 或 host 路径会自动触发该 orchestrator，而不是完全依赖人工 MCP 调用。
- procedural skills 不仅能被管理，还能被系统基于任务与证据推荐；至少存在 feedback-aware 的 recommendation / retirement / dedupe 机制之一。
- 系统能生成 bounded context package，并明确说明来自哪些 memory layers、如何裁剪、预算是多少。
- `effective_at` / `recorded_at` / `as_of` 的语义在关键读路径上被统一实现，并由 regression tests 验证不会把未来真相混进过去。
- `/admin` 至少新增一组 Stage 2 diagnostics，能看见 decision trace、skill evidence 或 bounded context metrics。
- `npm run build` 与相关 `tests/*.test.cjs` 通过。
- 至少完成一轮 live smoke，证明新闭环不是纯测试替身。

## Non-Goals

- 本轮不要求重做现有视觉系统或整体前端风格。
- 本轮不要求把所有 host 都同时升级到自动 orchestration。
- 本轮不要求在没有 guardrail 的前提下做全自动 skill 执行。
- 本轮不要求推翻当前 Stage 1 数据层，只在必要时做 additive 或受控演进。

## Completion Definition

当 AgentMemory 至少在一条真实任务链路上实现以下闭环时，视为本 goal 完成：

- agent 或 host 能自动触发 memory orchestration
- orchestrator 能按任务决定读取哪些层、是否采用 procedural skill、是否构造 bounded context package
- 系统对时间切片的真相读取是稳定且可解释的
- procedural memory 会基于真实结果继续学习、收敛或退役
- operator 能在 `/admin` 里看到这一切为什么发生

也就是说，Stage 2 完成时，AgentMemory 应该从“具备这些组件”前进到“这些组件已经开始形成成熟生产级的 agentic memory 闭环”。
