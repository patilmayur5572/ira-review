import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FlatConfig } from "./env.js";

const CONFIG_FILENAMES = [".irarc.json", "ira.config.json"];

export function loadConfigFile(cwd: string = process.cwd()): Partial<FlatConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const filePath = resolve(cwd, filename);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return mapConfigToFlat(parsed);
      } catch {
        throw new Error(`Failed to parse config file: ${filePath}`);
      }
    }
  }

  return {};
}

function mapConfigToFlat(config: Record<string, unknown>): Partial<FlatConfig> {
  const flat: Partial<FlatConfig> = {};

  if (typeof config.sonarUrl === "string") flat.sonarUrl = config.sonarUrl;
  if (typeof config.sonarToken === "string") flat.sonarToken = config.sonarToken;
  if (typeof config.projectKey === "string") flat.projectKey = config.projectKey;
  if (typeof config.pr === "string") flat.pr = config.pr;
  if (typeof config.scmProvider === "string") flat.scmProvider = config.scmProvider;
  if (typeof config.bitbucketToken === "string") flat.bitbucketToken = config.bitbucketToken;
  if (typeof config.bitbucketUrl === "string") flat.bitbucketUrl = config.bitbucketUrl;
  if (typeof config.repo === "string") flat.repo = config.repo;
  if (typeof config.githubToken === "string") flat.githubToken = config.githubToken;
  if (typeof config.githubRepo === "string") flat.githubRepo = config.githubRepo;
  if (typeof config.githubUrl === "string") flat.githubUrl = config.githubUrl;
  if (typeof config.aiProvider === "string") flat.aiProvider = config.aiProvider;
  if (typeof config.aiModel === "string") flat.aiModel = config.aiModel;
  if (typeof config.aiApiKey === "string") flat.aiApiKey = config.aiApiKey;
  if (typeof config.dryRun === "boolean") flat.dryRun = config.dryRun;
  if (typeof config.minSeverity === "string") flat.minSeverity = config.minSeverity;
  if (typeof config.jiraUrl === "string") flat.jiraUrl = config.jiraUrl;
  if (typeof config.jiraEmail === "string") flat.jiraEmail = config.jiraEmail;
  if (typeof config.jiraToken === "string") flat.jiraToken = config.jiraToken;
  if (typeof config.jiraTicket === "string") flat.jiraTicket = config.jiraTicket;
  if (typeof config.jiraAcField === "string") flat.jiraAcField = config.jiraAcField;
  if (typeof config.slackWebhook === "string") flat.slackWebhook = config.slackWebhook;
  if (typeof config.teamsWebhook === "string") flat.teamsWebhook = config.teamsWebhook;

  return flat;
}
