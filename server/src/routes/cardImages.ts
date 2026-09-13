import { Router } from "express";
import { buildCoverCatalog } from "../lib/coverCatalog.js";

// Public read of the admin-curated event-card image library. The feed uses
// these as stand-in cover art for plans without their own flyer. No auth — the
// URLs are already shown to every signed-in member, and the payload is just a
// short list of image URLs.
const cardImagesRouter = Router();

cardImagesRouter.get("/", async (_req, res) => {
  try {
    const categories = await buildCoverCatalog();
    const images = [...new Set(categories.flatMap((c) => c.images.map((i) => i.url)))];
    res.json({ images });
  } catch (err) {
    console.error("[card-images] pool failed", err);
    res.json({ images: [] });
  }
});

// Categorized cover library for create-plan. GCS defaults/ folders plus
// admin-uploaded rows grouped by category.
cardImagesRouter.get("/catalog", async (_req, res) => {
  try {
    const categories = await buildCoverCatalog();
    res.json({ categories });
  } catch (err) {
    console.error("[card-images] catalog failed", err);
    res.json({ categories: [] });
  }
});

export { cardImagesRouter };
