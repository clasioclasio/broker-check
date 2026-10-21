import type { RequestHandler } from "express";
import { createHash } from "node:crypto";

export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, { count: number; expires: number }>();
  const timer = setInterval(() => {
    for (const [key, bucket] of buckets) if (bucket.expires <= Date.now()) buckets.delete(key);
  }, 60_000);
  timer.unref();
  return (req, res, next) => {
    const key = createHash("sha256").update(req.ip ?? req.socket.remoteAddress ?? "unknown").digest("hex");
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.setHeader("Retry-After", Math.ceil((bucket.expires - now) / 1000));
      res.status(429).json({ error: "Слишком много запросов. Подождите и повторите попытку." });
      return;
    }
    next();
  };
}
