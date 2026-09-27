import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * In-memory fixed window. One process only — enough as a backstop in front of
 * Twilio on a single Railway instance. Returns null from `key` to skip.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key: (req: Request) => string | null;
}) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const id = opts.key(req);
    if (!id) {
      next();
      return;
    }
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(k);
      }
    }
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
      return;
    }
    next();
  };
}
