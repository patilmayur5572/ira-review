import type { Severity, SonarIssue } from "../types/sonar.js";
import type { GroupedIssues } from "../types/review.js";

const RELEVANT_SEVERITIES: Severity[] = ["BLOCKER", "CRITICAL"];

export function filterIssues(issues: SonarIssue[]): SonarIssue[] {
  return issues.filter((issue) =>
    RELEVANT_SEVERITIES.includes(issue.severity),
  );
}

export function groupIssuesByFile(issues: SonarIssue[]): GroupedIssues[] {
  const grouped = new Map<string, SonarIssue[]>();

  for (const issue of issues) {
    const filePath = extractFilePath(issue.component);
    const existing = grouped.get(filePath) ?? [];
    existing.push(issue);
    grouped.set(filePath, existing);
  }

  return Array.from(grouped.entries()).map(([filePath, issues]) => ({
    filePath,
    issues,
  }));
}

function extractFilePath(component: string): string {
  // Sonar component keys are formatted as "project:src/file.ts"
  const colonIndex = component.indexOf(":");
  return colonIndex >= 0 ? component.slice(colonIndex + 1) : component;
}
