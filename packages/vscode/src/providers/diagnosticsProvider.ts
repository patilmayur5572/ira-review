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
    const uri = resolveFileUri(filePath, workspaceRoot);
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

export function removeDiagnostic(
  comment: ReviewComment,
  diagnosticCollection: vscode.DiagnosticCollection,
  workspaceRoot: string,
): void {
  const uri = resolveFileUri(comment.filePath, workspaceRoot);
  const existing = diagnosticCollection.get(uri);
  if (!existing) return;

  const commentLine = Math.max(0, comment.line - 1);
  const filtered = existing.filter(
    (d) => !(d.source === 'IRA' && d.range.start.line === commentLine && d.message.includes(comment.rule)),
  );

  if (filtered.length === 0) {
    diagnosticCollection.delete(uri);
  } else {
    diagnosticCollection.set(uri, filtered);
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
