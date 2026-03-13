import type { IraConfig, SCMProviderType, AIProviderType } from "../types/config.js";

const VALID_SCM_PROVIDERS: SCMProviderType[] = ["bitbucket", "github"];
const VALID_AI_PROVIDERS: AIProviderType[] = ["openai", "azure-openai", "anthropic", "ollama"];
const VALID_SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as const;

export function resolveConfigFromEnv(
  overrides: Partial<FlatConfig> = {},
): IraConfig {
  const dryRun = overrides.dryRun ?? false;

  const pr = overrides.pr ?? env("IRA_PR");
  const aiProvider = (overrides.aiProvider ?? optionalEnv("IRA_AI_PROVIDER") ?? "openai") as string;
  if (!VALID_AI_PROVIDERS.includes(aiProvider as AIProviderType)) {
    throw new Error(`Invalid AI provider: "${aiProvider}". Must be one of: ${VALID_AI_PROVIDERS.join(", ")}`);
  }
  const aiKey = overrides.aiApiKey
    ?? optionalEnv("IRA_AI_API_KEY")
    ?? optionalEnv("OPENAI_API_KEY")
    ?? (aiProvider === "ollama" ? "" : undefined);
  if (aiKey === undefined) {
    throw new Error("Missing AI API key. Set IRA_AI_API_KEY or OPENAI_API_KEY environment variable.");
  }

  // Sonar config is now optional
  const sonarConfig = resolveSonarConfig(overrides);

  // SCM provider: "bitbucket" (default) or "github"
  const scmProvider = (overrides.scmProvider ?? optionalEnv("IRA_SCM_PROVIDER") ?? "bitbucket") as string;
  if (!VALID_SCM_PROVIDERS.includes(scmProvider as SCMProviderType)) {
    throw new Error(`Invalid SCM provider: "${scmProvider}". Must be one of: ${VALID_SCM_PROVIDERS.join(", ")}`);
  }

  // Resolve SCM config based on provider
  const scm = scmProvider === "github"
    ? resolveGitHubScmConfig(overrides, dryRun)
    : resolveBitbucketScmConfig(overrides, dryRun);

  // JIRA and notifications config is fully optional
  const jiraConfig = resolveJiraConfig(overrides);
  const notificationsConfig = resolveNotificationsConfig(overrides);

  const aiBaseUrl = overrides.aiBaseUrl ?? optionalEnv("IRA_AI_BASE_URL");
  const aiApiVersion = overrides.aiApiVersion ?? optionalEnv("IRA_AI_API_VERSION");
  const aiDeploymentName = overrides.aiDeploymentName ?? optionalEnv("IRA_AI_DEPLOYMENT_NAME");

  const minSeverity = overrides.minSeverity ?? optionalEnv("IRA_MIN_SEVERITY");
  if (minSeverity && !VALID_SEVERITIES.includes(minSeverity as typeof VALID_SEVERITIES[number])) {
    throw new Error(`Invalid min-severity: "${minSeverity}". Must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }

  const jiraTicket = overrides.jiraTicket ?? optionalEnv("IRA_JIRA_TICKET");
  if (jiraTicket && !jiraConfig) {
    console.warn(
      "⚠️  --jira-ticket is set but JIRA credentials are incomplete (need jira-url, jira-email, jira-token). JIRA validation will be skipped.",
    );
  }

  return {
    ...(sonarConfig && { sonar: sonarConfig }),
    scmProvider: scmProvider as SCMProviderType,
    scm,
    ai: {
      provider: aiProvider as AIProviderType,
      apiKey: aiKey,
      model: overrides.aiModel,
      ...(overrides.aiModelCritical && { criticalModel: overrides.aiModelCritical }),
      ...(aiBaseUrl && { baseUrl: aiBaseUrl }),
      ...(aiApiVersion && { apiVersion: aiApiVersion }),
      ...(aiDeploymentName && { deploymentName: aiDeploymentName }),
    },
    pullRequestId: pr,
    dryRun,
    ...(minSeverity && { minSeverity: minSeverity as IraConfig["minSeverity"] }),
    ...(jiraConfig && { jira: jiraConfig }),
    ...(jiraTicket && { jiraTicket }),
    ...(notificationsConfig && { notifications: notificationsConfig }),
  };
}

function resolveSonarConfig(
  overrides: Partial<FlatConfig>,
): IraConfig["sonar"] | undefined {
  const baseUrl = overrides.sonarUrl ?? optionalEnv("IRA_SONAR_URL");

  if (!baseUrl) return undefined;

  const token = overrides.sonarToken ?? optionalEnv("IRA_SONAR_TOKEN");
  const projectKey = overrides.projectKey ?? optionalEnv("IRA_PROJECT_KEY");

  if (!token || !projectKey) {
    throw new Error("When sonar-url is provided, sonar-token and project-key are also required");
  }

  return { baseUrl, token, projectKey };
}

function resolveBitbucketScmConfig(
  overrides: Partial<FlatConfig>,
  dryRun: boolean,
) {
  const bbToken = overrides.bitbucketToken ?? optionalEnv("IRA_BITBUCKET_TOKEN");
  const repo = overrides.repo ?? optionalEnv("IRA_REPO");

  if (!dryRun && (!bbToken || !repo)) {
    throw new Error(
      "Bitbucket token and repo are required (or use --dry-run to skip posting)",
    );
  }

  const [workspace = "", repoSlug = ""] = (repo ?? "").split("/");
  if (!dryRun && (!workspace || !repoSlug)) {
    throw new Error("repo must be in workspace/repo-slug format");
  }

  return {
    token: bbToken ?? "",
    workspace,
    repoSlug,
    ...(() => {
      const bitbucketUrl = overrides.bitbucketUrl ?? optionalEnv("IRA_BITBUCKET_URL");
      return bitbucketUrl ? { baseUrl: bitbucketUrl } : {};
    })(),
  };
}

function resolveGitHubScmConfig(
  overrides: Partial<FlatConfig>,
  dryRun: boolean,
) {
  const ghToken = overrides.githubToken ?? optionalEnv("IRA_GITHUB_TOKEN");
  const ghRepo = overrides.githubRepo ?? optionalEnv("IRA_GITHUB_REPO");

  if (!dryRun && (!ghToken || !ghRepo)) {
    throw new Error(
      "GitHub token and github-repo are required (or use --dry-run to skip posting)",
    );
  }

  const [owner = "", repo = ""] = (ghRepo ?? "").split("/");
  if (!dryRun && (!owner || !repo)) {
    throw new Error("github-repo must be in owner/repo format");
  }

  return {
    token: ghToken ?? "",
    owner,
    repo,
    ...(() => {
      const githubUrl = overrides.githubUrl ?? optionalEnv("IRA_GITHUB_URL");
      return githubUrl ? { baseUrl: githubUrl } : {};
    })(),
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
  sonarUrl?: string;
  sonarToken?: string;
  projectKey?: string;
  pr: string;
  scmProvider?: string;
  bitbucketToken?: string;
  bitbucketUrl?: string;
  repo?: string;
  githubToken?: string;
  githubRepo?: string;
  githubUrl?: string;
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiModelCritical?: string;
  aiBaseUrl?: string;
  aiApiVersion?: string;
  aiDeploymentName?: string;
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
