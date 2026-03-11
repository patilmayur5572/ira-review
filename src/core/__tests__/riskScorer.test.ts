import { describe, it, expect } from "vitest";
import { calculateRisk } from "../riskScorer.js";
import type { SonarIssue } from "../../types/sonar.js";
import type { ComplexityReport } from "../../types/risk.js";

function makeIssue(overrides: Partial<SonarIssue> = {}): SonarIssue {
  return {
    key: "AX-001",
    rule: "typescript:S1234",
    severity: "MAJOR",
    component: "project:src/app.ts",
    message: "Issue",
    type: "BUG",
    flows: [],
    tags: [],
    ...overrides,
  };
}

describe("calculateRisk", () => {
  it("returns LOW risk when there are no issues", () => {
    const result = calculateRisk({
      allIssues: [],
      filteredIssues: [],
      complexity: null,
      filesChanged: 0,
    });

    expect(result.level).toBe("LOW");
    expect(result.score).toBe(0);
    expect(result.factors).toHaveLength(5);
    expect(result.summary).toContain("LOW");
  });

  it("scores high with blocker issues", () => {
    const blockers = Array.from({ length: 4 }, (_, i) =>
      makeIssue({ key: `B-${i}`, severity: "BLOCKER" }),
    );

    const result = calculateRisk({
      allIssues: blockers,
      filteredIssues: blockers,
      complexity: null,
      filesChanged: 1,
    });

    // 4 blockers × 10 = 30 (capped at 30) + density (4/1 = 4 → 20 → capped 15)
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(["HIGH", "CRITICAL"]).toContain(result.level);
    expect(result.factors.find((f) => f.name === "Blocker Issues")!.score).toBe(
      30,
    );
  });

  it("scores points for critical issues", () => {
    const criticals = Array.from({ length: 3 }, (_, i) =>
      makeIssue({ key: `C-${i}`, severity: "CRITICAL" }),
    );

    const result = calculateRisk({
      allIssues: criticals,
      filteredIssues: criticals,
      complexity: null,
      filesChanged: 1,
    });

    expect(
      result.factors.find((f) => f.name === "Critical Issues")!.score,
    ).toBe(15);
  });

  it("adds score for security/vulnerability issues", () => {
    const vulnIssue = makeIssue({
      key: "V-1",
      type: "VULNERABILITY",
      severity: "CRITICAL",
    });
    const taggedIssue = makeIssue({
      key: "V-2",
      tags: ["security"],
      severity: "MAJOR",
    });

    const result = calculateRisk({
      allIssues: [vulnIssue, taggedIssue],
      filteredIssues: [vulnIssue],
      complexity: null,
      filesChanged: 2,
    });

    const securityFactor = result.factors.find(
      (f) => f.name === "Security Concerns",
    )!;
    expect(securityFactor.score).toBe(20); // 2 × 10 = 20 (capped at 20)
  });

  it("adds score for complexity hotspots", () => {
    const complexity: ComplexityReport = {
      files: [
        {
          filePath: "src/a.ts",
          complexity: 20,
          cognitiveComplexity: 25,
          linesOfCode: 200,
        },
        {
          filePath: "src/b.ts",
          complexity: 5,
          cognitiveComplexity: 3,
          linesOfCode: 50,
        },
      ],
      averageComplexity: 12.5,
      averageCognitiveComplexity: 14,
      hotspots: [
        {
          filePath: "src/a.ts",
          complexity: 20,
          cognitiveComplexity: 25,
          linesOfCode: 200,
        },
      ],
    };

    const result = calculateRisk({
      allIssues: [],
      filteredIssues: [],
      complexity,
      filesChanged: 2,
    });

    const complexityFactor = result.factors.find(
      (f) => f.name === "Code Complexity",
    )!;
    expect(complexityFactor.score).toBe(5); // 1 hotspot × 5 = 5
    expect(complexityFactor.detail).toContain("1 high-complexity file");
  });

  it("caps factor scores at their maximum", () => {
    const blockers = Array.from({ length: 10 }, (_, i) =>
      makeIssue({ key: `B-${i}`, severity: "BLOCKER" }),
    );

    const result = calculateRisk({
      allIssues: blockers,
      filteredIssues: blockers,
      complexity: null,
      filesChanged: 1,
    });

    const blockerFactor = result.factors.find(
      (f) => f.name === "Blocker Issues",
    )!;
    expect(blockerFactor.score).toBe(30);
    expect(blockerFactor.score).toBeLessThanOrEqual(blockerFactor.maxScore);
  });

  it("builds a summary with top concerns", () => {
    const result = calculateRisk({
      allIssues: [makeIssue({ severity: "BLOCKER", type: "VULNERABILITY" })],
      filteredIssues: [
        makeIssue({ severity: "BLOCKER", type: "VULNERABILITY" }),
      ],
      complexity: null,
      filesChanged: 1,
    });

    expect(result.summary).toContain("Top concerns:");
  });
});
