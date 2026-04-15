/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Trends Dashboard Webview Provider
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
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
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;

    const store = ReviewHistoryStore.getInstance();
    const trends = store.getTrends();
    const recent = store.getRecent(10);
    this._view.webview.html = this.getDashboardHtml(trends, recent);
  }

  private getDashboardHtml(trends: TrendData, _recent: HistoryEntry[]): string {
    const nonce = getNonce();
    const direction = escapeHtml(trends.direction);
    const hotspots = escapeJsonForScript(JSON.stringify(trends.hotspotFiles));
    const topRule = trends.topRules.length > 0 ? trends.topRules[0] : null;

    return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 8px; }
  .direction { text-align: center; padding: 16px; }
  .direction-icon { font-size: 28px; margin-bottom: 4px; }
  .direction-label { font-size: 14px; font-weight: bold; }
  .direction-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .improving { color: #4ade80; } .stable { color: #60a5fa; } .worsening { color: #f97316; } .insufficient { color: var(--vscode-descriptionForeground); }
  .hotspot { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
  .hotspot:last-child { border-bottom: none; }
  .hotspot-rank { font-size: 16px; font-weight: bold; width: 24px; color: var(--vscode-descriptionForeground); }
  .hotspot-info { flex: 1; min-width: 0; }
  .hotspot-file { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hotspot-rule { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .hotspot-count { font-size: 13px; font-weight: bold; margin-left: 8px; }
  .rule-card { display: flex; align-items: center; gap: 12px; }
  .rule-count { font-size: 24px; font-weight: bold; color: var(--vscode-charts-orange); }
  .rule-name { font-size: 13px; font-weight: 500; }
  .rule-hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .empty { text-align: center; color: var(--vscode-descriptionForeground); padding: 20px; }
</style></head><body>
  <div id="app"></div>
  <script nonce="${nonce}">
    const direction = '${direction}';
    const hotspots = ${hotspots};
    const topRule = ${topRule ? escapeJsonForScript(JSON.stringify(topRule)) : 'null'};

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    const app = document.getElementById('app');

    if (direction === 'insufficient' && hotspots.length === 0) {
      app.innerHTML = '<div class="empty">Not enough review history yet.<br>Run a few more reviews to see trends.</div>';
    } else {
      let html = '';

      // 1. Direction indicator
      const dirMap = {
        improving:    { icon: '↓', label: 'Improving', desc: 'Fewer issues in recent PRs vs earlier ones' },
        stable:       { icon: '→', label: 'Stable', desc: 'Issue count is holding steady' },
        worsening:    { icon: '↑', label: 'Needs Attention', desc: 'More issues in recent PRs — review hotspots below' },
        insufficient: { icon: '—', label: 'Building History', desc: 'Need 6+ reviews to show direction' },
      };
      const dir = dirMap[direction] || dirMap.insufficient;
      html += '<div class="section"><div class="section-title">Direction</div>';
      html += '<div class="card direction"><div class="direction-icon ' + direction + '">' + dir.icon + '</div>';
      html += '<div class="direction-label ' + direction + '">' + dir.label + '</div>';
      html += '<div class="direction-desc">' + dir.desc + '</div></div></div>';

      // 2. Top 3 hotspot files
      if (hotspots.length > 0) {
        html += '<div class="section"><div class="section-title">Hotspot Files</div><div class="card">';
        hotspots.forEach(function(h, i) {
          html += '<div class="hotspot">';
          html += '<div class="hotspot-rank">' + (i + 1) + '</div>';
          html += '<div class="hotspot-info"><div class="hotspot-file">' + esc(h.filePath) + '</div>';
          html += '<div class="hotspot-rule">' + esc(h.topRule) + '</div></div>';
          html += '<div class="hotspot-count">' + h.issueCount + '</div>';
          html += '</div>';
        });
        html += '</div></div>';
      }

      // 3. Top recurring rule
      if (topRule) {
        html += '<div class="section"><div class="section-title">Most Recurring Rule</div><div class="card"><div class="rule-card">';
        html += '<div class="rule-count">' + topRule.count + '</div>';
        html += '<div><div class="rule-name">' + esc(topRule.rule) + '</div>';
        html += '<div class="rule-hint">times across all reviews — consider a team-wide fix</div></div>';
        html += '</div></div></div>';
      }

      app.innerHTML = html;
    }
  </script>
</body></html>`;
  }
}
