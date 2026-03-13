import { describe, it, expect } from "vitest";
import { validateAcceptanceCriteria } from "../acceptanceValidator.js";
import type { JiraIssue } from "../../types/jira.js";
import type { AIProvider } from "../../types/review.js";

function makeJiraIssue(
  overrides: Partial<JiraIssue["fields"]> = {},
): JiraIssue {
  return {
    key: "PROJ-123",
    fields: {
      summary: "Add user login",
      description: "Implement login flow",
      status: { name: "In Review" },
      issuetype: { name: "Story" },
      labels: [],
      ...overrides,
    },
  };
}

const mockAIProvider: AIProvider = {
  review: async () => ({
    explanation:
      "CRITERION_1: MET - Login form implemented | CRITERION_2: MET - Validation present",
    impact: "PR meets acceptance criteria",
    suggestedFix: "No changes needed",
  }),
};

describe("validateAcceptanceCriteria", () => {
  it("returns criteria when acceptance criteria are present", async () => {
    const issue = makeJiraIssue({
      acceptanceCriteria: "Login form should validate email. Error messages displayed.",
    });

    const result = await validateAcceptanceCriteria(
      issue,
      [],
      null,
      mockAIProvider,
    );

    expect(result.jiraKey).toBe("PROJ-123");
    expect(result.summary).toBe("Add user login");
    expect(result.criteria).toBeInstanceOf(Array);
    expect(result.criteria.length).toBeGreaterThan(0);
    expect(result.overallPass).toBe(true);
  });

  it("falls back to description when acceptanceCriteria is missing", async () => {
    const issue = makeJiraIssue({
      acceptanceCriteria: undefined,
      description: "Implement login flow with validation",
    });

    const result = await validateAcceptanceCriteria(
      issue,
      [],
      null,
      mockAIProvider,
    );

    expect(result.jiraKey).toBe("PROJ-123");
    expect(result.criteria.length).toBeGreaterThan(0);
  });

  it("returns empty criteria and overallPass false when no AC or description", async () => {
    const issue = makeJiraIssue({
      acceptanceCriteria: null,
      description: null,
    });

    const result = await validateAcceptanceCriteria(
      issue,
      [],
      null,
      mockAIProvider,
    );

    expect(result.jiraKey).toBe("PROJ-123");
    expect(result.criteria).toHaveLength(0);
    expect(result.overallPass).toBe(false);
  });

  it("parses JSON array wrapped in conversational text", async () => {
    const wrappedJsonProvider: AIProvider = {
      review: async () => ({
        explanation:
          'Here are the results:\n[{"description":"Auth","met":true,"evidence":"Implemented"}]',
        impact: "Meets criteria",
        suggestedFix: "None",
      }),
    };

    const issue = makeJiraIssue({
      acceptanceCriteria: "Auth should be implemented",
    });

    const result = await validateAcceptanceCriteria(
      issue,
      [],
      null,
      wrappedJsonProvider,
    );

    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]!.description).toBe("Auth");
    expect(result.criteria[0]!.met).toBe(true);
    expect(result.criteria[0]!.evidence).toBe("Implemented");
    expect(result.overallPass).toBe(true);
  });

  it("sets overallPass to false when AI reports NOT_MET criteria", async () => {
    const failingProvider: AIProvider = {
      review: async () => ({
        explanation:
          "CRITERION_1: NOT_MET - Login form missing | CRITERION_2: MET - Tests pass",
        impact: "PR does not meet all criteria",
        suggestedFix: "Add login form",
      }),
    };

    const issue = makeJiraIssue({
      acceptanceCriteria: "Login form present. Tests pass.",
    });

    const result = await validateAcceptanceCriteria(
      issue,
      [],
      null,
      failingProvider,
    );

    expect(result.overallPass).toBe(false);
    expect(result.criteria.some((c) => !c.met)).toBe(true);
  });
});
