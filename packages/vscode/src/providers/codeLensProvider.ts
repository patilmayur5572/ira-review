/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * CodeLens Provider
 */

import * as vscode from 'vscode';
import type { ReviewComment } from 'ira-review';

export class IraCodeLensProvider implements vscode.CodeLensProvider {
  private _comments: ReviewComment[] = [];
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  update(comments: ReviewComment[]): void {
    this._comments = comments;
    this._onDidChangeCodeLenses.fire();
  }

  removeComment(comment: ReviewComment): void {
    this._comments = this._comments.filter(
      (c) => !(c.filePath === comment.filePath && c.line === comment.line && c.rule === comment.rule),
    );
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const relativePath = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
    const docPath = document.uri.fsPath;
    const matching = this._comments.filter((c) => {
      const fp = c.filePath.replace(/\\/g, '/');
      if (fp === relativePath) return true;
      if (relativePath.endsWith(fp)) return true;
      if (fp.endsWith(relativePath)) return true;
      if (docPath.endsWith(fp.replace(/\//g, require('path').sep))) return true;
      return false;
    });

    const lenses: vscode.CodeLens[] = [];

    for (const comment of matching) {
      const line = Math.max(0, comment.line - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const title = `🔍 IRA: ${comment.severity} — ${comment.message}`;
      const truncated = title.length > 80 ? title.substring(0, 77) + '...' : title;

      lenses.push(new vscode.CodeLens(range, {
        title: truncated,
        command: 'ira.showIssueDetail',
        arguments: [
          `# ${comment.rule} (${comment.severity})\n\n` +
          `## Explanation\n\n${comment.aiReview.explanation}\n\n` +
          `## Impact\n\n${comment.aiReview.impact}\n\n` +
          `## Suggested Fix\n\n${comment.aiReview.suggestedFix}`,
        ],
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '⭐ Apply Fix',
        command: 'ira.applyFix',
        arguments: [comment],
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '✕ Dismiss',
        command: 'ira.dismissIssue',
        arguments: [comment],
      }));
    }

    return lenses;
  }
}
