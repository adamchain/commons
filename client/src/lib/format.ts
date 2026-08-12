/** Display titles like a text — not shouty event listings. */
export function sentenceCaseTitle(raw: string): string {
  const t = raw.trim();
  if (!t) return raw;
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 2 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function formatPlanDate(iso: string, opts?: { isFlexibleDate?: boolean }): string {
  if (opts?.isFlexibleDate || iso.startsWith("2099-12-31")) return "Anytime";
  // Parse the YYYY-MM-DD portion as a *local* date. `new Date("2026-08-13")`
  // parses as UTC midnight, which lands on the previous day for US timezones —
  // making tomorrow's plan show "Today". Build from local getters instead.
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatPlanTime(time: string, isFlexible: boolean): string {
  if (isFlexible || time === "Flexible" || !time) return "Flexible time";
  const [hStr, mStr = "00"] = time.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return time;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr.padStart(2, "0")} ${ampm}`;
}

/**
 * Trim city/state/county/zip/country tails off a Google Places or Nominatim
 * address so cards show the meaningful part. "114 S 13th St, Philadelphia,
 * PA 19107, USA" → "114 S 13th St". The full string is still passed to maps
 * deep-links so routing isn't affected.
 */
const ADDRESS_DROP_TOKENS = new Set([
  "philadelphia",
  "philadelphia county",
  "pennsylvania",
  "pa",
  "united states",
  "united states of america",
  "usa",
  "us",
]);

export function formatPlaceAddress(raw: string | undefined | null): string {
  if (!raw) return "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((part) => {
    const lc = part.toLowerCase();
    if (ADDRESS_DROP_TOKENS.has(lc)) return false;
    // Bare ZIP / ZIP+4
    if (/^\d{5}(-\d{4})?$/.test(part)) return false;
    // "PA 19107" or "PA 19107-1234"
    if (/^[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(part)) return false;
    return true;
  });
  return kept.join(", ");
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** True when the string is a valid US (NANP) or +E.164 phone number. */
export function isValidPhoneInput(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return false;
  const isNanp10 = (n: string) => /^[2-9]\d{2}[2-9]\d{6}$/.test(n);
  if (/^1\d{10}$/.test(digits)) return isNanp10(digits.slice(1));
  if (/^\d{10}$/.test(digits)) return isNanp10(digits);
  const compact = raw.replace(/\s/g, "").trim();
  if (compact.startsWith("+")) {
    const rest = compact.slice(1).replace(/\D/g, "");
    if (rest.startsWith("1") && rest.length === 11) return isNanp10(rest.slice(1));
    return /^\d{6,14}$/.test(rest);
  }
  return false;
}

/** Progressive phone formatting for the onboarding / public-event number field. */
export function formatPhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const inner = trimmed.slice(1).replace(/\D/g, "").slice(0, 15);
    // Pretty NANP: +1 (484) 571-2062
    if (inner.length === 11 && inner.startsWith("1")) {
      const n = inner.slice(1);
      if (n.length === 10) {
        return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
      }
    }
    return `+${inner}`;
  }
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
