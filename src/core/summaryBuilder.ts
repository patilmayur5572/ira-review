import type { ReviewResult, SummaryMeta } from "../types/review.js";

/**
 * v3.1.6 PR summary — professional, scannable engineering report.
 *
 * Replaces the v3.1.5 "AI-slop" output (multi-line celebration block,
 * conversational greetings, redundant risk badges) with a single load-bearing
 * status line, one metrics row, and structured sections.
 *
 * Status dot precedence (worst signal wins across risk + AC gap):
 *   🔴  CRITICAL risk OR any BLOCKER finding
 *   🟠  HIGH risk
 *   🟡  MEDIUM risk OR an AC gap (incomplete coverage / failed validation)
 *   🟢  otherwise (LOW risk, no findings, no AC gap)
 *
 * The dot is computed once and reused everywhere — there is no separate
 * "All Clear" badge, no risk emoji on its own line, no "Safe to approve"
 * conversational block. A clean PR is signalled by 🟢 + "0 findings" + the
 * absence of follow-up sections.
 */
export function buildSummary(result: ReviewResult, meta: SummaryMeta = {}): string {
  const lines: string[] = [];

  const dot = computeStatusDot(result);
  const riskLevel = result.risk?.level ?? "LOW";
  const riskScore = result.risk?.score ?? 0;
  const riskMax = result.risk?.maxScore ?? 100;

  // ── Headline ────────────────────────────────────────────────────────────
  lines.push(`### ${dot} IRA Review · ${riskLevel} risk (${riskScore}/${riskMax})`);
  lines.push("");

  // ── Metrics line ────────────────────────────────────────────────────────
  // Single line, "·"-separated. Always shows files + findings; appends AC
  // coverage when a JIRA ticket is configured.
  const metrics: string[] = [];
  if (typeof result.filesReviewed === "number") {
    metrics.push(`${result.filesReviewed} file${result.filesReviewed === 1 ? "" : "s"} reviewed`);
  }
  metrics.push(`${result.comments.length} finding${result.comments.length === 1 ? "" : "s"}`);
  const acMetric = formatAcMetric(result);
  if (acMetric) metrics.push(acMetric);
  lines.push(metrics.join(" · "));
  lines.push("");

  // ── Findings ────────────────────────────────────────────────────────────
  if (result.comments.length > 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push("| File | Line | Rule | Severity |");
    lines.push("|---|---|---|---|");
    for (const c of result.comments) {
      lines.push(`| ${c.filePath} | ${c.line} | \`${c.rule}\` | ${c.severity} |`);
    }
    lines.push("");
  }

  // ── Acceptance Criteria coverage ────────────────────────────────────────
  if (result.requirementCompletion) {
    const rc = result.requirementCompletion;
    lines.push(`## Acceptance Criteria — ${rc.jiraKey} (${rc.completionPercentage}% covered, ${rc.metCriteria}/${rc.totalCriteria})`);
    lines.push("");
    for (const r of rc.requirements) {
      const icon = r.coverage === "full" ? "✅" : r.coverage === "partial" ? "🟡" : "❌";
      lines.push(`- ${icon} ${r.description}`);
      if (r.coverage !== "full") {
        lines.push(`  > ${r.evidence}`);
      }
    }
    if (rc.edgeCases.length > 0) {
      lines.push("");
      lines.push("### Edge cases not covered");
      for (const e of rc.edgeCases) {
        lines.push(`- ${e}`);
      }
    }
    if (rc.parseWarning) {
      lines.push("");
      lines.push(`> ⚠️ ${rc.parseWarning}`);
    }
    lines.push("");
  } else if (result.acceptanceValidation) {
    // Fallback: legacy AC validation path (no coverage %).
    const av = result.acceptanceValidation;
    const status = av.overallPass ? "all met" : "gaps found";
    lines.push(`## Acceptance Criteria — ${av.jiraKey} (${status})`);
    lines.push("");
    lines.push(`_${av.summary}_`);
    lines.push("");
    for (const c of av.criteria) {
      lines.push(`- ${c.met ? "✅" : "❌"} ${c.description}`);
    }
    lines.push("");
  }

  // ── Risk factor breakdown (Sonar mode only) ─────────────────────────────
  if (result.risk && result.reviewMode === "sonar" && result.risk.factors.length > 0) {
    lines.push("## Risk Factors");
    lines.push("");
    lines.push("| Factor | Score | Detail |");
    lines.push("|---|---|---|");
    for (const f of result.risk.factors) {
      lines.push(`| ${f.name} | ${f.score}/${f.maxScore} | ${f.detail} |`);
    }
    lines.push("");
  }

  // ── Complexity hotspots ─────────────────────────────────────────────────
  if (result.complexity && result.complexity.hotspots.length > 0) {
    lines.push("## Complexity Hotspots");
    lines.push("");
    lines.push("| File | Complexity | Cognitive |");
    lines.push("|---|---|---|");
    for (const h of result.complexity.hotspots.slice(0, 5)) {
      lines.push(`| ${h.filePath} | ${h.complexity} | ${h.cognitiveComplexity} |`);
    }
    lines.push("");
  }

  // ── Suggested ACs (ticket had none) ─────────────────────────────────────
  if (result.acGeneration && result.acGeneration.criteria.length > 0) {
    const ag = result.acGeneration;
    lines.push(`## Suggested Acceptance Criteria — ${ag.jiraKey} (${ag.totalCriteria} generated)`);
    lines.push("");
    const postedNote = ag.postedToJira
      ? `Posted to JIRA as a comment for the Product Owner to review.`
      : `Not posted to JIRA (suggestions stay in this summary only).`;
    lines.push(`> No acceptance criteria found on **${ag.jiraKey}**. IRA inferred the following from: ${ag.sources.join(", ")}. ${postedNote}`);
    lines.push("");
    for (const ac of ag.criteria) {
      lines.push(`**${ac.id}**`);
      lines.push(`- **Given** ${ac.given}`);
      lines.push(`- **When** ${ac.when}`);
      lines.push(`- **Then** ${ac.then}`);
      lines.push("");
    }
    if (ag.reviewHints && ag.reviewHints.length > 0) {
      lines.push(`### Questions for PO`);
      lines.push(`> IRA could not determine the following from the code. Answering these will strengthen the ACs above.`);
      lines.push("");
      for (const hint of ag.reviewHints) {
        lines.push(`- ${hint}`);
      }
      lines.push("");
    }
    if (ag.parseWarning) {
      lines.push(`> ⚠️ ${ag.parseWarning}`);
      lines.push("");
    }
  }

  // ── Generated test cases ────────────────────────────────────────────────
  if (result.testGeneration && result.testGeneration.testCases.length > 0) {
    const tg = result.testGeneration;
    const notTestableCount = tg.testCases.filter((tc) => tc.type === "not-testable").length;
    const testableCount = tg.totalCases - notTestableCount;
    const headerParts = [`${testableCount} test${testableCount !== 1 ? "s" : ""}`];
    if (tg.edgeCases > 0) headerParts.push(`${tg.edgeCases} advanced cases`);
    if (notTestableCount > 0) headerParts.push(`${notTestableCount} not-testable`);
    lines.push(`## Generated Test Cases (${headerParts.join(", ")})`);
    lines.push("");
    const byCriterion = new Map<string, typeof tg.testCases>();
    for (const tc of tg.testCases) {
      const existing = byCriterion.get(tc.criterion) ?? [];
      existing.push(tc);
      byCriterion.set(tc.criterion, existing);
    }
    for (const [criterion, cases] of byCriterion) {
      lines.push(`### ${criterion}`);
      for (const tc of cases) {
        const typeIcons: Record<string, string> = {
          "happy-path": "✅", "negative": "❌", "boundary-value": "🔲",
          "authorization": "🔑", "integration": "🔗", "state-workflow": "🔄",
          "data-integrity": "📊", "error-recovery": "🛡️", "not-testable": "⏭️",
        };
        const typeIcon = typeIcons[tc.type] ?? "✅";
        lines.push(`- ${typeIcon} ${tc.description} *(${tc.type})*`);
      }
      lines.push("");
    }
  }
  if (result.testGeneration?.parseWarning) {
    lines.push(`> ⚠️ ${result.testGeneration.parseWarning}`);
    lines.push("");
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  // Single italicised line. Mirrors `npm pkg --version · provider/model`.
  // Human approval reminder retained (compliance) but trimmed to one line.
  lines.push("---");
  lines.push(`_${formatFooter(meta)}_`);
  lines.push("");
  lines.push("_Human reviewer approval is still required before merge. IRA augments code review; it does not replace it._");

  return lines.join("\n");
}

/**
 * Compute the single load-bearing status dot used in the headline.
 * Worst signal across risk-level and AC-gap wins. Findings of severity
 * BLOCKER also escalate to 🔴 even if the calculated risk score lands in a
 * lower bucket (defensive: a missed BLOCKER should never be hidden behind
 * a green dot just because the risk model weighted it down).
 */
function computeStatusDot(result: ReviewResult): string {
  const riskRank = riskRankFor(result.risk?.level ?? "LOW");
  const acRank = acGapRank(result);
  const blockerRank = result.comments.some((c) => c.severity === "BLOCKER") ? 3 : 0;
  const worst = Math.max(riskRank, acRank, blockerRank);
  return ["🟢", "🟡", "🟠", "🔴"][worst] ?? "🟢";
}

function riskRankFor(level: string): 0 | 1 | 2 | 3 {
  switch (level) {
    case "CRITICAL": return 3;
    case "HIGH":     return 2;
    case "MEDIUM":   return 1;
    default:         return 0;
  }
}

/**
 * Rank for the AC gap signal — 0 = no gap, 1 = gap (elevates dot to at
 * least 🟡). We deliberately do NOT push beyond 🟡 here; an AC gap is a
 * "review needed" signal, not a "blocking" one. Risk + BLOCKER findings
 * remain the only paths to 🟠/🔴.
 */
function acGapRank(result: ReviewResult): 0 | 1 {
  if (result.requirementCompletion && result.requirementCompletion.completionPercentage < 100) return 1;
  if (result.acceptanceValidation && !result.acceptanceValidation.overallPass) return 1;
  return 0;
}

/**
 * Build the AC fragment of the metrics line. Mutually exclusive cases:
 *   • requirementCompletion → "CBBT-86165: 3/5 ACs met"
 *   • acceptanceValidation  → "CBBT-86165: ACs met" / "CBBT-86165: AC gaps"
 *   • acGeneration          → "CBBT-86165: 4 ACs suggested"
 *   • none                  → null (omit segment)
 */
function formatAcMetric(result: ReviewResult): string | null {
  if (result.requirementCompletion) {
    const rc = result.requirementCompletion;
    return `${rc.jiraKey}: ${rc.metCriteria}/${rc.totalCriteria} ACs met`;
  }
  if (result.acceptanceValidation) {
    const av = result.acceptanceValidation;
    return `${av.jiraKey}: ${av.overallPass ? "ACs met" : "AC gaps"}`;
  }
  if (result.acGeneration && result.acGeneration.criteria.length > 0) {
    const ag = result.acGeneration;
    return `${ag.jiraKey}: ${ag.totalCriteria} AC${ag.totalCriteria === 1 ? "" : "s"} suggested`;
  }
  return null;
}

function formatFooter(meta: SummaryMeta): string {
  const parts: string[] = [];
  parts.push(`ira-review${meta.version ? ` ${meta.version}` : ""}`);
  if (meta.aiProvider || meta.aiModel) {
    parts.push([meta.aiProvider, meta.aiModel].filter(Boolean).join("/"));
  }
  return parts.join(" · ");
}
