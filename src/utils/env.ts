import type { IraConfig } from "../types/config.js";

export function resolveConfigFromEnv(
  overrides: Partial<FlatConfig> = {},
): IraConfig {
  const dryRun = overrides.dryRun ?? false;

  const sonarUrl = overrides.sonarUrl ?? env("IRA_SONAR_URL");
  const sonarToken = overrides.sonarToken ?? env("IRA_SONAR_TOKEN");
  const projectKey = overrides.projectKey ?? env("IRA_PROJECT_KEY");
  const pr = overrides.pr ?? env("IRA_PR");
  const aiKey = overrides.aiApiKey ?? env("OPENAI_API_KEY");

  // SCM config is optional in dry-run mode
  const bbToken = overrides.bitbucketToken ?? optionalEnv("IRA_BITBUCKET_TOKEN");
  const repo = overrides.repo ?? optionalEnv("IRA_REPO");

  if (!dryRun && (!bbToken || !repo)) {
    throw new Error(
      "Bitbucket token and repo are required (or use --dry-run to skip posting)",
    );
  }

  // JIRA and notifications config is fully optional
  const jiraConfig = resolveJiraConfig(overrides);
  const notificationsConfig = resolveNotificationsConfig(overrides);

  const [workspace = "", repoSlug = ""] = (repo ?? "").split("/");
  if (!dryRun && (!workspace || !repoSlug)) {
    throw new Error("repo must be in workspace/repo-slug format");
  }

  return {
    sonar: {
      baseUrl: sonarUrl,
      token: sonarToken,
      projectKey,
    },
    scm: {
      token: bbToken ?? "",
      workspace,
      repoSlug,
      ...(overrides.bitbucketUrl && { baseUrl: overrides.bitbucketUrl }),
    },
    ai: {
      provider: (overrides.aiProvider as "openai") ?? "openai",
      apiKey: aiKey,
      model: overrides.aiModel,
    },
    pullRequestId: pr,
    dryRun,
    ...(overrides.minSeverity && { minSeverity: overrides.minSeverity as IraConfig["minSeverity"] }),
    ...(jiraConfig && { jira: jiraConfig }),
    ...(overrides.jiraTicket && { jiraTicket: overrides.jiraTicket }),
    ...(notificationsConfig && { notifications: notificationsConfig }),
  };
}

function resolveNotificationsConfig(
  overrides: Partial<FlatConfig>,
): IraConfig["notifications"] | undefined {
  const slackUrl = overrides.slackWebhook ?? optionalEnv("IRA_SLACK_WEBHOOK");
  const teamsUrl = overrides.teamsWebhook ?? optionalEnv("IRA_TEAMS_WEBHOOK");

  if (!slackUrl && !teamsUrl) return undefined;

  return {
    ...(slackUrl && { slackWebhookUrl: slackUrl }),
    ...(teamsUrl && { teamsWebhookUrl: teamsUrl }),
  };
}

function resolveJiraConfig(
  overrides: Partial<FlatConfig>,
): IraConfig["jira"] | undefined {
  const baseUrl = overrides.jiraUrl ?? optionalEnv("IRA_JIRA_URL");
  const email = overrides.jiraEmail ?? optionalEnv("IRA_JIRA_EMAIL");
  const token = overrides.jiraToken ?? optionalEnv("IRA_JIRA_TOKEN");

  if (!baseUrl || !email || !token) return undefined;

  return {
    baseUrl,
    email,
    token,
    ...(overrides.jiraAcField && {
      acceptanceCriteriaField: overrides.jiraAcField,
    }),
  };
}

export interface FlatConfig {
  sonarUrl: string;
  sonarToken: string;
  projectKey: string;
  pr: string;
  bitbucketToken: string;
  bitbucketUrl?: string;
  repo: string;
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  dryRun?: boolean;
  minSeverity?: string;
  jiraUrl?: string;
  jiraEmail?: string;
  jiraToken?: string;
  jiraTicket?: string;
  jiraAcField?: string;
  slackWebhook?: string;
  teamsWebhook?: string;
}

function env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}
