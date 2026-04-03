/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * History Tree View Provider — shows past review results
 */

import * as vscode from 'vscode';
import { ReviewHistoryStore, type HistoryEntry } from '../services/reviewHistoryStore';
import { LicenseManager } from '../services/licenseManager';

class HistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: HistoryTreeItem[],
  ) {
    super(label, collapsibleState);
  }
}

export class IraHistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HistoryTreeItem): Promise<HistoryTreeItem[]> {
    if (element?.children) return element.children;
    if (element) return [];

    const license = LicenseManager.getInstance();
    const isPro = await license.isPro();

    if (!isPro) {
      const upsell = new HistoryTreeItem(
        '⭐ Upgrade to Pro to view history',
        vscode.TreeItemCollapsibleState.None,
      );
      upsell.command = {
        command: 'ira.activateLicense',
        title: 'Activate License',
      };
      return [upsell];
    }

    const store = ReviewHistoryStore.getInstance();
    const entries = store.getRecent(50);

    if (entries.length === 0) {
      return [new HistoryTreeItem(
        'No review history yet',
        vscode.TreeItemCollapsibleState.None,
      )];
    }

    return entries.map((entry) => {
      const date = new Date(entry.timestamp).toLocaleString();
      const riskIcon = riskEmoji(entry.riskLevel);
      const label = `${riskIcon} PR #${entry.pullRequestId} — ${entry.totalIssues} issues`;

      const issueChildren = entry.comments.slice(0, 20).map((c) => {
        const child = new HistoryTreeItem(
          `${severityIcon(c.severity)} [${c.rule}] ${c.message}`,
          vscode.TreeItemCollapsibleState.None,
        );
        child.tooltip = `${c.message}\n\nFix: ${c.aiReview.suggestedFix}`;
        return child;
      });

      const item = new HistoryTreeItem(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        issueChildren,
      );
      item.description = date;
      item.tooltip = `${entry.reviewMode} review\nRisk: ${entry.riskLevel ?? 'N/A'} (${entry.riskScore ?? 'N/A'})\n${date}`;
      return item;
    });
  }
}

function riskEmoji(level: string | null): string {
  switch (level?.toUpperCase()) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🟢';
    default: return '⚪';
  }
}

function severityIcon(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'BLOCKER':
    case 'CRITICAL': return '🔴';
    case 'MAJOR': return '🟠';
    case 'MINOR': return '🟡';
    default: return '🔵';
  }
}
