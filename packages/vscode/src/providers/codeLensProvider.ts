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

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const matching = this._comments.filter(
      (c) => c.filePath === relativePath || c.filePath === relativePath.replace(/\\/g, '/')
    );

    return matching.map((comment) => {
      const line = Math.max(0, comment.line - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const title = `🔍 IRA: ${comment.severity} — ${comment.message}`;
      const truncated = title.length > 80 ? title.substring(0, 77) + '...' : title;

      return new vscode.CodeLens(range, {
        title: truncated,
        command: 'vscode.window.showInformationMessage',
        arguments: [
          `[${comment.rule}] ${comment.severity}\n\n` +
          `📝 ${comment.aiReview.explanation}\n\n` +
          `⚡ Impact: ${comment.aiReview.impact}\n\n` +
          `💡 Fix: ${comment.aiReview.suggestedFix}`,
        ],
      });
    });
  }
}
