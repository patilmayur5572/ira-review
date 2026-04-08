/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Auto-Review on Save (Pro Feature)
 */

import * as vscode from 'vscode';
import { LicenseManager } from './licenseManager';
import { AuthProvider } from './authProvider';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { buildStandalonePrompt, parseStandaloneResponse, createAIProvider, detectFramework } from 'ira-review';
import type { ReviewComment } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';

let disposable: vscode.Disposable | undefined;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let upsellShown = false;

export function activateAutoReview(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
): void {
  disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const config = vscode.workspace.getConfiguration('ira');
    if (!config.get<boolean>('autoReviewOnSave')) return;

    const license = LicenseManager.getInstance();
    const isPro = await license.isPro();
    if (!isPro) {
      if (!upsellShown) {
        upsellShown = true;
        license.showProUpsell('Auto-review on Save');
      }
      return;
    }

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
  const statusMsg = vscode.window.setStatusBarMessage('$(sync~spin) IRA: Auto-reviewing...');
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

    const prompt = buildStandalonePrompt(fileName, content, framework, null);
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
