/** People an @FirstName in a message actually points at. Longer names win, so
 *  @Ann doesn't also match inside @Anna. */
export function mentionedUserIds(
  body: string,
  people: Iterable<{ id: string; firstName?: string | null }>,
): Set<string> {
  const hits = new Set<string>();
  if (!body.includes("@")) return hits;
  const ranked = [...people]
    .map((person) => ({ id: person.id, name: (person.firstName ?? "").trim() }))
    .filter((person) => person.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  for (const person of ranked) {
    const escaped = person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\s)@${escaped}(?=$|[\\s.,!?;:])`, "i");
    if (re.test(body)) hits.add(person.id);
  }
  return hits;
}
