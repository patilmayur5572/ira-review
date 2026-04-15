/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import { reviewPR } from './commands/reviewPR';
import { generatePRDescription } from './commands/generatePRDescription';
import { generateTests } from './commands/generateTests';
import { reviewFile } from './commands/reviewFile';

import { validateJiraAC } from './commands/validateJiraAC';
import { suggestAC } from './commands/suggestAC';
import { createStatusBar, updateStatusBar } from './providers/statusBarProvider';
import { removeDiagnostic } from './providers/diagnosticsProvider';
import { IraIssuesProvider } from './providers/treeViewProvider';
import { IraCodeLensProvider } from './providers/codeLensProvider';
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

/** Stores the active PR context so per-issue "Post to PR" commands can access it. */
export interface PRContext {
  prNumber: string;
  scmProvider: 'github' | 'bitbucket';
  owner: string;
  repo: string;
  scmToken: string;
  baseUrl?: string;
  bitbucketUrl?: string;
}

let activePRContext: PRContext | null = null;

export function setPRContext(ctx: PRContext | null): void {
  activePRContext = ctx;
}

export function getPRContext(): PRContext | null {
  return activePRContext;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('IRA extension is now active');

  // Initialize auth and history
  const auth = AuthProvider.init(context);
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

  // Activate auto-review on save
  activateAutoReview(context, diagnosticCollection);

  context.subscriptions.push(
    // Refresh dashboard when history changes
    historyStore.onDidChange(() => {
      historyProvider.refresh();
      dashboardProvider.refresh();
    }),
    diagnosticCollection,
    statusBar,
    auth,
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
    vscode.commands.registerCommand('ira.suggestAC', () => suggestAC()),

    vscode.commands.registerCommand('ira.configure', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'ira')
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
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const tmpDir = path.join(os.tmpdir(), 'ira-review');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, 'issue-detail.md');
      fs.writeFileSync(tmpFile, detail, 'utf-8');
      const uri = vscode.Uri.file(tmpFile);
      // Close any existing IRA preview tab before opening a new one
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (tab.label.includes('issue-detail')) {
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
      await vscode.commands.executeCommand('markdown.showPreview', uri, { viewColumn: vscode.ViewColumn.Beside });
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
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      await applyFix(comment, () => {
        codeLensProvider.removeComment(comment);
        treeProvider.removeComment(comment);
        removeDiagnostic(comment, diagnosticCollection, workspaceRoot);
      });
    }),
    vscode.commands.registerCommand('ira.dismissIssue', (comment) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      codeLensProvider.removeComment(comment);
      treeProvider.removeComment(comment);
      removeDiagnostic(comment, diagnosticCollection, workspaceRoot);
    }),
    vscode.commands.registerCommand('ira.postIssueToPR', async (comment) => {
      const ctx = getPRContext();
      if (!ctx) { vscode.window.showWarningMessage('No active PR context — run "Review PR" first.'); return; }
      try {
        const { GitHubClient, BitbucketClient } = await import('ira-review');
        const scmClient = ctx.scmProvider === 'github'
          ? new GitHubClient({ owner: ctx.owner, repo: ctx.repo, token: ctx.scmToken, ...(ctx.baseUrl && { baseUrl: ctx.baseUrl }) } as any)
          : new BitbucketClient({ workspace: ctx.owner, repoSlug: ctx.repo, token: ctx.scmToken, ...(ctx.bitbucketUrl && { baseUrl: ctx.bitbucketUrl }) } as any);
        await scmClient.postComment(comment, ctx.prNumber);
        vscode.window.showInformationMessage(`Posted issue to PR #${ctx.prNumber} ✅`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to post issue: ${err instanceof Error ? err.message : err}`);
      }
    }),
    vscode.commands.registerCommand('ira.postAllIssuesToPR', async () => {
      const ctx = getPRContext();
      const result = getLastResult();
      if (!ctx || !result || result.comments.length === 0) return;
      try {
        const { GitHubClient, BitbucketClient } = await import('ira-review');
        const scmClient = ctx.scmProvider === 'github'
          ? new GitHubClient({ owner: ctx.owner, repo: ctx.repo, token: ctx.scmToken, ...(ctx.baseUrl && { baseUrl: ctx.baseUrl }) } as any)
          : new BitbucketClient({ workspace: ctx.owner, repoSlug: ctx.repo, token: ctx.scmToken, ...(ctx.bitbucketUrl && { baseUrl: ctx.bitbucketUrl }) } as any);
        let posted = 0;
        for (const comment of result.comments) {
          await scmClient.postComment(comment, ctx.prNumber);
          posted++;
        }
        vscode.window.showInformationMessage(`Posted ${posted} issue${posted !== 1 ? 's' : ''} to PR #${ctx.prNumber} ✅`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to post issues: ${err instanceof Error ? err.message : err}`);
      }
    }),
    vscode.commands.registerCommand('ira.postACToPR', async () => {
      const ctx = getPRContext();
      const result = getLastResult();
      if (!ctx || !result?.acceptanceValidation) return;
      try {
        const { GitHubClient, BitbucketClient } = await import('ira-review');
        const scmClient = ctx.scmProvider === 'github'
          ? new GitHubClient({ owner: ctx.owner, repo: ctx.repo, token: ctx.scmToken, ...(ctx.baseUrl && { baseUrl: ctx.baseUrl }) } as any)
          : new BitbucketClient({ workspace: ctx.owner, repoSlug: ctx.repo, token: ctx.scmToken, ...(ctx.bitbucketUrl && { baseUrl: ctx.bitbucketUrl }) } as any);
        const av = result.acceptanceValidation;
        const rows = av.criteria.map(c => `| ${c.met ? '✅' : '❌'} | ${c.description} | ${c.evidence} |`).join('\n');
        const passCount = av.criteria.filter(c => c.met).length;
        const summary = `# JIRA AC Validation — ${av.jiraKey}\n\n**${av.summary}**\n\n## Result: ${passCount}/${av.criteria.length} criteria met ${av.overallPass ? '✅' : '❌'}\n\n| Status | Criteria | Evidence |\n|--------|----------|----------|\n${rows}\n\n---\n*Validated by [IRA Review](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)*`;
        await scmClient.postSummary(summary, ctx.prNumber);
        vscode.window.showInformationMessage(`AC validation posted to PR #${ctx.prNumber} ✅`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to post AC validation: ${err instanceof Error ? err.message : err}`);
      }
    }),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
  );

  statusBar.show();
}

export function deactivate(): void {
  console.log('IRA extension deactivated');
}
