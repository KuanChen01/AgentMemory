import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  removeCodexMcpServer,
  stripLegacyCodexHookTables,
  updateCodexConfigToml,
} from './codex-installer';
import {
  ensureGrokConfigToml,
  hasGrokGlobalRules,
  removeGrokAgentMemoryConfig,
  removeGrokGlobalRules,
  renderGrokAgentProfile,
  renderGrokHooksConfig,
} from './grok-installer';
import {
  InstallStateManifest,
  ManagedTargetKind,
  loadInstallState,
  markManagedTargetApplied,
  matchesManagedTargetState,
  prepareManagedTarget,
  purgeInstallStateArtifacts,
  saveInstallState,
} from './install-state';

type ManagedAgent = 'claude' | 'opencode' | 'codex' | 'grok' | 'antigravity' | 'runtime' | 'cli';

const CODEX_DISPLAY_NAME = 'ChatGPT desktop (Codex runtime)';

export interface InstallOptions {
  antigravityConfigPath?: string;
  homeDir?: string;
  repoRoot: string;
  strict?: boolean;
}

export interface UninstallOptions extends InstallOptions {
  purgeAll?: boolean;
  skipGlobalUnlink?: boolean;
}

export interface InstallPaths {
  homeDir: string;
  repoRoot: string;
  mcpServerPath: string;
  claudeStartHook: string;
  claudePostHook: string;
  opencodeStartHook: string;
  opencodePostHook: string;
  codexStartHook: string;
  codexPostHook: string;
  grokHook: string;
  grokConfigPath: string;
  grokHooksPath: string;
  grokProfilePath: string;
  grokRulesPath: string;
  antigravityHook: string;
  antigravityGuidancePath: string;
  antigravityPluginRoot: string;
  antigravityPluginDir: string;
  antigravityPluginManifestPath: string;
  antigravityPluginHooksPath: string;
  antigravityPluginMcpPath: string;
  antigravityPluginRulePath: string;
  antigravityImportedPluginDir: string;
  antigravityOfficialConfigPath: string;
  antigravityPluginsConfigPath: string;
}

export interface InstallResult {
  action?: string;
  agent: ManagedAgent;
  message: string;
  ok: boolean;
  targetPath?: string;
  warnings?: string[];
}

export interface UninstallResult extends InstallResult {}

interface InstallContext {
  homeDir: string;
  paths: InstallPaths;
  state: InstallStateManifest;
}

interface OpenCodePaths {
  configJsonPath: string;
  configJsoncPath: string;
  configTargetPath: string;
  pluginPath: string;
  pluginsDir: string;
}

interface UninstallTextTargetOptions {
  cleanup: (currentText: string) => string | null;
  hasManagedContent: (currentText: string) => boolean;
  kind: ManagedTargetKind;
  removeWhenEmpty?: boolean;
  targetPath: string;
}

function resolveAntigravityExecutable(): string | null {
  const executableName = process.platform === 'win32' ? 'agy.exe' : 'agy';
  const candidates = [
    process.env.AGENTMEM_ANTIGRAVITY_CLI,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'agy', 'bin', executableName)
      : undefined,
    executableName,
  ].filter((candidate): candidate is string => !!candidate);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function runAntigravityPluginCommand(args: string[]): { stderr: string; stdout: string } {
  if (process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION === '1') {
    return { stderr: '', stdout: '' };
  }
  const executable = resolveAntigravityExecutable();
  if (!executable) {
    throw new Error('Antigravity CLI executable was not found; cannot activate AgentMemory hooks plugin.');
  }
  const result = spawnSync(executable, ['plugin', ...args], {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || `agy plugin ${args.join(' ')} exited with ${result.status}`).trim()
    );
  }
  return {
    stderr: String(result.stderr || ''),
    stdout: String(result.stdout || ''),
  };
}

export function stripComments(jsonc: string): string {
  let isInsideString = false;
  let isInsideComment = false;
  let isSingleLineComment = false;
  let result = '';

  for (let i = 0; i < jsonc.length; i += 1) {
    const char = jsonc[i];
    const nextChar = jsonc[i + 1];

    if (isInsideComment) {
      if (isSingleLineComment && char === '\n') {
        isInsideComment = false;
        isSingleLineComment = false;
        result += char;
      } else if (!isSingleLineComment && char === '*' && nextChar === '/') {
        isInsideComment = false;
        i += 1;
      }
    } else if (char === '"' && jsonc[i - 1] !== '\\') {
      isInsideString = !isInsideString;
      result += char;
    } else if (!isInsideString && char === '/' && nextChar === '/') {
      isInsideComment = true;
      isSingleLineComment = true;
      i += 1;
    } else if (!isInsideString && char === '/' && nextChar === '*') {
      isInsideComment = true;
      isSingleLineComment = false;
      i += 1;
    } else {
      result += char;
    }
  }

  return result;
}

export function renderOpenCodePlugin(paths: {
  startHookPath: string;
  postHookPath: string;
}): string {
  const serializedStart = JSON.stringify(paths.startHookPath);
  const serializedPost = JSON.stringify(paths.postHookPath);

  return `import { spawn } from "node:child_process";

const START_HOOK = ${serializedStart};
const POST_HOOK = ${serializedPost};

function runHook(scriptPath, options = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: stderr || String(error && error.message ? error.message : error),
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
      });
    });

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

export default async function AgentMemoryPlugin({ directory }) {
  const cwd = directory || process.cwd();
  return {
    async event({ event }) {
      if (!event || event.type !== "session.created") {
        return;
      }

      const result = await runHook(START_HOOK, { cwd });
      if (result.stdout && result.stdout.trim()) {
        process.stdout.write(result.stdout);
      }
      if (!result.ok && result.stderr && result.stderr.trim()) {
        process.stderr.write(result.stderr);
      }
    },

    async "tool.execute.after"(context, executionDetails) {
      const payload = {
        tool_name: context?.tool || "unknown-tool",
        input: executionDetails?.args || executionDetails?.input || {},
        output: executionDetails?.output || executionDetails?.result || "",
        success: executionDetails?.success !== false,
        session_id: context?.sessionID || context?.sessionId || "global-session",
      };

      const result = await runHook(POST_HOOK, {
        cwd,
        stdin: JSON.stringify(payload),
      });

      if (!result.ok && result.stderr && result.stderr.trim()) {
        process.stderr.write(result.stderr);
      }
    },
  };
}
`;
}

export function renderAntigravityPluginRule(): string {
  return `---
name: agentmem
description: AgentMemory working-memory recovery rules for Antigravity CLI.
trigger: always_on
---

${renderAntigravityGuidance()}`;
}

export function renderAntigravityPluginMcpConfig(mcpServerPath: string): string {
  return ensureAntigravityMcpServer('{}', mcpServerPath);
}

export function renderAntigravityGuidance(): string {
  return `# AgentMemory Antigravity Rules

These rules are managed by AgentMemory. Use them as the Antigravity CLI rule surface whenever AgentMemory is installed.

## Startup
- AgentMemory's \`PreInvocation\` hook injects startup context automatically. Use \`get_project_context\`, \`search_memory\`, or \`memory_timeline\` only for explicit drill-down when more detail is needed.
- Treat all AgentMemory results as unverified working memory until checked against current workspace files, diffs, commands, tests, artifacts, or another authoritative source.

## Working-memory boundary
- \`agentmem\` is working memory for session recovery across agents.
- Never treat raw AgentMemory summaries, search results, timelines, or session recaps as durable truth.
- Keep project guidance in the project's native documentation and promote durable knowledge only through the workflow explicitly selected for that task.

## Finish
- Automatic AgentMemory hooks capture normal tool work. For an explicit milestone entry, call \`record_memory\` with \`agent_id: "antigravity"\`, including files read, files modified, decisions, and tests.
- Do not call \`record_memory\` for trivial output or merely because a task is ending.
`;
}

export function renderAntigravityPluginManifest(): string {
  return `${JSON.stringify({
    name: 'agentmem',
    description: 'AgentMemory working-memory MCP and lifecycle hooks.',
  }, null, 2)}\n`;
}

