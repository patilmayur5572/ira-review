import type { TestFramework } from "./jira.js";

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

export type AIProviderType = "openai" | "azure-openai" | "anthropic" | "ollama";

export interface AIConfig {
  provider: AIProviderType;
  apiKey: string;
  model?: string;
  criticalModel?: string;
  baseUrl?: string;
  apiVersion?: string;
  deploymentName?: string;
}

export type JiraType = "cloud" | "server";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  type?: JiraType;
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
  generateTests?: boolean;
  testFramework?: TestFramework;
  jiraAcSource?: "customField" | "description" | "both";
}

export type RiskLevelThreshold = "low" | "medium" | "high" | "critical";

export interface NotificationConfig {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  minRiskLevel?: RiskLevelThreshold;
  notifyOnAcFail?: boolean;
}
