interface TomlSection {
  name: string | null;
  lines: string[];
}

const TOP_LEVEL_SECTION = /^\s*\[([^\[\]]+)\]\s*$/;
const LEGACY_CODEX_HOOK_LINE = /^\s*codex_hooks\s*=\s*true\s*$/i;
const HOOKS_ASSIGNMENT_LINE = /^\s*hooks\s*=\s*.+$/i;

function normalizeToml(toml: string): string {
  return toml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseTomlSections(toml: string): TomlSection[] {
  const lines = normalizeToml(toml).split('\n');
  const sections: TomlSection[] = [{ name: null, lines: [] }];
  let current = sections[0];

  for (const line of lines) {
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

function stripLegacyCodexHookLines(lines: string[]): string[] {
  return lines.filter((line) => !LEGACY_CODEX_HOOK_LINE.test(line));
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function formatTomlSections(sections: TomlSection[]): string {
  const parts: string[] = [];
  const rootLines = trimBlankEdges(stripLegacyCodexHookLines(sections[0]?.lines || []));

  if (rootLines.length > 0) {
    parts.push(rootLines.join('\n'));
  }

  for (const section of sections.slice(1)) {
    const cleanedLines = trimBlankEdges(stripLegacyCodexHookLines(section.lines));
    const body = cleanedLines.length > 0 ? `\n${cleanedLines.join('\n')}` : '';
    parts.push(`[${section.name}]${body}`);
  }

  return `${parts.join('\n\n').trimEnd()}\n`;
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

export function stripLegacyCodexHookTables(toml: string): string {
  return normalizeToml(toml)
    .replace(/\[\[hooks\.SessionStart\]\][\s\S]*?codex-session-start\.js['"][\s\S]*?(?=\[\[|\[[^\[]|\Z)/gi, '')
    .replace(/\[\[hooks\.PostToolUse\]\][\s\S]*?codex-post-tool\.js['"][\s\S]*?(?=\[\[|\[[^\[]|\Z)/gi, '');
}

export function ensureCodexHooksEnabled(toml: string): string {
  const sections = parseTomlSections(stripLegacyCodexHookTables(toml));
  const outputSections: TomlSection[] = [{ name: null, lines: sections[0]?.lines || [] }];
  const featureLines: string[] = [];
  let insertIndex: number | null = null;

  for (const section of sections.slice(1)) {
    if (section.name === 'features') {
      if (insertIndex === null) {
        insertIndex = outputSections.length;
      }
      featureLines.push(
        ...stripLegacyCodexHookLines(section.lines).filter((line) => !HOOKS_ASSIGNMENT_LINE.test(line))
      );
      continue;
    }

    outputSections.push({
      name: section.name,
      lines: stripLegacyCodexHookLines(section.lines),
    });
  }

  const mergedFeatureSection: TomlSection = {
    name: 'features',
    lines: ['hooks = true', ...trimBlankEdges(featureLines)],
  };

  outputSections.splice(insertIndex ?? 1, 0, mergedFeatureSection);
  return formatTomlSections(outputSections);
}

export function ensureCodexMcpServer(toml: string, mcpServerPath: string): string {
  const sections = parseTomlSections(stripLegacyCodexHookTables(toml));
  const outputSections: TomlSection[] = [{ name: null, lines: sections[0]?.lines || [] }];
  let insertIndex: number | null = null;

  for (const section of sections.slice(1)) {
    if (section.name === 'mcp_servers.agentmem') {
      if (insertIndex === null) {
        insertIndex = outputSections.length;
      }
      continue;
    }

    outputSections.push({
      name: section.name,
      lines: stripLegacyCodexHookLines(section.lines),
    });
  }

  const mcpSection: TomlSection = {
    name: 'mcp_servers.agentmem',
    lines: [
      `command = ${quoteTomlString('node')}`,
      `args = [ ${quoteTomlString(mcpServerPath)} ]`,
    ],
  };

  outputSections.splice(insertIndex ?? outputSections.length, 0, mcpSection);
  return formatTomlSections(outputSections);
}

export function removeCodexMcpServer(toml: string): string {
  const sections = parseTomlSections(stripLegacyCodexHookTables(toml));
  const outputSections: TomlSection[] = [{ name: null, lines: sections[0]?.lines || [] }];

  for (const section of sections.slice(1)) {
    if (section.name === 'mcp_servers.agentmem') {
      continue;
    }

    outputSections.push({
      name: section.name,
      lines: stripLegacyCodexHookLines(section.lines),
    });
  }

  return formatTomlSections(outputSections);
}

export function updateCodexConfigToml(toml: string, mcpServerPath: string): string {
  const withHooks = ensureCodexHooksEnabled(toml);
  return ensureCodexMcpServer(withHooks, mcpServerPath);
}
