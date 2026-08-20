import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Globe,
  ImagePlus,
  MapPin,
  Pin,
  Tag,
  Users,
} from "lucide-react";
import { api, parseApiError } from "../api/http";
import { FLEXIBLE_DATE_PLACEHOLDER } from "../lib/planTime";
import { Avatar } from "../components/Avatar";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { NumberPicker } from "../components/NumberPicker";
import { interestVisual } from "../lib/interestIcons";
import {
  ALL_INTERESTS,
  INTEREST_LABELS,
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

// Day-of-week (0=Sun) for a YYYY-MM-DD string, parsed in local time to avoid
// the UTC-midnight off-by-one that `new Date("2026-06-23")` produces.
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

// The upcoming Saturday (or today, if today already is one) — used as the
// anchor date for "That week" ideas so the plan still sorts/shows sensibly
// on the feed without needing a dedicated "loose week" concept server-side.
const endOfThisWeek = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + (6 - d.getDay()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// F.11 — loose date buckets for "Just an idea" (specific day, sometime this
// week, or fully open-ended).
type IdeaDateMode = "specific" | "week" | "anytime";

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
  // "Host another like this →" on a past plan's card navigates here with
  // { hostAgainFrom: planId } in nav state — prefill from that plan below.
  const hostAgainFrom = (location.state as { hostAgainFrom?: string } | null)?.hostAgainFrom ?? null;
  // "Make this a plan" from an Interest Forum navigates here with
  // { fromForumTag: tag } — preselect that interest as the plan's vibe.
  const fromForumTag = (location.state as { fromForumTag?: string } | null)?.fromForumTag ?? null;
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  // "Do it again" seeds the title from a past plan, and carries that plan's
  // crew + group chat forward via fromPlanId (handled server-side on create).
  const prefillTitle = searchParams.get("title") ?? "";
  const fromPlanId = searchParams.get("fromPlanId");
  // 0.9 — arriving here to recreate a past plan (either "Host another like
  // this" or "Do it again") should send Back to that plan, not into a blank
  // New Plan flow.
  const backToSourceId = hostAgainFrom ?? fromPlanId ?? null;
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
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: defaultVibes,
    description: "",
    visibility: (inviteUserId || inviteUserIds.length > 0 ? "network" : "everyone") as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    recurrence: "none" as Recurrence,
    // Weekdays (0=Sun) the plan repeats on, Zoom-style. Seeded from the start
    // date; only used when recurrence is weekly/biweekly.
    repeatDays: [weekdayOf(today())] as number[],
    flyerDataUrl: null as string | null,
    flyerLinkUrl: "",
    flyerLinkPreview: null as null | {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 1 — user picks Make a plan (full form) vs Just an idea (loose, looking_for).
  // Skipped automatically when arriving with an invite seed or community tag.
  type Path = "choose" | "plan" | "idea";
  const [path, setPath] = useState<Path>(
    inviteUserId ||
      inviteUserIds.length > 0 ||
      prefillTitle ||
      prefillName ||
      hostAgainFrom ||
      fromPlanId ||
      fromForumTag ||
      communityId
      ? "plan"
      : "choose",
  );

  const navigate = useNavigate();

  const leaveCreatePlan = () => {
    if (backToSourceId) {
      navigate(`/plans/${backToSourceId}`);
      return;
    }
    if (fromForumTag) {
      navigate(`/forums/${fromForumTag}`);
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
      navigate(`/forums/${fromForumTag}`);
      return;
    }
    if (communityId) {
      leaveCreatePlan();
      return;
    }
    setPath("choose");
  };
  // Replan source — read live from the URL / nav state on every submit so a
  // leftover "Do it again" id can't stick around after navigating to a fresh
  // /plans/new (same route often doesn't remount, so useState would go stale).
  const replanFromId = hostAgainFrom ?? fromPlanId;
  // The path selector now requires an explicit pick + Continue rather than
  // navigating on the first tap.
  const [pendingPath, setPendingPath] = useState<"plan" | "idea" | null>(null);
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
  const flyerRef = useRef<HTMLInputElement>(null);
  const [showCoverLib, setShowCoverLib] = useState(false);

  // F.6 — inline "what's missing" guidance. Errors only render once the host
  // has actually tried to post, so the form doesn't nag while they're still
  // filling it out.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const locationCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);
  const capacityRowRef = useRef<HTMLElement>(null);

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
    if (!seedId) return;
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
        }));
        setPath("plan");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hostAgainFrom, fromPlanId, inviteUserId, inviteUserIds]);

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
  const planKind = form.isFlexibleDate || form.isFlexibleTime || form.isFlexibleLocation
    ? "looking_for"
    : "standard";

  // Block past dates/times outright — no +15-min grace. Derived (not state)
  // so it re-evaluates live as the host edits; re-checked on submit.
  // F.6 — a wholly missing date folds into this same inline message rather
  // than only surfacing in a bottom banner.
  const dateError = !form.isFlexibleDate && !form.date
    ? "Add a day or mark it flexible."
    : !form.isFlexibleDate && form.date && form.date < today()
      ? "Pick today or a future date."
      : null;
  // Exact time/location are the default path — Flexible is opt-in, so an
  // empty field without that toggle is an error (not an implied flexible).
  const timeError = !dateError && !form.isFlexibleDate && !form.isFlexibleTime && !form.time
    ? "Add a time or mark it flexible."
    : !dateError && !form.isFlexibleDate && !form.isFlexibleTime && form.date === today() && form.time
      ? form.time < nowTime()
        ? "That time is in the past — pick a later time."
        : null
      : null;
  const locationError = !form.isFlexibleLocation && !form.locationName.trim()
    ? "Add a location or mark it flexible."
    : null;
  const capacityNum = form.capacityOn ? Number(form.capacity) : null;
  const capacityError =
    capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)
      ? "Enter a number of spots, or turn off the limit."
      : null;
  const titleError = !form.title.trim() ? "Give your plan a title." : null;

  // F.6 — flag exactly what's missing inline, next to the field, and scroll
  // it into view, instead of leaving the host to guess from a generic bottom
  // banner (or a Post button that's mysteriously disabled).
  const validate = (): boolean => {
    setError(null);
    setAttemptedSubmit(true);
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
    setError(null);
    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/api/plans", {
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
          date: form.isFlexibleDate ? FLEXIBLE_DATE_PLACEHOLDER : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleDate: form.isFlexibleDate,
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
          joinType: form.joinType,
          isRecurring: form.recurrence !== "none",
          recurrence: form.recurrence,
          repeatDays:
            form.recurrence === "weekly" || form.recurrence === "biweekly"
              ? form.repeatDays
              : undefined,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
          flyerLinkUrl: form.flyerLinkUrl.trim() || undefined,
          flyerLinkPreview: form.flyerLinkPreview ?? undefined,
          // Only when this screen was opened as "Do it again" / host-again.
          fromPlanId: replanFromId || undefined,
          communityId: effectiveCommunityId ?? undefined,
          communityVisibility: effectiveCommunityId ? communityVisibility : undefined,
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
      // F.3 — land on the feed with a "you're live" success sheet (Invite
      // someone / Done) rather than dropping straight into the invite sheet.
      navigate("/", { state: { justPostedId: created.id, showPostSuccess: true } });
    } catch (err) {
      setError(parseApiError(err) || "Couldn't post — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const runSubmit = async () => {
    if (!validate()) return;
    await postPlan();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void runSubmit();
  };

  const retry = () => void runSubmit();

  const toggleVibe = (id: VibeIcon) => {
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(id) ? prev.vibes.filter((v) => v !== id) : [...prev.vibes, id],
    }));
  };

  const onFlyerPick = (file: File) => {
    fileToResizedDataUrl(file)
      .then((dataUrl) => setForm((f) => ({ ...f, flyerDataUrl: dataUrl })))
      .catch(() => setError("Couldn't read that image. Try another."));
  };

  const openFlyerPicker = async () => {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setForm((f) => ({ ...f, flyerDataUrl: dataUrl }));
      } catch {
        /* user canceled */
      }
      return;
    }
    flyerRef.current?.click();
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
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Couldn't load preview");
      // Keep the URL string so the user can still post even if the preview
      // failed (some sites block scrapers).
      setForm((f) => ({ ...f, flyerLinkUrl: withScheme, flyerLinkPreview: null }));
    } finally {
      setLinkBusy(false);
    }
  };

  if (path === "choose") {
    const firstName = user?.firstName || "there";
    return (
      <main className="app-shell app-shell--mid path-picker-page">
        <header className="app-header app-header--minimal app-header--sticky path-picker-header">
          <button type="button" className="detail-back" onClick={leaveCreatePlan}>
            <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" /> Back
          </button>
        </header>
        <h1 className="path-picker-intent-head">
          Hey {firstName},<br />what&apos;s on your mind?
        </h1>
        <p className="path-picker-intent-sub">
          Drop something in, you never know who&apos;s down.
        </p>
        <div className="path-picker-divider" />
        <div className="path-picker">
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "idea" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("idea")}
            aria-pressed={pendingPath === "idea"}
          >
            <span className="path-picker-title">Just an idea</span>
            <span className="path-picker-sub">
              A casual thought — see who&apos;s down before committing to anything.
            </span>
          </button>
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "plan" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("plan")}
            aria-pressed={pendingPath === "plan"}
          >
            <span className="path-picker-title">Make a plan</span>
            <span className="path-picker-sub">
              Know what you want to do. Set the details, post it, and see who&apos;s in.
            </span>
          </button>
        </div>
        <div className="path-picker-divider" />
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!pendingPath}
          onClick={() => {
            if (pendingPath === "idea") {
              setForm((f) => ({
                ...f,
                isFlexibleLocation: true,
                isFlexibleTime: true,
                isFlexibleDate: true,
              }));
              setPath("idea");
            } else if (pendingPath === "plan") {
              // Make a plan always starts exact — Flexible is opt-in per field.
              // Reset in case the host peeked at "Just an idea" first (which
              // seeds all three flexible flags).
              setForm((f) => ({
                ...f,
                isFlexibleLocation: false,
                isFlexibleTime: false,
                isFlexibleDate: false,
                date:
                  f.date && f.date >= today() && f.date !== FLEXIBLE_DATE_PLACEHOLDER
                    ? f.date
                    : today(),
                time: f.time || defaultPlanTime(),
              }));
              setPath("plan");
            }
          }}
        >
          Continue
        </button>
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
          dateError={dateError}
          toggleVibe={toggleVibe}
          onBack={backFromForm}
          onOpenLibrary={() => setShowCoverLib(true)}
          onOpenFlyer={() => void openFlyerPicker()}
          onClearFlyer={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
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
        {showCoverLib && (
          <CoverLibraryModal
            onPick={(url) => {
              setForm((f) => ({ ...f, flyerDataUrl: url }));
              setShowCoverLib(false);
            }}
            onClose={() => setShowCoverLib(false)}
          />
        )}
      </>
    );
  }

  return (
    <main className="app-shell app-shell--mid create-plan">
      <header className="app-header create-header app-header--sticky">
        <button
          type="button"
          className="detail-back"
          onClick={backFromForm}
        >
          ← Back
        </button>
        <span className="create-header-title">New plan</span>
        <button
          type="submit"
          form="create-plan-form"
          className="create-header-post"
          disabled={submitting}
        >
          {submitting ? "Posting…" : "Post it"}
        </button>
      </header>

      {(inviteUserId && inviteUserName) || inviteNames.length > 0 ? (
        <div className="create-plan-invite-banner" role="note">
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
            ? "Visible to your network"
            : "Visible to everyone on COMMONS"}
        </div>
      ) : null}

      {effectiveCommunityId ? (
        <div className="create-plan-invite-banner" role="note">
          Posting to{" "}
          <strong>{communityName ?? "your community"}</strong>
          {" "}members ·{" "}
          {communityVisibility === "community_only"
            ? "Only members can see this"
            : "Also shows on the main feed"}
        </div>
      ) : null}

      {fromForumTag ? (
        <div className="create-plan-invite-banner" role="note">
          Tagged{" "}
          <strong>{VIBE_OPTIONS.find((o) => o.tag === fromForumTag)?.label ?? fromForumTag}</strong>
          {" "}— everyone with that interest will see this plan in their feed.
        </div>
      ) : null}

      <form id="create-plan-form" onSubmit={submit} className="create-form">
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
                ? "Shows on the main feed with a community tag, and on the community's events board."
                : "Only community members can see this — it won't appear on the main feed."}
            </p>
          </div>
        ) : null}

        {/* Cover image — prominent at the top, per New Plan handoff. */}
        {form.flyerDataUrl ? (
          <div className="cover-picker cover-picker--filled">
            <img src={form.flyerDataUrl} alt="" className="cover-picker-img" />
            <div className="cover-picker-overlay">
              <button type="button" className="cover-chip" onClick={() => setShowCoverLib(true)}>
                Change
              </button>
              <button
                type="button"
                className="cover-chip"
                onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="cover-picker">
            <span className="cover-picker-title">Add a cover image</span>
            <span className="cover-picker-sub">Make your plan stand out</span>
            <div className="cover-picker-buttons">
              <button type="button" className="cover-btn" onClick={() => setShowCoverLib(true)}>
                <LibraryIcon />
                Choose from our library
              </button>
              <button type="button" className="cover-btn" onClick={() => void openFlyerPicker()}>
                <UploadIcon />
                Upload your own
              </button>
            </div>
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

        {/* Plan name */}
        <input
          id="title"
          ref={titleInputRef}
          className="create-title-input"
          placeholder="Plan name"
          value={form.title}
          aria-invalid={Boolean(attemptedSubmit && titleError)}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        {attemptedSubmit && titleError && <p className="luma-inline-error">{titleError}</p>}

        {/* When — Date + Time as Luma-style rows, each with its own Flexible
            pill. Borderless rows on the card, hairline-divided. Req 3.1 —
            past dates are blocked and same-day times need runway. */}
        <div
          className="luma-card"
          ref={dateCardRef}
          aria-invalid={Boolean(dateError || timeError) || undefined}
        >
          <div className="luma-row">
            <span className="luma-label">Date</span>
            <div className="luma-value">
              {!form.isFlexibleDate ? (
                <input
                  id="date"
                  type="date"
                  className="luma-input"
                  min={today()}
                  value={form.date}
                  aria-invalid={Boolean(dateError)}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible day</span>
              )}
              <FlexToggle
                active={form.isFlexibleDate}
                onClick={() =>
                  setForm((f) => {
                    const next = !f.isFlexibleDate;
                    return next
                      ? { ...f, isFlexibleDate: true }
                      : {
                          ...f,
                          isFlexibleDate: false,
                          date:
                            f.date && f.date >= today() && f.date !== FLEXIBLE_DATE_PLACEHOLDER
                              ? f.date
                              : today(),
                        };
                  })
                }
                label="Flexible"
              />
            </div>
          </div>
          <div className="luma-row">
            <span className="luma-label">Time</span>
            <div className="luma-value">
              {!form.isFlexibleTime ? (
                <input
                  id="time"
                  type="time"
                  className="luma-input"
                  min={!form.isFlexibleDate && form.date === today() ? nowTime() : undefined}
                  value={form.time}
                  aria-invalid={Boolean(timeError)}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible time</span>
              )}
              <FlexToggle
                active={form.isFlexibleTime}
                onClick={() =>
                  setForm((f) => {
                    const next = !f.isFlexibleTime;
                    return next
                      ? { ...f, isFlexibleTime: true }
                      : {
                          ...f,
                          isFlexibleTime: false,
                          time: f.time || defaultPlanTime(),
                        };
                  })
                }
                label="Flexible"
              />
            </div>
          </div>
        </div>
        {(dateError || timeError) && (
          <p className="luma-inline-error">{dateError || timeError}</p>
        )}

        {/* Location — single row, Google-Places-backed, flexible toggle inline.
            Neighborhood is optional (profile default when set; otherwise the
            server infers from venue coords). Picking a place and toggling
            Flexible are mutually exclusive — each one clears the other. */}
        <div
          className="luma-card"
          ref={locationCardRef}
          aria-invalid={Boolean(attemptedSubmit && locationError) || undefined}
        >
          <div className="location-row">
            <div className="location-row-main">
              {!form.isFlexibleLocation ? (
                <PlacePicker
                  autoFocusOnMount
                  value={form.locationName}
                  address={form.locationAddress}
                  placeholder="Search a venue or type your own"
                  onFieldFocus={(el) => {
                    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
                  }}
                  onChange={(name) =>
                    setForm((f) => ({
                      ...f,
                      locationName: name,
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                  onSelect={(p) =>
                    setForm((f) => ({
                      ...f,
                      locationName: p.name,
                      locationAddress: p.address,
                      locationLat: p.lat,
                      locationLng: p.lng,
                      locationPlaceId: p.placeId,
                      isFlexibleLocation: false,
                    }))
                  }
                  onClear={() =>
                    setForm((f) => ({
                      ...f,
                      locationName: "",
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                />
              ) : (
                <span className="luma-flex-text location-row-flex-text">Flexible location</span>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
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
              label="Flexible"
            />
          </div>
        </div>
        {attemptedSubmit && locationError && (
          <p className="luma-inline-error">{locationError}</p>
        )}

        {/* Description */}
        <textarea
          id="description"
          className="create-desc-input"
          placeholder="Add a description — vibes, what to bring, who it's for…"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />

        {/* Category — wrapping pills. */}
        <p className="form-eyebrow">Category <span className="form-eyebrow-optional">— optional</span></p>
        <div className="vibe-grid">
          {VIBE_OPTIONS.map((opt) => {
            const selected = form.vibes.includes(opt.id);
            const { Icon, iconColor, tint } = interestVisual(opt.tag);
            return (
              <button
                key={opt.id}
                type="button"
                className={`vibe-tile ${selected ? "is-selected" : ""}`}
                onClick={() => toggleVibe(opt.id)}
                aria-pressed={selected}
              >
                {selected && <span className="vibe-tile-dot" aria-hidden="true" />}
                <span
                  className="vibe-tile-icon"
                  style={{ background: tint, color: iconColor }}
                  aria-hidden="true"
                >
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="vibe-tile-label">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings — visibility segmented toggle + optional extras. */}
        <p className="form-eyebrow">Settings</p>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">Visibility</span>
            <div className="vis-pill-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`vis-pill ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                <Globe size={12} strokeWidth={1.8} aria-hidden="true" />
                Everyone
              </button>
              <button
                type="button"
                className={`vis-pill ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                aria-pressed={form.visibility === "network"}
              >
                <Users size={12} strokeWidth={1.8} aria-hidden="true" />
                Your network
              </button>
            </div>
          </div>

          {/* Granular hand-pick inside Your Network. Empty list = full network. */}
          {form.visibility === "network" && (
            <div className="settings-handpick">
              <NetworkHandPick
                network={network}
                invitedIds={invitedIds}
                onToggle={toggleInvited}
              />
            </div>
          )}

          {/* Options — spots, repeats, link. Collapsed to keep the form short. */}
          <button
            type="button"
            className="settings-options-toggle"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
          >
            <span className="settings-row-label">Additional details</span>
            <ChevronIcon open={showMore} />
          </button>

        {showMore && (
          <div className="create-more">
            {/* Spots — toggle for open vs capped */}
            <section className="form-section" ref={capacityRowRef}>
              <div className="form-row-flex">
                <div className="form-row-flex-main">
                  <label className="form-question">Capacity</label>
                  {!form.capacityOn && (
                    <p className="form-help" style={{ marginTop: 4 }}>
                      Open — no cap on who can join
                    </p>
                  )}
                </div>
                <FlexToggle
                  active={form.capacityOn}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm((f) => ({ ...f, capacityOn: !f.capacityOn }));
                  }}
                  label="Set limit"
                />
              </div>
              {form.capacityOn && (
                <NumberPicker
                  value={Number(form.capacity) || 0}
                  onChange={(n) => setForm((f) => ({ ...f, capacity: String(n) }))}
                  ariaLabel="Number of spots"
                />
              )}
              {attemptedSubmit && capacityError && (
                <p className="luma-inline-error">{capacityError}</p>
              )}

              {form.capacityOn && (
                <>
                  <label className="form-question" style={{ marginTop: 12 }}>
                    How do people get in?
                  </label>
                  <div className="segmented">
                    <button
                      type="button"
                      className={form.joinType === "open" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "open" }))}
                    >
                      First come
                    </button>
                    <button
                      type="button"
                      className={form.joinType === "approve" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "approve" }))}
                    >
                      Approve
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Repeats — Zoom-style cadence dropdown */}
            <section className="form-section">
              <label className="form-question" htmlFor="repeats">Repeats</label>
              <select
                id="repeats"
                className="form-select"
                value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as Recurrence }))}
              >
                <option value="none">Doesn't repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
              {(form.recurrence === "weekly" || form.recurrence === "biweekly") && (
                <div className="repeat-days" role="group" aria-label="Repeats on">
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
            </section>

            {/* Link — paste a URL to show a preview on the card. The cover
                image at the top of the form handles uploads. */}
            <section className="form-section">
              <label className="form-question" htmlFor="flyer-link">
                Add a link
              </label>
          <input
            id="flyer-link"
            type="url"
            placeholder="https://…"
            value={form.flyerLinkUrl}
            onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
            onBlur={(e) => void fetchLinkPreview(e.target.value)}
            disabled={linkBusy}
          />
          {linkBusy && <p className="form-help">Loading preview…</p>}
          {linkError && <p className="form-help" style={{ color: "var(--accent)" }}>{linkError}</p>}
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
                {form.flyerLinkPreview.description && (
                  <div className="link-preview-desc">{form.flyerLinkPreview.description}</div>
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
            </section>
          </div>
        )}
        </div>

        {inviteUserId && (
          <section className="form-section">
            <label className="form-question">Invite from your network</label>
            <p className="form-help">
              {inviteUserName ? <><strong>{inviteUserName}</strong> is already added. </> : null}
              Pick anyone else you want in on this.
            </p>
            {network === null && <p className="form-help">Loading…</p>}
            {network !== null && network.length === 0 && !seededOutsideNetwork && (
              <p className="form-help">No one in your network yet — you can still post.</p>
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

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>

        {!effectiveCommunityId ? (
          <p className="create-communities-footer">
            <strong>Communities</strong>{" "}
            <Link to="/communities" className="visibility-option-pill">
              Explore →
            </Link>
            <br />
            Run clubs, book clubs, recurring crews.
          </p>
        ) : null}
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
  vibes: VibeIcon[];
  description: string;
  visibility: PlanVisibility;
  capacityOn: boolean;
  capacity: string;
  joinType: JoinType;
  recurrence: Recurrence;
  repeatDays: number[];
  flyerDataUrl: string | null;
  flyerLinkUrl: string;
  flyerLinkPreview: null | {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
};

/**
 * Just an Idea form — prompt, text box, and image up front; Settings matches
 * Make a Plan (visibility + collapsible Additional details).
 */
function IdeaForm({
  form,
  setForm,
  submit,
  retry,
  submitting,
  error,
  attemptedSubmit,
  dateError,
  toggleVibe,
  onBack,
  onOpenLibrary,
  onOpenFlyer,
  onClearFlyer,
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
}: {
  form: FormShape;
  setForm: (updater: (f: FormShape) => FormShape) => void;
  submit: (event?: FormEvent) => void;
  retry: () => void;
  submitting: boolean;
  error: string | null;
  attemptedSubmit: boolean;
  dateError: string | null;
  toggleVibe: (id: VibeIcon) => void;
  onBack: () => void;
  onOpenLibrary: () => void;
  onOpenFlyer: () => void;
  onClearFlyer: () => void;
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
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dateMode, setDateMode] = useState<IdeaDateMode>(form.isFlexibleDate ? "anytime" : "specific");
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * IDEA_PLACEHOLDERS.length));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (attemptedSubmit && !form.title.trim()) {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptedSubmit]);

  useEffect(() => {
    if (!detailsOpen) return;
    const t = setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
  }, [detailsOpen]);

  const scrollFieldIntoView = (el: HTMLElement | null) => {
    setTimeout(() => {
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

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

  const selectDateMode = (mode: IdeaDateMode) => {
    setDateMode(mode);
    if (mode === "specific") {
      setForm((f) => ({
        ...f,
        isFlexibleDate: false,
        date: f.date && f.date >= today() ? f.date : today(),
      }));
    } else if (mode === "week") {
      setForm((f) => ({ ...f, isFlexibleDate: false, date: endOfThisWeek() }));
    } else {
      setForm((f) => ({ ...f, isFlexibleDate: true, date: today() }));
    }
  };

  const titleMissing = attemptedSubmit && !form.title.trim();

  return (
    <main className="app-shell app-shell--mid idea-form-page">
      <header className="idea-form-header">
        <button type="button" className="idea-form-back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Back
        </button>
        <button
          type="submit"
          form="idea-form"
          className="idea-form-submit-link"
          disabled={submitting}
        >
          {submitting ? "Posting…" : "Put it out there"}
        </button>
      </header>

      <div className="idea-form-title-block">
        <h1 className="idea-form-title">Just an Idea</h1>
        <p className="idea-form-sub">
          Just a thought. See who&apos;s down. No plan too big or small.
        </p>
      </div>

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
            ? "Only members can see this"
            : "Also shows on the main feed"}
        </div>
      ) : null}

      <form
        id="idea-form"
        onSubmit={submit}
        className="idea-form"
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      >
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
                ? "Shows on the main feed with a community tag, and on the community's events board."
                : "Only community members can see this — it won't appear on the main feed."}
            </p>
          </div>
        ) : null}
        <p className="idea-inspiration-label">Need some inspiration?</p>

        <div className="idea-textarea-card">
          <textarea
            ref={textareaRef}
            className="idea-textarea"
            placeholder={IDEA_PLACEHOLDERS[placeholderIdx]}
            value={form.title}
            aria-invalid={titleMissing}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            rows={5}
          />
        </div>
        {titleMissing && <p className="luma-inline-error">Add a few words about the idea.</p>}

        {form.flyerDataUrl ? (
          <div className="idea-photo-preview">
            <img src={form.flyerDataUrl} alt="" />
            <div className="idea-photo-preview-actions">
              <button type="button" className="cover-chip" onClick={onOpenLibrary}>
                Library
              </button>
              <button type="button" className="cover-chip" onClick={onOpenFlyer}>
                Upload
              </button>
              <button type="button" className="cover-chip" onClick={onClearFlyer}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="idea-photo-actions">
            <button type="button" className="idea-photo-upload" onClick={onOpenLibrary}>
              <ImagePlus size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>Choose from library</span>
            </button>
            <button type="button" className="idea-photo-upload" onClick={onOpenFlyer}>
              <span>Upload your own</span>
            </button>
          </div>
        )}

        <p className="form-eyebrow">Settings</p>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">Visibility</span>
            <div className="vis-pill-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`vis-pill ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                <Globe size={12} strokeWidth={1.8} aria-hidden="true" />
                Everyone
              </button>
              <button
                type="button"
                className={`vis-pill ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                aria-pressed={form.visibility === "network"}
              >
                <Users size={12} strokeWidth={1.8} aria-hidden="true" />
                Your network
              </button>
            </div>
          </div>

          {form.visibility === "network" && (
            <div className="settings-handpick">
              <NetworkHandPick
                network={network}
                invitedIds={invitedIds}
                onToggle={onToggleInvited}
              />
            </div>
          )}

          <button
            type="button"
            className="settings-options-toggle"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            <span className="settings-row-label">Additional details</span>
            <ChevronIcon open={detailsOpen} />
          </button>

          {detailsOpen && (
            <div className="idea-accordion-panel" ref={detailsRef}>
              <div className="idea-detail-row">
                <span className="idea-detail-well" style={{ background: "#D8D0F0", color: "#7A5BA0" }} aria-hidden="true">
                  <Calendar size={14} strokeWidth={1.8} />
                </span>
                <div className="idea-detail-body">
                  <div className="seg-toggle idea-date-toggle" role="group" aria-label="When">
                    <button
                      type="button"
                      className={`seg-toggle-btn ${dateMode === "specific" ? "is-active" : ""}`}
                      onClick={() => selectDateMode("specific")}
                      aria-pressed={dateMode === "specific"}
                    >
                      A day
                    </button>
                    <button
                      type="button"
                      className={`seg-toggle-btn ${dateMode === "week" ? "is-active" : ""}`}
                      onClick={() => selectDateMode("week")}
                      aria-pressed={dateMode === "week"}
                    >
                      This week
                    </button>
                    <button
                      type="button"
                      className={`seg-toggle-btn ${dateMode === "anytime" ? "is-active" : ""}`}
                      onClick={() => selectDateMode("anytime")}
                      aria-pressed={dateMode === "anytime"}
                    >
                      Anytime
                    </button>
                  </div>
                  {dateMode === "specific" && (
                    <div className="idea-date-input-row">
                      <input
                        type="date"
                        className="luma-input idea-date-input"
                        min={today()}
                        value={form.date}
                        aria-invalid={Boolean(dateError)}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                      />
                      {dateError && <p className="luma-inline-error">{dateError}</p>}
                    </div>
                  )}
                </div>
              </div>

              <div className="idea-detail-row">
                <span className="idea-detail-well" style={{ background: "#C8DCF0", color: "#5B8FBF" }} aria-hidden="true">
                  <MapPin size={14} strokeWidth={1.8} />
                </span>
                <div className="idea-detail-body">
                  <div className="location-row">
                    <div className="location-row-main">
                      {!form.isFlexibleLocation ? (
                        <PlacePicker
                          value={form.locationName}
                          address={form.locationAddress}
                          placeholder="Neighbourhood, venue, or vibe"
                          onChange={(name) =>
                            setForm((f) => ({
                              ...f,
                              locationName: name,
                              locationAddress: "",
                              locationLat: undefined,
                              locationLng: undefined,
                              locationPlaceId: undefined,
                            }))
                          }
                          onSelect={(p) =>
                            setForm((f) => ({
                              ...f,
                              locationName: p.name,
                              locationAddress: p.address,
                              locationLat: p.lat,
                              locationLng: p.lng,
                              locationPlaceId: p.placeId,
                              isFlexibleLocation: false,
                            }))
                          }
                          onClear={() =>
                            setForm((f) => ({
                              ...f,
                              locationName: "",
                              locationAddress: "",
                              locationLat: undefined,
                              locationLng: undefined,
                              locationPlaceId: undefined,
                            }))
                          }
                          onFieldFocus={(el) => scrollFieldIntoView(el)}
                        />
                      ) : (
                        <span className="luma-flex-text location-row-flex-text">Flexible location</span>
                      )}
                    </div>
                    <FlexToggle
                      active={form.isFlexibleLocation}
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
                      label="Flexible"
                    />
                  </div>
                </div>
              </div>

              <div className="idea-detail-row idea-detail-row--top">
                <span className="idea-detail-well" style={{ background: "#F5E4C8", color: "#B8864A" }} aria-hidden="true">
                  <Pin size={14} strokeWidth={1.8} />
                </span>
                <div className="idea-detail-body">
                  <textarea
                    className="idea-detail-input"
                    placeholder="Anything else worth knowing?"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="idea-detail-row idea-detail-row--tags">
                <span className="idea-detail-well" style={{ background: "#F0D8D8", color: "#A05B5B" }} aria-hidden="true">
                  <Tag size={14} strokeWidth={1.8} />
                </span>
                <div className="idea-detail-body">
                  <div className="idea-interest-grid" role="group" aria-label="Interest tags">
                    {ALL_INTERESTS.map((tag) => {
                      const selected = form.vibes.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`idea-interest-pill ${selected ? "is-selected" : ""}`}
                          onClick={() => toggleVibe(tag)}
                          aria-pressed={selected}
                        >
                          {INTEREST_LABELS[tag]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="form-error-banner">
            <p className="error-text">{error}</p>
            <button type="button" className="btn-link" onClick={retry} disabled={submitting}>
              Try again
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

/**
 * Hand-pick a subset of the user's network. Empty selection means the plan
 * still lands on the user's full network (we don't want a footgun where the
 * host posts to no one). Once any chip is picked, the audience is narrowed
 * to that explicit list via the existing invitedIds flow.
 */
function NetworkHandPick({
  network,
  invitedIds,
  onToggle,
}: {
  network: PublicUser[] | null;
  invitedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (network === null) {
    return <p className="form-help" style={{ marginTop: 8 }}>Loading your network…</p>;
  }
  if (network.length === 0) {
    return (
      <div className="network-empty-prompt" style={{ marginTop: 8 }}>
        <p className="form-help" style={{ marginTop: 0, marginBottom: 10 }}>
          You haven&apos;t added anyone yet — invite someone or add people you&apos;ve met.
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
    <div style={{ marginTop: 10 }}>
      <p className="form-help" style={{ marginTop: 0 }}>
        Want to narrow it down? Pick specific people — leave blank to share with everyone in your network.
      </p>
      <div className="invite-people-list">
        {network.map((u) => {
          const picked = invitedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`invite-person ${picked ? "is-picked" : ""}`}
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
              <span className="invite-person-name">{u.firstName}</span>
              {picked && <span className="invite-person-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlexToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: (e: { preventDefault(): void }) => void;
  label: string;
}) {
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`create-more-chevron ${open ? "is-open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface PlaceHit {
  placeId: string;
  name: string;
  address: string;
  /** e.g. "Fishtown" — parsed server-side from Places address components. */
  neighborhood?: string;
  lat?: number;
  lng?: number;
}

/**
 * Google-Places-backed venue picker. Free-text typing is kept as a custom
 * venue name (onChange); choosing a suggestion fills name + address + coords
 * (onSelect). Falls back gracefully to plain text when Places isn't configured.
 */
function PlacePicker({
  value,
  address,
  onChange,
  onSelect,
  onClear,
  placeholder,
  autoFocusOnMount = false,
  onFieldFocus,
}: {
  value: string;
  address: string;
  onChange: (name: string) => void;
  onSelect: (p: { name: string; address: string; lat?: number; lng?: number; placeId?: string }) => void;
  onClear: () => void;
  placeholder?: string;
  autoFocusOnMount?: boolean;
  onFieldFocus?: (el: HTMLElement) => void;
}) {
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Seed true when a venue is already filled (e.g. prefilled from Explore) so
  // we don't auto-search and pop the dropdown on mount.
  const skipNextSearch = useRef(value.trim().length >= 2);

  useEffect(() => {
    if (!autoFocusOnMount || value.trim()) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocusOnMount, value]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      setErrored(false);
      return;
    }
    setLoading(true);
    setErrored(false);
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      void (async () => {
        const coversQuery = (name: string) => {
          const n = name.trim().toLowerCase();
          const needle = q.toLowerCase();
          if (!n) return false;
          if (n.includes(needle)) return true;
          const words = needle.split(/\s+/).filter((w) => w.length > 1);
          return words.length > 0 && words.every((w) => n.includes(w));
        };
        let merged: PlaceHit[] = [];
        try {
          const g = await api<{
            predictions: Array<{
              placeId: string;
              name: string;
              address: string;
              neighborhood?: string;
              lat?: number;
              lng?: number;
            }>;
          }>(`/api/places/autocomplete?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          merged = g.predictions ?? [];
          if (merged.length && merged.some((p) => coversQuery(p.name))) {
            setResults(merged);
            setErrored(false);
            setSearched(true);
            setLoading(false);
            return;
          }
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") return;
        }

        try {
          const r = await api<{ results: PlaceHit[] }>(
            `/api/places/search?q=${encodeURIComponent(q)}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          const extra = r.results ?? [];
          const seen = new Set(merged.map((p) => p.placeId));
          merged = [...merged, ...extra.filter((p) => p.placeId && !seen.has(p.placeId))];
          setResults(merged);
          setErrored(false);
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") return;
          if (merged.length) {
            setResults(merged);
            setErrored(false);
          } else {
            setResults([]);
            setErrored(true);
          }
        } finally {
          if (!controller.signal.aborted) {
            setSearched(true);
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Clean up timers / in-flight search on unmount.
  useEffect(() => () => {
    if (blurRef.current) clearTimeout(blurRef.current);
    abortRef.current?.abort();
  }, []);

  const choose = (p: PlaceHit) => {
    skipNextSearch.current = true;
    // Bind immediately so validation / submit see a real location even if
    // Place Details is slow or fails. Autocomplete hits often lack lat/lng —
    // enrich from Details after the field is already set.
    const fallbackName =
      (p.name && p.name.trim()) ||
      (p.address && p.address.split(",")[0]?.trim()) ||
      value.trim();
    const fallbackAddress = (p.address && p.address.trim()) || fallbackName;
    onSelect({
      name: fallbackName,
      address: fallbackAddress,
      lat: p.lat,
      lng: p.lng,
      placeId: p.placeId,
    });
    setResults([]);
    setSearched(false);
    setFocused(false);

    if (p.placeId && !p.placeId.startsWith("osm-") && (p.lat == null || p.lng == null)) {
      void api<{ name: string; address: string; lat?: number; lng?: number }>(
        `/api/places/details?placeId=${encodeURIComponent(p.placeId)}`,
      )
        .then((d) => {
          // First onSelect already consumed skipNextSearch — set it again so
          // the enrichment update doesn't kick off another autocomplete search.
          skipNextSearch.current = true;
          onSelect({
            name: (d.name && d.name.trim()) || fallbackName,
            address: (d.address && d.address.trim()) || fallbackAddress,
            lat: d.lat,
            lng: d.lng,
            placeId: p.placeId,
          });
        })
        .catch(() => {
          /* already bound above */
        });
    }
  };

  const hasPickedAddress = Boolean(address && address !== value);
  // Visibility is gated on focus (not a separate flag that can desync), so the
  // list stays put while you read it instead of flickering on every keystroke.
  const showDropdown = focused && value.trim().length >= 2;

  const dropdown = showDropdown ? (
    <ul className="place-picker-results" role="listbox">
      {loading && results.length === 0 && <li className="place-picker-empty">Searching…</li>}
      {!loading && errored && (
        <li className="place-picker-empty">
          Venue search is unavailable — we'll use "{value.trim()}" as the venue.
        </li>
      )}
      {!loading && !errored && searched && results.length === 0 && (
        <li className="place-picker-empty">No matches — we'll use "{value.trim()}" as the venue.</li>
      )}
      {results.map((p) => (
        <li key={p.placeId}>
          <button
            type="button"
            className="place-picker-result"
            onMouseDown={(e) => {
              e.preventDefault();
              choose(p);
            }}
          >
            <span className="place-picker-result-name">{p.name}</span>
            {(p.neighborhood || p.address) && (
              <span className="place-picker-result-addr">{p.neighborhood ?? p.address}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="place-picker">
      <div className="place-picker-field">
        <PinIcon />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder ?? "Search a venue or type your own"}
          value={value}
          onChange={(e) => {
            setFocused(true);
            onChange(e.target.value);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFieldFocus?.(e.currentTarget);
          }}
          onBlur={() => {
            // Delay so a result tap (mousedown) registers before we hide.
            blurRef.current = setTimeout(() => setFocused(false), 180);
          }}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="place-picker-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setResults([]);
              setSearched(false);
            }}
            aria-label="Clear place"
          >
            ×
          </button>
        )}
      </div>
      {hasPickedAddress && !showDropdown && <p className="place-picker-chosen">📍 {address}</p>}
      {dropdown}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}
