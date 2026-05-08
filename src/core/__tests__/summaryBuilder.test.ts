import { describe, it, expect } from "vitest";
import { buildSummary } from "../summaryBuilder.js";
import type { ReviewResult } from "../../types/review.js";

const baseResult: ReviewResult = {
  pullRequestId: "42",
  framework: "react",
  reviewMode: "sonar",
  totalIssues: 5,
  reviewedIssues: 2,
  filesReviewed: 3,
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

describe("buildSummary — v3.1.6 redesign", () => {
  describe("headline", () => {
    it("renders a single status-dot headline with risk level and score", () => {
      const summary = buildSummary(baseResult);
      // baseResult: HIGH risk + a BLOCKER finding → 🔴 (BLOCKER escalates)
      expect(summary).toContain("### 🔴 IRA Review · HIGH risk (45/100)");
    });

    it("uses 🟢 for a clean PR (LOW risk, no findings, no AC gap)", () => {
      const clean: ReviewResult = {
        ...baseResult,
        comments: [],
        risk: { ...baseResult.risk!, level: "LOW", score: 0 },
      };
      const summary = buildSummary(clean);
      expect(summary).toContain("### 🟢 IRA Review · LOW risk (0/100)");
    });

    it("uses 🟡 when an AC gap exists even though risk is LOW", () => {
      // Worst-signal-wins: AC gap escalates a LOW-risk PR from 🟢 to 🟡.
      const acGapLowRisk: ReviewResult = {
        ...baseResult,
        comments: [],
        risk: { ...baseResult.risk!, level: "LOW", score: 0 },
        requirementCompletion: {
          jiraKey: "PROJ-99",
          summary: "Test",
          completionPercentage: 60,
          metCriteria: 3,
          totalCriteria: 5,
          requirements: [],
          edgeCases: [],
          overallPass: false,
        },
      };
      const summary = buildSummary(acGapLowRisk);
      expect(summary).toContain("### 🟡 IRA Review · LOW risk (0/100)");
    });

    it("uses 🟠 for HIGH risk with no BLOCKER findings", () => {
      const highNoBlocker: ReviewResult = {
        ...baseResult,
        comments: [{ ...baseResult.comments[0], severity: "MAJOR" }],
        risk: { ...baseResult.risk!, level: "HIGH", score: 60 },
      };
      const summary = buildSummary(highNoBlocker);
      expect(summary).toContain("### 🟠 IRA Review · HIGH risk (60/100)");
    });

    it("uses 🔴 for CRITICAL risk", () => {
      const crit: ReviewResult = {
        ...baseResult,
        comments: [],
        risk: { ...baseResult.risk!, level: "CRITICAL", score: 90 },
      };
      const summary = buildSummary(crit);
      expect(summary).toContain("### 🔴 IRA Review · CRITICAL risk (90/100)");
    });

    it("escalates to 🔴 when any BLOCKER finding exists, even with MEDIUM risk", () => {
      const mediumWithBlocker: ReviewResult = {
        ...baseResult,
        risk: { ...baseResult.risk!, level: "MEDIUM", score: 30 },
        // baseResult.comments[0].severity is already "BLOCKER"
      };
      const summary = buildSummary(mediumWithBlocker);
      expect(summary).toContain("### 🔴");
    });
  });

  describe("metrics line", () => {
    it("includes files reviewed, finding count, and AC coverage when present", () => {
      const withReq: ReviewResult = {
        ...baseResult,
        comments: [],
        requirementCompletion: {
          jiraKey: "CBBT-86165",
          summary: "Test",
          completionPercentage: 60,
          metCriteria: 3,
          totalCriteria: 5,
          requirements: [],
          edgeCases: [],
          overallPass: false,
        },
      };
      const summary = buildSummary(withReq);
      expect(summary).toContain("3 files reviewed · 0 findings · CBBT-86165: 3/5 ACs met");
    });

    it("singularises 'finding' for exactly one finding", () => {
      const summary = buildSummary(baseResult); // 1 comment
      // Word boundary: "1 finding" is OK, "1 findings" is not.
      expect(summary).toMatch(/\b1 finding\b/);
      expect(summary).not.toMatch(/\b1 findings\b/);
    });

    it("singularises 'file' for exactly one file reviewed", () => {
      const summary = buildSummary({ ...baseResult, filesReviewed: 1 });
      expect(summary).toContain("1 file reviewed");
    });

    it("omits the files-reviewed segment when filesReviewed is undefined", () => {
      const noCount: ReviewResult = { ...baseResult, filesReviewed: undefined };
      const summary = buildSummary(noCount);
      expect(summary).not.toMatch(/\d+ files? reviewed/);
    });

    it("renders AC metric as 'ACs met' / 'AC gaps' when only acceptanceValidation is present", () => {
      const passed: ReviewResult = {
        ...baseResult,
        comments: [],
        acceptanceValidation: {
          jiraKey: "PROJ-1",
          summary: "x",
          overallPass: true,
          criteria: [{ description: "ok", met: true, evidence: "y" }],
        },
      };
      expect(buildSummary(passed)).toContain("PROJ-1: ACs met");

      const failed: ReviewResult = {
        ...passed,
        acceptanceValidation: { ...passed.acceptanceValidation!, overallPass: false },
      };
      expect(buildSummary(failed)).toContain("PROJ-1: AC gaps");
    });

    it("renders AC metric as 'N ACs suggested' when only acGeneration is present", () => {
      const generated: ReviewResult = {
        ...baseResult,
        comments: [],
        acGeneration: {
          jiraKey: "PAY-101",
          summary: "x",
          criteria: [
            { id: "AC-1", given: "g", when: "w", then: "t" },
            { id: "AC-2", given: "g", when: "w", then: "t" },
          ],
          totalCriteria: 2,
          sources: ["ticket summary"],
          reviewHints: [],
        },
      };
      expect(buildSummary(generated)).toContain("PAY-101: 2 ACs suggested");
    });

    it("omits the AC segment when no JIRA context exists", () => {
      const cleanNoJira: ReviewResult = {
        ...baseResult,
        comments: [],
        acceptanceValidation: null,
        requirementCompletion: null,
        acGeneration: null,
      };
      const summary = buildSummary(cleanNoJira);
      // metrics line should be just files + findings
      expect(summary).toMatch(/3 files reviewed · 0 findings\n/);
    });
  });

  describe("Findings table", () => {
    it("renders the Findings section when there are comments", () => {
      const summary = buildSummary(baseResult);
      expect(summary).toContain("## Findings");
      expect(summary).toContain("typescript:S1234");
      expect(summary).toContain("BLOCKER");
      expect(summary).toContain("src/app.ts");
    });

    it("omits the Findings section when there are zero comments", () => {
      const clean: ReviewResult = { ...baseResult, comments: [] };
      const summary = buildSummary(clean);
      expect(summary).not.toContain("## Findings");
    });
  });

  describe("Acceptance Criteria coverage", () => {
    it("renders requirementCompletion with coverage % in section header", () => {
      const result: ReviewResult = {
        ...baseResult,
        requirementCompletion: {
          jiraKey: "PROJ-99",
          summary: "x",
          completionPercentage: 67,
          metCriteria: 2,
          totalCriteria: 3,
          requirements: [
            { description: "Login works", coverage: "full", evidence: "covered", met: true },
            { description: "Logout works", coverage: "partial", evidence: "TODO", met: false },
          ],
          edgeCases: ["Empty password"],
          overallPass: false,
        },
      };
      const summary = buildSummary(result);
      expect(summary).toContain("## Acceptance Criteria — PROJ-99 (67% covered, 2/3)");
      expect(summary).toContain("- ✅ Login works");
      expect(summary).toContain("- 🟡 Logout works");
      expect(summary).toContain("> TODO");
      expect(summary).toContain("### Edge cases not covered");
      expect(summary).toContain("- Empty password");
    });

    it("falls back to acceptanceValidation when requirementCompletion is missing", () => {
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
      expect(summary).toContain("## Acceptance Criteria — PROJ-123 (all met)");
      expect(summary).toContain("- ✅ Login works");
    });
  });

  describe("Risk Factors", () => {
    it("renders the risk-factor table only in sonar mode", () => {
      const summary = buildSummary(baseResult);
      expect(summary).toContain("## Risk Factors");
      expect(summary).toContain("Blocker Issues");
    });

    it("omits the risk-factor table in standalone mode", () => {
      const standalone: ReviewResult = { ...baseResult, reviewMode: "standalone" };
      const summary = buildSummary(standalone);
      expect(summary).not.toContain("## Risk Factors");
    });
  });

  describe("Complexity hotspots", () => {
    it("renders complexity hotspots section when hotspots exist", () => {
      const summary = buildSummary(baseResult);
      expect(summary).toContain("## Complexity Hotspots");
      expect(summary).toContain("src/complex.ts");
    });
  });

  describe("Suggested ACs (acGeneration)", () => {
    it("renders the Suggested ACs section with given/when/then and source attribution", () => {
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
          postedToJira: true,
        },
      };
      const summary = buildSummary(result);
      expect(summary).toContain("## Suggested Acceptance Criteria — PAY-101 (1 generated)");
      expect(summary).toContain("**AC-1**");
      expect(summary).toContain("**Given** a valid card");
      expect(summary).toContain("Posted to JIRA");
      expect(summary).toContain("### Questions for PO");
      expect(summary).toContain("PCI-DSS");
    });

    it("notes when suggested ACs were NOT posted to JIRA (--no-post-acs-to-jira)", () => {
      const result: ReviewResult = {
        ...baseResult,
        acGeneration: {
          jiraKey: "PAY-101",
          summary: "Add payment",
          criteria: [
            { id: "AC-1", given: "g", when: "w", then: "t" },
          ],
          totalCriteria: 1,
          sources: ["ticket summary"],
          reviewHints: [],
          postedToJira: false,
        },
      };
      const summary = buildSummary(result);
      expect(summary).toContain("Not posted to JIRA");
    });

    it("omits the Suggested ACs section when acGeneration is null", () => {
      const summary = buildSummary(baseResult);
      expect(summary).not.toContain("Suggested Acceptance Criteria");
      expect(summary).not.toContain("Questions for PO");
    });
  });

  describe("footer", () => {
    it("renders ira-review with version and provider/model when meta is supplied", () => {
      const summary = buildSummary(baseResult, {
        version: "3.1.6",
        aiProvider: "copilot-cli",
        aiModel: "claude-sonnet-4.5",
      });
      expect(summary).toContain("_ira-review 3.1.6 · copilot-cli/claude-sonnet-4.5_");
    });

    it("renders just 'ira-review' when no meta is supplied", () => {
      const summary = buildSummary(baseResult);
      expect(summary).toContain("_ira-review_");
    });

    it("retains the human-approval reminder", () => {
      const summary = buildSummary(baseResult);
      expect(summary).toContain("Human reviewer approval is still required before merge");
    });
  });
});
