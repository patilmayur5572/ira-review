/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Tree View Provider for IRA Issues
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ReviewComment } from 'ira-review';

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
  private _onDidChangeTreeData = new vscode.EventEmitter<IraIssueItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  update(comments: ReviewComment[]): void {
    this._results = comments;
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
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const uri = vscode.Uri.file(path.join(workspaceRoot, comment.filePath));
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

    return fileItems;
  }
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
