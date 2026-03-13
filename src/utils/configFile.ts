import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FlatConfig } from "./env.js";

const CONFIG_FILENAMES = [".irarc.json", "ira.config.json"];

export function loadConfigFile(explicitPath?: string, cwd: string = process.cwd()): Partial<FlatConfig> {
  if (explicitPath) {
    const filePath = resolve(cwd, explicitPath);
    if (!existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }
    return parseConfigFile(filePath);
  }

  for (const filename of CONFIG_FILENAMES) {
    const filePath = resolve(cwd, filename);
    if (existsSync(filePath)) {
      return parseConfigFile(filePath);
    }
  }

  return {};
}

function parseConfigFile(filePath: string): Partial<FlatConfig> {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return mapConfigToFlat(parsed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to parse config file: ${filePath} (${detail})`);
  }
}

const UNSAFE_FIELDS = [
  "sonarUrl", "sonarToken", "bitbucketToken", "bitbucketUrl",
  "githubToken", "githubUrl", "aiApiKey", "aiBaseUrl", "aiApiVersion",
  "jiraUrl", "jiraEmail", "jiraToken", "slackWebhook", "teamsWebhook",
];

function mapConfigToFlat(config: Record<string, unknown>): Partial<FlatConfig> {
  const unsafeFound = UNSAFE_FIELDS.filter((f) => f in config);
  if (unsafeFound.length > 0) {
    console.warn(
      `⚠️  Config file contains sensitive fields that are ignored for security: ${unsafeFound.join(", ")}. Use environment variables or CLI flags instead.`,
    );
  }

  const flat: Partial<FlatConfig> = {};

  if (typeof config.projectKey === "string") flat.projectKey = config.projectKey;
  if (typeof config.pr === "string") flat.pr = config.pr;
  if (typeof config.scmProvider === "string") flat.scmProvider = config.scmProvider;
  if (typeof config.repo === "string") flat.repo = config.repo;
  if (typeof config.githubRepo === "string") flat.githubRepo = config.githubRepo;
  if (typeof config.aiProvider === "string") flat.aiProvider = config.aiProvider;
  if (typeof config.aiModel === "string") flat.aiModel = config.aiModel;
  if (typeof config.aiModelCritical === "string") flat.aiModelCritical = config.aiModelCritical;
  if (typeof config.dryRun === "boolean") flat.dryRun = config.dryRun;
  if (typeof config.minSeverity === "string") flat.minSeverity = config.minSeverity;
  if (typeof config.jiraTicket === "string") flat.jiraTicket = config.jiraTicket;
  if (typeof config.jiraAcField === "string") flat.jiraAcField = config.jiraAcField;
  if (typeof config.aiDeploymentName === "string") flat.aiDeploymentName = config.aiDeploymentName;

  return flat;
}
