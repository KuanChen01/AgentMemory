# LLM Cost Controls

AgentMemory tool summaries, daily digests and Chinese query rewrites explicitly disable thinking on the official `api.deepseek.com` endpoint. Provider extensions are omitted for other OpenAI-compatible endpoints. This is important for `deepseek-flash`, whose provider default enables paid reasoning.

## Optional output budgets

**Custom summary limits are OFF by default.** Open the admin workbench **LLM Settings** panel, enable **custom summary output limits**, enter separate tool-summary and daily-digest limits, then save. Saving applies to the running worker immediately and persists in the global `.agentmem/.env`; a subsequent worker restart keeps the setting. Disabling the feature retains the values for later use but omits `max_tokens` from tool-summary and daily-digest requests. The provider's own defaults and maximums still apply. No application-imposed limit does not mean the model can generate infinitely long responses.

| Task | Configured limit (summary limits apply only when enabled) |
| --- | ---: |
| Tool observation | 1024 |
| Daily digest | 3072 |
| Query rewrite | 80 |

For file-based configuration, set `AGENTMEM_OUTPUT_BUDGET_ENABLED=true` alongside `AGENTMEM_OBSERVATION_MAX_TOKENS` and `AGENTMEM_DIGEST_MAX_TOKENS`, then restart. Merely setting the numeric values does not enable limits. The panel validates integer values from 256 to 8192 before saving; invalid saves leave the previous configuration intact. Invalid manually edited numeric values use the default and larger values are capped when limits are enabled. An output with `finish_reason=length` is not parsed as a complete observation/digest and is not retried with a larger paid request. Existing raw failure fallback remains available. A successful tool execution with an unavailable or truncated summary can therefore produce no observation; the panel describes this risk. Provider limits can still produce `length` when custom budgets are off.

To observe costs without a custom summary output limit, leave the budget switch off. Non-thinking requests and metering remain enabled. Query rewrites (80 tokens) keep their pre-existing small task limit; the switch controls memory summaries only. Raw input character limits remain separate and unchanged.

Raw tool input/output retain their existing 10000/20000 character defaults, configurable with `AGENTMEM_TOOL_INPUT_MAX_CHARS` (1000–30000) and `AGENTMEM_TOOL_OUTPUT_MAX_CHARS` (1000–60000). Oversized text keeps its beginning and end with a truncation marker so final verification results survive. All middle content is outside the model's evidence.

Before a paid request, the worker skips AgentMemory self-tools, successful sleep/clock/plan/wait-agent events, and successful events with both empty input and empty output. Reads, searches, process completion waits, modifications with meaningful input but empty output, and failures remain eligible. The existing semantic write policy still runs after summarization.

## Metering across machines

Every successful HTTP chat response containing usage is appended to `<runtime>/logs/llm-usage-YYYY-MM-DD.jsonl`. Runtime defaults to the user's `.agentmem` directory; the filename uses the **UTC date**, while each row contains an ISO timestamp. Group timestamps in `Asia/Shanghai` for comparison with the local-time DeepSeek dashboard.

Rows include machine hostname, task, returned model, prompt/completion/total tokens, cache hits/misses, reasoning tokens when reported, latency, and finish reason. Missing counters are `null`, not zero. Prompts, generated text, credentials and custom headers are excluded. Both computers sharing an API key need the updated worker and hooks. Merge the two machines' usage files by timestamp and machine; the dashboard can also include other uses of that key, requests preceding this change, or requests whose response was lost/timed out. Metering is not a complete billing ledger in those cases.

Official Flash prices checked on 2026-10-12: off-peak cache hit ¥0.02/M, cache miss ¥1/M, output ¥4/M; peak rates are twice those values. Beijing time weekday 09:00–12:00 and 14:00–18:00, excluding Chinese statutory holidays, are peak. Weekends are off-peak. Do not hard-code these prices as permanent rates. Sources: [pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/), [thinking mode](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/), [cache rules](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/).
