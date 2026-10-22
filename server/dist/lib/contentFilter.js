/** Server-side filter for objectionable user-generated text (App Store 1.2). */
export const FILTER_REJECT_MESSAGE = "That isn't allowed. COMMONS has no tolerance for objectionable content or abusive behavior.";
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
function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/[@$0]/g, (ch) => ({ "@": "a", $: "s", "0": "o" }[ch] ?? ch));
}
export function containsObjectionableContent(text) {
    const hay = normalize(text);
    if (!hay.trim())
        return false;
    return TERMS.some((term) => hay.includes(term));
}
export function textBlockedReason(...parts) {
    for (const part of parts) {
        if (typeof part === "string" && containsObjectionableContent(part)) {
            return FILTER_REJECT_MESSAGE;
        }
    }
    return null;
}
