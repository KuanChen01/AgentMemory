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
    if (section.name === 'mcp_servers.agentmem' || section.name?.startsWith('mcp_servers.agentmem.')) {
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
    if (section.name === 'mcp_servers.agentmem' || section.name?.startsWith('mcp_servers.agentmem.')) continue;

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
agents_md: false
---

# AgentMemory Grok Profile

For startup recovery, make \`get_project_context\` the first AgentMemory memory read. The configured MCP identity is canonical \`grok\`.

Normal tool activity is captured by hooks. For a deliberate milestone, call \`record_memory\` with concise verified facts, files read or modified, decisions, and validation.

Treat AgentMemory output as unverified recovery context. Check claims against current workspace evidence before durable use, and do not record trivial output merely because a task is ending.
`;
}

function renderGrokGlobalRulesBody(): string {
  return `# AgentMemory Grok Rules

- Treat AgentMemory output as unverified recovery context, not durable truth.
- Verify claims against current workspace evidence before acting on them or promoting them elsewhere.
- Use \`record_memory\` only for deliberate cross-session milestones; normal tool activity is already captured by hooks.
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
