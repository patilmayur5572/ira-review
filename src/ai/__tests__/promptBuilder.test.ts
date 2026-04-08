import { describe, it, expect } from "vitest";
import { buildPrompt, buildStandalonePrompt, parseStandaloneResponse } from "../promptBuilder.js";
import type { SonarIssue } from "../../types/sonar.js";

const baseIssue: SonarIssue = {
  key: "AX-001",
  rule: "typescript:S1234",
  severity: "BLOCKER",
  component: "project:src/app.ts",
  message: "Remove this useless assignment",
  type: "CODE_SMELL",
  flows: [],
  tags: ["cwe", "security"],
  textRange: {
    startLine: 10,
    endLine: 12,
    startOffset: 0,
    endOffset: 20,
  },
};

describe("buildPrompt", () => {
  it("includes issue details in the prompt", () => {
    const prompt = buildPrompt(baseIssue, null);

    expect(prompt).toContain("typescript:S1234");
    expect(prompt).toContain("BLOCKER");
    expect(prompt).toContain("Remove this useless assignment");
    expect(prompt).toContain("Lines 10–12");
    expect(prompt).toContain("CODE_SMELL");
    expect(prompt).toContain("cwe, security");
  });

  it("includes framework context when provided", () => {
    const prompt = buildPrompt(baseIssue, "react");
    expect(prompt).toContain("react");
    expect(prompt).toContain("best practices");
  });

  it("handles missing framework", () => {
    const prompt = buildPrompt(baseIssue, null);
    expect(prompt).toContain("No specific framework detected");
  });

  it("uses line number when textRange is missing", () => {
    const issue: SonarIssue = { ...baseIssue, textRange: undefined, line: 42 };
    const prompt = buildPrompt(issue, null);
    expect(prompt).toContain("Line 42");
  });

  it("shows unknown location when both are missing", () => {
    const issue: SonarIssue = {
      ...baseIssue,
      textRange: undefined,
      line: undefined,
    };
    const prompt = buildPrompt(issue, null);
    expect(prompt).toContain("Unknown location");
  });

  it("requests JSON output format", () => {
    const prompt = buildPrompt(baseIssue, null);
    expect(prompt).toContain('"explanation"');
    expect(prompt).toContain('"impact"');
    expect(prompt).toContain('"suggestedFix"');
  });

  it("includes diff context when provided", () => {
    const prompt = buildPrompt(baseIssue, null, "diff --git a/file.ts\n+new code");
    expect(prompt).toContain("<code_context>");
    expect(prompt).toContain("diff --git a/file.ts");
    expect(prompt).toContain("</code_context>");
  });

  it("truncates long diff context to 6000 chars", () => {
    const longDiff = "x".repeat(8000);
    const prompt = buildPrompt(baseIssue, null, longDiff);
    expect(prompt).toContain("<code_context>");
    expect(prompt).not.toContain("x".repeat(8000));
  });

  it("wraps sonar message in delimiters for injection safety", () => {
    const prompt = buildPrompt(baseIssue, null);
    expect(prompt).toContain("<sonar_message>");
    expect(prompt).toContain("</sonar_message>");
  });

  it("works without diff context (backward compatible)", () => {
    const prompt = buildPrompt(baseIssue, null);
    expect(prompt).not.toContain("<code_context>");
    expect(prompt).toContain("typescript:S1234");
  });
});

describe("buildStandalonePrompt", () => {
  it("includes file path, diff, framework context, and source file", () => {
    const prompt = buildStandalonePrompt(
      "src/app.ts",
      "+const x = 1;",
      "react",
      "const x = 1;\nexport default x;",
    );

    expect(prompt).toContain("src/app.ts");
    expect(prompt).toContain("+const x = 1;");
    expect(prompt).toContain("react");
    expect(prompt).toContain("<source_file>");
    expect(prompt).toContain("const x = 1;\nexport default x;");
  });

  it("works without source file", () => {
    const prompt = buildStandalonePrompt("src/utils.ts", "+hello", null);

    expect(prompt).toContain("src/utils.ts");
    expect(prompt).toContain("+hello");
    expect(prompt).not.toContain("<source_file>");
  });

  it("produces same output without 5th param as before", () => {
    const withoutParam = buildStandalonePrompt("src/app.ts", "+code", "react", null);
    const withUndefined = buildStandalonePrompt("src/app.ts", "+code", "react", null, undefined);
    expect(withoutParam).toBe(withUndefined);
    expect(withoutParam).not.toContain("Team Rules");
    expect(withoutParam).not.toContain("Team coding standards");
  });

  it("includes team rules section before Instructions when provided", () => {
    const rulesSection = "## Team Rules\nYour team has defined the following coding standards.\n\nRule 1: No console.log\nSeverity: MINOR\n";
    const prompt = buildStandalonePrompt("src/app.ts", "+code", null, null, rulesSection);

    expect(prompt).toContain("## Team Rules");
    expect(prompt).toContain("No console.log");
    // Team Rules should appear before Instructions
    const rulesIndex = prompt.indexOf("## Team Rules");
    const instructionsIndex = prompt.indexOf("## Instructions");
    expect(rulesIndex).toBeLessThan(instructionsIndex);
  });

  it("adds Team coding standards bullet when team rules provided", () => {
    const rulesSection = "## Team Rules\nRule 1: Test rule\n";
    const prompt = buildStandalonePrompt("src/app.ts", "+code", null, null, rulesSection);

    expect(prompt).toContain("Team coding standards (check against the Team Rules section above)");
  });

  it("omits Team Rules section with empty string", () => {
    const prompt = buildStandalonePrompt("src/app.ts", "+code", null, null, "");
    expect(prompt).not.toContain("Team Rules");
    expect(prompt).not.toContain("Team coding standards");
  });
});

describe("parseStandaloneResponse", () => {
  it("parses valid JSON array of issues", () => {
    const input = JSON.stringify([
      {
        line: 10,
        severity: "CRITICAL",
        category: "security",
        message: "SQL injection",
        explanation: "User input is not sanitized",
        impact: "Data breach",
        suggestedFix: "Use parameterized queries",
      },
    ]);

    const issues = parseStandaloneResponse(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(10);
    expect(issues[0].severity).toBe("CRITICAL");
    expect(issues[0].category).toBe("security");
    expect(issues[0].message).toBe("SQL injection");
  });

  it("parses JSON object with issues array", () => {
    const input = JSON.stringify({
      issues: [
        {
          line: 5,
          severity: "MAJOR",
          category: "bug",
          message: "Null deref",
          explanation: "Could be null",
          impact: "Crash",
          suggestedFix: "Add null check",
        },
      ],
    });

    const issues = parseStandaloneResponse(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(5);
    expect(issues[0].severity).toBe("MAJOR");
  });

  it("returns empty array for invalid JSON", () => {
    const issues = parseStandaloneResponse("not valid json {{{");
    expect(issues).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    const issues = parseStandaloneResponse("[]");
    expect(issues).toEqual([]);
  });

  it("handles missing/invalid fields with defaults", () => {
    const input = JSON.stringify([{ unexpected: true }]);
    const issues = parseStandaloneResponse(input);

    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(0);
    expect(issues[0].severity).toBe("MAJOR");
    expect(issues[0].category).toBe("bug");
    expect(issues[0].message).toBe("Issue found");
    expect(issues[0].explanation).toBe("No explanation provided.");
    expect(issues[0].impact).toBe("No impact assessment provided.");
    expect(issues[0].suggestedFix).toBe("No fix suggested.");
  });
});
