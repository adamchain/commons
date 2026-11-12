/**
 * Remembers how someone arrived, so the admin dashboard can say whether a
 * signup came from Facebook, the landing page, a text, a shared plan, or
 * the app itself. First touch wins. A later shared link can replace a blank
 * app open.
 */

import { isNative } from "./platform";

const KEY = "commons_signup_attribution";

export type SignupAttribution = {
  label: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  landingPath?: string;
};

export type JoinChannel = "sms" | "facebook" | "instagram" | "whatsapp" | "x";

function clip(value: string | null | undefined, max: number): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function cleanLabel(raw: string): string {
  const text = raw
    .replace(/[^A-Za-z0-9 ._+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!text) return "Direct";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hostOf(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostIs(host: string | null, roots: string[]): boolean {
  if (!host) return false;
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function channelLabel(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^(sms|imessage|messages|text)$/.test(value)) return "SMS or iMessage";
  if (/^(facebook|fb|meta)$/.test(value)) return "Facebook";
  if (/^(instagram|ig)$/.test(value)) return "Instagram";
  if (/^(whatsapp|wa)$/.test(value)) return "WhatsApp";
  if (/^(tiktok|tt)$/.test(value)) return "TikTok";
  if (value === "google" || value === "adwords") return "Google";
  if (value === "x" || value === "twitter") return "X";
  if (value === "qr") return "QR code";
  if (value === "landing") return "Landing";
  return null;
}

function classify(url: URL, referrer: string, native: boolean): string {
  const fromLabel = channelLabel(url.searchParams.get("from") || "");
  if (fromLabel) return fromLabel;
  const from = url.searchParams.get("from")?.trim();
  if (from) return cleanLabel(from);

  const src = (url.searchParams.get("utm_source") || "").toLowerCase();
  const mediumLabel = channelLabel(url.searchParams.get("utm_medium") || "") || channelLabel(src);
  if (mediumLabel) return mediumLabel;

  const host = hostOf(referrer);
  if (url.searchParams.has("fbclid") || hostIs(host, ["facebook.com", "fb.com", "messenger.com"])) return "Facebook";
  if (url.searchParams.has("igshid") || hostIs(host, ["instagram.com"])) return "Instagram";
  if (url.searchParams.has("ttclid") || hostIs(host, ["tiktok.com"])) return "TikTok";
  if (url.searchParams.has("gclid") || hostIs(host, ["google.com", "googleadservices.com"])) return "Google";
  if (src) return cleanLabel(src);
  if (url.searchParams.get("invite")) return "Invite";
  if (/^\/plans\/[^/]+/.test(url.pathname) && !url.pathname.startsWith("/plans/new")) return "Shared plan";
  if (/^\/communities\/[^/]+/.test(url.pathname) && !url.pathname.includes("/new")) return "Community link";
  if (host && !host.endsWith("oncommons.co") && host !== "localhost" && host !== "127.0.0.1") {
    return cleanLabel(host);
  }
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/welcome" || path === "/new" || path === "/landing") return "Landing";
  if (path === "/" && !native) return "Landing";
  if (native) return "App";
  return "Direct";
}

function fromLocation(href: string, referrer: string, native: boolean): SignupAttribution | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const landingPath = `${url.pathname}${url.search}`.slice(0, 200);
  return {
    label: classify(url, referrer, native),
    utmSource: clip(url.searchParams.get("utm_source"), 80),
    utmMedium: clip(url.searchParams.get("utm_medium"), 80),
    utmCampaign: clip(url.searchParams.get("utm_campaign"), 120),
    referrer: clip(referrer, 120),
    landingPath,
  };
}

function read(): SignupAttribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupAttribution;
    if (!parsed || typeof parsed.label !== "string" || !parsed.label.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(value: SignupAttribution): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** Stamp a share button so the signup chart can name that channel. */
export function withJoinChannel(url: string, channel: JoinChannel): string {
  try {
    const next = new URL(url);
    if (!next.searchParams.has("from")) next.searchParams.set("from", channel);
    return next.toString();
  } catch {
    return url;
  }
}

/** Call once at startup, before navigation replaces the landing URL. */
export function captureSignupAttribution(): void {
  if (typeof window === "undefined") return;
  if (read()) return;
  const row = fromLocation(window.location.href, document.referrer, isNative());
  if (row) write(row);
}

/**
 * A universal link can arrive after the app has already booted on "/".
 * Keep an ad or landing source, but let a real link replace a blank app open.
 */
export function noteAppLanding(path: string): void {
  if (typeof window === "undefined") return;
  const existing = read();
  const href = path.startsWith("http") ? path : `https://www.oncommons.co${path.startsWith("/") ? path : `/${path}`}`;
  const next = fromLocation(href, existing?.referrer ?? "", isNative());
  if (!next) return;
  if (!existing) {
    write(next);
    return;
  }
  const blank =
    !existing.landingPath ||
    existing.landingPath === "/" ||
    existing.label === "Direct" ||
    existing.label === "App";
  const stronger = next.label !== "Direct" && next.label !== "App";
  if (blank && stronger && !existing.utmSource) write({ ...next, referrer: existing.referrer });
}

export function signupAttributionPayload(): SignupAttribution | undefined {
  return read() ?? undefined;
}
