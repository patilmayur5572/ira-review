import type { JiraConfig } from "../types/config.js";
import type { JiraIssue } from "../types/jira.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

export class JiraClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly acceptanceCriteriaField: string;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.acceptanceCriteriaField =
      config.acceptanceCriteriaField ?? "customfield_10035";
    this.headers = {
      Authorization: `Basic ${btoa(`${config.email}:${config.token}`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async fetchIssue(issueKey: string): Promise<JiraIssue> {
    return withRetry(async () => {
      const fields = `summary,description,status,issuetype,labels,${this.acceptanceCriteriaField}`;
      const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}?fields=${fields}`;

      const response = await fetchWithTimeout(url, { headers: this.headers });

      if (!response.ok) {
        const body = await response.text();
        throw new RetryableError(
          `JIRA API error (${response.status}): ${body}`,
          response.status,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      const fields_ = data.fields as Record<string, unknown>;

      return {
        key: data.key as string,
        fields: {
          summary: fields_.summary as string,
          description: this.extractText(fields_.description),
          acceptanceCriteria: this.extractText(
            fields_[this.acceptanceCriteriaField],
          ),
          status: fields_.status as { name: string },
          issuetype: fields_.issuetype as { name: string },
          labels: (fields_.labels as string[]) ?? [],
        },
      };
    });
  }

  private extractText(field: unknown): string | null {
    if (typeof field === "string") return field;
    if (!field || typeof field !== "object") return null;

    // Handle Atlassian Document Format (ADF)
    const doc = field as { content?: Array<{ content?: Array<{ text?: string }> }> };
    if (!doc.content) return null;

    return doc.content
      .flatMap((block) => block.content ?? [])
      .map((inline) => inline.text ?? "")
      .join(" ")
      .trim() || null;
  }
}