export function renderAntigravityPluginHooks(antigravityHookPath: string): string {
  const command = (mode: string) => `node ${antigravityHookPath} ${mode}`;
  return `${JSON.stringify({
    agentmemory: {
      PreInvocation: [
        {
          type: 'command',
          command: command('pre-invocation'),
          timeout: 15,
        },
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: command('post-tool-use'),
              timeout: 15,
            },
          ],
        },
      ],
      Stop: [
        {
          type: 'command',
          command: command('stop'),
          timeout: 15,
        },
      ],
    },
  }, null, 2)}\n`;
}

export function ensureAntigravityPluginsConfig(jsonText: string, pluginRoot: string): string {
  const parsed = JSON.parse(stripComments(jsonText || '{}') || '{}');
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  parsed.entries = entries.filter((entry: unknown) => {
    return !isObject(entry) || String(entry.path || '') !== pluginRoot;
  });
  parsed.entries.push({ path: pluginRoot });
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function ensureAntigravityMcpServer(jsonText: string, mcpServerPath: string): string {
  const parsed = JSON.parse(stripComments(jsonText || '{}') || '{}');
  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    parsed.mcpServers = {};
  }

  delete parsed.mcpServers.agentvault;
  const existingAgentMem = isObject(parsed.mcpServers.agentmem)
    ? parsed.mcpServers.agentmem
    : {};
  const existingEnv = isObject(existingAgentMem.env) ? existingAgentMem.env : {};
  parsed.mcpServers.agentmem = {
    command: 'node',
    args: [mcpServerPath],
    env: {
      ...existingEnv,
      AGENTMEM_AGENT_ID: 'antigravity',
    },
    disabled: false,
  };

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function resolveInstallPaths(repoRoot: string, homeDir: string = os.homedir()): InstallPaths {
  const normalizedRepoRoot = repoRoot.replace(/\\/g, '/');
  const antigravityPluginRoot = path.join(homeDir, '.agentmem', 'antigravity-plugins');
  const antigravityPluginDir = path.join(antigravityPluginRoot, 'agentmem');
  const antigravityOfficialConfigPath = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
  const antigravityImportedPluginDir = path.join(homeDir, '.gemini', 'config', 'plugins', 'agentmem');

  return {
    homeDir,
    repoRoot,
    mcpServerPath: `${normalizedRepoRoot}/dist/servers/mcp-server.js`,
    claudeStartHook: `${normalizedRepoRoot}/dist/hooks/claude-session-start.js`,
    claudePostHook: `${normalizedRepoRoot}/dist/hooks/claude-post-tool.js`,
    opencodeStartHook: `${normalizedRepoRoot}/dist/hooks/opencode-session-start.js`,
    opencodePostHook: `${normalizedRepoRoot}/dist/hooks/opencode-post-tool.js`,
    codexStartHook: `${normalizedRepoRoot}/dist/hooks/codex-session-start.js`,
    codexPostHook: `${normalizedRepoRoot}/dist/hooks/codex-post-tool.js`,
    grokHook: `${normalizedRepoRoot}/dist/hooks/grok-hook.js`,
    grokConfigPath: path.join(homeDir, '.grok', 'config.toml'),
    grokHooksPath: path.join(homeDir, '.grok', 'hooks', 'agentmem.json'),
    grokProfilePath: path.join(homeDir, '.grok', 'agents', 'agentmem.md'),
    grokRulesPath: path.join(homeDir, '.grok', 'AGENTS.md'),
    antigravityHook: `${normalizedRepoRoot}/dist/hooks/antigravity-hook.js`,
    antigravityGuidancePath: path.join(homeDir, '.agentmem', 'AGENTMEM_ANTIGRAVITY.md'),
    antigravityPluginRoot,
    antigravityPluginDir,
    antigravityPluginManifestPath: path.join(antigravityPluginDir, 'plugin.json'),
    antigravityPluginHooksPath: path.join(antigravityPluginDir, 'hooks.json'),
    antigravityPluginMcpPath: path.join(antigravityPluginDir, 'mcp_config.json'),
    antigravityPluginRulePath: path.join(antigravityPluginDir, 'rules', 'agentmem.md'),
    antigravityImportedPluginDir,
    antigravityOfficialConfigPath,
    antigravityPluginsConfigPath: path.join(homeDir, '.gemini', 'config', 'plugins.json'),
  };
}

export function resolveAntigravityConfigPath(
  homeDir: string,
  overridePath?: string
): string | null {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  const officialConfigPath = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
  const directCandidates = [
    officialConfigPath,
    path.join(homeDir, '.gemini', 'antigravity-cli', 'mcp_config.json'),
    path.join(homeDir, '.gemini', 'antigravity-ide', 'mcp_config.json'),
    path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
  ].filter((candidate) => fs.existsSync(candidate));

  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const pluginsRoot = path.join(homeDir, '.gemini', 'config', 'plugins');
  if (fs.existsSync(pluginsRoot)) {
    const candidates = fs
      .readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(pluginsRoot, entry.name, 'mcp_config.json'))
      .filter((candidate) => fs.existsSync(candidate));
    if (candidates.length > 0) {
      const preferred = candidates.find((candidate) =>
        candidate.includes(`${path.sep}local-game-mcps${path.sep}`)
      );
      return preferred || candidates[0];
    }
  }

  return officialConfigPath;
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(filePath: string, allowComments: boolean = false): any {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const normalized = allowComments ? stripComments(raw) : raw;
  return JSON.parse(normalized || '{}');
}

function ensureDir(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function serializeJson(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, serializeJson(payload), 'utf8');
}

function resolveOpenCodePaths(homeDir: string): OpenCodePaths {
  const configDir = path.join(homeDir, '.config', 'opencode');
  const configJsonPath = path.join(configDir, 'opencode.json');
  const configJsoncPath = path.join(configDir, 'opencode.jsonc');
  const configTargetPath = fs.existsSync(configJsoncPath) || !fs.existsSync(configJsonPath)
    ? configJsoncPath
    : configJsonPath;
  const pluginsDir = path.join(configDir, 'plugins');
  const pluginPath = path.join(pluginsDir, 'agentmem-plugin.mjs');

  return {
    configJsonPath,
    configJsoncPath,
    configTargetPath,
    pluginPath,
    pluginsDir,
  };
}

function isManagedHookCommand(command: string, markers: string[]): boolean {
  return markers.some((marker) => command.includes(marker));
}

export function removeManagedHookEntries(entries: any, markers: string[]): any[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const cleanedEntries: any[] = [];
  for (const entry of entries) {
    if (!isObject(entry) || !Array.isArray(entry.hooks)) {
      cleanedEntries.push(entry);
      continue;
    }

    const remainingHooks = entry.hooks.filter((hook: any) => {
      if (!isObject(hook) || typeof hook.command !== 'string') {
        return true;
      }

      return !isManagedHookCommand(hook.command, markers);
    });

    if (remainingHooks.length === 0) {
      continue;
    }

    cleanedEntries.push({
      ...entry,
      hooks: remainingHooks,
    });
  }

  return cleanedEntries;
}

export function mergeManagedHookEntries(entries: any, marker: string, command: string): any[] {
  return [
    ...removeManagedHookEntries(entries, [marker]),
    {
      matcher: '.*',
      hooks: [{ type: 'command', command }],
    },
  ];
}

function pruneEmptyObject(parent: Record<string, any>, key: string) {
  if (!isObject(parent[key])) {
    return;
  }

  if (Object.keys(parent[key]).length === 0) {
    delete parent[key];
  }
}

function pruneEmptyArray(parent: Record<string, any>, key: string) {
  if (Array.isArray(parent[key]) && parent[key].length === 0) {
    delete parent[key];
  }
}

function hasMarkerInJson(value: unknown, markers: string[]): boolean {
  return markers.some((marker) => JSON.stringify(value || {}).includes(marker));
}

function cleanupHookConfig(
  payload: Record<string, any>,
  eventName: 'SessionStart' | 'SubagentStart' | 'PostToolUse',
  markers: string[]
) {
  if (!isObject(payload.hooks)) {
    return;
  }

  payload.hooks[eventName] = removeManagedHookEntries(payload.hooks[eventName], markers);
  pruneEmptyArray(payload.hooks, eventName);
  pruneEmptyObject(payload, 'hooks');
}

function cleanupClaudeSettings(settings: Record<string, any>) {
  if (isObject(settings.mcpServers)) {
    delete settings.mcpServers.agentmem;
    pruneEmptyObject(settings, 'mcpServers');
  }

  cleanupHookConfig(settings, 'SessionStart', ['claude-session-start.js']);
  cleanupHookConfig(settings, 'PostToolUse', ['claude-post-tool.js']);
  return settings;
}

function cleanupClaudeGlobalConfig(globalConfig: Record<string, any>) {
  if (isObject(globalConfig.mcpServers)) {
    delete globalConfig.mcpServers.agentmem;
    pruneEmptyObject(globalConfig, 'mcpServers');
  }

  return globalConfig;
}

function cleanupCodexHooksConfig(hooksConfig: Record<string, any>) {
  cleanupHookConfig(hooksConfig, 'SessionStart', ['codex-session-start.js']);
  cleanupHookConfig(hooksConfig, 'SubagentStart', ['codex-session-start.js']);
  cleanupHookConfig(hooksConfig, 'PostToolUse', ['codex-post-tool.js']);
  return hooksConfig;
}

function cleanupOpenCodeConfig(config: Record<string, any>) {
  if (!isObject(config.mcp)) {
    config.mcp = {};
  }

  delete config.mcp.agentmem;
  if (isObject(config.mcp.servers)) {
    delete config.mcp.servers.agentmem;
    pruneEmptyObject(config.mcp, 'servers');
  }
  pruneEmptyObject(config, 'mcp');

  if (Array.isArray(config.plugin)) {
    config.plugin = config.plugin.filter(
      (entry: unknown) => typeof entry !== 'string' || !entry.includes('agentmem-plugin.mjs')
    );
    pruneEmptyArray(config, 'plugin');
  }

  return config;
}

function cleanupAntigravityConfig(config: Record<string, any>) {
  if (isObject(config.mcpServers)) {
    delete config.mcpServers.agentvault;
    delete config.mcpServers.agentmem;
    pruneEmptyObject(config, 'mcpServers');
  }

  return config;
}

function cleanupAntigravityPluginsConfig(config: Record<string, any>, pluginRoot: string) {
  if (Array.isArray(config.entries)) {
    config.entries = config.entries.filter((entry: unknown) => {
      return !isObject(entry) || String(entry.path || '') !== pluginRoot;
    });
    pruneEmptyArray(config, 'entries');
  }
  return config;
}

function detectClaudeSettingsLegacy(settings: Record<string, any>): boolean {
  return !!settings?.mcpServers?.agentmem ||
    hasMarkerInJson(settings?.hooks, ['claude-session-start.js', 'claude-post-tool.js']);
}

function detectClaudeGlobalLegacy(globalConfig: Record<string, any>): boolean {
  return !!globalConfig?.mcpServers?.agentmem;
}

function detectCodexConfigLegacy(toml: string): boolean {
  return /\[mcp_servers\.agentmem\]/.test(toml) ||
    toml.includes('codex-session-start.js') ||
    toml.includes('codex-post-tool.js');
}

function detectCodexHooksLegacy(hooksConfig: Record<string, any>): boolean {
  return hasMarkerInJson(hooksConfig?.hooks, ['codex-session-start.js', 'codex-post-tool.js']);
}

function detectGrokConfigLegacy(toml: string): boolean {
  return /\[mcp_servers\.agentmem\]/.test(toml) ||
    /\[agent\][\s\S]*?^\s*name\s*=\s*["']agentmem["']/m.test(toml);
}

function detectOpenCodeLegacy(config: Record<string, any>): boolean {
  const pluginList = Array.isArray(config.plugin) ? config.plugin : [];
  return !!config?.mcp?.agentmem ||
    !!config?.mcp?.servers?.agentmem ||
    pluginList.some((entry) => typeof entry === 'string' && entry.includes('agentmem-plugin.mjs'));
}

function detectAntigravityLegacy(config: Record<string, any>): boolean {
  return !!config?.mcpServers?.agentmem ||
    !!config?.mcpServers?.agentvault ||
    hasMarkerInJson(config?.mcpServers, ['AgentVault', 'agentvault']);
}

function applyManagedTextWrite(
  context: InstallContext,
  kind: ManagedTargetKind,
  targetPath: string,
  nextText: string,
  isLegacyManaged: boolean
): string[] {
  const absolutePath = path.resolve(targetPath);
  const currentText = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : undefined;
  const { warnings } = prepareManagedTarget(context.state, {
    currentText,
    homeDir: context.homeDir,
    isLegacyManaged,
    kind,
    targetPath: absolutePath,
  });

  ensureDir(path.dirname(absolutePath));
  if (currentText !== nextText) {
    fs.writeFileSync(absolutePath, nextText, 'utf8');
  }

  markManagedTargetApplied(context.state, absolutePath, nextText);
  saveInstallState(context.homeDir, context.state);
  return warnings;
}

function applyManagedDelete(
  context: InstallContext,
  kind: ManagedTargetKind,
  targetPath: string,
  isLegacyManaged: boolean
): string[] {
  const absolutePath = path.resolve(targetPath);
  const currentText = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : undefined;
  if (typeof currentText !== 'string' && !context.state.targets[absolutePath]) {
    return [];
  }

  const { warnings } = prepareManagedTarget(context.state, {
    currentText,
    homeDir: context.homeDir,
    isLegacyManaged,
    kind,
    targetPath: absolutePath,
  });

  if (typeof currentText === 'string') {
    fs.unlinkSync(absolutePath);
  }

  markManagedTargetApplied(context.state, absolutePath, null);
  saveInstallState(context.homeDir, context.state);
  return warnings;
}

function writeOrDeleteUninstallTarget(
  context: InstallContext,
  recordPath: string,
  nextText: string | null
) {
  const absolutePath = path.resolve(recordPath);
  if (nextText === null) {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } else {
    ensureDir(path.dirname(absolutePath));
    fs.writeFileSync(absolutePath, nextText, 'utf8');
  }

  if (context.state.targets[absolutePath]) {
    markManagedTargetApplied(context.state, absolutePath, nextText);
    saveInstallState(context.homeDir, context.state);
  }
}

function uninstallManagedTextTarget(
  context: InstallContext,
  options: UninstallTextTargetOptions
): { action: string; warnings: string[] } {
  const absolutePath = path.resolve(options.targetPath);
  const currentText = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : undefined;
  let record = context.state.targets[absolutePath];
  const warnings: string[] = [];

  const managedWithoutState =
    typeof currentText === 'string' &&
    !record &&
    options.hasManagedContent(currentText);
  if (managedWithoutState) {
    const prepared = prepareManagedTarget(context.state, {
      currentText,
      homeDir: context.homeDir,
      isLegacyManaged: true,
      kind: options.kind,
      targetPath: absolutePath,
    });
    record = prepared.record;
    warnings.push(...prepared.warnings);
    saveInstallState(context.homeDir, context.state);
  }

  if (!record && typeof currentText === 'string' && !managedWithoutState) {
    return {
      action: 'no-op',
      warnings,
    };
  }

  if (!record && typeof currentText !== 'string') {
    return {
      action: 'no-op',
      warnings,
    };
  }

  if (record?.baselineStatus === 'pristine' && matchesManagedTargetState(record, currentText)) {
    if (record.existedBeforeInstall && record.baselineBackupPath) {
      const baselineText = fs.readFileSync(record.baselineBackupPath, 'utf8');
      writeOrDeleteUninstallTarget(context, absolutePath, baselineText);
      return {
        action: 'restored-backup',
        warnings,
      };
    }

    if (!record.existedBeforeInstall) {
      writeOrDeleteUninstallTarget(context, absolutePath, null);
      return {
        action: 'removed-generated-file',
        warnings,
      };
    }
  }

  if (typeof currentText !== 'string') {
    return {
      action: 'no-op',
      warnings,
    };
  }

  warnings.push(
    `warning: ${absolutePath} was modified after install or has no pristine baseline; applied targeted AgentMemory cleanup instead.`
  );
  const cleanedText = options.cleanup(currentText);
  const normalizedCleanedText =
    cleanedText !== null && options.removeWhenEmpty && cleanedText.trim() === '' ? null : cleanedText;

  if (normalizedCleanedText === currentText) {
    if (record) {
      markManagedTargetApplied(context.state, absolutePath, currentText);
      saveInstallState(context.homeDir, context.state);
    }

    return {
      action: 'kept-existing-file',
      warnings,
    };
  }

  writeOrDeleteUninstallTarget(context, absolutePath, normalizedCleanedText);
  return {
    action: normalizedCleanedText === null ? 'removed-managed-file' : 'removed-managed-entries',
    warnings,
  };
}

function uninstallDedicatedArtifact(
  context: InstallContext,
  kind: ManagedTargetKind,
  targetPath: string,
  isManagedFile: boolean
): { action: string; warnings: string[] } {
  const absolutePath = path.resolve(targetPath);
  const currentText = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : undefined;
  let record = context.state.targets[absolutePath];
  const warnings: string[] = [];

  if (!record && typeof currentText === 'string' && isManagedFile) {
    const prepared = prepareManagedTarget(context.state, {
      currentText,
      homeDir: context.homeDir,
      isLegacyManaged: true,
      kind,
      targetPath: absolutePath,
    });
    record = prepared.record;
    warnings.push(...prepared.warnings);
    saveInstallState(context.homeDir, context.state);
  }

  if (record?.baselineStatus === 'pristine' && record.existedBeforeInstall && record.baselineBackupPath &&
    matchesManagedTargetState(record, currentText)) {
    const baselineText = fs.readFileSync(record.baselineBackupPath, 'utf8');
    writeOrDeleteUninstallTarget(context, absolutePath, baselineText);
    return {
      action: 'restored-backup',
      warnings,
    };
  }

  if (typeof currentText === 'string') {
    writeOrDeleteUninstallTarget(context, absolutePath, null);
    return {
      action: 'deleted-generated-artifact',
      warnings,
    };
  }

  if (record) {
    markManagedTargetApplied(context.state, absolutePath, null);
    saveInstallState(context.homeDir, context.state);
  }

  return {
    action: 'already-absent',
    warnings,
  };
}

function installClaude(context: InstallContext): InstallResult {
  const claudeSettingsPath = path.join(context.homeDir, '.claude', 'settings.json');
  const claudeGlobalPath = path.join(context.homeDir, '.claude.json');
  ensureDir(path.dirname(claudeSettingsPath));

  const settings = readJsonFile(claudeSettingsPath);
  cleanupClaudeSettings(settings);
  if (!isObject(settings.hooks)) {
    settings.hooks = {};
  }
  settings.hooks.SessionStart = mergeManagedHookEntries(
    settings.hooks.SessionStart,
    'claude-session-start.js',
    `node "${context.paths.claudeStartHook}"`
  );
  settings.hooks.PostToolUse = mergeManagedHookEntries(
    settings.hooks.PostToolUse,
    'claude-post-tool.js',
    `node "${context.paths.claudePostHook}"`
  );

  const globalConfig = readJsonFile(claudeGlobalPath);
  cleanupClaudeGlobalConfig(globalConfig);
  if (!isObject(globalConfig.mcpServers)) {
    globalConfig.mcpServers = {};
  }
  globalConfig.mcpServers.agentmem = {
    type: 'stdio',
    command: 'node',
    args: [context.paths.mcpServerPath],
    env: {},
  };

  const warnings = [
    ...applyManagedTextWrite(
      context,
      'claude-settings',
      claudeSettingsPath,
      serializeJson(settings),
      detectClaudeSettingsLegacy(readJsonFile(claudeSettingsPath))
    ),
    ...applyManagedTextWrite(
      context,
      'claude-global',
      claudeGlobalPath,
      serializeJson(globalConfig),
      detectClaudeGlobalLegacy(readJsonFile(claudeGlobalPath))
    ),
  ];

  return {
    action: 'merged-managed-entries',
    agent: 'claude',
    ok: true,
    targetPath: claudeSettingsPath,
    message: `Registered hooks and MCP server in Claude Code (${claudeSettingsPath}, ${claudeGlobalPath})`,
    warnings,
  };
}

function installOpenCode(context: InstallContext): InstallResult {
  const opencodePaths = resolveOpenCodePaths(context.homeDir);
  ensureDir(path.dirname(opencodePaths.configTargetPath));
  ensureDir(opencodePaths.pluginsDir);

  const existingConfig = readJsonFile(
    opencodePaths.configTargetPath,
    opencodePaths.configTargetPath.endsWith('.jsonc')
  );
  const legacyBefore = detectOpenCodeLegacy(existingConfig);
  const opencodeConfig = cleanupOpenCodeConfig(existingConfig);

  if (!isObject(opencodeConfig.mcp)) {
    opencodeConfig.mcp = {};
  }
  opencodeConfig.mcp.agentmem = {
    type: 'local',
    command: ['node', context.paths.mcpServerPath],
    enabled: true,
  };

  if (!Array.isArray(opencodeConfig.plugin)) {
    opencodeConfig.plugin = [];
  }

  const pluginUrl = `file:///${opencodePaths.pluginPath.replace(/\\/g, '/')}`;
  opencodeConfig.plugin = opencodeConfig.plugin.filter(
    (entry: unknown) => typeof entry !== 'string' || !entry.includes('agentmem-plugin.mjs')
  );
  opencodeConfig.plugin.push(pluginUrl);

  const warnings = [
    ...applyManagedTextWrite(
      context,
      'opencode-config',
      opencodePaths.configTargetPath,
      serializeJson(opencodeConfig),
      legacyBefore
    ),
    ...applyManagedTextWrite(
      context,
      'opencode-plugin',
      opencodePaths.pluginPath,
      renderOpenCodePlugin({
        startHookPath: context.paths.opencodeStartHook,
        postHookPath: context.paths.opencodePostHook,
      }),
      fs.existsSync(opencodePaths.pluginPath)
    ),
  ];

  if (
    opencodePaths.configTargetPath === opencodePaths.configJsoncPath &&
    fs.existsSync(opencodePaths.configJsonPath)
  ) {
    warnings.push(
      ...applyManagedDelete(
        context,
        'opencode-displaced-json',
        opencodePaths.configJsonPath,
        detectOpenCodeLegacy(readJsonFile(opencodePaths.configJsonPath))
      )
    );
  }

  return {
    action: 'merged-managed-entries',
    agent: 'opencode',
    ok: true,
    targetPath: opencodePaths.configTargetPath,
    message: `Registered plugin, generated hook bridge, and MCP server in OpenCode (${opencodePaths.configTargetPath}, ${opencodePaths.pluginPath})`,
    warnings,
  };
}

function installCodex(context: InstallContext): InstallResult {
  const codexConfigDir = path.join(context.homeDir, '.codex');
  const codexConfigPath = path.join(codexConfigDir, 'config.toml');
  const codexHooksPath = path.join(codexConfigDir, 'hooks.json');
  ensureDir(codexConfigDir);

  const existingToml = fs.existsSync(codexConfigPath)
    ? fs.readFileSync(codexConfigPath, 'utf8')
    : '';
  const existingHooks = readJsonFile(codexHooksPath);
  const hooksConfig = cleanupCodexHooksConfig(existingHooks);
  if (!isObject(hooksConfig.hooks)) {
    hooksConfig.hooks = {};
  }
  hooksConfig.hooks.SessionStart = mergeManagedHookEntries(
    hooksConfig.hooks.SessionStart,
    'codex-session-start.js',
    `node "${context.paths.codexStartHook}"`
  );
  hooksConfig.hooks.PostToolUse = mergeManagedHookEntries(
    hooksConfig.hooks.PostToolUse,
    'codex-post-tool.js',
    `node "${context.paths.codexPostHook}"`
  );

  const warnings = [
    ...applyManagedTextWrite(
      context,
      'codex-config',
      codexConfigPath,
      updateCodexConfigToml(existingToml, context.paths.mcpServerPath),
      detectCodexConfigLegacy(existingToml)
    ),
    ...applyManagedTextWrite(
      context,
      'codex-hooks',
      codexHooksPath,
      serializeJson(hooksConfig),
      detectCodexHooksLegacy(existingHooks)
    ),
  ];

  return {
    action: 'merged-managed-entries',
    agent: 'codex',
    ok: true,
    targetPath: codexConfigPath,
    message: `Registered hooks and MCP server in ${CODEX_DISPLAY_NAME} (${codexConfigPath}, ${codexHooksPath})`,
    warnings,
  };
}

function installAntigravity(context: InstallContext, overridePath?: string): InstallResult {
  const configPath = resolveAntigravityConfigPath(context.homeDir, overridePath) ||
    context.paths.antigravityOfficialConfigPath;
  const officialPath = context.paths.antigravityOfficialConfigPath;
  const pluginRoot = context.paths.antigravityPluginRoot.replace(/\\/g, '/');
  const existingPluginsConfig = fs.existsSync(context.paths.antigravityPluginsConfigPath)
    ? fs.readFileSync(context.paths.antigravityPluginsConfigPath, 'utf8')
    : '{}';
  const existingPluginsConfigObject = readJsonFileText(existingPluginsConfig);
  const cleanedPluginsConfig = cleanupAntigravityPluginsConfig(
    existingPluginsConfigObject,
    pluginRoot
  );
  const pluginsConfigWasManaged = !!context.state.targets[
    path.resolve(context.paths.antigravityPluginsConfigPath)
  ];
  const managedEmptyPluginsConfig = pluginsConfigWasManaged &&
    Object.keys(existingPluginsConfigObject).length === 0;
  const stalePluginsConfigWarnings = !fs.existsSync(context.paths.antigravityPluginsConfigPath) ||
    (!existingPluginsConfig.includes(pluginRoot) && !managedEmptyPluginsConfig)
    ? []
    : Object.keys(cleanedPluginsConfig).length === 0
      ? applyManagedDelete(
          context,
          'antigravity-plugins-config',
          context.paths.antigravityPluginsConfigPath,
          true
        )
      : applyManagedTextWrite(
          context,
          'antigravity-plugins-config',
          context.paths.antigravityPluginsConfigPath,
          serializeJson(cleanedPluginsConfig),
          true
        );

  const writeMcpRegistry = (targetPath: string) => {
    ensureDir(path.dirname(targetPath));
    const existingJson = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '{}';
    return applyManagedTextWrite(
      context,
      'antigravity-config',
      targetPath,
      ensureAntigravityMcpServer(existingJson, context.paths.mcpServerPath),
      detectAntigravityLegacy(readJsonFile(targetPath, true))
    );
  };

  const warnings = [
    ...writeMcpRegistry(officialPath),
    ...(configPath !== officialPath ? writeMcpRegistry(configPath) : []),
    ...stalePluginsConfigWarnings,
    ...applyManagedTextWrite(
      context,
      'antigravity-guidance',
      context.paths.antigravityGuidancePath,
      renderAntigravityGuidance(),
      fs.existsSync(context.paths.antigravityGuidancePath) &&
        fs.readFileSync(context.paths.antigravityGuidancePath, 'utf8').includes('AgentMemory Antigravity Rules')
    ),
    ...applyManagedTextWrite(
      context,
      'antigravity-plugin-manifest',
      context.paths.antigravityPluginManifestPath,
      renderAntigravityPluginManifest(),
      fs.existsSync(context.paths.antigravityPluginManifestPath) &&
        fs.readFileSync(context.paths.antigravityPluginManifestPath, 'utf8').includes('"name": "agentmem"')
    ),
    ...applyManagedTextWrite(
      context,
      'antigravity-plugin-hooks',
      context.paths.antigravityPluginHooksPath,
      renderAntigravityPluginHooks(context.paths.antigravityHook),
      fs.existsSync(context.paths.antigravityPluginHooksPath) &&
        fs.readFileSync(context.paths.antigravityPluginHooksPath, 'utf8').includes('antigravity-hook.js')
    ),
    ...applyManagedTextWrite(
      context,
      'antigravity-plugin-mcp',
      context.paths.antigravityPluginMcpPath,
      renderAntigravityPluginMcpConfig(context.paths.mcpServerPath),
      fs.existsSync(context.paths.antigravityPluginMcpPath) &&
        detectAntigravityLegacy(readJsonFile(context.paths.antigravityPluginMcpPath, true))
    ),
    ...applyManagedTextWrite(
      context,
      'antigravity-plugin-rule',
      context.paths.antigravityPluginRulePath,
      renderAntigravityPluginRule(),
      fs.existsSync(context.paths.antigravityPluginRulePath) &&
        fs.readFileSync(context.paths.antigravityPluginRulePath, 'utf8').includes('AgentMemory Antigravity Rules')
    ),
  ];
  runAntigravityPluginCommand(['install', context.paths.antigravityPluginDir]);
  try {
    runAntigravityPluginCommand(['enable', 'agentmem']);
  } catch (error: any) {
    warnings.push(
      `warning: failed to enable the Antigravity AgentMemory plugin: ${error?.message || String(error)}`
    );
  }

  return {
    action: 'merged-managed-entries',
    agent: 'antigravity',
    ok: true,
    targetPath: officialPath,
    message: `Registered MCP identity in Antigravity (${officialPath}) and installed the AgentMemory plugin via agy plugin install (${context.paths.antigravityPluginDir})`,
    warnings,
  };
}

function installGrok(context: InstallContext): InstallResult {
  const grokDir = path.dirname(context.paths.grokConfigPath);
  ensureDir(grokDir);
  const existingToml = fs.existsSync(context.paths.grokConfigPath)
    ? fs.readFileSync(context.paths.grokConfigPath, 'utf8')
    : '';
  const existingRules = fs.existsSync(context.paths.grokRulesPath)
    ? fs.readFileSync(context.paths.grokRulesPath, 'utf8')
    : '';
  const cleanedRules = hasGrokGlobalRules(existingRules)
    ? removeGrokGlobalRules(existingRules)
    : existingRules;
  const staleRuleWarnings = !hasGrokGlobalRules(existingRules)
    ? []
    : cleanedRules.trim()
      ? applyManagedTextWrite(
          context,
          'grok-rules',
          context.paths.grokRulesPath,
          cleanedRules,
          true
        )
      : applyManagedDelete(
          context,
          'grok-rules',
          context.paths.grokRulesPath,
          true
        );

  const warnings = [
    ...staleRuleWarnings,
    ...applyManagedTextWrite(
      context,
      'grok-config',
      context.paths.grokConfigPath,
      ensureGrokConfigToml(existingToml, context.paths.mcpServerPath),
      detectGrokConfigLegacy(existingToml)
    ),
    ...applyManagedTextWrite(
      context,
      'grok-hooks',
      context.paths.grokHooksPath,
      renderGrokHooksConfig(context.paths.grokHook),
      fs.existsSync(context.paths.grokHooksPath) &&
        fs.readFileSync(context.paths.grokHooksPath, 'utf8').includes('grok-hook.js')
    ),
    ...applyManagedTextWrite(
      context,
      'grok-profile',
      context.paths.grokProfilePath,
      renderGrokAgentProfile(),
      fs.existsSync(context.paths.grokProfilePath) &&
        fs.readFileSync(context.paths.grokProfilePath, 'utf8').includes('AgentMemory Grok Profile')
    ),
  ];

  return {
    action: 'merged-managed-entries',
    agent: 'grok',
    ok: true,
    targetPath: context.paths.grokConfigPath,
    message: `Registered the default profile, lifecycle hooks, and MCP server in Grok (${context.paths.grokConfigPath})`,
    warnings,
  };
}

function uninstallClaude(context: InstallContext): UninstallResult {
  const claudeSettingsPath = path.join(context.homeDir, '.claude', 'settings.json');
  const claudeGlobalPath = path.join(context.homeDir, '.claude.json');

  const settingsCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(cleanupClaudeSettings(readJsonFileText(currentText))),
    hasManagedContent: (currentText) =>
      detectClaudeSettingsLegacy(readJsonFileText(currentText)),
    kind: 'claude-settings',
    targetPath: claudeSettingsPath,
  });
  const globalCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(cleanupClaudeGlobalConfig(readJsonFileText(currentText))),
    hasManagedContent: (currentText) =>
      detectClaudeGlobalLegacy(readJsonFileText(currentText)),
    kind: 'claude-global',
    targetPath: claudeGlobalPath,
  });

  return {
    action: `${settingsCleanup.action}+${globalCleanup.action}`,
    agent: 'claude',
    ok: true,
    targetPath: claudeSettingsPath,
    message: `Uninstalled AgentMemory from Claude Code (${claudeSettingsPath}, ${claudeGlobalPath})`,
    warnings: [...settingsCleanup.warnings, ...globalCleanup.warnings],
  };
}

