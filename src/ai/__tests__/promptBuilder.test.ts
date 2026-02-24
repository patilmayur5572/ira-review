import { describe, it, expect } from "vitest";
import { buildPrompt } from "../promptBuilder.js";
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
});
