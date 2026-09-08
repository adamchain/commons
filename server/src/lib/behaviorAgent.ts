import { isOnboardingFinished } from "./onboarding.js";
import { combinedNeighborhoodScope, planVisibleToViewer, userHoods } from "./feedScope.js";
import { store, type PlanRecord, type UserRecord } from "../store.js";
import { INTEREST_LABELS, type InterestTag } from "../types/shared.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Severity = "critical" | "high" | "medium" | "low";

export type BehaviorSuggestion = {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  why: string;
  evidence: string[];
  actions: string[];
  neighborhoodId?: string;
  neighborhoodName?: string;
  interestTag?: string;
  userIds: string[];
  sampleUsers: { id: string; firstName: string }[];
};

export type FlaggedUser = {
  id: string;
  firstName: string;
  neighborhoodName: string | null;
  accountSource: string;
  segment: string;
  flags: string[];
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  accountAgeDays: number;
  feedUpcoming: number;
  feedMatchingInterests: number;
  rsvps: number;
  going: number;
  hosted: number;
  dropouts: number;
  messages: number;
  networkSize: number;
  suggestions: string[];
};

export type UserBehaviorInsight = {
  segment: string;
  flags: string[];
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  feedUpcoming: number;
  feedMatchingInterests: number;
  suggestions: string[];
};

export type BehaviorReport = {
  generatedAt: string;
  brief: string;
  universe: {
    totalUsers: number;
    verifiedUsers: number;
    seedUsers: number;
    ejectedUsers: number;
  };
  funnel: {
    signedUp: number;
    onboarded: number;
    fullyOnboarded: number;
    firstRsvp: number;
    firstGoing: number;
    firstHost: number;
    active7d: number;
    onboardPct: number;
    activationPct: number;
    goingPct: number;
  };
  falloff: {
    stuckOnboarding: number;
    neverActivated: number;
    earlyFalloff: number;
    churnRisk: number;
    dormant: number;
    slowFeed: number;
    ghosting: number;
    isolated: number;
  };
  feedHealth: {
    neighborhoodId: string;
    name: string;
    users: number;
    upcomingPlans: number;
    status: "barren" | "thin" | "ok" | "healthy";
  }[];
  interestGaps: { tag: string; label: string; users: number; upcomingPlans: number }[];
  cohorts: {
    weekStart: string;
    signups: number;
    stillActive7d: number;
    everRsvped: number;
  }[];
  suggestions: BehaviorSuggestion[];
  flaggedUsers: FlaggedUser[];
};

type Indexes = {
  now: number;
  todayMs: number;
  since21: string;
  hoodName: Map<string, string>;
  partsByUser: Map<string, { planId: string; state: string; updatedAt: string; createdAt?: string }[]>;
  goingByPlan: Map<string, number>;
  msgsByUser: Map<string, string[]>;
  dropoutsByUser: Map<string, number>;
  declinesByUser: Map<string, number>;
  hostedByUser: Map<string, PlanRecord[]>;
  upcomingPlans: PlanRecord[];
};

