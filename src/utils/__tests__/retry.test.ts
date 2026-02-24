import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../retry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow("always fails");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects maxAttempts = 1 (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(
      withRetry(fn, { maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow("fail");

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