function uninstallOpenCode(context: InstallContext): UninstallResult {
  const opencodePaths = resolveOpenCodePaths(context.homeDir);
  const configCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(cleanupOpenCodeConfig(readJsonFileText(currentText))),
    hasManagedContent: (currentText) =>
      detectOpenCodeLegacy(readJsonFileText(currentText)),
    kind: 'opencode-config',
    targetPath: opencodePaths.configTargetPath,
  });
  const displacedCleanup =
    opencodePaths.configTargetPath === opencodePaths.configJsoncPath
      ? uninstallManagedTextTarget(context, {
          cleanup: (currentText) => serializeJson(cleanupOpenCodeConfig(readJsonFileText(currentText))),
          hasManagedContent: (currentText) =>
            detectOpenCodeLegacy(readJsonFileText(currentText)),
          kind: 'opencode-displaced-json',
          targetPath: opencodePaths.configJsonPath,
        })
      : { action: 'no-op', warnings: [] };
  const pluginCleanup = uninstallDedicatedArtifact(
    context,
    'opencode-plugin',
    opencodePaths.pluginPath,
    fs.existsSync(opencodePaths.pluginPath)
  );

  return {
    action: `${configCleanup.action}+${pluginCleanup.action}`,
    agent: 'opencode',
    ok: true,
    targetPath: opencodePaths.configTargetPath,
    message: `Uninstalled AgentMemory from OpenCode (${opencodePaths.configTargetPath}, ${opencodePaths.pluginPath})`,
    warnings: [
      ...configCleanup.warnings,
      ...displacedCleanup.warnings,
      ...pluginCleanup.warnings,
    ],
  };
}

