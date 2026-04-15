import type { BitbucketConfig } from "../types/config.js";
import type { ReviewComment, SCMProvider, PRState } from "../types/review.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

export class BitbucketClient implements SCMProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly workspace: string;
  private readonly repoSlug: string;
  private readonly shaCache = new Map<string, Promise<string>>();

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

  async postSummary(
    summary: string,
    pullRequestId: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/comments`;

    const body = {
      content: { raw: summary },
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
          `Bitbucket API error (${response.status}): ${text}`,
          response.status,
        );
      }
    });
  }

  async getFileContent(
    filePath: string,
    pullRequestId: string,
  ): Promise<string> {
    const sourceHash = await this.getSourceHash(pullRequestId);

    // Fetch the file content at that commit
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const fileUrl = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/src/${sourceHash}/${encodedPath}`;

    return withRetry(async () => {
      const response = await fetchWithTimeout(fileUrl, {
        headers: this.headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `Bitbucket API error (${response.status}): ${text}`,
          response.status,
        );
      }

      return response.text();
    });
  }

  async getPRState(pullRequestId: string): Promise<PRState> {
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}`;
    const response = await fetchWithTimeout(url, { headers: this.headers });
    if (response.status === 404) {
      throw new Error(
        `PR #${pullRequestId} was not found — it may have been deleted.\n` +
        `  💡 Double-check the PR number and try again.`,
      );
    }
    if (!response.ok) return "unknown";
    const data = (await response.json()) as { state: string };
    const state = data.state?.toUpperCase();
    if (state === "MERGED") return "merged";
    if (state === "DECLINED" || state === "SUPERSEDED") return "declined";
    return "open";
  }

  async getDiff(pullRequestId: string): Promise<string> {
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/diff`;

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        headers: this.headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `Bitbucket API error (${response.status}): ${text}`,
          response.status,
        );
      }

      return response.text();
    });
  }

  async getDiffPerFile(pullRequestId: string): Promise<Map<string, string>> {
    const fileMap = new Map<string, string>();

    // Fetch diffstat to get list of changed files
    let nextUrl: string | null = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/diffstat?pagelen=100`;

    const changedFiles: string[] = [];
    while (nextUrl) {
      const data = await withRetry(async () => {
        const response = await fetchWithTimeout(nextUrl!, { headers: this.headers });
        if (!response.ok) {
          const text = await response.text();
          throw new RetryableError(`Bitbucket API error (${response.status}): ${text}`, response.status);
        }
        return response.json() as Promise<{ values: Array<{ new?: { path: string }; old?: { path: string }; status: string }>; next?: string }>;
      });

      for (const entry of data.values) {
        if (entry.status === "removed") continue;
        const path = entry.new?.path ?? entry.old?.path;
        if (path) changedFiles.push(path);
      }

      nextUrl = data.next ?? null;
    }

    // Fetch diff for each file individually
    for (const filePath of changedFiles) {
      try {
        const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
        const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/diff?path=${encodedPath}`;
        const diff = await withRetry(async () => {
          const response = await fetchWithTimeout(url, { headers: this.headers }, 15000);
          if (!response.ok) {
            const text = await response.text();
            throw new RetryableError(`Bitbucket API error (${response.status}): ${text}`, response.status);
          }
          return response.text();
        });
        if (diff.trim()) {
          fileMap.set(filePath, diff);
        }
      } catch {
        // Soft fail per file — skip files whose diff can't be fetched
      }
    }

    return fileMap;
  }

  private getSourceHash(pullRequestId: string): Promise<string> {
    const cached = this.shaCache.get(pullRequestId);
    if (cached) return cached;

    const promise = withRetry(async () => {
      const prUrl = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}`;
      const response = await fetchWithTimeout(prUrl, {
        headers: this.headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          `Bitbucket API error (${response.status}): ${text}`,
          response.status,
        );
      }

      const data = (await response.json()) as { source: { commit: { hash: string } } };
      return data.source.commit.hash;
    });

    this.shaCache.set(pullRequestId, promise);
    return promise;
  }

  async applyRiskLabel(
    pullRequestId: string,
    riskLevel: string,
    riskScore: number,
  ): Promise<void> {
    const sha = await this.getSourceHash(pullRequestId);
    const state = riskLevel === "CRITICAL" || riskLevel === "HIGH" ? "FAILED"
      : riskLevel === "MEDIUM" ? "INPROGRESS"
      : "SUCCESSFUL";

    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/commit/${sha}/statuses/build`;

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          key: "ira-risk",
          state,
          name: `IRA Risk: ${riskLevel} (${riskScore}/100)`,
          description: `IRA assessed this PR as ${riskLevel.toLowerCase()} risk`,
          url: `https://github.com/patilmayur5572/ira-review`,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
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
