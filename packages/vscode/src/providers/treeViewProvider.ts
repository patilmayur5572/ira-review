/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Tree View Provider for IRA Issues
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ReviewComment, ReviewResult } from 'ira-review';

export class IraIssueItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: IraIssueItem[],
  ) {
    super(label, collapsibleState);
  }
}

export class IraIssuesProvider implements vscode.TreeDataProvider<IraIssueItem> {
  private _results: ReviewComment[] = [];
  private _workspaceRoot: string = '';
  private _jiraTicket: string | null = null;
  private _acStatus: { met: number; total: number } | null = null;
  private _acGenCount: number = 0;
  private _completionPct: number | null = null;
  private _issueType: string | null = null;
  private _riskLabel: string | null = null;
  private _onDidChangeTreeData = new vscode.EventEmitter<IraIssueItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  update(comments: ReviewComment[], workspaceRoot?: string): void {
    this._results = comments;
    if (workspaceRoot) this._workspaceRoot = workspaceRoot;
    this._onDidChangeTreeData.fire();
  }

  updateFromResult(result: ReviewResult, workspaceRoot?: string): void {
    this._results = result.comments;
    if (workspaceRoot) this._workspaceRoot = workspaceRoot;

    // JIRA status
    if (result.acceptanceValidation) {
      this._jiraTicket = result.acceptanceValidation.jiraKey;
      const criteria = result.acceptanceValidation.criteria || [];
      this._acStatus = { met: criteria.filter(c => c.met).length, total: criteria.length };
      this._issueType = result.acceptanceValidation.issueType ?? null;
    } else {
      this._jiraTicket = null;
      this._acStatus = null;
      this._issueType = null;
    }

    if (result.acGeneration) {
      this._jiraTicket = result.acGeneration.jiraKey;
      this._acGenCount = result.acGeneration.totalCriteria;
    } else {
      this._acGenCount = 0;
    }

    if (result.requirementCompletion) {
      this._completionPct = (result.requirementCompletion as any).completionPercentage ?? null;
    } else {
      this._completionPct = null;
    }

    this._riskLabel = result.risk ? `${result.risk.score}/100 (${result.risk.level})` : null;

    this._onDidChangeTreeData.fire();
  }

  removeComment(comment: ReviewComment): void {
    this._results = this._results.filter(
      (c) => !(c.filePath === comment.filePath && c.line === comment.line && c.rule === comment.rule),
    );
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: IraIssueItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: IraIssueItem): IraIssueItem[] {
    if (element?.children) {
      return element.children;
    }

    if (element) {
      return [];
    }

    const topItems: IraIssueItem[] = [];

    // JIRA summary nodes
    if (this._jiraTicket && this._acStatus) {
      const { met, total } = this._acStatus;
      const allMet = met === total && total > 0;
      const isBug = this._issueType === 'bug';
      const label = isBug
        ? `🐛 ${this._jiraTicket} (${met}/${total} bug checks passed${allMet ? ' ✅' : ''})`
        : `🎯 ${this._jiraTicket} (${met}/${total} ACs met${allMet ? ' ✅' : ''})`;
      const item = new IraIssueItem(label, vscode.TreeItemCollapsibleState.None);
      topItems.push(item);
    }

    if (this._jiraTicket && this._acGenCount > 0) {
      const item = new IraIssueItem(
        `📝 ${this._jiraTicket} - ${this._acGenCount} ACs suggested`,
        vscode.TreeItemCollapsibleState.None,
      );
      topItems.push(item);
    }

    if (this._completionPct !== null) {
      const item = new IraIssueItem(
        `📊 Completion: ${this._completionPct}%`,
        vscode.TreeItemCollapsibleState.None,
      );
      topItems.push(item);
    }

    if (this._riskLabel) {
      const item = new IraIssueItem(
        `⚠️ Risk: ${this._riskLabel}`,
        vscode.TreeItemCollapsibleState.None,
      );
      topItems.push(item);
    }

    const grouped = new Map<string, ReviewComment[]>();
    for (const comment of this._results) {
      const existing = grouped.get(comment.filePath) ?? [];
      existing.push(comment);
      grouped.set(comment.filePath, existing);
    }

    const fileItems: IraIssueItem[] = [];
    for (const [filePath, comments] of grouped) {
      const fileName = path.basename(filePath);
      const issueItems = comments.map((comment) => {
        const icon = severityIcon(comment.severity);
        const label = `${icon} [${comment.rule}] ${comment.message}`;
        const truncated = label.length > 100 ? label.substring(0, 97) + '...' : label;
        const item = new IraIssueItem(truncated, vscode.TreeItemCollapsibleState.None);
        const line = Math.max(0, comment.line - 1);
        const root = this._workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const uri = resolveFileUri(comment.filePath, root);
        item.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [uri, { selection: new vscode.Range(line, 0, line, 0) }],
        };
        item.tooltip = `${comment.message}\n\nImpact: ${comment.aiReview.impact}\nFix: ${comment.aiReview.suggestedFix}`;
        return item;
      });

      const fileItem = new IraIssueItem(
        `${fileName} (${comments.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
        issueItems,
      );
      fileItem.iconPath = vscode.ThemeIcon.File;
      fileItem.description = filePath;
      fileItems.push(fileItem);
    }

    return [...topItems, ...fileItems];
  }
}

function resolveFileUri(filePath: string, workspaceRoot: string): vscode.Uri {
  const fs = require('fs');
  const direct = path.join(workspaceRoot, filePath);
  if (fs.existsSync(direct)) {
    return vscode.Uri.file(direct);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const candidate = path.join(folder.uri.fsPath, filePath);
    if (fs.existsSync(candidate)) {
      return vscode.Uri.file(candidate);
    }
  }
  // Suffix matching: try stripping leading path segments
  const segments = filePath.split('/');
  for (let i = 1; i < segments.length; i++) {
    const suffix = segments.slice(i).join('/');
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const candidate = path.join(folder.uri.fsPath, suffix);
      if (fs.existsSync(candidate)) {
        return vscode.Uri.file(candidate);
      }
    }
  }
  return vscode.Uri.file(direct);
}

function severityIcon(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'BLOCKER':
    case 'CRITICAL':
      return '$(error)';
    case 'MAJOR':
      return '$(warning)';
    case 'MINOR':
    case 'INFO':
    default:
      return '$(info)';
  }
}