function maxIso(a: string | null, b: string | undefined | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

function labelInterest(tag: string): string {
  return (INTEREST_LABELS as Record<string, string>)[tag] ?? tag;
}

function sampleUsers(users: UserRecord[], ids: string[], n = 5): { id: string; firstName: string }[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const out: { id: string; firstName: string }[] = [];
  for (const id of ids) {
    const u = byId.get(id);
    if (!u) continue;
    out.push({ id: u.id, firstName: u.firstName || "—" });
    if (out.length >= n) break;
  }
  return out;
}

function suggestion(
  partial: Omit<BehaviorSuggestion, "sampleUsers"> & { sampleUsers?: BehaviorSuggestion["sampleUsers"] },
  users: UserRecord[],
): BehaviorSuggestion {
  return {
    ...partial,
    sampleUsers: partial.sampleUsers ?? sampleUsers(users, partial.userIds),
  };
}

function buildIndexes(): Indexes {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isoAgo = (days: number) => new Date(now - days * DAY_MS).toISOString();

  const partsByUser = new Map<
    string,
    { planId: string; state: string; updatedAt: string; createdAt?: string }[]
  >();
  const goingByPlan = new Map<string, number>();
  for (const pa of store.listAllParticipations()) {
    const list = partsByUser.get(pa.userId) ?? [];
    list.push({
      planId: pa.planId,
      state: pa.state,
      updatedAt: pa.updatedAt,
      createdAt: pa.createdAt,
    });
    partsByUser.set(pa.userId, list);
    if (pa.state === "going") goingByPlan.set(pa.planId, (goingByPlan.get(pa.planId) ?? 0) + 1);
  }

  const msgsByUser = new Map<string, string[]>();
  for (const m of store.listAllMessages()) {
    if (m.kind !== "user") continue;
    const list = msgsByUser.get(m.senderId) ?? [];
    list.push(m.createdAt);
    msgsByUser.set(m.senderId, list);
  }

  const dropoutsByUser = new Map<string, number>();
  for (const d of store.listAllDropouts()) {
    dropoutsByUser.set(d.userId, (dropoutsByUser.get(d.userId) ?? 0) + 1);
  }

  const declinesByUser = new Map<string, number>();
  for (const d of store.listAllDeclines()) {
    if (d.createdAt >= isoAgo(14)) {
      declinesByUser.set(d.userId, (declinesByUser.get(d.userId) ?? 0) + 1);
    }
  }

  const hostedByUser = new Map<string, PlanRecord[]>();
  const allPlans = store.listPlans();
  for (const p of allPlans) {
    const list = hostedByUser.get(p.creatorId) ?? [];
    list.push(p);
    hostedByUser.set(p.creatorId, list);
  }

  const upcomingPlans = allPlans.filter(
    (p) => !p.cancelledAt && new Date(p.date).getTime() >= today.getTime(),
  );

  return {
    now,
    todayMs: today.getTime(),
    since21: isoAgo(21),
    hoodName: new Map(store.listNeighborhoods().map((n) => [n.id, n.name])),
    partsByUser,
    goingByPlan,
    msgsByUser,
    dropoutsByUser,
    declinesByUser,
    hostedByUser,
    upcomingPlans,
  };
}

function lastActiveAt(user: UserRecord, idx: Indexes): string | null {
  let last: string | null = user.createdAt;
  const parts = idx.partsByUser.get(user.id) ?? [];
  for (const p of parts) {
    last = maxIso(last, p.updatedAt);
    last = maxIso(last, p.createdAt ?? null);
  }
  for (const ts of idx.msgsByUser.get(user.id) ?? []) last = maxIso(last, ts);
  for (const p of idx.hostedByUser.get(user.id) ?? []) last = maxIso(last, p.createdAt);
  return last;
}

function hoodLabel(user: UserRecord, idx: Indexes): string | null {
  const hid = userHoods(user)[0] ?? user.neighborhoodId;
  if (!hid) return null;
  return idx.hoodName.get(hid) ?? hid;
}

function feedStats(user: UserRecord, idx: Indexes): { upcoming: number; matching: number } {
  const scope = combinedNeighborhoodScope(user);
  const hoodSet = scope ? new Set(scope) : null;
  const interests = new Set(user.interests ?? []);
  const rsvpIds = new Set((idx.partsByUser.get(user.id) ?? []).map((p) => p.planId));
  let upcoming = 0;
  let matching = 0;
  for (const p of idx.upcomingPlans) {
    const inScope =
      !hoodSet || hoodSet.has(p.neighborhoodId) || p.creatorId === user.id || rsvpIds.has(p.id);
    if (!inScope) continue;
    if (!planVisibleToViewer(p, user)) continue;
    upcoming++;
    if (p.tags.some((t) => interests.has(t))) matching++;
  }
  return { upcoming, matching };
}

function classifyUser(
  user: UserRecord,
  idx: Indexes,
): Omit<FlaggedUser, "id" | "firstName" | "neighborhoodName" | "accountSource"> {
  const feed = feedStats(user, idx);
  const parts = idx.partsByUser.get(user.id) ?? [];
  const hosted = idx.hostedByUser.get(user.id) ?? [];
  const going = parts.filter((p) => p.state === "going").length;
  const dropouts = idx.dropoutsByUser.get(user.id) ?? 0;
  const messages = idx.msgsByUser.get(user.id)?.length ?? 0;
  const last = lastActiveAt(user, idx);
  const idle = daysSince(last, idx.now);
  const age = daysSince(user.createdAt, idx.now) ?? 0;
  const networkSize = user.networkIds?.length ?? 0;
  const flags: string[] = [];
  const suggestions: string[] = [];
  const finished = isOnboardingFinished(user);

  if (user.ejectedAt) {
    return {
      segment: "ejected",
      flags: ["ejected"],
      lastActiveAt: last,
      daysSinceActive: idle,
      accountAgeDays: age,
      feedUpcoming: feed.upcoming,
      feedMatchingInterests: feed.matching,
      rsvps: parts.length,
      going,
      hosted: hosted.length,
      dropouts,
      messages,
      networkSize,
      suggestions: [],
    };
  }

  if (!user.onboardingComplete || !finished) {
    if (age >= 1) {
      flags.push("stuck_onboarding");
      suggestions.push(
        finished
          ? "Profile is marked onboarded but missing name or photo — complete the last step."
          : "Send a one-tap resume-onboarding text; most drop here before picking a neighborhood.",
      );
    }
  }

  const activated = parts.length > 0 || hosted.length > 0;
  if (finished && !activated && age >= 3) {
    flags.push("never_activated");
    if (feed.upcoming < 3) {
      suggestions.push("Feed is thin — invite them to post a looking-for or RSVP to a nearby plan this week.");
    } else {
      suggestions.push("Surface 1–2 high-fit plans in a personal SMS (interest + same hood).");
    }
  }

  const hadEarlyActivity =
    parts.some((p) => (p.createdAt ?? p.updatedAt) < new Date(Date.parse(user.createdAt) + 14 * DAY_MS).toISOString()) ||
    hosted.some((p) => p.createdAt < new Date(Date.parse(user.createdAt) + 14 * DAY_MS).toISOString()) ||
    (idx.msgsByUser.get(user.id) ?? []).some(
      (ts) => ts < new Date(Date.parse(user.createdAt) + 14 * DAY_MS).toISOString(),
    );

  if (finished && activated && age >= 14 && idle != null && idle >= 14 && hadEarlyActivity) {
    flags.push("early_falloff");
    suggestions.push("They showed up in week 1 then went quiet — Friday digest + a host ask in their hood.");
  }

  if (finished && activated && idle != null && idle >= 30) {
    flags.push("dormant");
    suggestions.push("Win-back: one plan that matches their original interests, not a generic blast.");
  } else if (finished && activated && idle != null && idle >= 14 && idle < 30) {
    flags.push("churn_risk");
    suggestions.push("Soft nudge before they go dormant — group chat ping or ‘plans this weekend in your hood’.");
  }

  if (finished && feed.upcoming < 3 && age >= 2) {
    flags.push("slow_feed");
    if (feed.matching === 0 && (user.interests?.length ?? 0) > 0) {
      suggestions.push(
        `No upcoming plans tagged ${user.interests.map(labelInterest).join(", ")} nearby — seed one looking-for or retag a live plan.`,
      );
    } else {
      suggestions.push("Expand neighborhood adjacency for this user or seed 2 plans in their hood this week.");
    }
  }

  if (dropouts >= 2 && going + dropouts > 0 && dropouts / (going + dropouts) >= 0.4) {
    flags.push("ghosting");
    suggestions.push("High drop-out after Going — check plan quality, timing, and whether reminders are firing.");
  }

  if (finished && networkSize === 0 && going === 0 && messages === 0 && age >= 7) {
    flags.push("isolated");
    suggestions.push("No network, chats, or Going RSVPs — introduce them via a small hosted plan or community.");
  }

  const declines = idx.declinesByUser.get(user.id) ?? 0;
  if (declines >= 4) {
    flags.push("feed_fatigue");
    suggestions.push("Lots of feed declines recently — ranking may be off; check interest tags vs what’s shown.");
  }

  const lonelyHosted = hosted.filter((p) => !p.cancelledAt && (idx.goingByPlan.get(p.id) ?? 0) <= 1).length;
  if (hosted.length >= 2 && lonelyHosted >= 2) {
    flags.push("lonely_host");
    suggestions.push("Their plans aren’t filling — help them pick a tighter time/venue or boost social proof.");
  }

  let segment = "healthy";
  const priority = [
    "stuck_onboarding",
    "never_activated",
    "dormant",
    "early_falloff",
    "churn_risk",
    "slow_feed",
    "ghosting",
    "isolated",
    "lonely_host",
    "feed_fatigue",
  ];
  for (const p of priority) {
    if (flags.includes(p)) {
      segment = p;
      break;
    }
  }

  return {
    segment,
    flags,
    lastActiveAt: last,
    daysSinceActive: idle,
    accountAgeDays: age,
    feedUpcoming: feed.upcoming,
    feedMatchingInterests: feed.matching,
    rsvps: parts.length,
    going,
    hosted: hosted.length,
    dropouts,
    messages,
    networkSize,
    suggestions,
  };
}

function severityRank(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s];
}

