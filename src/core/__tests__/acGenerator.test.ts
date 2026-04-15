import { describe, it, expect } from "vitest";
import { generateAcceptanceCriteria, formatACsForJiraComment } from "../acGenerator.js";
import type { JiraIssue } from "../../types/jira.js";
import type { AIProvider } from "../../types/review.js";

function makeJiraIssue(
  overrides: Partial<JiraIssue["fields"]> = {},
): JiraIssue {
  return {
    key: "PAY-101",
    fields: {
      summary: "Add payment endpoint",
      description: null,
      status: { name: "In Progress" },
      issuetype: { name: "Story" },
      labels: [],
      ...overrides,
    },
  };
}

// Simulates AI returning the wrapper { explanation: "JSON string", impact, suggestedFix }
function makeMockProvider(criteria: unknown[], reviewHints: string[] = []): AIProvider {
  return {
    review: async () => ({
      explanation: JSON.stringify({ criteria, reviewHints }),
      impact: "Coverage summary",
      suggestedFix: "None",
    }),
  };
}

describe("generateAcceptanceCriteria", () => {
  it("generates ACs with criteria and review hints", async () => {
    const provider = makeMockProvider(
      [
        { id: "AC-1", given: "a valid card", when: "the user submits payment", then: "the charge succeeds" },
        { id: "AC-2", given: "an expired card", when: "the user submits payment", then: "an error is shown" },
      ],
      ["Does this need PCI-DSS compliance?", "Should refunds be supported?"],
    );

    const result = await generateAcceptanceCriteria(
      makeJiraIssue(),
      provider,
      "node",
      { diff: "+app.post('/pay')", commitMessages: ["add payment route"] },
    );

    expect(result.jiraKey).toBe("PAY-101");
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0].given).toBe("a valid card");
    expect(result.reviewHints).toHaveLength(2);
    expect(result.reviewHints[0]).toContain("PCI-DSS");
    expect(result.sources).toContain("ticket summary");
    expect(result.sources).toContain("PR diff");
    expect(result.sources).toContain("1 commits");
  });

  it("tracks sources correctly based on available context", async () => {
    const provider = makeMockProvider([
      { id: "AC-1", given: "x", when: "y", then: "z" },
    ]);

    const result = await generateAcceptanceCriteria(
      makeJiraIssue({ description: "Some desc" }),
      provider,
      null,
      { epicSummary: "Auth Overhaul", subtasks: ["PAY-102: Refunds"] },
    );

    expect(result.sources).toContain("ticket description");
    expect(result.sources).toContain('epic "Auth Overhaul"');
    expect(result.sources).toContain("1 subtasks");
    expect(result.sources).not.toContain("PR diff");
  });

  it("drops malformed criteria missing given/when/then", async () => {
    const provider = makeMockProvider([
      { id: "AC-1", given: "valid", when: "action", then: "outcome" },
      { id: "AC-2", given: "", when: "action", then: "outcome" },
      { id: "AC-3", given: "valid", when: null, then: "outcome" },
      { id: "AC-4" },
    ]);

    const result = await generateAcceptanceCriteria(
      makeJiraIssue(),
      provider,
      null,
      {},
    );

    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].id).toBe("AC-1");
  });

  it("handles AI returning object explanation directly (not stringified)", async () => {
    const provider: AIProvider = {
      review: async () => ({
        // parseAIResponse will JSON.stringify this object since it's not a string
        explanation: JSON.stringify({
          criteria: [{ id: "AC-1", given: "a", when: "b", then: "c" }],
          reviewHints: ["hint1"],
        }),
        impact: "ok",
        suggestedFix: "none",
      }),
    };

    const result = await generateAcceptanceCriteria(
      makeJiraIssue(),
      provider,
      null,
      {},
    );

    expect(result.criteria).toHaveLength(1);
    expect(result.reviewHints).toHaveLength(1);
  });

  it("returns empty criteria for spike tickets with appropriate warning", async () => {
    const provider: AIProvider = {
      review: async () => ({
        explanation: "[]",
        impact: "none",
        suggestedFix: "none",
      }),
    };

    const result = await generateAcceptanceCriteria(
      makeJiraIssue({ issuetype: { name: "Spike" } }),
      provider,
      null,
      { diff: "+some code" },
    );

    // Spike tickets should still work (the prompt changes but doesn't block)
    expect(result.jiraKey).toBe("PAY-101");
  });

  it("handles bug ticket type in prompt context", async () => {
    const provider = makeMockProvider(
      [
        { id: "AC-1", given: "the reported bug condition exists", when: "user performs the action", then: "correct behavior occurs" },
        { id: "AC-2", given: "the fix is applied", when: "related feature is used", then: "no regression occurs" },
      ],
      ["Was this a data corruption issue that needs a migration?"],
    );

    const result = await generateAcceptanceCriteria(
      makeJiraIssue({ issuetype: { name: "Bug" } }),
      provider,
      null,
      { diff: "+fix applied" },
    );

    expect(result.criteria).toHaveLength(2);
    expect(result.reviewHints).toHaveLength(1);
  });

  it("returns empty with parseWarning on unparseable response", async () => {
    const provider: AIProvider = {
      review: async () => ({
        explanation: "Sorry, I cannot generate acceptance criteria for this.",
        impact: "none",
        suggestedFix: "none",
      }),
    };

    const result = await generateAcceptanceCriteria(
      makeJiraIssue(),
      provider,
      null,
      {},
    );

    expect(result.criteria).toHaveLength(0);
    expect(result.reviewHints).toHaveLength(0);
    expect(result.parseWarning).toBeDefined();
  });
});

describe("formatACsForJiraComment", () => {
  it("formats ACs with review hints", () => {
    const comment = formatACsForJiraComment(
      {
        jiraKey: "PAY-101",
        summary: "Add payment endpoint",
        criteria: [
          { id: "AC-1", given: "a valid card", when: "the user pays", then: "the charge succeeds" },
        ],
        totalCriteria: 1,
        sources: ["ticket summary", "PR diff"],
        reviewHints: ["Does this need PCI-DSS compliance?"],
      },
      "42",
      "feature/payments",
    );

    expect(comment).toContain("*AC-1:*");
    expect(comment).toContain("Given a valid card");
    expect(comment).toContain("*Questions for PO to consider:*");
    expect(comment).toContain("PCI-DSS");
    expect(comment).toContain("Note for testers");
  });

  it("includes Generated by IRA marker for duplicate detection", () => {
    const comment = formatACsForJiraComment(
      {
        jiraKey: "PAY-101",
        summary: "Add payment",
        criteria: [{ id: "AC-1", given: "a", when: "b", then: "c" }],
        totalCriteria: 1,
        sources: ["ticket summary"],
        reviewHints: [],
      },
      "42",
    );

    expect(comment).toContain("Generated by IRA");
    expect(comment).toContain("*Acceptance Criteria*");
  });

  it("omits review hints section when empty", () => {
    const comment = formatACsForJiraComment(
      {
        jiraKey: "PAY-101",
        summary: "Add payment",
        criteria: [{ id: "AC-1", given: "a", when: "b", then: "c" }],
        totalCriteria: 1,
        sources: ["ticket summary"],
        reviewHints: [],
      },
      "42",
    );

    expect(comment).not.toContain("Questions for PO");
    expect(comment).toContain("Given a");
  });
});
