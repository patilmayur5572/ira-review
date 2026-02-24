import type { SonarIssue } from "../types/sonar.js";
import type { Framework } from "../types/review.js";

export function buildPrompt(
  issue: SonarIssue,
  framework: Framework | null,
): string {
  const frameworkContext = framework
    ? `The codebase uses **${framework}**. Tailor your response to ${framework} best practices.`
    : "No specific framework detected.";

  const location = issue.textRange
    ? `Lines ${issue.textRange.startLine}–${issue.textRange.endLine}`
    : issue.line
      ? `Line ${issue.line}`
      : "Unknown location";

  return `You are a senior code reviewer. Analyze this SonarQube issue and provide actionable feedback.

## Issue Details
- **Rule**: ${issue.rule}
- **Severity**: ${issue.severity}
- **Type**: ${issue.type}
- **Message**: ${issue.message}
- **Location**: ${location}
- **Component**: ${issue.component}
${issue.tags.length > 0 ? `- **Tags**: ${issue.tags.join(", ")}` : ""}

## Framework Context
${frameworkContext}

## Instructions
Respond in valid JSON with exactly these fields:
{
  "explanation": "Clear explanation of what this issue means and why it matters",
  "impact": "What could go wrong if this is not fixed",
  "suggestedFix": "Concrete code suggestion or fix (as a string, not a code block)"
}

Respond with ONLY the JSON object, no markdown fences or extra text.`;
}