export function analyzeUserBehavior(user: UserRecord): UserBehaviorInsight {
  const idx = buildIndexes();
  const c = classifyUser(user, idx);
  return {
    segment: c.segment,
    flags: c.flags,
    lastActiveAt: c.lastActiveAt,
    daysSinceActive: c.daysSinceActive,
    feedUpcoming: c.feedUpcoming,
    feedMatchingInterests: c.feedMatchingInterests,
    suggestions: c.suggestions,
  };
}

export function runBehaviorAgent(allUsers: UserRecord[]): BehaviorReport {
  const idx = buildIndexes();
  const live = allUsers.filter((u) => !u.ejectedAt);
  const verified = live.filter((u) => (u.accountSource ?? "verify") !== "seed");
  const focus = verified.length > 0 ? verified : live;

  const classified = focus.map((u) => {
    const c = classifyUser(u, idx);
    return {
      user: u,
      row: {
        id: u.id,
        firstName: u.firstName || "—",
        neighborhoodName: hoodLabel(u, idx),
        accountSource: u.accountSource ?? "verify",
        ...c,
      } satisfies FlaggedUser,
    };
  });

  const flagCount = (flag: string) => classified.filter((c) => c.row.flags.includes(flag)).length;
  const idsWith = (flag: string) => classified.filter((c) => c.row.flags.includes(flag)).map((c) => c.user.id);

  const signedUp = focus.length;
  const onboarded = focus.filter((u) => u.onboardingComplete).length;
  const fullyOnboarded = focus.filter((u) => isOnboardingFinished(u)).length;
  const firstRsvp = classified.filter((c) => c.row.rsvps > 0).length;
  const firstGoing = classified.filter((c) => c.row.going > 0).length;
  const firstHost = classified.filter((c) => c.row.hosted > 0).length;
  const active7d = classified.filter((c) => (c.row.daysSinceActive ?? 999) <= 7).length;

  const usersByHood = new Map<string, UserRecord[]>();
  for (const u of focus) {
    const hid = userHoods(u)[0] ?? u.neighborhoodId ?? "_none";
    const list = usersByHood.get(hid) ?? [];
    list.push(u);
    usersByHood.set(hid, list);
  }

  const feedHealth = [...usersByHood.entries()]
    .filter(([id]) => id !== "_none")
    .map(([neighborhoodId, users]) => {
      const scope = new Set(store.neighborhoodScope(neighborhoodId));
      const upcoming = idx.upcomingPlans.filter((p) => scope.has(p.neighborhoodId)).length;
      const status: BehaviorReport["feedHealth"][number]["status"] =
        upcoming < 2 ? "barren" : upcoming < 5 ? "thin" : upcoming < 10 ? "ok" : "healthy";
      return {
        neighborhoodId,
        name: idx.hoodName.get(neighborhoodId) ?? neighborhoodId,
        users: users.length,
        upcomingPlans: upcoming,
        status,
      };
    })
    .sort((a, b) => b.users - a.users);

  const interestUsers = new Map<string, number>();
  for (const u of focus) {
    if (!isOnboardingFinished(u)) continue;
    for (const t of u.interests ?? []) interestUsers.set(t, (interestUsers.get(t) ?? 0) + 1);
  }
  const interestPlans = new Map<string, number>();
  for (const p of idx.upcomingPlans) {
    for (const t of p.tags) interestPlans.set(t, (interestPlans.get(t) ?? 0) + 1);
  }
  const interestGaps = [...interestUsers.entries()]
    .map(([tag, users]) => ({
      tag,
      label: labelInterest(tag),
      users,
      upcomingPlans: interestPlans.get(tag) ?? 0,
    }))
    .filter((g) => g.users >= 4 && g.upcomingPlans < 2)
    .sort((a, b) => b.users - a.users);

  const weekStarts: string[] = [];
  {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - dow);
    for (let i = 5; i >= 0; i--) {
      const w = new Date(d);
      w.setUTCDate(d.getUTCDate() - i * 7);
      weekStarts.push(w.toISOString().slice(0, 10));
    }
  }
  const cohorts = weekStarts.map((weekStart, i) => {
    const start = `${weekStart}T00:00:00.000Z`;
    const end =
      i === weekStarts.length - 1
        ? new Date().toISOString()
        : `${weekStarts[i + 1]}T00:00:00.000Z`;
    const members = classified.filter((c) => c.user.createdAt >= start && c.user.createdAt < end);
    return {
      weekStart,
      signups: members.length,
      stillActive7d: members.filter((c) => (c.row.daysSinceActive ?? 999) <= 7).length,
      everRsvped: members.filter((c) => c.row.rsvps > 0).length,
    };
  });

  const suggestions: BehaviorSuggestion[] = [];

  const barrenHoods = feedHealth.filter((h) => h.users >= 3 && (h.status === "barren" || h.status === "thin"));
  for (const h of barrenHoods.slice(0, 8)) {
    const hoodUserIds = (usersByHood.get(h.neighborhoodId) ?? []).map((u) => u.id);
    suggestions.push(
      suggestion(
        {
          id: `slow-feed-${h.neighborhoodId}`,
          kind: "slow_feed",
          severity: h.status === "barren" ? "critical" : "high",
          title: `Slow feed in ${h.name}`,
          why: `${h.users} members and only ${h.upcomingPlans} upcoming plan${h.upcomingPlans === 1 ? "" : "s"} in-scope. Empty home feeds drive early falloff.`,
          evidence: [
            `${h.upcomingPlans} upcoming plans in ${h.name} + adjacent`,
            `${flagCount("slow_feed")} users platform-wide already sit on a thin feed`,
          ],
          actions: [
            `Ask 1–2 active hosts in ${h.name} to post this week (coffee / walk is enough).`,
            "Create a looking-for in that hood so people can reply instead of staring at an empty list.",
            "Prioritize this hood in the Friday weekend SMS.",
          ],
          neighborhoodId: h.neighborhoodId,
          neighborhoodName: h.name,
          userIds: hoodUserIds,
        },
        focus,
      ),
    );
  }

  const stuck = idsWith("stuck_onboarding");
  if (stuck.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "falloff-onboarding",
          kind: "user_falloff",
          severity: stuck.length >= 8 ? "high" : "medium",
          title: "Onboarding falloff",
          why: `${stuck.length} people started signup but never finished neighborhood / photo / name. They never see a feed.`,
          evidence: [
            `${onboarded}/${signedUp} marked onboarded (${signedUp ? Math.round((1000 * onboarded) / signedUp) / 10 : 0}%)`,
            `${fullyOnboarded} have name + photo (fully usable)`,
          ],
          actions: [
            "SMS resume link 24h after first verify if onboarding is incomplete.",
            "Drop the photo requirement behind ‘do this later’ if completion stays under 70%.",
          ],
          userIds: stuck,
        },
        focus,
      ),
    );
  }

  const neverAct = idsWith("never_activated");
  if (neverAct.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "falloff-activation",
          kind: "user_falloff",
          severity: neverAct.length >= 6 ? "high" : "medium",
          title: "Activation falloff (no first RSVP)",
          why: `${neverAct.length} finished setup but never hosted or RSVP’d. First Going in week 1 is the strongest retain signal.`,
          evidence: [
            `${firstRsvp}/${fullyOnboarded || signedUp} of the focus set have any RSVP`,
            `${idsWith("slow_feed").filter((id) => neverAct.includes(id)).length} of them also have a slow feed`,
          ],
          actions: [
            "Personal ‘three plans near you’ text, not a generic open-the-app ping.",
            "If their feed is empty, don’t nudge RSVP — seed supply first or they’ll bounce twice.",
          ],
          userIds: neverAct,
        },
        focus,
      ),
    );
  }

  const falloff = [...idsWith("early_falloff"), ...idsWith("churn_risk"), ...idsWith("dormant")];
  const falloffUnique = [...new Set(falloff)];
  if (falloffUnique.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "falloff-retention",
          kind: "user_falloff",
          severity: idsWith("dormant").length >= 5 ? "critical" : "high",
          title: "Post-activation falloff",
          why: `${idsWith("early_falloff")} cooled off after an early burst, ${idsWith("churn_risk")} are 14–30 days idle, ${idsWith("dormant")} are 30+ days gone.`,
          evidence: [
            `${active7d} of ${signedUp} still touched the product in 7 days`,
            `WAU-style last-touch is the activity proxy (RSVP, host, or chat)`,
          ],
          actions: [
            "Win-back only with a specific plan in their hood/interests.",
            "Ask hosts they previously went with to reopen a similar plan.",
            "Don’t blast dormant users weekly — one good invite beats digest fatigue.",
          ],
          userIds: falloffUnique,
        },
        focus,
      ),
    );
  }

  for (const gap of interestGaps.slice(0, 6)) {
    const userIds = focus
      .filter((u) => isOnboardingFinished(u) && (u.interests ?? []).includes(gap.tag as InterestTag))
      .map((u) => u.id);
    suggestions.push(
      suggestion(
        {
          id: `interest-gap-${gap.tag}`,
          kind: "supply_gap",
          severity: gap.users >= 10 && gap.upcomingPlans === 0 ? "high" : "medium",
          title: `Demand for ${gap.label} with almost no plans`,
          why: `${gap.users} onboarded members picked ${gap.label}, but only ${gap.upcomingPlans} upcoming plan${gap.upcomingPlans === 1 ? " is" : "s are"} tagged that way.`,
          evidence: [`${gap.users} members`, `${gap.upcomingPlans} matching upcoming plans`],
          actions: [
            `Prompt a looking-for titled around ${gap.label}.`,
            "Retag existing nearby plans if they actually fit.",
          ],
          interestTag: gap.tag,
          userIds,
        },
        focus,
      ),
    );
  }

  const ghosting = idsWith("ghosting");
  if (ghosting.length >= 1) {
    suggestions.push(
      suggestion(
        {
          id: "ghosting",
          kind: "ghosting",
          severity: ghosting.length >= 4 ? "high" : "medium",
          title: "Going → drop-out pattern",
          why: `${ghosting.length} members drop Going often enough that plans look full then shrink. That trains hosts to stop posting.`,
          evidence: [`${store.listAllDropouts().filter((d) => d.fromState === "going").length} going-dropouts logged overall`],
          actions: [
            "Confirm 2h / day-before reminders are reaching these users.",
            "Follow up after a drop-out with a lighter interested-only ask next time.",
          ],
          userIds: ghosting,
        },
        focus,
      ),
    );
  }

  const lonelyHosts = idsWith("lonely_host");
  if (lonelyHosts.length >= 1) {
    suggestions.push(
      suggestion(
        {
          id: "lonely-hosts",
          kind: "host_health",
          severity: "high",
          title: "Hosts posting into empty rooms",
          why: `${lonelyHosts.length} repeat hosts keep landing with only themselves Going. Two empty posts and most people never host again.`,
          evidence: [`${firstHost} people have hosted at least once`],
          actions: [
            "Manually RSVP 2–3 warm members (with consent) onto their next plan.",
            "Coach toward recurring, smaller formats (weekly walk vs one-off party).",
          ],
          userIds: lonelyHosts,
        },
        focus,
      ),
    );
  }

  const frozenHosts = classified.filter((c) => {
    const hosted = idx.hostedByUser.get(c.user.id) ?? [];
    if (hosted.length === 0) return false;
    const lastHost = hosted.reduce((a, p) => (p.createdAt > a ? p.createdAt : a), hosted[0].createdAt);
    return lastHost < idx.since21;
  });
  if (frozenHosts.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "host-freeze",
          kind: "host_health",
          severity: "medium",
          title: "Host freeze",
          why: `${frozenHosts.length} people who used to host haven’t posted in 21+ days. Supply is usually a handful of hosts.`,
          evidence: [`${idx.upcomingPlans.length} upcoming plans on the whole board`],
          actions: [
            "Personal ask: ‘want to restage the thing you hosted last time?’",
            "Offer co-host so the lift is shared.",
          ],
          userIds: frozenHosts.map((c) => c.user.id),
        },
        focus,
      ),
    );
  }

  const lookingForEmpty = idx.upcomingPlans.filter((p) => {
    if ((p.planKind ?? "standard") !== "looking_for") return false;
    return store.listPlanSuggestions(p.id).length === 0;
  });
  if (lookingForEmpty.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "looking-for-silence",
          kind: "slow_feed",
          severity: "medium",
          title: "Looking-for posts with zero replies",
          why: `${lookingForEmpty.length} open looking-for cards have no thread replies. They occupy the feed without converting.`,
          evidence: lookingForEmpty.slice(0, 4).map((p) => p.title),
          actions: [
            "Reply as a helper with a concrete time/place suggestion.",
            "DM 2 members whose interests match the tags.",
          ],
          userIds: lookingForEmpty.map((p) => p.creatorId),
        },
        focus,
      ),
    );
  }

  const ghostPlans = idx.upcomingPlans.filter((p) => {
    const start = Date.parse(p.date);
    if (!Number.isFinite(start)) return false;
    const hours = (start - idx.todayMs) / (60 * 60 * 1000);
    if (hours > 48 || hours < 0) return false;
    return (idx.goingByPlan.get(p.id) ?? 0) <= 1;
  });
  if (ghostPlans.length >= 2) {
    suggestions.push(
      suggestion(
        {
          id: "underfilled-soon",
          kind: "plan_risk",
          severity: "high",
          title: "Plans in the next 48h with almost nobody Going",
          why: `${ghostPlans.length} upcoming plans are still host-only. They’ll cancel or train the host that Commons is empty.`,
          evidence: ghostPlans.slice(0, 5).map((p) => `${p.title} (${idx.hoodName.get(p.neighborhoodId) ?? p.neighborhoodId})`),
          actions: [
            "Push them in the in-app feed / weekend SMS for that hood.",
            "Ask 3 nearby members who match tags to tap Interested.",
          ],
          userIds: ghostPlans.map((p) => p.creatorId),
        },
        focus,
      ),
    );
  }

  const isolated = idsWith("isolated");
  if (isolated.length >= 3) {
    suggestions.push(
      suggestion(
        {
          id: "isolated-users",
          kind: "user_falloff",
          severity: "medium",
          title: "Socially isolated members",
          why: `${isolated.length} onboarded people have no network, no chats, and no Going RSVPs after a week.`,
          evidence: [`${classified.filter((c) => c.row.networkSize === 0).length} members have an empty network`],
          actions: [
            "Route them into a founding community or a small recurring plan.",
            "Post-plan network prompt only helps after they attend once — get them to one plan first.",
          ],
          userIds: isolated,
        },
        focus,
      ),
    );
  }

  const latestCohort = cohorts[cohorts.length - 1];
  const prevCohort = cohorts[cohorts.length - 2];
  if (latestCohort && prevCohort && latestCohort.signups >= 3 && prevCohort.signups >= 3) {
    const latestRsvp = latestCohort.signups ? latestCohort.everRsvped / latestCohort.signups : 0;
    const prevRsvp = prevCohort.signups ? prevCohort.everRsvped / prevCohort.signups : 0;
    if (prevRsvp - latestRsvp >= 0.2) {
      suggestions.push(
        suggestion(
          {
            id: "cohort-quality-drop",
            kind: "user_falloff",
            severity: "high",
            title: "Newest signup week is converting worse",
            why: `This week’s cohort RSVP’d at ${Math.round(latestRsvp * 100)}% vs ${Math.round(prevRsvp * 100)}% the week before.`,
            evidence: [
              `${latestCohort.weekStart}: ${latestCohort.signups} signups, ${latestCohort.everRsvped} RSVP’d`,
              `${prevCohort.weekStart}: ${prevCohort.signups} signups, ${prevCohort.everRsvped} RSVP’d`,
            ],
            actions: [
              "Check whether new users landed in barren hoods.",
              "Compare invite-code vs organic — quality of the first session matters more than volume.",
            ],
            userIds: classified
              .filter((c) => c.user.createdAt >= `${latestCohort.weekStart}T00:00:00.000Z`)
              .map((c) => c.user.id),
          },
          focus,
        ),
      );
    }
  }

  suggestions.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.userIds.length - a.userIds.length);

  const flaggedUsers = classified
    .map((c) => c.row)
    .filter((r) => r.segment !== "healthy")
    .sort((a, b) => {
      const ai = ["stuck_onboarding", "never_activated", "dormant", "early_falloff", "churn_risk", "slow_feed"].indexOf(
        a.segment,
      );
      const bi = ["stuck_onboarding", "never_activated", "dormant", "early_falloff", "churn_risk", "slow_feed"].indexOf(
        b.segment,
      );
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || (b.daysSinceActive ?? 0) - (a.daysSinceActive ?? 0);
    })
    .slice(0, 80);

  const briefParts: string[] = [];
  if (suggestions[0]) briefParts.push(suggestions[0].title + " — " + suggestions[0].actions[0]);
  if (suggestions[1]) briefParts.push(suggestions[1].title + " — " + suggestions[1].actions[0]);
  const brief =
    briefParts.length > 0
      ? `This week: ${briefParts.join(" ")} Funnel: ${fullyOnboarded}/${signedUp} finished setup, ${firstRsvp} RSVP’d, ${active7d} active in 7d.`
      : `Funnel looks quiet. ${fullyOnboarded}/${signedUp} finished setup, ${firstRsvp} RSVP’d, ${active7d} active in 7d. Seed supply in the thinnest hoods before spending on invites.`;

  return {
    generatedAt: new Date().toISOString(),
    brief,
    universe: {
      totalUsers: allUsers.length,
      verifiedUsers: verified.length,
      seedUsers: live.filter((u) => u.accountSource === "seed").length,
      ejectedUsers: allUsers.filter((u) => u.ejectedAt).length,
    },
    funnel: {
      signedUp,
      onboarded,
      fullyOnboarded,
      firstRsvp,
      firstGoing,
      firstHost,
      active7d,
      onboardPct: signedUp ? Math.round((1000 * onboarded) / signedUp) / 10 : 0,
      activationPct: fullyOnboarded ? Math.round((1000 * firstRsvp) / fullyOnboarded) / 10 : 0,
      goingPct: firstRsvp ? Math.round((1000 * firstGoing) / firstRsvp) / 10 : 0,
    },
    falloff: {
      stuckOnboarding: flagCount("stuck_onboarding"),
      neverActivated: flagCount("never_activated"),
      earlyFalloff: flagCount("early_falloff"),
      churnRisk: flagCount("churn_risk"),
      dormant: flagCount("dormant"),
      slowFeed: flagCount("slow_feed"),
      ghosting: flagCount("ghosting"),
      isolated: flagCount("isolated"),
    },
    feedHealth,
    interestGaps,
    cohorts,
    suggestions,
    flaggedUsers,
  };
}
