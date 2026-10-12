/** Value is decided by the existing synthesis call, not title/keyword guesses. */
export type WorkMemoryKind = 'outcome' | 'context';

export function interpretWorkMemory(raw: any, success: boolean) {
  const requested = raw?.record_kind;
  // Failures and incomplete classifications remain recoverable. A missing
  // field from an older provider is uncertainty, not permission to discard.
  const skip = requested === 'skip' && success;
  const kind: WorkMemoryKind = requested === 'outcome' || !success ? 'outcome' : 'context';
  const array = (key: string): string[] => Array.isArray(raw?.[key])
    ? raw[key].filter((v: unknown): v is string => typeof v === 'string' && !!v.trim()) : [];
  return { skip, kind, title: String(raw?.title || '').trim(),
    narrative: String(raw?.narrative || '').trim(), facts: array('facts'),
    concepts: array('concepts'), files_read: array('files_read'), files_modified: array('files_modified') };
}

export const WORK_MEMORY_PROMPT = `Decide whether this tool event adds useful working memory.
Return record_kind: outcome, context, or skip in the same JSON response.
outcome: an evidenced result, meaningful finding (including read-only findings),
decision, project change, diagnostic result or useful failure. Distinguish an
attempt from a completed/verified result; tool success alone proves neither.
context: a current goal, important constraint, unresolved question or information
needed to resume unfinished work. When classification or source content is
incomplete, use context and explain uncertainty, rather than silently skipping.
skip: only routine inspection, repeated unchanged status, searching without a
useful finding, copying existing documents, or transport/bookkeeping with no
useful new result or recovery information. Merely extracting facts from a file
does not turn reading it into a new result. Do not decide by title prefixes,
modified-file lists or keyword presence/absence.
For a daily_review session, reading memories/notes and updating its completion
ledger are bookkeeping. Real review failures and additional technical results
remain useful. Do not infer that an entire reviewer session is noise.`;
