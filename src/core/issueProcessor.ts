import type { Severity, SonarIssue } from "../types/sonar.js";
import type { GroupedIssues } from "../types/review.js";

const SEVERITY_ORDER: Severity[] = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
const DEFAULT_MIN_SEVERITY: Severity = "CRITICAL";

export function filterIssues(
  issues: SonarIssue[],
  minSeverity: Severity = DEFAULT_MIN_SEVERITY,
): SonarIssue[] {
  const threshold = SEVERITY_ORDER.indexOf(minSeverity);
  return issues.filter(
    (issue) => SEVERITY_ORDER.indexOf(issue.severity) <= threshold,
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
  const colonIndex = component.indexOf(":");
  return colonIndex >= 0 ? component.slice(colonIndex + 1) : component;
}
