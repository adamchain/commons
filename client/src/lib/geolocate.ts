import { Geolocation } from "@capacitor/geolocation";
import { isNative } from "./platform";

export interface Coords {
  lat: number;
  lng: number;
}

interface Options {
  timeoutMs?: number;
}

// Cross-platform single-shot location. Returns null on permission denied or
// timeout — callers already have fallbacks (saved neighborhood). Resolves
// only the success/fail decision, never throws.
export async function getCurrentCoords(opts: Options = {}): Promise<Coords | null> {
  const timeout = opts.timeoutMs ?? 8000;
  if (isNative()) {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await Geolocation.requestPermissions({ permissions: ["location"] });
        if (req.location !== "granted") return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout,
        maximumAge: 5 * 60 * 1000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 },
    );
  });
}
