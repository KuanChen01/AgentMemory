// Redaction shared by admin read APIs: paths, emails and credential-shaped values in free text.
// Standalone so db.ts can use it without importing a query module.

/**
 * Strip absolute paths, emails, and credential-shaped tokens from a task error.
 * Empty after cleaning becomes null. The result is at most 200 characters.
 */
export function sanitizeLastError(value: unknown): string | null {
  const text = sanitizeText(value);
  if (!text) return null;
  return text.length > 200 ? text.slice(0, 200) : text;
}

const QUOTED_PATH_START = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/|\/)/;
const QUOTED_SPANS: Array<[string, RegExp]> = [
  ['"', /"([^"]*)"/g],
  ['`', /`([^`]*)`/g],
  ["'", /(?<!\w)'((?:[^']|'(?=\w))*)'(?!\w)/g],
];

const SENSITIVE_NAME = String.raw`(?:api[_-]?key|apikey|client[_-]?secret|secret|password|passwd|pwd|access[_-]?token|refresh[_-]?token|token|authorization|auth|key|credentials?|private[_-]?key)`;
const SENSITIVE_COLON_PAIR = new RegExp(
  String.raw`(["']?)\b(` + SENSITIVE_NAME + String.raw`)\1\s*:\s*(?:"(?:[^"\\]|\\.)*"?|'[^']*'?|[^\s,;}&]+)`,
  'gi',
);
/** Fact keys whose values are credentials whatever their shape. */
export const SENSITIVE_FACT_KEY = /(?:^|[_.\-\s])(?:api[_-]?key|apikey|client[_-]?secret|secret|password|passwd|pwd|access[_-]?token|refresh[_-]?token|token|credentials?|private[_-]?key)$/i;
/** True when a fact key (snake, dotted, kebab or camelCase) names a credential in its last segment. */
export function isSensitiveFactKey(factKey: unknown): boolean {
  return typeof factKey === 'string' && SENSITIVE_FACT_KEY.test(factKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2'));
}

/** Path/email/token redaction shared by last_error, title and summary. */
export function sanitizeText(value: unknown): string | null {
  if (value == null) return null;
  let text = String(value);
  if (text.trim() === '') return null;
  text = text.replace(/\b(?:bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '<redacted>');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '<redacted>');
  text = text.replace(/\b(?:api[_-]?key|secret|password|key|token)\s*=\s*[^\s&;,]+/gi, '<redacted>');
  // JSON / YAML style "password": "value" (also unterminated after a pre-clip).
  text = text.replace(SENSITIVE_COLON_PAIR, (_full: string, quote: string, name: string) => `${quote}${name}${quote}: <redacted>`);
  // A quoted absolute path may contain spaces ("C:\Users\Jane Roe\private.txt", '\\server\share\...', `/work/a b`).
  // Take the whole quoted span before the unquoted rules, which stop at the first space.
  // Each quote kind is matched on its own so a path may contain the other kinds ("C:\O'Brien Smith\x.txt").
  // Double quotes and backticks go first; a single quote only opens/closes at a word boundary, and an
  // apostrophe followed by a letter (O'Brien, don't) stays inside the span.
  for (const [quote, pattern] of QUOTED_SPANS) {
    text = text.replace(pattern, (full: string, inner: string) => (QUOTED_PATH_START.test(inner) ? `${quote}<path>${quote}` : full));
  }
  text = text.replace(/(?:\\\\|\/\/)[^\s\\/]+[\\/][^\s]*/g, '<path>');
  text = text.replace(/[A-Za-z]:[\\/][^\s]*/g, '<path>');
  text = text.replace(/(^|[\s"'`(=:<>])(\/[^\s"'`)<>]+)/g, '$1<path>');
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
  text = text.replace(/\b[a-fA-F0-9]{32,}\b/g, '<redacted>');
  text = text.replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '<redacted>');
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}
