import type { GitHubConfig } from "../types/config.js";
import type { ReviewComment, SCMProvider } from "../types/review.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

export class GitHubClient implements SCMProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly owner: string;
  private readonly repo: string;
  private readonly shaCache = new Map<string, Promise<string>>();

  constructor(config: GitHubConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.github.com").replace(
      /\/+$/,
      "",
    );
    this.owner = config.owner;
    this.repo = config.repo;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  async postComment(
    comment: ReviewComment,
    pullRequestId: string,
  ): Promise<void> {
    if (comment.line > 0) {
      try {
        await this.postReviewComment(comment, pullRequestId);
        return;
      } catch (error) {
        // Only fall back to issue comment on 422/400 (invalid diff position)
        const status = error instanceof RetryableError ? error.statusCode : undefined;
        if (status !== 422 && status !== 400) throw error;
      }
    }

    await this.postIssueComment(comment, pullRequestId);
  }

  async postSummary(
    summary: string,
    pullRequestId: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${pullRequestId}/comments`;

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ body: summary }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }
    });
  }

  async getDiff(pullRequestId: string): Promise<string> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${pullRequestId}`;

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        headers: {
          ...this.headers,
          Accept: "application/vnd.github.v3.diff",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }

      return response.text();
    });
  }

  async getFileContent(
    filePath: string,
    pullRequestId: string,
  ): Promise<string> {
    const sha = await this.getHeadSha(pullRequestId);
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${encodedPath}?ref=${sha}`;

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        headers: this.headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }

      const data = (await response.json()) as { content: string; encoding: string };
      if (data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return data.content;
    });
  }

  private async postReviewComment(
    comment: ReviewComment,
    pullRequestId: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${pullRequestId}/comments`;

    const body = {
      body: this.formatComment(comment),
      commit_id: await this.getHeadSha(pullRequestId),
      path: comment.filePath,
      line: comment.line,
      side: "RIGHT",
    };

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }
    });
  }

  private async postIssueComment(
    comment: ReviewComment,
    pullRequestId: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${pullRequestId}/comments`;

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ body: this.formatComment(comment) }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }
    });
  }

  private getHeadSha(pullRequestId: string): Promise<string> {
    const cached = this.shaCache.get(pullRequestId);
    if (cached) return cached;

    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${pullRequestId}`;

    const promise = withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        headers: this.headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
          response.status,
        );
      }

      const data = (await response.json()) as { head: { sha: string } };
      return data.head.sha;
    });

    this.shaCache.set(pullRequestId, promise);
    return promise;
  }

  async applyRiskLabel(
    pullRequestId: string,
    riskLevel: string,
    riskScore: number,
  ): Promise<void> {
    const colorMap: Record<string, string> = {
      CRITICAL: "b60205",
      HIGH: "d93f0b",
      MEDIUM: "fbca04",
      LOW: "0e8a16",
    };

    const labelName = `ira:${riskLevel.toLowerCase()}`;
    const color = colorMap[riskLevel] ?? "c5def5";
    const description = `IRA-assessed ${riskLevel.toLowerCase()} risk`;

    // Ensure label exists in the repo
    try {
      await withRetry(async () => {
        const response = await fetchWithTimeout(
          `${this.baseUrl}/repos/${this.owner}/${this.repo}/labels`,
          {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ name: labelName, color, description }),
          },
        );

        // 422 = label already exists, which is fine
        if (!response.ok && response.status !== 422) {
          const text = await response.text();
          throw new RetryableError(
            `GitHub API error (${response.status}): ${text}`,
            response.status,
          );
        }
      });
    } catch {
      // Soft fail — label creation might fail due to permissions
    }

    // Remove stale ira:* labels from PR
    try {
      const labelsResponse = await fetchWithTimeout(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${pullRequestId}/labels`,
        { headers: this.headers },
      );

      if (labelsResponse.ok) {
        const labels = (await labelsResponse.json()) as Array<{ name: string }>;
        for (const label of labels) {
          if (label.name.startsWith("ira:") && label.name !== labelName) {
            await fetchWithTimeout(
              `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${pullRequestId}/labels/${encodeURIComponent(label.name)}`,
              { method: "DELETE", headers: this.headers },
            );
          }
        }
      }
    } catch {
      // Soft fail — stale label removal is best-effort
    }

    // Apply the new label
    await withRetry(async () => {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${pullRequestId}/labels`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ labels: [labelName] }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${text}`,
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

    const marker = `<!-- ira:file=${comment.filePath};line=${comment.line};rule=${comment.rule} -->`;

    return [
      marker,
      `🔍 **IRA Review** - \`${comment.rule}\` (${comment.severity})`,
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
