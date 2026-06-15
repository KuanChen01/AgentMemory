export function normalizeComparableTimestamp(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  const collapsed = normalized.includes('T')
    ? normalized
    : normalized.replace(' ', 'T');
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(collapsed)
    ? collapsed
    : `${collapsed}Z`;
}

export function compareTimestamps(left: string, right: string): number {
  const leftMs = parseComparableTimestamp(left);
  const rightMs = parseComparableTimestamp(right);
  if (leftMs !== null && rightMs !== null) {
    return leftMs === rightMs ? 0 : leftMs < rightMs ? -1 : 1;
  }

  const leftNormalized = normalizeComparableTimestamp(left);
  const rightNormalized = normalizeComparableTimestamp(right);
  return leftNormalized.localeCompare(rightNormalized);
}

export function isTimestampOnOrBefore(value: string, cutoff: string): boolean {
  if (!value || !cutoff) {
    return false;
  }
  return compareTimestamps(value, cutoff) <= 0;
}

export function timestampsEqual(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  return compareTimestamps(left, right) === 0;
}

function parseComparableTimestamp(value: string): number | null {
  const normalized = normalizeComparableTimestamp(value);
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
