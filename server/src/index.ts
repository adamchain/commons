import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { plansRouter } from "./routes/plans.js";
import { seedIfEmpty } from "./seed.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const clientUrl = process.env.APP_URL ?? "http://localhost:5173";

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

seedIfEmpty();

app.listen(port, () => {
  console.log(`Commons API listening on http://localhost:${port}`);
});
