/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review Current File Command
 */

import * as vscode from 'vscode';
import { detectFramework, buildStandalonePrompt, parseStandaloneResponse, createAIProvider, calculateRisk } from 'ira-review';
import type { ReviewComment, AIProviderType } from 'ira-review';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { updateStatusBar } from '../providers/statusBarProvider';
import { IraIssuesProvider } from '../providers/treeViewProvider';
import { IraCodeLensProvider } from '../providers/codeLensProvider';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { setLastResult } from '../extension';

export async function reviewFile(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  statusBar: vscode.StatusBarItem,
  treeProvider: IraIssuesProvider,
  codeLensProvider: IraCodeLensProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('IRA: No active file open.');
    return;
  }

  const document = editor.document;
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const fileContent = document.getText();

  if (!fileContent.trim()) {
    vscode.window.showWarningMessage('IRA: The active file is empty.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'IRA: Reviewing File...', cancellable: false },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('ira');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        let framework: Awaited<ReturnType<typeof detectFramework>> = null;
        if (workspaceRoot) {
          try {
            framework = await detectFramework(workspaceRoot);
          } catch {
            // ignore
          }
        }

        const prompt = buildStandalonePrompt(filePath, fileContent, framework, null);

        const aiProvider = config.get<string>('aiProvider', 'copilot');
        let rawResponse: string;

        if (aiProvider === 'copilot') {
          const copilot = new CopilotAIProvider();
          rawResponse = await copilot.rawReview(prompt);
        } else {
          const aiApiKey = config.get<string>('aiApiKey', '');
          if (!aiApiKey) {
            vscode.window.showErrorMessage('IRA: AI API key not configured. Go to Settings → IRA → AI API Key.');
            return;
          }
          const provider = createAIProvider({
            provider: aiProvider as AIProviderType,
            apiKey: aiApiKey,
            model: config.get<string>('aiModel', 'gpt-4o-mini'),
          });
          const result = await provider.review(prompt);
          rawResponse = result.explanation;
        }

        const issues = parseStandaloneResponse(rawResponse);
        const comments: ReviewComment[] = issues.map(issue => ({
          filePath,
          line: issue.line,
          rule: `IRA/${issue.category}`,
          severity: issue.severity,
          message: issue.message,
          aiReview: {
            explanation: issue.explanation,
            impact: issue.impact,
            suggestedFix: issue.suggestedFix,
          },
        }));

        const sonarIssues = comments.map((c, i) => ({
          key: `AI-${i}`,
          rule: c.rule,
          severity: c.severity as 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
          component: c.filePath,
          message: c.message,
          line: c.line,
          type: c.rule.includes('security') ? 'VULNERABILITY' as const : 'CODE_SMELL' as const,
          flows: [] as { locations: { component: string; msg: string }[] }[],
          tags: [c.rule.replace('IRA/', '')],
        }));

        const risk = comments.length > 0
          ? calculateRisk({
              allIssues: sonarIssues,
              filteredIssues: sonarIssues,
              complexity: null,
              filesChanged: 1,
            })
          : null;

        const result = {
          pullRequestId: 'file-review',
          framework,
          reviewMode: 'standalone' as const,
          totalIssues: comments.length,
          reviewedIssues: comments.length,
          comments,
          commentsPosted: 0,
          risk,
          complexity: null,
          acceptanceValidation: null,
        };

        setLastResult(result);
        updateDiagnostics(comments, diagnosticCollection, workspaceRoot ?? '');
        updateStatusBar(statusBar, risk);
        treeProvider.update(comments);
        codeLensProvider.update(comments);

        vscode.window.showInformationMessage(
          `IRA: Found ${comments.length} issues in ${filePath}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Review File error:', message);
        vscode.window.showErrorMessage(`IRA: File review failed — ${message}`);
      }
    },
  );
}
