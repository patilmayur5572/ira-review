import { describe, it, expect } from "vitest";
import { annotateDiffWithLineNumbers, extractValidLineNumbers, validateIssuesAgainstDiff, buildStandalonePrompt, resolveIssueLocations } from "../promptBuilder.js";
import type { AIFoundIssue } from "../promptBuilder.js";

describe("annotateDiffWithLineNumbers", () => {
  it("annotates a basic hunk with line numbers", () => {
    const diff = [
      "@@ -10,3 +20,3 @@",
      " context line",
      "+added line",
      " another context",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -10,3 +20,3 @@",
        "L20:  context line",
        "L21: +added line",
        "L22:  another context",
      ].join("\n"),
    );
  });

  it("handles multiple hunks resetting line numbers", () => {
    const diff = [
      "@@ -1,2 +1,2 @@",
      " first",
      "+second",
      "@@ -50,2 +100,2 @@",
      " hundred",
      "+hundred-one",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -1,2 +1,2 @@",
        "L1:  first",
        "L2: +second",
        "@@ -50,2 +100,2 @@",
        "L100:  hundred",
        "L101: +hundred-one",
      ].join("\n"),
    );
  });

  it("marks removed lines without incrementing counter", () => {
    const diff = [
      "@@ -5,3 +5,2 @@",
      " keep",
      "-removed",
      " after",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -5,3 +5,2 @@",
        "L5:  keep",
        "(removed): -removed",
        "L6:  after",
      ].join("\n"),
    );
  });

  it("annotates context lines with line numbers", () => {
    const diff = [
      "@@ -1,3 +1,3 @@",
      " line one",
      " line two",
      " line three",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -1,3 +1,3 @@",
        "L1:  line one",
        "L2:  line two",
        "L3:  line three",
      ].join("\n"),
    );
  });

  it("returns empty string for empty diff", () => {
    expect(annotateDiffWithLineNumbers("")).toBe("");
  });
});

describe("extractValidLineNumbers", () => {
  it("extracts line numbers from added and context lines", () => {
    const diff = [
      "@@ -1,3 +10,4 @@",
      " context",
      "+added",
      "+added2",
      " context2",
    ].join("\n");

    const lines = extractValidLineNumbers(diff);
    expect(lines).toEqual(new Set([10, 11, 12, 13]));
  });

  it("skips removed lines", () => {
    const diff = [
      "@@ -1,3 +5,2 @@",
      " keep",
      "-removed",
      " after",
    ].join("\n");

    const lines = extractValidLineNumbers(diff);
    expect(lines).toEqual(new Set([5, 6]));
    expect(lines.has(7)).toBe(false);
  });

  it("returns empty set for empty diff", () => {
    expect(extractValidLineNumbers("")).toEqual(new Set());
  });
});

