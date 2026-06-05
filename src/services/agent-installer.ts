import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateCodexConfigToml } from './codex-installer';

export interface InstallOptions {
  antigravityConfigPath?: string;
  homeDir?: string;
  repoRoot: string;
  strict?: boolean;
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
}

export interface InstallResult {
  agent: 'claude' | 'opencode' | 'codex' | 'antigravity';
  ok: boolean;
  targetPath?: string;
  message: string;
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

export function ensureAntigravityMcpServer(jsonText: string, mcpServerPath: string): string {
  const parsed = JSON.parse(stripComments(jsonText || '{}') || '{}');
  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    parsed.mcpServers = {};
  }

  parsed.mcpServers.agentmem = {
    command: 'node',
    args: [mcpServerPath],
    disabled: false,
  };

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function resolveInstallPaths(repoRoot: string, homeDir: string = os.homedir()): InstallPaths {
  const normalizedRepoRoot = repoRoot.replace(/\\/g, '/');

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
  };
}

export function resolveAntigravityConfigPath(
  homeDir: string,
  overridePath?: string
): string | null {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  const pluginsRoot = path.join(homeDir, '.gemini', 'config', 'plugins');
  if (!fs.existsSync(pluginsRoot)) {
    return null;
  }

  const candidates = fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsRoot, entry.name, 'mcp_config.json'))
    .filter((candidate) => fs.existsSync(candidate));

  if (candidates.length === 0) {
    return null;
  }

  const preferred = candidates.find((candidate) => candidate.includes(`${path.sep}local-game-mcps${path.sep}`));
  return preferred || candidates[0];
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

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function installClaude(paths: InstallPaths): InstallResult {
  const claudeSettingsPath = path.join(paths.homeDir, '.claude', 'settings.json');
  const claudeGlobalPath = path.join(paths.homeDir, '.claude.json');

  const claudeDir = path.dirname(claudeSettingsPath);
  ensureDir(claudeDir);

  const settings = readJsonFile(claudeSettingsPath);
  if (settings.mcpServers) {
    delete settings.mcpServers;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  settings.hooks.SessionStart = [
    {
      matcher: '.*',
      hooks: [{ type: 'command', command: `node "${paths.claudeStartHook}"` }],
    },
  ];
  settings.hooks.PostToolUse = [
    {
      matcher: '.*',
      hooks: [{ type: 'command', command: `node "${paths.claudePostHook}"` }],
    },
  ];

  writeJson(claudeSettingsPath, settings);

  const globalConfig = readJsonFile(claudeGlobalPath);
  if (!globalConfig.mcpServers) {
    globalConfig.mcpServers = {};
  }
  globalConfig.mcpServers.agentmem = {
    type: 'stdio',
    command: 'node',
    args: [paths.mcpServerPath],
    env: {},
  };

  writeJson(claudeGlobalPath, globalConfig);
  return {
    agent: 'claude',
    ok: true,
    targetPath: claudeSettingsPath,
    message: `Registered hooks and MCP server in Claude Code (${claudeSettingsPath}, ${claudeGlobalPath})`,
  };
}

function installOpenCode(paths: InstallPaths): InstallResult {
  const opencodeConfigDir = path.join(paths.homeDir, '.config', 'opencode');
  const opencodeConfigPath = path.join(opencodeConfigDir, 'opencode.json');
  const opencodeJsoncPath = path.join(opencodeConfigDir, 'opencode.jsonc');
  const pluginsDir = path.join(opencodeConfigDir, 'plugins');
  const pluginPath = path.join(pluginsDir, 'agentmem-plugin.mjs');
  let targetPath = opencodeJsoncPath;

  ensureDir(opencodeConfigDir);
  ensureDir(pluginsDir);

  let opencodeConfig: any = {};
  if (fs.existsSync(opencodeJsoncPath)) {
    opencodeConfig = readJsonFile(opencodeJsoncPath, true);
  } else if (fs.existsSync(opencodeConfigPath)) {
    targetPath = opencodeConfigPath;
    opencodeConfig = readJsonFile(opencodeConfigPath);
  }

  if (!opencodeConfig.mcp) {
    opencodeConfig.mcp = {};
  }
  opencodeConfig.mcp.agentmem = {
    type: 'local',
    command: ['node', paths.mcpServerPath],
    enabled: true,
  };

  if (!Array.isArray(opencodeConfig.plugin)) {
    opencodeConfig.plugin = [];
  }

  const pluginUrl = `file:///${pluginPath.replace(/\\/g, '/')}`;
  if (!opencodeConfig.plugin.includes(pluginUrl)) {
    opencodeConfig.plugin.push(pluginUrl);
  }

  if (opencodeConfig.hooks) {
    delete opencodeConfig.hooks;
  }
  if (opencodeConfig.mcp.servers) {
    delete opencodeConfig.mcp.servers;
  }

  writeJson(targetPath, opencodeConfig);
  fs.writeFileSync(
    pluginPath,
    renderOpenCodePlugin({
      startHookPath: paths.opencodeStartHook,
      postHookPath: paths.opencodePostHook,
    }),
    'utf8'
  );

  if (targetPath === opencodeJsoncPath && fs.existsSync(opencodeConfigPath)) {
    fs.unlinkSync(opencodeConfigPath);
  }

  return {
    agent: 'opencode',
    ok: true,
    targetPath,
    message: `Registered plugin, generated hook bridge, and MCP server in OpenCode (${targetPath}, ${pluginPath})`,
  };
}

function installCodex(paths: InstallPaths): InstallResult {
  const codexConfigDir = path.join(paths.homeDir, '.codex');
  const codexConfigPath = path.join(codexConfigDir, 'config.toml');
  const codexHooksPath = path.join(codexConfigDir, 'hooks.json');

  ensureDir(codexConfigDir);

  const existingToml = fs.existsSync(codexConfigPath)
    ? fs.readFileSync(codexConfigPath, 'utf8')
    : '';
  const updatedToml = updateCodexConfigToml(existingToml, paths.mcpServerPath);
  fs.writeFileSync(codexConfigPath, updatedToml, 'utf8');

  const hooksConfig = readJsonFile(codexHooksPath);
  if (!hooksConfig.hooks) {
    hooksConfig.hooks = {};
  }

  hooksConfig.hooks.SessionStart = [
    {
      matcher: '.*',
      hooks: [{ type: 'command', command: `node "${paths.codexStartHook}"` }],
    },
  ];
  hooksConfig.hooks.PostToolUse = [
    {
      matcher: '.*',
      hooks: [{ type: 'command', command: `node "${paths.codexPostHook}"` }],
    },
  ];

  writeJson(codexHooksPath, hooksConfig);
  return {
    agent: 'codex',
    ok: true,
    targetPath: codexConfigPath,
    message: `Registered hooks and MCP server in Codex (${codexConfigPath}, ${codexHooksPath})`,
  };
}

function installAntigravity(paths: InstallPaths, overridePath?: string): InstallResult {
  const configPath = resolveAntigravityConfigPath(paths.homeDir, overridePath);
  if (!configPath) {
    throw new Error(
      'Antigravity MCP registry was not found under ~/.gemini/config/plugins/*/mcp_config.json. ' +
      'Create the plugin registry first or pass --antigravity-config <path>.'
    );
  }

  ensureDir(path.dirname(configPath));
  const existingJson = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '{}';
  const updatedJson = ensureAntigravityMcpServer(existingJson, paths.mcpServerPath);
  fs.writeFileSync(configPath, updatedJson, 'utf8');

  return {
    agent: 'antigravity',
    ok: true,
    targetPath: configPath,
    message: `Registered MCP server in Antigravity (${configPath})`,
  };
}

export function validateInstalledFiles(paths: InstallPaths, antigravityConfigPath?: string): string[] {
  const issues: string[] = [];

  const claudeGlobalPath = path.join(paths.homeDir, '.claude.json');
  const claudeSettingsPath = path.join(paths.homeDir, '.claude', 'settings.json');
  const codexConfigPath = path.join(paths.homeDir, '.codex', 'config.toml');
  const codexHooksPath = path.join(paths.homeDir, '.codex', 'hooks.json');
  const opencodeConfigPath = path.join(paths.homeDir, '.config', 'opencode', 'opencode.jsonc');
  const opencodePluginPath = path.join(paths.homeDir, '.config', 'opencode', 'plugins', 'agentmem-plugin.mjs');

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
    issues.push(`Codex config.toml is missing hooks=true or the agentmem MCP server (${codexConfigPath}).`);
  }

  const codexHooks = readJsonFile(codexHooksPath);
  if (!JSON.stringify(codexHooks).includes(paths.codexStartHook)) {
    issues.push(`Codex SessionStart hook is missing (${codexHooksPath}).`);
  }
  if (!JSON.stringify(codexHooks).includes(paths.codexPostHook)) {
    issues.push(`Codex PostToolUse hook is missing (${codexHooksPath}).`);
  }

  const opencodeConfig = readJsonFile(opencodeConfigPath, true);
  if (opencodeConfig?.mcp?.agentmem?.command?.[1] !== paths.mcpServerPath) {
    issues.push(`OpenCode MCP server is missing or points somewhere else (${opencodeConfigPath}).`);
  }
  if (!fs.existsSync(opencodePluginPath)) {
    issues.push(`OpenCode bridge plugin is missing (${opencodePluginPath}).`);
  } else {
    const pluginText = fs.readFileSync(opencodePluginPath, 'utf8');
    if (!pluginText.includes(paths.opencodeStartHook) || !pluginText.includes(paths.opencodePostHook)) {
      issues.push(`OpenCode bridge plugin does not point at the built hook scripts (${opencodePluginPath}).`);
    }
  }

  if (antigravityConfigPath) {
    const antigravityConfig = readJsonFile(antigravityConfigPath, true);
    if (antigravityConfig?.mcpServers?.agentmem?.args?.[0] !== paths.mcpServerPath) {
      issues.push(`Antigravity MCP registry is missing the agentmem server (${antigravityConfigPath}).`);
    }
  }

  return issues;
}

export function installAgentMemory(options: InstallOptions): InstallResult[] {
  const homeDir = options.homeDir || os.homedir();
  const paths = resolveInstallPaths(options.repoRoot, homeDir);
  const results: InstallResult[] = [];
  const failures: string[] = [];

  const steps: Array<{ agent: InstallResult['agent']; run: () => InstallResult }> = [
    { agent: 'claude', run: () => installClaude(paths) },
    { agent: 'opencode', run: () => installOpenCode(paths) },
    { agent: 'codex', run: () => installCodex(paths) },
    { agent: 'antigravity', run: () => installAntigravity(paths, options.antigravityConfigPath) },
  ];

  for (const step of steps) {
    try {
      results.push(step.run());
    } catch (error: any) {
      const message = error?.message || String(error);
      results.push({
        agent: step.agent,
        ok: false,
        message,
      });
      failures.push(message);
    }
  }

  const antigravityPath = resolveAntigravityConfigPath(homeDir, options.antigravityConfigPath) || undefined;
  const validationIssues = validateInstalledFiles(paths, antigravityPath);
  failures.push(...validationIssues);

  if ((options.strict || false) && failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  return results;
}
