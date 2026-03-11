import type { SonarIssue } from "./sonar.js";
import type { RiskReport, ComplexityReport } from "./risk.js";
import type { AcceptanceValidationResult } from "./jira.js";

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

export interface ReviewResult {
  pullRequestId: string;
  framework: Framework | null;
  totalIssues: number;
  reviewedIssues: number;
  comments: ReviewComment[];
  risk: RiskReport | null;
  complexity: ComplexityReport | null;
  acceptanceValidation: AcceptanceValidationResult | null;
  warnings?: string[];
}

export interface AIProvider {
  review(prompt: string): Promise<AIReviewComment>;
}

export interface SCMProvider {
  postComment(comment: ReviewComment, pullRequestId: string): Promise<void>;
}
