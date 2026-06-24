import { Router } from "express";
import { store } from "../store.js";

// Public read of the admin-curated event-card image library. The feed uses
// these as stand-in cover art for plans without their own flyer. No auth — the
// URLs are already shown to every signed-in member, and the payload is just a
// short list of image URLs.
const cardImagesRouter = Router();

cardImagesRouter.get("/", (_req, res) => {
  const images = store.listCardImages().map((c) => c.url);
  res.json({ images });
});

export { cardImagesRouter };
