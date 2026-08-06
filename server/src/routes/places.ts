import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const placesRouter = Router();

// Philly metro — used to bias all lookups toward where the app lives.
const PHILLY_LAT = 39.9526;
const PHILLY_LNG = -75.1652;
const BIAS_RADIUS_M = 40000;

const PLACES_BASE = "https://places.googleapis.com/v1";

function googleKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim();
}

function phillyCircle(radius = BIAS_RADIUS_M) {
  return { circle: { center: { latitude: PHILLY_LAT, longitude: PHILLY_LNG }, radius } };
}

/**
 * Autocomplete (Places API New). Returns { predictions: [{ placeId, name, address }] }
 * — the same shape the legacy endpoint returned, so the client is unchanged.
 */
placesRouter.get("/autocomplete", requireAuth, async (req, res) => {
  const key = googleKey();
  const input = String(req.query.q ?? "").trim();
  if (!key) {
    res.json({ predictions: [] });
    return;
  }
  if (input.length < 2) {
    res.json({ predictions: [] });
    return;
  }
  try {
    const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["us"],
        locationBias: phillyCircle(),
      }),
    });
    const data = (await r.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string } };
        };
      }>;
      error?: { message?: string };
    };
    if (!r.ok) {
      console.error("[places] autocomplete", data.error?.message ?? r.status);
      res.status(502).json({ error: "Places lookup failed", predictions: [] });
      return;
    }
    const predictions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 8)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text?.split(",")[0]?.trim() ?? "",
        address: p.text?.text ?? "",
      }));
    res.json({ predictions });
  } catch (e) {
    console.error("[places] autocomplete fetch", e);
    res.status(502).json({ error: "Places lookup failed", predictions: [] });
  }
});

interface NewPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: Array<{ name: string }>;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
}

/** Best-effort "Fishtown"-style neighborhood name from Places address components. */
function neighborhoodOf(p: NewPlace): string | undefined {
  const comps = p.addressComponents ?? [];
  const hit = comps.find((c) => c.types?.includes("neighborhood"))
    ?? comps.find((c) => c.types?.includes("sublocality_level_1"))
    ?? comps.find((c) => c.types?.includes("sublocality"));
  return hit?.longText ?? hit?.shortText;
}

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.photos",
  "places.rating",
  "places.userRatingCount",
  "places.addressComponents",
].join(",");

/**
 * Text Search (Places API New) — Explore's location search box. Same response
 * shape as before. Foreign hits are dropped (US addresses end with "USA").
 */
placesRouter.get("/search", requireAuth, async (req, res) => {
  const key = googleKey();
  const query = String(req.query.q ?? "").trim();
  if (!key) {
    res.json({ results: [] });
    return;
  }
  if (query.length < 2) {
    res.json({ results: [] });
    return;
  }
  try {
    const r = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, regionCode: "us", locationBias: phillyCircle() }),
    });
    const data = (await r.json()) as { places?: NewPlace[]; error?: { message?: string } };
    if (!r.ok) {
      console.error("[places] search", data.error?.message ?? r.status);
      res.status(502).json({ error: "Places search failed", results: [] });
      return;
    }
    const raw = data.places ?? [];
    const usOnly = raw.filter((p) => /,\s*USA$/.test(p.formattedAddress ?? ""));
    const results = (usOnly.length ? usOnly : raw).slice(0, 12).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      neighborhood: neighborhoodOf(p),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      photoRef: p.photos?.[0]?.name,
      rating: p.rating,
      ratings: p.userRatingCount,
    }));
    res.json({ results });
  } catch (e) {
    console.error("[places] search fetch", e);
    res.status(502).json({ error: "Places search failed", results: [] });
  }
});

/** Google place types we allow as Explore category filters. */
const NEARBY_TYPES = new Set(["cafe", "restaurant", "bar", "gym", "park", "tourist_attraction"]);

const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.photos",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
].join(",");

