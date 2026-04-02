/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import { reviewPR } from './commands/reviewPR';
import { createStatusBar, updateStatusBar } from './providers/statusBarProvider';
import { IraIssuesProvider } from './providers/treeViewProvider';
import { IraCodeLensProvider } from './providers/codeLensProvider';
import type { ReviewResult } from 'ira-review';

let lastResult: ReviewResult | null = null;

export function getLastResult(): ReviewResult | null {
  return lastResult;
}

export function setLastResult(result: ReviewResult | null): void {
  lastResult = result;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('IRA extension is now active');

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('ira');
  const statusBar = createStatusBar();
  const treeProvider = new IraIssuesProvider();
  const codeLensProvider = new IraCodeLensProvider();

  vscode.window.registerTreeDataProvider('ira-issues', treeProvider);

  context.subscriptions.push(
    diagnosticCollection,
    statusBar,
    vscode.commands.registerCommand('ira.reviewPR', () =>
      reviewPR(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider)
    ),
    vscode.commands.registerCommand('ira.reviewFile', () =>
      vscode.window.showInformationMessage('IRA: Review Current File — coming in v0.2. Use "IRA: Review Current PR" for now.')
    ),
    vscode.commands.registerCommand('ira.generateTests', () =>
      vscode.window.showInformationMessage('IRA: Test Generation — coming in v0.2. Stay tuned!')
    ),
    vscode.commands.registerCommand('ira.showRisk', () => {
      const result = getLastResult();
      if (result?.risk) {
        vscode.window.showInformationMessage(`IRA Risk: ${result.risk.level} (${result.risk.score}/${result.risk.maxScore})`);
      } else {
        vscode.window.showInformationMessage('IRA: No risk data — run "IRA: Review Current PR" first.');
      }
    }),
    vscode.commands.registerCommand('ira.configure', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'ira')
    ),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
  );

  statusBar.show();
}

export function deactivate(): void {
  console.log('IRA extension deactivated');
}
