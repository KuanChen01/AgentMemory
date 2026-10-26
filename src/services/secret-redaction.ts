// Credential redaction for captured tool calls and stored memory text.
// It runs synchronously on the capture path, so every pattern is bounded and its cost stays linear in the input size.
// JSON is redacted value by value, so redacted JSON always parses. Best effort: it removes known credential shapes,
// not every possible secret.

export const SECRET_FILE_OMITTED = '[secret file content omitted by AgentMemory]';
const REDACTED = '<redacted>';

/** Files whose content is a credential store as a whole. Example/template env files and public keys stay readable. */
const SECRET_FILE_NAME = /(?:^|[\\/])(?:\.env(?:\.(?!example$|sample$|template$|dist$)[\w.-]+)?|\.envrc|id_(?:rsa|dsa|ecdsa|ed25519)(?![\w.-]*\.pub$)[\w.-]*|\.npmrc|\.pypirc|\.netrc|_netrc|\.pgpass|\.git-credentials|credentials[\w.-]*\.json|[^\\/]*secrets?\.(?:json|ya?ml|toml)|service[-_]?account[^\\/]*\.json)$|[\\/]credentials$/i;
// Lowercase only, and never a variable: `$_.Key` and `$entry.Key` are PowerShell members, not files.
const SECRET_FILE_EXT = /\.(?:pem|key|p12|pfx|jks|keystore)$/;
// A shell command only exposes a secret file's content when a reader runs on it, not when it names it (git add .env).
const READ_VERB = /^(?:cat|type|more|less|head|tail|bat|nl|tac|Get-Content|gc|sed|awk|grep|egrep|rg|findstr|Select-String|sls|strings|xxd|od|base64|source|\.)$/i;
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

const PATH_FIELDS = new Set(['file_path', 'filePath', 'path', 'notebook_path', 'filename', 'file', 'target_file', 'absolute_path', 'uri']);
const COMMAND_FIELDS = new Set(['command', 'cmd', 'script', 'commandLine']);
// Input fields of a secret-file call that never carry file content.
const KEEP_FIELDS = new Set(['description', 'offset', 'limit', 'pattern', 'replace_all', 'glob', 'type', 'output_mode']);

// Known credential formats. Each label names the format only; no part of the value is kept. Extra conditions run in
// the replace callback instead of an unbounded lookahead, so a long run of near-matches stays linear.
const TOKEN_PATTERNS: Array<[string, RegExp, ((match: string) => boolean)?]> = [
  ['private-key', /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----(?:[A-Za-z0-9+/=]|\\[nr]|\s){0,20000}(?:-----END [A-Z ]{0,40}PRIVATE KEY-----)?/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,256}/g],
  // A digit is required so names such as sk-learn-something-long do not match.
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{20,256}/g, (match) => /\d/.test(match)],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}/g],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,255}/g],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,255}/g],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['huggingface-token', /\bhf_[A-Za-z0-9]{30,255}/g],
  ['stripe-key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,255}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,4096}\.eyJ[A-Za-z0-9_-]{10,4096}\.[A-Za-z0-9_-]{10,4096}/g],
];
// "Bearer <token>" / "Basic <token>": the scheme stays, the credential goes. A digit is required so prose does not match.
const AUTH_SCHEME = /\b(Bearer|Basic)(\s{1,8})([A-Za-z0-9._~+/-]{16,1024}={0,2})/gi;
// scheme://user:password@host: the password goes.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]{0,20}:\/\/[^\/\s:@"'\\<>]{1,128}:)[^\/\s@"'\\<>]{1,256}@/gi;

// NAME=value, NAME: value, "name": "value" (also JSON-escaped) where NAME names a credential.
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]{0,48}?(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|credentials?|authorization|auth[_-]?token|private[_-]?key|access[_-]?key|signing[_-]?key|encryption[_-]?key|_key)[A-Za-z0-9_]{0,32}`;
const ASSIGNMENT = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(` + SECRET_NAME + String.raw`)((?:\\?["'])?)(\s{0,4}[:=]\s{0,4})(?:(\\?"|')([^"'\\\r\n]{1,256})\4|([^\s"'\\,;{}()<>\[\]` + '`' + String.raw`]{1,256}))`,
  'gi',
);
const SECRET_KEY_NAME = new RegExp('^' + SECRET_NAME + '$', 'i');
// A name that is a credential by itself. Anything else matched only through `_key` (sort_key, cache_key, primary_key)
// counts only as an upper-case environment variable such as STRIPE_KEY.
const STRONG_NAME = /api[_-]?key|apikey|secret|token|passw(?:or)?d|pwd|credential|authorization|auth[_-]?token|private[_-]?key|access[_-]?key|signing[_-]?key|encryption[_-]?key/i;
const PASSWORD_NAME = /passw(?:or)?d|pwd/i;
const PLACEHOLDER = /^(?:x{3,}|\*{3,}|•|your|\$|%|process\.|os\.environ|env\.|example|changeme|placeholder|redacted|null|undefined|none|true|false|string|number|required|optional|\.\.\.)/i;
const IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/;

