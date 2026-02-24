import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SonarClient } from "../sonarClient.js";
import type { SonarSearchResponse } from "../../types/sonar.js";

function mockSonarResponse(
  overrides: Partial<SonarSearchResponse> = {},
): SonarSearchResponse {
  return {
    total: 1,
    p: 1,
    ps: 100,
    issues: [
      {
        key: "AX-001",
        rule: "typescript:S1234",
        severity: "BLOCKER",
        component: "project:src/app.ts",
        message: "Fix this",
        line: 10,
        type: "BUG",
        flows: [],
        tags: ["cwe"],
      },
    ],
    components: [
      { key: "project:src/app.ts", name: "app.ts", qualifier: "FIL" },
    ],
    ...overrides,
  };
}

describe("SonarClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches issues for a pull request", async () => {
    const mockResponse = mockSonarResponse();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new SonarClient({
      baseUrl: "https://sonar.example.com",
      token: "test-token",
      projectKey: "my-project",
    });

    const issues = await client.fetchPullRequestIssues("42");

    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe("AX-001");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/issues/search?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("paginates when total exceeds page size", async () => {
    const page1 = mockSonarResponse({
      total: 2,
      issues: [
        {
          key: "AX-001",
          rule: "r1",
          severity: "BLOCKER",
          component: "p:a.ts",
          message: "m1",
          type: "BUG",
          flows: [],
          tags: [],
        },
      ],
    });
    const page2 = mockSonarResponse({
      total: 2,
      p: 2,
      issues: [
        {
          key: "AX-002",
          rule: "r2",
          severity: "CRITICAL",
          component: "p:b.ts",
          message: "m2",
          type: "BUG",
          flows: [],
          tags: [],
        },
      ],
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) });

    const client = new SonarClient({
      baseUrl: "https://sonar.example.com",
      token: "tok",
      projectKey: "proj",
    });

    const issues = await client.fetchPullRequestIssues("1");
    expect(issues).toHaveLength(2);
    expect(issues[0].key).toBe("AX-001");
    expect(issues[1].key).toBe("AX-002");
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const client = new SonarClient({
      baseUrl: "https://sonar.example.com",
      token: "bad-token",
      projectKey: "proj",
    });

    await expect(client.fetchPullRequestIssues("1")).rejects.toThrow(
      "Sonar API error (401)",
    );
  });
});
