/**
 * IRA - Intelligent Review Assistant
 * Review Results Webview Panel
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { ReviewResult, ReviewComment } from 'ira-review';

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let currentPanel: vscode.WebviewPanel | undefined;
let currentMessageDisposable: vscode.Disposable | undefined;

export interface PostToSCMCallback {
  /** Post a single comment to the PR. Return true on success. */
  postComment: (comment: ReviewComment) => Promise<boolean>;
  /**
   * Post a top-level (non-inline) markdown summary comment to the PR.
   * Optional - when provided, enables the "Post AC Summary to <SCM>" button
   * in the webview. Return true on success.
   */
  postSummary?: (markdown: string) => Promise<boolean>;
  /** Get dedup keys of already-posted IRA comments. */
  getExistingKeys: () => Promise<Set<string>>;
  /** Build a dedup key for a comment. */
  dedupKey: (comment: ReviewComment) => string;
  /** Display label for the SCM (e.g. "GitHub", "Bitbucket"). */
  scmLabel: string;
}

/**
 * Format an AC validation result as a Markdown summary suitable for posting
 * as a top-level PR comment on any SCM (GitHub, Bitbucket Cloud, Bitbucket Server).
 *
 * Includes an HTML comment marker so subsequent reviews can detect and skip
 * duplicate AC summaries.
 *
 * Exported for unit testing.
 */
export function formatACValidationMarkdown(
  av: NonNullable<ReviewResult['acceptanceValidation']>,
): string {
  const criteria = av.criteria || [];
  const met = criteria.filter(c => c.met).length;
  const total = criteria.length;
  const allMet = met === total && total > 0;
  const isBug = av.issueType === 'bug';

  const heading = isBug ? 'Bug Fix Validation' : 'Acceptance Criteria';
  const summaryLine = isBug
    ? `**${met}/${total} checks passed**${allMet ? ' ✅' : ''}`
    : `**${met}/${total} ACs met**${allMet ? ' ✅' : ''}`;

  const lines: string[] = [];
  lines.push(`<!-- ira:ac-summary;jiraKey=${av.jiraKey} -->`);
  lines.push(`## 🔍 IRA - ${heading} (${av.jiraKey})`);
  lines.push('');
  lines.push(summaryLine);
  lines.push('');

  for (const c of criteria) {
    let desc = c.description;
    // Balance unclosed parentheses from AI responses (mirrors webview behaviour)
    const opens = (desc.match(/\(/g) || []).length;
    const closes = (desc.match(/\)/g) || []).length;
    if (opens > closes) desc += ')'.repeat(opens - closes);
    const icon = c.met ? '✅' : '❌';
    lines.push(`- ${icon} ${desc}`);
    if (c.evidence && c.evidence.trim().length > 0) {
      lines.push(`  - _Evidence:_ ${c.evidence}`);
    }
  }

  return lines.join('\n');
}

