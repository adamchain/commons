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
    | "profile";
  planId?: string;
  forumTag?: string;
};

export function hrefForBack(state: NavFromState | null | undefined): string {
  switch (state?.from) {
    case "messages":
      return "/messages";
    case "notifications":
      return "/notifications";
    case "feed":
      return "/";
    case "plan":
      return state.planId ? `/plans/${state.planId}` : "/";
    case "chat":
      return state.planId ? `/plans/${state.planId}/chat` : "/messages";
    case "forum":
      return state.forumTag ? `/forums/${state.forumTag}` : "/messages";
    case "my-plans":
      return "/my-plans";
    case "search":
      return "/search";
    case "explore":
      return "/explore";
    case "profile":
      return state.planId ? `/profile/${state.planId}` : "/";
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

export function consumeFeedScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(FEED_SCROLL_KEY);
    sessionStorage.removeItem(FEED_SCROLL_KEY);
    if (raw == null) return null;
    const y = Number(raw);
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
}
