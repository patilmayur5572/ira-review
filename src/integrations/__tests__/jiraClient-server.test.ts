import { describe, it, expect, vi, afterEach } from "vitest";
import { JiraClient } from "../jiraClient.js";

describe("JiraClient — Server / Data Center", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses Bearer auth (not Basic) when type=server, ignoring email", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            key: "PROJ-1",
            fields: { summary: "x", description: null, issuetype: { name: "Story" }, status: { name: "Open" }, labels: [] },
          }),
      });
    });

    const client = new JiraClient({
      baseUrl: "https://jira.example.com",
      email: "ignored@example.com",
      token: "pat-server-1234",
      type: "server",
      acceptanceCriteriaField: "customfield_10035",
    });

    await client.fetchIssue("PROJ-1");
    expect(capturedHeaders.Authorization).toBe("Bearer pat-server-1234");
  });

  it("uses /rest/api/2 path for Server (not /rest/api/3)", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            key: "PROJ-1",
            fields: { summary: "x", description: null, issuetype: { name: "Story" }, status: { name: "Open" }, labels: [] },
          }),
      });
    });

    const client = new JiraClient({
      baseUrl: "https://jira.example.com",
      email: "",
      token: "pat",
      type: "server",
      acceptanceCriteriaField: "customfield_10035",
    });

    await client.fetchIssue("PROJ-1");
    expect(capturedUrl).toContain("/rest/api/2/issue/PROJ-1");
    expect(capturedUrl).not.toContain("/rest/api/3/");
  });

  it("appends a Server-specific hint on 401 errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    });

    const client = new JiraClient({
      baseUrl: "https://jira.example.com",
      email: "",
      token: "bad-token",
      type: "server",
      acceptanceCriteriaField: "customfield_10035",
    });

    await expect(client.fetchIssue("PROJ-1")).rejects.toThrow(/Personal Access Token/i);
  });
});