export function showReviewResultsPanel(
  result: ReviewResult,
  onPostToJira?: () => Promise<boolean>,
  onPostToSCM?: PostToSCMCallback,
): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'iraReviewResults',
      'IRA Review',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    currentPanel.onDidDispose(() => { currentPanel = undefined; currentMessageDisposable = undefined; });
  }

  // Dispose previous message listener to avoid stacking handlers on panel reuse
  currentMessageDisposable?.dispose();

  const canPostACSummary = !!onPostToSCM?.postSummary && !!result.acceptanceValidation;
  currentPanel.webview.html = buildHtml(result, onPostToSCM?.scmLabel, canPostACSummary);

  currentMessageDisposable = currentPanel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'postToJira' && onPostToJira) {
      const success = await onPostToJira();
      currentPanel?.webview.postMessage({
        type: 'postResult',
        success,
      });
    }
    if (msg.type === 'postACSummaryToSCM' && onPostToSCM?.postSummary && result.acceptanceValidation) {
      let success = false;
      try {
        const markdown = formatACValidationMarkdown(result.acceptanceValidation);
        success = await onPostToSCM.postSummary(markdown);
      } catch {
        success = false;
      }
      currentPanel?.webview.postMessage({
        type: 'postACSummaryResult',
        success,
      });
    }
    if (msg.type === 'postAllToSCM' && onPostToSCM) {
      const selectedIndices: number[] = msg.indices;
      const comments = result.comments;

      // Dedup: fetch already-posted comments
      let alreadyPosted = new Set<string>();
      try {
        alreadyPosted = await onPostToSCM.getExistingKeys();
      } catch {
        // Dedup check failed — continue without it
      }

      let posted = 0;
      let skipped = 0;
      let failed = 0;
      const total = selectedIndices.length;

      for (let i = 0; i < total; i++) {
        const idx = selectedIndices[i];
        const comment = comments[idx];
        if (!comment) { failed++; continue; }

        const key = onPostToSCM.dedupKey(comment);
        if (alreadyPosted.has(key)) {
          skipped++;
          currentPanel?.webview.postMessage({
            type: 'postProgress',
            commentIdx: idx,
            current: i + 1,
            total,
            status: 'skipped',
          });
          continue;
        }

        try {
          const success = await onPostToSCM.postComment(comment);
          if (success) {
            posted++;
            currentPanel?.webview.postMessage({
              type: 'postProgress',
              commentIdx: idx,
              current: i + 1,
              total,
              status: 'posted',
            });
          } else {
            failed++;
            currentPanel?.webview.postMessage({
              type: 'postProgress',
              commentIdx: idx,
              current: i + 1,
              total,
              status: 'failed',
            });
          }
        } catch {
          failed++;
          currentPanel?.webview.postMessage({
            type: 'postProgress',
            commentIdx: idx,
            current: i + 1,
            total,
            status: 'failed',
          });
        }
      }

      currentPanel?.webview.postMessage({
        type: 'postAllComplete',
        posted,
        skipped,
        failed,
      });
    }
  });
}

/**
 * Build the webview HTML. Exported for unit testing.
 *
 * @param canPostACSummary - When true AND `result.acceptanceValidation` exists,
 *   renders a "Post AC Summary to <scmLabel>" button below the AC list.
 */
