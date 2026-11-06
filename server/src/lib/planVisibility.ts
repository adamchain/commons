import type { PublicUser } from "../types/shared.js";

/**
 * How much of a plan a given viewer is allowed to see.
 *   full            — everything (hosts, co-hosts, confirmed attendees, open plans)
 *   approval_gated  — approval-only plan, viewer not yet approved: street address,
 *                     map pin, and attendee identities hidden; venue name + counts shown
 *   hidden          — "keep details private until people join" is on and the viewer
 *                     hasn't joined: only the title and day are shown
 */
export type PlanDetailAccess = "full" | "approval_gated" | "hidden";

type PlanLike = {
  creatorId: string;
  coHostIds?: string[];
  hideDetailsUntilJoined?: boolean;
  joinType?: string;
  isFlexibleDate?: boolean;
  isThisWeek?: boolean;
  date?: string;
};

export function planHidesUntilJoined(plan: { hideDetailsUntilJoined?: boolean }): boolean {
  return plan.hideDetailsUntilJoined === true;
}

/**
 * "Joined" for the purpose of unlocking details: the host, a co-host, or a
 * confirmed (Going / approved) attendee. Interested and pending don't count.
 */
export function viewerHasJoinedPlan(
  plan: { creatorId: string; coHostIds?: string[] },
  viewerId: string | null,
  myState?: "interested" | "going" | null,
): boolean {
  if (!viewerId) return false;
  if (plan.creatorId === viewerId) return true;
  if ((plan.coHostIds ?? []).includes(viewerId)) return true;
  return myState === "going";
}

export function planDetailAccess(
  plan: PlanLike,
  viewerId: string | null,
  myState?: "interested" | "going" | null,
): PlanDetailAccess {
  if (viewerHasJoinedPlan(plan, viewerId, myState)) return "full";
  if (planHidesUntilJoined(plan)) return "hidden";
  if (plan.joinType === "approve") return "approval_gated";
  return "full";
}

/**
 * Short day label shown when the rest of a plan is hidden. "Today",
 * "Tomorrow", or "This Friday" within a week; "Fri, Nov 20" further out.
 */
export function planDayLabel(plan: PlanLike, now: Date = new Date()): string {
  if (plan.isFlexibleDate) return "Anytime";
  if (plan.isThisWeek) return "This week";
  const iso = (plan.date ?? "").slice(0, 10);
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `This ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * A stand-in attendee that preserves the headcount for an approval-gated plan
 * without revealing who's going. Deterministic avatar so the list is stable.
 */
export function anonAttendee(planId: string, index: number): PublicUser {
  return {
    id: `hidden-${planId}-${index}`,
    firstName: "Member",
    neighborhoodId: null,
    avatarSeed: `${planId}-${index}`,
    avatarStyle: "avataaars",
  };
}

/** A blanked host for a fully hidden plan. Keeps the object shape the client expects. */
export function redactedHost(planId: string): PublicUser {
  return {
    id: "",
    firstName: "Someone",
    neighborhoodId: null,
    avatarSeed: `hidden-host-${planId}`,
    avatarStyle: "avataaars",
  };
}
