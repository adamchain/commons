import type { NextFunction, Request, Response } from "express";
import { verifySessionToken } from "../lib/jwt.js";
import { store } from "../store.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.session as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifySessionToken(token);
    const user = store.findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
