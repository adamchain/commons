import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  ImagePlus,
  Link2,
  MapPin,
  Pencil,
  Search,
  Users,
} from "lucide-react";
import { api, parseApiError } from "../api/http";
import { FLEXIBLE_DATE_PLACEHOLDER, thisWeekAnchorDate } from "../lib/planTime";
import { formatPlanDate, formatPlanTime, formatVenueAddressLine, normalizeHttpUrl } from "../lib/format";
import { Avatar } from "../components/Avatar";
import { PageLoading } from "../components/LoadingScreen";
import { AvatarCropModal } from "../components/AvatarCropModal";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useAuth } from "../context/AuthContext";
import type { NavFromState } from "../lib/navState";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import {
  clearCreateDraft,
  loadCreateDraft,
  saveCreateDraft,
  type CreateDraft,
  type CreateDraftPath,
} from "../lib/createDraft";
import { NumberPicker } from "../components/NumberPicker";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type PlanDTO,
  type PlanVisibility,
  type PublicUser,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Default plan time = now + 1 hour (rounded to the minute). */
const defaultPlanTime = (): string => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "HH:MM" for the current clock — used to block past times on today. */
const nowTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Recurrence cadence for the "Repeats" dropdown (Zoom-style). Maps to the
// existing `isRecurring` boolean on the plan; finer cadence is sent as
// `recurrence` for forward-compat.
type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

// Single-letter labels for the weekly day picker, indexed Sun..Sat to match
// Date.getDay().
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Cap the plan title — people were pasting whole paragraphs into the title
// field. Keep it to a glanceable headline and push the rest to the description.
// (The "Just an idea" form deliberately reuses `title` as a free-text area, so
// this cap applies only to the Make-a-plan title input.)
const MAX_PLAN_TITLE_LEN = 80;

// Day-of-week (0=Sun) for a YYYY-MM-DD string, parsed in local time to avoid
// the UTC-midnight off-by-one that `new Date("2026-06-23")` produces.
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

// Placeholder copy — pick one at random on mount (not on keystroke).
const IDEA_PLACEHOLDERS = [
  "Anyone down for a spontaneous dinner tonight?",
  "Thinking about hitting a yoga class this week...",
  "Would love to find a running buddy in Fishtown",
  "Anyone want to check out that new wine bar on Passyunk?",
];