function uninstallCodex(context: InstallContext): UninstallResult {
  const codexConfigPath = path.join(context.homeDir, '.codex', 'config.toml');
  const codexHooksPath = path.join(context.homeDir, '.codex', 'hooks.json');

  const configCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => removeCodexMcpServer(stripLegacyCodexHookTables(currentText)),
    hasManagedContent: (currentText) => detectCodexConfigLegacy(currentText),
    kind: 'codex-config',
    targetPath: codexConfigPath,
  });
  const hooksCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(cleanupCodexHooksConfig(readJsonFileText(currentText))),
    hasManagedContent: (currentText) => detectCodexHooksLegacy(readJsonFileText(currentText)),
    kind: 'codex-hooks',
    targetPath: codexHooksPath,
  });

  return {
    action: `${configCleanup.action}+${hooksCleanup.action}`,
    agent: 'codex',
    ok: true,
    targetPath: codexConfigPath,
    message: `Uninstalled AgentMemory from ${CODEX_DISPLAY_NAME} (${codexConfigPath}, ${codexHooksPath})`,
    warnings: [...configCleanup.warnings, ...hooksCleanup.warnings],
  };
}

function uninstallAntigravity(context: InstallContext, overridePath?: string): UninstallResult {
  const knownRegistryPaths = [
    context.paths.antigravityOfficialConfigPath,
    path.join(context.homeDir, '.gemini', 'antigravity-cli', 'mcp_config.json'),
    path.join(context.homeDir, '.gemini', 'antigravity-ide', 'mcp_config.json'),
    path.join(context.homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
    ...(overridePath ? [path.resolve(overridePath)] : []),
    ...Object.values(context.state.targets)
      .filter((record) => record.kind === 'antigravity-config')
      .map((record) => record.path),
  ];
  const pluginsRoot = path.join(context.homeDir, '.gemini', 'config', 'plugins');
  if (fs.existsSync(pluginsRoot)) {
    knownRegistryPaths.push(
      ...fs.readdirSync(pluginsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'agentmem')
        .map((entry) => path.join(pluginsRoot, entry.name, 'mcp_config.json'))
    );
  }
  const registryPaths = Array.from(new Set(knownRegistryPaths.map((candidate) => path.resolve(candidate))))
    .filter((candidate) => fs.existsSync(candidate) || !!context.state.targets[candidate]);
  const pluginRoot = context.paths.antigravityPluginRoot.replace(/\\/g, '/');
  const activationWarnings: string[] = [];
  try {
    runAntigravityPluginCommand(['uninstall', 'agentmem']);
  } catch (error: any) {
    activationWarnings.push(
      `warning: failed to uninstall the active Antigravity AgentMemory plugin: ${error?.message || String(error)}`
    );
  }
  const guidanceCleanup = uninstallDedicatedArtifact(
    context,
    'antigravity-guidance',
    context.paths.antigravityGuidancePath,
    fs.existsSync(context.paths.antigravityGuidancePath) &&
      fs.readFileSync(context.paths.antigravityGuidancePath, 'utf8').includes('AgentMemory Antigravity Rules')
  );
  const pluginManifestCleanup = uninstallDedicatedArtifact(
    context,
    'antigravity-plugin-manifest',
    context.paths.antigravityPluginManifestPath,
    fs.existsSync(context.paths.antigravityPluginManifestPath) &&
      fs.readFileSync(context.paths.antigravityPluginManifestPath, 'utf8').includes('"name": "agentmem"')
  );
  const pluginHooksCleanup = uninstallDedicatedArtifact(
    context,
    'antigravity-plugin-hooks',
    context.paths.antigravityPluginHooksPath,
    fs.existsSync(context.paths.antigravityPluginHooksPath) &&
      fs.readFileSync(context.paths.antigravityPluginHooksPath, 'utf8').includes('antigravity-hook.js')
  );
  const pluginMcpCleanup = uninstallDedicatedArtifact(
    context,
    'antigravity-plugin-mcp',
    context.paths.antigravityPluginMcpPath,
    fs.existsSync(context.paths.antigravityPluginMcpPath) &&
      fs.readFileSync(context.paths.antigravityPluginMcpPath, 'utf8').includes(context.paths.mcpServerPath)
  );
  const pluginRuleCleanup = uninstallDedicatedArtifact(
    context,
    'antigravity-plugin-rule',
    context.paths.antigravityPluginRulePath,
    fs.existsSync(context.paths.antigravityPluginRulePath) &&
      fs.readFileSync(context.paths.antigravityPluginRulePath, 'utf8').includes('AgentMemory Antigravity Rules')
  );
  const pluginsConfigCleanup = uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(
      cleanupAntigravityPluginsConfig(readJsonFileText(currentText), pluginRoot)
    ),
    hasManagedContent: (currentText) => currentText.includes(pluginRoot),
    kind: 'antigravity-plugins-config',
    targetPath: context.paths.antigravityPluginsConfigPath,
  });
  const pluginWarnings = [
    ...activationWarnings,
    ...guidanceCleanup.warnings,
    ...pluginManifestCleanup.warnings,
    ...pluginHooksCleanup.warnings,
    ...pluginMcpCleanup.warnings,
    ...pluginRuleCleanup.warnings,
    ...pluginsConfigCleanup.warnings,
  ];
  const registryCleanups = registryPaths.map((registryPath) => uninstallManagedTextTarget(context, {
    cleanup: (currentText) => serializeJson(cleanupAntigravityConfig(readJsonFileText(currentText))),
    hasManagedContent: (currentText) =>
      detectAntigravityLegacy(readJsonFileText(currentText)),
    kind: 'antigravity-config',
    targetPath: registryPath,
  }));

  return {
    action: [
      ...registryCleanups.map((cleanup) => cleanup.action),
      guidanceCleanup.action,
      pluginManifestCleanup.action,
      pluginHooksCleanup.action,
      pluginMcpCleanup.action,
      pluginRuleCleanup.action,
      pluginsConfigCleanup.action,
    ].join('+'),
    agent: 'antigravity',
    ok: true,
    targetPath: registryPaths[0] || context.paths.antigravityGuidancePath,
    message: registryPaths.length > 0
      ? `Uninstalled AgentMemory from Antigravity registries (${registryPaths.join(', ')}) and plugin artifacts (${context.paths.antigravityPluginDir})`
      : `No Antigravity MCP registry was present; removed generated plugin artifacts if present (${context.paths.antigravityPluginDir})`,
    warnings: [...registryCleanups.flatMap((cleanup) => cleanup.warnings), ...pluginWarnings],
  };
}

