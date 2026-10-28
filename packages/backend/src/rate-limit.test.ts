import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  const make = () => {
    let t = 0;
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => t });
    return { limiter, advance: (ms: number) => (t += ms) };
  };

  it("allows up to max calls per key, then blocks", () => {
    const { limiter } = make();
    expect([1, 2, 3, 4, 5].map(() => limiter.take("a"))).toEqual([true, true, true, false, false]);
  });

  it("counts keys independently", () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i++) limiter.take("a");
    expect(limiter.take("b")).toBe(true);
  });

  it("allows calls again after the window passes", () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 4; i++) limiter.take("a");
    expect(limiter.take("a")).toBe(false);
    advance(1000);
    expect(limiter.take("a")).toBe(true);
  });

  it("reset clears the count (used after a successful login)", () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i++) limiter.take("a");
    limiter.reset("a");
    expect(limiter.take("a")).toBe(true);
  });
});
