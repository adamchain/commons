import { useEffect, useState } from "react";
import { api } from "../api/http";
import type { NeighborhoodDTO } from "../types/shared";

/**
 * Small module-level cache for the neighborhoods catalog. The list never
 * changes during a session (admin-managed), so one fetch covers every page.
 * Components can call useNeighborhoods() to subscribe to the cached map
 * without each page re-fetching independently.
 */

type Map = Record<string, NeighborhoodDTO>;

let cache: Map | null = null;
let inflight: Promise<Map> | null = null;
const subscribers = new Set<(m: Map) => void>();

async function load(): Promise<Map> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<NeighborhoodDTO[]>("/api/neighborhoods")
    .then((rows) => {
      const m: Map = {};
      for (const r of rows) m[r.id] = r;
      cache = m;
      inflight = null;
      subscribers.forEach((cb) => cb(m));
      return m;
    })
    .catch(() => {
      inflight = null;
      return {};
    });
  return inflight;
}

export function useNeighborhoods(): Map {
  const [val, setVal] = useState<Map>(() => cache ?? {});
  useEffect(() => {
    if (cache) {
      setVal(cache);
      return;
    }
    let cancelled = false;
    const cb = (m: Map) => {
      if (!cancelled) setVal(m);
    };
    subscribers.add(cb);
    void load();
    return () => {
      cancelled = true;
      subscribers.delete(cb);
    };
  }, []);
  return val;
}
