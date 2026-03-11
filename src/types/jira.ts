export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: string | null;
    acceptanceCriteria?: string | null;
    status: { name: string };
    issuetype: { name: string };
    labels: string[];
    customFields?: Record<string, unknown>;
  };
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

export interface AcceptanceCriterion {
  description: string;
  met: boolean;
  evidence: string;
}

export interface AcceptanceValidationResult {
  jiraKey: string;
  summary: string;
  criteria: AcceptanceCriterion[];
  overallPass: boolean;
}
