/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * One-click "Apply Fix" (Pro Feature)
 */

import * as vscode from 'vscode';
import { LicenseManager } from './licenseManager';
import { AuthProvider } from './authProvider';
import { createAIProvider } from 'ira-review';
import type { ReviewComment } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import * as msg from '../utils/messages';

export async function applyFix(comment: ReviewComment): Promise<void> {
  const license = LicenseManager.getInstance();
  const isPro = await license.isPro();
  if (!isPro) {
    license.showProUpsell('One-click Apply Fix');
    return;
  }

  const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
    ? require('path').dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const fallbackDir = activeFileDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!fallbackDir) return;
  const workspaceRoot = await new Promise<string>((resolve) => {
    require('child_process').exec('git rev-parse --show-toplevel', { cwd: fallbackDir }, (err: Error | null, stdout: string) => {
      resolve(err ? fallbackDir : stdout.trim());
    });
  });

  const fileUri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), comment.filePath);

  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(fileUri);
  } catch {
    vscode.window.showErrorMessage(msg.couldNotOpenFile(comment.filePath));
    return;
  }

  const statusMsg = vscode.window.setStatusBarMessage(msg.progress.generatingFix);

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

    const line = Math.max(0, comment.line - 1);
    const contextStart = Math.max(0, line - 10);
    const contextEnd = Math.min(document.lineCount - 1, line + 10);
    const contextRange = new vscode.Range(contextStart, 0, contextEnd, Number.MAX_SAFE_INTEGER);
    const codeContext = document.getText(contextRange);

    const prompt = `You are a code fixer. Given this code issue, return ONLY the fixed code that should replace lines ${contextStart + 1}-${contextEnd + 1}. No markdown, no explanation, just the corrected code.

File: ${comment.filePath}
Issue at line ${comment.line}: [${comment.rule}] ${comment.severity}
Message: ${comment.message}
Suggested fix: ${comment.aiReview.suggestedFix}

Current code (lines ${contextStart + 1}-${contextEnd + 1}):
\`\`\`
${codeContext}
\`\`\`

Return ONLY the fixed code:`;

    const response = await aiProvider.review(prompt);
    const fixedCode = response.explanation.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

    const edit = new vscode.WorkspaceEdit();
    edit.replace(fileUri, contextRange, fixedCode);

    const diff = `Issue: [${comment.rule}] ${comment.message}\nFix: ${comment.aiReview.suggestedFix}`;

    const action = await vscode.window.showInformationMessage(
      `IRA: Fix generated for ${comment.filePath}:${comment.line}. Apply?`,
      { detail: diff, modal: true },
      'Apply Fix',
      'Show Diff',
    );

    if (action === 'Apply Fix') {
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(msg.fixApplied(false));
    } else if (action === 'Show Diff') {
      const editor = await vscode.window.showTextDocument(document);
      editor.revealRange(contextRange, vscode.TextEditorRevealType.InCenter);
      // Apply with undo support so user can review
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(msg.fixApplied(true));
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showErrorMessage(msg.fixFailed(errMsg));
  } finally {
    statusMsg.dispose();
  }
}
