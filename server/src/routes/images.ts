import { Router } from "express";
import { getImage } from "../lib/imageCache.js";

// Public, content-addressed image delivery. See lib/imageCache.ts for why this
// is unauthenticated (native <img> tags can't send the Bearer token) and safe
// (the hash is capability-based — you only get it from an auth-gated payload).
export const imagesRouter = Router();

imagesRouter.get("/:hash", (req, res) => {
  const hash = String(req.params.hash);
  const entry = getImage(hash);
  if (!entry) {
    res.status(404).end();
    return;
  }
  const etag = `"${hash}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  // Content-addressed: the URL changes when the bytes change, so cache forever.
  res.setHeader("Content-Type", entry.mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", etag);
  res.send(entry.buf);
});
