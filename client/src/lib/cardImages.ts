import { useEffect, useState } from "react";
import { api } from "../api/http";

/**
 * Fallback cover art shown when the admin library is empty or hasn't loaded
 * yet. Admins manage the live library from the dashboard (Event card images);
 * once they add their own, those replace these stand-ins everywhere.
 */
export const FALLBACK_COVER_IMAGES = [
  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=60",
];

// Module-level cache so the whole feed shares one fetch instead of one per card.
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
const listeners = new Set<(images: string[]) => void>();

function notify(images: string[]): void {
  for (const fn of listeners) fn(images);
}

async function fetchLibrary(): Promise<string[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api<{ images: string[] }>("/api/card-images")
      .then((r) => {
        cache = r.images;
        notify(cache);
        return cache;
      })
      .catch(() => {
        cache = [];
        notify(cache);
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop the cache so the next read re-fetches — call after admin edits. */
export function invalidateCardImages(): void {
  cache = null;
  void fetchLibrary();
}

/**
 * Returns the curated cover-image pool. Falls back to the bundled stand-ins
 * until the admin library loads (or if it's empty), so cards are never blank.
 */
export function useCardImages(): string[] {
  const [images, setImages] = useState<string[]>(cache ?? []);

  useEffect(() => {
    let active = true;
    const onChange = (next: string[]) => {
      if (active) setImages(next);
    };
    listeners.add(onChange);
    void fetchLibrary();
    return () => {
      active = false;
      listeners.delete(onChange);
    };
  }, []);

  return images.length > 0 ? images : FALLBACK_COVER_IMAGES;
}

/** Deterministic pick from a pool, stable per key (e.g. a plan id). */
export function pickCoverImage(pool: string[], key: string): string {
  if (pool.length === 0) return FALLBACK_COVER_IMAGES[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}
