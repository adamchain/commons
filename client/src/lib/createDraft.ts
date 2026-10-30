import type { JoinType, PlanVisibility, VibeIcon } from "../types/shared";

export type CreateDraftPath = "plan" | "idea";

export type CreateDraft = {
  title: string;
  locationName: string;
  locationAddress: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string;
  neighborhoodId: string;
  date: string;
  time: string;
  isFlexibleTime: boolean;
  isFlexibleLocation: boolean;
  isFlexibleDate: boolean;
  isThisWeek: boolean;
  vibes: VibeIcon[];
  description: string;
  visibility: PlanVisibility;
  capacityOn: boolean;
  capacity: string;
  joinType: JoinType;
  recurrence: "none" | "weekly" | "biweekly" | "monthly";
  repeatDays: number[];
  flyerLinkUrl: string;
  chatEnabled: boolean;
  networkEveryone: boolean;
  markedFull: boolean;
};

const KEY = {
  plan: "commons.createDraft.plan.v1",
  idea: "commons.createDraft.idea.v1",
} as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isUsable(draft: CreateDraft): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.locationName.trim() ||
      draft.flyerLinkUrl.trim() ||
      draft.vibes.length > 0,
  );
}

export function loadCreateDraft(path: CreateDraftPath): CreateDraft | null {
  try {
    const raw = localStorage.getItem(KEY[path]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const date =
      typeof parsed.date === "string" && parsed.date >= todayIso() ? parsed.date : todayIso();
    const draft: CreateDraft = {
      title: typeof parsed.title === "string" ? parsed.title : "",
      locationName: typeof parsed.locationName === "string" ? parsed.locationName : "",
      locationAddress: typeof parsed.locationAddress === "string" ? parsed.locationAddress : "",
      locationLat: typeof parsed.locationLat === "number" ? parsed.locationLat : undefined,
      locationLng: typeof parsed.locationLng === "number" ? parsed.locationLng : undefined,
      locationPlaceId: typeof parsed.locationPlaceId === "string" ? parsed.locationPlaceId : undefined,
      neighborhoodId: typeof parsed.neighborhoodId === "string" ? parsed.neighborhoodId : "",
      date,
      time: typeof parsed.time === "string" ? parsed.time : "",
      isFlexibleTime: Boolean(parsed.isFlexibleTime),
      isFlexibleLocation: Boolean(parsed.isFlexibleLocation),
      isFlexibleDate: Boolean(parsed.isFlexibleDate),
      isThisWeek: Boolean(parsed.isThisWeek),
      vibes: Array.isArray(parsed.vibes) ? (parsed.vibes as VibeIcon[]) : [],
      description: typeof parsed.description === "string" ? parsed.description : "",
      visibility: parsed.visibility === "network" ? "network" : "everyone",
      capacityOn: Boolean(parsed.capacityOn),
      capacity: typeof parsed.capacity === "string" ? parsed.capacity : "6",
      joinType: parsed.joinType === "approve" ? "approve" : "open",
      recurrence:
        parsed.recurrence === "weekly" || parsed.recurrence === "biweekly" || parsed.recurrence === "monthly"
          ? parsed.recurrence
          : "none",
      repeatDays: Array.isArray(parsed.repeatDays) ? parsed.repeatDays.filter((n) => typeof n === "number") : [],
      flyerLinkUrl: typeof parsed.flyerLinkUrl === "string" ? parsed.flyerLinkUrl : "",
      chatEnabled: parsed.chatEnabled !== false,
      networkEveryone: Boolean(parsed.networkEveryone),
      markedFull: Boolean(parsed.markedFull),
    };
    return isUsable(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function saveCreateDraft(path: CreateDraftPath, draft: CreateDraft): void {
  try {
    if (!isUsable(draft)) {
      localStorage.removeItem(KEY[path]);
      return;
    }
    localStorage.setItem(KEY[path], JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearCreateDraft(path: CreateDraftPath): void {
  try {
    localStorage.removeItem(KEY[path]);
  } catch {
    /* ignore */
  }
}
