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
      // A cached or coarse fix returns as soon as the system permission
      // dialog closes. High accuracy can sit on this screen for the whole timeout.
      const quick = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: Math.min(timeout, 4000),
        maximumAge: 5 * 60 * 1000,
      }).catch(() => null);
      const pos =
        quick ??
        (await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: Math.min(timeout, 5000),
          maximumAge: 0,
        }));
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  const read = (high: boolean, wait: number, maxAge: number) =>
    new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: high, timeout: wait, maximumAge: maxAge },
      );
    });
  return (
    (await read(false, Math.min(timeout, 4000), 5 * 60 * 1000)) ??
    (await read(true, Math.min(timeout, 5000), 0))
  );
}
