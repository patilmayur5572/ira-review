import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../concurrency.js";

describe("mapWithConcurrency", () => {
  it("processes all items and preserves order", async () => {
    const items = [1, 2, 3, 4, 5];

    const results = await mapWithConcurrency(items, 2, async (n) => n * 10);

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("respects concurrency limit", async () => {
    let activeCalls = 0;
    let maxConcurrent = 0;

    const items = [1, 2, 3, 4, 5, 6];

    await mapWithConcurrency(items, 2, async (n) => {
      activeCalls++;
      maxConcurrent = Math.max(maxConcurrent, activeCalls);
      await new Promise((r) => setTimeout(r, 10));
      activeCalls--;
      return n;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("handles empty input", async () => {
    const results = await mapWithConcurrency([], 5, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("handles concurrency greater than items", async () => {
    const items = [1, 2];
    const results = await mapWithConcurrency(items, 10, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });
});
