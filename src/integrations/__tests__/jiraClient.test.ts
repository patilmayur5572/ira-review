import { describe, it, expect, vi, afterEach } from "vitest";
import { JiraClient } from "../jiraClient.js";

vi.mock("../../utils/retry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/retry.js")>();
  return {
    ...actual,
    withRetry: <T>(fn: () => Promise<T>) => fn(),
    fetchWithTimeout: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args),
  };
});

const jiraConfig = {
  baseUrl: "https://jira.example.com",
  email: "user@example.com",
  token: "jira-token",
};

describe("JiraClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and parses a JIRA issue", async () => {
    const apiResponse = {
      key: "PROJ-42",
      fields: {
        summary: "Fix login bug",
        description: "Users cannot login with SSO",
        status: { name: "In Progress" },
        issuetype: { name: "Bug" },
        labels: ["backend", "auth"],
        customfield_10035: "Login should work with SSO provider",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient(jiraConfig);
    const issue = await client.fetchIssue("PROJ-42");

    expect(issue.key).toBe("PROJ-42");
    expect(issue.fields.summary).toBe("Fix login bug");
    expect(issue.fields.description).toBe("Users cannot login with SSO");
    expect(issue.fields.status.name).toBe("In Progress");
    expect(issue.fields.issuetype.name).toBe("Bug");
    expect(issue.fields.labels).toEqual(["backend", "auth"]);
    expect(issue.fields.acceptanceCriteria).toBe(
      "Login should work with SSO provider",
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/rest/api/3/issue/PROJ-42"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Basic "),
        }),
      }),
    );
  });

  it("extracts text from Atlassian Document Format (ADF)", async () => {
    const adfContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "First paragraph." },
            { type: "text", text: " More text." },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second paragraph." }],
        },
      ],
    };

    const apiResponse = {
      key: "PROJ-99",
      fields: {
        summary: "ADF test",
        description: adfContent,
        status: { name: "Open" },
        issuetype: { name: "Task" },
        labels: [],
        customfield_10035: null,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient(jiraConfig);
    const issue = await client.fetchIssue("PROJ-99");

    expect(issue.fields.description).toBe(
      "First paragraph.  More text. Second paragraph.",
    );
    expect(issue.fields.acceptanceCriteria).toBeNull();
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Issue Does Not Exist"),
    });

    const client = new JiraClient(jiraConfig);

    await expect(client.fetchIssue("PROJ-999")).rejects.toThrow(
      "JIRA API error (404)",
    );
  });

  it("handles numeric custom field values", async () => {
    const apiResponse = {
      key: "PROJ-60",
      fields: {
        summary: "Numeric field test",
        description: null,
        status: { name: "Open" },
        issuetype: { name: "Task" },
        labels: [],
        customfield_10035: 42,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient(jiraConfig);
    const issue = await client.fetchIssue("PROJ-60");

    expect(issue.fields.acceptanceCriteria).toBe("42");
  });

  it("handles array custom field values", async () => {
    const apiResponse = {
      key: "PROJ-61",
      fields: {
        summary: "Array field test",
        description: null,
        status: { name: "Open" },
        issuetype: { name: "Task" },
        labels: [],
        customfield_10035: ["Criterion A", "Criterion B", "Criterion C"],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient(jiraConfig);
    const issue = await client.fetchIssue("PROJ-61");

    expect(issue.fields.acceptanceCriteria).toBe("Criterion A\nCriterion B\nCriterion C");
  });

  it("handles object without content property without crashing", async () => {
    const apiResponse = {
      key: "PROJ-62",
      fields: {
        summary: "Object without content",
        description: null,
        status: { name: "Open" },
        issuetype: { name: "Task" },
        labels: [],
        customfield_10035: { id: "12345", name: "Some option" },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient(jiraConfig);
    const issue = await client.fetchIssue("PROJ-62");

    expect(issue.fields.acceptanceCriteria).toBeNull();
  });

  it("uses custom acceptance criteria field", async () => {
    const apiResponse = {
      key: "PROJ-50",
      fields: {
        summary: "Custom field test",
        description: null,
        status: { name: "Open" },
        issuetype: { name: "Story" },
        labels: [],
        customfield_99999: "Custom AC value",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const client = new JiraClient({
      ...jiraConfig,
      acceptanceCriteriaField: "customfield_99999",
    });
    const issue = await client.fetchIssue("PROJ-50");

    expect(issue.fields.acceptanceCriteria).toBe("Custom AC value");
  });
});
