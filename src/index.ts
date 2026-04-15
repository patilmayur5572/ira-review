/**
 * IRA — Intelligent Review Assistant
 * Copyright (c) 2024-present Mayur Patil (patilmayur5572@gmail.com)
 * MIT License. See LICENSE file for details.
 */

// Core
export { ReviewEngine } from "./core/reviewEngine.js";
export { SonarClient } from "./core/sonarClient.js";
export { filterIssues, groupIssuesByFile } from "./core/issueProcessor.js";
export { calculateRisk } from "./core/riskScorer.js";
export { ComplexityAnalyzer } from "./core/complexityAnalyzer.js";
export { validateAcceptanceCriteria } from "./core/acceptanceValidator.js";
export { generateTestCases } from "./core/testGenerator.js";
export { trackRequirementCompletion } from "./core/requirementTracker.js";
export { buildSummary } from "./core/summaryBuilder.js";
export { generateAcceptanceCriteria, formatACsForJiraComment } from "./core/acGenerator.js";

// AI
export { createAIProvider, parseAIResponse } from "./ai/aiClient.js";
export { buildPrompt, buildStandalonePrompt, parseStandaloneResponse, extractValidLineNumbers, validateIssuesAgainstDiff, resolveIssueLocations, correctLineNumbers, annotateDiffWithLineNumbers } from "./ai/promptBuilder.js";

// SCM
export { BitbucketClient } from "./scm/bitbucket.js";
export { GitHubClient } from "./scm/github.js";
export { CommentTracker, deduplicateKey } from "./scm/commentTracker.js";

// Integrations
export { JiraClient } from "./integrations/jiraClient.js";
export { Notifier } from "./integrations/notifier.js";

// Framework detection
export { detectFramework } from "./frameworks/detector.js";

// Utilities
export { withRetry, fetchWithTimeout, RetryableError, TimeoutError, isRetryable } from "./utils/retry.js";
export { mapWithConcurrency } from "./utils/concurrency.js";
export { resolveConfigFromEnv } from "./utils/env.js";
export { loadConfigFile } from "./utils/configFile.js";
export { loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from "./utils/rulesFile.js";

// Types
export type { IraConfig, SonarConfig, BitbucketConfig, GitHubConfig, AIConfig, JiraConfig, NotificationConfig, SCMProviderType, AIProviderType } from "./types/config.js";
export type { SonarIssue, Severity, SonarSearchResponse } from "./types/sonar.js";
export type {
  Framework,
  ReviewComment,
  ReviewResult,
  ReviewMode,
  AIReviewComment,
  AIProvider,
  SCMProvider,
  GroupedIssues,
  PRState,
} from "./types/review.js";
export type { AIFoundIssue } from "./ai/promptBuilder.js";
export type { RiskReport, RiskFactor, RiskLevel, ComplexityReport, ComplexityMetric } from "./types/risk.js";
export type { JiraIssue, AcceptanceValidationResult, AcceptanceCriterion, TestFramework, GeneratedTestCase, TestGenerationResult, RequirementStatus, RequirementCompletionResult, GeneratedAC, ACGenerationResult } from "./types/jira.js";
export type { ACGenerationContext } from "./core/acGenerator.js";
export type { RetryOptions } from "./utils/retry.js";
export type { FlatConfig } from "./utils/env.js";
export type { IraRule, IraRulesFile, SensitiveArea } from "./utils/rulesFile.js";

