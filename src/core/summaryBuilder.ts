import type { ReviewResult } from "../types/review.js";

export function buildSummary(result: ReviewResult): string {
  const lines: string[] = [];

  lines.push("# 🔍 IRA Review Summary");
  lines.push("");

  // Risk score
  if (result.risk) {
    const emoji =
      result.risk.level === "CRITICAL"
        ? "🔴"
        : result.risk.level === "HIGH"
          ? "🟠"
          : result.risk.level === "MEDIUM"
            ? "🟡"
            : "🟢";

    lines.push(
      `## ${emoji} Risk: ${result.risk.level} (${result.risk.score}/${result.risk.maxScore})`,
    );
    lines.push("");

    // Only show detailed factor table in Sonar mode — factors are Sonar-driven
    if (result.reviewMode === "sonar") {
      lines.push("| Factor | Score | Detail |");
      lines.push("|---|---|---|");
      for (const f of result.risk.factors) {
        lines.push(`| ${f.name} | ${f.score}/${f.maxScore} | ${f.detail} |`);
      }
      lines.push("");
    }
  }

  // All-clear celebration — only when:
  //   • zero findings made it through filtering, AND
  //   • no JIRA AC gap exists (incomplete coverage or failed AC validation
  //     should NEVER read "safe to approve"; the requirements section below
  //     will surface the gap visibly instead).
  // Goal: give reviewers a confident, specific signal that automated review
  // passed, while making it obvious that human approval is still required.
  const acGapExists =
    (result.requirementCompletion && result.requirementCompletion.completionPercentage < 100) ||
    (result.acceptanceValidation && !result.acceptanceValidation.overallPass);
  if (result.comments.length === 0 && !acGapExists) {
    const fw = result.framework ?? "your stack";
    // AC line — mutually exclusive cases:
    //   • requirementCompletion: ticket HAD ACs and they were validated for coverage %
    //   • acceptanceValidation:  ticket HAD ACs (legacy path, no coverage %)
    //   • acGeneration:          ticket had NO ACs, IRA generated suggestions and posted to JIRA
    //   • all null:              no JIRA ticket configured, or JIRA call soft-failed → omit the line
    const acLine = result.requirementCompletion
      ? `Acceptance criteria for **${result.requirementCompletion.jiraKey}**: **${result.requirementCompletion.completionPercentage}% covered** (${result.requirementCompletion.metCriteria}/${result.requirementCompletion.totalCriteria}).`
      : result.acceptanceValidation
        ? `Acceptance criteria for **${result.acceptanceValidation.jiraKey}**: ${result.acceptanceValidation.overallPass ? "**all met** ✅" : "**partially met** — see the JIRA section above"}.`
        : result.acGeneration && result.acGeneration.criteria.length > 0
          ? (result.acGeneration.postedToJira
              ? `📝 No acceptance criteria found on **${result.acGeneration.jiraKey}** — IRA generated **${result.acGeneration.totalCriteria} suggested AC${result.acGeneration.totalCriteria === 1 ? "" : "s"}** and posted them as a comment on the JIRA ticket for the Product Owner / requirement author to review and refine.`
              : `📝 No acceptance criteria found on **${result.acGeneration.jiraKey}** — IRA generated **${result.acGeneration.totalCriteria} suggested AC${result.acGeneration.totalCriteria === 1 ? "" : "s"}** (see the Suggested Acceptance Criteria section below).`)
          : null;

    lines.push("## ✅ All Clear — No Issues Found");
    lines.push("");
    lines.push(`> 🎉 **Nice work on PR #${result.pullRequestId}!**`);
    lines.push(`>`);
    lines.push(`> IRA scanned every changed file across **${fw}** and didn't surface a single concern.`);
    if (acLine) {
      lines.push(`>`);
      lines.push(`> ${acLine}`);
    }
    if (result.risk) {
      lines.push(`>`);
      lines.push(`> Risk score: **${result.risk.score}/${result.risk.maxScore}** (${result.risk.level}).`);
    }
    lines.push(`>`);
    lines.push(`> ✅ **Safe to approve from an automated-review standpoint.**`);
    lines.push(`>`);
    lines.push(`> 👥 **Human reviewer approval is still required before merge.** IRA augments your code review process — it doesn't replace it. Please ensure your team's review and approval requirements have been met before merging.`);
    lines.push("");
  }

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Review mode | ${result.reviewMode === "standalone" ? "AI-only" : "Sonar + AI"} |`);
  lines.push(`| Total issues | ${result.totalIssues} |`);
  lines.push(`| Reviewed (AI) | ${result.reviewedIssues} |`);
  lines.push(
    `| Framework | ${result.framework ?? "not detected"} |`,
  );
  lines.push("");

  // Complexity
  if (result.complexity && result.complexity.hotspots.length > 0) {
    lines.push("## 🧠 Complexity Hotspots");
    lines.push("");
    lines.push("| File | Complexity | Cognitive |");
    lines.push("|---|---|---|");
    for (const h of result.complexity.hotspots.slice(0, 5)) {
      lines.push(`| ${h.filePath} | ${h.complexity} | ${h.cognitiveComplexity} |`);
    }
    lines.push("");
  }

  // Requirement completion
  if (result.requirementCompletion) {
    const rc = result.requirementCompletion;
    const pctIcon = rc.completionPercentage === 100 ? "✅" : rc.completionPercentage >= 50 ? "🟡" : "🔴";
    lines.push(`## ${pctIcon} Requirements: ${rc.jiraKey} - ${rc.completionPercentage}% Complete (${rc.metCriteria}/${rc.totalCriteria})`);
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
      lines.push("### ⚠️ Edge Cases Not Covered");
      for (const e of rc.edgeCases) {
        lines.push(`- ${e}`);
      }
    }
    if (rc.parseWarning) {
      lines.push("");
      lines.push(`> ⚠️ **Warning:** ${rc.parseWarning}`);
    }
    lines.push("");
  } else if (result.acceptanceValidation) {
    // Fallback to simple AC validation if requirement tracking not available
    const av = result.acceptanceValidation;
    const icon = av.overallPass ? "✅" : "❌";
    lines.push(`## ${icon} JIRA: ${av.jiraKey} - ${av.summary}`);
    lines.push("");
    for (const c of av.criteria) {
      lines.push(`- ${c.met ? "✅" : "❌"} ${c.description}`);
    }
    lines.push("");
  }

  // Generated acceptance criteria (when ticket had no ACs)
  if (result.acGeneration && result.acGeneration.criteria.length > 0) {
    const ag = result.acGeneration;
    lines.push(`## 📝 Suggested Acceptance Criteria (${ag.totalCriteria} generated)`);
    lines.push("");
    lines.push(`> No acceptance criteria found in ${ag.jiraKey}. IRA inferred the following from: ${ag.sources.join(", ")}.`);
    lines.push("");
    for (const ac of ag.criteria) {
      lines.push(`**${ac.id}:**`);
      lines.push(`- **Given** ${ac.given}`);
      lines.push(`- **When** ${ac.when}`);
      lines.push(`- **Then** ${ac.then}`);
      lines.push("");
    }
    if (ag.reviewHints && ag.reviewHints.length > 0) {
      lines.push(`### ❓ Questions for PO`);
      lines.push(`> IRA could not determine the following from the code. Answering these will strengthen the ACs above:`);
      lines.push("");
      for (const hint of ag.reviewHints) {
        lines.push(`- ${hint}`);
      }
      lines.push("");
    }
    if (ag.parseWarning) {
      lines.push(`> ⚠️ **Warning:** ${ag.parseWarning}`);
      lines.push("");
    }
  }

  // Generated test cases
  if (result.testGeneration && result.testGeneration.testCases.length > 0) {
    const tg = result.testGeneration;
    const notTestableCount = tg.testCases.filter(tc => tc.type === "not-testable").length;
    const testableCount = tg.totalCases - notTestableCount;
    const headerParts = [`${testableCount} test${testableCount !== 1 ? "s" : ""}`];
    if (tg.edgeCases > 0) headerParts.push(`${tg.edgeCases} advanced cases`);
    if (notTestableCount > 0) headerParts.push(`${notTestableCount} not-testable`);
    lines.push(`## 🧪 Generated Test Cases (${headerParts.join(", ")})`);
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
    lines.push(`> ⚠️ **Warning:** ${result.testGeneration.parseWarning}`);
    lines.push("");
  }

  // Issue breakdown
  if (result.comments.length > 0) {
    lines.push("## Issues Reviewed");
    lines.push("");
    lines.push("| File | Line | Rule | Severity |");
    lines.push("|---|---|---|---|");
    for (const c of result.comments) {
      lines.push(
        `| ${c.filePath} | ${c.line} | \`${c.rule}\` | ${c.severity} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by [ira-review](https://www.npmjs.com/package/ira-review)*");

  return lines.join("\n");
}
