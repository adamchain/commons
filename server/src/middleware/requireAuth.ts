import type { NextFunction, Request, Response } from "express";
import { verifySessionToken } from "../lib/jwt.js";
import { findUserById } from "../userRepo.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

function tokenFromRequest(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim() || undefined;
  }
  return req.cookies?.session as string | undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifySessionToken(token);
    const user = await findUserById(payload.sub);
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
