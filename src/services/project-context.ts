import { DatabaseManager } from './db';
import { createProjectContextView, ProjectContextView } from './context-view';

export const DEFAULT_PROJECT_CONTEXT_LIMIT = 10;
export const MAX_PROJECT_CONTEXT_LIMIT = 50;

export function parseProjectContextLimit(
  rawLimit: string | number | undefined,
  fallback: number = DEFAULT_PROJECT_CONTEXT_LIMIT
): number {
  const parsed =
    typeof rawLimit === 'number'
      ? rawLimit
      : parseInt(rawLimit || String(fallback), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, MAX_PROJECT_CONTEXT_LIMIT);
}

export async function loadProjectContextView(
  dbManager: DatabaseManager,
  projectPath: string,
  limit: number
): Promise<ProjectContextView> {
  const normalizedLimit = parseProjectContextLimit(limit);
  const [stateFacts, timeline, dailyDigests] = await Promise.all([
    dbManager.getProjectStateFacts(projectPath),
    dbManager.getTimeline(projectPath),
    dbManager.listDailyMemoryDigests({
      projectPath,
      status: 'success',
      limit: Math.min(normalizedLimit, 7),
    }),
  ]);

  return createProjectContextView(projectPath, stateFacts, timeline, normalizedLimit, dailyDigests);
}
