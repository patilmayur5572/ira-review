import type { BitbucketConfig } from "../types/config.js";
import type { ReviewComment, SCMProvider } from "../types/review.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

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

    const body: Record<string, unknown> = {
      content: {
        raw: this.formatComment(comment),
      },
    };

    // Only post as inline if we have a valid line number
    if (comment.line > 0) {
      body.inline = {
        path: comment.filePath,
        to: comment.line,
      };
    }

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();

        // If inline comment fails with 400 (position not in diff), retry as file-level comment
        if (response.status === 400 && body.inline) {
          delete body.inline;
          const retryResponse = await fetchWithTimeout(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(body),
          });
          if (!retryResponse.ok) {
            const retryText = await retryResponse.text();
            throw new RetryableError(
              `Bitbucket API error (${retryResponse.status}): ${retryText}`,
              retryResponse.status,
            );
          }
          return;
        }

        throw new RetryableError(
          `Bitbucket API error (${response.status}): ${text}`,
          response.status,
        );
      }
    });
  }

  private formatComment(comment: ReviewComment): string {
    const { aiReview } = comment;
    const location =
      comment.line > 0
        ? ""
        : `\n**File:** \`${comment.filePath}\`\n`;

    return [
      `🔍 **IRA Review** — \`${comment.rule}\` (${comment.severity})`,
      location,
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
