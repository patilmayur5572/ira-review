export interface SonarConfig {
  baseUrl: string;
  token: string;
  projectKey: string;
}

export interface BitbucketConfig {
  baseUrl?: string;
  token: string;
  workspace: string;
  repoSlug: string;
}

export interface AIConfig {
  provider: "openai";
  apiKey: string;
  model?: string;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  acceptanceCriteriaField?: string;
}

export interface IraConfig {
  sonar: SonarConfig;
  scm: BitbucketConfig;
  ai: AIConfig;
  pullRequestId: string;
  dryRun?: boolean;
  jira?: JiraConfig;
  jiraTicket?: string;
  notifications?: NotificationConfig;
}

export interface NotificationConfig {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
}
