/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Auto-Review on Save
 */

import * as vscode from 'vscode';
import { AuthProvider } from './authProvider';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { buildStandalonePrompt, parseStandaloneResponse, createAIProvider, detectFramework, loadRulesFile, filterRulesByPath, formatRulesForPrompt } from 'ira-review';
import type { ReviewComment } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import * as msg from '../utils/messages';

let disposable: vscode.Disposable | undefined;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let suppressAutoReview = false;

/** Suppress the auto-review upsell popup while another command is running. */
export function suppressAutoReviewPopup(suppress: boolean): void {
  suppressAutoReview = suppress;
}

export function activateAutoReview(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
): void {
  disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (suppressAutoReview) return;
    const config = vscode.workspace.getConfiguration('ira');
    if (!config.get<boolean>('autoReviewOnSave')) return;

    const key = document.uri.toString();
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(key, setTimeout(async () => {
      debounceTimers.delete(key);
      await runFileReview(document, diagnosticCollection);
    }, 2000));
  });

  context.subscriptions.push({ dispose: deactivateAutoReview });
}

async function runFileReview(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
): Promise<void> {
  const statusMsg = vscode.window.setStatusBarMessage(msg.progress.autoReview);
  // Resolve git root from the saved document's directory
  const docDir = require('path').dirname(document.uri.fsPath);
  const workspaceRoot = await new Promise<string | undefined>((resolve) => {
    require('child_process').exec('git rev-parse --show-toplevel', { cwd: docDir }, (err: Error | null, stdout: string) => {
      resolve(err ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath : stdout.trim());
    });
  });

  try {
    const config = vscode.workspace.getConfiguration('ira');
    const providerName = config.get<string>('aiProvider') ?? 'copilot';

    const aiProvider = providerName === 'copilot'
      ? new CopilotAIProvider()
      : createAIProvider({
          provider: providerName as 'openai' | 'azure-openai' | 'anthropic' | 'ollama',
          model: config.get<string>('aiModel') ?? 'gpt-4o-mini',
          apiKey: await AuthProvider.getInstance().getAiApiKey(),
        });

    const content = document.getText();
    const fileName = vscode.workspace.asRelativePath(document.uri);

    let framework: Awaited<ReturnType<typeof detectFramework>> = null;
    if (workspaceRoot) {
      try {
        framework = await detectFramework(workspaceRoot);
      } catch {
        // Soft fail
      }
    }

    const rules = workspaceRoot ? loadRulesFile(workspaceRoot) : [];
    const filteredRules = filterRulesByPath(rules, fileName);
    const rulesSection = formatRulesForPrompt(filteredRules);
    const prompt = buildStandalonePrompt(fileName, content, framework, null, rulesSection);
    const response = await aiProvider.review(prompt);
    const foundIssues = parseStandaloneResponse(response.explanation);

    const comments: ReviewComment[] = foundIssues.map((issue) => ({
      filePath: fileName,
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

    if (comments.length && workspaceRoot) {
      updateDiagnostics(comments, diagnosticCollection, workspaceRoot);
    } else {
      diagnosticCollection.delete(document.uri);
    }
  } catch (err) {
    console.error('IRA auto-review error:', err);
  } finally {
    statusMsg.dispose();
  }
}

export function deactivateAutoReview(): void {
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
  disposable?.dispose();
  disposable = undefined;
}
