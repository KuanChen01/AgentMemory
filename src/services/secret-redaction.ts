// Credential redaction for captured tool calls and stored memory text.
// Works on plain text and on JSON-encoded text alike: no pattern consumes a quote or a backslash, so a
// replacement never breaks a JSON string escape and redacted JSON still parses.
// Best effort: it removes known credential shapes, not every possible secret.

export const SECRET_FILE_OMITTED = '[secret file content omitted by AgentMemory]';

/** Files whose content is a credential store as a whole. Example/template env files stay readable. */
const SECRET_FILE_NAME = /(?:^|[\\/])(?:\.env(?:\.(?!example$|sample$|template$|dist$)[\w.-]+)?|\.envrc|id_(?:rsa|dsa|ecdsa|ed25519)|\.npmrc|\.pypirc|\.netrc|_netrc|\.pgpass|\.git-credentials|credentials\.json|[^\\/]*secrets?\.(?:json|ya?ml|toml)|service[-_]?account[^\\/]*\.json)$|[\\/]credentials$/i;
// Lowercase only, and never a variable: `$_.Key` and `$entry.Key` are PowerShell members, not files.
const SECRET_FILE_EXT = /\.(?:pem|key|p12|pfx|jks|keystore)$/;
// A shell command only exposes a secret file's content when a reader runs on it, not when it names it (git add .env).
const READ_VERB = /^(?:cat|type|more|less|head|tail|bat|nl|tac|Get-Content|gc|sed|awk|grep|egrep|rg|findstr|Select-String|sls|strings|xxd|od|base64|source|\.)$/i;
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

const PATH_FIELDS = new Set(['file_path', 'filePath', 'path', 'notebook_path', 'filename', 'file', 'target_file', 'absolute_path', 'uri']);
const COMMAND_FIELDS = new Set(['command', 'cmd', 'script', 'commandLine']);
// Input fields of a secret-file call that never carry file content.
const KEEP_FIELDS = new Set(['description', 'offset', 'limit', 'pattern', 'replace_all', 'glob', 'type', 'output_mode']);

// Known credential formats. Each label names the format only; no part of the value is kept.
const TOKEN_PATTERNS: Array<[string, RegExp]> = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|(?:[A-Za-z0-9+/=]|\\[nr]|\s)*)/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai-style-key', /\bsk-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}/g],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}/g],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['huggingface-token', /\bhf_[A-Za-z0-9]{30,}\b/g],
  ['stripe-key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];
// "Bearer <token>" / "Basic <token>": the scheme stays, the credential goes. A digit is required so prose does not match.
const AUTH_SCHEME = /\b(Bearer|Basic)(\s+)(?=[A-Za-z0-9._~+/-]*\d)[A-Za-z0-9._~+/-]{16,}=*/gi;
// scheme://user:password@host: the password goes.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\/\s:@"'\\<>]+:)[^\/\s@"'\\<>]+@/gi;

// NAME=value, NAME: value, "name": "value" (also JSON-escaped) where NAME names a credential.
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*?(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|private[_-]?key|access[_-]?key|credential|auth(?!or(?!ization))|_key|-key)[A-Za-z0-9_]*`;
const ASSIGNMENT = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(` + SECRET_NAME + String.raw`)((?:\\?["'])?\s*[:=]\s*(?:\\?["'])?)([^\s"'\\,;{}()<>\[\]` + '`' + String.raw`]+)`,
  'gi',
);
const PLACEHOLDER = /^(?:x{3,}|\*{3,}|•|your|\$|%|process\.|os\.environ|env\.|example|changeme|placeholder|redacted|null|undefined|none|true|false|string|number|required|optional|\.\.\.)/i;
const PASSWORD_NAME = /pass(?:w(?:or)?d)?|pwd|secret/i;

/** True when a value assigned to a credential-named variable looks like a real credential, not code or a placeholder. */
function credentialLike(name: string, value: string): boolean {
  if (PLACEHOLDER.test(value)) return false;
  if (/^(?:\/|\.{1,2}\/|[A-Za-z]:[\\/])/.test(value) || value.includes('://')) return false;
  // An identifier or member access without digits (secret = String, apiKey: env.apiKey) is code, not a value.
  if (!/\d/.test(value) && /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(value)) return false;
  if (PASSWORD_NAME.test(name)) return value.length >= 6;
  return value.length >= 8 && /\d/.test(value) && /[A-Za-z]/.test(value);
}

/** AgentMemory's own saved credentials (LLM key, bootstrap key, custom header values), read at call time. */
export function knownSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const out = [env.AGENTMEM_LLM_API_KEY, env.DEEPSEEK_API_KEY, env.AGENTMEM_BOOTSTRAP_API_KEY].map((v) => String(v ?? '').trim());
  try {
    const headers = JSON.parse(env.AGENTMEM_LLM_HEADERS || '{}');
    for (const [name, value] of Object.entries(headers || {})) {
      if (name.toLowerCase() === 'content-type') continue;
      const text = String(value ?? '').trim();
      out.push(text);
      const scheme = /^\S+\s+(\S.*)$/.exec(text);
      if (scheme) out.push(scheme[1].trim());
    }
  } catch { /* Unparsable headers carry nothing to match. */ }
  // A value shorter than 6 characters is not a usable credential and would blank ordinary text.
  return [...new Set(out.filter((v) => v.length >= 6))].sort((a, b) => b.length - a.length);
}

