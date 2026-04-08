/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Trends Dashboard Webview Provider (Pro Feature)
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { LicenseManager } from '../services/licenseManager';
import { ReviewHistoryStore, type TrendData, type HistoryEntry } from '../services/reviewHistoryStore';

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJsonForScript(json: string): string {
  return json.replace(/<\//g, '<\\/');
}

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ira-dashboard';
  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'activateLicense') {
        const license = LicenseManager.getInstance();
        await license.activateLicense();
        this.refresh();
      }
    });
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;

    const license = LicenseManager.getInstance();
    const isPro = await license.isPro();

    if (!isPro) {
      this._view.webview.html = this.getUpsellHtml();
      return;
    }

    const store = ReviewHistoryStore.getInstance();
    const trends = store.getTrends();
    const recent = store.getRecent(10);
    this._view.webview.html = this.getDashboardHtml(trends, recent);
  }

  private getUpsellHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; text-align: center; }
  .star { font-size: 32px; margin: 16px 0; }
  .title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
  .desc { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
</style></head><body>
  <div class="star">⭐</div>
  <div class="title">Trends Dashboard</div>
  <div class="desc">Track issues over time, risk trends, and recurring patterns.<br>Upgrade to Pro to unlock.</div>
  <button class="btn" onclick="activate()">Activate Pro License</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function activate() { vscode.postMessage({ command: 'activateLicense' }); }
  </script>
</body></html>`;
  }

  private getDashboardHtml(trends: TrendData, recent: HistoryEntry[]): string {
    const nonce = getNonce();
    const issuesData = escapeJsonForScript(JSON.stringify(trends.issuesOverTime));
    const riskData = escapeJsonForScript(JSON.stringify(trends.riskOverTime));
    const topRules = escapeJsonForScript(JSON.stringify(trends.topRules));
    const severity = escapeJsonForScript(JSON.stringify(trends.severityBreakdown));

    return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 8px; }
  .stat-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .stat { flex: 1; text-align: center; padding: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
  .stat-value { font-size: 20px; font-weight: bold; }
  .stat-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .bar-chart { margin: 4px 0; }
  .bar-row { display: flex; align-items: center; margin: 4px 0; font-size: 12px; }
  .bar-label { width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-fill { height: 16px; border-radius: 3px; min-width: 4px; }
  .bar-count { margin-left: 6px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .history-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
  .risk-low { color: #4ade80; } .risk-medium { color: #fbbf24; } .risk-high { color: #f97316; } .risk-critical { color: #ef4444; }
  .chart { height: 120px; display: flex; align-items: flex-end; gap: 2px; padding: 4px 0; }
  .chart-bar { flex: 1; min-width: 4px; border-radius: 2px 2px 0 0; position: relative; }
  .chart-bar:hover::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: var(--vscode-editorHoverWidget-background); border: 1px solid var(--vscode-editorHoverWidget-border); padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap; z-index: 10; }
  .empty { text-align: center; color: var(--vscode-descriptionForeground); padding: 20px; }
  .sev-blocker, .sev-critical { background: #ef4444; } .sev-major { background: #f97316; } .sev-minor { background: #fbbf24; } .sev-info { background: #60a5fa; }
</style></head><body>
  <div id="app"></div>
  <script nonce="${nonce}">
    const issues = ${issuesData};
    const risks = ${riskData};
    const rules = ${topRules};
    const sev = ${severity};
    const recent = ${escapeJsonForScript(JSON.stringify(recent.map((e) => ({
      pr: escapeHtml(String(e.pullRequestId)),
      date: escapeHtml(new Date(e.timestamp).toLocaleDateString()),
      issues: e.totalIssues,
      risk: escapeHtml(String(e.riskLevel ?? '')),
    }))))};

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    const app = document.getElementById('app');

    if (issues.length === 0) {
      app.innerHTML = '<div class="empty">No review history yet.<br>Run "IRA: Review Current PR" to start tracking.</div>';
    } else {
      const totalReviews = issues.length;
      const totalIssues = issues.reduce((s, i) => s + i.count, 0);
      const avgIssues = totalReviews > 0 ? (totalIssues / totalReviews).toFixed(1) : '0';
      const latestRisk = risks.length > 0 ? risks[risks.length - 1] : null;

      let html = '';

      // Summary stats
      html += '<div class="stat-row">';
      html += '<div class="stat"><div class="stat-value">' + totalReviews + '</div><div class="stat-label">Reviews</div></div>';
      html += '<div class="stat"><div class="stat-value">' + totalIssues + '</div><div class="stat-label">Total Issues</div></div>';
      html += '<div class="stat"><div class="stat-value">' + avgIssues + '</div><div class="stat-label">Avg Issues/PR</div></div>';
      if (latestRisk) {
        html += '<div class="stat"><div class="stat-value risk-' + latestRisk.level.toLowerCase() + '">' + latestRisk.level + '</div><div class="stat-label">Latest Risk</div></div>';
      }
      html += '</div>';

      // Issues over time chart
      html += '<div class="section"><div class="section-title">Issues Over Time</div><div class="card"><div class="chart">';
      const maxCount = Math.max(...issues.map(i => i.count), 1);
      for (const i of issues) {
        const h = Math.max(4, (i.count / maxCount) * 100);
        html += '<div class="chart-bar" style="height:' + h + '%;background:var(--vscode-charts-blue)" data-tooltip="PR #' + i.pr + ': ' + i.count + ' issues (' + i.date + ')"></div>';
      }
      html += '</div></div></div>';

      // Severity breakdown
      const sevKeys = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
      const totalSev = Object.values(sev).reduce((a, b) => a + b, 0) || 1;
      html += '<div class="section"><div class="section-title">Severity Breakdown</div><div class="card"><div class="bar-chart">';
      for (const s of sevKeys) {
        const count = sev[s] || 0;
        if (count === 0) continue;
        const pct = (count / totalSev) * 100;
        html += '<div class="bar-row"><div class="bar-label">' + s + '</div><div class="bar-fill sev-' + s.toLowerCase() + '" style="width:' + pct + '%"></div><div class="bar-count">' + count + '</div></div>';
      }
      html += '</div></div></div>';

      // Top recurring rules
      if (rules.length > 0) {
        const maxRule = rules[0].count;
        html += '<div class="section"><div class="section-title">Top Recurring Rules</div><div class="card"><div class="bar-chart">';
        for (const r of rules) {
          const pct = (r.count / maxRule) * 100;
          html += '<div class="bar-row"><div class="bar-label">' + esc(r.rule) + '</div><div class="bar-fill" style="width:' + pct + '%;background:var(--vscode-charts-orange)"></div><div class="bar-count">' + r.count + '</div></div>';
        }
        html += '</div></div></div>';
      }

      // Recent reviews
      html += '<div class="section"><div class="section-title">Recent Reviews</div><div class="card">';
      for (const r of recent) {
        const riskClass = r.risk ? 'risk-' + r.risk.toLowerCase() : '';
        html += '<div class="history-item"><span>PR #' + r.pr + '</span><span>' + r.issues + ' issues</span><span class="' + riskClass + '">' + (r.risk || 'N/A') + '</span><span>' + r.date + '</span></div>';
      }
      html += '</div></div>';

      app.innerHTML = html;
    }
  </script>
</body></html>`;
  }
}
