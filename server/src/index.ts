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
import { chatRouter } from "./routes/chat.js";
import { feedbackRouter } from "./routes/feedback.js";
import { neighborhoodsRouter } from "./routes/neighborhoods.js";
import { notificationsRouter } from "./routes/notifications.js";
import { plansRouter } from "./routes/plans.js";
import { profileRouter } from "./routes/profile.js";
import { placesRouter } from "./routes/places.js";
import { startNudgeSchedulers } from "./lib/nudges.js";
import { seedIfEmpty } from "./seed.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const clientUrl = process.env.APP_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: clientUrl,
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
app.use("/api/plans", plansRouter);
app.use("/api/places", placesRouter);
app.use("/api/neighborhoods", neighborhoodsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/profile", profileRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api", chatRouter); // chat router defines its own paths under /plans/.../conversation and /conversations/...

if (isProduction) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "../../client/dist");
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
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
