// App Store / TestFlight destination for the "Download the app" prompt shown
// after web onboarding. Set VITE_APP_STORE_URL once the listing is live; until
// then the prompt shows a "coming soon" state instead of a dead link.
export const APP_STORE_URL: string | null = (() => {
  const raw = import.meta.env.VITE_APP_STORE_URL;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
})();
