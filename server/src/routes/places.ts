import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const placesRouter = Router();

const PHILLY = "39.9526,-75.1652";

function googleKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim();
}

/** Legacy Places Autocomplete — key stays on server. */
placesRouter.get("/autocomplete", requireAuth, async (req, res) => {
  const key = googleKey();
  const input = String(req.query.q ?? "").trim();
  if (!key) {
    res.status(503).json({ error: "Places API not configured", predictions: [] });
    return;
  }
  if (input.length < 2) {
    res.json({ predictions: [] });
    return;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", key);
  url.searchParams.set("location", PHILLY);
  url.searchParams.set("radius", "40000");
  url.searchParams.set("types", "establishment");
  try {
    const r = await fetch(url);
    const data = (await r.json()) as {
      predictions?: Array<{
        description: string;
        place_id: string;
        structured_formatting?: { main_text: string; secondary_text?: string };
      }>;
      status: string;
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("[places] autocomplete", data.status);
      res.status(502).json({ error: "Places lookup failed", predictions: [] });
      return;
    }
    const predictions = (data.predictions ?? []).slice(0, 8).map((p) => ({
      placeId: p.place_id,
      name: p.structured_formatting?.main_text ?? p.description.split(",")[0]?.trim() ?? "",
      address: p.description,
    }));
    res.json({ predictions });
  } catch (e) {
    console.error("[places] autocomplete fetch", e);
    res.status(502).json({ error: "Places lookup failed", predictions: [] });
  }
});

placesRouter.get("/details", requireAuth, async (req, res) => {
  const key = googleKey();
  const placeId = String(req.query.placeId ?? "").trim();
  if (!key) {
    res.status(503).json({ error: "Places API not configured" });
    return;
  }
  if (!placeId) {
    res.status(400).json({ error: "placeId required" });
    return;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,formatted_address,geometry");
  url.searchParams.set("key", key);
  try {
    const r = await fetch(url);
    const data = (await r.json()) as {
      result?: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      };
      status: string;
    };
    if (data.status !== "OK" || !data.result) {
      res.status(404).json({ error: "Place not found" });
      return;
    }
    const { result } = data;
    res.json({
      name: result.name ?? "",
      address: result.formatted_address ?? "",
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng,
    });
  } catch (e) {
    console.error("[places] details fetch", e);
    res.status(502).json({ error: "Place details failed" });
  }
});
