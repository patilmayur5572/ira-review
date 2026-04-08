/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import { reviewPR } from './commands/reviewPR';
import { generatePRDescription } from './commands/generatePRDescription';
import { generateTests } from './commands/generateTests';
import { reviewFile } from './commands/reviewFile';
import { showRisk } from './commands/showRisk';
import { validateJiraAC } from './commands/validateJiraAC';
import { createStatusBar, updateStatusBar } from './providers/statusBarProvider';
import { IraIssuesProvider } from './providers/treeViewProvider';
import { IraCodeLensProvider } from './providers/codeLensProvider';
import { LicenseManager } from './services/licenseManager';
import { AuthProvider } from './services/authProvider';
import { ReviewHistoryStore } from './services/reviewHistoryStore';
import { activateAutoReview } from './services/autoReviewer';
import { IraHistoryProvider } from './providers/historyTreeProvider';
import { DashboardProvider } from './providers/dashboardProvider';
import { setupOllama } from './services/ollamaSetup';
import type { ReviewResult } from 'ira-review';
import * as msg from './utils/messages';

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

  // First-run welcome — show once per install
  const hasSeenWelcome = context.globalState.get<boolean>('ira.welcomeShown');
  if (!hasSeenWelcome) {
    context.globalState.update('ira.welcomeShown', true);
    vscode.window.showInformationMessage(
      'Welcome to IRA — your AI code review assistant 👋',
      { modal: true },
      'Explore Commands',
    ).then((action) => {
      if (action === 'Explore Commands') {
        vscode.commands.executeCommand('workbench.action.quickOpen', '> IRA: ');
      }
    });
  }

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
    vscode.commands.registerCommand('ira.validateJiraAC', () => validateJiraAC()),
    vscode.commands.registerCommand('ira.showRisk', () => showRisk()),
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
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(github) GitHub', id: 'github' as const },
          { label: '$(globe) Bitbucket', id: 'bitbucket' as const },
        ],
        { placeHolder: msg.prompts.signInTo },
      );
      if (!choice) return;
      await auth.signIn(choice.id);
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
      const cp = await import('child_process');
      const fs = await import('fs');
      const path = await import('path');

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) {
        vscode.window.showErrorMessage(msg.noWorkspace());
        return;
      }

      // Find all git repos under the workspace
      const findRepos = (dir: string): string[] => {
        const repos: string[] = [];
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const child = path.join(dir, entry.name);
            if (fs.existsSync(path.join(child, '.git'))) {
              repos.push(child);
            }
          }
        } catch { /* ignore */ }
        // Also check if the workspace root itself is a repo
        if (fs.existsSync(path.join(dir, '.git'))) {
          repos.unshift(dir);
        }
        return repos;
      };

      const repos = findRepos(wsRoot);
      let workspaceRoot: string;

      if (repos.length === 0) {
        // No git repos found, fall back to workspace root
        workspaceRoot = wsRoot;
      } else if (repos.length === 1) {
        workspaceRoot = repos[0];
      } else {
        // Multiple repos — let user pick
        const pick = await vscode.window.showQuickPick(
          repos.map(r => ({ label: path.basename(r), description: r, repoPath: r })),
          { placeHolder: msg.prompts.pickProject },
        );
        if (!pick) return;
        workspaceRoot = pick.repoPath;
      }

      const filePath = path.join(workspaceRoot, '.ira-rules.json');
      if (fs.existsSync(filePath)) {
        vscode.window.showWarningMessage(msg.rulesAlreadyExist());
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
        return;
      }
      const template = JSON.stringify({
        rules: [
          {
            id: "no-console-log",
            message: "Avoid console.log in production code — use a structured logger instead",
            severity: "MAJOR",
            bad: "console.log('user data:', user);",
            good: "logger.info('User loaded', { userId: user.id });",
            paths: ["src/**"],
          },
        ],
        sensitiveAreas: [
          "src/services/payment/**",
          "**/auth/**",
        ],
      }, null, 2);
      fs.writeFileSync(filePath, template);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(msg.rulesCreated());
    }),
    vscode.commands.registerCommand('ira.setupOllama', () => setupOllama()),
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
