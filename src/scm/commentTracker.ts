import type { BitbucketConfig, GitHubConfig } from "../types/config.js";
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

interface GitHubComment {
  id: number;
  body: string;
  path?: string;
  line?: number | null;
}

export class CommentTracker {
  private readonly provider: "bitbucket" | "github";
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  // Bitbucket
  private readonly workspace?: string;
  private readonly repoSlug?: string;
  // GitHub
  private readonly owner?: string;
  private readonly repo?: string;

  constructor(config: BitbucketConfig, provider?: "bitbucket");
  constructor(config: GitHubConfig, provider: "github");
  constructor(
    config: BitbucketConfig | GitHubConfig,
    provider: "bitbucket" | "github" = "bitbucket",
  ) {
    this.provider = provider;

    if (provider === "github") {
      const gh = config as GitHubConfig;
      this.baseUrl = (gh.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
      this.owner = gh.owner;
      this.repo = gh.repo;
      this.headers = {
        Authorization: `Bearer ${gh.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };
    } else {
      const bb = config as BitbucketConfig;
      this.baseUrl = (bb.baseUrl ?? "https://api.bitbucket.org/2.0").replace(/\/+$/, "");
      this.workspace = bb.workspace;
      this.repoSlug = bb.repoSlug;
      this.headers = {
        Authorization: `Bearer ${bb.token}`,
        "Content-Type": "application/json",
      };
    }
  }

  async getExistingIraComments(pullRequestId: string): Promise<Set<string>> {
    if (this.provider === "github") {
      return this.getGitHubIraComments(pullRequestId);
    }
    return this.getBitbucketIraComments(pullRequestId);
  }

  private async getBitbucketIraComments(pullRequestId: string): Promise<Set<string>> {
    const keys = new Set<string>();
    let url: string | undefined =
      `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${pullRequestId}/comments?pagelen=100`;

    while (url) {
      const page = await this.fetchBitbucketPage(url);
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

  private async getGitHubIraComments(pullRequestId: string): Promise<Set<string>> {
    const keys = new Set<string>();

    // Check review comments (inline on files)
    let page = 1;
    while (true) {
      const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${pullRequestId}/comments?per_page=100&page=${page}`;
      const comments = await this.fetchGitHubComments(url);

      for (const comment of comments) {
        if (comment.body.includes(IRA_MARKER) && comment.path && comment.line) {
          keys.add(`${comment.path}:${comment.line}`);
        }
      }

      if (comments.length < 100) break;
      page++;
    }

    return keys;
  }

  private async fetchBitbucketPage(url: string): Promise<BitbucketCommentsResponse> {
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

  private async fetchGitHubComments(url: string): Promise<GitHubComment[]> {
    return withRetry(async () => {
      const response = await fetchWithTimeout(url, { headers: this.headers });

      if (!response.ok) {
        const body = await response.text();
        throw new RetryableError(
          `GitHub API error (${response.status}): ${body}`,
          response.status,
        );
      }

      return (await response.json()) as GitHubComment[];
    });
  }
}

export function deduplicateKey(filePath: string, line: number): string {
  return `${filePath}:${line}`;
}
