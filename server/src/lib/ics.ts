// Minimal iCalendar (.ics) builder for a single plan event.
//
// Served from GET /plans/:id/calendar.ics so Apple Calendar (and any other
// calendar app) can import a plan directly. Google Calendar uses a render URL
// built on the client instead — see client/src/lib/calendar.ts.

import type { PlanRecord } from "../store.js";
import { planStartTimestamp, planEndTimestamp } from "./planTime.js";
import { publicWebOrigin } from "./publicOrigin.js";

/** Epoch ms → `YYYYMMDDTHHMMSSZ` (UTC) for DTSTART/DTEND/DTSTAMP. */
function toUtcStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Escape text for an ICS value (RFC 5545 §3.3.11). */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long content lines at 75 octets, per RFC 5545 §3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export function planToIcs(plan: PlanRecord, now = new Date()): string {
  const start = planStartTimestamp(plan);
  const end = planEndTimestamp(plan);
  const url = `${publicWebOrigin()}/plans/${plan.id}`;
  const location = plan.isFlexibleLocation
    ? ""
    : [plan.location?.name, plan.location?.address].filter(Boolean).join(", ");
  const descParts = [plan.description?.trim(), url].filter(Boolean) as string[];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Commons//Plans//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:plan-${plan.id}@oncommons.co`,
    `DTSTAMP:${toUtcStamp(now.getTime())}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${esc(plan.title)}`,
    descParts.length ? `DESCRIPTION:${esc(descParts.join("\n\n"))}` : "",
    location ? `LOCATION:${esc(location)}` : "",
    `URL:${esc(url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.map(fold).join("\r\n") + "\r\n";
}