function uninstallGrok(context: InstallContext): UninstallResult {
  const configCleanup = uninstallManagedTextTarget(context, {
    cleanup: removeGrokAgentMemoryConfig,
    hasManagedContent: detectGrokConfigLegacy,
    kind: 'grok-config',
    targetPath: context.paths.grokConfigPath,
  });
  const hooksCleanup = uninstallDedicatedArtifact(
    context,
    'grok-hooks',
    context.paths.grokHooksPath,
    fs.existsSync(context.paths.grokHooksPath) &&
      fs.readFileSync(context.paths.grokHooksPath, 'utf8').includes('grok-hook.js')
  );
  const profileCleanup = uninstallDedicatedArtifact(
    context,
    'grok-profile',
    context.paths.grokProfilePath,
    fs.existsSync(context.paths.grokProfilePath) &&
      fs.readFileSync(context.paths.grokProfilePath, 'utf8').includes('AgentMemory Grok Profile')
  );
  const rulesCleanup = uninstallManagedTextTarget(context, {
    cleanup: removeGrokGlobalRules,
    hasManagedContent: hasGrokGlobalRules,
    kind: 'grok-rules',
    removeWhenEmpty: true,
    targetPath: context.paths.grokRulesPath,
  });

  return {
    action: `${configCleanup.action}+${hooksCleanup.action}+${profileCleanup.action}+${rulesCleanup.action}`,
    agent: 'grok',
    ok: true,
    targetPath: context.paths.grokConfigPath,
    message: `Uninstalled AgentMemory from Grok (${context.paths.grokConfigPath}, ${context.paths.grokHooksPath}, ${context.paths.grokRulesPath})`,
    warnings: [...configCleanup.warnings, ...hooksCleanup.warnings, ...profileCleanup.warnings, ...rulesCleanup.warnings],
  };
}

