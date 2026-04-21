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

export function showReviewResultsPanel(
  result: ReviewResult,
  onPostToJira?: () => Promise<boolean>,
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
    currentPanel.onDidDispose(() => { currentPanel = undefined; });
  }

  currentPanel.webview.html = buildHtml(result);

  currentPanel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'postToJira' && onPostToJira) {
      const success = await onPostToJira();
      currentPanel?.webview.postMessage({
        type: 'postResult',
        success,
      });
    }
  });
}

function buildHtml(result: ReviewResult): string {
  const nonce = getNonce();

  const issuesByLevel = {
    blocker: result.comments.filter(c => c.severity === 'BLOCKER').length,
    critical: result.comments.filter(c => c.severity === 'CRITICAL').length,
    major: result.comments.filter(c => c.severity === 'MAJOR').length,
    minor: result.comments.filter(c => c.severity === 'MINOR').length,
  };

  // Code issues section
  let codeSection = '<div class="section"><div class="section-title">Code Review</div><div class="card">';
  if (result.totalIssues === 0) {
    codeSection += '<div class="clean">Clean code - nothing to flag</div>';
  } else {
    const parts: string[] = [];
    if (issuesByLevel.blocker > 0) parts.push(`${issuesByLevel.blocker} Blocker`);
    if (issuesByLevel.critical > 0) parts.push(`${issuesByLevel.critical} Critical`);
    if (issuesByLevel.major > 0) parts.push(`${issuesByLevel.major} Major`);
    if (issuesByLevel.minor > 0) parts.push(`${issuesByLevel.minor} Minor`);
    codeSection += `<div class="summary">${result.totalIssues} issue${result.totalIssues !== 1 ? 's' : ''} found (${parts.join(', ')})</div>`;

    codeSection += '<div class="issues-list">';
    for (const comment of result.comments) {
      const icon = comment.severity === 'BLOCKER' || comment.severity === 'CRITICAL' ? '🔴' : comment.severity === 'MAJOR' ? '🟠' : '🟡';
      codeSection += `<div class="issue-row">${icon} <span class="severity">${esc(comment.severity)}</span> <span class="issue-msg">${esc(comment.message)}</span><div class="issue-file">${esc(comment.filePath)}:${comment.line}</div></div>`;
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
    acSection += '</div></div></div>';
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
    const riskClass = result.risk.level === 'Low' ? 'low' : result.risk.level === 'Medium' ? 'medium' : 'high';
    riskSection = `<div class="section"><div class="section-title">Risk Score</div><div class="card"><div class="risk ${riskClass}">${result.risk.score}/100 (${esc(result.risk.level)})</div></div></div>`;
  }

  return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; margin: 0; max-width: 800px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 16px; }
  .clean { color: #4ade80; font-size: 14px; }
  .summary { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
  .issues-list { font-size: 13px; }
  .issue-row { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .issue-row:last-child { border-bottom: none; }
  .severity { font-weight: bold; margin-right: 8px; }
  .issue-file { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
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
</style></head><body>
${codeSection}
${acSection}
${acGenSection}
${completionSection}
${riskSection}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const btn = document.getElementById('postToJira');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Posting...';
      vscode.postMessage({ type: 'postToJira' });
    });
  }
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'postResult' && btn) {
      if (msg.success) {
        btn.textContent = 'Posted to JIRA';
        btn.classList.add('posted');
      } else {
        btn.textContent = 'Failed - try again';
        btn.disabled = false;
      }
    }
  });
</script>
</body></html>`;
}
