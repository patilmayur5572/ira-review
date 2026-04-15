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
}
