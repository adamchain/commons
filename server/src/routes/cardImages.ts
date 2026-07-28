import { Router } from "express";
import { store } from "../store.js";
import { isGcsConfigured, listDefaultCatalog } from "../lib/gcs.js";

// Public read of the admin-curated event-card image library. The feed uses
// these as stand-in cover art for plans without their own flyer. No auth — the
// URLs are already shown to every signed-in member, and the payload is just a
// short list of image URLs.
const cardImagesRouter = Router();

cardImagesRouter.get("/", (_req, res) => {
  const images = store.listCardImages().map((c) => c.url);
  res.json({ images });
});

// Categorized cover library for create-plan. Prefers the GCS defaults/ folders
// (Coffee, Food, Events, …); falls back to a flat "Library" group from the
// admin-curated store when GCS isn't configured or the folder is empty.
cardImagesRouter.get("/catalog", async (_req, res) => {
  try {
    if (isGcsConfigured()) {
      const categories = await listDefaultCatalog();
      if (categories.length > 0) {
        res.json({ categories });
        return;
      }
    }
  } catch (err) {
    console.error("[card-images] catalog GCS list failed", err);
    // Fall through to the admin library rather than 502 — picker should still work.
  }

  const images = store.listCardImages().map((c) => ({
    url: c.url,
    label: c.label ?? "Cover",
    category: "Library",
  }));
  res.json({
    categories:
      images.length > 0
        ? [{ id: "library", label: "Library", images }]
        : [],
  });
});

export { cardImagesRouter };
