/**
 * IRA — Intelligent Review Assistant
 * Copyright (c) 2024-present Mayur Patil (patilmayur5572@gmail.com)
 * MIT License. See LICENSE file for details.
 */

import { Command } from "commander";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { ReviewEngine } from "./core/reviewEngine.js";
import { resolveConfigFromEnv } from "./utils/env.js";
import { loadConfigFile } from "./utils/configFile.js";
import { JiraClient } from "./integrations/jiraClient.js";
import { createAIProvider } from "./ai/aiClient.js";
import { generateTestCases } from "./core/testGenerator.js";
import { trackRequirementCompletion } from "./core/requirementTracker.js";
import { detectFramework } from "./frameworks/detector.js";
import { resolveGitRoot } from "./utils/gitRoot.js";
import { runPreflight, formatPreflight, detectScmFromGit, detectAiProvider } from "./utils/preflight.js";
import type { TestFramework } from "./types/jira.js";

// ─── Progressive messaging helpers ──────────────────────────

let cachedDevName: string | undefined;

function getDevName(): string {
  if (cachedDevName !== undefined) return cachedDevName;
  try {
    const fullName = execSync("git config user.name", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    cachedDevName = fullName.split(/[\s._-]/)[0] || "";
  } catch {
    cachedDevName = "";
  }
  return cachedDevName;
}

function greet(nextWord: string): string {
  const name = getDevName();
  return name ? `${name}, ${nextWord}` : nextWord.charAt(0).toUpperCase() + nextWord.slice(1);
}

function step(icon: string, message: string): void {
  console.log(`  ${icon} ${message}`);
}

// ─── Config helpers ─────────────────────────────────────────

function getCredentialsDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "ira");
  }
  return join(process.env.HOME ?? "", ".config", "ira");
}

function isFirstRun(): boolean {
  if (process.env.CI) return false;
  return !existsSync(resolve(process.cwd(), ".irarc.json")) && !existsSync(resolve(process.cwd(), "ira.config.json"));
}

// ─── Program ────────────────────────────────────────────────

const program = new Command();

