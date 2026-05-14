/** Normalize to E.164 for US/international input (matches prior auth behavior). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const isNanp10 = (n: string): boolean => /^[2-9]\d{2}[2-9]\d{6}$/.test(n);
  if (/^1\d{10}$/.test(digits)) {
    const national = digits.slice(1);
    if (!isNanp10(national)) return null;
    return `+${digits}`;
  }
  if (/^\d{10}$/.test(digits)) {
    if (!isNanp10(digits)) return null;
    return `+1${digits}`;
  }
  const compact = raw.replace(/\s/g, "").trim();
  if (compact.startsWith("+")) {
    const rest = compact.slice(1).replace(/\D/g, "");
    if (/^\d{6,14}$/.test(rest)) {
      if (rest.startsWith("1") && rest.length === 11 && !isNanp10(rest.slice(1))) return null;
      return `+${rest}`;
    }
  }
  return null;
}
