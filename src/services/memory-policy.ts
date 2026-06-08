import { Observation } from './db';
import { isLowSignalTitle, normalizeTitleKey } from './context-view';

export type DigestExclusionReason =
  | 'duplicate_title'
  | 'limit_exceeded'
  | 'low_signal_content'
  | 'low_signal_title';

export interface DigestObservationExclusion {
  id: string;
  reason: DigestExclusionReason;
  title: string;
}

export interface DigestObservationSelection {
  excluded: DigestObservationExclusion[];
  lowSignalPatterns: string[];
  selected: Observation[];
}

export interface DigestObservationSelectionOptions {
  limit?: number;
}

const DEFAULT_DIGEST_OBSERVATION_LIMIT = 40;

export function selectDigestObservations(
  observations: Observation[],
  options: DigestObservationSelectionOptions = {}
): DigestObservationSelection {
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(options.limit || DEFAULT_DIGEST_OBSERVATION_LIMIT))));
  const excluded: DigestObservationExclusion[] = [];
  const lowSignalPatterns: string[] = [];
  const selected: Observation[] = [];
  const seenTitles = new Set<string>();

  for (const observation of observations) {
    const titleKey = normalizeTitleKey(observation.title);

    if (titleKey && seenTitles.has(titleKey)) {
      excluded.push(toExclusion(observation, 'duplicate_title'));
      continue;
    }

    if (isLowSignalTitle(observation.title)) {
      excluded.push(toExclusion(observation, 'low_signal_title'));
      addLowSignalPattern(lowSignalPatterns, observation.title);
      if (titleKey) {
        seenTitles.add(titleKey);
      }
      continue;
    }

    if (!hasDigestSignal(observation)) {
      excluded.push(toExclusion(observation, 'low_signal_content'));
      addLowSignalPattern(lowSignalPatterns, observation.title);
      if (titleKey) {
        seenTitles.add(titleKey);
      }
      continue;
    }

    if (selected.length >= limit) {
      excluded.push(toExclusion(observation, 'limit_exceeded'));
      continue;
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }
    selected.push(observation);
  }

  return {
    excluded,
    lowSignalPatterns,
    selected,
  };
}

function hasDigestSignal(observation: Observation): boolean {
  return (
    observation.files_modified.length > 0 ||
    observation.facts.length > 0 ||
    observation.narrative.trim().length > 40 ||
    /\b(fixed|implemented|released|validated|decided|designed|planned)\b/i.test(observation.title)
  );
}

function toExclusion(
  observation: Observation,
  reason: DigestExclusionReason
): DigestObservationExclusion {
  return {
    id: observation.id,
    reason,
    title: observation.title,
  };
}

function addLowSignalPattern(patterns: string[], title: string) {
  if (!patterns.includes(title)) {
    patterns.push(title);
  }
}
