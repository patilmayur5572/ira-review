import type { TestFramework } from "./jira.js";

export interface SonarConfig {
  baseUrl: string;
  token: string;
  projectKey: string;
}

/** "cloud" = api.bitbucket.org/2.0, "server" = self-hosted Bitbucket Server / Data Center (/rest/api/1.0). */
export type BitbucketType = "cloud" | "server";

export interface BitbucketConfig {
  baseUrl?: string;
  token: string;
  /** Bitbucket Cloud workspace OR Bitbucket Server project key (server uses uppercase keys). */
  workspace: string;
  repoSlug: string;
  /** Defaults to "cloud" when baseUrl is api.bitbucket.org or unset, otherwise "server". */
  type?: BitbucketType;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  baseUrl?: string;
}

export type AIProviderType = "openai" | "azure-openai" | "anthropic" | "ollama" | "amp" | "copilot-cli";

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

/** Comment formatter style — "compact" (default) or legacy "detailed". */
export type CommentStyle = "compact" | "detailed";

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
  /**
   * When IRA reviews a JIRA ticket that has no acceptance criteria, it generates
   * suggested ACs from the PR diff and (by default) posts them as a comment on
   * the JIRA ticket. Set to `false` to keep the suggestions in the PR summary
   * only, without writing back to JIRA. Defaults to `true` for backwards
   * compatibility. CLI: `--no-post-acs-to-jira`. Env: `IRA_POST_ACS_TO_JIRA=false`.
   */
  postAcsToJira?: boolean;
  /** Comment formatter style — defaults to "compact". */
  commentStyle?: CommentStyle;
  /** Optional URL to fetch .ira-rules.json from (HTTP) — useful when no local checkout exists. */
  rulesUrl?: string;
}

export type RiskLevelThreshold = "low" | "medium" | "high" | "critical";

export interface NotificationConfig {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  minRiskLevel?: RiskLevelThreshold;
  notifyOnAcFail?: boolean;
}
