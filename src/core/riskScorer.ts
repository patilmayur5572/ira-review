import type { SonarIssue } from "../types/sonar.js";
import type { ComplexityReport } from "../types/risk.js";
import type { RiskReport, RiskFactor, RiskLevel } from "../types/risk.js";

interface RiskInput {
  allIssues: SonarIssue[];
  filteredIssues: SonarIssue[];
  complexity: ComplexityReport | null;
  filesChanged: number;
  sensitiveFileMultiplier?: number;
}

export function calculateRisk(input: RiskInput): RiskReport {
  const factors: RiskFactor[] = [];

  // Factor 1: Blocker issues (0-30 points)
  const blockers = input.filteredIssues.filter(
    (i) => i.severity === "BLOCKER",
  ).length;
  factors.push({
    name: "Blocker Issues",
    score: Math.min(blockers * 15, 30),
    maxScore: 30,
    detail: `${blockers} blocker issue${blockers !== 1 ? "s" : ""} found`,
  });

  // Factor 2: Critical issues (0-25 points)
  const criticals = input.filteredIssues.filter(
    (i) => i.severity === "CRITICAL",
  ).length;
  factors.push({
    name: "Critical Issues",
    score: Math.min(criticals * 10, 25),
    maxScore: 25,
    detail: `${criticals} critical issue${criticals !== 1 ? "s" : ""} found`,
  });

  // Factor 3: Major issues (0-15 points)
  const majors = input.filteredIssues.filter(
    (i) => i.severity === "MAJOR",
  ).length;
  factors.push({
    name: "Major Issues",
    score: Math.min(majors * 3, 15),
    maxScore: 15,
    detail: `${majors} major issue${majors !== 1 ? "s" : ""} found`,
  });

  // Factor 4: Security/vulnerability issues (0-20 points)
  const securityIssues = input.allIssues.filter(
    (i) =>
      i.type === "VULNERABILITY" ||
      i.tags.some((t) => ["security", "cwe", "owasp"].includes(t)),
  ).length;
  factors.push({
    name: "Security Concerns",
    score: Math.min(securityIssues * 10, 20),
    maxScore: 20,
    detail: `${securityIssues} security-related issue${securityIssues !== 1 ? "s" : ""}`,
  });

  // Factor 5: Code complexity (0-10 points)
  if (input.complexity) {
    const hotspotCount = input.complexity.hotspots.length;
    factors.push({
      name: "Code Complexity",
      score: Math.min(hotspotCount * 5, 10),
      maxScore: 10,
      detail: `${hotspotCount} high-complexity file${hotspotCount !== 1 ? "s" : ""} (avg complexity: ${input.complexity.averageComplexity.toFixed(1)})`,
    });
  } else {
    factors.push({
      name: "Code Complexity",
      score: 0,
      maxScore: 10,
      detail: "No complexity data available",
    });
  }

  // Factor 6: Sensitive area amplification (0-15 points)
  if (input.sensitiveFileMultiplier && input.sensitiveFileMultiplier > 1) {
    const issueCount = input.filteredIssues.length;
    const sensitiveBoost = issueCount > 0 ? Math.min(issueCount * 5, 15) : 0;
    factors.push({
      name: "Sensitive Area",
      score: sensitiveBoost,
      maxScore: 15,
      detail: issueCount > 0
        ? `${issueCount} issue${issueCount !== 1 ? 's' : ''} found in sensitive code (severity amplified)`
        : "Sensitive area — no issues found",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.score, 0);
  const maxScore = factors.reduce((sum, f) => sum + f.maxScore, 0);

  // Severity floor: critical issues should never hide behind a LOW rating
  let level = scoreToLevel(score);
  if (blockers > 0 && levelRank(level) < levelRank("HIGH")) level = "HIGH";
  if (criticals > 0 && levelRank(level) < levelRank("MEDIUM")) level = "MEDIUM";

  return {
    level,
    score,
    maxScore,
    factors,
    summary: buildSummary(level, score, factors),
  };
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 60) return "CRITICAL";
  if (score >= 40) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function levelRank(level: RiskLevel): number {
  switch (level) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    case "LOW": return 1;
  }
}

function buildSummary(
  level: RiskLevel,
  score: number,
  factors: RiskFactor[],
): string {
  const topConcerns = factors
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((f) => f.name.toLowerCase());

  if (topConcerns.length === 0) {
    return `Risk: ${level} (${score} points). No significant risk factors detected.`;
  }

  return `Risk: ${level} (${score} points). Top concerns: ${topConcerns.join(", ")}.`;
}
