/** Fixed-window limiter kept in memory: fine for a single process, replace with a shared store when scaling out. */
export function createRateLimiter({ max, windowMs, now = Date.now }: { max: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Returns true when the call is allowed, false once `max` calls happened in the window. */
    take(key: string): boolean {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
