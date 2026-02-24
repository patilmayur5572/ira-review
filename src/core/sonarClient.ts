import type { SonarConfig } from "../types/config.js";
import type { SonarIssue, SonarSearchResponse } from "../types/sonar.js";
import { withRetry } from "../utils/retry.js";

export class SonarClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly projectKey: string;

  constructor(config: SonarConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.projectKey = config.projectKey;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    };
  }

  async fetchPullRequestIssues(pullRequestId: string): Promise<SonarIssue[]> {
    const issues: SonarIssue[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const params = new URLSearchParams({
        componentKeys: this.projectKey,
        pullRequest: pullRequestId,
        ps: String(pageSize),
        p: String(page),
        resolved: "false",
      });

      const data = await this.fetchPage(params);
      issues.push(...data.issues);

      if (issues.length >= data.total) {
        break;
      }
      page++;
    }

    return issues;
  }

  private async fetchPage(
    params: URLSearchParams,
  ): Promise<SonarSearchResponse> {
    return withRetry(async () => {
      const url = `${this.baseUrl}/api/issues/search?${params}`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Sonar API error (${response.status}): ${body}`);
      }

      return (await response.json()) as SonarSearchResponse;
    });
  }
}
