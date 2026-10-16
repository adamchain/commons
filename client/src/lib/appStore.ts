// Live App Store listing. VITE_APP_STORE_URL overrides this if it is set.
const LIVE_APP_STORE_URL =
  "https://apps.apple.com/us/app/commons-plans-communities/id6785627674#productRatings";

export const APP_STORE_URL: string = (() => {
  const raw = import.meta.env.VITE_APP_STORE_URL;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : LIVE_APP_STORE_URL;
})();
