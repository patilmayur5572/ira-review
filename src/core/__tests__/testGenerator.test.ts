import { describe, it, expect, vi } from "vitest";
import { generateTestCases } from "../testGenerator.js";
import type { JiraIssue } from "../../types/jira.js";

const mockIssue: JiraIssue = {
  key: "PROJ-123",
  fields: {
    summary: "Test feature",
    description: "Some description",
    status: { name: "In Progress" },
    issuetype: { name: "Story" },
    labels: [],
    acceptanceCriteria: "User should be able to log in",
  },
};

describe("generateTestCases", () => {
  it("parses JSON array response", async () => {
    const mockProvider = {
      review: vi.fn().mockResolvedValue({
        explanation: '[{"description":"test login","type":"happy-path","criterion":"AC1","code":"test(\'login\')"}]',
        impact: "",
        suggestedFix: "",
      }),
      rawReview: vi.fn().mockResolvedValue('[{"description":"test login","type":"happy-path","criterion":"AC1","code":"test(\'login\')"}]'),
    };

    const result = await generateTestCases(mockIssue, "jest", mockProvider as any, null);
    expect(result.testCases.length).toBeGreaterThan(0);
    expect(result.testCases[0].description).toBe("test login");
  });

  it("handles markdown-fenced JSON", async () => {
    const json = '[{"description":"test","type":"happy-path","criterion":"AC1","code":"it()"}]';
    const mockProvider = {
      rawReview: vi.fn().mockResolvedValue('```json\n' + json + '\n```'),
      review: vi.fn().mockResolvedValue({ explanation: json, impact: "", suggestedFix: "" }),
    };

    const result = await generateTestCases(mockIssue, "jest", mockProvider as any, null);
    expect(result.testCases.length).toBeGreaterThan(0);
  });

  it("handles raw test code fallback", async () => {
    const rawCode = 'describe("Login", () => {\n  it("should work", () => {\n    expect(true).toBe(true);\n  });\n});';
    const mockProvider = {
      rawReview: vi.fn().mockResolvedValue(rawCode),
      review: vi.fn().mockResolvedValue({ explanation: rawCode, impact: "", suggestedFix: "" }),
    };

    const result = await generateTestCases(mockIssue, "jest", mockProvider as any, null);
    expect(result.testCases.length).toBe(1);
    expect(result.testCases[0].code).toContain("describe");
  });

  it("returns empty with warning for unparseable response", async () => {
    const mockProvider = {
      rawReview: vi.fn().mockResolvedValue("I cannot generate tests for this."),
      review: vi.fn().mockResolvedValue({ explanation: "random text", impact: "", suggestedFix: "" }),
    };

    const result = await generateTestCases(mockIssue, "jest", mockProvider as any, null);
    expect(result.testCases).toHaveLength(0);
    expect(result.parseWarning).toBeDefined();
  });

  it("returns empty for missing acceptance criteria", async () => {
    const noAC: JiraIssue = { ...mockIssue, fields: { ...mockIssue.fields, acceptanceCriteria: undefined, description: null } };
    const mockProvider = { review: vi.fn(), rawReview: vi.fn() };

    const result = await generateTestCases(noAC, "jest", mockProvider as any, null);
    expect(result.testCases).toHaveLength(0);
    expect(mockProvider.review).not.toHaveBeenCalled();
  });
});
