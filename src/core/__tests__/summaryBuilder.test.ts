import { describe, it, expect } from "vitest";
import { buildSummary } from "../summaryBuilder.js";
import type { ReviewResult } from "../../types/review.js";

const baseResult: ReviewResult = {
  pullRequestId: "42",
  framework: "react",
  reviewMode: "sonar",
  totalIssues: 5,
  reviewedIssues: 2,
  comments: [
    {
      filePath: "src/app.ts",
      line: 10,
      rule: "typescript:S1234",
      severity: "BLOCKER",
      message: "Fix this",
      aiReview: {
        explanation: "Test",
        impact: "Test",
        suggestedFix: "Test",
      },
    },
  ],
  commentsPosted: 1,
  risk: {
    level: "HIGH",
    score: 45,
    maxScore: 100,
    factors: [
      {
        name: "Blocker Issues",
        score: 20,
        maxScore: 30,
        detail: "2 blocker issues found",
      },
    ],
    summary: "Risk: HIGH (45 points).",
  },
  complexity: {
    files: [],
    averageComplexity: 8,
    averageCognitiveComplexity: 5,
    hotspots: [
      {
        filePath: "src/complex.ts",
        complexity: 25,
        cognitiveComplexity: 20,
        linesOfCode: 200,
      },
    ],
  },
  acceptanceValidation: null,
};

describe("buildSummary", () => {
  it("includes risk score", () => {
    const summary = buildSummary(baseResult);
    expect(summary).toContain("Risk: HIGH");
    expect(summary).toContain("45/100");
  });

  it("includes overview table", () => {
    const summary = buildSummary(baseResult);
    expect(summary).toContain("Total issues");
    expect(summary).toContain("5");
    expect(summary).toContain("react");
  });

  it("includes complexity hotspots", () => {
    const summary = buildSummary(baseResult);
    expect(summary).toContain("Complexity Hotspots");
    expect(summary).toContain("src/complex.ts");
  });

  it("includes issue breakdown", () => {
    const summary = buildSummary(baseResult);
    expect(summary).toContain("typescript:S1234");
    expect(summary).toContain("BLOCKER");
  });

  it("includes footer", () => {
    const summary = buildSummary(baseResult);
    expect(summary).toContain("ira-review");
  });

  it("includes AC validation when present", () => {
    const result: ReviewResult = {
      ...baseResult,
      acceptanceValidation: {
        jiraKey: "PROJ-123",
        summary: "Add auth",
        criteria: [{ description: "Login works", met: true, evidence: "ok" }],
        overallPass: true,
      },
    };
    const summary = buildSummary(result);
    expect(summary).toContain("PROJ-123");
    expect(summary).toContain("Login works");
  });
});