program
  .name("ira-review")
  .description("AI-powered PR review tool with SonarQube + GitHub/Bitbucket integration")
  .version("2.0.0");

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
  .option("--jira-type <type>", "JIRA type: cloud or server (auto-detects from URL if omitted)")
  .option("--jira-ticket <key>", "JIRA ticket key (e.g. PROJ-123)")
  .option("--jira-ac-field <field>", "Custom field ID for acceptance criteria")
  .option("--jira-ac-source <source>", "Where to look for AC: customField, description, or both (default: customField)")
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
      console.log(`\n🔍 IRA — Scanning PR before your reviewers do\n`);

      // Step 1: Load config
      step("⏳", "Loading configuration…");
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
        ...(opts.jiraType && { jiraType: opts.jiraType }),
        ...(opts.jiraTicket && { jiraTicket: opts.jiraTicket.toUpperCase() }),
        ...(opts.jiraAcField && { jiraAcField: opts.jiraAcField }),
        ...(opts.jiraAcSource && { jiraAcSource: opts.jiraAcSource }),
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

      // First-run safety
      if (isFirstRun() && !config.dryRun) {
        config.dryRun = true;
        step("🛡️", "First run detected — defaulting to --dry-run so nothing gets posted accidentally");
        step("💡", `Run "ira-review init" to set up your project\n`);
      }

      const mode = config.sonar ? "Sonar + AI" : "AI-only";
      step("✓", `Config loaded — ${mode} mode, ${config.ai.provider}, PR #${config.pullRequestId}`);

      // Step 2: Run the review engine
      step("⏳", "Fetching PR diff and reviewing your code…");
      const engine = new ReviewEngine(config);
      const result = await engine.run();
      step("✓", "AI review complete — issues identified");

      // Step 3: Post results
      if (!config.dryRun && result.commentsPosted > 0) {
        step("✓", `Posted ${result.commentsPosted} comment${result.commentsPosted !== 1 ? "s" : ""} to PR`);
      }

      // Step 4: Results summary
      console.log();
      const riskAction = result.risk
        ? result.risk.level === "CRITICAL" ? "needs immediate attention"
          : result.risk.level === "HIGH" ? "worth a second look"
          : result.risk.level === "MEDIUM" ? "a few things to check"
          : "looking good, safe to ship"
        : "";
      const riskTag = result.risk
        ? ` — ${result.risk.level} risk, ${riskAction} (${result.risk.score}/${result.risk.maxScore})`
        : "";

      if (result.reviewedIssues === 0) {
        console.log(`  ${greet("PR")} looks clean — nothing to flag ✨${riskTag}`);
      } else {
        console.log(`  ${greet("caught")} ${result.reviewedIssues} issue${result.reviewedIssues !== 1 ? "s" : ""} before your reviewers did 🛡️${riskTag}`);
      }

      console.log();
      step("📄", `Issues found:      ${result.totalIssues}`);
      step("🤖", `Reviewed by AI:    ${result.reviewedIssues}`);
      step("🧩", `Framework:         ${result.framework ?? "not detected"}`);
      step("💬", `Comments posted:   ${result.commentsPosted}`);
      if (result.requirementCompletion) {
        const rc = result.requirementCompletion;
        step("📋", `Requirements:      ${rc.completionPercentage}% complete (${rc.metCriteria}/${rc.totalCriteria} AC met)`);
        if (rc.edgeCases.length > 0) {
          step("⚡", `Edge cases found:  ${rc.edgeCases.length} — worth covering`);
        }
      } else if (result.acceptanceValidation) {
        const av = result.acceptanceValidation;
        step("📋", `JIRA AC:           ${av.overallPass ? "all criteria passed ✅" : "some criteria need attention 📋"}`);
      }
      if (result.testGeneration) {
        step("🧪", `Tests generated:   ${result.testGeneration.totalCases} (${result.testGeneration.edgeCases} edge cases) — ready to plug in`);
      }
      if (result.warnings && result.warnings.length > 0) {
        console.log();
        for (const w of result.warnings) {
          step("⚠️", w);
        }
      }

      if (config.dryRun) {
        console.log(`\n  💡 This was a dry run — drop --dry-run to post comments directly on the PR\n`);
      } else {
        console.log(`\n  ✅ Your reviewers will see a cleaner PR — nice work\n`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Review didn't complete — ${message}`);
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
  .option("--jira-type <type>", "JIRA type: cloud or server (auto-detects from URL if omitted)")
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
      console.log(`\n🧪 IRA — Generating tests from your JIRA ticket\n`);

      // Step 1: Config
      step("⏳", "Loading configuration…");
      const fileConfig = loadConfigFile();
      const config = resolveConfigFromEnv({
        ...fileConfig,
        pr: opts.pr ?? "0",
        dryRun: true,
        ...(opts.aiProvider && { aiProvider: opts.aiProvider }),
        ...(opts.aiModel && { aiModel: opts.aiModel }),
        ...(opts.aiApiKey && { aiApiKey: opts.aiApiKey }),
        ...(opts.aiBaseUrl && { aiBaseUrl: opts.aiBaseUrl }),
        ...(opts.aiApiVersion && { aiApiVersion: opts.aiApiVersion }),
        ...(opts.aiDeployment && { aiDeploymentName: opts.aiDeployment }),
        ...(opts.jiraUrl && { jiraUrl: opts.jiraUrl }),
        ...(opts.jiraEmail && { jiraEmail: opts.jiraEmail }),
        ...(opts.jiraToken && { jiraToken: opts.jiraToken }),
        ...(opts.jiraType && { jiraType: opts.jiraType }),
        ...(opts.jiraAcField && { jiraAcField: opts.jiraAcField }),
        ...(opts.scmProvider && { scmProvider: opts.scmProvider }),
        ...(opts.githubToken && { githubToken: opts.githubToken }),
        ...(opts.githubRepo && { githubRepo: opts.githubRepo }),
        ...(opts.bitbucketToken && { bitbucketToken: opts.bitbucketToken }),
        ...(opts.repo && { repo: opts.repo }),
        ...(opts.testFramework && { testFramework: opts.testFramework }),
      });

      const ai = createAIProvider(config.ai);

      if (!config.jira) {
        throw new Error("JIRA credentials required. Set --jira-url and --jira-token (or IRA_JIRA_* env vars). For Cloud, also set --jira-email.");
      }
      const jiraClient = new JiraClient(config.jira);

      const VALID_TEST_FRAMEWORKS: TestFramework[] = ["jest", "vitest", "mocha", "playwright", "cypress", "gherkin", "pytest", "junit"];
      const testFramework = (config.testFramework ?? "jest") as TestFramework;
      if (!VALID_TEST_FRAMEWORKS.includes(testFramework)) {
        throw new Error(`Invalid test framework: "${testFramework}". Must be one of: ${VALID_TEST_FRAMEWORKS.join(", ")}`);
      }

      step("✓", `Config loaded — ${testFramework} tests, ${config.ai.provider} AI`);

      // Step 2: Fetch JIRA
      step("⏳", `Fetching ${opts.jiraTicket.toUpperCase()} from JIRA…`);
      const jiraIssue = await jiraClient.fetchIssue(opts.jiraTicket.toUpperCase());
      step("✓", `Got it — "${jiraIssue.fields.summary}"`);

      // Step 3: Detect framework
      step("⏳", "Detecting project framework…");
      let framework: Awaited<ReturnType<typeof detectFramework>> = null;
      try {
        framework = await detectFramework(resolveGitRoot());
      } catch {
        // Ignore
      }
      step("✓", `Framework: ${framework ?? "none detected — using generic patterns"}`);

      // Step 4: Fetch PR diff (optional)
      let diffContext: string | null = null;
      let sourceFiles: Map<string, string> | null = null;
      if (opts.pr) {
        step("⏳", `Fetching PR #${opts.pr} diff for better test precision…`);
        try {
          const { BitbucketClient } = await import("./scm/bitbucket.js");
          const { GitHubClient } = await import("./scm/github.js");
          const scmClient = config.scmProvider === "github"
            ? new GitHubClient(config.scm as { token: string; owner: string; repo: string })
            : new BitbucketClient(config.scm as { token: string; workspace: string; repoSlug: string });
          diffContext = await scmClient.getDiff(opts.pr);

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
          step("✓", `PR diff loaded — ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} changed`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          step("⚠️", `Couldn't fetch PR diff: ${errMsg} — generating from AC only`);
        }
      }

      // Step 5: Generate test cases
      step("⏳", `AI is writing ${testFramework} tests from the acceptance criteria…`);
      const result = await generateTestCases(
        jiraIssue,
        testFramework,
        ai,
        framework,
        diffContext,
        sourceFiles,
      );
      if (result.testCases.length > 0) {
        const notTestable = result.testCases.filter(tc => tc.type === "not-testable").length;
        const testable = result.totalCases - notTestable;
        const parts = [`${testable} test case${testable !== 1 ? "s" : ""}`];
        if (result.edgeCases > 0) parts.push(`${result.edgeCases} advanced`);
        if (notTestable > 0) parts.push(`${notTestable} not-testable AC${notTestable !== 1 ? "s" : ""}`);
        step("✓", `Generated ${parts.join(", ")}`);
      } else {
        step("⚠️", "No test cases generated — check that the ticket has acceptance criteria");
      }

      // Step 6: Requirement completion
      step("⏳", "Checking requirement coverage…");
      const reqResult = await trackRequirementCompletion(
        jiraIssue,
        ai,
        framework,
        diffContext,
        sourceFiles,
      );
      step("✓", `Requirements: ${reqResult.completionPercentage}% complete (${reqResult.metCriteria}/${reqResult.totalCriteria} AC met)`);

      // ─── Output ─────────────────────────────────────────
      console.log();

      // Requirement details
      if (reqResult.requirements.length > 0) {
        console.log(`  📋 Requirement Coverage\n`);
        for (const r of reqResult.requirements) {
          const icon = r.coverage === "full" ? "✅" : r.coverage === "partial" ? "🟡" : "❌";
          console.log(`     ${icon} ${r.description}`);
        }
      }
      if (reqResult.edgeCases.length > 0) {
        console.log(`\n  ⚡ Edge Cases Worth Covering\n`);
        for (const e of reqResult.edgeCases) {
          console.log(`     · ${e}`);
        }
      }

      // Test cases
      if (result.testCases.length > 0) {
        console.log(`\n  🧪 Test Cases\n`);

        if (opts.output) {
          const { writeFile } = await import("fs/promises");
          const testCode = result.testCases.map((tc) => tc.code).join("\n\n");
          await writeFile(opts.output, testCode, "utf-8");
          step("✓", `Written to ${opts.output} — plug them into your test suite`);
        } else {
          for (const tc of result.testCases) {
            const typeIcons: Record<string, string> = {
              "happy-path": "✅", "negative": "❌", "boundary-value": "🔲",
              "authorization": "🔑", "integration": "🔗", "state-workflow": "🔄",
              "data-integrity": "📊", "error-recovery": "🛡️", "not-testable": "⏭️",
            };
            const typeIcon = typeIcons[tc.type] ?? "✅";
            console.log(`  ${typeIcon} ${tc.description} (${tc.type})`);
            console.log(`     Criterion: ${tc.criterion}`);
            console.log(`     ${tc.code.split("\n").join("\n     ")}`);
            console.log();
          }
        }

        console.log(`  ${greet("your")} test coverage just got stronger 💪\n`);
      } else {
        console.log(`\n  💡 No test gaps found — AC coverage looks solid 👍\n`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Test generation didn't complete — ${message}`);
    }
  });

// ─── preflight subcommand ────────────────────────────────────
program
  .command("preflight")
  .description("Check that all required configuration is in place")
  .action(() => {
    console.log(`\n🔎 IRA — Checking your setup\n`);
    const result = runPreflight();
    console.log(formatPreflight(result));
    if (result.passed) {
      console.log(`\n  You're all set — run "ira-review review --pr <number>" to start 🚀\n`);
    } else {
      console.log(`\n  💡 Fix the items above and you'll be ready to go\n`);
      throw new Error("Some preflight checks need attention — see above");
    }
  });

// ─── init subcommand ─────────────────────────────────────────
program
  .command("init")
  .description("Interactive setup: detect config and write .irarc.json + credentials")
  .action(async () => {
    const { writeFile: writeFileAsync, mkdir } = await import("node:fs/promises");

    console.log(`\n🚀 IRA — Setting up your project\n`);

    // Step 1: Detect environment
    step("⏳", "Detecting your environment…");
    const scm = detectScmFromGit();
    const ai = detectAiProvider();
    step("✓", `SCM: ${scm ?? "not detected"} | AI: ${ai ? ai.provider : "not detected"}`);

    // Step 2: Write config (merge with existing if present)
    step("⏳", "Writing project config…");
    const rcPath = resolve(process.cwd(), ".irarc.json");
    let rcConfig: Record<string, unknown> = {};
    if (existsSync(rcPath)) {
      try {
        rcConfig = JSON.parse(await readFile(rcPath, "utf-8")) as Record<string, unknown>;
        step("📄", "Found existing .irarc.json — merging your settings");
      } catch {
        // Couldn't parse existing file — start fresh
      }
    }
    if (scm) rcConfig.scmProvider = scm;
    if (ai) rcConfig.aiProvider = ai.provider;

    await writeFileAsync(rcPath, JSON.stringify(rcConfig, null, 2) + "\n", "utf-8");
    step("✓", `Wrote ${rcPath}`);

    // Step 3: Store credentials
    if (ai) {
      step("⏳", "Storing credentials securely…");
      const credDir = getCredentialsDir();
      await mkdir(credDir, { recursive: true });
      const credPath = join(credDir, "credentials.json");
      const credentials: Record<string, string> = {};
      credentials.aiApiKey = ai.key;
      if (process.env.IRA_GITHUB_TOKEN) credentials.githubToken = process.env.IRA_GITHUB_TOKEN;
      if (process.env.IRA_BITBUCKET_TOKEN) credentials.bitbucketToken = process.env.IRA_BITBUCKET_TOKEN;
      await writeFileAsync(credPath, JSON.stringify(credentials, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
      step("✓", `Credentials saved to ${credPath} (mode 0600) 🔐`);
    } else {
      step("💡", "No AI key found — set OPENAI_API_KEY or IRA_AI_API_KEY and re-run init");
    }

    console.log(`\n  ✅ ${greet("you're")} all set — try your first review:\n`);
    console.log(`     ira-review review --pr <number> --dry-run\n`);
  });

program.exitOverride();
program.parseAsync().catch((error) => {
  const code = error?.code;
  if (code === "commander.helpDisplayed" || code === "commander.version" || code === "commander.help") {
    process.exit(0);
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`\n  ❌ ${message}\n`);
  process.exit(1);
});
