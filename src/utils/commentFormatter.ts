/**
 * Shared review-comment formatter used by every SCM provider (Bitbucket Cloud,
 * Bitbucket Server, GitHub) and by the VS Code extension.
 *
 * Two styles are supported:
 *   - "compact" (default): severity-first header, one-sentence message, just the
 *     code fix in a fence, optional <details> for explanation+impact.
 *   - "detailed": legacy IRA format with full Explanation / Impact / Suggested Fix.
 *
 * INVARIANT: every output must start with the dedup marker
 *   <!-- ira:file=…;line=…;rule=… -->
 * because CommentTracker keys off it to skip already-posted findings.
 */

import type { ReviewComment } from "../types/review.js";
import type { CommentStyle } from "../types/config.js";

export interface CommentFormatterInput {
  filePath: string;
  line: number;
  rule: string;
  severity: string;
  message: string;
  aiReview: {
    explanation: string;
    impact: string;
    suggestedFix: string;
  };
}

export interface FormatOptions {
  style?: CommentStyle;
}

/** Severity → emoji map. Keep concise — these render inline in the header line. */
const SEVERITY_EMOJI: Record<string, string> = {
  BLOCKER: "🛑",
  CRITICAL: "🚨",
  MAJOR: "⚠️",
  MINOR: "💡",
  INFO: "ℹ️",
};

/** Build the hidden HTML marker that CommentTracker uses to dedup re-runs. */
export function buildDedupMarker(filePath: string, line: number, rule: string): string {
  return `<!-- ira:file=${filePath};line=${line};rule=${rule} -->`;
}

/** Public API: format a review comment for posting to any SCM. */
export function formatReviewComment(
  comment: CommentFormatterInput | ReviewComment,
  opts: FormatOptions = {},
): string {
  const style = opts.style ?? "compact";
  return style === "detailed" ? formatDetailed(comment) : formatCompact(comment);
}

/**
 * Compact format — severity-first, scannable, code-only fix block.
 * Severity-aware verbosity:
 *   MINOR              → header + 1 sentence (no code, no details block)
 *   MAJOR              → compact pattern with <details> for explanation/impact
 *   CRITICAL / BLOCKER → expanded (not collapsed) — these need to be seen at a glance
 */
function formatCompact(comment: CommentFormatterInput): string {
  const sev = (comment.severity ?? "MAJOR").toUpperCase();
  const emoji = SEVERITY_EMOJI[sev] ?? "⚠️";
  const marker = buildDedupMarker(comment.filePath, comment.line, comment.rule);
  const location = comment.line > 0 ? "" : `\n_File:_ \`${comment.filePath}\``;

  const header = `${emoji} **${sev}** • \`${comment.rule}\``;
  const oneSentence = comment.message.trim();

  // MINOR: header + sentence only, no fix code, no details — keep noise low.
  if (sev === "MINOR") {
    return [marker, header + location, "", `> ${oneSentence}`].join("\n");
  }

  const fix = (comment.aiReview.suggestedFix ?? "").trim();
  const fixBlock = fix ? ["", "```", fix, "```"] : [];

  // CRITICAL / BLOCKER: expanded explanation+impact (not collapsed) for visibility.
  if (sev === "CRITICAL" || sev === "BLOCKER") {
    const expanded = [
      `**Why:** ${comment.aiReview.explanation}`,
      "",
      `**Impact:** ${comment.aiReview.impact}`,
    ];
    return [
      marker,
      header + location,
      "",
      `> ${oneSentence}`,
      ...fixBlock,
      "",
      ...expanded,
    ].join("\n");
  }

  // MAJOR (default): compact + collapsed <details> for the long-form context.
  const details = [
    "",
    "<details><summary>Why this matters</summary>",
    "",
    comment.aiReview.explanation,
    "",
    `**Impact:** ${comment.aiReview.impact}`,
    "",
    "</details>",
  ];

  return [
    marker,
    header + location,
    "",
    `> ${oneSentence}`,
    ...fixBlock,
    ...details,
  ].join("\n");
}

/** Legacy detailed format — preserved verbatim so users can opt back in. */
function formatDetailed(comment: CommentFormatterInput): string {
  const { aiReview } = comment;
  const location = comment.line > 0 ? "" : `\n**File:** \`${comment.filePath}\`\n`;
  const marker = buildDedupMarker(comment.filePath, comment.line, comment.rule);

  return [
    marker,
    `🔍 **IRA Review** - \`${comment.rule}\` (${comment.severity})`,
    location,
    `> ${comment.message}`,
    "",
    `**Explanation:** ${aiReview.explanation}`,
    "",
    `**Impact:** ${aiReview.impact}`,
    "",
    `**Suggested Fix:**`,
    aiReview.suggestedFix,
  ].join("\n");
}
