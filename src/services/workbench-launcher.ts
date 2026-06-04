export interface AdminWorkbenchUrls {
  adminUrl: string;
  overviewUrl: string;
}

export interface OverviewProbe {
  ok: boolean;
  status: number;
  payload: unknown;
  error?: string;
}

export interface WaitForWorkbenchReadyOptions {
  attempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export function buildAdminWorkbenchUrls(port: number | string = 38888): AdminWorkbenchUrls {
  const normalizedPort = Number(port) || 38888;
  const baseUrl = `http://127.0.0.1:${normalizedPort}`;
  return {
    adminUrl: `${baseUrl}/admin`,
    overviewUrl: `${baseUrl}/admin/api/overview`,
  };
}

export function buildBrowserOpenCommand(url: string): { command: string; args: string[] } {
  return {
    command: 'cmd',
    args: ['/c', 'start', '', url],
  };
}

export function isReusableOverviewPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const stats = candidate.stats as Record<string, unknown> | undefined;
  const policy = candidate.policy as Record<string, unknown> | undefined;

  return (
    !!stats &&
    !!policy &&
    typeof stats.observations === 'number' &&
    typeof stats.sessions === 'number' &&
    typeof stats.projects === 'number' &&
    typeof stats.agents === 'number' &&
    typeof stats.currentStateFacts === 'number' &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.agents) &&
    typeof policy.readEnabled === 'boolean' &&
    typeof policy.writeEnabled === 'boolean'
  );
}

export function classifyOverviewProbe(
  probe: Pick<OverviewProbe, 'ok' | 'status' | 'payload'>
): 'reuse-existing' | 'start-worker' {
  return probe.ok && probe.status === 200 && isReusableOverviewPayload(probe.payload)
    ? 'reuse-existing'
    : 'start-worker';
}

export async function probeWorkbenchOverview(
  overviewUrl: string,
  timeoutMs: number = 1500
): Promise<OverviewProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(overviewUrl, {
      signal: controller.signal,
    });
    const rawText = await response.text();
    let payload: unknown = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (_error) {
      payload = rawText;
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: error?.message || 'Unknown error',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForWorkbenchReady(
  overviewUrl: string,
  options: WaitForWorkbenchReadyOptions = {}
): Promise<{ ready: boolean; attempts: number; probe: OverviewProbe }> {
  const attempts = options.attempts ?? 40;
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 1500;

  let lastProbe: OverviewProbe = {
    ok: false,
    status: 0,
    payload: null,
    error: 'No probe executed',
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastProbe = await probeWorkbenchOverview(overviewUrl, timeoutMs);
    if (classifyOverviewProbe(lastProbe) === 'reuse-existing') {
      return {
        ready: true,
        attempts: attempt,
        probe: lastProbe,
      };
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    ready: false,
    attempts,
    probe: lastProbe,
  };
}
