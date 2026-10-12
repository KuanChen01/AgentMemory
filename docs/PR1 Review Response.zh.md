# PR 1 Review Response

本轮回应对 `7cb7a8706a7858c7c469b902618c3ebffb615ea4` 的独立审核。修复仍在同一个 Draft PR 中，等待新 head 的独立复审；没有合并或发布。本机的候选试用不代表第二台已升级。

## Tool Event Regression

审核发现的 P1 属实：成功事件缺省 input/output 时，`JSON.stringify(undefined)` 未产生字符串，过滤器调用 `.trim()` 抛异常，Express 4 异步入口未捕获，导致 Worker 退出。

修复将缺省或 null 文本归一化为空字符串，保留有内容的字符串和结构化 JSON。过滤器本身也能处理缺省值。`/tools` 校验必需的字符串身份字段，入口异常返回受控响应。成功的全空事件跳过；失败事件继续处理，后续正常事件仍能保存。

`tests/worker-review-regressions.test.cjs` 用隔离 Worker、数据库、临时端口和本地 mock LLM，覆盖成功/失败各三种缺省文本组合、无效 tool_name、后续正常写入与进程存活。在原 head 构建产物上先观察到 ECONNRESET；修复后通过。不向正式服务发送崩溃复现请求。

## Header Persistence

既有 Headers 问题一并修复：配置保存用 JSON 引号转义，普通 dotenv 启动读取未解码反斜杠。新增共享加载入口，与面板读取使用一致解析；保留显式环境覆盖，也处理启动器已用 dotenv 读取后传给子进程的同文件转义值。Worker 和自动召回接入此入口。普通 dotenv 语法和重复配置的最后一次赋值保持可用。

新增回归保存包含引号、反斜杠和多个字段的非空 Headers，重启 Worker 后检查真实 mock 摘要请求及写入；再次模拟继承启动器环境并检查请求。修复前 mock 请求无法完成，修复后两条路径均通过。预算关闭状态及不发送摘要 max_tokens 的行为也得到验证。

## Portable Tests

`tests/install-bootstrap.test.cjs` 的 MCP 预期路径改为由测试 projectRoot 派生，不再固定开发机目录。将构建产物与测试复制到另一临时目录后，安装、Headers 和缺省文本相关 `19/19` 通过；该检查复用已安装的依赖，未声称是新的依赖冷安装。

## Verification and Next Review

- `npm run build` 通过。
- `node --test --test-concurrency=1 tests/*.test.cjs`：`146/146` 通过，无跳过或取消。
- 后续重复 .env 值的顺序边界补强后，环境加载、Worker HTTP 与 Headers 回归再次通过。
- 本轮回归使用本地 mock，不进行真实 DeepSeek 付费验收；之前的预算与用量行为继续保留。
- 依赖清单与锁文件未修改；报告提及的既有依赖漏洞不在本轮执行自动升级。

复审须先查询 PR 当前完整 head，再检查新增修复与完整 diff，在第二台隔离环境重跑。不要沿用原 head 的审核直接认可新提交，也不要在复审通过前合并、发布或升级第二台正式服务。
