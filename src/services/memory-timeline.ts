export interface TimelineEntry {
  created_at?: string;
  id: string;
  agent_id: string;
  title: string;
}

const PAGE_SIZE = 40;

function pageNumber(value: unknown, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function renderMemoryTimeline(
  timeline: TimelineEntry[],
  requestedLimit?: unknown,
  requestedOffset?: unknown
): string {
  if (!timeline.length) return 'No memory timeline recorded yet for this project.';

  const limit = Math.min(PAGE_SIZE, pageNumber(requestedLimit, PAGE_SIZE, 1));
  const offset = pageNumber(requestedOffset, 0, 0);
  const page = timeline.slice(offset, offset + limit);
  if (!page.length) return `No timeline entries at offset ${offset}; this project has ${timeline.length} entries.`;

  const lines = page.map((entry) => {
    const title = String(entry.title || '').slice(0, 160);
    return `- [${entry.created_at || 'unknown'}] [ID: ${entry.id}] [Agent: ${entry.agent_id}] ${title}`;
  });
  const nextOffset = offset + page.length;
  const nextPage = nextOffset < timeline.length
    ? `\nUse memory_timeline with offset=${nextOffset} to see the next page.`
    : '';
  return `Recent timeline (${offset + 1}-${nextOffset} of ${timeline.length} entries, newest first):\n\n${lines.join('\n')}\n\nUse get_memory_details to view detailed narratives.${nextPage}`;
}
