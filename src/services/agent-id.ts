export function normalizeAgentId(agentId: string): string {
  const raw = String(agentId || '').trim();
  if (!raw) return raw;

  const lower = raw.toLowerCase().replace(/\\/g, '/');
  const basename = lower.split('/').pop() || lower;

  if (
    lower.includes('antigravity') ||
    basename === 'agy.exe' ||
    basename === 'agy' ||
    /(^|[-_\s])antigravity([-_\s]?cli)?$/i.test(raw)
  ) {
    return 'antigravity';
  }

  return raw;
}
