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

export function resolveAgentId(
  requestedAgentId?: unknown,
  configuredAgentId: unknown = process.env.AGENTMEM_AGENT_ID
): string {
  const requested = String(requestedAgentId || '').trim();
  if (requested) {
    return normalizeAgentId(requested);
  }

  const configured = String(configuredAgentId || '').trim();
  if (configured) {
    return normalizeAgentId(configured);
  }

  return 'mcp-client';
}
