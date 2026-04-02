/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Diagnostics Provider
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ReviewComment } from 'ira-review';

export function updateDiagnostics(
  comments: ReviewComment[],
  diagnosticCollection: vscode.DiagnosticCollection,
  workspaceRoot: string,
): void {
  diagnosticCollection.clear();

  const grouped = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.filePath) ?? [];
    existing.push(comment);
    grouped.set(comment.filePath, existing);
  }

  for (const [filePath, fileComments] of grouped) {
    const uri = vscode.Uri.file(path.join(workspaceRoot, filePath));
    const diagnostics: vscode.Diagnostic[] = fileComments.map((comment) => {
      const line = Math.max(0, comment.line - 1);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const message = `[${comment.rule}] ${comment.message}\n💡 ${comment.aiReview.suggestedFix}`;
      const severity = mapSeverity(comment.severity);

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = 'IRA';
      return diagnostic;
    });

    diagnosticCollection.set(uri, diagnostics);
  }
}

function mapSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity.toUpperCase()) {
    case 'BLOCKER':
    case 'CRITICAL':
      return vscode.DiagnosticSeverity.Error;
    case 'MAJOR':
      return vscode.DiagnosticSeverity.Warning;
    case 'MINOR':
    case 'INFO':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}
