import type { IraConfig } from "../types/config.js";
import type { ReviewComment, ReviewResult } from "../types/review.js";
import type { SonarIssue } from "../types/sonar.js";
import { SonarClient } from "./sonarClient.js";
import { filterIssues, groupIssuesByFile } from "./issueProcessor.js";
import { detectFramework } from "../frameworks/detector.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { createAIProvider } from "../ai/aiClient.js";
import { BitbucketClient } from "../scm/bitbucket.js";
import { mapWithConcurrency } from "../utils/concurrency.js";

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

    // 2. Filter to BLOCKER & CRITICAL
    const filtered = filterIssues(allIssues);
    const grouped = groupIssuesByFile(filtered);

    // 3. Detect framework
    const framework = await detectFramework(process.cwd());

    // 4. Flatten for concurrent processing
    const flatIssues: IssueWithFile[] = grouped.flatMap((group) =>
      group.issues.map((issue) => ({ filePath: group.filePath, issue })),
    );

    // 5. Generate AI reviews with concurrency limit
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

    // 6. Post comments to SCM (skip in dry-run mode)
    if (this.config.dryRun) {
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
}