/** Remove credentials from free text (or JSON text). Idempotent: markers never match again. */
export function redactSecrets(text: string, known: string[] = knownSecrets()): string {
  let out = String(text ?? '');
  if (!out) return out;
  for (const secret of known) if (out.includes(secret)) out = out.split(secret).join('<redacted:agentmem-credential>');
  for (const [label, pattern] of TOKEN_PATTERNS) out = out.replace(pattern, `<redacted:${label}>`);
  out = out.replace(AUTH_SCHEME, '$1$2<redacted:token>');
  out = out.replace(URL_PASSWORD, '$1<redacted:password>@');
  out = out.replace(ASSIGNMENT, (full: string, name: string, sep: string, value: string) =>
    credentialLike(name, value) ? `${name}${sep}<redacted>` : full);
  return out;
}

export function isSecretFilePath(value: string): boolean {
  const text = String(value ?? '').trim();
  return SECRET_FILE_NAME.test(text) || (SECRET_FILE_EXT.test(text) && !text.includes('$'));
}

/** True when some segment of a shell command starts with a reader and names a secret file (cat .env | grep X). */
function readsSecretFile(command: string): boolean {
  return command.split(/[\r\n;&|]+/).some((segment) => {
    const tokens = segment.split(/[\s"'`<>()=,]+/).filter(Boolean);
    // Skip `sudo` and PowerShell assignment targets ($x = Get-Content .env).
    while (tokens.length && /^(?:sudo|\$.*)$/.test(tokens[0])) tokens.shift();
    return tokens.length > 1 && READ_VERB.test(tokens[0]) && tokens.slice(1).some(isSecretFilePath);
  });
}

/** A patch touching a secret file keeps only its file headers; null when it touches none. */
function redactPatch(text: string): string | null {
  const headers = [...text.matchAll(PATCH_FILE)];
  if (!headers.some((m) => isSecretFilePath(m[1]))) return null;
  return [...headers.map((m) => m[0]), SECRET_FILE_OMITTED].join('\n');
}

/** The same value with any secret-file patch in it (a string, or an argv element) reduced to headers; null if none. */
function redactPatchValue(value: unknown): unknown | null {
  if (typeof value === 'string') return redactPatch(value);
  if (!Array.isArray(value)) return null;
  let hit = false;
  const next = value.map((item) => {
    const patched = typeof item === 'string' ? redactPatch(item) : null;
    if (patched !== null) hit = true;
    return patched ?? item;
  });
  return hit ? next : null;
}

function commandStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(commandStrings);
  return [];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Redact one captured tool call. A call that reads or writes a secret file (a path field, a shell command that reads
 * one, or a patch that edits one) keeps the path but loses the file content; everything then goes through redactSecrets.
 */
export function redactToolEvent(input: string, output: string, known: string[] = knownSecrets()): { input: string; output: string } {
  let nextInput = String(input ?? '');
  let nextOutput = String(output ?? '');
  const parsed = parseJson(nextInput);
  let omitOutput = false;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const fields = parsed as Record<string, unknown>;
    const pathHit = Object.entries(fields).some(([key, value]) => PATH_FIELDS.has(key) && typeof value === 'string' && isSecretFilePath(value));
    const kept: Record<string, unknown> = { ...fields };
    let changed = false;
    for (const [key, value] of Object.entries(fields)) {
      if (pathHit && !(PATH_FIELDS.has(key) || KEEP_FIELDS.has(key) || typeof value === 'number' || typeof value === 'boolean')) {
        kept[key] = SECRET_FILE_OMITTED; changed = true; continue;
      }
      const patched = redactPatchValue(value);
      if (patched !== null) { kept[key] = patched; changed = true; continue; }
      if (COMMAND_FIELDS.has(key) && commandStrings(value).some(readsSecretFile)) omitOutput = true;
    }
    if (changed) nextInput = JSON.stringify(kept);
    omitOutput ||= pathHit;
  } else {
    // A raw patch or command, possibly JSON-encoded as a single string.
    const text = typeof parsed === 'string' ? parsed : nextInput;
    const patched = redactPatch(text);
    if (patched !== null) nextInput = typeof parsed === 'string' ? JSON.stringify(patched) : patched;
    else omitOutput = readsSecretFile(text);
  }
  if (omitOutput && nextOutput.trim()) nextOutput = SECRET_FILE_OMITTED;
  return { input: redactSecrets(nextInput, known), output: redactSecrets(nextOutput, known) };
}