function credentialName(name: string): boolean {
  return STRONG_NAME.test(name) || /^[A-Z0-9_]+_KEY$/.test(name);
}

/** A relative path such as config/tenant1.json or uploads/2026/a.png (not a base64 value that happens to hold a slash). */
function looksLikePath(value: string): boolean {
  return /^[\w.-]+(?:\/[\w.-]+)+$/.test(value) && (/\.[A-Za-z0-9]{1,6}$/.test(value) || !/[A-Z]/.test(value));
}

/** True when a value assigned to a credential-named variable looks like a real credential, not code or a placeholder. */
function credentialLike(name: string, value: string): boolean {
  if (PLACEHOLDER.test(value)) return false;
  if (/^(?:\/|\.{1,2}[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(value) || value.includes('://') || looksLikePath(value)) return false;
  const identifier = IDENTIFIER.test(value);
  // An identifier or member access without digits (secret = String, apiKey: env.apiKey) is code, not a value.
  if (identifier && !/\d/.test(value)) return false;
  if (PASSWORD_NAME.test(name)) return value.length >= 6;
  // A typed value (sha256:abc..., env:NAME) and anything with spaces is not a key; only passwords contain spaces.
  if (/^[A-Za-z][A-Za-z0-9+.-]{1,15}:/.test(value) || /\s/.test(value)) return false;
  // Short identifiers with a digit are code too (value123, created_at2, user_id_2).
  if (identifier && value.length < 16) return false;
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

export interface RedactOptions {
  /**
   * Also redact credential-named assignments (DB_PASSWORD=...). On by default for captured tool text; off for memory
   * text, where a false positive would destroy what someone deliberately saved.
   */
  assignments?: boolean;
}

/** Remove credentials from free text. Idempotent: markers never match again. */
export function redactSecrets(text: string, known: string[] = knownSecrets(), options: RedactOptions = {}): string {
  let out = String(text ?? '');
  if (!out) return out;
  for (const secret of known) if (out.includes(secret)) out = out.split(secret).join('<redacted:agentmem-credential>');
  for (const [label, pattern, accept] of TOKEN_PATTERNS) {
    out = out.replace(pattern, (match: string) => (!accept || accept(match) ? `<redacted:${label}>` : match));
  }
  out = out.replace(AUTH_SCHEME, (full: string, scheme: string, space: string, token: string) =>
    (/\d/.test(token) ? `${scheme}${space}<redacted:token>` : full));
  out = out.replace(URL_PASSWORD, '$1<redacted:password>@');
  if (options.assignments === false) return out;
  return out.replace(ASSIGNMENT, (full: string, name: string, nameQuote: string, sep: string, open: string | undefined,
    quoted: string | undefined, bare: string | undefined) => {
    const value = quoted ?? bare ?? '';
    if (!credentialName(name) || !credentialLike(name, value)) return full;
    if (open !== undefined) return `${name}${nameQuote}${sep}${open}${REDACTED}${open}`;
    // A bare value after a quoted key is a JSON/dict literal ("password":123456): quote the marker so it still parses.
    return nameQuote ? `${name}${nameQuote}${sep}${nameQuote}${REDACTED}${nameQuote}` : `${name}${sep}${REDACTED}`;
  });
}

type MemoryText = { title?: string; narrative?: string; facts?: string[]; concepts?: string[] };

/**
 * Redact the text fields of a memory with the high-precision rules only (no assignment heuristic). Callers apply it
 * before hashing or embedding, so the stored text, its content hash and its embedding all describe the same text.
 */
export function redactObservation<T extends MemoryText>(obs: T, known: string[] = knownSecrets()): T {
  const clean = (value: string) => redactSecrets(value, known, { assignments: false });
  return {
    ...obs,
    ...(typeof obs.title === 'string' ? { title: clean(obs.title) } : {}),
    ...(typeof obs.narrative === 'string' ? { narrative: clean(obs.narrative) } : {}),
    ...(Array.isArray(obs.facts) ? { facts: obs.facts.map((f) => clean(String(f ?? ''))) } : {}),
    ...(Array.isArray(obs.concepts) ? { concepts: obs.concepts.map((c) => clean(String(c ?? ''))) } : {}),
  };
}

export function isSecretFilePath(value: string): boolean {
  const text = String(value ?? '').trim();
  if (!text || text.length > 1024) return false;
  return SECRET_FILE_NAME.test(text) || (SECRET_FILE_EXT.test(text) && !text.includes('$'));
}

/** True when some segment of a shell command starts with a reader and names a secret file (cat .env | grep X). */
function readsSecretFile(command: string): boolean {
  return command.split(/[\r\n;&|]+/).some((segment) => {
    const tokens = segment.split(/[\s"'`<>()=,]+/).filter(Boolean);
    // Skip `sudo` and PowerShell assignment targets ($x = Get-Content .env). Advance an index: shift() is O(n) per call.
    let start = 0;
    while (start < tokens.length && /^(?:sudo|\$.*)$/.test(tokens[start])) start++;
    return tokens.length - start > 1 && READ_VERB.test(tokens[start]) && tokens.slice(start + 1).some(isSecretFilePath);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Redact a parsed JSON value leaf by leaf; a credential-named key loses a credential-like value of any type. */
function redactValue(value: unknown, known: string[], key?: string): unknown {
  const named = key !== undefined && key.length <= 120 && SECRET_KEY_NAME.test(key) && credentialName(key);
  if (typeof value === 'string') return named && credentialLike(key!, value) ? REDACTED : redactSecrets(value, known);
  if (typeof value === 'number' || typeof value === 'boolean') return named && credentialLike(key!, String(value)) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, known));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, known, k)]));
  return value;
}

/** JSON text redacted structurally (keeps the original text when nothing changed); other text redacted as text. */
function redactText(text: string, known: string[], parsed: unknown = parseJson(text)): string {
  if (parsed === undefined) return redactSecrets(text, known);
  const next = JSON.stringify(redactValue(parsed, known));
  return next === JSON.stringify(parsed) ? text : next;
}

/**
 * Redact one captured tool call. A call that reads or writes a secret file (a path field, a shell command that reads
 * one, or a patch that edits one) keeps the path but loses the file content; everything else is redacted as JSON
 * (when it parses) or as text.
 */
export function redactToolEvent(input: string, output: string, known: string[] = knownSecrets()): { input: string; output: string } {
  const inputText = String(input ?? '');
  const outputText = String(output ?? '');
  const parsed = parseJson(inputText);
  let omitOutput = false;
  let nextInput: string;
  if (isPlainObject(parsed)) {
    const pathHit = Object.entries(parsed).some(([key, value]) => PATH_FIELDS.has(key) && typeof value === 'string' && isSecretFilePath(value));
    const kept: Record<string, unknown> = { ...parsed };
    for (const [key, value] of Object.entries(parsed)) {
      if (pathHit && !(PATH_FIELDS.has(key) || KEEP_FIELDS.has(key) || typeof value === 'number' || typeof value === 'boolean')) {
        kept[key] = SECRET_FILE_OMITTED; continue;
      }
      const patched = redactPatchValue(value);
      if (patched !== null) { kept[key] = patched; continue; }
      if (COMMAND_FIELDS.has(key) && commandStrings(value).some(readsSecretFile)) omitOutput = true;
    }
    omitOutput ||= pathHit;
    const next = JSON.stringify(redactValue(kept, known));
    nextInput = next === JSON.stringify(parsed) ? inputText : next;
  } else {
    // A raw patch or command, possibly JSON-encoded as a single string.
    const text = typeof parsed === 'string' ? parsed : parsed === undefined ? inputText : null;
    const patched = text === null ? null : redactPatch(text);
    if (patched !== null) {
      const clean = redactSecrets(patched, known);
      nextInput = typeof parsed === 'string' ? JSON.stringify(clean) : clean;
    } else {
      omitOutput = text !== null && readsSecretFile(text);
      nextInput = redactText(inputText, known, parsed);
    }
  }
  const nextOutput = omitOutput && outputText.trim() ? SECRET_FILE_OMITTED : redactText(outputText, known);
  return { input: nextInput, output: nextOutput };
}
