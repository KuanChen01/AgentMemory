import { ProjectContextView, isLowSignalTitle, normalizeTitleKey, renderProjectContextView } from './context-view';
import { SearchResult } from './db';

export interface ProjectContextMetrics {
  duplicateTitleCount: number;
  lowSignalCount: number;
  payloadBytes: number;
  summaryCount: number;
}

export interface AdminProjectContextPayload {
  metrics: ProjectContextMetrics;
  rendered: string;
  view: ProjectContextView;
}

export function buildAdminProjectContextPayload(
  view: ProjectContextView
): AdminProjectContextPayload {
  return {
    view,
    rendered: renderProjectContextView(view) || 'No structured context recorded yet.',
    metrics: getProjectContextMetrics(view),
  };
}

export function getProjectContextMetrics(view: ProjectContextView): ProjectContextMetrics {
  const seenTitles = new Set<string>();
  let duplicateTitleCount = 0;
  let lowSignalCount = 0;

  for (const block of view.summary_blocks) {
    const key = normalizeTitleKey(block.title);
    if (key && seenTitles.has(key)) {
      duplicateTitleCount += 1;
    }
    if (key) {
      seenTitles.add(key);
    }
    if (isLowSignalTitle(block.title)) {
      lowSignalCount += 1;
    }
  }

  return {
    payloadBytes: Buffer.byteLength(JSON.stringify(view), 'utf8'),
    summaryCount: view.summary_blocks.length,
    lowSignalCount,
    duplicateTitleCount,
  };
}

export function toAdminSearchResult(result: SearchResult) {
  return {
    id: result.id,
    title: result.title,
    narrative: result.narrative,
    facts: result.facts,
    concepts: result.concepts,
    files_modified: result.files_modified,
    agent_id: result.agent_id,
    created_at: result.created_at,
    fts_score: result.fts_score,
    vector_score: result.vector_score,
    hybrid_score: result.hybrid_score,
    low_signal_title: isLowSignalTitle(result.title),
  };
}