export function CreatePlanPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { id: routePlanId } = useParams();
  const editingPlanId =
    routePlanId && location.pathname.endsWith("/edit") ? routePlanId : null;
  // "Host another like this →" on a past plan's card navigates here with
  // { hostAgainFrom: planId } in nav state — prefill from that plan below.
  const hostAgainFrom = (location.state as { hostAgainFrom?: string } | null)?.hostAgainFrom ?? null;
  // "Make this a plan" from an Interest Forum navigates here with
  // { fromForumTag: tag } — preselect that interest as the plan's vibe.
  const fromForumTag = (location.state as { fromForumTag?: string } | null)?.fromForumTag ?? null;
  const forumNav = (location.state as { forumNav?: NavFromState } | null)?.forumNav ?? null;
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  // "Do it again" seeds the title from a past plan, and carries that plan's
  // crew + group chat forward via fromPlanId (handled server-side on create).
  const prefillTitle = searchParams.get("title") ?? "";
  const prefillDescription = searchParams.get("desc") ?? "";
  const fromPlanId = searchParams.get("fromPlanId");
  const lockFromId = searchParams.get("lockFromId");
  const kindParam = searchParams.get("kind");
  const startAsIdea = kindParam === "idea";
  // 0.9 — arriving here to recreate a past plan (either "Host another like
  // this" or "Do it again") should send Back to that plan, not into a blank
  // New Plan flow.
  const backToSourceId = hostAgainFrom ?? lockFromId ?? fromPlanId ?? null;
  const prefillTagParam = searchParams.get("tag");
  const inviteUserId = searchParams.get("inviteUser");
  const inviteUserName = searchParams.get("inviteName");
  // Plural variant from the chat-to-plan re-plan flow — seeds multiple
  // invitees at once. inviteNames is parallel to inviteUserIds.
  const inviteUserIdsParam = searchParams.get("inviteUserIds") ?? "";
  const inviteUserIds = useMemo(
    () => inviteUserIdsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteUserIdsParam],
  );
  const inviteNamesParam = searchParams.get("inviteNames") ?? "";
  const inviteNames = useMemo(
    () => inviteNamesParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteNamesParam],
  );
  // Community "Post a plan" / chat → create. Name is passed for an instant
  // header banner (same pattern as inviteNames from group chat).
  const communityId = searchParams.get("communityId");
  const communityNameParam = searchParams.get("communityName");
  // Hub "Post a new event" — come back to that community's Events tab, not the feed.
  // Remember the id in a ref: /plans/new often stays mounted, so a mid-form URL
  // change must not drop the return. Router state covers the same case if the
  // query string is replaced. A fresh create (no community) clears it.
  const hubEventsReturnId = useRef<string | null>(null);
  const hubEventsFromState =
    (location.state as { hubEventsReturnId?: string } | null)?.hubEventsReturnId ?? null;
  if (searchParams.get("returnTo") === "events" && communityId) {
    hubEventsReturnId.current = communityId;
  } else if (hubEventsFromState) {
    hubEventsReturnId.current = hubEventsFromState;
  } else if (!communityId) {
    hubEventsReturnId.current = null;
  }
  const returnToCommunityEvents = Boolean(hubEventsReturnId.current);
  const prefillVibe: VibeIcon | null = useMemo(() => {
    if (!prefillTagParam) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === prefillTagParam);
    return opt?.id ?? null;
  }, [prefillTagParam]);

  const forumVibe: VibeIcon | null = useMemo(() => {
    if (!fromForumTag) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === fromForumTag);
    return opt?.id ?? null;
  }, [fromForumTag]);

  // Interests start empty so the host consciously tags the plan — pre-checking
  // their onboarding interests led to mis-tagged plans. A prefill from Explore
  // (e.g. a venue's vibe) or "Make this a plan" from a forum still seeds a
  // single tag.
  const defaultVibes = useMemo<VibeIcon[]>(() => {
    if (forumVibe) return [forumVibe];
    if (prefillVibe) return [prefillVibe];
    return [];
  }, [forumVibe, prefillVibe]);

  const [form, setForm] = useState({
    title: prefillTitle,
    locationName: prefillName,
    locationAddress: prefillAddress,
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    locationPlaceId: undefined as string | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: defaultPlanTime(),
    isFlexibleTime: startAsIdea,
    isFlexibleLocation: startAsIdea,
    isFlexibleDate: startAsIdea,
    isThisWeek: false,
    vibes: defaultVibes,
    description: prefillDescription,
    visibility: (inviteUserId || inviteUserIds.length > 0 ? "network" : "everyone") as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    recurrence: "none" as Recurrence,
    // Weekdays (0=Sun) the plan repeats on, Zoom-style. Seeded from the start
    // date; only used when recurrence is weekly/biweekly.
    repeatDays: [weekdayOf(today())] as number[],
    flyerDataUrl: null as string | null,
    flyerAttachmentDataUrl: null as string | null,
    flyerLinkUrl: "",
    flyerLinkPreview: null as null | {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    },
    chatEnabled: true,
    networkEveryone: false,
    markedFull: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editReady, setEditReady] = useState(!editingPlanId && !lockFromId);
  const originalWhen = useRef<{
    date: string;
    time: string;
    isFlexibleTime: boolean;
    isFlexibleDate: boolean;
    isThisWeek?: boolean;
  } | null>(null);
  type Path = CreateDraftPath;
  const [path, setPath] = useState<Path>(startAsIdea ? "idea" : "plan");
  useEffect(() => {
    if (kindParam === "idea") setPath("idea");
    else if (kindParam === "plan") setPath("plan");
  }, [kindParam]);

  const skipDraft =
    Boolean(editingPlanId) ||
    Boolean(lockFromId) ||
    Boolean(hostAgainFrom) ||
    Boolean(fromPlanId) ||
    Boolean(communityId) ||
    Boolean(inviteUserId) ||
    inviteUserIds.length > 0 ||
    Boolean(fromForumTag) ||
    Boolean(prefillTitle) ||
    Boolean(prefillDescription) ||
    Boolean(prefillName);
  const restoredForPath = useRef<Path | null>(null);
  useEffect(() => {
    if (skipDraft) return;
    if (restoredForPath.current === path) return;
    restoredForPath.current = path;
    const draft = loadCreateDraft(path);
    if (!draft) return;
    setForm((f) => ({
      ...f,
      ...draft,
      flyerDataUrl: f.flyerDataUrl,
      flyerAttachmentDataUrl: f.flyerAttachmentDataUrl,
      flyerLinkPreview: f.flyerLinkPreview,
    }));
  }, [path, skipDraft]);
  useEffect(() => {
    if (skipDraft) return;
    const t = window.setTimeout(() => {
      const draft: CreateDraft = {
        title: form.title,
        locationName: form.locationName,
        locationAddress: form.locationAddress,
        locationLat: form.locationLat,
        locationLng: form.locationLng,
        locationPlaceId: form.locationPlaceId,
        neighborhoodId: form.neighborhoodId,
        date: form.date,
        time: form.time,
        isFlexibleTime: form.isFlexibleTime,
        isFlexibleLocation: form.isFlexibleLocation,
        isFlexibleDate: form.isFlexibleDate,
        isThisWeek: form.isThisWeek,
        vibes: form.vibes,
        description: form.description,
        visibility: form.visibility,
        capacityOn: form.capacityOn,
        capacity: form.capacity,
        joinType: form.joinType,
        recurrence: form.recurrence,
        repeatDays: form.repeatDays,
        flyerLinkUrl: form.flyerLinkUrl,
        chatEnabled: form.chatEnabled,
        networkEveryone: form.networkEveryone,
        markedFull: form.markedFull,
      };
      saveCreateDraft(path, draft);
    }, 400);
    return () => window.clearTimeout(t);
  }, [form, path, skipDraft]);

  const navigate = useNavigate();

  const leaveCreatePlan = () => {
    if (editingPlanId) {
      navigate(`/plans/${editingPlanId}`);
      return;
    }
    if (backToSourceId) {
      navigate(`/plans/${backToSourceId}`);
      return;
    }
    if (fromForumTag) {
      navigate(`/forums/${fromForumTag}`, {
        state: forumNav ?? { from: "messages", messagesTab: "interests" },
      });
      return;
    }
    const hubId = hubEventsReturnId.current;
    if (hubId) {
      navigate(`/communities/${hubId}?tab=events`);
      return;
    }
    if (communityId) {
      navigate(`/communities/${communityId}`);
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const backFromForm = () => {
    if (backToSourceId) {
      navigate(`/plans/${backToSourceId}`);
      return;
    }
    if (fromForumTag) {
      navigate(`/forums/${fromForumTag}`, {
        state: forumNav ?? { from: "messages", messagesTab: "interests" },
      });
      return;
    }
    if (communityId) {
      leaveCreatePlan();
      return;
    }
    leaveCreatePlan();
  };
  // Replan source — read live from the URL / nav state on every submit so a
  // leftover "Do it again" id can't stick around after navigating to a fresh
  // /plans/new (same route often doesn't remount, so useState would go stale).
  const replanFromId = hostAgainFrom ?? fromPlanId;
  const [network, setNetwork] = useState<PublicUser[] | null>(null);

  // Community tagging — when arriving from a community's "Post a plan" button
  // (?communityId=…), the plan is tagged to that community and the host picks
  // whether it's public (feed + community) or community-only.
  const [pickedCommunityId] = useState<string | null>(communityId);
  const effectiveCommunityId = pickedCommunityId ?? communityId;
  const [communityName, setCommunityName] = useState<string | null>(
    communityNameParam?.trim() || null,
  );
  const [communityVisibility, setCommunityVisibility] = useState<"public" | "community_only">(
    "public",
  );
  useEffect(() => {
    if (!effectiveCommunityId) return;
    let alive = true;
    api<{ name: string }>(`/api/communities/${effectiveCommunityId}`)
      .then((c) => {
        if (alive) setCommunityName(c.name);
      })
      .catch(() => {
        /* tag still sends; banner just won't show a name */
      });
    return () => {
      alive = false;
    };
  }, [effectiveCommunityId]);

  useEffect(() => {
    if (path === "idea") window.scrollTo(0, 0);
  }, [path]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    if (inviteUserId) seed.add(inviteUserId);
    for (const id of inviteUserIds) seed.add(id);
    return seed;
  });
  const [lockCrew, setLockCrew] = useState<PublicUser[]>([]);
  const flyerRef = useRef<HTMLInputElement>(null);
  // Open the photo choices immediately — an extra tap on an empty hero was
  // easy to miss, and a plan without a photo rarely gets a look.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showCoverLib, setShowCoverLib] = useState(false);

  // F.6 — inline "what's missing" guidance. Errors only render once the host
  // has actually tried to post, so the form doesn't nag while they're still
  // filling it out.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const locationCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLLabelElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const capacityRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Always load the user's network once — needed for both the
    // "Inviting [name]" seeded flow and the hand-pick picker inside the
    // Your Network visibility option.
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

  const seededOutsideNetwork = useMemo(() => {
    if (!inviteUserId || !inviteUserName || !network) return null;
    if (network.some((u) => u.id === inviteUserId)) return null;
    return { id: inviteUserId, firstName: inviteUserName };
  }, [inviteUserId, inviteUserName, network]);

  const toggleInvited = (id: string) => {
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const inviteNetwork = useMemo(() => {
    const seen = new Set<string>();
    const out: PublicUser[] = [];
    for (const u of [...lockCrew, ...(network ?? [])]) {
      if (!u.id || seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
    }
    return out;
  }, [lockCrew, network]);

  useEffect(() => {
    const first = user?.neighborhoodIds?.[0] ?? user?.neighborhoodId;
    if (first && !form.neighborhoodId) {
      setForm((f) => ({ ...f, neighborhoodId: first }));
    }
  }, [user, form.neighborhoodId]);

  // "Host another like this" — prefill the form from the past plan, but
  // never carry its (now-past) date/time forward. Prefer router state, but
  // fall back to ?fromPlanId= so a lost state still seeds the form.
  useEffect(() => {
    const seedId = hostAgainFrom ?? fromPlanId;
    if (!seedId || editingPlanId || lockFromId) return;
    let alive = true;
    void api<PlanDTO>(`/api/plans/${seedId}`)
      .then((prev) => {
        if (!alive) return;
        const vibeIds = Array.from(
          new Set(VIBE_OPTIONS.filter((o) => prev.tags.includes(o.tag)).map((o) => o.id)),
        );
        setForm((f) => ({
          ...f,
          title: prev.title,
          locationName: prev.isFlexibleLocation ? "" : prev.location.name,
          locationAddress: prev.isFlexibleLocation ? "" : prev.location.address,
          locationLat: prev.isFlexibleLocation ? undefined : prev.location.lat,
          locationLng: prev.isFlexibleLocation ? undefined : prev.location.lng,
          locationPlaceId: prev.isFlexibleLocation ? undefined : prev.location.placeId,
          neighborhoodId: prev.neighborhoodId || f.neighborhoodId,
          isFlexibleLocation: false,
          vibes: vibeIds.length ? vibeIds : f.vibes,
          description: prev.description ?? "",
          visibility: inviteUserId || inviteUserIds.length > 0 ? "network" : prev.visibility,
          capacityOn: prev.capacity !== null,
          capacity: prev.capacity !== null ? String(prev.capacity) : f.capacity,
          joinType: prev.joinType,
          flyerDataUrl: prev.flyerDataUrl ?? null,
          flyerAttachmentDataUrl: prev.flyerAttachmentDataUrl ?? null,
          chatEnabled: prev.chatEnabled !== false,
        }));
        setPath("plan");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hostAgainFrom, fromPlanId, inviteUserId, inviteUserIds, editingPlanId, lockFromId]);

  useEffect(() => {
    if (!editingPlanId || !user) return;
    let alive = true;
    setEditReady(false);
    void api<PlanDTO>(`/api/plans/${editingPlanId}`)
      .then((prev) => {
        if (!alive) return;
        if (user && prev.creator.id !== user.id) {
          navigate(`/plans/${editingPlanId}`, { replace: true });
          return;
        }
        const vibeIds = Array.from(
          new Set(VIBE_OPTIONS.filter((o) => prev.tags.includes(o.tag)).map((o) => o.id)),
        );
        const proposal = prev.pendingTimeProposal;
        const flexDate = Boolean(prev.isFlexibleDate) || prev.date.startsWith("2099-12-31");
        const formFlexTime = Boolean(proposal?.isFlexibleTime ?? prev.isFlexibleTime);
        const formFlexDate = proposal
          ? proposal.date.startsWith("2099-12-31")
          : flexDate;
        originalWhen.current = {
          date: flexDate ? FLEXIBLE_DATE_PLACEHOLDER : prev.date.slice(0, 10),
          time: prev.time || "",
          isFlexibleTime: Boolean(prev.isFlexibleTime),
          isFlexibleDate: flexDate,
          isThisWeek: Boolean(prev.isThisWeek) && !flexDate,
        };
        setForm((f) => ({
          ...f,
          title: prev.title,
          locationName: prev.isFlexibleLocation ? "" : prev.location.name,
          locationAddress: prev.isFlexibleLocation ? "" : prev.location.address,
          locationLat: prev.isFlexibleLocation ? undefined : prev.location.lat,
          locationLng: prev.isFlexibleLocation ? undefined : prev.location.lng,
          locationPlaceId: prev.isFlexibleLocation ? undefined : prev.location.placeId,
          neighborhoodId: prev.neighborhoodId || f.neighborhoodId,
          date: formFlexDate ? today() : (proposal?.date ?? prev.date).slice(0, 10),
          time: formFlexTime ? defaultPlanTime() : (proposal?.time || prev.time || defaultPlanTime()),
          isFlexibleTime: formFlexTime,
          isFlexibleDate: formFlexDate,
          isThisWeek: Boolean(prev.isThisWeek) && !formFlexDate,
          isFlexibleLocation: Boolean(prev.isFlexibleLocation),
          vibes: vibeIds.length ? vibeIds : f.vibes,
          description: prev.description ?? "",
          visibility: prev.visibility,
          capacityOn: prev.capacity !== null,
          capacity: prev.capacity !== null ? String(prev.capacity) : f.capacity,
          joinType: prev.joinType,
          flyerDataUrl: prev.flyerDataUrl ?? null,
          flyerAttachmentDataUrl: prev.flyerAttachmentDataUrl ?? null,
          flyerLinkUrl: prev.flyerLinkUrl ?? "",
          flyerLinkPreview: prev.flyerLinkPreview ?? null,
          chatEnabled: prev.chatEnabled !== false,
          markedFull: prev.markedFull === true,
        }));
        if (prev.capacity !== null || prev.flyerLinkUrl) setShowMore(true);
        setPath("plan");
        setEditReady(true);
      })
      .catch(() => {
        if (alive) {
          setError("Couldn't load that plan.");
          setEditReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [editingPlanId, user, navigate]);

  useEffect(() => {
    if (!lockFromId || !user) return;
    let alive = true;
    setEditReady(false);
    void api<PlanDTO>(`/api/plans/${lockFromId}`)
      .then((prev) => {
        if (!alive) return;
        if (prev.creator.id !== user.id || prev.lockedAt) {
          navigate(`/plans/${lockFromId}`, { replace: true });
          return;
        }
        const vibeIds = Array.from(
          new Set(VIBE_OPTIONS.filter((o) => prev.tags.includes(o.tag)).map((o) => o.id)),
        );
        const flexDate = Boolean(prev.isFlexibleDate) || prev.date.startsWith("2099-12-31");
        setForm((f) => ({
          ...f,
          title: prev.title,
          locationName: prev.isFlexibleLocation ? "" : prev.location.name,
          locationAddress: prev.isFlexibleLocation ? "" : prev.location.address,
          locationLat: prev.isFlexibleLocation ? undefined : prev.location.lat,
          locationLng: prev.isFlexibleLocation ? undefined : prev.location.lng,
          locationPlaceId: prev.isFlexibleLocation ? undefined : prev.location.placeId,
          neighborhoodId: prev.neighborhoodId || f.neighborhoodId,
          date: flexDate ? today() : prev.date.slice(0, 10),
          time: prev.isFlexibleTime ? defaultPlanTime() : (prev.time || defaultPlanTime()),
          isFlexibleTime: false,
          isFlexibleDate: false,
          isThisWeek: false,
          isFlexibleLocation: false,
          vibes: vibeIds.length ? vibeIds : f.vibes,
          description: prev.description ?? "",
          visibility: prev.visibility,
          capacityOn: prev.capacity !== null,
          capacity: prev.capacity !== null ? String(prev.capacity) : f.capacity,
          joinType: prev.joinType,
          flyerDataUrl: prev.flyerDataUrl ?? null,
          flyerAttachmentDataUrl: prev.flyerAttachmentDataUrl ?? null,
          chatEnabled: prev.chatEnabled !== false,
        }));
        const crew = [
          ...prev.participants.going,
          ...prev.participants.interested,
        ].filter((p) => p.id !== user.id);
        setLockCrew(crew);
        setInvitedIds((ids) => {
          const next = new Set(ids);
          for (const p of crew) next.add(p.id);
          return next;
        });
        if (prev.capacity !== null) setShowMore(true);
        setPath("plan");
        setEditReady(true);
      })
      .catch(() => {
        if (alive) {
          setError("Couldn't load that idea.");
          setEditReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [lockFromId, user, navigate]);

  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  // A "looking for" plan = at least one of date/time/location is flexible.
  // We derive planKind from the flex toggles rather than asking up-front.
  const planKind = form.isFlexibleDate || form.isThisWeek || form.isFlexibleTime || form.isFlexibleLocation
    ? "looking_for"
    : "standard";

  // Block past dates/times outright — no +15-min grace. Derived (not state)
  // so it re-evaluates live as the host edits; re-checked on submit.
  // F.6 — a wholly missing date folds into this same inline message rather
  // than only surfacing in a bottom banner.
  const dateError = lockFromId && (!form.date || form.isFlexibleDate)
    ? "Pick a day to lock in."
    : !form.isFlexibleDate && !form.date
    ? "Add a day or mark it flexible."
    : !form.isFlexibleDate && form.date && form.date < today()
      ? "Pick today or a future date."
      : null;
  // Exact time/location are the default path — Flexible is opt-in, so an
  // empty field without that toggle is an error (not an implied flexible).
  const timeError = lockFromId && (form.isFlexibleTime || !form.time)
    ? "Pick a time to lock in."
    : !dateError && !form.isFlexibleDate && !form.isFlexibleTime && !form.time
    ? "Add a time or mark it flexible."
    : !dateError && !form.isFlexibleDate && !form.isFlexibleTime && form.date === today() && form.time
      ? form.time < nowTime()
        ? "That time is in the past — pick a later time."
        : null
      : null;
  const locationError = lockFromId && !form.locationName.trim()
    ? "Add a venue to lock in."
    : !form.isFlexibleLocation && !form.locationName.trim()
    ? "Add a location or mark it flexible."
    : null;
  const capacityNum = form.capacityOn ? Number(form.capacity) : null;
  const capacityError =
    capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)
      ? "Enter a number of spots, or turn off the limit."
      : null;
  const titleError = !form.title.trim() ? "Give your plan a title." : null;
  const photoError = path !== "idea" && !form.flyerDataUrl ? "A photo is required." : null;

  // F.6 — flag exactly what's missing inline, next to the field, and scroll
  // it into view, instead of leaving the host to guess from a generic bottom
  // banner (or a Post button that's mysteriously disabled).
  const validate = (): boolean => {
    setError(null);
    setAttemptedSubmit(true);
    if (photoError) {
      document.getElementById("create-plan-cover")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (titleError) {
      titleInputRef.current?.focus();
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (locationError) {
      locationCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (dateError || timeError) {
      dateCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (capacityError) {
      setShowMore(true);
      setTimeout(() => capacityRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return false;
    }
    return true;
  };

  // Req 6.8 — on failure, the form/draft is left exactly as the host typed
  // it (we never clear `form`), and postPlan can be re-invoked from the
  // error banner's Retry button without re-entering anything.
  const postPlan = async () => {
    if (
      form.visibility === "network" &&
      !form.networkEveryone &&
      invitedIds.size === 0 &&
      (network?.length ?? 0) > 0
    ) {
      setAttemptedSubmit(true);
      setError("Pick who in your network should see this, or share with everyone.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api<{ id: string; title?: string }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          // Only send a profile/default hood when set — Flexible location and
          // typed venues must not hard-depend on an unset/orphan profile field.
          // Server resolves legacy ids and infers from venue coords when needed.
          neighborhoodId: form.neighborhoodId || undefined,
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
            lat: form.locationLat,
            lng: form.locationLng,
            placeId: form.locationPlaceId,
          },
          date: form.isFlexibleDate ? FLEXIBLE_DATE_PLACEHOLDER : form.isThisWeek ? thisWeekAnchorDate() : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleDate: form.isFlexibleDate,
          isThisWeek: Boolean(form.isThisWeek) && !form.isFlexibleDate,
          isFlexibleLocation: form.isFlexibleLocation,
          tags: resolvedTags,
          description: form.description.trim() || undefined,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          planKind,
          // "Make a plan with X" (single seeded person) co-creates — they show
          // as a co-host rather than just getting an invite.
          coHostIds: inviteUserId ? [inviteUserId] : undefined,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: capacityNum !== null && form.joinType === "approve" ? "approve" : "open",
          isRecurring: form.recurrence !== "none",
          recurrence: form.recurrence,
          repeatDays:
            form.recurrence === "weekly" || form.recurrence === "biweekly"
              ? form.repeatDays
              : undefined,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
          flyerAttachmentDataUrl: form.flyerAttachmentDataUrl ?? undefined,
          flyerLinkUrl: normalizeHttpUrl(form.flyerLinkUrl),
          flyerLinkPreview: form.flyerLinkPreview ?? undefined,
          // Only when this screen was opened as "Do it again" / host-again.
          fromPlanId: replanFromId || undefined,
          communityId: effectiveCommunityId ?? undefined,
          communityVisibility: effectiveCommunityId ? communityVisibility : undefined,
          chatEnabled: form.chatEnabled,
          audienceUserIds:
            form.visibility === "network" && !form.networkEveryone ? [...invitedIds] : undefined,
        }),
      });
      // The co-host (seeded inviteUser) is already added server-side — don't
      // also fire a plain invite at them.
      const inviteList = [...invitedIds].filter((id) => id !== inviteUserId);
      if (inviteList.length > 0) {
        try {
          await api(`/api/plans/${created.id}/invite`, {
            method: "POST",
            body: JSON.stringify({ userIds: inviteList }),
          });
        } catch {
          /* best-effort — user can invite again from the plan */
        }
      }
      // Hub posts stay on that community's Events tab. Everywhere else lands
      // on the feed with a "you're live" success sheet.
      clearCreateDraft(path);
      const hubId = hubEventsReturnId.current || (returnToCommunityEvents ? effectiveCommunityId : null);
      if (hubId) {
        navigate(`/communities/${hubId}?tab=events`, { replace: true });
      } else {
        navigate("/", {
          state: {
            justPostedId: created.id,
            justPostedTitle: created.title || form.title.trim(),
            showPostSuccess: true,
          },
        });
      }
    } catch (err) {
      setError(parseApiError(err) || "Couldn't post — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const savePlan = async () => {
    if (!editingPlanId) return;
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/plans/${editingPlanId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          tags: resolvedTags,
          neighborhoodId: form.neighborhoodId || undefined,
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
            lat: form.locationLat,
            lng: form.locationLng,
          },
          isFlexibleLocation: form.isFlexibleLocation,
          isFlexibleDate: form.isFlexibleDate,
          isThisWeek: Boolean(form.isThisWeek) && !form.isFlexibleDate,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: capacityNum !== null && form.joinType === "approve" ? "approve" : "open",
          flyerDataUrl: form.flyerDataUrl ?? null,
          flyerAttachmentDataUrl: form.flyerAttachmentDataUrl ?? null,
          flyerLinkUrl: normalizeHttpUrl(form.flyerLinkUrl) ?? null,
          flyerLinkPreview: form.flyerLinkPreview ?? null,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          chatEnabled: form.chatEnabled,
          markedFull: form.markedFull,
        }),
      });
      const nextDate = form.isFlexibleDate ? FLEXIBLE_DATE_PLACEHOLDER : form.date;
      const nextTime = form.isFlexibleTime || form.isFlexibleDate ? "" : form.time;
      const nextFlexTime = form.isFlexibleTime || form.isFlexibleDate;
      const prev = originalWhen.current;
      const whenChanged =
        !prev ||
        prev.date !== nextDate ||
        prev.time !== nextTime ||
        prev.isFlexibleTime !== nextFlexTime ||
        prev.isFlexibleDate !== form.isFlexibleDate ||
        Boolean(prev.isThisWeek) !== Boolean(form.isThisWeek);
      if (whenChanged) {
        await api(`/api/plans/${editingPlanId}/propose-time`, {
          method: "POST",
          body: JSON.stringify({
            date: nextDate,
            time: nextTime,
            isFlexibleTime: nextFlexTime,
          }),
        });
        await api(`/api/plans/${editingPlanId}/apply-time`, { method: "POST" });
      }
      const inviteList = [...invitedIds];
      if (inviteList.length > 0) {
        try {
          await api(`/api/plans/${editingPlanId}/invite`, {
            method: "POST",
            body: JSON.stringify({ userIds: inviteList }),
          });
        } catch {
          /* already on the plan, or they can invite from detail */
        }
      }
      navigate(`/plans/${editingPlanId}`);
    } catch (err) {
      setError(parseApiError(err) || "Couldn't save — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const lockPlan = async () => {
    if (!lockFromId) return;
    if (
      form.visibility === "network" &&
      !form.networkEveryone &&
      invitedIds.size === 0 &&
      (network?.length ?? 0) > 0
    ) {
      setAttemptedSubmit(true);
      setError("Pick who in your network should see this, or share with everyone.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/plans/${lockFromId}/lock`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          tags: resolvedTags,
          neighborhoodId: form.neighborhoodId || undefined,
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
            lat: form.locationLat,
            lng: form.locationLng,
            placeId: form.locationPlaceId,
          },
          date: form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: capacityNum !== null && form.joinType === "approve" ? "approve" : "open",
          flyerDataUrl: form.flyerDataUrl ?? null,
          flyerAttachmentDataUrl: form.flyerAttachmentDataUrl ?? null,
          flyerLinkUrl: normalizeHttpUrl(form.flyerLinkUrl) ?? null,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          inviteUserIds: [...invitedIds],
          audienceUserIds:
            form.visibility === "network" && !form.networkEveryone ? [...invitedIds] : undefined,
          chatEnabled: form.chatEnabled,
        }),
      });
      navigate(`/plans/${lockFromId}`);
    } catch (err) {
      setError(parseApiError(err) || "Couldn't lock this in — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const runSubmit = async () => {
    if (!validate()) return;
    if (lockFromId) await lockPlan();
    else if (editingPlanId) await savePlan();
    else await postPlan();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void runSubmit();
  };

  const retry = () => void runSubmit();

  const toggleVibe = (id: VibeIcon) => {
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(id)
        ? prev.vibes.filter((v) => v !== id)
        : prev.vibes.length >= 3
          ? prev.vibes
          : [...prev.vibes, id],
    }));
  };

  const onFlyerPick = (file: File) => {
    fileToResizedDataUrl(file, 1600, 0.9)
      .then(setCropSrc)
      .catch(() => setError("Couldn't read that image. Try another."));
  };

  const openFlyerPicker = async () => {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1600, quality: 0.9 });
        if (dataUrl) setCropSrc(dataUrl);
      } catch {
        /* user canceled */
      }
      return;
    }
    flyerRef.current?.click();
  };

  const coverCrop = cropSrc ? (
    <AvatarCropModal
      src={cropSrc}
      shape="rect"
      aspect={3 / 2}
      stageMax={420}
      outputPx={1200}
      title="Position your cover"
      subtitle="This is the shape of the plan cover."
      onCancel={() => setCropSrc(null)}
      onConfirm={(dataUrl) => {
        setForm((f) => ({ ...f, flyerDataUrl: dataUrl }));
        setCropSrc(null);
      }}
    />
  ) : null;

  // Event flyer/poster — an optional full image shown on the plan, separate
  // from the cover. Kept uncropped so portrait posters keep their shape.
  const flyerAttachmentRef = useRef<HTMLInputElement>(null);
  const setFlyerAttachment = (dataUrl: string) =>
    setForm((f) => ({ ...f, flyerAttachmentDataUrl: dataUrl }));
  const onFlyerAttachmentPick = (file: File) => {
    fileToResizedDataUrl(file, 1600, 0.9)
      .then(setFlyerAttachment)
      .catch(() => setError("Couldn't read that image. Try another."));
  };
  const openFlyerAttachmentPicker = async () => {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1600, quality: 0.9 });
        if (dataUrl) setFlyerAttachment(dataUrl);
      } catch {
        /* user canceled */
      }
      return;
    }
    flyerAttachmentRef.current?.click();
  };

  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const fetchLinkPreview = async (rawUrl: string) => {
    setLinkError(null);
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }));
      return;
    }
    // Tolerate "example.com" without a scheme.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setLinkBusy(true);
    try {
      const preview = await api<{
        url: string;
        title?: string;
        description?: string;
        image?: string;
        siteName?: string;
      }>("/api/link-preview", {
        method: "POST",
        body: JSON.stringify({ url: withScheme }),
      });
      setForm((f) => ({
        ...f,
        flyerLinkUrl: preview.url,
        flyerLinkPreview: {
          title: preview.title,
          description: preview.description,
          image: preview.image,
          siteName: preview.siteName,
        },
      }));
    } catch {
      setLinkError(
        "We couldn't load a preview of this page. Your link is still saved. Some sites don't let us read them.",
      );
      setForm((f) => ({ ...f, flyerLinkUrl: withScheme, flyerLinkPreview: null }));
    } finally {
      setLinkBusy(false);
    }
  };

  if ((editingPlanId || lockFromId) && !editReady) {
    return (
      <PageLoading onBack={leaveCreatePlan} />
    );
  }

  if (editingPlanId && editReady && !originalWhen.current) {
    return (
      <main className="app-shell app-shell--mid">
        <header className="app-header app-header--minimal app-header--sticky">
          <button type="button" className="back-circle" aria-label="Back" onClick={leaveCreatePlan}>
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <p className="error-text">{error ?? "Couldn't load that plan."}</p>
      </main>
    );
  }

  const isIdea = path === "idea";

  // Idea path renders a stripped-down form (single text input + a couple of
  // collapsed optional disclosures). The full-form path below is the standard
  // "Make a plan" experience.
  if (isIdea) {
    return (
      <>
        <IdeaForm
          form={form}
          setForm={setForm}
          submit={submit}
          retry={retry}
          submitting={submitting}
          error={error}
          attemptedSubmit={attemptedSubmit}
          toggleVibe={toggleVibe}
          onBack={backFromForm}
          onOpenLibrary={() => setShowCoverLib(true)}
          onOpenFlyer={() => void openFlyerPicker()}
          onClearFlyer={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
          onOpenFlyerAttachment={() => void openFlyerAttachmentPicker()}
          onClearFlyerAttachment={() => setForm((f) => ({ ...f, flyerAttachmentDataUrl: null }))}
          onFetchLink={fetchLinkPreview}
          linkBusy={linkBusy}
          linkError={linkError}
          inviteUserName={inviteUserName}
          inviteNames={inviteNames}
          invitedCount={invitedIds.size}
          network={network}
          invitedIds={invitedIds}
          onToggleInvited={toggleInvited}
          communityId={effectiveCommunityId}
          communityName={communityName}
          communityVisibility={communityVisibility}
          onCommunityVisibilityChange={setCommunityVisibility}
          arrive={Boolean(editingPlanId || lockFromId)}
        />
        <input
          ref={flyerRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFlyerPick(f);
            if (flyerRef.current) flyerRef.current.value = "";
          }}
        />
        <input
          ref={flyerAttachmentRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFlyerAttachmentPick(file);
            if (flyerAttachmentRef.current) flyerAttachmentRef.current.value = "";
          }}
        />
        {showCoverLib && (
          <CoverLibraryModal
            onPick={(url) => {
              setForm((f) => ({ ...f, flyerDataUrl: url }));
              setShowCoverLib(false);
            }}
          onClose={() => setShowCoverLib(false)}
        />
        )}
        {coverCrop}
      </>
    );
  }

  const essentialsDone = [
    form.title.trim(),
    form.isFlexibleLocation || form.locationName.trim(),
    form.isFlexibleDate || Boolean(form.date),
  ].filter(Boolean).length;

  return (
    <main className={`app-shell app-shell--wide plan-detail-page plan-detail-page--create plan-builder${editingPlanId || lockFromId ? " page-arrive" : ""}`}>
      <header className="create-plan-topbar plan-builder-header">
        <button type="button" className="back-circle" aria-label="Back" onClick={leaveCreatePlan}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="plan-builder-heading">
          <span>{editingPlanId ? "Edit plan" : lockFromId ? "Lock it in" : "New plan"}</span>
          <strong>{editingPlanId ? "Update the details" : "Build your plan"}</strong>
        </div>
      </header>
      <form id="create-plan-form" onSubmit={submit}>
      <div id="create-plan-cover" className={`plan-detail-hero${form.flyerDataUrl ? "" : " plan-detail-hero--empty"}`}>
        {form.flyerDataUrl && <img src={form.flyerDataUrl} alt="" />}
        {form.flyerDataUrl ? (
          <button type="button" className="plan-builder-edit-cover" onClick={() => setShowCoverLib(true)}>
            <ImagePlus size={17} /> Change cover
          </button>
        ) : (
          <div className="plan-builder-cover-empty">
            <button type="button" className="plan-builder-edit-cover" onClick={() => setShowCoverLib(true)}>
              <ImagePlus size={17} /> Add a cover
            </button>
            <button type="button" className="plan-builder-upload-cover" onClick={() => void openFlyerPicker()}>
              Upload a photo
            </button>
          </div>
        )}
        <input
          ref={flyerRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFlyerPick(f);
            if (flyerRef.current) flyerRef.current.value = "";
          }}
        />
      </div>
      {attemptedSubmit && photoError && (
        <p className="luma-inline-error create-plan-photo-error">{photoError}</p>
      )}

      <div className="plan-detail-body">
      {(inviteUserId && inviteUserName) || inviteNames.length > 0 || lockFromId ? (
        <div className="create-plan-invite-banner" role="note">
          {lockFromId ? (
            <>
              Locking in this idea
              {lockCrew.length > 0 ? (
                <>
                  {" "}· Inviting{" "}
                  <strong>{lockCrew[0].firstName}</strong>
                  {lockCrew.length > 1 ? ` + ${lockCrew.length - 1} more` : ""}{" "}
                  who showed interest
                </>
              ) : (
                <> · Anyone interested comes along</>
              )}
            </>
          ) : (
            <>
          Inviting{" "}
          <strong>
            {inviteUserName ?? inviteNames[0]}
          </strong>
          {(() => {
            const total = invitedIds.size;
            const extras = total - 1;
            return extras > 0 ? ` + ${extras} more` : "";
          })()}{" "}
          once you post ·{" "}
          {form.visibility === "network"
            ? form.networkEveryone
              ? "Visible to your network"
              : "Visible only to the people you pick"
            : "Visible to everyone on COMMONS"}
            </>
          )}
        </div>
      ) : null}

      {effectiveCommunityId ? (
        <div className="create-plan-invite-banner" role="note">
          Posting to{" "}
          <strong>{communityName ?? "your community"}</strong>
          {" "}members ·{" "}
          {communityVisibility === "community_only"
            ? "Members only"
            : "On the feed"}
        </div>
      ) : null}

      {fromForumTag ? (
        <div className="create-plan-invite-banner" role="note">
          Tagged{" "}
          <strong>{VIBE_OPTIONS.find((o) => o.tag === fromForumTag)?.label ?? fromForumTag}</strong>
          {" "}— that crowd will see it.
        </div>
      ) : null}

        {effectiveCommunityId ? (
          <div className="create-community-tag">
            <div className="seg-toggle" role="group" aria-label="Community visibility">
              <button
                type="button"
                className={`seg-toggle-btn ${communityVisibility === "public" ? "is-active" : ""}`}
                onClick={() => setCommunityVisibility("public")}
                aria-pressed={communityVisibility === "public"}
              >
                Public
              </button>
              <button
                type="button"
                className={`seg-toggle-btn ${communityVisibility === "community_only" ? "is-active" : ""}`}
                onClick={() => setCommunityVisibility("community_only")}
                aria-pressed={communityVisibility === "community_only"}
              >
                Community only
              </button>
            </div>
            <p className="create-community-tag-hint">
              {communityVisibility === "public"
                ? "On the feed."
                : "Just members."}
            </p>
          </div>
        ) : null}

        <section className="plan-detail-title-row plan-detail-title-box">
          <label className="plan-builder-label" htmlFor="title">Plan name</label>
          <input
            id="title"
            ref={titleInputRef}
            className="plan-detail-title plan-detail-title-input"
            placeholder="Give your plan a name"
            value={form.title}
            maxLength={MAX_PLAN_TITLE_LEN}
            aria-invalid={Boolean(attemptedSubmit && titleError)}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, MAX_PLAN_TITLE_LEN) }))}
          />
          {form.title.length >= MAX_PLAN_TITLE_LEN - 15 && (
            <p className="plan-title-hint">
              {MAX_PLAN_TITLE_LEN - form.title.length === 0
                ? "That's the limit — keep the title short and add the rest below."
                : `${MAX_PLAN_TITLE_LEN - form.title.length} characters left — save the details for the description.`}
            </p>
          )}
          {attemptedSubmit && titleError && <p className="luma-inline-error">{titleError}</p>}
        </section>

        <section className="plan-detail-card plan-detail-card--composer plan-builder-desc">
          <label className="plan-builder-label" htmlFor="description">Description</label>
          <textarea
            id="description"
            className="plan-detail-desc-input"
            placeholder="Add a description — vibes, what to bring, who it's for…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </section>

        <div
          ref={locationCardRef}
          className="plan-summary-card"
          aria-invalid={Boolean(attemptedSubmit && (locationError || dateError || timeError)) || undefined}
        >
          <div className="plan-when-pair">
            <label ref={dateCardRef} className="plan-when-field">
              <span className="plan-summary-icon" aria-hidden="true"><CalendarDays size={18} /></span>
              <span className="plan-when-copy">
                <small>Date</small>
                <strong className={form.isFlexibleDate || !form.date ? "is-placeholder" : undefined}>
                  {form.isFlexibleDate
                    ? form.isThisWeek
                      ? "This week"
                      : "Pick a day"
                    : form.date
                      ? formatPlanDate(form.date)
                      : "Pick a day"}
                </strong>
              </span>
              <input
                ref={dateInputRef}
                id="date"
                className="plan-meta-native-input"
                type="date"
                min={today()}
                value={form.isFlexibleDate ? "" : form.date}
                aria-invalid={Boolean(dateError)}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  // Hard guard: never accept a past date even if the native
                  // `min` is bypassed on some pickers.
                  if (!nextDate || nextDate < today()) return;
                  setForm((f) => ({ ...f, date: nextDate, isFlexibleDate: false, isThisWeek: false }));
                }}
              />
            </label>
            <label className="plan-when-field">
              <span className="plan-summary-icon" aria-hidden="true"><Clock size={18} /></span>
              <span className="plan-when-copy">
                <small>Time</small>
                <strong className={form.isFlexibleTime || !form.time ? "is-placeholder" : undefined}>
                  {form.isFlexibleTime || !form.time
                    ? "Pick a time"
                    : formatPlanTime(form.time, false)}
                </strong>
              </span>
              <input
                ref={timeInputRef}
                id="time"
                className="plan-meta-native-input"
                type="time"
                min={!form.isFlexibleDate && form.date === today() ? nowTime() : undefined}
                value={form.time}
                aria-invalid={Boolean(timeError)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setForm((f) => ({ ...f, time: e.target.value, isFlexibleTime: false }));
                }}
              />
            </label>
          </div>
          <div className="plan-summary-row plan-summary-row--place">
            <span className="plan-summary-icon" aria-hidden="true"><MapPin size={20} /></span>
            <span className="plan-summary-place">
              <small>Location</small>
              <LocationAutocomplete
                name={form.locationName}
                address={form.locationAddress}
                placeholder="Add a venue"
                onChange={(v) => {
                  setForm((f) => ({
                    ...f,
                    locationName: v.name,
                    locationAddress: v.address,
                    locationLat: v.lat,
                    locationLng: v.lng,
                    isFlexibleLocation: false,
                  }));
                }}
              />
              {formatVenueAddressLine(form.locationName, form.locationAddress) ? (
                <em>{formatVenueAddressLine(form.locationName, form.locationAddress)}</em>
              ) : null}
            </span>
            <Pencil size={17} aria-hidden="true" />
          </div>
        </div>
        {(attemptedSubmit && locationError) || dateError || timeError ? (
          <p className="luma-inline-error">{locationError || dateError || timeError}</p>
        ) : null}

        <section className="plan-builder-completion" aria-label="Plan essentials">
          <div>
            <span>Plan essentials</span>
            <strong>{essentialsDone} of 3 complete</strong>
          </div>
          <i><b style={{ width: `${(essentialsDone / 3) * 100}%` }} /></i>
        </section>

        <section className="plan-builder-card">
          <div className="plan-builder-card-head">
            <h2>Help people find it</h2>
            <p>Choose up to three interests that fit this plan.</p>
          </div>
          <div className="vibe-grid">
            {VIBE_OPTIONS.map((opt) => {
              const selected = form.vibes.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`vibe-tile ${selected ? "is-selected" : ""}`}
                  onClick={() => toggleVibe(opt.id)}
                  aria-pressed={selected}
                >
                  <span className="vibe-tile-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="plan-builder-card">
          <div className="plan-builder-card-head">
            <h2>Visibility</h2>
            <p>Choose who can see this plan.</p>
          </div>
          <div className="vis-pill-toggle" role="group" aria-label="Visibility">
            <button
              type="button"
              className={`vis-pill ${form.visibility === "everyone" ? "is-active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
              aria-pressed={form.visibility === "everyone"}
            >
              <Globe size={15} strokeWidth={1.8} aria-hidden="true" />
              Everyone
            </button>
            <button
              type="button"
              className={`vis-pill ${form.visibility === "network" ? "is-active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, visibility: "network", networkEveryone: false }))}
              aria-pressed={form.visibility === "network"}
            >
              <Users size={15} strokeWidth={1.8} aria-hidden="true" />
              My network
            </button>
          </div>
          {form.visibility === "network" && (
            <div className="settings-handpick">
              <NetworkHandPick
                network={inviteNetwork}
                invitedIds={invitedIds}
                onToggle={toggleInvited}
                everyone={form.networkEveryone}
                onEveryone={() => setForm((f) => ({ ...f, networkEveryone: !f.networkEveryone }))}
              />
            </div>
          )}
        </section>

        <button
          type="button"
          className="plan-optional-toggle"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore}
        >
          <span>
            <strong>Optional details</strong>
            <small>Add context without slowing down posting.</small>
          </span>
          <ChevronDown className={showMore ? "is-open" : ""} size={20} />
        </button>

        <div className="plan-optional-list" hidden={!showMore}>
            {!lockFromId ? (
              <>
                <div className="plan-optional-row">
                  <span>
                    <strong>Flexible date</strong>
                    <small>{form.isFlexibleDate ? "Anytime is fine" : "Locked to a day"}</small>
                  </span>
                  <FlexToggle
                    variant="switch"
                    active={form.isFlexibleDate}
                    label="Flexible date"
                    onClick={() =>
                      setForm((f) => {
                        const next = !f.isFlexibleDate;
                        return next
                          ? { ...f, isFlexibleDate: true, isThisWeek: false }
                          : {
                              ...f,
                              isFlexibleDate: false,
                              isThisWeek: false,
                              date:
                                f.date && f.date >= today() && f.date !== FLEXIBLE_DATE_PLACEHOLDER
                                  ? f.date
                                  : today(),
                            };
                      })
                    }
                  />
                </div>
                <div className="plan-optional-row">
                  <span>
                    <strong>Flexible time</strong>
                    <small>{form.isFlexibleTime ? "Time stays open" : "Locked to a time"}</small>
                  </span>
                  <FlexToggle
                    variant="switch"
                    active={form.isFlexibleTime}
                    label="Flexible time"
                    onClick={() =>
                      setForm((f) => {
                        const next = !f.isFlexibleTime;
                        return next
                          ? { ...f, isFlexibleTime: true }
                          : { ...f, isFlexibleTime: false, time: f.time || defaultPlanTime() };
                      })
                    }
                  />
                </div>
                <div className="plan-optional-row">
                  <span>
                    <strong>Flexible location</strong>
                    <small>{form.isFlexibleLocation ? "Decide the spot later" : "Venue is set"}</small>
                  </span>
                  <FlexToggle
                    variant="switch"
                    active={form.isFlexibleLocation}
                    label="Flexible location"
                    onClick={() =>
                      setForm((f) => {
                        const next = !f.isFlexibleLocation;
                        return next
                          ? {
                              ...f,
                              isFlexibleLocation: true,
                              locationName: "",
                              locationAddress: "",
                              locationLat: undefined,
                              locationLng: undefined,
                              locationPlaceId: undefined,
                            }
                          : { ...f, isFlexibleLocation: false };
                      })
                    }
                  />
                </div>
              </>
            ) : null}

            <div className="plan-optional-row" ref={capacityRowRef}>
              <span>
                <strong>Capacity</strong>
                <small>{form.capacityOn ? `${form.capacity} spots` : "No limit"}</small>
              </span>
              <FlexToggle
                variant="switch"
                active={form.capacityOn}
                label="Set a capacity"
                onClick={(e) => {
                  e.preventDefault();
                  setForm((f) => ({ ...f, capacityOn: !f.capacityOn }));
                }}
              />
            </div>
            {form.capacityOn && (
              <div className="plan-optional-extra">
                <NumberPicker
                  value={Number(form.capacity) || 0}
                  onChange={(n) => setForm((f) => ({ ...f, capacity: String(n) }))}
                  ariaLabel="Number of spots"
                />
                {attemptedSubmit && capacityError && (
                  <p className="luma-inline-error">{capacityError}</p>
                )}
                <div className="plan-optional-row plan-optional-row--nested">
                  <span>
                    <strong>Approve who joins</strong>
                    <small>
                      {form.joinType === "approve"
                        ? "People tap Interested. You let them in."
                        : "People tap Join until it's full."}
                    </small>
                  </span>
                  <FlexToggle
                    active={form.joinType === "approve"}
                    variant="switch"
                    label="Approve who joins"
                    onClick={(e) => {
                      e.preventDefault();
                      setForm((f) => ({ ...f, joinType: f.joinType === "approve" ? "open" : "approve" }));
                    }}
                  />
                </div>
              </div>
            )}

            {editingPlanId && (
              <div className="plan-optional-row">
                <span>
                  <strong>Mark as full</strong>
                  <small>
                    {form.markedFull
                      ? "Join is closed. Anyone who isn't going comes off now."
                      : "Close Join anytime."}
                  </small>
                </span>
                <FlexToggle
                  active={form.markedFull}
                  variant="switch"
                  label="Mark as full"
                  onClick={(e) => {
                    e.preventDefault();
                    setForm((f) => ({ ...f, markedFull: !f.markedFull }));
                  }}
                />
              </div>
            )}

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Repeats</strong>
                <small>
                  {form.recurrence === "none"
                    ? "Doesn't repeat"
                    : form.recurrence === "weekly"
                      ? "Weekly"
                      : form.recurrence === "biweekly"
                        ? "Every 2 weeks"
                        : "Monthly"}
                </small>
              </span>
              <div className="plan-optional-pills" role="group" aria-label="Repeats">
                {([
                  ["none", "Never"],
                  ["weekly", "Weekly"],
                  ["biweekly", "2 weeks"],
                  ["monthly", "Monthly"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={form.recurrence === value ? "is-selected" : ""}
                    onClick={() => setForm((f) => ({ ...f, recurrence: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(form.recurrence === "weekly" || form.recurrence === "biweekly") && (
                <div className="repeat-days plan-optional-days" role="group" aria-label="Repeats on">
                  {DAY_LABELS.map((label, i) => {
                    const on = form.repeatDays.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={on ? "repeat-day is-active" : "repeat-day"}
                        aria-pressed={on}
                        aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            repeatDays: f.repeatDays.includes(i)
                              ? f.repeatDays.filter((d) => d !== i)
                              : [...f.repeatDays, i].sort((a, b) => a - b),
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Link</strong>
                <small>{form.flyerLinkPreview?.title || form.flyerLinkUrl || "Add a link"}</small>
              </span>
              <span className="plan-optional-icon" aria-hidden="true"><Link2 size={16} /></span>
              <input
                id="flyer-link"
                className="plan-optional-input"
                type="url"
                placeholder="https://…"
                value={form.flyerLinkUrl}
                onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
                onBlur={(e) => void fetchLinkPreview(e.target.value)}
                disabled={linkBusy}
              />
              {linkBusy && <p className="form-help">Loading preview…</p>}
              {linkError && <p className="link-preview-notice" role="status">{linkError}</p>}
              {form.flyerLinkPreview && (
                <div className="link-preview link-preview--form">
                  {form.flyerLinkPreview.image && (
                    <img src={form.flyerLinkPreview.image} alt="" className="link-preview-image" />
                  )}
                  <div className="link-preview-body">
                    {form.flyerLinkPreview.siteName && (
                      <div className="link-preview-site">{form.flyerLinkPreview.siteName}</div>
                    )}
                    {form.flyerLinkPreview.title && (
                      <div className="link-preview-title">{form.flyerLinkPreview.title}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Flyer</strong>
                <small>{form.flyerAttachmentDataUrl ? "Attached" : "Optional poster for the plan"}</small>
              </span>
              {form.flyerAttachmentDataUrl ? (
                <div className="plan-optional-flyer">
                  <img src={form.flyerAttachmentDataUrl} alt="Flyer preview" />
                  <div>
                    <button type="button" onClick={() => void openFlyerAttachmentPicker()}>Replace</button>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, flyerAttachmentDataUrl: null }))}>Remove</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="plan-optional-add"
                  onClick={() => void openFlyerAttachmentPicker()}
                >
                  <span className="plan-optional-icon" aria-hidden="true"><ImagePlus size={16} /></span>
                  Upload a flyer
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
              <input
                ref={flyerAttachmentRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFlyerAttachmentPick(file);
                  if (flyerAttachmentRef.current) flyerAttachmentRef.current.value = "";
                }}
              />
            </div>
        </div>

        <section className="plan-builder-settings">
          <div>
            <span>
              <strong>Open joining</strong>
              <small>Anyone can join immediately.</small>
            </span>
            <FlexToggle
              variant="switch"
              active={form.joinType !== "approve"}
              label={form.joinType === "approve" ? "Off" : "On"}
              onClick={(e) => {
                e.preventDefault();
                setForm((f) => ({ ...f, joinType: f.joinType === "approve" ? "open" : "approve" }));
              }}
            />
          </div>
          <div>
            <span>
              <strong>Group chat</strong>
              <small>Opens when the plan is posted.</small>
            </span>
            <FlexToggle
              variant="switch"
              active={form.chatEnabled}
              label={form.chatEnabled ? "On" : "Off"}
              onClick={(e) => {
                e.preventDefault();
                setForm((f) => ({ ...f, chatEnabled: !f.chatEnabled }));
              }}
            />
          </div>
        </section>

        {inviteUserId && (
          <section className="plan-builder-card">
            <label className="plan-builder-label">Invite from your network</label>
            <p className="form-help">
              {inviteUserName ? <><strong>{inviteUserName}</strong> is already in.</> : "Anyone else?"}
            </p>
            {network === null && <p className="form-help">Loading…</p>}
            {network !== null && network.length === 0 && !seededOutsideNetwork && (
              <p className="form-help">Still empty — you can post anyway.</p>
            )}
            {(network && network.length > 0) || seededOutsideNetwork ? (
              <div className="invite-people-list">
                {seededOutsideNetwork && (
                  <button
                    type="button"
                    className="invite-person is-picked"
                    disabled
                    aria-pressed
                  >
                    <Avatar seed={seededOutsideNetwork.id} style="avataaars" name={seededOutsideNetwork.firstName} size="sm" />
                    <span className="invite-person-name">{seededOutsideNetwork.firstName}</span>
                    <span className="invite-person-check">✓</span>
                  </button>
                )}
                {network?.map((u) => {
                  const picked = invitedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`invite-person ${picked ? "is-picked" : ""}`}
                      onClick={() => toggleInvited(u.id)}
                      aria-pressed={picked}
                    >
                      <Avatar
                        seed={u.avatarSeed}
                        style={u.avatarStyle}
                        photoDataUrl={u.avatarPhotoDataUrl}
                        params={u.avatarParams}
                        name={u.firstName}
                        size="sm"
                      />
                      <span className="invite-person-name">{u.firstName}</span>
                      {picked && <span className="invite-person-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        )}

        {error && (
          <div className="form-error-banner">
            <p className="error-text">{error}</p>
            <button type="button" className="btn-link" onClick={retry} disabled={submitting}>
              Try again
            </button>
          </div>
        )}

        {!effectiveCommunityId && !editingPlanId ? (
          <p className="create-communities-footer">
            <strong>Communities</strong>{" "}
            <Link to="/communities" className="visibility-option-pill">
              Explore →
            </Link>
            <br />
            Run clubs, book clubs, recurring crews.
          </p>
        ) : null}
      </div>

        <div className="lock-in-cta-bar lock-in-cta-bar--flush">
          <button type="submit" className="btn-primary btn-block" disabled={submitting}>
            {submitting
              ? editingPlanId
                ? "Saving…"
                : lockFromId
                  ? "Locking in…"
                  : "Posting…"
              : editingPlanId
                ? "Save"
                : lockFromId
                  ? "Lock it in"
                  : "Preview and post"}
          </button>
        </div>
      </form>

      {showCoverLib && (
        <CoverLibraryModal
          onPick={(url) => {
            setForm((f) => ({ ...f, flyerDataUrl: url }));
            setShowCoverLib(false);
          }}
          onClose={() => setShowCoverLib(false)}
        />
      )}
      {coverCrop}
    </main>
  );
}

type FormShape = {
  title: string;
  locationName: string;
  locationAddress: string;
  locationLat: number | undefined;
  locationLng: number | undefined;
  locationPlaceId: string | undefined;
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
  recurrence: Recurrence;
  repeatDays: number[];
  flyerDataUrl: string | null;
  flyerAttachmentDataUrl: string | null;
  flyerLinkUrl: string;
  flyerLinkPreview: null | {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
  chatEnabled: boolean;
  /** Network posts start as a hand-picked list. True shares with the whole network. */
  networkEveryone: boolean;
  markedFull: boolean;
};

/**
 * Just an Idea form — Figma builder: prompt, optional cover, interests, audience.
 */
function IdeaForm({
  form,
  setForm,
  submit,
  retry,
  submitting,
  error,
  attemptedSubmit,
  toggleVibe,
  onBack,
  onOpenLibrary,
  onOpenFlyer,
  onClearFlyer,
  onOpenFlyerAttachment,
  onClearFlyerAttachment,
  onFetchLink,
  linkBusy,
  linkError,
  inviteUserName,
  inviteNames,
  invitedCount,
  network,
  invitedIds,
  onToggleInvited,
  communityId,
  communityName,
  communityVisibility,
  onCommunityVisibilityChange,
  arrive = false,
}: {
  form: FormShape;
  setForm: (updater: (f: FormShape) => FormShape) => void;
  submit: (event?: FormEvent) => void;
  retry: () => void;
  submitting: boolean;
  error: string | null;
  attemptedSubmit: boolean;
  toggleVibe: (id: VibeIcon) => void;
  onBack: () => void;
  onOpenLibrary: () => void;
  onOpenFlyer: () => void;
  onClearFlyer: () => void;
  onOpenFlyerAttachment: () => void;
  onClearFlyerAttachment: () => void;
  onFetchLink: (rawUrl: string) => Promise<void>;
  linkBusy: boolean;
  linkError: string | null;
  inviteUserName: string | null;
  inviteNames: string[];
  invitedCount: number;
  network: PublicUser[] | null;
  invitedIds: Set<string>;
  onToggleInvited: (id: string) => void;
  communityId: string | null;
  communityName: string | null;
  communityVisibility: "public" | "community_only";
  onCommunityVisibilityChange: (v: "public" | "community_only") => void;
  arrive?: boolean;
}) {
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * IDEA_PLACEHOLDERS.length));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ideaDateRef = useRef<HTMLInputElement>(null);
  const ideaTimeRef = useRef<HTMLInputElement>(null);
  const dateMode: "specific" | "week" | "anytime" = form.isThisWeek
    ? "week"
    : form.isFlexibleDate
      ? "anytime"
      : "specific";

  const openIdeaCalendar = () => {
    const input = ideaDateRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      /* showPicker can throw if the input isn't ready */
    }
    input.focus();
    input.click();
  };

  const selectDateMode = (mode: "specific" | "week" | "anytime") => {
    if (mode === "specific") {
      setForm((f) => ({
        ...f,
        isFlexibleDate: false,
        isThisWeek: false,
        date: f.date && f.date >= today() && f.date !== FLEXIBLE_DATE_PLACEHOLDER ? f.date : today(),
      }));
      window.setTimeout(openIdeaCalendar, 80);
      return;
    }
    if (mode === "week") {
      setForm((f) => ({
        ...f,
        isFlexibleDate: false,
        isThisWeek: true,
        date: thisWeekAnchorDate(),
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      isFlexibleDate: true,
      isThisWeek: false,
      date: today(),
    }));
  };

  useEffect(() => {
    if (attemptedSubmit && !form.title.trim()) {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptedSubmit]);

  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const titleMissing = attemptedSubmit && !form.title.trim();

  return (
    <main className={`app-shell app-shell--mid idea-form-page idea-builder${arrive ? " page-arrive" : ""}`}>
      <header className="idea-form-header plan-builder-header">
        <button type="button" className="back-circle" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="plan-builder-heading">
          <span>Just an idea</span>
          <strong>See who&apos;s down</strong>
        </div>
      </header>

      <form id="idea-form" onSubmit={submit} className="idea-form">
        <div className="idea-form-scroll">
          {(inviteUserName || inviteNames.length > 0) && (
            <div className="create-plan-invite-banner" role="note">
              Inviting{" "}
              <strong>{inviteUserName ?? inviteNames[0]}</strong>
              {invitedCount > 1 ? ` + ${invitedCount - 1} more` : ""} once you post
            </div>
          )}

          {communityId ? (
            <div className="create-plan-invite-banner" role="note">
              Posting to{" "}
              <strong>{communityName ?? "your community"}</strong>
              {" "}members ·{" "}
              {communityVisibility === "community_only"
                ? "Members only"
                : "On the feed"}
            </div>
          ) : null}
          {communityId ? (
            <div className="create-community-tag">
              <div className="seg-toggle" role="group" aria-label="Community visibility">
                <button
                  type="button"
                  className={`seg-toggle-btn ${communityVisibility === "public" ? "is-active" : ""}`}
                  onClick={() => onCommunityVisibilityChange("public")}
                  aria-pressed={communityVisibility === "public"}
                >
                  Public
                </button>
                <button
                  type="button"
                  className={`seg-toggle-btn ${communityVisibility === "community_only" ? "is-active" : ""}`}
                  onClick={() => onCommunityVisibilityChange("community_only")}
                  aria-pressed={communityVisibility === "community_only"}
                >
                  Community only
                </button>
              </div>
              <p className="create-community-tag-hint">
                {communityVisibility === "public"
                  ? "On the feed."
                  : "Just members."}
              </p>
            </div>
          ) : null}

          <section className="idea-builder-prompt">
            <div>
              <span>Your idea</span>
              <small>Keep it casual. You can make it a plan later.</small>
            </div>
            <textarea
              ref={textareaRef}
              className="idea-textarea"
              placeholder={IDEA_PLACEHOLDERS[placeholderIdx]}
              value={form.title}
              aria-invalid={titleMissing}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              rows={5}
            />
          </section>
          {titleMissing && <p className="luma-inline-error">Add a few words about the idea.</p>}

          <section className="plan-optional-wrap">
          <button
            type="button"
            className="plan-optional-toggle"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
          >
            <span>
              <strong>Optional details</strong>
              <small>When, venue, link, flyer, and category.</small>
            </span>
            <ChevronDown className={detailsOpen ? "is-open" : ""} size={20} />
          </button>
          {detailsOpen ? (
          <div className="plan-optional-list">
            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>When</strong>
                <small>
                  {dateMode === "specific"
                    ? form.date
                      ? formatPlanDate(form.date)
                      : "Pick a day"
                    : dateMode === "week"
                      ? "Sometime this week"
                      : "Anytime"}
                </small>
              </span>
              <select
                className="plan-optional-input plan-optional-select"
                aria-label="When"
                value={dateMode}
                onChange={(e) => selectDateMode(e.target.value as "specific" | "week" | "anytime")}
              >
                <option value="specific">A day</option>
                <option value="week">This week</option>
                <option value="anytime">Anytime</option>
              </select>
              {dateMode === "specific" && (
                <div className="plan-when-pair plan-when-pair--nested">
                  <label className="plan-when-field">
                    <span className="plan-optional-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                    <span className="plan-when-copy">
                      <small>Date</small>
                      <strong className={!form.date ? "is-placeholder" : undefined}>
                        {form.date ? formatPlanDate(form.date) : "Pick a day"}
                      </strong>
                    </span>
                    <input
                      ref={ideaDateRef}
                      className="plan-meta-native-input"
                      type="date"
                      min={today()}
                      value={form.date}
                      onChange={(e) => {
                        if (!e.target.value || e.target.value < today()) return;
                        setForm((f) => ({ ...f, date: e.target.value, isFlexibleDate: false, isThisWeek: false }));
                      }}
                    />
                  </label>
                  <label className="plan-when-field">
                    <span className="plan-optional-icon" aria-hidden="true"><Clock size={16} /></span>
                    <span className="plan-when-copy">
                      <small>Time</small>
                      <strong className={form.isFlexibleTime || !form.time ? "is-placeholder" : undefined}>
                        {form.isFlexibleTime || !form.time
                          ? "Pick a time"
                          : formatPlanTime(form.time, false)}
                      </strong>
                    </span>
                    <input
                      ref={ideaTimeRef}
                      className="plan-meta-native-input"
                      type="time"
                      value={form.time}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setForm((f) => ({ ...f, time: e.target.value, isFlexibleTime: false }));
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Venue</strong>
                <small>{form.isFlexibleLocation ? "Anywhere is fine" : form.locationName || "Add a venue"}</small>
              </span>
              <span className="plan-optional-icon" aria-hidden="true"><MapPin size={16} /></span>
              <div className="plan-optional-venue">
                <LocationAutocomplete
                  name={form.locationName}
                  address={form.locationAddress}
                  placeholder="Add a venue"
                  onChange={(v) => {
                    setForm((f) => ({
                      ...f,
                      locationName: v.name,
                      locationAddress: v.address,
                      locationLat: v.lat,
                      locationLng: v.lng,
                      isFlexibleLocation: !v.name.trim(),
                    }));
                  }}
                />
                {formatVenueAddressLine(form.locationName, form.locationAddress) ? (
                  <em>{formatVenueAddressLine(form.locationName, form.locationAddress)}</em>
                ) : null}
              </div>
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Link</strong>
                <small>{form.flyerLinkPreview?.title || form.flyerLinkUrl || "Add a link"}</small>
              </span>
              <span className="plan-optional-icon" aria-hidden="true"><Link2 size={16} /></span>
              <input
                className="plan-optional-input"
                type="url"
                placeholder="https://…"
                value={form.flyerLinkUrl}
                onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
                onBlur={(e) => void onFetchLink(e.target.value)}
                disabled={linkBusy}
              />
              {linkBusy && <p className="form-help">Loading preview…</p>}
              {linkError && <p className="link-preview-notice" role="status">{linkError}</p>}
              {form.flyerLinkPreview && (
                <div className="link-preview link-preview--form">
                  {form.flyerLinkPreview.image && (
                    <img src={form.flyerLinkPreview.image} alt="" className="link-preview-image" />
                  )}
                  <div className="link-preview-body">
                    {form.flyerLinkPreview.siteName && (
                      <div className="link-preview-site">{form.flyerLinkPreview.siteName}</div>
                    )}
                    {form.flyerLinkPreview.title && (
                      <div className="link-preview-title">{form.flyerLinkPreview.title}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Flyer</strong>
                <small>{form.flyerAttachmentDataUrl ? "Attached" : "Optional poster"}</small>
              </span>
              {form.flyerAttachmentDataUrl ? (
                <div className="plan-optional-flyer">
                  <img src={form.flyerAttachmentDataUrl} alt="Flyer preview" />
                  <div>
                    <button type="button" onClick={onOpenFlyerAttachment}>Replace</button>
                    <button type="button" onClick={onClearFlyerAttachment}>Remove</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="plan-optional-add" onClick={onOpenFlyerAttachment}>
                  <span className="plan-optional-icon" aria-hidden="true"><ImagePlus size={16} /></span>
                  Upload a flyer
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="plan-optional-row plan-optional-row--stack">
              <span>
                <strong>Category</strong>
                <small>Choose up to three interests.</small>
              </span>
              <div className="vibe-grid" role="group" aria-label="Interest tags">
                {VIBE_OPTIONS.map((opt) => {
                  const selected = form.vibes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`vibe-tile ${selected ? "is-selected" : ""}`}
                      onClick={() => toggleVibe(opt.id)}
                      aria-pressed={selected}
                    >
                      <span className="vibe-tile-label">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          ) : null}
          </section>

          <section id="create-plan-cover" className="idea-builder-cover">
            {form.flyerDataUrl ? (
              <div className="idea-builder-cover-preview">
                <img src={form.flyerDataUrl} alt="" />
                <button type="button" onClick={onOpenLibrary}>
                  <ImagePlus size={17} /> Change cover
                </button>
                <button type="button" className="idea-builder-cover-remove" onClick={onClearFlyer}>
                  Remove
                </button>
              </div>
            ) : coverPickerOpen ? (
              <div className="cover-picker idea-cover-picker">
                <span className="cover-picker-title">Add a cover photo</span>
                <div className="cover-picker-buttons">
                  <button type="button" className="cover-btn" onClick={onOpenLibrary}>
                    <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
                    Library
                  </button>
                  <button type="button" className="cover-btn" onClick={onOpenFlyer}>
                    Upload
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="idea-builder-add-cover"
                onClick={() => setCoverPickerOpen(true)}
              >
                <span><ImagePlus size={21} /></span>
                <span>
                  <strong>Add a cover</strong>
                  <small>Optional, but helpful for discovery.</small>
                </span>
                <ChevronRight size={18} />
              </button>
            )}
          </section>

          <section className="plan-builder-card">
            <div className="plan-builder-card-head">
              <h2>Visibility</h2>
              <p>Choose who can see this idea.</p>
            </div>
            <div className="vis-pill-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`vis-pill ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                <Globe size={15} strokeWidth={1.8} aria-hidden="true" />
                Everyone
              </button>
              <button
                type="button"
                className={`vis-pill ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network", networkEveryone: false }))}
                aria-pressed={form.visibility === "network"}
              >
                <Users size={15} strokeWidth={1.8} aria-hidden="true" />
                My network
              </button>
            </div>
            {form.visibility === "network" && (
              <div className="settings-handpick">
                <NetworkHandPick
                  network={network}
                  invitedIds={invitedIds}
                  onToggle={onToggleInvited}
                  everyone={form.networkEveryone}
                  onEveryone={() => setForm((f) => ({ ...f, networkEveryone: !f.networkEveryone }))}
                />
              </div>
            )}
          </section>

          <section className="plan-builder-settings">
            <div>
              <span>
                <strong>Group chat</strong>
                <small>People can talk once they&apos;re interested.</small>
              </span>
              <FlexToggle
                variant="switch"
                active={form.chatEnabled}
                label={form.chatEnabled ? "On" : "Off"}
                onClick={(e) => {
                  e.preventDefault();
                  setForm((f) => ({ ...f, chatEnabled: !f.chatEnabled }));
                }}
              />
            </div>
          </section>

          <section className="idea-builder-make-real">
            <span className="idea-builder-make-real-icon"><CalendarDays size={21} /></span>
            <span>
              <strong>Easy to make real later</strong>
              <small>Add a date and place when enough people are interested.</small>
            </span>
          </section>

          {error && (
            <div className="form-error-banner">
              <p className="error-text">{error}</p>
              <button type="button" className="btn-link" onClick={retry} disabled={submitting}>
                Try again
              </button>
            </div>
          )}
        </div>
        <div
          className="idea-form-cta"
          style={keyboardInset > 0 ? { paddingBottom: 16 + keyboardInset } : undefined}
        >
          <button type="submit" className="btn btn-primary btn-block idea-primary-cta" disabled={submitting}>
            {submitting ? "Posting…" : "Put it out there"}
          </button>
        </div>
      </form>
    </main>
  );
}

function NetworkHandPick({
  network,
  invitedIds,
  onToggle,
  everyone = false,
  onEveryone,
}: {
  network: PublicUser[] | null;
  invitedIds: Set<string>;
  onToggle: (id: string) => void;
  everyone?: boolean;
  onEveryone?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!network) return [];
    const q = query.trim().toLowerCase();
    if (!q) return network;
    return network.filter((u) => {
      const full = `${u.firstName} ${u.lastName ?? ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [network, query]);

  if (network === null) {
    return <p className="form-help" style={{ marginTop: 8 }}>Loading your network…</p>;
  }
  if (network.length === 0) {
    return (
      <div className="network-empty-prompt" style={{ marginTop: 8 }}>
        <p className="form-help" style={{ marginTop: 0, marginBottom: 10 }}>
          Still just you — invite someone, or post anyway.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/invite" className="btn-pill-accent" style={{ textDecoration: "none" }}>
            Invite friends
          </Link>
          <Link to="/search" className="btn-pill-ghost" style={{ textDecoration: "none" }}>
            Find people
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="plan-network-pick">
      {onEveryone && (
        <button
          type="button"
          className={`plan-network-all ${everyone ? "is-on" : ""}`}
          onClick={onEveryone}
          aria-pressed={everyone}
        >
          <span>
            <strong>Everyone in my network</strong>
            <small>{network.length} {network.length === 1 ? "person" : "people"}</small>
          </span>
          <span className={`plan-network-check ${everyone ? "is-on" : ""}`} aria-hidden="true">
            {everyone ? <Check size={14} strokeWidth={2.4} /> : null}
          </span>
        </button>
      )}
      {!everyone && (
        <>
          <p className="plan-network-hint">
            {invitedIds.size === 0
              ? "Select who should see this."
              : `${invitedIds.size} selected`}
          </p>
          {network.length > 6 && (
            <label className="plan-network-search">
              <Search size={16} strokeWidth={2} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your people"
                autoComplete="off"
                autoCorrect="off"
              />
            </label>
          )}
          <div className="plan-network-list" role="list">
            {filtered.length === 0 && (
              <p className="plan-network-empty">No one matches “{query.trim()}”.</p>
            )}
            {filtered.map((u) => {
              const picked = invitedIds.has(u.id);
              const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`plan-network-row ${picked ? "is-picked" : ""}`}
                  onClick={() => onToggle(u.id)}
                  aria-pressed={picked}
                >
                  <Avatar
                    seed={u.avatarSeed}
                    style={u.avatarStyle}
                    photoDataUrl={u.avatarPhotoDataUrl}
                    params={u.avatarParams}
                    name={u.firstName}
                    size="sm"
                  />
                  <span className="plan-network-name">{fullName}</span>
                  <span className={`plan-network-check ${picked ? "is-on" : ""}`} aria-hidden="true">
                    {picked ? <Check size={14} strokeWidth={2.4} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function FlexToggle({
  active,
  onClick,
  label,
  variant = "chip",
}: {
  active: boolean;
  onClick: (e: { preventDefault(): void }) => void;
  label: string;
  variant?: "chip" | "switch";
}) {
  if (variant === "switch") {
    return (
      <div className="flex-switch-col">
        <span className="flex-switch-caption">{label}</span>
        <button
          type="button"
          role="switch"
          className={`flex-switch ${active ? "is-on" : ""}`}
          onClick={onClick}
          aria-checked={active}
          aria-label={label}
        >
          <span className="flex-switch-knob" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`flex-toggle-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title={label}
    >
      <FlexIcon />
      <span>{label}</span>
    </button>
  );
}

function FlexIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
      <path d="m12 5-7 7 7 7" />
    </svg>
  );
}