function readJsonFileText(text: string): Record<string, any> {
  return JSON.parse(stripComments(text || '{}') || '{}');
}

function removeFileIfExists(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

async function attemptGlobalUnlink(repoRoot: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'cmd' : 'npm';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm', 'unlink', '--global', 'agentmemory']
        : ['unlink', '--global', 'agentmemory'];

    const child = spawn(executable, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `npm unlink exited with code ${code}`));
    });
  });
}

export function validateInstalledFiles(paths: InstallPaths, antigravityConfigPath?: string): string[] {
  const issues: string[] = [];
  const opencodePaths = resolveOpenCodePaths(paths.homeDir);

  const claudeGlobalPath = path.join(paths.homeDir, '.claude.json');
  const claudeSettingsPath = path.join(paths.homeDir, '.claude', 'settings.json');
  const codexConfigPath = path.join(paths.homeDir, '.codex', 'config.toml');
  const codexHooksPath = path.join(paths.homeDir, '.codex', 'hooks.json');

  const claudeGlobal = readJsonFile(claudeGlobalPath);
  if (claudeGlobal?.mcpServers?.agentmem?.args?.[0] !== paths.mcpServerPath) {
    issues.push(`Claude Code MCP server is missing or points somewhere else (${claudeGlobalPath}).`);
  }

  const claudeSettings = readJsonFile(claudeSettingsPath);
  if (!JSON.stringify(claudeSettings).includes(paths.claudeStartHook)) {
    issues.push(`Claude Code SessionStart hook is missing (${claudeSettingsPath}).`);
  }
  if (!JSON.stringify(claudeSettings).includes(paths.claudePostHook)) {
    issues.push(`Claude Code PostToolUse hook is missing (${claudeSettingsPath}).`);
  }

  const codexToml = fs.existsSync(codexConfigPath) ? fs.readFileSync(codexConfigPath, 'utf8') : '';
  if (!codexToml.includes(paths.mcpServerPath) || !/^\s*hooks\s*=\s*true$/m.test(codexToml)) {
    issues.push(`${CODEX_DISPLAY_NAME} config.toml is missing hooks=true or the agentmem MCP server (${codexConfigPath}).`);
  }

  const codexHooks = readJsonFile(codexHooksPath);
  if (!JSON.stringify(codexHooks || {}).includes(paths.codexStartHook)) {
    issues.push(`${CODEX_DISPLAY_NAME} SessionStart hook is missing (${codexHooksPath}).`);
  }
  if (!JSON.stringify(codexHooks).includes(paths.codexPostHook)) {
    issues.push(`${CODEX_DISPLAY_NAME} PostToolUse hook is missing (${codexHooksPath}).`);
  }

  const grokToml = fs.existsSync(paths.grokConfigPath) ? fs.readFileSync(paths.grokConfigPath, 'utf8') : '';
  if (!grokToml.includes(paths.mcpServerPath) || !/AGENTMEM_AGENT_ID\s*=\s*"grok"/.test(grokToml)) {
    issues.push(`Grok config.toml is missing the AgentMemory MCP server or AGENTMEM_AGENT_ID=grok (${paths.grokConfigPath}).`);
  }
  if (!/^\s*name\s*=\s*"agentmem"\s*$/m.test(grokToml) || !/^\s*hooks\s*=\s*false\s*(?:#.*)?$/m.test(grokToml)) {
    issues.push(`Grok config.toml is missing the default agentmem profile or compat.claude hooks=false (${paths.grokConfigPath}).`);
  }
  if (!fs.existsSync(paths.grokHooksPath) || !fs.readFileSync(paths.grokHooksPath, 'utf8').includes(paths.grokHook)) {
    issues.push(`Grok AgentMemory lifecycle hook configuration is missing (${paths.grokHooksPath}).`);
  }
  if (!fs.existsSync(paths.grokProfilePath)) {
    issues.push(`Grok AgentMemory profile is missing (${paths.grokProfilePath}).`);
  } else {
    const profileText = fs.readFileSync(paths.grokProfilePath, 'utf8');
    if (!profileText.includes('agents_md: false') || !profileText.includes('get_project_context') || !profileText.includes('AgentMemory Grok Profile')) {
      issues.push(`Grok AgentMemory profile is missing the startup and boundary workflow (${paths.grokProfilePath}).`);
    }
  }

  const opencodeConfig = readJsonFile(
    opencodePaths.configTargetPath,
    opencodePaths.configTargetPath.endsWith('.jsonc')
  );
  if (opencodeConfig?.mcp?.agentmem?.command?.[1] !== paths.mcpServerPath) {
    issues.push(`OpenCode MCP server is missing or points somewhere else (${opencodePaths.configTargetPath}).`);
  }
  if (!fs.existsSync(opencodePaths.pluginPath)) {
    issues.push(`OpenCode bridge plugin is missing (${opencodePaths.pluginPath}).`);
  } else {
    const pluginText = fs.readFileSync(opencodePaths.pluginPath, 'utf8');
    if (!pluginText.includes(paths.opencodeStartHook) || !pluginText.includes(paths.opencodePostHook)) {
      issues.push(`OpenCode bridge plugin does not point at the built hook scripts (${opencodePaths.pluginPath}).`);
    }
  }

  if (antigravityConfigPath) {
    const registriesToCheck = Array.from(new Set([
      paths.antigravityOfficialConfigPath,
      antigravityConfigPath,
    ]));
    for (const registryPath of registriesToCheck) {
      if (!fs.existsSync(registryPath)) {
        if (registryPath === paths.antigravityOfficialConfigPath) {
          issues.push(`Antigravity official MCP registry is missing (${registryPath}).`);
        }
        continue;
      }
      const antigravityConfig = readJsonFile(registryPath, true);
      if (antigravityConfig?.mcpServers?.agentmem?.args?.[0] !== paths.mcpServerPath) {
        issues.push(`Antigravity MCP registry is missing the agentmem server (${registryPath}).`);
      }
      if (antigravityConfig?.mcpServers?.agentmem?.env?.AGENTMEM_AGENT_ID !== 'antigravity') {
        issues.push(`Antigravity MCP registry is missing AGENTMEM_AGENT_ID=antigravity (${registryPath}).`);
      }
    }
    if (!fs.existsSync(paths.antigravityGuidancePath)) {
      issues.push(`Antigravity AgentMemory guidance is missing (${paths.antigravityGuidancePath}).`);
    } else {
      const guidanceText = fs.readFileSync(paths.antigravityGuidancePath, 'utf8');
      if (
        !guidanceText.includes('unverified working memory') ||
        !guidanceText.includes('record_memory') ||
        !guidanceText.includes('trivial output')
      ) {
        issues.push(`Antigravity AgentMemory guidance is missing the working-memory boundary rules (${paths.antigravityGuidancePath}).`);
      }
    }
    if (!fs.existsSync(paths.antigravityPluginManifestPath)) {
      issues.push(`Antigravity AgentMemory plugin manifest is missing (${paths.antigravityPluginManifestPath}).`);
    }
    if (!fs.existsSync(paths.antigravityPluginHooksPath)) {
      issues.push(`Antigravity AgentMemory hooks are missing (${paths.antigravityPluginHooksPath}).`);
    } else {
      const hooksText = fs.readFileSync(paths.antigravityPluginHooksPath, 'utf8');
      if (
        !hooksText.includes(paths.antigravityHook) ||
        !hooksText.includes('PreInvocation') ||
        !hooksText.includes('PostToolUse') ||
        !hooksText.includes('Stop')
      ) {
        issues.push(`Antigravity AgentMemory hooks do not point at the built bridge (${paths.antigravityPluginHooksPath}).`);
      }
    }
    if (!fs.existsSync(paths.antigravityPluginMcpPath)) {
      issues.push(`Antigravity AgentMemory plugin MCP config is missing (${paths.antigravityPluginMcpPath}).`);
    } else {
      const pluginMcp = readJsonFile(paths.antigravityPluginMcpPath, true);
      if (
        pluginMcp?.mcpServers?.agentmem?.args?.[0] !== paths.mcpServerPath ||
        pluginMcp?.mcpServers?.agentmem?.env?.AGENTMEM_AGENT_ID !== 'antigravity'
      ) {
        issues.push(`Antigravity AgentMemory plugin MCP config is missing agentmem or AGENTMEM_AGENT_ID (${paths.antigravityPluginMcpPath}).`);
      }
    }
    if (!fs.existsSync(paths.antigravityPluginRulePath)) {
      issues.push(`Antigravity AgentMemory plugin rule is missing (${paths.antigravityPluginRulePath}).`);
    } else {
      const ruleText = fs.readFileSync(paths.antigravityPluginRulePath, 'utf8');
      if (!ruleText.startsWith('---\n') || !ruleText.includes('trigger: always_on')) {
        issues.push(`Antigravity AgentMemory plugin rule is missing required frontmatter (${paths.antigravityPluginRulePath}).`);
      }
    }
    if (process.env.AGENTMEM_SKIP_ANTIGRAVITY_PLUGIN_ACTIVATION !== '1') {
      const importManifestPath = path.join(paths.homeDir, '.gemini', 'config', 'import_manifest.json');
      const importManifest = readJsonFile(importManifestPath, true);
      const pluginImported = Array.isArray(importManifest.imports) && importManifest.imports.some(
        (entry: unknown) => isObject(entry) && entry.name === 'agentmem'
      );
      if (!pluginImported) {
        issues.push(`Antigravity AgentMemory plugin is not active (${importManifestPath}).`);
      }
      if (!fs.existsSync(path.join(paths.antigravityImportedPluginDir, 'plugin.json'))) {
        issues.push(`Antigravity imported AgentMemory plugin is missing (${paths.antigravityImportedPluginDir}).`);
      }
    }
  }

  return issues;
}

export function installAgentMemory(options: InstallOptions): InstallResult[] {
  const homeDir = options.homeDir || os.homedir();
  const context: InstallContext = {
    homeDir,
    paths: resolveInstallPaths(options.repoRoot, homeDir),
    state: loadInstallState(homeDir),
  };

  const results: InstallResult[] = [];
  const failures: string[] = [];

  const steps: Array<{ agent: InstallResult['agent']; run: () => InstallResult }> = [
    { agent: 'claude', run: () => installClaude(context) },
    { agent: 'opencode', run: () => installOpenCode(context) },
    { agent: 'codex', run: () => installCodex(context) },
    { agent: 'grok', run: () => installGrok(context) },
    { agent: 'antigravity', run: () => installAntigravity(context, options.antigravityConfigPath) },
  ];

  for (const step of steps) {
    try {
      results.push(step.run());
    } catch (error: any) {
      const message = error?.message || String(error);
      results.push({
        action: 'failed',
        agent: step.agent,
        ok: false,
        message,
      });
      failures.push(message);
    }
  }

  const antigravityPath =
    resolveAntigravityConfigPath(homeDir, options.antigravityConfigPath) || undefined;
  const validationIssues = validateInstalledFiles(context.paths, antigravityPath);
  failures.push(...validationIssues);

  if ((options.strict || false) && failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  return results;
}

export async function uninstallAgentMemory(options: UninstallOptions): Promise<UninstallResult[]> {
  const homeDir = options.homeDir || os.homedir();
  const context: InstallContext = {
    homeDir,
    paths: resolveInstallPaths(options.repoRoot, homeDir),
    state: loadInstallState(homeDir),
  };

  const results: UninstallResult[] = [];
  const failures: string[] = [];

  const steps: Array<{ agent: UninstallResult['agent']; run: () => UninstallResult }> = [
    { agent: 'claude', run: () => uninstallClaude(context) },
    { agent: 'opencode', run: () => uninstallOpenCode(context) },
    { agent: 'codex', run: () => uninstallCodex(context) },
    { agent: 'grok', run: () => uninstallGrok(context) },
    { agent: 'antigravity', run: () => uninstallAntigravity(context, options.antigravityConfigPath) },
  ];

  for (const step of steps) {
    try {
      results.push(step.run());
    } catch (error: any) {
      const message = error?.message || String(error);
      results.push({
        action: 'failed',
        agent: step.agent,
        ok: false,
        message,
      });
      failures.push(message);
    }
  }

  const runtimeDir = path.join(homeDir, '.agentmem');
  const removedArtifacts: string[] = [];
  if (removeFileIfExists(path.join(runtimeDir, '.env'))) {
    removedArtifacts.push(path.join(runtimeDir, '.env'));
  }
  if (removeFileIfExists(path.join(runtimeDir, 'agentmemory.db'))) {
    removedArtifacts.push(path.join(runtimeDir, 'agentmemory.db'));
  }
  if (removeFileIfExists(path.join(runtimeDir, 'worker.pid'))) {
    removedArtifacts.push(path.join(runtimeDir, 'worker.pid'));
  }

  results.push({
    action: removedArtifacts.length > 0 ? 'removed-runtime-artifacts' : 'no-op',
    agent: 'runtime',
    ok: true,
    message:
      removedArtifacts.length > 0
        ? `Removed AgentMemory runtime artifacts (${removedArtifacts.join(', ')})`
        : 'No AgentMemory runtime artifacts were present.',
  });

  if (options.purgeAll) {
    purgeInstallStateArtifacts(homeDir);
    results.push({
      action: 'purged-install-state',
      agent: 'runtime',
      ok: true,
      message: `Removed ${path.join(homeDir, '.agentmem', 'install-state.json')} and backup artifacts.`,
    });
  }

  const skipGlobalUnlink = options.skipGlobalUnlink || process.env.AGENTMEM_SKIP_GLOBAL_UNLINK === '1';
  if (skipGlobalUnlink) {
    results.push({
      action: 'skipped-global-unlink',
      agent: 'cli',
      ok: true,
      message: 'Skipped npm unlink --global agentmemory.',
    });
  } else {
    try {
      await attemptGlobalUnlink(options.repoRoot);
      results.push({
        action: 'unlinked-global-cli',
        agent: 'cli',
        ok: true,
        message: 'Removed the global agentmem CLI link.',
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      results.push({
        action: 'failed-global-unlink',
        agent: 'cli',
        ok: false,
        message,
      });
      failures.push(message);
    }
  }

  if ((options.strict || false) && failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  return results;
}
