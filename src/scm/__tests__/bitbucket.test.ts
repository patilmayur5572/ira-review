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
});
