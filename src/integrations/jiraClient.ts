import type { JiraConfig } from "../types/config.js";
import type { JiraIssue } from "../types/jira.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

export class JiraClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly acceptanceCriteriaField: string;
  private readonly isCloud: boolean;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.acceptanceCriteriaField =
      config.acceptanceCriteriaField ?? "customfield_10035";
    this.isCloud = config.type === "cloud" || (!config.type && config.baseUrl.includes("atlassian.net"));
    const authHeader = this.isCloud
      ? `Basic ${btoa(`${config.email}:${config.token}`)}`
      : `Bearer ${config.token}`;
    this.headers = {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async fetchIssue(issueKey: string): Promise<JiraIssue> {
    return withRetry(async () => {
      const fields = `summary,description,status,issuetype,labels,${this.acceptanceCriteriaField}`;
      const apiVersion = this.isCloud ? "3" : "2";
      const url = `${this.baseUrl}/rest/api/${apiVersion}/issue/${issueKey}?fields=${fields}`;

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
    if (typeof field === "number") return String(field);
    if (!field || typeof field !== "object") return null;

    if (Array.isArray(field)) {
      const texts = field.map((v) => this.extractText(v)).filter(Boolean);
      return texts.length > 0 ? texts.join("\n") : null;
    }

    const node = field as Record<string, unknown>;

    // Leaf text node
    if (typeof node.text === "string") return node.text;

    // Recurse into ADF content arrays
    if (Array.isArray(node.content)) {
      const parts: string[] = [];
      for (const child of node.content) {
        const text = this.extractText(child);
        if (text) parts.push(text);
      }
      return parts.length > 0 ? parts.join(" ") : null;
    }

    return null;
  }
}
