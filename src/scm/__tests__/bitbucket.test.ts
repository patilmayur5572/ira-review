import { describe, it, expect, vi, afterEach } from "vitest";
import { BitbucketClient } from "../bitbucket.js";
import type { ReviewComment } from "../../types/review.js";

const mockComment: ReviewComment = {
  filePath: "src/app.ts",
  line: 10,
  rule: "typescript:S1234",
  severity: "BLOCKER",
  message: "Fix this issue",
  aiReview: {
    explanation: "This is a problem because...",
    impact: "Could cause runtime errors",
    suggestedFix: "Use const instead of let",
  },
};

describe("BitbucketClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts an inline comment to the correct URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    await client.postComment(mockComment, "42");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.bitbucket.org/2.0/repositories/my-ws/my-repo/pullrequests/42/comments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer bb-token",
        }),
      }),
    );
  });

  it("sends correct inline comment body", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve({ ok: true });
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    await client.postComment(mockComment, "42");

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.inline.path).toBe("src/app.ts");
    expect(parsed.inline.to).toBe(10);
    expect(parsed.content.raw).toContain("IRA Review");
    expect(parsed.content.raw).toContain("typescript:S1234");
    expect(parsed.content.raw).toContain("This is a problem because...");
  });

  it("uses custom base URL for self-hosted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const client = new BitbucketClient({
      token: "tok",
      workspace: "ws",
      repoSlug: "repo",
      baseUrl: "https://bb.internal.com/rest/api/1.0",
    });

    await client.postComment(mockComment, "1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://bb.internal.com/rest/api/1.0/repositories"),
      expect.anything(),
    );
  });

  it("fetches PR diff", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("diff --git a/file.ts b/file.ts\n+added line"),
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    const diff = await client.getDiff("42");

    expect(diff).toContain("diff --git");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.bitbucket.org/2.0/repositories/my-ws/my-repo/pullrequests/42/diff",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer bb-token",
        }),
      }),
    );
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    const client = new BitbucketClient({
      token: "bad-token",
      workspace: "ws",
      repoSlug: "repo",
    });

    await expect(client.postComment(mockComment, "1")).rejects.toThrow(
      "Bitbucket API error (403)",
    );
  });

  it("fetches per-file diffs successfully", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/diffstat")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            values: [
              { new: { path: "src/a.ts" }, status: "modified" },
              { new: { path: "src/b.ts" }, status: "added" },
            ],
          }),
        });
      }
      if (url.includes("path=src/a.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-a") });
      }
      if (url.includes("path=src/b.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-b") });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    const result = await client.getDiffPerFile("10");

    expect(result.size).toBe(2);
    expect(result.get("src/a.ts")).toBe("diff-a");
    expect(result.get("src/b.ts")).toBe("diff-b");
  });

  it("skips removed files in diffstat", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/diffstat")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            values: [
              { old: { path: "src/removed.ts" }, status: "removed" },
              { new: { path: "src/kept.ts" }, status: "modified" },
            ],
          }),
        });
      }
      if (url.includes("path=src/kept.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-kept") });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    const result = await client.getDiffPerFile("10");

    expect(result.size).toBe(1);
    expect(result.has("src/removed.ts")).toBe(false);
    expect(result.get("src/kept.ts")).toBe("diff-kept");
  });

  it("paginates diffstat", async () => {
    const page2Url = "https://api.bitbucket.org/2.0/repositories/my-ws/my-repo/pullrequests/10/diffstat?pagelen=100&page=2";

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/diffstat") && !url.includes("page=2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            values: [
              { new: { path: "src/page1.ts" }, status: "modified" },
            ],
            next: page2Url,
          }),
        });
      }
      if (url.includes("page=2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            values: [
              { new: { path: "src/page2.ts" }, status: "added" },
            ],
          }),
        });
      }
      if (url.includes("path=src/page1.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-p1") });
      }
      if (url.includes("path=src/page2.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-p2") });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    const result = await client.getDiffPerFile("10");

    expect(result.size).toBe(2);
    expect(result.get("src/page1.ts")).toBe("diff-p1");
    expect(result.get("src/page2.ts")).toBe("diff-p2");
  });

  it("soft-fails on individual file diff errors", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/diffstat")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            values: [
              { new: { path: "src/ok.ts" }, status: "modified" },
              { new: { path: "src/fail.ts" }, status: "modified" },
            ],
          }),
        });
      }
      if (url.includes("path=src/ok.ts")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("diff-ok") });
      }
      if (url.includes("path=src/fail.ts")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Not Found"),
        });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const client = new BitbucketClient({
      token: "bb-token",
      workspace: "my-ws",
      repoSlug: "my-repo",
    });

    const result = await client.getDiffPerFile("10");

    expect(result.size).toBe(1);
    expect(result.get("src/ok.ts")).toBe("diff-ok");
    expect(result.has("src/fail.ts")).toBe(false);
  });
});
