import type { IraConfig, SCMProviderType, AIProviderType } from "../types/config.js";
import { execSync } from "node:child_process";

const VALID_SCM_PROVIDERS: SCMProviderType[] = ["bitbucket", "github"];

function detectScm(): string {
  try {
    const remote = execSync("git config --get remote.origin.url", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (/github\.com/i.test(remote)) return "github";
    if (/bitbucket\.org/i.test(remote)) return "bitbucket";
  } catch { /* not in a git repo */ }
  throw new Error(
    "Could not detect SCM provider from git remote.\n" +
    "  💡 Set --scm-provider (github or bitbucket), IRA_SCM_PROVIDER env var, or add scmProvider to .irarc.json",
  );
}
const VALID_AI_PROVIDERS: AIProviderType[] = ["openai", "azure-openai", "anthropic", "ollama", "amp", "copilot-cli"];
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
  // CLI-based providers (amp, copilot-cli) and local providers (ollama) get their auth
  // from their own mechanism (e.g. GITHUB_TOKEN env for copilot, `amp login` session for amp,
  // none for ollama) — not from --ai-api-key. Don't require one for those.
  const cliBasedProvider = aiProvider === "ollama" || aiProvider === "amp" || aiProvider === "copilot-cli";
  const aiKey = overrides.aiApiKey
    ?? optionalEnv("IRA_AI_API_KEY")
    ?? optionalEnv("OPENAI_API_KEY")
    ?? (cliBasedProvider ? "" : undefined);
  if (aiKey === undefined) {
    throw new Error("Missing AI API key. Set IRA_AI_API_KEY or OPENAI_API_KEY environment variable.");
  }

  // Sonar config is now optional
  const sonarConfig = resolveSonarConfig(overrides);

  // SCM provider: auto-detect from git remote, or require explicit config
  const scmProvider = (overrides.scmProvider ?? optionalEnv("IRA_SCM_PROVIDER") ?? detectScm()) as string;
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

  const jiraAcSource = overrides.jiraAcSource ?? optionalEnv("IRA_JIRA_AC_SOURCE");
  const jiraTicket = overrides.jiraTicket ?? optionalEnv("IRA_JIRA_TICKET");

  // postAcsToJira: explicit `false` from CLI (`--no-post-acs-to-jira`) wins,
  // then env (IRA_POST_ACS_TO_JIRA=false|0|no|off), otherwise undefined and
  // the engine treats undefined as "post enabled" (the historical default).
  const postAcsToJiraEnv = optionalEnv("IRA_POST_ACS_TO_JIRA");
  const postAcsToJira: boolean | undefined =
    overrides.postAcsToJira === false
      ? false
      : postAcsToJiraEnv && /^(false|0|no|off)$/i.test(postAcsToJiraEnv)
        ? false
        : undefined;

  const commentStyleRaw = overrides.commentStyle ?? optionalEnv("IRA_COMMENT_STYLE");
  if (commentStyleRaw && commentStyleRaw !== "compact" && commentStyleRaw !== "detailed") {
    throw new Error(`Invalid comment-style: "${commentStyleRaw}". Must be "compact" or "detailed".`);
  }
  const commentStyle = (commentStyleRaw as "compact" | "detailed" | undefined);
  const rulesUrl = overrides.rulesUrl ?? optionalEnv("IRA_RULES_URL");

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
    ...(overrides.generateTests && { generateTests: overrides.generateTests }),
    ...(overrides.testFramework && { testFramework: overrides.testFramework as IraConfig["testFramework"] }),
    ...(jiraAcSource && { jiraAcSource: jiraAcSource as IraConfig["jiraAcSource"] }),
    ...(postAcsToJira === false && { postAcsToJira: false }),
    ...(commentStyle && { commentStyle }),
    ...(rulesUrl && { rulesUrl }),
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

/**
 * Auto-detect Bitbucket type from URL. api.bitbucket.org → cloud; anything else → server.
 * Used as the default when --bitbucket-type / IRA_BITBUCKET_TYPE is not set.
 */
function detectBitbucketType(baseUrl: string | undefined): "cloud" | "server" {
  if (!baseUrl) return "cloud";
  return /api\.bitbucket\.org/i.test(baseUrl) ? "cloud" : "server";
}

function resolveBitbucketScmConfig(
  overrides: Partial<FlatConfig>,
  dryRun: boolean,
) {
  const bbToken = overrides.bitbucketToken ?? optionalEnv("IRA_BITBUCKET_TOKEN");
  const repo = overrides.repo ?? optionalEnv("IRA_REPO");
  const bitbucketUrl = overrides.bitbucketUrl ?? optionalEnv("IRA_BITBUCKET_URL");
  const explicitType = overrides.bitbucketType ?? optionalEnv("IRA_BITBUCKET_TYPE");
  if (explicitType && explicitType !== "cloud" && explicitType !== "server") {
    throw new Error(`Invalid bitbucket-type: "${explicitType}". Must be "cloud" or "server".`);
  }
  const bitbucketType = (explicitType as "cloud" | "server" | undefined) ?? detectBitbucketType(bitbucketUrl);

  if (!dryRun && (!bbToken || !repo)) {
    throw new Error(
      "Bitbucket token and repo are required (or use --dry-run to skip posting)",
    );
  }

  // Cloud uses workspace/repo-slug; Server uses PROJECT/repo-slug. Same flag, same parsing.
  const [workspace = "", repoSlug = ""] = (repo ?? "").split("/");
  if (!dryRun && (!workspace || !repoSlug)) {
    const expectedFmt = bitbucketType === "server" ? "PROJECT/repo-slug" : "workspace/repo-slug";
    throw new Error(`repo must be in ${expectedFmt} format`);
  }

  if (!dryRun && bitbucketType === "server" && !bitbucketUrl) {
    throw new Error(
      "Bitbucket Server requires --bitbucket-url (or IRA_BITBUCKET_URL) — e.g. https://bitbucket.example.com",
    );
  }

  return {
    token: bbToken ?? "",
    workspace,
    repoSlug,
    type: bitbucketType,
    ...(bitbucketUrl && { baseUrl: bitbucketUrl }),
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

const VALID_RISK_THRESHOLDS = ["low", "medium", "high", "critical"] as const;

function resolveNotificationsConfig(
  overrides: Partial<FlatConfig>,
): IraConfig["notifications"] | undefined {
  const slackUrl = overrides.slackWebhook ?? optionalEnv("IRA_SLACK_WEBHOOK");
  const teamsUrl = overrides.teamsWebhook ?? optionalEnv("IRA_TEAMS_WEBHOOK");

  if (!slackUrl && !teamsUrl) return undefined;

  const minRisk = overrides.notifyMinRisk ?? optionalEnv("IRA_NOTIFY_MIN_RISK");
  if (minRisk && !VALID_RISK_THRESHOLDS.includes(minRisk as typeof VALID_RISK_THRESHOLDS[number])) {
    throw new Error(`Invalid notify-min-risk: "${minRisk}". Must be one of: ${VALID_RISK_THRESHOLDS.join(", ")}`);
  }

  const notifyOnAcFail = overrides.notifyOnAcFail ?? optionalEnv("IRA_NOTIFY_ON_AC_FAIL") === "true";

  return {
    ...(slackUrl && { slackWebhookUrl: slackUrl }),
    ...(teamsUrl && { teamsWebhookUrl: teamsUrl }),
    ...(minRisk && { minRiskLevel: minRisk as IraConfig["notifications"] extends { minRiskLevel?: infer T } ? T : never }),
    ...(notifyOnAcFail && { notifyOnAcFail }),
  };
}

function resolveJiraConfig(
  overrides: Partial<FlatConfig>,
): IraConfig["jira"] | undefined {
  const baseUrl = overrides.jiraUrl ?? optionalEnv("IRA_JIRA_URL");
  const email = overrides.jiraEmail ?? optionalEnv("IRA_JIRA_EMAIL");
  const token = overrides.jiraToken ?? optionalEnv("IRA_JIRA_TOKEN");

  if (!baseUrl || !token) return undefined;

  return {
    baseUrl,
    email: email ?? '',
    token,
    ...(overrides.jiraType && { type: overrides.jiraType as 'cloud' | 'server' }),
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
  bitbucketType?: string;
  repo?: string;
  rulesUrl?: string;
  commentStyle?: string;
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
  jiraType?: string;
  jiraAcField?: string;
  slackWebhook?: string;
  teamsWebhook?: string;
  notifyMinRisk?: string;
  notifyOnAcFail?: boolean;
  generateTests?: boolean;
  testFramework?: string;
  jiraAcSource?: string;
  postAcsToJira?: boolean;
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
