import type { JiraIssue, AcceptanceValidationResult } from "../types/jira.js";
import type { AIProvider } from "../types/review.js";
import type { SonarIssue } from "../types/sonar.js";
import type { Framework } from "../types/review.js";

export async function validateAcceptanceCriteria(
  jiraIssue: JiraIssue,
  issues: SonarIssue[],
  framework: Framework | null,
  aiProvider: AIProvider,
): Promise<AcceptanceValidationResult> {
  const ac =
    jiraIssue.fields.acceptanceCriteria ?? jiraIssue.fields.description;

  if (!ac) {
    return {
      jiraKey: jiraIssue.key,
      summary: jiraIssue.fields.summary,
      criteria: [],
      overallPass: false,
    };
  }

  const prompt = buildValidationPrompt(jiraIssue, ac, issues, framework);
  const response = await aiProvider.review(prompt);

  // Parse the AI response into structured criteria
  const criteria = parseValidationResponse(response.explanation);

  return {
    jiraKey: jiraIssue.key,
    summary: jiraIssue.fields.summary,
    criteria,
    overallPass: criteria.length > 0 && criteria.every((c) => c.met),
  };
}

function buildValidationPrompt(
  jiraIssue: JiraIssue,
  acceptanceCriteria: string,
  issues: SonarIssue[],
  framework: Framework | null,
): string {
  const issuesSummary = issues
    .slice(0, 10)
    .map((i) => `- [${i.severity}] ${i.rule}: ${i.message} (${i.component})`)
    .join("\n");

  const frameworkCtx = framework
    ? `The project uses ${framework}.`
    : "No specific framework detected.";

  return `You are reviewing a pull request against its JIRA acceptance criteria.

## JIRA Ticket: ${jiraIssue.key}
**Summary:** ${jiraIssue.fields.summary}
**Status:** ${jiraIssue.fields.status.name}
**Type:** ${jiraIssue.fields.issuetype.name}

## Acceptance Criteria
${acceptanceCriteria}

## SonarQube Issues Found
${issuesSummary || "No issues found."}

## Context
${frameworkCtx}

## Instructions
For each acceptance criterion, determine if the PR likely meets it based on the Sonar analysis.
If there are blockers or critical issues, those may indicate the criteria is NOT met.

Respond in valid JSON with exactly these fields:
{
  "explanation": "CRITERION_1: MET/NOT_MET - evidence | CRITERION_2: MET/NOT_MET - evidence",
  "impact": "Overall assessment of whether this PR meets its acceptance criteria",
  "suggestedFix": "What needs to be addressed before this PR can be accepted"
}

Respond with ONLY the JSON object.`;
}

function parseValidationResponse(
  explanation: string,
): Array<{ description: string; met: boolean; evidence: string }> {
  const lines = explanation.split("|").map((l) => l.trim());
  return lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const met = line.toUpperCase().includes("MET") && !line.toUpperCase().includes("NOT_MET");
      const parts = line.split("-").map((p) => p.trim());
      return {
        description: parts[0] ?? line,
        met,
        evidence: parts.slice(1).join(" - ") || "No evidence provided",
      };
    });
}
