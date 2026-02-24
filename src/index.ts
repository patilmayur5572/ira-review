// Core
export { ReviewEngine } from "./core/reviewEngine.js";
export { SonarClient } from "./core/sonarClient.js";
export { filterIssues, groupIssuesByFile } from "./core/issueProcessor.js";

// AI
export { createAIProvider } from "./ai/aiClient.js";
export { buildPrompt } from "./ai/promptBuilder.js";

// SCM
export { BitbucketClient } from "./scm/bitbucket.js";

// Framework detection
export { detectFramework } from "./frameworks/detector.js";

// Utilities
export { withRetry } from "./utils/retry.js";
export { mapWithConcurrency } from "./utils/concurrency.js";
export { resolveConfigFromEnv } from "./utils/env.js";

// Types
export type { IraConfig, SonarConfig, BitbucketConfig, AIConfig } from "./types/config.js";
export type { SonarIssue, Severity, SonarSearchResponse } from "./types/sonar.js";
export type {
  Framework,
  ReviewComment,
  ReviewResult,
  AIReviewComment,
  AIProvider,
  SCMProvider,
  GroupedIssues,
} from "./types/review.js";
export type { RetryOptions } from "./utils/retry.js";
export type { FlatConfig } from "./utils/env.js";