export function buildHtml(
  result: ReviewResult,
  scmLabel?: string,
  canPostACSummary: boolean = false,
): string {
  const nonce = getNonce();
  const hasIssues = result.totalIssues > 0;
  const hasSCM = !!scmLabel && hasIssues;
  const showACPostButton = canPostACSummary && !!scmLabel && !!result.acceptanceValidation;

  const issuesByLevel = {
    blocker: result.comments.filter(c => c.severity === 'BLOCKER').length,
    critical: result.comments.filter(c => c.severity === 'CRITICAL').length,
    major: result.comments.filter(c => c.severity === 'MAJOR').length,
    minor: result.comments.filter(c => c.severity === 'MINOR').length,
  };

  // Code issues section
  let codeSection = '<div class="section"><div class="section-title">Code Review</div><div class="card">';
  if (!hasIssues) {
    codeSection += '<div class="clean">Clean code - nothing to flag</div>';
  } else {
    const parts: string[] = [];
    if (issuesByLevel.blocker > 0) parts.push(`${issuesByLevel.blocker} Blocker`);
    if (issuesByLevel.critical > 0) parts.push(`${issuesByLevel.critical} Critical`);
    if (issuesByLevel.major > 0) parts.push(`${issuesByLevel.major} Major`);
    if (issuesByLevel.minor > 0) parts.push(`${issuesByLevel.minor} Minor`);
    codeSection += `<div class="summary">${result.totalIssues} issue${result.totalIssues !== 1 ? 's' : ''} found (${parts.join(', ')})</div>`;

    // Select All toggle (only when SCM posting is available)
    if (hasSCM) {
      codeSection += '<div class="select-all-row"><label><input type="checkbox" id="selectAll" checked /> Select All</label></div>';
    }

    codeSection += '<div class="issues-list">';
    for (let i = 0; i < result.comments.length; i++) {
      const comment = result.comments[i];
      const icon = comment.severity === 'BLOCKER' || comment.severity === 'CRITICAL' ? '🔴' : comment.severity === 'MAJOR' ? '🟠' : '🟡';
      const checkbox = hasSCM ? `<input type="checkbox" class="issue-cb" data-idx="${i}" checked /> ` : '';
      codeSection += `<div class="issue-row" data-idx="${i}">${checkbox}${icon} <span class="severity">${esc(comment.severity)}</span> <span class="issue-msg">${esc(comment.message)}</span><span class="post-badge" data-badge-idx="${i}"></span><div class="issue-file">${esc(comment.filePath)}:${comment.line}</div></div>`;
    }
    codeSection += '</div>';
  }
  codeSection += '</div></div>';

  // AC Validation section
  let acSection = '';
  if (result.acceptanceValidation) {
    const av = result.acceptanceValidation;
    const criteria = av.criteria || [];
    const met = criteria.filter(c => c.met).length;
    const total = criteria.length;
    const allMet = met === total && total > 0;

    const isBug = av.issueType === 'bug';
    const sectionLabel = isBug ? 'Bug Fix Validation' : 'Acceptance Criteria';
    acSection += '<div class="section"><div class="section-title">' + esc(sectionLabel) + ' - ' + esc(av.jiraKey) + '</div><div class="card">';
    const summaryText = isBug
      ? `${met}/${total} checks passed${allMet ? ' ✅' : ''}`
      : `${met}/${total} ACs met${allMet ? ' ✅' : ''}`;
    acSection += `<div class="ac-summary ${allMet ? 'pass' : 'gap'}">${summaryText}</div>`;
    acSection += '<div class="ac-list">';
    for (const c of criteria) {
      let desc = c.description;
      // Balance unclosed parentheses from AI responses
      const opens = (desc.match(/\(/g) || []).length;
      const closes = (desc.match(/\)/g) || []).length;
      if (opens > closes) desc += ')'.repeat(opens - closes);
      acSection += `<div class="ac-row">${c.met ? '✅' : '❌'} ${esc(desc)}</div>`;
    }
    acSection += '</div>';
    if (showACPostButton) {
      acSection += `<div class="cta"><button id="postACSummaryToSCM" class="btn">Post AC Summary to ${esc(scmLabel!)}</button></div>`;
    }
    acSection += '</div></div>';
  }

  // Generated ACs section
  let acGenSection = '';
  if (result.acGeneration) {
    const ag = result.acGeneration;
    acGenSection += '<div class="section"><div class="section-title">Suggested Acceptance Criteria - ' + esc(ag.jiraKey) + '</div><div class="card">';
    acGenSection += `<div class="ac-summary">No ACs on this ticket. ${ag.totalCriteria} suggested from code analysis:</div>`;
    acGenSection += '<div class="ac-list">';
    for (const ac of ag.criteria) {
      acGenSection += `<div class="ac-row"><strong>${esc(ac.id)}:</strong><div class="gherkin">Given ${esc(ac.given)}<br>When ${esc(ac.when)}<br>Then ${esc(ac.then)}</div></div>`;
    }
    acGenSection += '</div>';
    if (ag.reviewHints.length > 0) {
      acGenSection += '<div class="hints"><div class="hints-title">Worth discussing:</div>';
      for (const hint of ag.reviewHints) {
        acGenSection += `<div class="hint-row">- ${esc(hint)}</div>`;
      }
      acGenSection += '</div>';
    }
    acGenSection += '<div class="cta"><button id="postToJira" class="btn">Post to JIRA</button></div>';
    acGenSection += '</div></div>';
  }

  // Requirement completion section
  let completionSection = '';
  if (result.requirementCompletion) {
    const pct = result.requirementCompletion.completionPercentage;
    completionSection = `<div class="section"><div class="section-title">Requirement Completion</div><div class="card"><div class="completion">${pct}%</div></div></div>`;
  }

  // Risk section
  let riskSection = '';
  if (result.risk) {
    const riskClass = result.risk.level === 'LOW' ? 'low' : result.risk.level === 'MEDIUM' ? 'medium' : 'high';
    riskSection = `<div class="section"><div class="section-title">Risk Score</div><div class="card"><div class="risk ${riskClass}">${result.risk.score}/100 (${esc(result.risk.level)})</div></div></div>`;
  }

  // Sticky footer for bulk SCM posting
  let stickyFooter = '';
  if (hasSCM) {
    stickyFooter = `<div id="stickyFooter" class="sticky-footer">
      <span id="selectionCount">${result.totalIssues} of ${result.totalIssues} selected</span>
      <button id="postAllToSCM" class="btn btn-scm">Post ${result.totalIssues} to ${esc(scmLabel!)} ▸</button>
    </div>`;
  }

  return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; margin: 0; max-width: 800px; ${hasSCM ? 'padding-bottom: 70px;' : ''} }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 16px; }
  .clean { color: #4ade80; font-size: 14px; }
  .summary { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
  .select-all-row { font-size: 13px; margin-bottom: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .select-all-row label { cursor: pointer; }
  .issues-list { font-size: 13px; }
  .issue-row { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 4px; }
  .issue-row:last-child { border-bottom: none; }
  .issue-cb { margin-right: 4px; cursor: pointer; vertical-align: middle; }
  .severity { font-weight: bold; margin-right: 8px; }
  .issue-file { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; width: 100%; padding-left: ${hasSCM ? '22px' : '0'}; }
  .post-badge { font-size: 11px; margin-left: 6px; }
  .post-badge.posted { color: #4ade80; }
  .post-badge.skipped { color: var(--vscode-descriptionForeground); }
  .post-badge.failed { color: #ef4444; }
  .ac-summary { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
  .ac-summary.pass { color: #4ade80; }
  .ac-summary.gap { color: #f97316; }
  .ac-list { font-size: 13px; }
  .ac-row { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .ac-row:last-child { border-bottom: none; }
  .gherkin { margin-top: 4px; font-size: 12px; color: var(--vscode-descriptionForeground); padding-left: 12px; }
  .hints { margin-top: 12px; }
  .hints-title { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
  .hint-row { font-size: 12px; color: var(--vscode-descriptionForeground); padding: 2px 0; }
  .completion { font-size: 24px; font-weight: bold; text-align: center; }
  .risk { font-size: 16px; font-weight: bold; }
  .risk.low { color: #4ade80; }
  .risk.medium { color: #f97316; }
  .risk.high { color: #ef4444; }
  .cta { margin-top: 16px; text-align: center; }
  .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 20px; border-radius: 4px; font-size: 13px; cursor: pointer; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn.posted { background: #4ade80; color: #000; }
  .sticky-footer { position: fixed; bottom: 0; left: 0; right: 0; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
  .btn-scm { padding: 8px 24px; font-weight: 500; }
  .sticky-footer .complete-summary { font-size: 13px; }
</style></head><body>
${codeSection}
${acSection}
${acGenSection}
${completionSection}
${riskSection}
${stickyFooter}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // --- JIRA button (existing) ---
  const jiraBtn = document.getElementById('postToJira');
  if (jiraBtn) {
    jiraBtn.addEventListener('click', () => {
      jiraBtn.disabled = true;
      jiraBtn.textContent = 'Posting...';
      vscode.postMessage({ type: 'postToJira' });
    });
  }

  // --- AC summary post-to-SCM button ---
  const acSummaryBtn = document.getElementById('postACSummaryToSCM');
  if (acSummaryBtn) {
    acSummaryBtn.addEventListener('click', () => {
      acSummaryBtn.disabled = true;
      acSummaryBtn.textContent = 'Posting...';
      vscode.postMessage({ type: 'postACSummaryToSCM' });
    });
  }

  // --- SCM bulk post ---
  const scmBtn = document.getElementById('postAllToSCM');
  const selectAllCb = document.getElementById('selectAll');
  const selectionCountEl = document.getElementById('selectionCount');
  const totalIssues = ${result.totalIssues};
  const scmLabel = ${scmLabel ? `'${esc(scmLabel)}'` : 'null'};

  function getCheckedIndices() {
    const cbs = document.querySelectorAll('.issue-cb');
    const indices = [];
    cbs.forEach(cb => { if (cb.checked) indices.push(parseInt(cb.dataset.idx)); });
    return indices;
  }

  function updateFooter() {
    if (!scmBtn || !selectionCountEl) return;
    const checked = getCheckedIndices();
    const count = checked.length;
    selectionCountEl.textContent = count + ' of ' + totalIssues + ' selected';
    if (count === 0) {
      scmBtn.disabled = true;
      scmBtn.textContent = 'Post to ' + scmLabel;
    } else {
      scmBtn.disabled = false;
      scmBtn.textContent = 'Post ' + count + ' to ' + scmLabel + ' ▸';
    }
    // Update Select All checkbox state
    if (selectAllCb) {
      selectAllCb.checked = count === totalIssues;
      selectAllCb.indeterminate = count > 0 && count < totalIssues;
    }
  }

  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      const cbs = document.querySelectorAll('.issue-cb');
      cbs.forEach(cb => { cb.checked = selectAllCb.checked; });
      updateFooter();
    });
  }

  document.querySelectorAll('.issue-cb').forEach(cb => {
    cb.addEventListener('change', updateFooter);
  });

  if (scmBtn) {
    scmBtn.addEventListener('click', () => {
      const indices = getCheckedIndices();
      if (indices.length === 0) return;
      scmBtn.disabled = true;
      scmBtn.textContent = 'Posting 0/' + indices.length + '...';
      // Disable checkboxes during posting
      document.querySelectorAll('.issue-cb').forEach(cb => { cb.disabled = true; });
      if (selectAllCb) selectAllCb.disabled = true;
      vscode.postMessage({ type: 'postAllToSCM', indices: indices });
    });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    // JIRA post result
    if (msg.type === 'postResult' && jiraBtn) {
      if (msg.success) {
        jiraBtn.textContent = 'Posted to JIRA';
        jiraBtn.classList.add('posted');
      } else {
        jiraBtn.textContent = 'Failed - try again';
        jiraBtn.disabled = false;
      }
    }
    // AC summary post-to-SCM result
    if (msg.type === 'postACSummaryResult' && acSummaryBtn) {
      if (msg.success) {
        acSummaryBtn.textContent = 'Posted to ' + (scmLabel || 'SCM');
        acSummaryBtn.classList.add('posted');
      } else {
        acSummaryBtn.textContent = 'Failed - try again';
        acSummaryBtn.disabled = false;
      }
    }
    // SCM per-comment progress
    if (msg.type === 'postProgress' && scmBtn) {
      scmBtn.textContent = 'Posting ' + msg.current + '/' + msg.total + '...';
      const badge = document.querySelector('[data-badge-idx="' + msg.commentIdx + '"]');
      if (badge) {
        badge.className = 'post-badge ' + msg.status;
        badge.textContent = msg.status === 'posted' ? '✅' : msg.status === 'skipped' ? '⏭ exists' : '❌';
      }
    }
    // SCM bulk complete
    if (msg.type === 'postAllComplete') {
      const parts = [];
      if (msg.posted > 0) parts.push(msg.posted + ' posted');
      if (msg.skipped > 0) parts.push(msg.skipped + ' already existed');
      if (msg.failed > 0) parts.push(msg.failed + ' failed');
      if (scmBtn) {
        scmBtn.textContent = parts.join(', ');
        if (msg.failed === 0) {
          scmBtn.classList.add('posted');
        } else {
          scmBtn.disabled = false;
        }
      }
      if (selectionCountEl) {
        selectionCountEl.textContent = '';
      }
    }
  });
</script>
</body></html>`;
}
