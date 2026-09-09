/** Where the user came from — passed via react-router `location.state`. */
export type NavFromState = {
  from?:
    | "feed"
    | "messages"
    | "notifications"
    | "plan"
    | "forum"
    | "chat"
    | "my-plans"
    | "search"
    | "explore"
    | "profile"
    | "community"
    | "network"
    | "settings-forums";
  planId?: string;
  /** Profile back targets — do not overload planId for this. */
  profileUserId?: string;
  forumTag?: string;
  communityId?: string;
  /** Messages Plans vs Interests — used when `from` is `"messages"`. */
  messagesTab?: "plans" | "interests";
};

/** Back target for a forum thread when location.state is missing (deep link, post → forum). */
export function forumBackState(navFrom: NavFromState | null | undefined, tag: string): NavFromState {
  if (!navFrom?.from) {
    return { from: "messages", messagesTab: "interests" };
  }
  if (navFrom.from === "forum") {
    return { ...navFrom, forumTag: navFrom.forumTag ?? tag };
  }
  if (navFrom.from === "messages") {
    return { ...navFrom, messagesTab: navFrom.messagesTab ?? "interests" };
  }
  return navFrom;
}

export function hrefForBack(state: NavFromState | null | undefined): string {
  switch (state?.from) {
    case "messages":
      return state.messagesTab === "interests" ? "/messages?tab=interests" : "/messages";
    case "notifications":
      return "/notifications";
    case "feed":
      return "/";
    case "plan":
      return state.planId ? `/plans/${state.planId}` : "/";
    case "chat":
      return state.planId ? `/plans/${state.planId}/chat` : "/messages";
    case "forum":
      return state.forumTag ? `/forums/${state.forumTag}` : "/messages?tab=interests";
    case "settings-forums":
      return "/settings/forums";
    case "my-plans":
      return "/my-plans";
    case "search":
      return "/search";
    case "explore":
      return "/explore";
    case "community":
      return state.communityId ? `/communities/${state.communityId}` : "/explore";
    case "network":
      return "/network";
    case "profile": {
      const uid = state.profileUserId ?? state.planId;
      return uid ? `/profile/${uid}` : "/";
    }
    default:
      return "/";
  }
}

export const FEED_SCROLL_KEY = "commons:feedScroll";

export function saveFeedScroll() {
  try {
    sessionStorage.setItem(FEED_SCROLL_KEY, String(window.scrollY));
  } catch {
    /* storage unavailable */
  }
}

/** Read + clear saved feed scroll. Safe under React Strict Mode double-invoke
 *  because we only clear after a successful numeric parse. */
export function consumeFeedScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(FEED_SCROLL_KEY);
    if (raw == null) return null;
    const y = Number(raw);
    if (!Number.isFinite(y)) {
      sessionStorage.removeItem(FEED_SCROLL_KEY);
      return null;
    }
    sessionStorage.removeItem(FEED_SCROLL_KEY);
    return y;
  } catch {
    return null;
  }
}
