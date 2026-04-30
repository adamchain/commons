import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { plansRouter } from "./routes/plans.js";
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
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/plans", plansRouter);

if (isProduction) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "../../client/dist");
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

seedIfEmpty();

app.listen(port, () => {
  console.log(`Commons API listening on http://localhost:${port}`);
});
