/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import { reviewPR } from './commands/reviewPR';
import { generatePRDescription } from './commands/generatePRDescription';
import { generateTests } from './commands/generateTests';
import { reviewFile } from './commands/reviewFile';
import { createStatusBar, updateStatusBar } from './providers/statusBarProvider';
import { IraIssuesProvider } from './providers/treeViewProvider';
import { IraCodeLensProvider } from './providers/codeLensProvider';
import { LicenseManager } from './services/licenseManager';
import { AuthProvider } from './services/authProvider';
import { ReviewHistoryStore } from './services/reviewHistoryStore';
import { activateAutoReview } from './services/autoReviewer';
import { IraHistoryProvider } from './providers/historyTreeProvider';
import { DashboardProvider } from './providers/dashboardProvider';
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

  // Initialize auth, license, and history
  const auth = AuthProvider.init(context);
  const license = LicenseManager.init(context);
  const historyStore = ReviewHistoryStore.init(context);

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('ira');
  const statusBar = createStatusBar();
  const treeProvider = new IraIssuesProvider();
  const codeLensProvider = new IraCodeLensProvider();
  const historyProvider = new IraHistoryProvider();
  const dashboardProvider = new DashboardProvider(context.extensionUri);

  vscode.window.registerTreeDataProvider('ira-issues', treeProvider);
  vscode.window.registerTreeDataProvider('ira-history', historyProvider);
  vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboardProvider);

  // Activate auto-review on save (Pro feature)
  activateAutoReview(context, diagnosticCollection);

  context.subscriptions.push(
    // Update UI when license changes
    license.onDidChangeLicense((isPro) => {
      if (isPro) {
        statusBar.text = '$(shield) IRA Pro';
      }
      historyProvider.refresh();
      dashboardProvider.refresh();
    }),

    // Refresh dashboard when history changes
    historyStore.onDidChange(() => {
      historyProvider.refresh();
      dashboardProvider.refresh();
    }),
    diagnosticCollection,
    statusBar,
    auth,
    license,
    historyStore,
    vscode.commands.registerCommand('ira.reviewPR', () =>
      reviewPR(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider)
    ),
    vscode.commands.registerCommand('ira.generatePRDescription', () => generatePRDescription()),
    vscode.commands.registerCommand('ira.reviewFile', () =>
      reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider)
    ),
    vscode.commands.registerCommand('ira.generateTests', () => generateTests()),
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
    vscode.commands.registerCommand('ira.activateLicense', () =>
      license.activateLicense()
    ),
    vscode.commands.registerCommand('ira.deactivateLicense', () =>
      license.deactivateLicense()
    ),
    vscode.commands.registerCommand('ira.signIn', async () => {
      const scmProvider = vscode.workspace.getConfiguration('ira').get<string>('scmProvider', 'github') as 'github' | 'bitbucket';
      await auth.signIn(scmProvider);
    }),
    vscode.commands.registerCommand('ira.signOut', () => auth.signOut()),
    vscode.commands.registerCommand('ira.showIssueDetail', async (detail: string) => {
      const doc = await vscode.workspace.openTextDocument({
        content: detail,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: true,
      });
    }),
    vscode.commands.registerCommand('ira.initRules', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('IRA: No workspace folder open.');
        return;
      }
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(workspaceRoot, '.ira-rules.json');
      if (fs.existsSync(filePath)) {
        vscode.window.showWarningMessage('IRA: .ira-rules.json already exists.');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
        return;
      }
      const template = JSON.stringify({ rules: [] }, null, 2);
      fs.writeFileSync(filePath, template);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage('IRA: Created .ira-rules.json. Add your team rules and commit.');
    }),
    vscode.commands.registerCommand('ira.applyFix', async (comment) => {
      const { applyFix } = await import('./services/fixApplicator');
      await applyFix(comment);
    }),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
  );

  statusBar.show();
}

export function deactivate(): void {
  console.log('IRA extension deactivated');
}
