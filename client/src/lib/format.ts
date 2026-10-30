/** Display titles like a text — not shouty event listings. */
export function sentenceCaseTitle(raw: string): string {
  const t = raw.trim();
  if (!t) return raw;
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 2 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Accept pasted links with or without a scheme. */
export function normalizeHttpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/^<|>$/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    if (!u.hostname.includes(".")) return undefined;
    return u.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

export function firstHttpUrlInText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const tagged = text.match(/https?:\/\/[^\s<>"']+/i);
  if (tagged) return normalizeHttpUrl(tagged[0].replace(/[),.;!?]+$/, ""));
  const www = text.match(/\bwww\.[^\s<>"']+/i);
  if (www) return normalizeHttpUrl(www[0].replace(/[),.;!?]+$/, ""));
  return undefined;
}

export function formatPlanDate(
  iso: string,
  opts?: { isFlexibleDate?: boolean; isThisWeek?: boolean },
): string {
  if (opts?.isThisWeek) return "This week";
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
  if (isFlexible || time === "Flexible" || !time) return "Flexible";
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]m)?$/i);
  if (!match) return time;
  let h = parseInt(match[1], 10);
  const minute = match[2] ?? "00";
  const mer = match[3]?.toLowerCase();
  if (!Number.isFinite(h) || h > 23) return time;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${minute.padStart(2, "0")} ${ampm}`;
}

function timeIsOpen(time?: string | null, isFlexibleTime?: boolean): boolean {
  return Boolean(isFlexibleTime || time === "Flexible" || !time?.trim());
}

/** Date · set time · set place, with a single trailing Flexible if time
 *  and/or location are still open. Never stacks Flexible twice. */
export function formatPlanWhenWhereLine(plan: {
  date: string;
  time?: string | null;
  isFlexibleDate?: boolean;
  isThisWeek?: boolean;
  isFlexibleTime?: boolean;
  isFlexibleLocation?: boolean;
  location?: { name?: string } | null;
}): string {
  const parts: string[] = [
    formatPlanDate(plan.date, {
      isFlexibleDate: plan.isFlexibleDate,
      isThisWeek: plan.isThisWeek,
    }),
  ];
  const timeOpen = timeIsOpen(plan.time, plan.isFlexibleTime);
  const locName = formatVenueName(plan.location?.name);
  const locOpen = Boolean(plan.isFlexibleLocation || !locName);
  if (!timeOpen && plan.time) parts.push(formatPlanTime(plan.time, false));
  else if (timeOpen && !locOpen) parts.push("Flexible");
  if (!locOpen) parts.push(locName);
  else parts.push("Flexible");
  return parts.join(" · ");
}

/** Date & time row: keep Flexible off this line when Location will say it. */
export function formatPlanWhenLine(
  date: string,
  time: string,
  isFlexibleTime: boolean,
  opts?: { isFlexibleDate?: boolean; isThisWeek?: boolean; isFlexibleLocation?: boolean },
): string {
  const day = formatPlanDate(date, opts);
  if (!timeIsOpen(time, isFlexibleTime)) return `${day} · ${formatPlanTime(time, false)}`;
  if (!opts?.isFlexibleLocation) return `${day} · Flexible`;
  return day;
}

/**
 * Trim state/county/zip/country tails off a Google Places or Nominatim
 * address. Keep the city: "114 S 13th St, Philadelphia, PA 19107, USA" →
 * "114 S 13th St, Philadelphia". The full string is still passed to maps
 * deep-links so routing isn't affected.
 */
const ADDRESS_DROP_TOKENS = new Set([
  "pennsylvania",
  "united states",
  "united states of america",
  "usa",
  "us",
]);

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN",
  Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY",
};

const STATE_ABBRS = new Set(Object.values(US_STATE_ABBR));

const STREET_WORD =
  /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pike|pl|place|ct|court|ter|terrace|hwy|highway|pkwy|parkway|cir|circle|sq|square|trl|trail|aly|alley)\b/i;

function titleCasePlace(part: string): string {
  return part.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bOf\b/g, "of");
}

function stateAbbr(part: string): string | null {
  if (/^[A-Za-z]{2}$/.test(part) && STATE_ABBRS.has(part.toUpperCase())) return part.toUpperCase();
  const titled = titleCasePlace(part);
  return US_STATE_ABBR[part] ?? US_STATE_ABBR[titled] ?? null;
}

function isHouseNumber(part: string): boolean {
  return /^\d{1,5}[A-Za-z]?$/.test(part);
}

function isStreetPart(part: string): boolean {
  return STREET_WORD.test(part) || /^(n|s|e|w|ne|nw|se|sw|north|south|east|west)\b/i.test(part);
}

/** Country, county, ZIP, "PA 19107", or a bare state code. Cities stay, including ones that share a state name. */
function isAdminPart(part: string): boolean {
  const lc = part.toLowerCase();
  if (ADDRESS_DROP_TOKENS.has(lc) || /county$/i.test(part)) return true;
  if (/^\d{5}(-\d{4})?$/.test(part)) return true;
  if (/^[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(part)) return true;
  if (/^[A-Za-z]{2}$/.test(part) && STATE_ABBRS.has(part.toUpperCase())) return true;
  return false;
}

function splitPlaceParts(raw: string): string[] {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const next = parts[i + 1];
    // Nominatim splits the house number off the street: "130, South 19th Street"
    // or "1136, Market Street" — including when a venue name comes first.
    // Don't glue a ZIP onto the city ("19103, Philadelphia").
    if (next && isHouseNumber(parts[i]) && isStreetPart(next)) {
      out.push(`${parts[i]} ${next}`);
      i++;
      continue;
    }
    out.push(parts[i]);
  }
  return out;
}

/**
 * Street line under a venue. Keeps the city, drops state / ZIP / country / county.
 * Pass `omitLeading` (the venue name) so "La Colombe, 130 S 19th St, Philadelphia, PA"
 * doesn't repeat the name.
 */
export function formatPlaceAddress(
  raw: string | undefined | null,
  opts?: { omitLeading?: string },
): string {
  if (!raw) return "";
  let parts = splitPlaceParts(raw);
  const omit = opts?.omitLeading?.trim().toLowerCase();
  const omitFirst = omit ? splitPlaceParts(opts?.omitLeading ?? "")[0]?.trim().toLowerCase() : "";
  if (omit && (parts[0]?.toLowerCase() === omit || (omitFirst && parts[0]?.toLowerCase() === omitFirst))) {
    parts = parts.slice(1);
  }
  const kept = parts.filter((part) => !isAdminPart(part));
  return kept.join(", ");
}

/**
 * Venue title. A pasted street address collapses to street + city.
 * "La Colombe, 130 S 19th St, Philadelphia, PA" stays "La Colombe".
 */
export function formatVenueName(name: string | undefined | null): string {
  const t = name?.trim() ?? "";
  if (!t.includes(",")) return t;
  const parts = splitPlaceParts(t);
  const first = parts[0] ?? t;
  if (/^\d/.test(first)) return formatPlaceAddress(t) || first;
  const restRaw = parts.slice(1).join(", ");
  const rest = formatPlaceAddress(restRaw);
  if (rest && (rest.length < restRaw.trim().length || /^\d/.test(rest))) return first;
  return formatPlaceAddress(t) || t;
}

/** Address line under a venue title. Empty when it would repeat the title. */
export function formatVenueAddressLine(
  name: string | undefined | null,
  address: string | undefined | null,
): string {
  const line = formatPlaceAddress(address, { omitLeading: name ?? undefined });
  const title = formatVenueName(name);
  if (!line) return "";
  const lineLc = line.toLowerCase();
  const titleLc = title.trim().toLowerCase();
  if (!titleLc) return line;
  if (lineLc === titleLc || titleLc.includes(lineLc)) return "";
  return line;
}

/** Profile / community place: keep the city, abbreviate the state, drop country and county. */
export function formatAreaLabel(raw: string | undefined | null): string {
  if (!raw) return "";
  const drop = new Set(["united states", "united states of america", "usa", "us"]);
  const parts = splitPlaceParts(raw)
    .filter((part) => {
      const lc = part.toLowerCase();
      if (drop.has(lc) || /county$/i.test(part)) return false;
      if (/^\d{5}(-\d{4})?$/.test(part)) return false;
      return true;
    })
    .map((part) => {
      const zipState = part.match(/^([A-Za-z]{2})\s+\d{5}(-\d{4})?$/);
      return zipState ? zipState[1].toUpperCase() : part;
    });
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const abbr = stateAbbr(parts[0]);
    if (abbr && abbr !== parts[0] && !STATE_ABBRS.has(parts[0].toUpperCase())) return abbr;
    return parts[0];
  }
  const lastAbbr = stateAbbr(parts[parts.length - 1]);
  if (lastAbbr) parts[parts.length - 1] = lastAbbr;
  return parts.join(", ");
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.max(1, Math.round(days / 365));
  return `${years}y ago`;
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
    // Country code 1 is NANP only — a short "+1…" must not count as a finished number.
    if (rest.startsWith("1")) return rest.length === 11 && isNanp10(rest.slice(1));
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
