import type { BitbucketConfig } from "../types/config.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

const IRA_MARKER = "🔍 **IRA Review**";

interface BitbucketComment {
  id: number;
  content: { raw: string };
  inline?: { path: string; to: number };
}

interface BitbucketCommentsResponse {
  values: BitbucketComment[];
  next?: string;
}

export class CommentTracker {
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

  async getExistingIraComments(
    pullRequestId: string,
  ): Promise<Set<string>> {
    const keys = new Set<string>();
    let url: string | undefined =
      `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/comments?pagelen=100`;

    while (url) {
      const page = await this.fetchPage(url);
      for (const comment of page.values) {
        if (comment.content.raw.includes(IRA_MARKER) && comment.inline) {
          const key = `${comment.inline.path}:${comment.inline.to}`;
          keys.add(key);
        }
      }
      url = page.next;
    }

    return keys;
  }

  private async fetchPage(
    url: string,
  ): Promise<BitbucketCommentsResponse> {
    return withRetry(async () => {
      const response = await fetchWithTimeout(url, { headers: this.headers });

      if (!response.ok) {
        const body = await response.text();
        throw new RetryableError(
          `Bitbucket API error (${response.status}): ${body}`,
          response.status,
        );
      }

      return (await response.json()) as BitbucketCommentsResponse;
    });
  }
}

export function deduplicateKey(filePath: string, line: number): string {
  return `${filePath}:${line}`;
}
