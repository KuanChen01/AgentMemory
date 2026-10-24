// CJK text has no word separators, and both the FTS5 unicode61 tokenizer and ASCII `\w` matching
// treat it badly (a whole run becomes one token, or nothing at all). Overlapping character bigrams
// are the usual dependency-free substitute for word segmentation.
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

export function extractCjkBigrams(text: string): string[] {
  const grams: string[] = [];
  for (const run of String(text || '').match(CJK_RUN) || []) {
    const chars = Array.from(run);
    if (chars.length === 1) {
      grams.push(chars[0]);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i++) {
      grams.push(chars[i] + chars[i + 1]);
    }
  }
  return grams;
}

// Fraction of the query's distinct CJK bigrams that occur verbatim in the document text.
export function cjkOverlapScore(queryBigrams: string[], documentText: string): number {
  const unique = Array.from(new Set(queryBigrams));
  if (unique.length === 0) return 0;
  let hits = 0;
  for (const gram of unique) {
    if (documentText.includes(gram)) hits++;
  }
  return hits / unique.length;
}
