/**
 * Fixed-window, in-memory rate limiter. Per server instance only, which is fine
 * until the web app runs on more than one instance.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function allow(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

/**
 * The client's IP as seen by the hosting proxy. Prefer X-Real-IP (set by the proxy), then the
 * *last* X-Forwarded-For entry (appended by the proxy). The first entry is whatever the client
 * sent, so trusting it would let anyone dodge rate limits by faking the header.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}
