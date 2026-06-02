import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

interface DeviceRecord {
  userId: string;
  token: string;
  platform: "ios" | "android" | "web";
  updatedAt: string;
}

// In-memory only for now. Wire to Mongo when APNs send-side is ready.
const devices = new Map<string, DeviceRecord>();

function key(userId: string, token: string): string {
  return `${userId}:${token}`;
}

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
  devices.set(key(userId, token), { userId, token, platform, updatedAt: new Date().toISOString() });
  res.json({ ok: true });
});

devicesRouter.post("/unregister", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const token = String(req.body?.token ?? "").trim();
  if (token) devices.delete(key(userId, token));
  res.json({ ok: true });
});

export function listDevicesForUser(userId: string): DeviceRecord[] {
  const out: DeviceRecord[] = [];
  for (const d of devices.values()) {
    if (d.userId === userId) out.push(d);
  }
  return out;
}
