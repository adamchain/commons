// Feed filters persist across in-app navigation (so leaving the feed and coming
// back keeps "hide cancelled" etc.), but they should NOT carry over between
// sessions — every time the app is opened we start from a clean slate. App.tsx
// calls resetFeedFilters() on cold start and on foreground; FeedPage listens for
// the event to drop its live state if it's already mounted.
export const FEED_FILTERS_KEY = "commons.feedFilters.v1";
export const FEED_FILTERS_RESET_EVENT = "commons:reset-filters";

export function resetFeedFilters(): void {
  try {
    localStorage.removeItem(FEED_FILTERS_KEY);
  } catch {
    /* storage unavailable — non-fatal */
  }
  window.dispatchEvent(new Event(FEED_FILTERS_RESET_EVENT));
}
