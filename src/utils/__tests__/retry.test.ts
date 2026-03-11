import { describe, it, expect, vi } from "vitest";
import { withRetry, isRetryable, RetryableError, TimeoutError } from "../retry.js";

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

  it("does not retry non-retryable errors", async () => {
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    const fn = vi.fn().mockRejectedValue(abort);

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("Aborted");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries RetryableError", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RetryableError("Server error", 500))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries TimeoutError", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TimeoutError("Request timed out"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("isRetryable", () => {
  it("returns true for RetryableError", () => {
    expect(isRetryable(new RetryableError("fail", 500))).toBe(true);
  });

  it("returns true for TimeoutError", () => {
    expect(isRetryable(new TimeoutError())).toBe(true);
  });

  it("returns false for AbortError", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isRetryable(err)).toBe(false);
  });

  it("returns true for TypeError (network failure)", () => {
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
  });

  it("returns true for 429 status", () => {
    const err = Object.assign(new Error("rate limited"), { statusCode: 429 });
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for 400 status", () => {
    const err = Object.assign(new Error("bad request"), { statusCode: 400 });
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for 404 status", () => {
    const err = Object.assign(new Error("not found"), { statusCode: 404 });
    expect(isRetryable(err)).toBe(false);
  });
});
