/** Simple in-memory sliding-window rate limiter (per isolate — good enough for a party-game scale). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the call is allowed, false if the key is over its limit. */
  check(key: string, now: number): boolean {
    const timestamps = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.maxHits) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }
}
