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

  it("deduplicates GitHub issue comments used as fallback", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Review comments - empty
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      // Issue comments with an IRA fallback comment
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 1,
            body: '🔍 **IRA Review** — `typescript:S1234` (BLOCKER)\n\n**File:** `src/app.ts`\n\n> Fix this',
          },
        ]),
      });
    });

    const tracker = new CommentTracker(
      { token: "ghp-tok", owner: "org", repo: "repo" },
      "github",
    );

    const existing = await tracker.getExistingIraComments("42");
    expect(existing.has("src/app.ts:0")).toBe(true);
  });

  it("deduplicates using structured <!-- ira:... --> markers on Bitbucket Cloud", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          values: [
            {
              id: 1,
              content: {
                raw: "<!-- ira:file=src/app.ts;line=10;rule=no-any-type -->\n🔍 **IRA Review** - `no-any-type` (MAJOR)",
              },
              inline: { path: "src/app.ts", to: 10 },
            },
            {
              id: 2,
              content: {
                raw: "<!-- ira:file=src/utils.ts;line=5;rule=no-console -->\n🔍 **IRA Review** - `no-console` (MINOR)",
              },
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
    // Structured marker includes rule in the key
    expect(existing.has("src/app.ts:10:no-any-type")).toBe(true);
    expect(existing.has("src/utils.ts:5:no-console")).toBe(true);
  });

  it("deduplicates using structured markers on GitHub inline comments", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 1,
              body: "<!-- ira:file=src/app.ts;line=10;rule=no-any -->\n🔍 **IRA Review** - `no-any` (MAJOR)",
              path: "src/app.ts",
              line: 10,
            },
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    const tracker = new CommentTracker(
      { token: "ghp-tok", owner: "org", repo: "repo" },
      "github",
    );

    const existing = await tracker.getExistingIraComments("42");
    expect(existing.has("src/app.ts:10:no-any")).toBe(true);
  });
});

describe("CommentTracker - Bitbucket Server", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deduplicates IRA comments from Bitbucket Server /activities (incl. nested replies, ignoring non-COMMENT activities)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          values: [
            {
              action: "COMMENTED",
              comment: {
                text: "<!-- ira:file=src/app.ts;line=10;rule=no-any -->\n🔍 **IRA Review** - `no-any` (MAJOR)\n> Avoid any",
                comments: [
                  // nested reply that itself carries an IRA marker — must be picked up
                  { text: "<!-- ira:file=src/utils.ts;line=5;rule=no-console -->\n🔍 **IRA Review** - `no-console` (MINOR)\n> Remove console.log" },
                ],
              },
            },
            { action: "COMMENTED", comment: { text: "Regular comment, not from IRA" } },
            // non-COMMENT activities (approvals, merges, etc.) must be ignored
            { action: "APPROVED" },
            { action: "MERGED" },
          ],
          isLastPage: true,
        }),
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com", token: "tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    const existing = await tracker.getExistingIraComments("42");
    expect(existing.size).toBe(2);
    expect(existing.has("src/app.ts:10:no-any")).toBe(true);
    expect(existing.has("src/utils.ts:5:no-console")).toBe(true);
  });

  it("handles empty comment list on Bitbucket Server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [], isLastPage: true }),
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com", token: "tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    const existing = await tracker.getExistingIraComments("1");
    expect(existing.size).toBe(0);
  });

  it("paginates through Bitbucket Server activities", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              values: [
                { action: "COMMENTED", comment: { text: "<!-- ira:file=a.ts;line=1;rule=r1 -->\n🔍 **IRA Review** - `r1` (MAJOR)" } },
              ],
              isLastPage: false,
              nextPageStart: 100,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            values: [
              { action: "COMMENTED", comment: { text: "<!-- ira:file=b.ts;line=2;rule=r2 -->\n🔍 **IRA Review** - `r2` (MINOR)" } },
            ],
            isLastPage: true,
          }),
      });
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com", token: "tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    const existing = await tracker.getExistingIraComments("42");
    expect(existing.size).toBe(2);
    expect(existing.has("a.ts:1:r1")).toBe(true);
    expect(existing.has("b.ts:2:r2")).toBe(true);
    expect(callCount).toBe(2);
  });

  it("skips non-IRA comments on Bitbucket Server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          values: [
            { action: "COMMENTED", comment: { text: "Looks good to me! 👍" } },
            { action: "COMMENTED", comment: { text: "Please fix the typo on line 5" } },
          ],
          isLastPage: true,
        }),
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com", token: "tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    const existing = await tracker.getExistingIraComments("42");
    expect(existing.size).toBe(0);
  });

  it("uses /activities (not /comments) on Bitbucket Server — /comments requires a `path` query param and 400s without it", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [], isLastPage: true }),
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com/", token: "tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    await tracker.getExistingIraComments("99");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://bitbucket.corp.com/rest/api/1.0/projects/PROJ/repos/my-repo/pull-requests/99/activities?start=0&limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("handles API error gracefully on Bitbucket Server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const tracker = new CommentTracker(
      { baseUrl: "https://bitbucket.corp.com", token: "bad-tok", project: "PROJ", repoSlug: "my-repo" },
      "bitbucket-server",
    );

    await expect(tracker.getExistingIraComments("42")).rejects.toThrow();
  });
});

describe("deduplicateKey", () => {
  it("builds key from file and line", () => {
    expect(deduplicateKey("src/app.ts", 10)).toBe("src/app.ts:10");
  });

  it("builds key from file, line and rule", () => {
    expect(deduplicateKey("src/app.ts", 10, "no-any-type")).toBe("src/app.ts:10:no-any-type");
  });
});
