interface TomlSection {
  name: string | null;
  lines: string[];
}

const TOP_LEVEL_SECTION = /^\s*\[([^\[\]]+)\]\s*$/;
const GROK_RULES_START = '<!-- AgentMemory Grok Vault Rules: START -->';
const GROK_RULES_END = '<!-- AgentMemory Grok Vault Rules: END -->';
const MANAGED_HOOKS_FALSE = 'hooks = false # AgentMemory managed';
const ORIGINAL_HOOKS_PREFIX = '# AgentMemory original compat.claude hooks = ';

function normalizeToml(toml: string): string {
  return toml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseTomlSections(toml: string): TomlSection[] {
  const sections: TomlSection[] = [{ name: null, lines: [] }];
  let current = sections[0];

  for (const line of normalizeToml(toml).split('\n')) {
    const match = line.match(TOP_LEVEL_SECTION);
    if (match) {
      current = { name: match[1], lines: [] };
      sections.push(current);
      continue;
    }
    current.lines.push(line);
  }

  return sections;
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

function formatTomlSections(sections: TomlSection[]): string {
  const parts: string[] = [];
  const rootLines = trimBlankEdges(sections[0]?.lines || []);
  if (rootLines.length > 0) parts.push(rootLines.join('\n'));

  for (const section of sections.slice(1)) {
    const lines = trimBlankEdges(section.lines);
    parts.push(`[${section.name}]${lines.length > 0 ? `\n${lines.join('\n')}` : ''}`);
  }

  return `${parts.join('\n\n').trimEnd()}\n`;
}

function withoutAssignments(lines: string[], keys: string[]): string[] {
  const patterns = keys.map((key) => new RegExp(`^\\s*${key}\\s*=`, 'i'));
  return lines.filter((line) => !patterns.some((pattern) => pattern.test(line)));
}

function withoutExactAssignment(lines: string[], key: string, value: string): string[] {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*${value}\\s*(?:#.*)?$`, 'i');
  return lines.filter((line) => !pattern.test(line));
}

function findHooksAssignment(lines: string[]): { line: string; value: 'true' | 'false' } | null {
  for (const line of lines) {
    const match = line.match(/^\s*hooks\s*=\s*(true|false)\s*(?:#.*)?$/i);
    if (match) {
      return { line, value: match[1].toLowerCase() as 'true' | 'false' };
    }
  }
  return null;
}

function isManagedHooksAssignment(line: string): boolean {
  return /#\s*AgentMemory managed\s*$/i.test(line);
}

function removeManagedCompatHooks(lines: string[]): string[] {
  let originalValue: 'true' | 'false' | null = null;
  const output: string[] = [];

  for (const line of lines) {
    const originalMatch = line.match(/^\s*#\s*AgentMemory original compat\.claude hooks\s*=\s*(true|false)\s*$/i);
    if (originalMatch) {
      originalValue = originalMatch[1].toLowerCase() as 'true' | 'false';
      continue;
    }
    if (isManagedHooksAssignment(line)) continue;
    output.push(line);
  }

  if (originalValue) {
    output.push(`hooks = ${originalValue}`);
  }
  return output;
}

export function ensureGrokConfigToml(toml: string, mcpServerPath: string): string {
  const output: TomlSection[] = [{ name: null, lines: parseTomlSections(toml)[0]?.lines || [] }];
  const parsed = parseTomlSections(toml);
  let agentIndex: number | null = null;
  let compatIndex: number | null = null;
  let mcpIndex: number | null = null;
  const agentLines: string[] = [];
  const compatLines: string[] = [];

  for (const section of parsed.slice(1)) {
    if (section.name === 'mcp_servers.agentmem') {
      mcpIndex ??= output.length;
      continue;
    }
    if (section.name === 'agent') {
      agentIndex ??= output.length;
      agentLines.push(...withoutAssignments(section.lines, ['name']));
      continue;
    }
    if (section.name === 'compat.claude') {
      compatIndex ??= output.length;
      compatLines.push(...section.lines);
      continue;
    }
    output.push({ name: section.name, lines: section.lines });
  }

  const insertAt = (index: number | null, section: TomlSection) => {
    output.splice(index ?? output.length, 0, section);
  };
  insertAt(agentIndex, { name: 'agent', lines: ['name = "agentmem"', ...trimBlankEdges(agentLines)] });
  const existingHooks = findHooksAssignment(compatLines);
  const compatWithoutHooks = withoutAssignments(compatLines, ['hooks']);
  const managedCompatLines = existingHooks?.value === 'false' && !isManagedHooksAssignment(existingHooks.line)
    ? [existingHooks.line, ...trimBlankEdges(compatWithoutHooks)]
    : [
      ...(existingHooks?.value === 'true' && !isManagedHooksAssignment(existingHooks.line)
        ? [`${ORIGINAL_HOOKS_PREFIX}true`]
        : []),
      MANAGED_HOOKS_FALSE,
      ...trimBlankEdges(compatWithoutHooks),
    ];
  insertAt(compatIndex === null ? null : Math.min(compatIndex + 1, output.length), {
    name: 'compat.claude',
    lines: managedCompatLines,
  });
  insertAt(mcpIndex, {
    name: 'mcp_servers.agentmem',
    lines: [
      'command = "node"',
      `args = [ ${JSON.stringify(mcpServerPath)} ]`,
      'env = { AGENTMEM_AGENT_ID = "grok" }',
    ],
  });

  return formatTomlSections(output);
}

export function removeGrokAgentMemoryConfig(toml: string): string {
  const output: TomlSection[] = [{ name: null, lines: parseTomlSections(toml)[0]?.lines || [] }];
  const parsed = parseTomlSections(toml);

  for (const section of parsed.slice(1)) {
    if (section.name === 'mcp_servers.agentmem') continue;

    if (section.name === 'agent') {
      const lines = withoutExactAssignment(section.lines, 'name', '["\']agentmem["\']');
      if (trimBlankEdges(lines).length > 0) output.push({ name: section.name, lines });
      continue;
    }
    if (section.name === 'compat.claude') {
      const lines = removeManagedCompatHooks(section.lines);
      if (trimBlankEdges(lines).length > 0) output.push({ name: section.name, lines });
      continue;
    }
    output.push({ name: section.name, lines: section.lines });
  }

  return formatTomlSections(output);
}

export function renderGrokAgentProfile(): string {
  return `---
name: agentmem
description: AgentMemory-aware Grok development agent.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# AgentMemory Grok Profile

The user-level \`~/.grok/AGENTS.md\` file supplies the Vault workflow for every Grok profile. Keep its instructions enabled.

For startup recovery, make \`get_project_context\` the first AgentMemory memory read. The configured MCP identity is canonical \`grok\`.

Normal tool activity is captured by hooks. For a deliberate milestone, call \`record_memory\` with concise verified facts, files read or modified, decisions, and validation.
`;
}

function renderGrokGlobalRulesBody(): string {
  return `# AgentMemory Grok Vault Rules

## Obsidian Sync Rules

### Root Rule

当 workspace root 存在 \`obsiguide.md\` 时，把它作为唯一项目级 Obsidian sync contract。若根目录缺失 \`obsiguide.md\` 但存在 \`obsiguide.template.md\`，必须先按模板创建并完成初始化，再开始正常 repo 工作。

### Bootstrap Gate

在 \`repo_path\`、\`repo_kind\`、\`primary_stack\`、\`project_note\`、\`entry\`、\`areas\`、\`domain\` 任一关键字段为空时，\`obsiguide.md\` 仍未初始化。先用已验证的 workspace evidence 回填；如果映射项目笔记在 \`E:\\Kuan\\Vault\\02_Projects\` 不存在，先创建它。无法推断的字段写 \`unmapped\`，并在 \`Open Questions\` 说明缺口；找不到模板时报告 workspace is not bootstrap-ready，不要臆造合同。

### Memory Boundary

- \`agentmem\` 是 session recovery 与跨 agent working memory；\`E:\\Kuan\\Vault\` 是正式 durable knowledge base。
- AgentMemory 返回一律是待验证 working memory，不能把 raw summary、timeline 或 session recap 直接写入 Vault。
- 冲突优先级固定为：current workspace evidence > \`obsiguide.md\` > existing vault notes > \`agentmem\` > model memory。

## Workflow

### Before the task

1. 读取 workspace root 的 \`obsiguide.md\`；缺失时按 \`99_System/obsiguide.template.md\`、再按 root \`obsiguide.template.md\` 的优先级 bootstrap。
2. 读取 \`E:\\Kuan\\Vault\\Home.md\`、\`Vault Guide.md\`、\`99_System/Agent Workflow Contract.md\`，以及任务相关的 Project、Issue、Knowledge 笔记。
3. \`get_project_context\` 是首个 AgentMemory memory read；需要针对性回溯时再调用 \`search_memory\` 或 \`memory_timeline\`，并先验证所有 memory-derived claim。

### During the task

1. 仅在 \`obsiguide.md\` 的 promote 条件满足且证据已验证时，更新 Project、Issue、Decision、Knowledge 或 Experiment 笔记。
2. 更新 \`obsiguide.md\` 中与当前 workspace 有关的 goal、verified commands、constraints、open questions、durable changes 和 next action。
3. Vault 笔记保持英文文件名、H1、章节、frontmatter、tags 和 Dataview；正文叙述使用中文。daily 使用 \`## Focus\`、\`## Summary\`、\`## Project Ledger\`。
4. 不把推测写成事实，也不要把每个中间步骤写入 Vault 或 AgentMemory。

### Before finishing

1. 若产生 durable information，更新映射项目笔记及必要的 Issue、Decision、Knowledge 或 Experiment 笔记。
2. 对明确里程碑调用 \`record_memory\`，仅保存简洁、已验证的事实、决策、验证结果和读写文件；普通 hooks 已自动记录工具活动。
3. 报告读取和修改过的 repo / Vault 文件，以及仍不确定的事项。

## Important Interpretation

- \`obsiguide.md\` 是 repo-local sync guide，不是长期知识库。
- 不要将 repo-root \`AGENTS.md\`、\`CLAUDE.md\` 或 \`GEMINI.md\` 当作项目级 sync contract；项目合同始终是 root \`obsiguide.md\`。
`;
}

export function renderGrokGlobalRules(): string {
  return `${GROK_RULES_START}\n${renderGrokGlobalRulesBody().trimEnd()}\n${GROK_RULES_END}\n`;
}

export function hasGrokGlobalRules(text: string): boolean {
  const start = text.indexOf(GROK_RULES_START);
  const end = text.indexOf(GROK_RULES_END);
  return start >= 0 && end > start;
}

function isLegacyGrokGlobalRules(text: string): boolean {
  return normalizeToml(text).trim() === renderGrokGlobalRulesBody().trim();
}

export function mergeGrokGlobalRules(existing: string): string {
  const normalized = normalizeToml(existing);
  const start = normalized.indexOf(GROK_RULES_START);
  const end = normalized.indexOf(GROK_RULES_END);
  const managedRules = renderGrokGlobalRules().trimEnd();

  if (start >= 0 && end > start) {
    const afterEnd = end + GROK_RULES_END.length;
    return `${normalized.slice(0, start)}${managedRules}${normalized.slice(afterEnd)}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }
  if (normalized.trim() === '' || isLegacyGrokGlobalRules(normalized)) {
    return `${managedRules}\n`;
  }
  return `${normalized.trimEnd()}\n\n${managedRules}\n`;
}

export function removeGrokGlobalRules(existing: string): string {
  const normalized = normalizeToml(existing);
  const start = normalized.indexOf(GROK_RULES_START);
  const end = normalized.indexOf(GROK_RULES_END);
  if (start >= 0 && end > start) {
    const afterEnd = end + GROK_RULES_END.length;
    return `${normalized.slice(0, start)}${normalized.slice(afterEnd)}`.replace(/\n{3,}/g, '\n\n').trim();
  }
  return isLegacyGrokGlobalRules(normalized) ? '' : existing;
}

export function renderGrokHooksConfig(grokHookPath: string): string {
  const command = (mode: string) => `node "${grokHookPath}" ${mode}`;
  return `${JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: command('session-start'), timeout: 15 }] }],
      PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: command('post-tool-use'), timeout: 15 }] }],
      PostToolUseFailure: [{ matcher: '.*', hooks: [{ type: 'command', command: command('post-tool-use-failure'), timeout: 15 }] }],
      Stop: [{ hooks: [{ type: 'command', command: command('stop'), timeout: 15 }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: command('session-end'), timeout: 15 }] }],
    },
  }, null, 2)}\n`;
}
