import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPublicWebOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_WEB_ORIGIN;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin && !isNative()) {
    return window.location.origin;
  }
  return "https://commons.app";
}
