import { describe, it, expect, vi, afterEach } from "vitest";
import { GitHubClient } from "../github.js";
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

describe("GitHubClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts a review comment with correct URL and body", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation((url: string, init) => {
      callCount++;
      capturedUrl = url;
      if (init?.method === "POST") {
        capturedBody = JSON.parse(init.body as string);
      }
      // First call: getHeadSha, Second call: POST review comment
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ head: { sha: "abc123" } }),
        text: () => Promise.resolve(""),
      });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "my-org",
      repo: "my-repo",
    });

    await client.postComment(mockComment, "42");

    // Should have made 2 calls: getHeadSha + POST review comment
    expect(callCount).toBe(2);
    expect(capturedUrl).toBe(
      "https://api.github.com/repos/my-org/my-repo/pulls/42/comments",
    );
    expect(capturedBody.commit_id).toBe("abc123");
    expect(capturedBody.path).toBe("src/app.ts");
    expect(capturedBody.line).toBe(10);
    expect(capturedBody.side).toBe("RIGHT");
    expect(capturedBody.body).toContain("IRA Review");
  });

  it("caches getHeadSha across multiple comments", async () => {
    let fetchCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ head: { sha: "sha-cached" } }),
        text: () => Promise.resolve(""),
      });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "org",
      repo: "repo",
    });

    await client.postComment(mockComment, "1");
    await client.postComment({ ...mockComment, line: 20 }, "1");

    // 1st comment: getHeadSha + POST = 2 calls
    // 2nd comment: POST only (sha cached) = 1 call
    expect(fetchCallCount).toBe(3);
  });

  it("falls back to issue comment when review comment fails", async () => {
    let postUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation((url: string, init) => {
      if (init?.method === "POST") {
        postUrls.push(url);
        // All POSTs to pulls/comments fail (retried 3 times by withRetry)
        if (url.includes("/pulls/")) {
          return Promise.resolve({
            ok: false,
            status: 422,
            text: () => Promise.resolve("Validation failed"),
          });
        }
        // Issue comment succeeds
        return Promise.resolve({ ok: true });
      }
      // GET for sha
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ head: { sha: "abc" } }),
      });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "org",
      repo: "repo",
    });

    await client.postComment(mockComment, "5");

    // withRetry retries the review comment 3 times, then falls back to issue comment
    const pullPosts = postUrls.filter((u) => u.includes("/pulls/5/comments"));
    const issuePosts = postUrls.filter((u) => u.includes("/issues/5/comments"));
    expect(pullPosts.length).toBeGreaterThanOrEqual(1);
    expect(issuePosts).toHaveLength(1);
  });

  it("posts issue comment directly when line is 0", async () => {
    let postUrl = "";

    globalThis.fetch = vi.fn().mockImplementation((url: string, init) => {
      if (init?.method === "POST") postUrl = url;
      return Promise.resolve({ ok: true });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "org",
      repo: "repo",
    });

    await client.postComment({ ...mockComment, line: 0 }, "3");

    expect(postUrl).toContain("/issues/3/comments");
    expect(postUrl).not.toContain("/pulls/");
  });

  it("posts summary to issues endpoint", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    globalThis.fetch = vi.fn().mockImplementation((url: string, init) => {
      capturedUrl = url;
      capturedBody = init?.body as string;
      return Promise.resolve({ ok: true });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "org",
      repo: "repo",
    });

    await client.postSummary("# Summary\nAll good", "7");

    expect(capturedUrl).toBe(
      "https://api.github.com/repos/org/repo/issues/7/comments",
    );
    expect(JSON.parse(capturedBody).body).toBe("# Summary\nAll good");
  });

  it("fetches diff with correct Accept header", async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("diff --git a/file.ts b/file.ts"),
      });
    });

    const client = new GitHubClient({
      token: "gh-tok",
      owner: "org",
      repo: "repo",
    });

    const diff = await client.getDiff("10");

    expect(capturedHeaders.Accept).toBe("application/vnd.github.v3.diff");
    expect(diff).toContain("diff --git");
  });

  it("uses custom base URL for GitHub Enterprise", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ head: { sha: "abc" } }),
      text: () => Promise.resolve(""),
    });

    const client = new GitHubClient({
      token: "tok",
      owner: "org",
      repo: "repo",
      baseUrl: "https://github.corp.com/api/v3",
    });

    await client.postComment(mockComment, "1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://github.corp.com/api/v3/repos/"),
      expect.anything(),
    );
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Bad credentials"),
    });

    const client = new GitHubClient({
      token: "bad-token",
      owner: "org",
      repo: "repo",
    });

    await expect(client.postSummary("test", "1")).rejects.toThrow(
      "GitHub API error (403)",
    );
  });
});
