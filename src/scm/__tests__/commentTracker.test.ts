import { describe, it, expect, vi, afterEach } from "vitest";
import { CommentTracker, deduplicateKey } from "../commentTracker.js";

describe("CommentTracker", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns existing IRA comment locations", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          values: [
            {
              id: 1,
              content: { raw: "🔍 **IRA Review** — `rule` (BLOCKER)" },
              inline: { path: "src/app.ts", to: 10 },
            },
            {
              id: 2,
              content: { raw: "Some other comment" },
              inline: { path: "src/app.ts", to: 20 },
            },
            {
              id: 3,
              content: { raw: "🔍 **IRA Review** — `rule2` (CRITICAL)" },
              inline: { path: "src/utils.ts", to: 5 },
            },
          ],
        }),
    });

    const tracker = new CommentTracker({
      token: "tok",
      workspace: "ws",
      repoSlug: "repo",
    });

    const existing = await tracker.getExistingIraComments("42");

    expect(existing.size).toBe(2);
    expect(existing.has("src/app.ts:10")).toBe(true);
    expect(existing.has("src/utils.ts:5")).toBe(true);
    expect(existing.has("src/app.ts:20")).toBe(false);
  });

  it("handles empty comment list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [] }),
    });

    const tracker = new CommentTracker({
      token: "tok",
      workspace: "ws",
      repoSlug: "repo",
    });

    const existing = await tracker.getExistingIraComments("1");
    expect(existing.size).toBe(0);
  });
});

describe("deduplicateKey", () => {
  it("builds key from file and line", () => {
    expect(deduplicateKey("src/app.ts", 10)).toBe("src/app.ts:10");
  });
});
