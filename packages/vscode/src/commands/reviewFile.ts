/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review Current File Command
 */

import * as vscode from 'vscode';
import { detectFramework, buildStandalonePrompt, parseStandaloneResponse, resolveIssueLocations, createAIProvider, calculateRisk, loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from 'ira-review';
import type { ReviewComment, AIProviderType } from 'ira-review';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { updateStatusBar } from '../providers/statusBarProvider';
import { IraIssuesProvider } from '../providers/treeViewProvider';
import { IraCodeLensProvider } from '../providers/codeLensProvider';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { AuthProvider } from '../services/authProvider';
import { setLastResult } from '../extension';
import { isNoAIProviderError, showAISetupPrompt } from '../services/ollamaSetup';
import { resolveAiApiKey } from '../utils/credentialPrompts';
import * as msg from '../utils/messages';
import { execGit } from '../utils/git';

export async function reviewFile(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  statusBar: vscode.StatusBarItem,
  treeProvider: IraIssuesProvider,
  codeLensProvider: IraCodeLensProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage(msg.noActiveFile());
    return;
  }

  const document = editor.document;
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const fileContent = document.getText();

  if (!fileContent.trim()) {
    vscode.window.showWarningMessage(msg.fileEmpty());
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.reviewFile, cancellable: false },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('ira');
        const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
          ? require('path').dirname(vscode.window.activeTextEditor.document.uri.fsPath)
          : undefined;
        const fallbackDir = activeFileDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const workspaceRoot = fallbackDir
          ? await execGit('git rev-parse --show-toplevel', fallbackDir).catch(() => fallbackDir)
          : undefined;

        let framework: Awaited<ReturnType<typeof detectFramework>> = null;
        if (workspaceRoot) {
          try {
            framework = await detectFramework(workspaceRoot);
          } catch {
            // ignore
          }
        }

        const rules = workspaceRoot ? loadRulesFile(workspaceRoot) : [];
        const filteredRules = filterRulesByPath(rules, filePath);
        const rulesSection = formatRulesForPrompt(filteredRules);
        const sensitiveAreas = loadSensitiveAreas(workspaceRoot);
        const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
        const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
        const prompt = buildStandalonePrompt(filePath, fileContent, framework, null, rulesSection, sensitiveContext);

        const aiProvider = config.get<string>('aiProvider', 'copilot');
        let rawResponse: string;

        if (aiProvider === 'copilot') {
          const copilot = new CopilotAIProvider();
          rawResponse = await copilot.rawReview(prompt);
        } else {
          const aiApiKey = await resolveAiApiKey();
          if (!aiApiKey) return;
          const provider = createAIProvider({
            provider: aiProvider as AIProviderType,
            apiKey: aiApiKey,
            model: config.get<string>('aiModel', 'gpt-4o-mini'),
          });
          const result = await provider.review(prompt);
          rawResponse = result.explanation;
        }

        const rawIssues = parseStandaloneResponse(rawResponse);
        const resolved = resolveIssueLocations(rawIssues, fileContent);
        const issues = resolved.filter(
          (issue) => issue.evidence && issue.evidence.length >= 20
        );
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
              sensitiveFileMultiplier: sensitiveMatch ? 2 : 1,
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
        treeProvider.update(comments, workspaceRoot);
        codeLensProvider.update(comments);

        const sensitiveTag = sensitiveMatch ? '🔒 ' + sensitiveMatch.label + ' · ' : '';
        const successMsg = await msg.reviewFileSuccess(comments.length, filePath, rules.length, sensitiveTag);
        vscode.window.showInformationMessage(successMsg);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Review File error:', message);
        if (isNoAIProviderError(message)) {
          showAISetupPrompt();
        } else {
          vscode.window.showErrorMessage(msg.reviewFailed(message));
        }
      }
    },
  );
}
