/**
 * QA / scratch communities that leaked into production Explore.
 * Hide them from the public list; organizers still see them under Mine.
 */
export function isQaOrTestCommunityName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (n === "test") return true;
  if (/^qa(\s|$|[-_])/.test(n)) return true;
  if (/^test(\s|$|[-_])/.test(n)) return true;
  return false;
}
