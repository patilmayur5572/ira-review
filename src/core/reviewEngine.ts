import type { IraConfig } from "../types/config.js";
import type { ReviewComment, ReviewResult } from "../types/review.js";
import type { SonarIssue } from "../types/sonar.js";
import type { RiskReport } from "../types/risk.js";
import type { ComplexityReport } from "../types/risk.js";
import type { AcceptanceValidationResult } from "../types/jira.js";
import { SonarClient } from "./sonarClient.js";
import { filterIssues, groupIssuesByFile } from "./issueProcessor.js";
import { detectFramework } from "../frameworks/detector.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { createAIProvider } from "../ai/aiClient.js";
import { BitbucketClient } from "../scm/bitbucket.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { calculateRisk } from "./riskScorer.js";
import { ComplexityAnalyzer } from "./complexityAnalyzer.js";
import { JiraClient } from "../integrations/jiraClient.js";
import { validateAcceptanceCriteria } from "./acceptanceValidator.js";

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
    const { sonar, ai, scm, pullRequestId } = this.config;

    // 1. Fetch issues
    const sonarClient = new SonarClient(sonar);
    const allIssues = await sonarClient.fetchPullRequestIssues(pullRequestId);

    // 2. Filter by severity
    const filtered = filterIssues(allIssues, this.config.minSeverity);
    const grouped = groupIssuesByFile(filtered);

    // 3. Detect framework
    const framework = await detectFramework(process.cwd());

    // 4. Code complexity analysis
    let complexity: ComplexityReport | null = null;
    try {
      const analyzer = new ComplexityAnalyzer(sonar);
      complexity = await analyzer.analyze(pullRequestId);
    } catch {
      // Complexity data is optional, continue without it
    }

    // 5. Flatten for concurrent processing
    const flatIssues: IssueWithFile[] = grouped.flatMap((group) =>
      group.issues.map((issue) => ({ filePath: group.filePath, issue })),
    );

    // 6. Generate AI reviews with concurrency limit
    const aiProvider = createAIProvider(ai);
    const comments = await mapWithConcurrency(
      flatIssues,
      AI_CONCURRENCY,
      async ({ filePath, issue }): Promise<ReviewComment> => {
        const prompt = buildPrompt(issue, framework);
        const aiReview = await aiProvider.review(prompt);
        return {
          filePath,
          line: issue.textRange?.startLine ?? issue.line ?? 0,
          rule: issue.rule,
          severity: issue.severity,
          message: issue.message,
          aiReview,
        };
      },
    );

    // 7. Calculate PR risk score
    const filesChanged = new Set(allIssues.map((i) => i.component)).size;
    const risk = calculateRisk({
      allIssues,
      filteredIssues: filtered,
      complexity,
      filesChanged,
    });

    // 8. JIRA acceptance criteria validation
    let acceptanceValidation: AcceptanceValidationResult | null = null;
    if (this.config.jira && this.config.jiraTicket) {
      const jiraClient = new JiraClient(this.config.jira);
      const jiraIssue = await jiraClient.fetchIssue(this.config.jiraTicket);
      acceptanceValidation = await validateAcceptanceCriteria(
        jiraIssue,
        allIssues,
        framework,
        aiProvider,
      );
    }

    // 9. Post comments / print results
    if (this.config.dryRun) {
      this.printRiskReport(risk);
      if (complexity) this.printComplexityReport(complexity);
      if (acceptanceValidation) this.printAcceptanceReport(acceptanceValidation);
      for (const comment of comments) {
        this.printComment(comment);
      }
    } else {
      const bitbucket = new BitbucketClient(scm);
      for (const comment of comments) {
        await bitbucket.postComment(comment, pullRequestId);
      }
    }

    return {
      pullRequestId,
      framework,
      totalIssues: allIssues.length,
      reviewedIssues: comments.length,
      comments,
      risk,
      complexity,
      acceptanceValidation,
    };
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

  private printRiskReport(risk: RiskReport): void {
    const emoji =
      risk.level === "CRITICAL"
        ? "🔴"
        : risk.level === "HIGH"
          ? "🟠"
          : risk.level === "MEDIUM"
            ? "🟡"
            : "🟢";

    console.log(`\n${"═".repeat(60)}`);
    console.log(`${emoji} PR Risk Score: ${risk.level} (${risk.score}/${risk.maxScore})`);
    console.log(`${"═".repeat(60)}`);
    for (const factor of risk.factors) {
      const bar = factor.score > 0 ? "▓" : "░";
      console.log(`   ${bar} ${factor.name}: ${factor.score}/${factor.maxScore} - ${factor.detail}`);
    }
    console.log(`\n   ${risk.summary}`);
  }

  private printComplexityReport(report: ComplexityReport): void {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🧠 Code Complexity`);
    console.log(`   Avg complexity:           ${report.averageComplexity.toFixed(1)}`);
    console.log(`   Avg cognitive complexity: ${report.averageCognitiveComplexity.toFixed(1)}`);
    console.log(`   Files analyzed:           ${report.files.length}`);
    if (report.hotspots.length > 0) {
      console.log(`   ⚠️  Hotspots (complexity > 15):`);
      for (const h of report.hotspots.slice(0, 5)) {
        console.log(`      ${h.filePath} (complexity: ${h.complexity}, cognitive: ${h.cognitiveComplexity})`);
      }
    }
  }

  private printAcceptanceReport(result: AcceptanceValidationResult): void {
    const emoji = result.overallPass ? "✅" : "❌";
    console.log(`\n${"─".repeat(60)}`);
    console.log(`${emoji} JIRA Acceptance: ${result.jiraKey} - ${result.summary}`);
    for (const c of result.criteria) {
      const icon = c.met ? "✅" : "❌";
      console.log(`   ${icon} ${c.description}`);
      console.log(`      ${c.evidence}`);
    }
  }
}
