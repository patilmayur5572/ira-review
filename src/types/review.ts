import type { SonarIssue } from "./sonar.js";
import type { RiskReport, ComplexityReport } from "./risk.js";
import type { AcceptanceValidationResult, TestGenerationResult, RequirementCompletionResult, ACGenerationResult } from "./jira.js";

export type Framework = "react" | "angular" | "vue" | "nestjs" | "node";

export interface GroupedIssues {
  filePath: string;
  issues: SonarIssue[];
}

export interface AIReviewComment {
  explanation: string;
  impact: string;
  suggestedFix: string;
}

export interface ReviewComment {
  filePath: string;
  line: number;
  rule: string;
  severity: string;
  message: string;
  aiReview: AIReviewComment;
}

export type ReviewMode = "sonar" | "standalone";

export interface ReviewResult {
  pullRequestId: string;
  framework: Framework | null;
  reviewMode: ReviewMode;
  totalIssues: number;
  reviewedIssues: number;
  comments: ReviewComment[];
  commentsPosted: number;
  risk: RiskReport | null;
  complexity: ComplexityReport | null;
  acceptanceValidation: AcceptanceValidationResult | null;
  testGeneration?: TestGenerationResult | null;
  requirementCompletion?: RequirementCompletionResult | null;
  warnings?: string[];
  acGeneration?: ACGenerationResult | null;
  /**
   * Distinct file count actually inspected by IRA (post-filter, pre-finding).
   * Used by the v3.1.6 summary header's metrics line so a clean PR can still
   * say "5 files reviewed · 0 findings" instead of leaving the reviewer
   * wondering whether IRA looked at anything at all. Optional for backwards
   * compatibility with callers that haven't been updated.
   */
  filesReviewed?: number;
}

/**
 * Metadata passed to `buildSummary` for the v3.1.6 footer line
 * (`_ira-review 3.1.6 · copilot-cli/claude-sonnet-4.5_`). Kept as a separate
 * argument rather than baked into ReviewResult so test fixtures and other
 * callers don't need to know about CLI-level concerns (version pinning,
 * provider plumbing) to construct a result.
 */
export interface SummaryMeta {
  version?: string;
  aiProvider?: string;
  aiModel?: string;
}

export interface AIProvider {
  review(prompt: string): Promise<AIReviewComment>;
}

export type PRState = "open" | "merged" | "declined" | "closed" | "unknown";

export interface SCMProvider {
  postComment(comment: ReviewComment, pullRequestId: string): Promise<void>;
  postSummary(summary: string, pullRequestId: string): Promise<void>;
  getDiff(pullRequestId: string): Promise<string>;
  getDiffPerFile?(pullRequestId: string): Promise<Map<string, string>>;
  getFileContent(filePath: string, pullRequestId: string): Promise<string>;
  applyRiskLabel?(pullRequestId: string, riskLevel: string, riskScore: number): Promise<void>;
  getPRState?(pullRequestId: string): Promise<PRState>;
  getIssueComments?(pullRequestId: string): Promise<string[]>;
}
