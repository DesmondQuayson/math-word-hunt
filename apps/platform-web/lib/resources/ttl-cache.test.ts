import { describe, expect, it, vi } from "vitest";

import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  it("loads once per TTL window and returns the cached value, including null", async () => {
    let now = 1_000;
    const load = vi.fn(async () => null as string | null);
    const cache = createTtlCache(load, 60_000, () => now);
    expect(await cache.read()).toBeNull();
    expect(await cache.read()).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.remainingMs()).toBe(60_000);
    now += 59_999;
    expect(await cache.read()).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    now += 1;
    expect(await cache.read()).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent readers", async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const cache = createTtlCache(load, 1_000, () => 0);
    const first = cache.read();
    const second = cache.read();
    expect(load).toHaveBeenCalledTimes(1);
    resolve("destination");
    expect(await first).toBe("destination");
    expect(await second).toBe("destination");
  });

  it("does not cache a failed load, so the next read retries", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("supabase down")).mockResolvedValueOnce("ok");
    const cache = createTtlCache(load, 1_000, () => 0);
    await expect(cache.read()).rejects.toThrow("supabase down");
    expect(await cache.read()).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces the next read to load again so admin publishes propagate immediately on this instance", async () => {
    const values = ["v1", "v2"];
    const load = vi.fn(async () => values.shift() ?? "exhausted");
    const cache = createTtlCache(load, 60_000, () => 0);
    expect(await cache.read()).toBe("v1");
    cache.invalidate();
    expect(cache.remainingMs()).toBe(0);
    expect(await cache.read()).toBe("v2");
  });

  it("rejects a non-positive TTL", () => {
    expect(() => createTtlCache(async () => 1, 0)).toThrow(/positive/);
  });
});
