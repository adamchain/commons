/**
 * Plan titles are a headline, not the body. Keep this in sync with
 * client/src/lib/format.ts — both sides split the same way.
 */
export const MAX_PLAN_TITLE_LEN = 80;
export const MAX_PLAN_DESCRIPTION_LEN = 4000;

/** Cut a too-long title at a sentence, then a word, so the headline stays glanceable. */
export function splitPlanTitle(raw: string, max = MAX_PLAN_TITLE_LEN): { title: string; rest: string } {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length <= max) return { title: text, rest: "" };

  let cut = -1;
  const re = /[.!?](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = match.index + match[0].length;
    if (end > max) break;
    if (end >= 24) cut = end;
  }
  if (cut < 0) {
    const space = text.lastIndexOf(" ", max);
    cut = space >= 24 ? space : max;
  }
  let title = text.slice(0, cut).trim().replace(/[,\-–—:;]+$/, "").trim();
  let rest = text.slice(cut).trim();
  if (!title) {
    title = text.slice(0, max).trim();
    rest = text.slice(max).trim();
  }
  return { title, rest };
}

/**
 * Enforce the title cap. Anything past the headline is kept on the description
 * so a pasted show list isn't thrown away — it just stops being the title.
 */
export function limitPlanTitle(
  title: string,
  description?: string | null,
): { title: string; description?: string } {
  const split = splitPlanTitle(title);
  const existing = (description ?? "").trim();
  if (!split.rest) {
    return { title: split.title, description: existing ? existing.slice(0, MAX_PLAN_DESCRIPTION_LEN) : undefined };
  }
  const probe = split.rest.slice(0, Math.min(40, split.rest.length));
  const merged = probe && existing.startsWith(probe) ? existing : [split.rest, existing].filter(Boolean).join("\n\n");
  return {
    title: split.title,
    description: merged.slice(0, MAX_PLAN_DESCRIPTION_LEN) || undefined,
  };
}
