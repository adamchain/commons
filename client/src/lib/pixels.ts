/**
 * Meta, Google, and TikTok pixels for the public site. IDs come from the
 * server (`META_PIXEL_ID`, `GA_MEASUREMENT_ID`, `TIKTOK_PIXEL_ID`) so they
 * can be turned on without an app rebuild. The native app does not load them.
 */

import { api } from "../api/http";
import { isNative } from "./platform";

type PixelConfig = {
  metaPixelId: string | null;
  gaMeasurementId: string | null;
  tiktokPixelId: string | null;
};

const FIRED = "commons_pixel_signup_fired";

let started = false;
let ready = false;
let pendingSignup = false;
let metaId: string | null = null;
let gaId: string | null = null;
let tiktokId: string | null = null;

function win(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function isMetaId(id: string): boolean {
  return /^[0-9]{5,20}$/.test(id);
}
function isGaId(id: string): boolean {
  return /^G-[A-Z0-9]+$/i.test(id);
}
function isTikTokId(id: string): boolean {
  return /^[A-Za-z0-9]{10,40}$/.test(id);
}

function loadScript(src: string): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function callPixel(name: "fbq" | "gtag" | "ttq", args: unknown[]): void {
  const fn = win()[name];
  if (typeof fn === "function") fn(...args);
}

function installMeta(id: string): void {
  const w = win();
  if (typeof w.fbq !== "function") {
    const queue: unknown[][] = [];
    const fbq = (...args: unknown[]) => {
      queue.push(args);
    };
    (fbq as unknown as { queue: unknown[][]; loaded: boolean }).queue = queue;
    (fbq as unknown as { loaded: boolean }).loaded = true;
    w.fbq = fbq;
    w._fbq = fbq;
  }
  loadScript("https://connect.facebook.net/en_US/fbevents.js");
  callPixel("fbq", ["init", id]);
  callPixel("fbq", ["track", "PageView"]);
}

function installGoogle(id: string): void {
  const w = win();
  const dataLayer = (Array.isArray(w.dataLayer) ? w.dataLayer : []) as unknown[];
  w.dataLayer = dataLayer;
  w.gtag = (...args: unknown[]) => {
    dataLayer.push(args);
  };
  callPixel("gtag", ["js", new Date()]);
  callPixel("gtag", ["config", id]);
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function installTikTok(id: string): void {
  const w = win();
  w.TiktokAnalyticsObject = "ttq";
  // The TikTok snippet queues calls on an array until events.js replaces it.
  const ttq = (Array.isArray(w.ttq) ? w.ttq : []) as unknown[] & Record<string, unknown>;
  w.ttq = ttq;
  const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
  ttq.methods = methods;
  ttq.setAndDefer = (target: Record<string, unknown>, method: string) => {
    target[method] = (...args: unknown[]) => {
      (target as unknown as { push: (entry: unknown[]) => void }).push([method, ...args]);
    };
  };
  const defer = ttq.setAndDefer as (target: Record<string, unknown>, method: string) => void;
  for (const method of methods) defer(ttq, method);
  ttq.load = (pixelId: string) => {
    loadScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`);
  };
  (ttq.load as (pixelId: string) => void)(id);
  (ttq.page as () => void)();
}

function flushSignup(): void {
  if (!pendingSignup || !ready) return;
  try {
    if (sessionStorage.getItem(FIRED)) {
      pendingSignup = false;
      return;
    }
    sessionStorage.setItem(FIRED, "1");
  } catch {
    /* ignore */
  }
  pendingSignup = false;
  if (metaId) callPixel("fbq", ["track", "CompleteRegistration"]);
  if (gaId) callPixel("gtag", ["event", "sign_up"]);
  if (tiktokId) {
    const pixel = win().ttq as { track?: (event: string) => void } | undefined;
    if (typeof pixel?.track === "function") pixel.track("CompleteRegistration");
  }
}

/** Load whatever pixels the server has configured. No-op inside the iOS app. */
export function installSignupPixels(): void {
  if (typeof window === "undefined" || isNative() || started) return;
  started = true;
  void api<PixelConfig>("/api/app/pixels")
    .then((config) => {
      metaId = config.metaPixelId && isMetaId(config.metaPixelId) ? config.metaPixelId : null;
      gaId = config.gaMeasurementId && isGaId(config.gaMeasurementId) ? config.gaMeasurementId : null;
      tiktokId = config.tiktokPixelId && isTikTokId(config.tiktokPixelId) ? config.tiktokPixelId : null;
      if (metaId) installMeta(metaId);
      if (gaId) installGoogle(gaId);
      if (tiktokId) installTikTok(tiktokId);
    })
    .catch(() => undefined)
    .finally(() => {
      ready = true;
      flushSignup();
    });
}

/** Fire once when someone finishes creating an account. */
export function trackSignup(): void {
  if (isNative()) return;
  pendingSignup = true;
  flushSignup();
}
