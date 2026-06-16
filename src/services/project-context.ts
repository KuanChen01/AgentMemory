import { DatabaseManager } from './db';
import { createProjectContextView, ProjectContextView } from './context-view';
import { enrichProceduralSkillForOps } from './procedural-memory';
import { isTimestampOnOrBefore } from './timestamps';

export const DEFAULT_PROJECT_CONTEXT_LIMIT = 10;
export const MAX_PROJECT_CONTEXT_LIMIT = 50;

export interface LoadProjectContextViewOptions {
  asOf?: string;
  includeProceduralSkills?: boolean;
  mode?: string;
  proceduralSkillLimit?: number;
  queryText?: string | null;
  windowCharBudget?: number;
}

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
  limit: number,
  options: LoadProjectContextViewOptions = {}
): Promise<ProjectContextView> {
  const normalizedLimit = parseProjectContextLimit(limit);
  const asOf = options.asOf;
  const [stateFacts, timeline, dailyDigests, proceduralSkillRows] = await Promise.all([
    dbManager.getProjectStateFacts(projectPath, asOf),
    dbManager.getTimeline(projectPath),
    dbManager.listDailyMemoryDigests({
      projectPath,
      status: 'success',
      limit: Math.min(normalizedLimit, 7),
      generatedBefore: asOf,
    }),
    options.includeProceduralSkills === false
      ? Promise.resolve([])
      : dbManager.listProceduralSkills({
          projectPath,
          statuses: ['enabled', 'draft'],
          limit: Math.max(1, Math.min(options.proceduralSkillLimit || 5, 10)),
          asOf,
        }),
  ]);
  const proceduralSkills = await Promise.all(
    proceduralSkillRows.map((skill) => enrichProceduralSkillForOps(dbManager, skill, { asOf }))
  );

  const filteredTimeline = asOf
    ? timeline.filter((observation) => {
        if (!observation.created_at) {
          return false;
        }
        return isTimestampOnOrBefore(observation.created_at, asOf);
      })
    : timeline;

  return createProjectContextView(
    projectPath,
    stateFacts,
    filteredTimeline,
    normalizedLimit,
    dailyDigests,
    {
      asOf,
      mode: options.mode,
      proceduralSkills,
      queryText: options.queryText,
      windowCharBudget: options.windowCharBudget,
    }
  );
}
