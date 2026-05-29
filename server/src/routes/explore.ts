import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type CommunityRecord } from "../store.js";
import { haversineKm } from "../lib/geo.js";
import type { CommunityDTO } from "../types/shared.js";

export const exploreRouter = Router();

function parseCoord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function communityDTO(
  community: CommunityRecord,
  origin: { lat: number; lng: number } | null
): CommunityDTO {
  return {
    id: community.id,
    name: community.name,
    category: community.category,
    neighborhood: community.neighborhood,
    blurb: community.blurb,
    cadence: community.cadence,
    memberCount: community.memberCount,
    tags: community.tags,
    link: community.link,
    distanceKm: origin ? haversineKm(origin, { lat: community.lat, lng: community.lng }) : null,
  };
}

// GET /api/explore/communities?lat=&lng=&category=&q=
// Returns nearby communities. When lat/lng are supplied, results carry a
// distance and are sorted nearest-first; otherwise they're ordered by size.
exploreRouter.get("/communities", requireAuth, (req, res) => {
  const lat = parseCoord(req.query.lat);
  const lng = parseCoord(req.query.lng);
  const origin = lat !== null && lng !== null ? { lat, lng } : null;
  const category = String(req.query.category ?? "").trim().toLowerCase();
  const q = String(req.query.q ?? "").trim().toLowerCase();

  let list = store.listCommunities().map((c) => communityDTO(c, origin));

  if (category) {
    list = list.filter((c) => c.category === category);
  }
  if (q) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.neighborhood.toLowerCase().includes(q) ||
        c.blurb.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    return b.memberCount - a.memberCount;
  });

  res.json(list);
});
