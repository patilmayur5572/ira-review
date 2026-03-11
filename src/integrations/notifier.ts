import type { NotificationConfig } from "../types/config.js";
import type { ReviewResult } from "../types/review.js";
import { withRetry, fetchWithTimeout } from "../utils/retry.js";

export class Notifier {
  private readonly config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  async notify(result: ReviewResult): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.slackWebhookUrl) {
      promises.push(this.sendSlack(result));
    }

    if (this.config.teamsWebhookUrl) {
      promises.push(this.sendTeams(result));
    }

    await Promise.all(promises);
  }

  private async sendSlack(result: ReviewResult): Promise<void> {
    const riskEmoji =
      result.risk?.level === "CRITICAL"
        ? "🔴"
        : result.risk?.level === "HIGH"
          ? "🟠"
          : result.risk?.level === "MEDIUM"
            ? "🟡"
            : "🟢";

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🔍 IRA Review: PR #${result.pullRequestId}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Risk:* ${riskEmoji} ${result.risk?.level ?? "N/A"} (${result.risk?.score ?? 0}/${result.risk?.maxScore ?? 100})`,
          },
          {
            type: "mrkdwn",
            text: `*Issues:* ${result.reviewedIssues}/${result.totalIssues} reviewed`,
          },
          {
            type: "mrkdwn",
            text: `*Framework:* ${result.framework ?? "not detected"}`,
          },
          {
            type: "mrkdwn",
            text: `*Comments posted:* ${result.comments.length}`,
          },
        ],
      },
    ];

    if (result.acceptanceValidation) {
      const acIcon = result.acceptanceValidation.overallPass ? "✅" : "❌";
      blocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*JIRA AC:* ${acIcon} ${result.acceptanceValidation.jiraKey}`,
          },
        ],
      });
    }

    await this.postWebhook(this.config.slackWebhookUrl!, { blocks });
  }

  private async sendTeams(result: ReviewResult): Promise<void> {
    const riskEmoji =
      result.risk?.level === "CRITICAL"
        ? "🔴"
        : result.risk?.level === "HIGH"
          ? "🟠"
          : result.risk?.level === "MEDIUM"
            ? "🟡"
            : "🟢";

    const card = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      summary: `IRA Review: PR #${result.pullRequestId}`,
      themeColor: result.risk?.level === "CRITICAL" ? "FF0000" : result.risk?.level === "HIGH" ? "FF8C00" : "00FF00",
      sections: [
        {
          activityTitle: `🔍 IRA Review: PR #${result.pullRequestId}`,
          facts: [
            { name: "Risk", value: `${riskEmoji} ${result.risk?.level ?? "N/A"} (${result.risk?.score ?? 0}/${result.risk?.maxScore ?? 100})` },
            { name: "Issues", value: `${result.reviewedIssues}/${result.totalIssues} reviewed` },
            { name: "Framework", value: result.framework ?? "not detected" },
            { name: "Comments", value: `${result.comments.length} posted` },
          ],
        },
      ],
    };

    if (result.acceptanceValidation) {
      const acIcon = result.acceptanceValidation.overallPass ? "✅" : "❌";
      card.sections[0].facts.push({
        name: "JIRA AC",
        value: `${acIcon} ${result.acceptanceValidation.jiraKey}`,
      });
    }

    await this.postWebhook(this.config.teamsWebhookUrl!, card);
  }

  private async postWebhook(
    url: string,
    payload: unknown,
  ): Promise<void> {
    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook error (${response.status}): ${text}`);
      }
    });
  }
}
