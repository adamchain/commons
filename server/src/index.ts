import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { connectMongo } from "./lib/db.js";
import { hydrateSnapshotFromMongo } from "./hydrate.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { cardImagesRouter } from "./routes/cardImages.js";
import { chatRouter } from "./routes/chat.js";
import { communitiesRouter } from "./routes/communities.js";
import { devicesRouter } from "./routes/devices.js";
import { feedbackRouter } from "./routes/feedback.js";
import { forumsRouter } from "./routes/forums.js";
import { neighborhoodsRouter } from "./routes/neighborhoods.js";
import { notificationsRouter } from "./routes/notifications.js";
import { plansRouter } from "./routes/plans.js";
import { profileRouter } from "./routes/profile.js";
import { placesRouter } from "./routes/places.js";
import { venuesRouter } from "./routes/venues.js";
import { linkPreviewRouter } from "./routes/linkPreview.js";
import { searchRouter } from "./routes/search.js";
import { usersRouter } from "./routes/users.js";
import { shareRouter, injectPlanMeta, planIdFromDetailPath } from "./routes/share.js";
import { store } from "./store.js";
import { readFileSync } from "node:fs";
import { startNudgeSchedulers } from "./lib/nudges.js";
import { seedIfEmpty } from "./seed.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const clientUrl = process.env.APP_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";

// Web build uses cookie auth with credentials; Capacitor builds use Bearer
// tokens from capacitor://localhost (iOS) or http://localhost (Android).
const NATIVE_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origin === clientUrl || NATIVE_ORIGINS.has(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
  })
);
// Lift the default 100KB cap so resized avatar data URLs and richer plan
// payloads fit; resized 512px JPEGs are usually < 100KB but headroom matters.
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter);
app.use("/api/card-images", cardImagesRouter);
app.use("/api/communities", communitiesRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/plans", plansRouter);
app.use("/api/places", placesRouter);
app.use("/api/venues", venuesRouter);
app.use("/api/neighborhoods", neighborhoodsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/forums", forumsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/link-preview", linkPreviewRouter);
app.use("/api/search", searchRouter);
app.use("/api/users", usersRouter);
app.use("/api", chatRouter); // chat router defines its own paths under /plans/.../conversation and /conversations/...

// Public share-card image endpoint (no auth — crawlers fetch it). Reachable in
// dev (localhost:4000) and prod alike, before the SPA catch-all.
app.use(shareRouter);

// Absolute public base for og:* URLs: prefer the configured origin, else derive
// from the request so previews work on any deploy/preview host.
function publicOrigin(req: express.Request): string {
  const env = process.env.APP_URL?.trim();
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

if (isProduction) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "../../client/dist");
  const indexHtml = readFileSync(path.join(clientDist, "index.html"), "utf8");
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    // Give plan-detail links (/plans/:id) their own social preview by injecting
    // plan-specific OG/Twitter tags; the SPA still boots on top for real users.
    const planId = planIdFromDetailPath(req.path);
    if (planId) {
      const plan = store.findPlanById(planId);
      if (plan) {
        res.setHeader("Cache-Control", "public, max-age=120");
        res.type("html").send(injectPlanMeta(indexHtml, plan, publicOrigin(req)));
        return;
      }
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function bootstrap(): Promise<void> {
  await connectMongo();
  // Mongo is the source of truth. After connecting, pull everything into the
  // in-memory snapshot so sync reads in `store` see prod data on a cold
  // container start. If Mongo isn't connected (no MONGODB_URI), the snapshot
  // keeps whatever it loaded from data.json (local dev).
  await hydrateSnapshotFromMongo();
  // Idempotent — fills any missing InterestTag forum rows after hydrate (or
  // when Mongo is offline and the snapshot came from data.json).
  store.ensureForumsForInterests();
  await seedIfEmpty();
  startNudgeSchedulers();

  app.listen(port, () => {
    console.log(`Commons API listening on http://localhost:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("[boot]", err);
  process.exit(1);
});
