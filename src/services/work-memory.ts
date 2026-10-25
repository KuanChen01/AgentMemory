/** Value is decided by the existing synthesis call, not title/keyword guesses. */
export type WorkMemoryKind = 'outcome' | 'context';

export function interpretWorkMemory(raw: any, success: boolean) {
  const requested = raw?.record_kind;
  // Failures and incomplete classifications remain recoverable. A missing
  // field from an older provider is uncertainty, not permission to discard.
  const skip = requested === 'skip' && success;
  const kind: WorkMemoryKind = requested === 'outcome' || !success ? 'outcome' : 'context';
  const missing: string[] = [];
  const array = (key: string): string[] => {
    if (Array.isArray(raw?.[key])) return raw[key].filter((v: unknown): v is string => typeof v === 'string' && !!v.trim());
    missing.push(key);
    return [];
  };
  const result = { skip, kind, title: String(raw?.title || '').trim(),
    narrative: String(raw?.narrative || '').trim(), facts: array('facts'),
    concepts: array('concepts'), files_read: array('files_read'), files_modified: array('files_modified') };
  if (missing.length && !skip) console.warn(`[Memory] LLM response missing list field(s) ${missing.join(', ')}; using []`);
  return result;
}

/** Every generated record is written in English, whatever language the source events use. */
export const ENGLISH_RECORD_RULE = 'Write title, narrative, facts and concepts in English regardless of the language of the events; keep identifiers, paths, commands and proper names verbatim.';

/** Appended to the system prompt for the single retry when a first answer came back mainly CJK. */
export const ENGLISH_RETRY_REMINDER = 'IMPORTANT: a previous answer for these events was not written in English. ' +
  'The title, narrative, facts and concepts MUST be written in English. Translate Chinese, Japanese or Korean prose into English; ' +
  'keep identifiers, paths, commands, quoted error text and proper names verbatim.';

/** Share of CJK characters (ideographs, kana, hangul) among CJK characters plus Latin letters of prose words in `text`. */
export function cjkRatio(text: string): number {
  // Identifiers, paths, commands and code spans stay verbatim, so they do not count as English prose.
  const prose = text.replace(/`[^`]*`/g, ' ').replace(/\S*[\/\\._:=@#-]\S+/g, ' ');
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
  const latin = (prose.match(/[A-Za-z]/g) || []).length;
  return cjk + latin ? cjk / (cjk + latin) : 0;
}

export const CJK_RETRY_THRESHOLD = 0.3;

/** True when a non-skip model answer's title + narrative are mainly CJK. */
export function isMainlyCjk(raw: any): boolean {
  if (!raw || typeof raw !== 'object' || raw.record_kind === 'skip') return false;
  const text = `${typeof raw.title === 'string' ? raw.title : ''}\n${typeof raw.narrative === 'string' ? raw.narrative : ''}`;
  return cjkRatio(text) >= CJK_RETRY_THRESHOLD;
}

/**
 * Calls the synthesis model once; if the answer is mainly CJK, retries once with a
 * stronger English reminder and keeps the second answer whatever its language.
 * A failed retry keeps the first answer. First-call errors propagate unchanged.
 */
export async function synthesizeEnglishWorkMemory(call: (system: string) => Promise<any>, system: string):
    Promise<{ raw: any; calls: number; retried: boolean }> {
  const first = await call(system);
  if (!isMainlyCjk(first)) return { raw: first, calls: 1, retried: false };
  try { return { raw: await call(`${system}\n${ENGLISH_RETRY_REMINDER}`), calls: 2, retried: true }; }
  catch (err: any) {
    console.warn(`[Memory] English retry failed, keeping the first answer: ${err?.message || err}`);
    return { raw: first, calls: 2, retried: true };
  }
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
remain useful. Do not infer that an entire reviewer session is noise.
${ENGLISH_RECORD_RULE}`;
