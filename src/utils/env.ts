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
