/** Server-side filter for objectionable user-generated text (App Store 1.2). */

export const FILTER_REJECT_MESSAGE =
  "That isn't allowed. COMMONS has no tolerance for objectionable content or abusive behavior.";

const TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "kike",
  "spic",
  "tranny",
  "child porn",
  "childporn",
  "csam",
  "rape",
  "raping",
  "rapist",
  "kill yourself",
  "kys",
  "bomb the",
  "nazi",
  "heil hitler",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[@$0]/g, (ch) => ({ "@": "a", $: "s", "0": "o" }[ch] ?? ch));
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match each term as a whole word (optionally pluralized) rather than a raw
// substring, so innocent words that merely contain a banned sequence are not
// rejected \u2014 e.g. "grape"/"drape"/"scrape" vs. "rape", or "therapist" vs.
// "rapist", or "despicable"/"conspicuous" vs. "spic".
const TERM_PATTERNS = TERMS.map(
  (term) => new RegExp(`\\b${escapeRegExp(term)}s?\\b`),
);

export function containsObjectionableContent(text: string): boolean {
  const hay = normalize(text);
  if (!hay.trim()) return false;
  return TERM_PATTERNS.some((re) => re.test(hay));
}

export function textBlockedReason(
  ...parts: Array<string | null | undefined>
): string | null {
  for (const part of parts) {
    if (typeof part === "string" && containsObjectionableContent(part)) {
      return FILTER_REJECT_MESSAGE;
    }
  }
  return null;
}
