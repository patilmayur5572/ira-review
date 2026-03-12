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

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  baseUrl?: string;
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

export type SCMProviderType = "bitbucket" | "github";

export interface IraConfig {
  sonar?: SonarConfig;
  scmProvider: SCMProviderType;
  scm: BitbucketConfig | GitHubConfig;
  ai: AIConfig;
  pullRequestId: string;
  dryRun?: boolean;
  repoPath?: string;
  minSeverity?: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
  jira?: JiraConfig;
  jiraTicket?: string;
  notifications?: NotificationConfig;
}

export interface NotificationConfig {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
}
