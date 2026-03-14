/**
 * IRA — Intelligent Review Assistant
 * Copyright (c) 2024-present Mayur Patil (patilmayur5572@gmail.com)
 * Licensed under AGPL-3.0. See LICENSE file for details.
 * Commercial license available — contact patilmayur5572@gmail.com
 */

import { Command } from "commander";
import { ReviewEngine } from "./core/reviewEngine.js";
import { resolveConfigFromEnv } from "./utils/env.js";
import { loadConfigFile } from "./utils/configFile.js";

const LICENSE_BANNER = `
  ⚖️  IRA is licensed under AGPL-3.0.
  📧 Commercial license: patilmayur5572@gmail.com
  📖 https://github.com/patilmayur5572/ira-review
`;

const program = new Command();

program
  .name("ira-review")
  .description("AI-powered PR review tool with SonarQube + GitHub/Bitbucket integration")
  .version("0.5.0")
  .hook("preAction", () => {
    console.log(LICENSE_BANNER);
  });

program
  .command("review")
  .description("Run AI-powered review on a pull request")
  .option("--sonar-url <url>", "SonarQube/SonarCloud base URL (or IRA_SONAR_URL)")
  .option("--sonar-token <token>", "SonarQube API token (or IRA_SONAR_TOKEN)")
  .option("--project-key <key>", "Sonar project key (or IRA_PROJECT_KEY)")
  .option("--pr <id>", "Pull request ID (or IRA_PR)")
  .option("--scm-provider <provider>", "SCM provider: bitbucket or github (or IRA_SCM_PROVIDER)")
  .option("--bitbucket-token <token>", "Bitbucket API token (or IRA_BITBUCKET_TOKEN)")
  .option("--repo <repo>", "Bitbucket workspace/repo-slug (or IRA_REPO)")
  .option("--bitbucket-url <url>", "Bitbucket base URL (or IRA_BITBUCKET_URL)")
  .option("--github-token <token>", "GitHub API token (or IRA_GITHUB_TOKEN)")
  .option("--github-repo <repo>", "GitHub owner/repo (or IRA_GITHUB_REPO)")
  .option("--github-url <url>", "GitHub Enterprise URL (or IRA_GITHUB_URL)")
  .option("--ai-provider <provider>", "AI provider")
  .option("--ai-model <model>", "AI model to use")
  .option("--dry-run", "Print comments to stdout instead of posting to SCM")
  .option("--min-severity <level>", "Minimum severity to review (BLOCKER|CRITICAL|MAJOR|MINOR|INFO)")
  .option("--jira-url <url>", "JIRA base URL (or IRA_JIRA_URL)")
  .option("--jira-email <email>", "JIRA email (or IRA_JIRA_EMAIL)")
  .option("--jira-token <token>", "JIRA API token (or IRA_JIRA_TOKEN)")
  .option("--jira-ticket <key>", "JIRA ticket key (e.g. PROJ-123)")
  .option("--jira-ac-field <field>", "Custom field ID for acceptance criteria")
  .option("--slack-webhook <url>", "Slack webhook URL for notifications")
  .option("--teams-webhook <url>", "Teams webhook URL for notifications")
  .option("--ai-base-url <url>", "AI provider base URL (Azure endpoint, Ollama URL)")
  .option("--ai-api-version <version>", "Azure OpenAI API version")
  .option("--ai-deployment <name>", "Azure OpenAI deployment name")
  .option("--ai-model-critical <model>", "Stronger AI model for BLOCKER/CRITICAL issues")
  .option("--config <path>", "Path to config file (default: auto-detect .irarc.json / ira.config.json)")
  .option("--no-config-file", "Disable auto-loading config file from repo")
  .action(async (opts) => {
    try {
      // Load config file only if explicitly provided or not disabled
      const fileConfig = opts.configFile === false
        ? {}
        : loadConfigFile(opts.config);

      const config = resolveConfigFromEnv({
        ...fileConfig,
        ...(opts.sonarUrl && { sonarUrl: opts.sonarUrl }),
        ...(opts.sonarToken && { sonarToken: opts.sonarToken }),
        ...(opts.projectKey && { projectKey: opts.projectKey }),
        ...(opts.pr && { pr: opts.pr }),
        ...(opts.scmProvider && { scmProvider: opts.scmProvider }),
        ...(opts.bitbucketToken && { bitbucketToken: opts.bitbucketToken }),
        ...(opts.repo && { repo: opts.repo }),
        ...(opts.bitbucketUrl && { bitbucketUrl: opts.bitbucketUrl }),
        ...(opts.githubToken && { githubToken: opts.githubToken }),
        ...(opts.githubRepo && { githubRepo: opts.githubRepo }),
        ...(opts.githubUrl && { githubUrl: opts.githubUrl }),
        ...(opts.aiProvider && { aiProvider: opts.aiProvider }),
        ...(opts.aiModel && { aiModel: opts.aiModel }),
        ...(opts.dryRun && { dryRun: opts.dryRun }),
        ...(opts.minSeverity && { minSeverity: opts.minSeverity }),
        ...(opts.jiraUrl && { jiraUrl: opts.jiraUrl }),
        ...(opts.jiraEmail && { jiraEmail: opts.jiraEmail }),
        ...(opts.jiraToken && { jiraToken: opts.jiraToken }),
        ...(opts.jiraTicket && { jiraTicket: opts.jiraTicket }),
        ...(opts.jiraAcField && { jiraAcField: opts.jiraAcField }),
        ...(opts.slackWebhook && { slackWebhook: opts.slackWebhook }),
        ...(opts.teamsWebhook && { teamsWebhook: opts.teamsWebhook }),
        ...(opts.aiBaseUrl && { aiBaseUrl: opts.aiBaseUrl }),
        ...(opts.aiApiVersion && { aiApiVersion: opts.aiApiVersion }),
        ...(opts.aiDeployment && { aiDeploymentName: opts.aiDeployment }),
        ...(opts.aiModelCritical && { aiModelCritical: opts.aiModelCritical }),
      });

      console.log(`\n🔍 IRA — AI-Powered PR Review\n`);
      const mode = config.sonar ? "Sonar + AI" : "AI-only";
      console.log(`  Mode:     ${mode}`);
      console.log(`  Sonar:    ${config.sonar ? config.sonar.projectKey : "not configured"}`);
      console.log(`  SCM:      ${config.scmProvider}`);
      console.log(`  PR:       #${config.pullRequestId}`);
      console.log(`  Provider: ${config.ai.provider}`);
      console.log(`  Dry run:  ${config.dryRun ? "yes" : "no"}\n`);

      const engine = new ReviewEngine(config);
      const result = await engine.run();

      console.log(`✅ Review complete!`);
      console.log(`   Total issues found:    ${result.totalIssues}`);
      console.log(`   Issues reviewed (AI):  ${result.reviewedIssues}`);
      console.log(`   Framework detected:    ${result.framework ?? "none"}`);
      console.log(`   Comments posted:       ${result.commentsPosted}`);
      if (result.risk) {
        console.log(`   PR Risk:               ${result.risk.level} (${result.risk.score}/${result.risk.maxScore})`);
      }
      if (result.acceptanceValidation) {
        console.log(`   JIRA AC Validation:    ${result.acceptanceValidation.overallPass ? "PASS" : "FAIL"}`);
      }
      if (result.warnings && result.warnings.length > 0) {
        console.log(`\n⚠️  Warnings:`);
        for (const w of result.warnings) {
          console.log(`   - ${w}`);
        }
      }
      console.log();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`\n❌ Review failed: ${message}\n`);
      process.exit(1);
    }
  });

program.parse();