describe("validateIssuesAgainstDiff", () => {
  const diff = [
    "@@ -1,3 +10,4 @@",
    " context",
    "+added line",
    "+added line 2",
    " context end",
  ].join("\n");

  function makeIssue(line: number, message = "test issue"): AIFoundIssue {
    return { line, severity: "MAJOR", category: "bug", message, explanation: "e", impact: "i", suggestedFix: "f" };
  }

  it("keeps issues on valid diff lines", () => {
    const issues = [makeIssue(11), makeIssue(12)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, diff);
    expect(valid).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it("drops issues referencing lines far outside the diff", () => {
    const issues = [makeIssue(11), makeIssue(500)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, diff);
    expect(valid).toHaveLength(1);
    expect(valid[0].line).toBe(11);
    expect(dropped).toBe(1);
  });

  it("keeps issues with line 0 (unknown location)", () => {
    const issues = [makeIssue(0)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, diff);
    expect(valid).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("allows +-3 line tolerance for context lines", () => {
    // Line 13 is the last valid line, line 15 is within +3 tolerance
    const issues = [makeIssue(15)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, diff);
    expect(valid).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("drops issues beyond tolerance range", () => {
    // Line 13 is last valid, line 20 is beyond +3 tolerance but within maxValidLine+5
    const issues = [makeIssue(20)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, diff);
    expect(dropped).toBe(1);
    expect(valid).toHaveLength(0);
  });

  it("returns all issues unchanged when diff is empty", () => {
    const issues = [makeIssue(100)];
    const { valid, dropped } = validateIssuesAgainstDiff(issues, "");
    expect(valid).toHaveLength(1);
    expect(dropped).toBe(0);
  });
});

describe("resolveIssueLocations", () => {
  function makeIssue(overrides: Partial<AIFoundIssue> = {}): AIFoundIssue {
    return {
      line: 0,
      severity: "MAJOR",
      category: "bug",
      message: "test issue",
      explanation: "test explanation",
      impact: "test impact",
      suggestedFix: "test fix",
      ...overrides,
    };
  }

  const ANNOTATED_DIFF = [
    "@@ -1,3 +10,7 @@",
    "L10: +const x = 1;",
    "L11: +const y = 2;",
    "L12:  existing line",
    "L13: +function hello() {",
    "L14: +  return 'world';",
    "L15: +}",
    "L16:  const z = 3;",
  ].join("\n");

  // --- Tier 1: Exact match ---
  describe("exact match", () => {
    it("resolves a single-line snippet that exactly matches one diff line", () => {
      const issues = [makeIssue({ line: 99, codeSnippet: "const x = 1;" })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(10);
    });
  });

  // --- Tier 2: Normalized match ---
  describe("normalized match", () => {
    it("resolves a snippet with extra whitespace after normalization", () => {
      const issues = [makeIssue({ line: 99, codeSnippet: "  const   x  =  1; " })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(10);
    });
  });

  // --- Tier 3: Substring match ---
  describe("substring match", () => {
    it("resolves when snippet is a substring of a diff line", () => {
      const issues = [makeIssue({ line: 0, codeSnippet: "return 'world'" })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(14);
    });

    it("picks closest to hint when multiple substring matches exist", () => {
      const dupDiff = [
        "@@ -1,3 +10,4 @@",
        "L10: +const value = getData();",
        "L11: +processData(value);",
        "L12: +const value2 = getData();",
        "L13:  done();",
      ].join("\n");
      const issues = [makeIssue({ line: 12, codeSnippet: "getData()" })];
      const result = resolveIssueLocations(issues, dupDiff);
      expect(result[0].line).toBe(12);
    });
  });

  // --- Tier 4: Line hint fallback ---
  describe("line hint fallback", () => {
    it("keeps the hint when line is valid in the diff", () => {
      const issues = [makeIssue({ line: 12 })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(12);
    });

    it("adjusts to nearest valid line when hint is off by 1-2", () => {
      // Line 9 is not valid but 10 is (offset +1)
      const issues = [makeIssue({ line: 9 })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(10);
    });

    it("defaults to line 0 (file-level) when hint is far from any valid line", () => {
      const issues = [makeIssue({ line: 500 })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(0);
    });

    it("stays at line 0 when issue has line 0 and no snippet", () => {
      const issues = [makeIssue({ line: 0 })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(0);
    });
  });

  // --- No-snippet fallback ---
  describe("no-snippet fallback", () => {
    it("falls through to hint validation when codeSnippet is undefined", () => {
      const issues = [makeIssue({ line: 13, codeSnippet: undefined })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(13);
    });
  });

  // --- Multi-line snippet matching ---
  describe("multi-line snippet (exact)", () => {
    it("resolves multi-line snippet that matches contiguous diff lines to first matching line", () => {
      const issues = [makeIssue({ line: 99, codeSnippet: "function hello() {\n  return 'world';" })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(13);
    });
  });

  // --- Ambiguous matches ---
  describe("ambiguous matches", () => {
    it("returns null from exact/normalized for duplicate code, falls to hint", () => {
      const dupDiff = [
        "@@ -1,3 +10,3 @@",
        "L10: +const a = 1;",
        "L11: +const a = 1;",
        "L12:  done();",
      ].join("\n");
      // Exact match finds 2 matches → returns null, normalized also null,
      // substring "const a = 1;" has 2 matches → picks closest to hint (line 11)
      const issues = [makeIssue({ line: 11, codeSnippet: "const a = 1;" })];
      const result = resolveIssueLocations(issues, dupDiff);
      expect(result[0].line).toBe(11);
    });

    it("skips substring match for snippet < 5 chars, falls to hint", () => {
      const issues = [makeIssue({ line: 16, codeSnippet: "z=3" })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      expect(result[0].line).toBe(16);
    });
  });

  // --- Edge cases ---
  describe("edge cases", () => {
    it("returns empty array for empty issues", () => {
      expect(resolveIssueLocations([], ANNOTATED_DIFF)).toEqual([]);
    });

    it("returns original issues unchanged for empty annotated diff", () => {
      const issues = [makeIssue({ line: 42 })];
      const result = resolveIssueLocations(issues, "");
      expect(result).toEqual(issues);
    });

    it("treats snippet with only whitespace lines as no snippet", () => {
      const issues = [makeIssue({ line: 13, codeSnippet: "   \n  \n " })];
      const result = resolveIssueLocations(issues, ANNOTATED_DIFF);
      // Whitespace-only lines are filtered out → falls to hint
      expect(result[0].line).toBe(13);
    });
  });
});

describe("buildStandalonePrompt", () => {
  it("includes review rules in the prompt", () => {
    const prompt = buildStandalonePrompt("test.ts", "+const x = 1;", null);
    expect(prompt).toContain("Check every category");
    expect(prompt).toContain("Skip style-only concerns");
    expect(prompt).toContain("Skip speculative defensive-coding suggestions");
  });
});
