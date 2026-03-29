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
import { JiraClient } from "./integrations/jiraClient.js";
import { createAIProvider } from "./ai/aiClient.js";
import { generateTestCases } from "./core/testGenerator.js";
import { trackRequirementCompletion } from "./core/requirementTracker.js";
import { detectFramework } from "./frameworks/detector.js";
import type { TestFramework } from "./types/jira.js";

const LICENSE_BANNER = `
  ⚖️  IRA is licensed under AGPL-3.0.
  📧 Commercial license: patilmayur5572@gmail.com
  📖 https://github.com/patilmayur5572/ira-review
`;

const program = new Command();

program
  .name("ira-review")
  .description("AI-powered PR review tool with SonarQube + GitHub/Bitbucket integration")
  .version("0.7.0")
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
  .option("--notify-min-risk <level>", "Only notify when risk is at or above this level: low, medium, high, critical")
  .option("--notify-on-ac-fail", "Send notification when JIRA acceptance criteria validation fails")
  .option("--ai-base-url <url>", "AI provider base URL (Azure endpoint, Ollama URL)")
  .option("--ai-api-key <key>", "AI API key (or IRA_AI_API_KEY / OPENAI_API_KEY)")
  .option("--ai-api-version <version>", "Azure OpenAI API version")
  .option("--ai-deployment <name>", "Azure OpenAI deployment name")
  .option("--ai-model-critical <model>", "Stronger AI model for BLOCKER/CRITICAL issues")
  .option("--generate-tests", "Generate test cases from JIRA acceptance criteria")
  .option("--test-framework <framework>", "Test framework: jest, vitest, mocha, playwright, cypress, gherkin, pytest, junit (default: jest)")
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
        ...(opts.aiApiKey && { aiApiKey: opts.aiApiKey }),
        ...(opts.dryRun && { dryRun: opts.dryRun }),
        ...(opts.minSeverity && { minSeverity: opts.minSeverity }),
        ...(opts.jiraUrl && { jiraUrl: opts.jiraUrl }),
        ...(opts.jiraEmail && { jiraEmail: opts.jiraEmail }),
        ...(opts.jiraToken && { jiraToken: opts.jiraToken }),
        ...(opts.jiraTicket && { jiraTicket: opts.jiraTicket }),
        ...(opts.jiraAcField && { jiraAcField: opts.jiraAcField }),
        ...(opts.slackWebhook && { slackWebhook: opts.slackWebhook }),
        ...(opts.teamsWebhook && { teamsWebhook: opts.teamsWebhook }),
        ...(opts.notifyMinRisk && { notifyMinRisk: opts.notifyMinRisk }),
        ...(opts.notifyOnAcFail && { notifyOnAcFail: opts.notifyOnAcFail }),
        ...(opts.aiBaseUrl && { aiBaseUrl: opts.aiBaseUrl }),
        ...(opts.aiApiVersion && { aiApiVersion: opts.aiApiVersion }),
        ...(opts.aiDeployment && { aiDeploymentName: opts.aiDeployment }),
        ...(opts.aiModelCritical && { aiModelCritical: opts.aiModelCritical }),
        ...(opts.generateTests && { generateTests: opts.generateTests }),
        ...(opts.testFramework && { testFramework: opts.testFramework }),
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
      if (result.requirementCompletion) {
        const rc = result.requirementCompletion;
        console.log(`   Requirements:          ${rc.completionPercentage}% (${rc.metCriteria}/${rc.totalCriteria} AC met)`);
        if (rc.edgeCases.length > 0) {
          console.log(`   Edge cases found:      ${rc.edgeCases.length}`);
        }
      } else if (result.acceptanceValidation) {
        console.log(`   JIRA AC Validation:    ${result.acceptanceValidation.overallPass ? "PASS" : "FAIL"}`);
      }
      if (result.testGeneration) {
        console.log(`   Tests generated:       ${result.testGeneration.totalCases} (${result.testGeneration.edgeCases} edge cases)`);
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

program
  .command("generate-tests")
  .description("Generate test cases from JIRA acceptance criteria")
  .requiredOption("--jira-ticket <key>", "JIRA ticket key (e.g. PROJ-123)")
  .option("--jira-url <url>", "JIRA base URL (or IRA_JIRA_URL)")
  .option("--jira-email <email>", "JIRA email (or IRA_JIRA_EMAIL)")
  .option("--jira-token <token>", "JIRA API token (or IRA_JIRA_TOKEN)")
  .option("--jira-ac-field <field>", "Custom field ID for acceptance criteria")
  .option("--test-framework <framework>", "Test framework: jest, vitest, mocha, playwright, cypress, gherkin, pytest, junit (default: jest)")
  .option("--ai-provider <provider>", "AI provider")
  .option("--ai-model <model>", "AI model to use")
  .option("--ai-base-url <url>", "AI provider base URL")
  .option("--ai-api-version <version>", "Azure OpenAI API version")
  .option("--ai-api-key <key>", "AI API key (or IRA_AI_API_KEY / OPENAI_API_KEY)")
  .option("--ai-deployment <name>", "Azure OpenAI deployment name")
  .option("--pr <id>", "Pull request ID (optional — adds code context for better precision)")
  .option("--scm-provider <provider>", "SCM provider: bitbucket or github")
  .option("--github-token <token>", "GitHub API token")
  .option("--github-repo <repo>", "GitHub owner/repo")
  .option("--bitbucket-token <token>", "Bitbucket API token")
  .option("--repo <repo>", "Bitbucket workspace/repo-slug")
  .option("--output <path>", "Write generated tests to a file")
  .action(async (opts) => {
    try {
      // Resolve AI config
      const aiProvider = (opts.aiProvider ?? process.env.IRA_AI_PROVIDER ?? "openai") as string;
      const aiKey = opts.aiApiKey
        ?? process.env.IRA_AI_API_KEY
        ?? process.env.OPENAI_API_KEY
        ?? (aiProvider === "ollama" ? "" : undefined);
      if (aiKey === undefined) {
        throw new Error("Missing AI API key. Set IRA_AI_API_KEY or OPENAI_API_KEY environment variable.");
      }

      const ai = createAIProvider({
        provider: aiProvider as "openai" | "azure-openai" | "anthropic" | "ollama",
        apiKey: aiKey,
        model: opts.aiModel,
        ...(opts.aiBaseUrl && { baseUrl: opts.aiBaseUrl }),
        ...(opts.aiApiVersion && { apiVersion: opts.aiApiVersion }),
        ...(opts.aiDeployment && { deploymentName: opts.aiDeployment }),
      });

      // Resolve JIRA config
      const jiraUrl = opts.jiraUrl ?? process.env.IRA_JIRA_URL;
      const jiraEmail = opts.jiraEmail ?? process.env.IRA_JIRA_EMAIL;
      const jiraToken = opts.jiraToken ?? process.env.IRA_JIRA_TOKEN;
      if (!jiraUrl || !jiraEmail || !jiraToken) {
        throw new Error("JIRA credentials required. Set --jira-url, --jira-email, --jira-token (or IRA_JIRA_* env vars).");
      }

      const jiraClient = new JiraClient({
        baseUrl: jiraUrl,
        email: jiraEmail,
        token: jiraToken,
        ...(opts.jiraAcField && { acceptanceCriteriaField: opts.jiraAcField }),
      });

      const VALID_TEST_FRAMEWORKS: TestFramework[] = ["jest", "vitest", "mocha", "playwright", "cypress", "gherkin", "pytest", "junit"];
      const testFramework = (opts.testFramework ?? "jest") as TestFramework;
      if (!VALID_TEST_FRAMEWORKS.includes(testFramework)) {
        throw new Error(`Invalid test framework: "${testFramework}". Must be one of: ${VALID_TEST_FRAMEWORKS.join(", ")}`);
      }

      console.log(`\n🧪 IRA — Test Case Generator\n`);
      console.log(`  JIRA Ticket:  ${opts.jiraTicket}`);
      console.log(`  Framework:    ${testFramework}`);
      console.log(`  AI Provider:  ${aiProvider}`);
      if (opts.pr) {
        console.log(`  PR:           #${opts.pr} (code context enabled)`);
      }
      console.log();

      // Fetch JIRA issue
      const jiraIssue = await jiraClient.fetchIssue(opts.jiraTicket);

      // Detect framework (soft fail)
      let framework: Awaited<ReturnType<typeof detectFramework>> = null;
      try {
        framework = await detectFramework(process.cwd());
      } catch {
        // Ignore
      }

      // Fetch PR diff if provided (for code context)
      let diffContext: string | null = null;
      let sourceFiles: Map<string, string> | null = null;
      if (opts.pr) {
        try {
          const config = resolveConfigFromEnv({
            pr: opts.pr,
            dryRun: true,
            ...(opts.scmProvider && { scmProvider: opts.scmProvider }),
            ...(opts.githubToken && { githubToken: opts.githubToken }),
            ...(opts.githubRepo && { githubRepo: opts.githubRepo }),
            ...(opts.bitbucketToken && { bitbucketToken: opts.bitbucketToken }),
            ...(opts.repo && { repo: opts.repo }),
          });
          const { BitbucketClient } = await import("./scm/bitbucket.js");
          const { GitHubClient } = await import("./scm/github.js");
          const scmClient = config.scmProvider === "github"
            ? new GitHubClient(config.scm as { token: string; owner: string; repo: string })
            : new BitbucketClient(config.scm as { token: string; workspace: string; repoSlug: string });
          diffContext = await scmClient.getDiff(opts.pr);

          // Fetch source files for changed files
          const diffFiles = [...diffContext.matchAll(/^diff --git a\/(.+?) b\/(.+)/gm)];
          const changedFiles = diffFiles.map(m => m[2]).filter(Boolean);
          const fetchedSources = new Map<string, string>();
          for (const filePath of changedFiles.slice(0, 5)) {
            try {
              const content = await scmClient.getFileContent(filePath, opts.pr);
              fetchedSources.set(filePath, content);
            } catch {
              // Soft fail per file
            }
          }
          if (fetchedSources.size > 0) {
            sourceFiles = fetchedSources;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          console.warn(`⚠️  Could not fetch PR diff: ${msg}. Generating tests from AC only.\n`);
        }
      }

      // Generate test cases
      const result = await generateTestCases(
        jiraIssue,
        testFramework,
        ai,
        framework,
        diffContext,
        sourceFiles,
      );

      // Generate requirement completion
      const reqResult = await trackRequirementCompletion(
        jiraIssue,
        ai,
        framework,
        diffContext,
        sourceFiles,
      );

      // Output requirement completion
      console.log(`📊 Requirement Completion: ${reqResult.completionPercentage}% (${reqResult.metCriteria}/${reqResult.totalCriteria} AC met)\n`);
      for (const r of reqResult.requirements) {
        const icon = r.coverage === "full" ? "✅" : r.coverage === "partial" ? "🟡" : "❌";
        console.log(`   ${icon} ${r.description}`);
      }
      if (reqResult.edgeCases.length > 0) {
        console.log(`\n⚠️  Edge Cases Not Covered:`);
        for (const e of reqResult.edgeCases) {
          console.log(`   - ${e}`);
        }
      }

      // Output test cases
      if (result.testCases.length > 0) {
        console.log(`\n🧪 Generated ${result.totalCases} test cases (${result.edgeCases} edge cases)\n`);

        if (opts.output) {
          // Write to file
          const { writeFileSync } = await import("fs");
          const testCode = result.testCases.map((tc) => tc.code).join("\n\n");
          writeFileSync(opts.output, testCode, "utf-8");
          console.log(`   Written to: ${opts.output}\n`);
        } else {
          // Print to stdout
          for (const tc of result.testCases) {
            const typeIcon = tc.type === "happy-path" ? "✅" : tc.type === "edge-case" ? "⚠️" : "🚫";
            console.log(`${typeIcon} ${tc.description} (${tc.type})`);
            console.log(`   Criterion: ${tc.criterion}`);
            console.log(`   ${tc.code.split("\n").join("\n   ")}`);
            console.log();
          }
        }
      } else {
        console.log(`\n⚠️  No test cases generated. Check that the JIRA ticket has acceptance criteria.\n`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`\n❌ Test generation failed: ${message}\n`);
      process.exit(1);
    }
  });

program.parse();
