import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type DeviceRecord } from "../store.js";

export const devicesRouter = Router();

devicesRouter.post("/register", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const token = String(req.body?.token ?? "").trim();
  const platformRaw = String(req.body?.platform ?? "").toLowerCase();
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  const platform: DeviceRecord["platform"] =
    platformRaw === "ios" || platformRaw === "android" || platformRaw === "web" ? platformRaw : "web";
  store.registerDevice(userId, token, platform);
  res.json({ ok: true });
});

devicesRouter.post("/unregister", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const token = String(req.body?.token ?? "").trim();
  if (token) store.unregisterDevice(userId, token);
  res.json({ ok: true });
});

export function listDevicesForUser(userId: string): DeviceRecord[] {
  return store.listDevicesForUser(userId);
}
