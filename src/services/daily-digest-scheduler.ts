import { DatabaseManager } from './db';
import {
  RunDailyMemoryDigestInput,
  RunDailyMemoryDigestResult,
  formatLocalDate,
  runDailyMemoryDigest,
} from './daily-digest';

export interface DailyDigestTarget {
  localDate: string;
  projectPath: string;
}

export interface DailyDigestCatchUpOptions {
  dates?: string[];
  lookbackDays?: number;
  now?: Date;
  timeZone?: string;
}

export interface DailyDigestSchedulerOptions extends DailyDigestCatchUpOptions {
  scheduleHour?: number;
  scheduleMinute?: number;
}

export interface RunDailyDigestCatchUpOptions extends DailyDigestCatchUpOptions {
  dbManager: DatabaseManager;
  runDigest?: (
    input: Pick<RunDailyMemoryDigestInput, 'dbManager' | 'localDate' | 'projectPath' | 'timeZone'>
  ) => Promise<RunDailyMemoryDigestResult>;
}

export interface RunDailyDigestCatchUpResult {
  failed: number;
  failures: Array<{ error: string; target: DailyDigestTarget }>;
  ran: number;
  targets: DailyDigestTarget[];
}

export interface DailyDigestSchedulerHandle {
  runNow: () => Promise<RunDailyDigestCatchUpResult>;
  stop: () => void;
}

export const DEFAULT_DIGEST_LOOKBACK_DAYS = 2;
export const DEFAULT_DIGEST_SCHEDULE_HOUR = 23;
export const DEFAULT_DIGEST_SCHEDULE_MINUTE = 50;
export const DEFAULT_DIGEST_TIME_ZONE = 'Asia/Shanghai';

export async function findDailyDigestCatchUpTargets(
  dbManager: DatabaseManager,
  options: DailyDigestCatchUpOptions = {}
): Promise<DailyDigestTarget[]> {
  const timeZone = options.timeZone || process.env.AGENTMEM_DIGEST_TIME_ZONE || DEFAULT_DIGEST_TIME_ZONE;
  const dates = options.dates || getRecentLocalDates(options.now || new Date(), options.lookbackDays || DEFAULT_DIGEST_LOOKBACK_DAYS, timeZone);
  const projects = await dbManager.listDistinctProjects();
  const targets: DailyDigestTarget[] = [];

  for (const projectPath of projects) {
    const timeline = await dbManager.getTimeline(projectPath);
    const observedDates = new Set(
      timeline
        .filter((observation) => observation.created_at)
        .map((observation) => formatLocalDate(observation.created_at, timeZone))
    );

    for (const localDate of dates) {
      if (!observedDates.has(localDate)) {
        continue;
      }

      const existing = await dbManager.getDailyMemoryDigest({
        projectPath,
        localDate,
      });
      if (existing?.status === 'success') {
        continue;
      }

      targets.push({
        localDate,
        projectPath,
      });
    }
  }

  return targets;
}

export async function runDailyDigestCatchUp(
  options: RunDailyDigestCatchUpOptions
): Promise<RunDailyDigestCatchUpResult> {
  const runDigest = options.runDigest || runDailyMemoryDigest;
  const targets = await findDailyDigestCatchUpTargets(options.dbManager, options);
  const failures: RunDailyDigestCatchUpResult['failures'] = [];
  let ran = 0;

  for (const target of targets) {
    try {
      await runDigest({
        dbManager: options.dbManager,
        localDate: target.localDate,
        projectPath: target.projectPath,
        timeZone: options.timeZone,
      });
      ran += 1;
    } catch (error: any) {
      failures.push({
        error: error.message,
        target,
      });
    }
  }

  return {
    failed: failures.length,
    failures,
    ran,
    targets,
  };
}

export function startDailyDigestScheduler(
  dbManager: DatabaseManager,
  options: DailyDigestSchedulerOptions = {}
): DailyDigestSchedulerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const scheduleHour = normalizeSchedulePart(options.scheduleHour, DEFAULT_DIGEST_SCHEDULE_HOUR, 0, 23);
  const scheduleMinute = normalizeSchedulePart(options.scheduleMinute, DEFAULT_DIGEST_SCHEDULE_MINUTE, 0, 59);
  const timeZone = options.timeZone || process.env.AGENTMEM_DIGEST_TIME_ZONE || DEFAULT_DIGEST_TIME_ZONE;

  const runNow = async () => {
    return runDailyDigestCatchUp({
      ...options,
      dbManager,
      timeZone,
    });
  };

  const scheduleNext = () => {
    if (stopped) return;
    const delay = millisecondsUntilNextLocalDigestRun(new Date(), scheduleHour, scheduleMinute, timeZone);
    timer = setTimeout(async () => {
      try {
        await runNow();
      } catch (error: any) {
        console.warn(`[DailyDigest] Scheduled run failed: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, delay);
    timer.unref?.();
  };

  runNow().catch((error: any) => {
    console.warn(`[DailyDigest] Startup catch-up failed: ${error.message}`);
  });
  scheduleNext();

  return {
    runNow,
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}

export function millisecondsUntilNextLocalDigestRun(
  now: Date,
  hour: number = DEFAULT_DIGEST_SCHEDULE_HOUR,
  minute: number = DEFAULT_DIGEST_SCHEDULE_MINUTE,
  timeZone: string = DEFAULT_DIGEST_TIME_ZONE
): number {
  const nowParts = getTimeZoneParts(now, timeZone);
  let target = zonedLocalTimeToUtc(
    nowParts.year,
    nowParts.month,
    nowParts.day,
    hour,
    minute,
    timeZone
  );

  if (target.getTime() <= now.getTime()) {
    const nextLocalDay = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
    target = zonedLocalTimeToUtc(
      nextLocalDay.getUTCFullYear(),
      nextLocalDay.getUTCMonth() + 1,
      nextLocalDay.getUTCDate(),
      hour,
      minute,
      timeZone
    );
  }
  return target.getTime() - now.getTime();
}

function getRecentLocalDates(now: Date, lookbackDays: number, timeZone: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < lookbackDays; offset++) {
    dates.push(formatLocalDate(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000), timeZone));
  }
  return dates;
}

function normalizeSchedulePart(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(lookup.hour === '24' ? '0' : lookup.hour);

  return {
    day: Number(lookup.day),
    hour,
    minute: Number(lookup.minute),
    month: Number(lookup.month),
    second: Number(lookup.second),
    year: Number(lookup.year),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function zonedLocalTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);
  utc = localAsUtc - getTimeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}
