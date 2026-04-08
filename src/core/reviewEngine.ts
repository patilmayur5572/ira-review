import type { IraConfig, BitbucketConfig, GitHubConfig } from "../types/config.js";
import type { ReviewComment, ReviewResult, SCMProvider } from "../types/review.js";
import type { SonarIssue } from "../types/sonar.js";
import type { ComplexityReport } from "../types/risk.js";
import type { AcceptanceValidationResult, TestGenerationResult, RequirementCompletionResult } from "../types/jira.js";
import { SonarClient } from "./sonarClient.js";
import { filterIssues, groupIssuesByFile } from "./issueProcessor.js";
import { detectFramework } from "../frameworks/detector.js";
import { buildPrompt, buildStandalonePrompt, parseStandaloneResponse, annotateDiffWithLineNumbers } from "../ai/promptBuilder.js";
import { loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from "../utils/rulesFile.js";
import { createAIProvider } from "../ai/aiClient.js";
import type { AIFoundIssue } from "../ai/promptBuilder.js";
import { BitbucketClient } from "../scm/bitbucket.js";
import { GitHubClient } from "../scm/github.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { CommentTracker, deduplicateKey } from "../scm/commentTracker.js";
import { calculateRisk } from "./riskScorer.js";
import { ComplexityAnalyzer } from "./complexityAnalyzer.js";
import { JiraClient } from "../integrations/jiraClient.js";
import { validateAcceptanceCriteria } from "./acceptanceValidator.js";
import { generateTestCases } from "./testGenerator.js";
import { trackRequirementCompletion } from "./requirementTracker.js";
import { buildSummary } from "./summaryBuilder.js";
import { Notifier } from "../integrations/notifier.js";
import { resolveGitRoot } from "../utils/gitRoot.js";

const AI_CONCURRENCY = 3;

interface IssueWithFile {
  filePath: string;
  issue: SonarIssue;
}

export class ReviewEngine {
  private readonly config: IraConfig;

  constructor(config: IraConfig) {
    this.config = config;
  }

  async run(): Promise<ReviewResult> {
    const { ai, pullRequestId } = this.config;
    const warnings: string[] = [];
    const repoPath = this.config.repoPath ?? resolveGitRoot();
    const scmClient = this.createSCMClient();

    // 1. Fetch issues from SonarQube (if configured)
    let allIssues: SonarIssue[] = [];
    if (this.config.sonar) {
      const sonarClient = new SonarClient(this.config.sonar);
      allIssues = await sonarClient.fetchPullRequestIssues(pullRequestId);
    }

    // 2. Filter by severity
    const filtered = filterIssues(allIssues, this.config.minSeverity);
    const grouped = groupIssuesByFile(filtered);

    // 3. Detect framework (soft fail)
    let framework: Awaited<ReturnType<typeof detectFramework>> = null;
    try {
      framework = await detectFramework(repoPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      warnings.push(`Framework detection failed: ${msg}`);
    }

    // 4. Load team rules
    const teamRules = loadRulesFile(repoPath);
    if (teamRules.length > 0) {
      console.log(`  Team rules: ${teamRules.length} loaded from .ira-rules.json`);
    }
    const sensitiveAreas = loadSensitiveAreas(repoPath);

    // 5. Code complexity analysis (soft fail, requires Sonar)
    let complexity: ComplexityReport | null = null;
    if (this.config.sonar) {
      try {
        const analyzer = new ComplexityAnalyzer(this.config.sonar);
        complexity = await analyzer.analyze(pullRequestId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        warnings.push(`Complexity analysis failed: ${msg}`);
      }
    }

    // 5. Fetch PR diff for AI context (soft fail)
    let diffByFile = new Map<string, string>();
    try {
      const fullDiff = await scmClient.getDiff(pullRequestId);
      diffByFile = parseDiffByFile(fullDiff);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      warnings.push(`PR diff fetch failed, AI will review without code context: ${msg}`);
    }

    // Standalone mode requires diff context — fail fast if empty
    if (!this.config.sonar && diffByFile.size === 0) {
      const hint = warnings.length > 0 ? `\nCause: ${warnings[warnings.length - 1]}` : "";
      throw new Error(
        "Standalone AI review requires PR diff context, but no diff could be fetched. " +
        "Ensure SCM credentials and repo are configured correctly." + hint,
      );
    }

    // 6. Fetch source files for changed files (soft fail, deduplicated)
    const changedFiles = this.config.sonar
      ? new Set(grouped.map((g) => g.filePath))
      : new Set(diffByFile.keys());
    const sourceByFile = new Map<string, string>();
    if (changedFiles.size > 0) {
      try {
        await mapWithConcurrency(
          [...changedFiles],
          AI_CONCURRENCY,
          async (filePath) => {
            try {
              const content = await scmClient.getFileContent(filePath, pullRequestId);
              sourceByFile.set(filePath, content);
            } catch {
              // Soft fail per file — diff context is still available
            }
          },
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        warnings.push(`Source file fetch failed: ${msg}`);
      }
    }

    // 7. Generate AI reviews
    const aiProvider = createAIProvider(ai);
    const criticalProvider = ai.criticalModel && ai.criticalModel !== (ai.model ?? "gpt-4o-mini")
      ? createAIProvider({ ...ai, model: ai.criticalModel })
      : null;
    const comments: ReviewComment[] = [];

    const reviewMode = this.config.sonar ? "sonar" : "standalone";

    if (reviewMode === "sonar") {
      // Sonar mode: AI explains each Sonar issue
      const flatIssues: IssueWithFile[] = grouped.flatMap((group) =>
        group.issues.map((issue) => ({ filePath: group.filePath, issue })),
      );

      const results = await mapWithConcurrency(
        flatIssues,
        AI_CONCURRENCY,
        async ({ filePath, issue }): Promise<ReviewComment | null> => {
          try {
            const rawDiff = diffByFile.get(filePath) ?? null;
            const fileDiff = rawDiff ? annotateDiffWithLineNumbers(rawDiff) : null;
            const sourceFile = sourceByFile.get(filePath) ?? null;
            const prompt = buildPrompt(issue, framework, fileDiff, sourceFile);
            const useCritical = criticalProvider && (issue.severity === "BLOCKER" || issue.severity === "CRITICAL");
            const aiReview = await (useCritical ? criticalProvider : aiProvider).review(prompt);
            return {
              filePath,
              line: issue.textRange?.startLine ?? issue.line ?? 0,
              rule: issue.rule,
              severity: issue.severity,
              message: issue.message,
              aiReview,
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            warnings.push(`AI review failed for ${issue.key}: ${msg}`);
            return null;
          }
        },
      );

      for (const r of results) {
        if (r) comments.push(r);
      }
    } else {
      // Standalone mode: AI reviews each changed file directly
      const fileEntries = [...diffByFile.entries()];

      const results = await mapWithConcurrency(
        fileEntries,
        AI_CONCURRENCY,
        async ([filePath, diff]): Promise<ReviewComment[]> => {
          try {
            const sourceFile = sourceByFile.get(filePath) ?? null;
            const filteredRules = filterRulesByPath(teamRules, filePath);
            const rulesSection = formatRulesForPrompt(filteredRules);
            const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
            const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
            const annotatedDiff = annotateDiffWithLineNumbers(diff);
            const prompt = buildStandalonePrompt(filePath, annotatedDiff, framework, sourceFile, rulesSection, sensitiveContext);
            const response = await aiProvider.review(prompt);
            // explanation field contains a JSON-encoded array of issues
            const foundIssues = parseStandaloneResponse(response.explanation);

            return foundIssues.map((issue: AIFoundIssue) => ({
              filePath,
              line: issue.line,
              rule: `IRA/${issue.category}`,
              severity: issue.severity,
              message: issue.message,
              aiReview: {
                explanation: issue.explanation,
                impact: issue.impact,
                suggestedFix: issue.suggestedFix,
              },
            }));
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            warnings.push(`AI review failed for ${filePath}: ${msg}`);
            return [];
          }
        },
      );

      for (const fileComments of results) {
        comments.push(...fileComments);
      }

      // Filter standalone comments by minSeverity
      {
        const severityOrder = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
        const threshold = severityOrder.indexOf(this.config.minSeverity ?? "CRITICAL");
        const filtered = comments.filter(
          (c) => severityOrder.indexOf(c.severity) <= threshold,
        );
        comments.length = 0;
        comments.push(...filtered);
      }

      // Populate allIssues from AI findings for risk scoring
      allIssues = comments.map((c, i) => ({
        key: `AI-${i}`,
        rule: c.rule,
        severity: c.severity as SonarIssue["severity"],
        component: c.filePath,
        message: c.message,
        line: c.line,
        type: c.rule.includes("security") ? "VULNERABILITY" : "CODE_SMELL",
        flows: [],
        tags: [c.rule.replace(/^(ai|IRA)\//, "")],
      }));
    }

    // 8. Calculate PR risk score
    const filesChanged = new Set(allIssues.map((i) => i.component)).size;
    const effectiveFiltered = reviewMode === "standalone"
      ? filterIssues(allIssues, this.config.minSeverity)
      : filtered;
    const hasSensitiveFiles = [...(diffByFile.keys())].some(fp => matchSensitiveArea(sensitiveAreas, fp) !== null);
    const risk = calculateRisk({
      allIssues,
      filteredIssues: effectiveFiltered,
      complexity,
      filesChanged,
      sensitiveFileMultiplier: hasSensitiveFiles ? 2 : 1,
    });

    // 9. JIRA acceptance criteria validation (soft fail)
    let acceptanceValidation: AcceptanceValidationResult | null = null;
    let testGeneration: TestGenerationResult | null = null;
    let requirementCompletion: RequirementCompletionResult | null = null;
    if (this.config.jira && this.config.jiraTicket) {
      try {
        const jiraClient = new JiraClient(this.config.jira);
        const jiraIssue = await jiraClient.fetchIssue(this.config.jiraTicket);
        acceptanceValidation = await validateAcceptanceCriteria(
          jiraIssue,
          allIssues,
          framework,
          aiProvider,
        );

        // 9a. Requirement completion tracking
        const fullDiff = [...diffByFile.values()].join("\n");
        requirementCompletion = await trackRequirementCompletion(
          jiraIssue,
          aiProvider,
          framework,
          fullDiff || null,
          sourceByFile.size > 0 ? sourceByFile : null,
        );
        if (requirementCompletion.parseWarning) {
          warnings.push(requirementCompletion.parseWarning);
        }

        // 9b. Test case generation (if requested)
        if (this.config.generateTests) {
          testGeneration = await generateTestCases(
            jiraIssue,
            this.config.testFramework ?? "jest",
            aiProvider,
            framework,
            fullDiff || null,
            sourceByFile.size > 0 ? sourceByFile : null,
          );
          if (testGeneration.parseWarning) {
            warnings.push(testGeneration.parseWarning);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        warnings.push(`JIRA validation failed: ${msg}`);
      }
    }

    // 10. Deduplicate: skip issues already commented on
    let newComments = comments;
    if (!this.config.dryRun) {
      const tracker =
        this.config.scmProvider === "github"
          ? new CommentTracker(this.config.scm as GitHubConfig, "github")
          : new CommentTracker(this.config.scm as BitbucketConfig);
      const existing = await tracker.getExistingIraComments(pullRequestId);
      newComments = comments.filter(
        (c) => !existing.has(deduplicateKey(c.filePath, c.line, c.rule)),
      );
    }

    const result: ReviewResult = {
      pullRequestId,
      framework,
      reviewMode,
      totalIssues: allIssues.length,
      reviewedIssues: comments.length,
      comments,
      commentsPosted: this.config.dryRun ? comments.length : newComments.length,
      risk,
      complexity,
      acceptanceValidation,
      testGeneration,
      requirementCompletion,
      warnings,
    };

    // 11. Post summary + comments
    const summary = buildSummary(result);

    if (this.config.dryRun) {
      console.log(summary);
      for (const comment of comments) {
        this.printComment(comment);
      }
      if (warnings.length > 0) {
        console.log(`\n⚠️  Warnings:`);
        for (const w of warnings) {
          console.log(`   - ${w}`);
        }
      }
    } else {
      await scmClient.postSummary(summary, pullRequestId);
      let postedCount = 0;
      for (const comment of newComments) {
        try {
          await scmClient.postComment(comment, pullRequestId);
          postedCount++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          warnings.push(`Failed to post comment on ${comment.filePath}:${comment.line}: ${msg}`);
        }
      }
      result.commentsPosted = postedCount;

      // 11a. Apply risk label to PR (soft fail)
      if (risk && scmClient.applyRiskLabel) {
        try {
          await scmClient.applyRiskLabel(pullRequestId, risk.level, risk.score);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          warnings.push(`Risk label failed: ${msg}`);
        }
      }
    }

    // 12. Send notifications (soft fail, respects minRiskLevel and notifyOnAcFail)
    if (this.config.notifications) {
      const riskTriggered = meetsRiskThreshold(
        result.risk?.level ?? "LOW",
        this.config.notifications.minRiskLevel,
      );
      const acFailed = this.config.notifications.notifyOnAcFail
        && (result.requirementCompletion?.overallPass === false
          || result.acceptanceValidation?.overallPass === false);
      const shouldNotify = riskTriggered || acFailed;

      if (shouldNotify) {
        try {
          const notifier = new Notifier(this.config.notifications);
          await notifier.notify(result);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          warnings.push(`Notification delivery failed: ${msg}`);
        }
      }
    }

    return result;
  }

  private createSCMClient(): SCMProvider {
    if (this.config.scmProvider === "github") {
      return new GitHubClient(this.config.scm as GitHubConfig);
    }
    return new BitbucketClient(this.config.scm as BitbucketConfig);
  }

  private printComment(comment: ReviewComment): void {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📄 ${comment.filePath}:${comment.line}`);
    console.log(`   Rule:     ${comment.rule} (${comment.severity})`);
    console.log(`   Message:  ${comment.message}`);
    console.log(`   Explain:  ${comment.aiReview.explanation}`);
    console.log(`   Impact:   ${comment.aiReview.impact}`);
    console.log(`   Fix:      ${comment.aiReview.suggestedFix}`);
  }
}

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function meetsRiskThreshold(
  currentLevel: string,
  minLevel?: string,
): boolean {
  if (!minLevel) return true;
  const current = RISK_ORDER[currentLevel] ?? 0;
  const threshold = RISK_ORDER[minLevel.toUpperCase()] ?? 0;
  return current >= threshold;
}

function parseDiffByFile(diff: string): Map<string, string> {
  const fileMap = new Map<string, string>();
  const fileSections = diff.split(/^diff --git /m);

  for (const section of fileSections) {
    if (!section.trim()) continue;

    const headerMatch = section.match(/^a\/(.+?)\s+b\/(.+)/);
    if (!headerMatch) continue;

    const bPath = headerMatch[2];

    // Skip deleted files (b path is /dev/null)
    if (bPath === "/dev/null") continue;

    fileMap.set(bPath, `diff --git ${section}`);
  }

  return fileMap;
}
