import { describe, it, expect, vi, afterEach } from "vitest";
import { BitbucketServerClient, convertBBServerDiffToUnified } from "../bitbucketServer.js";
import type { ReviewComment } from "../../types/review.js";
import type { BitbucketConfig } from "../../types/config.js";

const mockComment: ReviewComment = {
  filePath: "src/foo/bar.ts",
  line: 42,
  rule: "team:no-magic-numbers",
  severity: "MAJOR",
  message: "Magic number — extract a constant.",
  aiReview: {
    explanation: "Magic numbers hurt readability.",
    impact: "Future maintainers will need to guess intent.",
    suggestedFix: "const TIMEOUT_MS = 5000;",
  },
};

describe("BitbucketServerClient", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeClient(opts: { commentStyle?: "compact" | "detailed" } = {}) {
    return new BitbucketServerClient(
      {
        baseUrl: "https://bitbucket.example.com",
        token: "pat-1234",
        workspace: "PROJ",
        repoSlug: "my-repo",
      },
      opts,
    );
  }

  it("posts an inline comment with anchor.lineType=ADDED + fileType=TO", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => "" } });
    });

    await makeClient().postComment(mockComment, "7");

    expect(capturedUrl).toBe(
      "https://bitbucket.example.com/rest/api/1.0/projects/PROJ/repos/my-repo/pull-requests/7/comments",
    );
    expect(capturedBody.text).toContain("<!-- ira:file=src/foo/bar.ts;line=42;rule=team:no-magic-numbers -->");
    expect(capturedBody.anchor).toEqual({
      path: "src/foo/bar.ts",
      line: 42,
      lineType: "ADDED",
      fileType: "TO",
    });
  });

  it("strips trailing /rest/api/1.0 from baseUrl if user passed one", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, headers: { get: () => "" } });
    });

    const client = new BitbucketServerClient({
      baseUrl: "https://bitbucket.example.com/rest/api/1.0/",
      token: "tok",
      workspace: "PROJ",
      repoSlug: "repo",
    });
    await client.postSummary("hello", "1");

    expect(capturedUrl).toBe(
      "https://bitbucket.example.com/rest/api/1.0/projects/PROJ/repos/repo/pull-requests/1/comments",
    );
  });

  it("retries inline comment as general comment when 400", async () => {
    let calls = 0;
    let lastBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      calls++;
      lastBody = JSON.parse(init.body as string);
      // First (inline) → 400; second (general) → 200
      const inlineFail = { ok: false, status: 400, text: () => Promise.resolve("line not in diff"), headers: { get: (_k: string): string => "" } };
      const ok = { ok: true, status: 200, headers: { get: (_k: string): string => "" } };
      return Promise.resolve(calls === 1 ? inlineFail : ok);
    });

    await makeClient().postComment(mockComment, "9");
    expect(calls).toBe(2);
    expect(lastBody.anchor).toBeUndefined();
    expect(lastBody.text).toContain("ira:file=src/foo/bar.ts");
  });

  it("paginates comments via /activities (start/limit/isLastPage/nextPageStart) and includes nested replies, ignoring non-COMMENT activities", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const urlObj = new URL(url);
      // Bitbucket Server's GET /comments requires a `path` query param, so IRA
      // uses /activities instead — which returns all PR activities, not just comments.
      expect(urlObj.pathname.endsWith("/activities")).toBe(true);
      const start = Number(urlObj.searchParams.get("start") ?? "0");
      const page1 = {
        values: [
          { action: "COMMENTED", comment: { text: "a" } },
          { action: "COMMENTED", comment: { text: "b", comments: [{ text: "reply-to-b" }] } },
          { action: "APPROVED" }, // non-comment activity — must be ignored
        ],
        isLastPage: false,
        nextPageStart: 100,
      };
      const page2 = {
        values: [{ action: "COMMENTED", comment: { text: "c" } }],
        isLastPage: true,
      };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(start === 0 ? page1 : page2),
        headers: { get: () => "" },
      });
    });
    globalThis.fetch = fetchMock;

    const out = await makeClient().getIssueComments("3");
    expect(out).toEqual(["a", "b", "reply-to-b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getDiff converts JSON diff to unified diff when content-type is JSON", async () => {
    const json = {
      diffs: [{
        source: { toString: "src/a.ts" },
        destination: { toString: "src/a.ts" },
        hunks: [{
          segments: [
            { type: "CONTEXT", lines: [{ line: "old line" }] },
            { type: "ADDED", lines: [{ line: "new line" }] },
          ],
        }],
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(json)),
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    });

    const diff = await makeClient().getDiff("12");
    expect(diff).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(diff).toContain("+new line");
    expect(diff).toContain(" old line");
  });

  it("getPRState maps MERGED/DECLINED/OPEN correctly", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ state: "MERGED" }), headers: { get: () => "" } });
    globalThis.fetch = fetchMock;
    const c1 = makeClient();
    expect(await c1.getPRState("1")).toBe("merged");

    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ state: "DECLINED" }), headers: { get: () => "" } });
    const c2 = makeClient();
    expect(await c2.getPRState("2")).toBe("declined");

    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ state: "OPEN" }), headers: { get: () => "" } });
    const c3 = makeClient();
    expect(await c3.getPRState("3")).toBe("open");
  });

  it("compact comment style omits the legacy '🔍 IRA Review' header", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return Promise.resolve({ ok: true, headers: { get: () => "" } });
    });

    await makeClient({ commentStyle: "compact" }).postComment(mockComment, "5");
    const text = capturedBody.text as string;
    expect(text).not.toContain("🔍 **IRA Review**");
    expect(text).toContain("⚠️ **MAJOR**");
    expect(text).toContain("<!-- ira:file=src/foo/bar.ts;line=42;rule=team:no-magic-numbers -->");
  });

  it("constructor throws when baseUrl missing", () => {
    const incomplete = { token: "t", workspace: "P", repoSlug: "r" } as BitbucketConfig;
    expect(() => new BitbucketServerClient(incomplete)).toThrow(/requires baseUrl/);
  });
});

describe("convertBBServerDiffToUnified", () => {
  it("emits standard unified diff headers", () => {
    const out = convertBBServerDiffToUnified({
      diffs: [{
        source: { toString: "a.ts" },
        destination: { toString: "a.ts" },
        hunks: [{ segments: [{ type: "ADDED", lines: [{ line: "x" }] }] }],
      }],
    });
    expect(out).toContain("diff --git a/a.ts b/a.ts");
    expect(out).toContain("--- a/a.ts");
    expect(out).toContain("+++ b/a.ts");
    expect(out).toContain("+x");
  });

  it("uses /dev/null when source/destination missing (added/deleted file)", () => {
    const out = convertBBServerDiffToUnified({
      diffs: [{ destination: { toString: "new.ts" }, hunks: [] }],
    });
    expect(out).toContain("diff --git a//dev/null b/new.ts");
  });
});
