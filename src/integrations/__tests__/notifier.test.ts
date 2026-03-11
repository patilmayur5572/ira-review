import { describe, it, expect, vi, afterEach } from "vitest";
import { Notifier } from "../notifier.js";
import type { ReviewResult } from "../../types/review.js";

const mockResult: ReviewResult = {
  pullRequestId: "42",
  framework: "react",
  totalIssues: 5,
  reviewedIssues: 2,
  comments: [],
  risk: { level: "HIGH", score: 45, maxScore: 100, factors: [], summary: "" },
  complexity: null,
  acceptanceValidation: null,
};

describe("Notifier", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends Slack notification", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve({ ok: true });
    });

    const notifier = new Notifier({
      slackWebhookUrl: "https://hooks.slack.com/test",
    });

    await notifier.notify(mockResult);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({ method: "POST" }),
    );

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.blocks).toBeDefined();
    expect(parsed.blocks[0].text.text).toContain("PR #42");
  });

  it("sends Teams notification", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve({ ok: true });
    });

    const notifier = new Notifier({
      teamsWebhookUrl: "https://outlook.webhook.office.com/test",
    });

    await notifier.notify(mockResult);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed["@type"]).toBe("MessageCard");
    expect(parsed.sections[0].activityTitle).toContain("PR #42");
  });

  it("sends to both Slack and Teams", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const notifier = new Notifier({
      slackWebhookUrl: "https://hooks.slack.com/test",
      teamsWebhookUrl: "https://outlook.webhook.office.com/test",
    });

    await notifier.notify(mockResult);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no webhooks configured", async () => {
    globalThis.fetch = vi.fn();

    const notifier = new Notifier({});
    await notifier.notify(mockResult);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
