import type { SonarIssue } from "../types/sonar.js";
import type { ComplexityReport } from "../types/risk.js";
import type { RiskReport, RiskFactor, RiskLevel } from "../types/risk.js";

interface RiskInput {
  allIssues: SonarIssue[];
  filteredIssues: SonarIssue[];
  complexity: ComplexityReport | null;
  filesChanged: number;
}

export function calculateRisk(input: RiskInput): RiskReport {
  const factors: RiskFactor[] = [];

  // Factor 1: Blocker issues (0-30 points)
  const blockers = input.filteredIssues.filter(
    (i) => i.severity === "BLOCKER",
  ).length;
  factors.push({
    name: "Blocker Issues",
    score: Math.min(blockers * 10, 30),
    maxScore: 30,
    detail: `${blockers} blocker issue${blockers !== 1 ? "s" : ""} found`,
  });

  // Factor 2: Critical issues (0-20 points)
  const criticals = input.filteredIssues.filter(
    (i) => i.severity === "CRITICAL",
  ).length;
  factors.push({
    name: "Critical Issues",
    score: Math.min(criticals * 5, 20),
    maxScore: 20,
    detail: `${criticals} critical issue${criticals !== 1 ? "s" : ""} found`,
  });

  // Factor 3: Total issue density (0-15 points)
  const density =
    input.filesChanged > 0 ? input.allIssues.length / input.filesChanged : 0;
  factors.push({
    name: "Issue Density",
    score: Math.min(Math.round(density * 5), 15),
    maxScore: 15,
    detail: `${density.toFixed(1)} issues per file changed`,
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

  // Factor 5: Code complexity (0-15 points)
  if (input.complexity) {
    const hotspotCount = input.complexity.hotspots.length;
    factors.push({
      name: "Code Complexity",
      score: Math.min(hotspotCount * 5, 15),
      maxScore: 15,
      detail: `${hotspotCount} high-complexity file${hotspotCount !== 1 ? "s" : ""} (avg complexity: ${input.complexity.averageComplexity.toFixed(1)})`,
    });
  } else {
    factors.push({
      name: "Code Complexity",
      score: 0,
      maxScore: 15,
      detail: "No complexity data available",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.score, 0);
  const maxScore = factors.reduce((sum, f) => sum + f.maxScore, 0);
  const level = scoreToLevel(score);

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
