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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sonarResponse),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new ReviewEngine(baseConfig);
    const result = await engine.run();

    // Should fetch from Sonar
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Only BLOCKER should pass filter (MAJOR filtered out)
    expect(result.totalIssues).toBe(2);
    expect(result.reviewedIssues).toBe(1);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].rule).toBe("typescript:S1234");
    expect(result.comments[0].aiReview.explanation).toBe("Test explanation");

    // Dry-run: should print, not POST to Bitbucket
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("src/app.ts"),
    );

    consoleSpy.mockRestore();
  });

  it("posts to Bitbucket when not in dry-run mode", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sonarResponse),
    });

    const config: IraConfig = { ...baseConfig, dryRun: false };
    const engine = new ReviewEngine(config);
    const result = await engine.run();

    // 1 Sonar fetch + 1 Bitbucket POST
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.reviewedIssues).toBe(1);
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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyResponse),
    });

    const engine = new ReviewEngine(baseConfig);
    const result = await engine.run();

    expect(result.totalIssues).toBe(1);
    expect(result.reviewedIssues).toBe(0);
    expect(result.comments).toHaveLength(0);
  });
});
