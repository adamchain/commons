import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";

/**
 * Venue-aggregation endpoints. The Spots grid isn't rendered in the launch
 * client, but every plan now carries a Google Places ID so the data is
 * already accumulating. These read endpoints exist so the grid can light up
 * later without a migration.
 *
 * GET /api/venues          → top venues with plan counts
 * GET /api/venues/:placeId → every plan ever held at this venue
 */
export const venuesRouter = Router();

venuesRouter.get("/", requireAuth, (_req, res) => {
  const venues = store.listVenueStats();
  res.json({ venues });
});

venuesRouter.get("/:placeId/plans", requireAuth, (req, res) => {
  const placeId = String(req.params.placeId ?? "").trim();
  if (!placeId) {
    res.status(400).json({ error: "placeId required" });
    return;
  }
  const plans = store.listPlansByPlaceId(placeId);
  res.json({ plans });
});
