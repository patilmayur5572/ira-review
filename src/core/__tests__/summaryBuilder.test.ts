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
    testGeneration: null,
    requirementCompletion: null,
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

  it("includes generated ACs with review hints when present", () => {
    const result: ReviewResult = {
      ...baseResult,
      acGeneration: {
        jiraKey: "PAY-101",
        summary: "Add payment",
        criteria: [
          { id: "AC-1", given: "a valid card", when: "user pays", then: "charge succeeds" },
        ],
        totalCriteria: 1,
        sources: ["ticket summary", "PR diff"],
        reviewHints: ["Does this need PCI-DSS?"],
      },
    };
    const summary = buildSummary(result);
    expect(summary).toContain("Suggested Acceptance Criteria");
    expect(summary).toContain("AC-1");
    expect(summary).toContain("a valid card");
    expect(summary).toContain("Questions for PO");
    expect(summary).toContain("PCI-DSS");
  });

  it("omits AC section when acGeneration is null", () => {
    const summary = buildSummary(baseResult);
    expect(summary).not.toContain("Suggested Acceptance Criteria");
    expect(summary).not.toContain("Questions for PO");
  });

  it("renders the All Clear block when there are zero comments", () => {
    const cleanResult: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      totalIssues: 0,
    };
    const summary = buildSummary(cleanResult);
    expect(summary).toContain("All Clear");
    expect(summary).toContain("Nice work on PR #42");
    expect(summary).toContain("Safe to approve");
    expect(summary).toContain("Human reviewer approval is still required");
    expect(summary).toContain("👥");
    expect(summary).toContain("augments your code review process");
    expect(summary).toContain("team's review and approval requirements");
    // Risk and AC lines should appear since they're populated
    expect(summary).toMatch(/Risk score: \*\*45\/100\*\*/);
  });

  it("does NOT render the All Clear block when comments exist", () => {
    const summary = buildSummary(baseResult); // baseResult has 1 comment
    expect(summary).not.toContain("All Clear");
    expect(summary).not.toContain("Safe to approve");
  });

  it("All Clear block notes AC generation when ticket had no ACs", () => {
    const cleanWithGen: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      acGeneration: {
        jiraKey: "PAY-101",
        summary: "Add payment",
        criteria: [
          { id: "AC-1", given: "a valid card", when: "user pays", then: "charge succeeds" },
          { id: "AC-2", given: "an invalid card", when: "user pays", then: "show error" },
        ],
        totalCriteria: 2,
        sources: ["ticket summary"],
        reviewHints: [],
        postedToJira: true,
      },
    };
    const summary = buildSummary(cleanWithGen);
    expect(summary).toContain("All Clear");
    expect(summary).toContain("No acceptance criteria found on **PAY-101**");
    expect(summary).toContain("2 suggested ACs");
    expect(summary).toContain("posted them as a comment on the JIRA ticket");
    // Must NOT show a coverage % since none existed to validate
    expect(summary).not.toMatch(/\d+% covered/);
  });

  it("All Clear block does NOT claim a JIRA post when postedToJira is false (e.g. --no-post-acs-to-jira)", () => {
    const cleanWithGenNotPosted: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      acGeneration: {
        jiraKey: "PAY-101",
        summary: "Add payment",
        criteria: [
          { id: "AC-1", given: "a valid card", when: "user pays", then: "charge succeeds" },
        ],
        totalCriteria: 1,
        sources: ["ticket summary"],
        reviewHints: [],
        postedToJira: false,
      },
    };
    const summary = buildSummary(cleanWithGenNotPosted);
    expect(summary).toContain("All Clear");
    expect(summary).toContain("No acceptance criteria found on **PAY-101**");
    expect(summary).toContain("1 suggested AC");
    expect(summary).toContain("see the Suggested Acceptance Criteria section below");
    expect(summary).not.toContain("posted them as a comment on the JIRA ticket");
  });

  it("All Clear block does NOT render when AC coverage is incomplete (must not say 'safe to approve' with a gap)", () => {
    const partialAC: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      requirementCompletion: {
        jiraKey: "PROJ-99",
        summary: "Test",
        completionPercentage: 67,
        metCriteria: 2,
        totalCriteria: 3,
        requirements: [],
        edgeCases: [],
        overallPass: false,
      },
    };
    const summary = buildSummary(partialAC);
    expect(summary).not.toContain("All Clear");
    expect(summary).not.toContain("Safe to approve");
    // The Requirements section below should still surface the gap
    expect(summary).toContain("PROJ-99");
    expect(summary).toContain("67%");
  });

  it("All Clear block does NOT render when acceptanceValidation.overallPass is false", () => {
    const failedAC: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      acceptanceValidation: {
        jiraKey: "PROJ-99",
        summary: "Test",
        overallPass: false,
        criteria: [
          { description: "Should work", met: true, evidence: "yes" },
          { description: "Should also work", met: false, evidence: "no" },
        ],
      },
    };
    const summary = buildSummary(failedAC);
    expect(summary).not.toContain("All Clear");
    expect(summary).not.toContain("Safe to approve");
  });

  it("All Clear block omits AC line when no JIRA ticket is configured", () => {
    const cleanNoJira: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      acceptanceValidation: null,
      requirementCompletion: null,
      acGeneration: null,
    };
    const summary = buildSummary(cleanNoJira);
    expect(summary).toContain("All Clear");
    expect(summary).not.toMatch(/Acceptance criteria for/);
    expect(summary).not.toMatch(/\d+% covered/);
  });

  it("All Clear block shows AC coverage when requirementCompletion is present", () => {
    const cleanWithReq: ReviewResult = {
      ...baseResult,
      comments: [],
      commentsPosted: 0,
      reviewedIssues: 0,
      requirementCompletion: {
        jiraKey: "PROJ-99",
        summary: "Test",
        completionPercentage: 100,
        metCriteria: 3,
        totalCriteria: 3,
        requirements: [],
        edgeCases: [],
        overallPass: true,
      },
    };
    const summary = buildSummary(cleanWithReq);
    expect(summary).toContain("All Clear");
    expect(summary).toContain("PROJ-99");
    expect(summary).toContain("100% covered");
  });
});
