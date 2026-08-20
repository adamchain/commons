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

interface PlacePrediction {
  placeId: string;
  name: string;
  address: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
}

function dedupePredictions(items: PlacePrediction[], limit = 8): PlacePrediction[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: PlacePrediction[] = [];
  for (const p of items) {
    if (!p.placeId || !p.name.trim()) continue;
    const nameKey = p.name.trim().toLowerCase();
    if (seenIds.has(p.placeId) || seenNames.has(nameKey)) continue;
    seenIds.add(p.placeId);
    seenNames.add(nameKey);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** True when the place name covers the typed query (all words, or substring). */
function nameCoversQuery(name: string, query: string): boolean {
  const n = name.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!n || !q) return false;
  if (n.includes(q)) return true;
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return words.length > 0 && words.every((w) => n.includes(w));
}

/** Parks/squares first when the typed query is in the name — Autocomplete is prefix-oriented. */
function rankPredictions(items: PlacePrediction[], query: string): PlacePrediction[] {
  const q = query.trim().toLowerCase();
  const score = (p: PlacePrediction) => {
    const name = p.name.trim().toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (nameCoversQuery(name, q)) return 3;
    return 4;
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

/** OpenStreetMap fallback so parks/landmarks still resolve when Google is empty or down. */
async function nominatimSearch(q: string): Promise<PlacePrediction[]> {
  if (q.trim().length < 2) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=us&viewbox=-75.60,40.20,-74.90,39.70&bounded=0` +
    `&q=${encodeURIComponent(q)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Commons/1.0 (venue-search)",
      },
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as Array<{
      place_id?: number;
      display_name: string;
      name?: string;
      lat?: string;
      lon?: string;
    }>;
    return rows.map((row, i) => {
      const name =
        (row.name && row.name.trim()) ||
        row.display_name.split(",")[0]?.trim() ||
        row.display_name;
      return {
        placeId: `osm-${row.place_id ?? i}-${row.lat ?? ""}`,
        name,
        address: row.display_name,
        lat: row.lat ? Number(row.lat) : undefined,
        lng: row.lon ? Number(row.lon) : undefined,
      };
    });
  } catch (e) {
    console.error("[places] nominatim", e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function googleAutocomplete(input: string, key: string): Promise<PlacePrediction[]> {
  const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["us"],
      locationBias: phillyCircle(),
      languageCode: "en",
    }),
  });
  const data = (await r.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        place?: string;
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }>;
    error?: { message?: string };
  };
  if (!r.ok) {
    console.error("[places] autocomplete", data.error?.message ?? r.status);
    return [];
  }
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const fullText = p.text?.text ?? "";
      const name =
        p.structuredFormat?.mainText?.text ??
        fullText.split(",")[0]?.trim() ??
        "";
      const address =
        p.structuredFormat?.secondaryText?.text
          ? `${name}, ${p.structuredFormat.secondaryText.text}`
          : fullText;
      const rawId = p.placeId || p.place || "";
      const placeId = rawId.replace(/^places\//, "");
      return { placeId, name, address };
    });
}

/**
 * Autocomplete (Places API New). Parks and landmarks often miss Autocomplete,
 * so we fall through to Text Search, then OpenStreetMap — always 200 with
 * `predictions` so the create-plan dropdown can show live suggestions.
 */
placesRouter.get("/autocomplete", requireAuth, async (req, res) => {
  const input = String(req.query.q ?? "").trim();
  if (input.length < 2) {
    res.json({ predictions: [] });
    return;
  }
  try {
    const key = googleKey();
    let predictions: PlacePrediction[] = [];
    if (key) {
      // Autocomplete is prefix-oriented and weak on parks/squares ("Rittenhouse
      // Square" often loses to the neighborhood or a hotel). Always merge Text
      // Search so a well-known venue name surfaces even when Autocomplete is
      // empty or only has a looser partial hit.
      const [autoHits, textHits] = await Promise.all([
        googleAutocomplete(input, key),
        googleTextSearch(input, key),
      ]);
      predictions = rankPredictions(dedupePredictions([...textHits, ...autoHits]), input);
    }
    if (predictions.length === 0) {
      predictions = rankPredictions(dedupePredictions(await nominatimSearch(input)), input);
    }
    res.json({ predictions });
  } catch (e) {
    console.error("[places] autocomplete fetch", e);
    try {
      const fallback = dedupePredictions(await nominatimSearch(input));
      res.json({ predictions: fallback });
    } catch {
      res.json({ predictions: [] });
    }
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

function mapTextSearchPlace(p: NewPlace): PlacePrediction & {
  photoRef?: string;
  rating?: number;
  ratings?: number;
} {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    neighborhood: neighborhoodOf(p),
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    photoRef: p.photos?.[0]?.name,
    rating: p.rating,
    ratings: p.userRatingCount,
  };
}

async function googleTextSearch(query: string, key: string): Promise<ReturnType<typeof mapTextSearchPlace>[]> {
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
    return [];
  }
  const raw = data.places ?? [];
  const usOnly = raw.filter((p) => /,\s*USA$/.test(p.formattedAddress ?? ""));
  return (usOnly.length ? usOnly : raw).slice(0, 12).map(mapTextSearchPlace);
}

/**
 * Text Search (Places API New). Falls back to OpenStreetMap when Google is
 * unset, empty, or down — same `results` shape as before.
 */
placesRouter.get("/search", requireAuth, async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) {
    res.json({ results: [] });
    return;
  }
  try {
    const key = googleKey();
    let results: PlacePrediction[] = [];
    if (key) {
      results = await googleTextSearch(query, key);
    }
    if (results.length === 0) {
      results = await nominatimSearch(query);
    }
    res.json({ results });
  } catch (e) {
    console.error("[places] search fetch", e);
    const fallback = await nominatimSearch(query);
    res.json({ results: fallback });
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
  // Autocomplete may hand back either a bare Place ID or a resource name
  // ("places/ChIJ…"). Details always wants the bare id in the path segment.
  const rawPlaceId = String(req.query.placeId ?? "").trim();
  const placeId = rawPlaceId.replace(/^places\//, "");
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