function mapNearbyPlace(p: NewPlace) {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.shortFormattedAddress ?? p.formattedAddress ?? "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    photoRef: p.photos?.[0]?.name,
    rating: p.rating,
    ratings: p.userRatingCount,
    openNow: p.currentOpeningHours?.openNow,
  };
}

/**
 * Nearby (Places API New). Without a keyword we use Nearby Search; with one we
 * fall back to Text Search biased to the point (Nearby Search New has no
 * free-text keyword). Same response shape as the legacy endpoint.
 */
placesRouter.get("/nearby", requireAuth, async (req, res) => {
  const key = googleKey();
  if (!key) {
    res.json({ results: [] });
    return;
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat and lng required", results: [] });
    return;
  }
  const radius = Math.min(5000, Math.max(250, Number(req.query.radius ?? 1500) || 1500));
  const typeParam = String(req.query.type ?? "").trim();
  const type = NEARBY_TYPES.has(typeParam) ? typeParam : "";
  const keyword = String(req.query.q ?? "").trim();
  const circle = { center: { latitude: lat, longitude: lng }, radius };

  try {
    let r: Response;
    if (keyword) {
      r = await fetch(`${PLACES_BASE}/places:searchText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": NEARBY_FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: keyword, locationBias: { circle }, maxResultCount: 20 }),
      });
    } else {
      r = await fetch(`${PLACES_BASE}/places:searchNearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": NEARBY_FIELD_MASK,
        },
        body: JSON.stringify({
          ...(type ? { includedTypes: [type] } : {}),
          maxResultCount: 20,
          locationRestriction: { circle },
        }),
      });
    }
    const data = (await r.json()) as { places?: NewPlace[]; error?: { message?: string } };
    if (!r.ok) {
      console.error("[places] nearby", data.error?.message ?? r.status);
      res.status(502).json({ error: "Nearby lookup failed", results: [] });
      return;
    }
    res.json({ results: (data.places ?? []).slice(0, 20).map(mapNearbyPlace) });
  } catch (e) {
    console.error("[places] nearby fetch", e);
    res.status(502).json({ error: "Nearby lookup failed", results: [] });
  }
});

/**
 * Proxy a Place Photo (Places API New media endpoint) so the API key never
 * leaves the server. `ref` is the photo resource name, e.g.
 * "places/XXX/photos/YYY".
 */
placesRouter.get("/photo", requireAuth, async (req, res) => {
  const key = googleKey();
  const photoName = String(req.query.ref ?? "").trim();
  const maxwidth = Math.min(1024, Math.max(64, Number(req.query.w ?? 400) || 400));
  if (!key || !photoName.startsWith("places/")) {
    res.status(400).end();
    return;
  }
  const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxwidth}&key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok || !r.body) {
      res.status(502).end();
      return;
    }
    res.setHeader("Content-Type", r.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    console.error("[places] photo fetch", e);
    res.status(502).end();
  }
});

/** Place Details (Places API New). Same response shape as before. */
placesRouter.get("/details", requireAuth, async (req, res) => {
  const key = googleKey();
  const placeId = String(req.query.placeId ?? "").trim();
  if (!key) {
    res.status(404).json({ error: "Place not found" });
    return;
  }
  if (!placeId) {
    res.status(400).json({ error: "placeId required" });
    return;
  }
  try {
    const r = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "displayName,formattedAddress,location",
      },
    });
    const data = (await r.json()) as {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      error?: { message?: string };
    };
    if (!r.ok) {
      console.error("[places] details", data.error?.message ?? r.status);
      res.status(404).json({ error: "Place not found" });
      return;
    }
    res.json({
      name: data.displayName?.text ?? "",
      address: data.formattedAddress ?? "",
      lat: data.location?.latitude,
      lng: data.location?.longitude,
    });
  } catch (e) {
    console.error("[places] details fetch", e);
    res.status(502).json({ error: "Place details failed" });
  }
});
