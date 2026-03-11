import { Command } from "commander";
import { ReviewEngine } from "./core/reviewEngine.js";
import { resolveConfigFromEnv } from "./utils/env.js";

const program = new Command();

program
  .name("ira-review")
  .description("AI-powered PR review tool with SonarQube integration")
  .version("0.1.0");

program
  .command("review")
  .description("Run AI-powered review on a pull request")
  .option("--sonar-url <url>", "SonarQube/SonarCloud base URL (or IRA_SONAR_URL)")
  .option("--sonar-token <token>", "SonarQube API token (or IRA_SONAR_TOKEN)")
  .option("--project-key <key>", "Sonar project key (or IRA_PROJECT_KEY)")
  .option("--pr <id>", "Pull request ID (or IRA_PR)")
  .option("--bitbucket-token <token>", "Bitbucket API token (or IRA_BITBUCKET_TOKEN)")
  .option("--repo <repo>", "workspace/repo-slug (or IRA_REPO)")
  .option("--ai-provider <provider>", "AI provider", "openai")
  .option("--ai-model <model>", "AI model to use", "gpt-4o-mini")
  .option("--bitbucket-url <url>", "Bitbucket base URL (or IRA_BITBUCKET_URL)")
  .option("--dry-run", "Print comments to stdout instead of posting to SCM")
  .option("--min-severity <level>", "Minimum severity to review (BLOCKER|CRITICAL|MAJOR|MINOR|INFO)", "CRITICAL")
  .option("--jira-url <url>", "JIRA base URL (or IRA_JIRA_URL)")
  .option("--jira-email <email>", "JIRA email (or IRA_JIRA_EMAIL)")
  .option("--jira-token <token>", "JIRA API token (or IRA_JIRA_TOKEN)")
  .option("--jira-ticket <key>", "JIRA ticket key (e.g. PROJ-123)")
  .option("--jira-ac-field <field>", "Custom field ID for acceptance criteria")
  .action(async (opts) => {
    try {
      const config = resolveConfigFromEnv({
        sonarUrl: opts.sonarUrl,
        sonarToken: opts.sonarToken,
        projectKey: opts.projectKey,
        pr: opts.pr,
        bitbucketToken: opts.bitbucketToken,
        repo: opts.repo,
        aiProvider: opts.aiProvider,
        aiModel: opts.aiModel,
        bitbucketUrl: opts.bitbucketUrl,
        dryRun: opts.dryRun,
        minSeverity: opts.minSeverity,
        jiraUrl: opts.jiraUrl,
        jiraEmail: opts.jiraEmail,
        jiraToken: opts.jiraToken,
        jiraTicket: opts.jiraTicket,
        jiraAcField: opts.jiraAcField,
      });

      console.log(`\n🔍 IRA — AI-Powered PR Review\n`);
      console.log(`  Project:  ${config.sonar.projectKey}`);
      console.log(`  PR:       #${config.pullRequestId}`);
      console.log(`  Provider: ${config.ai.provider}`);
      console.log(`  Dry run:  ${config.dryRun ? "yes" : "no"}\n`);

      const engine = new ReviewEngine(config);
      const result = await engine.run();

      console.log(`✅ Review complete!`);
      console.log(`   Total issues found:    ${result.totalIssues}`);
      console.log(`   Issues reviewed (AI):  ${result.reviewedIssues}`);
      console.log(`   Framework detected:    ${result.framework ?? "none"}`);
      console.log(`   Comments posted:       ${result.comments.length}`);
      if (result.risk) {
        console.log(`   PR Risk:               ${result.risk.level} (${result.risk.score}/${result.risk.maxScore})`);
      }
      if (result.acceptanceValidation) {
        console.log(`   JIRA AC Validation:    ${result.acceptanceValidation.overallPass ? "PASS" : "FAIL"}`);
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
