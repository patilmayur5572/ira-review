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

export type TestFramework = "jest" | "vitest" | "mocha" | "playwright" | "cypress" | "gherkin" | "pytest" | "junit";

export interface GeneratedTestCase {
  description: string;
  type: "happy-path" | "negative" | "boundary-value" | "authorization" | "integration" | "state-workflow" | "data-integrity" | "error-recovery" | "not-testable";
  criterion: string;
  code: string;
}

export interface TestGenerationResult {
  jiraKey: string;
  summary: string;
  testFramework: TestFramework;
  testCases: GeneratedTestCase[];
  totalCases: number;
  edgeCases: number;
  parseWarning?: string;
}

export interface RequirementStatus {
  description: string;
  met: boolean;
  evidence: string;
  coverage: "full" | "partial" | "missing";
}

export interface RequirementCompletionResult {
  jiraKey: string;
  summary: string;
  completionPercentage: number;
  totalCriteria: number;
  metCriteria: number;
  requirements: RequirementStatus[];
  edgeCases: string[];
  overallPass: boolean;
  parseWarning?: string;
}

export interface GeneratedAC {
  id: string;
  given: string;
  when: string;
  then: string;
}

export interface ACGenerationResult {
  jiraKey: string;
  summary: string;
  criteria: GeneratedAC[];
  totalCriteria: number;
  sources: string[];
  reviewHints: string[];
  parseWarning?: string;
}
