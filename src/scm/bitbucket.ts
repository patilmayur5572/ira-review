import type { BitbucketConfig } from "../types/config.js";
import type { ReviewComment, SCMProvider } from "../types/review.js";
import { withRetry } from "../utils/retry.js";

export class BitbucketClient implements SCMProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly workspace: string;
  private readonly repoSlug: string;

  constructor(config: BitbucketConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.bitbucket.org/2.0").replace(
      /\/+$/,
      "",
    );
    this.workspace = config.workspace;
    this.repoSlug = config.repoSlug;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    };
  }

  async postComment(
    comment: ReviewComment,
    pullRequestId: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/comments`;

    const body = {
      content: {
        raw: this.formatComment(comment),
      },
      inline: {
        path: comment.filePath,
        to: comment.line,
      },
    };

    await withRetry(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitbucket API error (${response.status}): ${text}`);
      }
    });
  }

  private formatComment(comment: ReviewComment): string {
    const { aiReview } = comment;
    return [
      `🔍 **IRA Review** — \`${comment.rule}\` (${comment.severity})`,
      "",
      `> ${comment.message}`,
      "",
      `**Explanation:** ${aiReview.explanation}`,
      "",
      `**Impact:** ${aiReview.impact}`,
      "",
      `**Suggested Fix:**`,
      aiReview.suggestedFix,
    ].join("\n");
  }
}
