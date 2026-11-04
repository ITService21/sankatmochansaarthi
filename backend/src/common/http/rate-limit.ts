import { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

const buckets = new Map<string, number[]>();

/** Test hook: forget all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Tiny fixed-window, in-memory rate limiter keyed by client IP + a bucket name. Good enough for a single
 * instance guarding public forms against spam; use a shared store (Redis) if the API is scaled horizontally.
 * @param name bucket name (separates limits per endpoint)
 * @param max requests allowed per window
 * @param windowMs window length
 * @throws 429 RATE_LIMITED
 */
export const rateLimit = (name: string, max: number, windowMs: number): RequestHandler => (req, _res, next) => {
  const key = `${name}:${req.ip}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
  hits.push(now);
  buckets.set(key, hits);
  next();
};
