import { describe, it, expect, vi, afterEach } from "vitest";
import { ReviewEngine } from "../reviewEngine.js";
import type { IraConfig } from "../../types/config.js";
import type { SonarSearchResponse } from "../../types/sonar.js";

// Mock OpenAI
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanation: "Test explanation",
                  impact: "Test impact",
                  suggestedFix: "Test fix",
                }),
              },
            },
          ],
        }),
      },
    };
  },
}));

const sonarResponse: SonarSearchResponse = {
  total: 2,
  p: 1,
  ps: 100,
  issues: [
    {
      key: "AX-001",
      rule: "typescript:S1234",
      severity: "BLOCKER",
      component: "project:src/app.ts",
      message: "Blocker issue",
      line: 10,
      type: "BUG",
      flows: [],
      tags: [],
    },
    {
      key: "AX-002",
      rule: "typescript:S5678",
      severity: "MAJOR",
      component: "project:src/utils.ts",
      message: "Major issue (should be filtered)",
      line: 20,
      type: "CODE_SMELL",
      flows: [],
      tags: [],
    },
  ],
  components: [],
};

const baseConfig: IraConfig = {
  sonar: {
    baseUrl: "https://sonar.example.com",
    token: "sonar-tok",
    projectKey: "my-project",
  },
  scmProvider: "bitbucket",
  scm: {
    token: "bb-tok",
    workspace: "ws",
    repoSlug: "repo",
  },
  ai: {
    provider: "openai",
    apiKey: "sk-test",
  },
  pullRequestId: "42",
  dryRun: true,
};

describe("ReviewEngine", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs full pipeline in dry-run mode", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      // Call 1: Sonar issues. Call 2: complexity analyzer. Call 3+: diff/file content
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new"),
        json: () => Promise.resolve(
          callCount === 1
            ? sonarResponse
            : { components: [], paging: { total: 0, pageIndex: 1, pageSize: 500 } },
        ),
      });
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new ReviewEngine(baseConfig);
    const result = await engine.run();

    // Only BLOCKER should pass filter (MAJOR filtered out)
    expect(result.totalIssues).toBe(2);
    expect(result.reviewedIssues).toBe(1);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].rule).toBe("typescript:S1234");
    expect(result.comments[0].aiReview.explanation).toBe("Test explanation");

    // Risk report should be present
    expect(result.risk).not.toBeNull();
    expect(result.risk!.level).toBeDefined();
    expect(result.risk!.score).toBeGreaterThanOrEqual(0);
    expect(result.risk!.factors).toBeInstanceOf(Array);
    expect(result.risk!.factors.length).toBeGreaterThan(0);

    // Complexity: the mock returns ok:true for all fetches, so the
    // analyzer gets an empty components array → empty report (not null).
    expect(result.complexity).toEqual({
      files: [],
      hotspots: [],
      averageComplexity: 0,
      averageCognitiveComplexity: 0,
    });

    // No JIRA config in test → acceptance validation should be null
    expect(result.acceptanceValidation).toBeNull();

    // Dry-run: should print, not POST to Bitbucket
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("src/app.ts"),
    );

    consoleSpy.mockRestore();
  });

  it("posts to Bitbucket when not in dry-run mode", async () => {
    let sonarCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((_url: string) => {
      const url = typeof _url === "string" ? _url : "";
      // Sonar API calls
      if (url.includes("sonar.example.com")) {
        sonarCallCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(
            sonarCallCount === 1
              ? sonarResponse
              : { components: [], paging: { total: 0, pageIndex: 1, pageSize: 500 } },
          ),
        });
      }
      // All other calls (diff, file content, comment tracker, post comment, post summary)
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new"),
        json: () => Promise.resolve({ values: [], content: "file content", encoding: "utf-8" }),
      });
    });

    const config: IraConfig = { ...baseConfig, dryRun: false };
    const engine = new ReviewEngine(config);
    const result = await engine.run();

    expect(result.reviewedIssues).toBe(1);

    // Risk report should still be present in non-dry-run mode
    expect(result.risk).not.toBeNull();
    expect(result.risk!.score).toBeGreaterThanOrEqual(0);

    expect(result.complexity).not.toBeNull();
    expect(result.acceptanceValidation).toBeNull();
  });

  it("returns empty comments when no issues match filter", async () => {
    const emptyResponse: SonarSearchResponse = {
      ...sonarResponse,
      total: 1,
      issues: [
        {
          key: "AX-003",
          rule: "r1",
          severity: "MINOR",
          component: "p:a.ts",
          message: "Minor",
          type: "CODE_SMELL",
          flows: [],
          tags: [],
        },
      ],
    };

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(""),
        json: () => Promise.resolve(
          callCount === 1
            ? emptyResponse
            : { components: [], paging: { total: 0, pageIndex: 1, pageSize: 500 } },
        ),
      });
    });

    const engine = new ReviewEngine(baseConfig);
    const result = await engine.run();

    expect(result.totalIssues).toBe(1);
    expect(result.reviewedIssues).toBe(0);
    expect(result.comments).toHaveLength(0);

    // Risk should be LOW when no critical/blocker issues
    expect(result.risk).not.toBeNull();
    expect(result.risk!.level).toBe("LOW");

    expect(result.complexity).not.toBeNull();
    expect(result.acceptanceValidation).toBeNull();
  });

  it("runs standalone AI review when no Sonar is configured", async () => {
    // Config WITHOUT sonar
    const standaloneConfig: IraConfig = {
      scmProvider: "bitbucket",
      scm: {
        token: "bb-tok",
        workspace: "ws",
        repoSlug: "repo",
      },
      ai: {
        provider: "openai",
        apiKey: "sk-test",
      },
      pullRequestId: "42",
      dryRun: true,
    };

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new"),
        json: () => Promise.resolve({ content: "const x = 1;", encoding: "utf-8" }),
      });
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new ReviewEngine(standaloneConfig);
    const result = await engine.run();

    expect(result.reviewMode).toBe("standalone");
    expect(result.risk).not.toBeNull();

    consoleSpy.mockRestore();
  });
});
