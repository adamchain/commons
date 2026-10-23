// "Add to calendar" links for a plan.
//
//   • Google Calendar — a render URL opened in the browser.
//   • Apple Calendar / iCal — the server-built .ics file. Opening it on iOS
//     prompts "Add to Calendar"; on the web it downloads the event.

import type { PlanDTO } from "../types/shared";
import { planStartTimestamp, planEndTimestamp } from "./planTime";
import { getPublicWebOrigin } from "./platform";
import { API_BASE } from "../api/http";

/** Epoch ms → `YYYYMMDDTHHMMSSZ` (UTC). */
function toUtcStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** A plan can't be put on a calendar until it has a real day (not "Anytime"). */
export function canAddToCalendar(plan: PlanDTO): boolean {
  return !plan.isFlexibleDate;
}

export function googleCalendarUrl(plan: PlanDTO): string {
  const start = planStartTimestamp(plan);
  const end = planEndTimestamp(plan);
  const dates = `${toUtcStamp(start)}/${toUtcStamp(end)}`;
  const url = `${getPublicWebOrigin()}/plans/${plan.id}`;
  const location = plan.isFlexibleLocation
    ? ""
    : [plan.location?.name, plan.location?.address].filter(Boolean).join(", ");
  const details = [plan.description?.trim(), url].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: plan.title,
    dates,
    details,
  });
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** The .ics lives on the API host (same Express app that serves og-image). */
export function appleCalendarUrl(plan: PlanDTO): string {
  return `${API_BASE}/plans/${plan.id}/calendar.ics`;
}
