/**
 * Original event time accepted by the import endpoints (POST /import/tools, POST /import/tasks/boundary).
 * Live capture never uses this: /tools and /tasks/boundary always stamp server time.
 */
export const IMPORT_MIN_MS = Date.UTC(2020, 0, 1);
export const IMPORT_FUTURE_SKEW_MS = 5 * 60_000;

// ISO 8601 date-time with an explicit zone (Z or ±hh:mm / ±hhmm). A zone-less local time is ambiguous and rejected.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

export type ImportTimeResult = { ok: true; ms: number } | { ok: false; error: string };

export function parseImportTime(value: unknown, nowMs = Date.now()): ImportTimeResult {
  let ms: number;
  if (typeof value === 'number') ms = value;
  else if (typeof value === 'string' && /^\d{10,16}$/.test(value.trim())) ms = Number(value.trim());
  else if (typeof value === 'string' && ISO_WITH_ZONE.test(value.trim())) {
    const text = value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    // Date.parse rolls impossible dates over (2026-02-30 -> 2026-03-02); reject them instead.
    const [y, mo, d] = text.slice(0, 10).split('-').map(Number);
    const [hh, mi, ss] = text.slice(11, 19).split(':').map(n => Number(n || 0));
    const calendar = new Date(Date.UTC(y, mo - 1, d));
    if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== mo - 1 || calendar.getUTCDate() !== d
      || hh > 23 || mi > 59 || ss > 59) return { ok: false, error: 'Invalid timestamp: not a real calendar date/time' };
    ms = Date.parse(text);
  } else if (value === undefined || value === null || value === '') {
    return { ok: false, error: 'Missing timestamp (ISO 8601 with a time zone, or epoch milliseconds)' };
  } else {
    return { ok: false, error: 'Invalid timestamp: use ISO 8601 with a time zone (e.g. 2026-10-24T23:58:00+08:00) or epoch milliseconds' };
  }
  if (!Number.isFinite(ms)) return { ok: false, error: 'Invalid timestamp: not a finite time' };
  ms = Math.trunc(ms);
  if (ms < IMPORT_MIN_MS) return { ok: false, error: 'Invalid timestamp: before 2020-01-01 (seconds instead of milliseconds?)' };
  if (ms > nowMs + IMPORT_FUTURE_SKEW_MS) return { ok: false, error: 'Invalid timestamp: in the future' };
  return { ok: true, ms };
}
