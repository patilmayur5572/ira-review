/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * One-click "Apply Fix"
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { AuthProvider } from './authProvider';
import { createAIProvider, loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from 'ira-review';
import type { ReviewComment } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import * as msg from '../utils/messages';

/** Detect language from file extension for better AI context. */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript', '.jsx': 'JavaScript (React)',
    '.py': 'Python', '.java': 'Java', '.kt': 'Kotlin',
    '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby',
    '.cs': 'C#', '.cpp': 'C++', '.c': 'C',
    '.swift': 'Swift', '.php': 'PHP', '.scala': 'Scala',
    '.vue': 'Vue', '.svelte': 'Svelte',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    '.sql': 'SQL', '.sh': 'Shell', '.yaml': 'YAML', '.yml': 'YAML',
  };
  return map[ext] ?? 'Unknown';
}

/**
 * Send a raw-text prompt (no JSON parsing).
 * Uses CopilotAIProvider.rawReview() when available; falls back to
 * creating a one-off OpenAI-compatible call that skips parseAIResponse.
 */
async function sendRawPrompt(prompt: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('ira');
  const providerName = config.get<string>('aiProvider') ?? 'copilot';

  if (providerName === 'copilot') {
    return new CopilotAIProvider().rawReview(prompt);
  }

  if (providerName === 'amp') {
    const { AmpAIProvider, isAmpCliAvailable } = await import('../providers/ampAIProvider');
    if (!isAmpCliAvailable()) {
      throw new Error('AMP CLI not found — install it from ampcode.com/install and run `amp login`');
    }
    const ampMode = config.get<string>('ampMode', 'smart') as 'smart' | 'rush' | 'deep';
    return new AmpAIProvider(ampMode).rawReview(prompt);
  }

  // For external providers, call review() and extract the explanation field,
  // which is where parseAIResponse puts non-JSON responses.
  const aiProvider = createAIProvider({
    provider: providerName as 'openai' | 'azure-openai' | 'anthropic' | 'ollama',
    model: config.get<string>('aiModel') ?? 'gpt-4o-mini',
    apiKey: await AuthProvider.getInstance().getAiApiKey(),
  });
  const response = await aiProvider.review(prompt);
  return response.explanation;
}

export async function applyFix(comment: ReviewComment, onFixApplied?: () => void): Promise<void> {
  const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
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
    const language = detectLanguage(comment.filePath);
    const fullFileText = document.getText();
    const totalLines = document.lineCount;

    // ±30-line read-only context window
    const issueLine = Math.max(0, comment.line - 1);
    const contextStart = Math.max(0, issueLine - 30);
    const contextEnd = Math.min(totalLines - 1, issueLine + 30);
    const contextRange = new vscode.Range(contextStart, 0, contextEnd, Number.MAX_SAFE_INTEGER);
    const targetCode = document.getText(contextRange);

    // ±5-line narrow fix range — the lines the LLM is allowed to change
    const fixStart = Math.max(0, issueLine - 5);
    const fixEnd = Math.min(totalLines - 1, issueLine + 5);
    const fixRange = new vscode.Range(fixStart, 0, fixEnd, Number.MAX_SAFE_INTEGER);
    const fixTargetCode = document.getText(fixRange);

    // Load custom team rules and sensitive areas
    const teamRules = loadRulesFile(workspaceRoot);
    const filteredRules = filterRulesByPath(teamRules, comment.filePath);
    const rulesSection = formatRulesForPrompt(filteredRules);
    const sensitiveAreas = loadSensitiveAreas(workspaceRoot);
    const sensitiveMatch = matchSensitiveArea(sensitiveAreas, comment.filePath);
    const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : '';

    const prompt = `You are a senior ${language} developer applying a minimal, surgical fix to a code issue.

## Full File (read-only context — do NOT return this)
File: ${comment.filePath}
Language: ${language}

\`\`\`${language.toLowerCase().split(' ')[0]}
${fullFileText}
\`\`\`

## Surrounding Context (read-only — do NOT return this)
Lines ${contextStart + 1}-${contextEnd + 1}:
\`\`\`
${targetCode}
\`\`\`

## Issue
Line ${comment.line}: [${comment.rule}] ${comment.severity}
Message: ${comment.message}
Explanation: ${comment.aiReview.explanation}
Impact: ${comment.aiReview.impact}
Suggested approach: ${comment.aiReview.suggestedFix}

## Code to Fix (lines ${fixStart + 1}-${fixEnd + 1})
\`\`\`
${fixTargetCode}
\`\`\`
${rulesSection ? `\n## Team Rules (the fix MUST comply with these)\n${rulesSection}\n` : ''}${sensitiveContext ? `\n## Sensitive Area\n${sensitiveContext}\nApply extra care — this is a critical code path.\n` : ''}
## Rules
- Return ONLY the corrected version of the "Code to Fix" section (lines ${fixStart + 1}-${fixEnd + 1}).
- Do NOT return the surrounding context, the full file, or any lines outside the target range.
- Change the MINIMUM lines needed. If only 1 line needs changing, return all ${fixEnd - fixStart + 1} lines with only that 1 line modified.
- Preserve existing code style, indentation, formatting, and variable names exactly.
- Do NOT refactor, rename, reformat, reorder, or "improve" any code beyond the specific issue.
- Do NOT add comments explaining the fix.
- The fix must NOT change behavior unrelated to the reported issue.${rulesSection ? '\n- The fix MUST comply with all Team Rules listed above. Do NOT introduce violations of team standards while fixing the issue.' : ''}
- No markdown fences in your response — return raw code only.
- If the issue cannot be fixed within these ${fixEnd - fixStart + 1} lines, respond with exactly: NO_FIX_POSSIBLE`;

    const rawResponse = await sendRawPrompt(prompt);
    const fixedCode = rawResponse
      .replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '')
      .trimEnd();

    // A1d: NO_FIX_POSSIBLE escape hatch
    if (fixedCode.trim() === 'NO_FIX_POSSIBLE') {
      vscode.window.showInformationMessage(
        'IRA: This issue requires a broader change — review the suggested fix manually.',
      );
      return;
    }

    // A2a: Reject empty output
    if (!fixedCode.trim()) {
      vscode.window.showWarningMessage('IRA: Fix generation returned empty — no changes applied.');
      return;
    }

    // A2b: Reject no-op (LLM returned identical code)
    if (fixedCode.trimEnd() === fixTargetCode.trimEnd()) {
      vscode.window.showInformationMessage('IRA: Code already looks correct — no changes needed.');
      return;
    }

    // A2c: Reject oversized output using a ratio guard
    const inputLineCount = fixTargetCode.split('\n').length;
    const outputLineCount = fixedCode.split('\n').length;
    const maxAllowedLines = Math.floor(inputLineCount * 1.5) + 3;
    if (outputLineCount > maxAllowedLines) {
      vscode.window.showWarningMessage(
        `IRA: Generated fix is too large (${outputLineCount} lines vs ${inputLineCount} input). Review the suggestion manually.`,
      );
      return;
    }

    // A3: Diff view as default UX
    // Build the proposed full-file content by splicing the fix into the original
    const proposedContent =
      fullFileText.substring(0, document.offsetAt(fixRange.start))
      + fixedCode
      + fullFileText.substring(document.offsetAt(fixRange.end));

    const ext = path.extname(comment.filePath);
    const tmpPath = path.join(os.tmpdir(), `ira-fix-preview-${Date.now()}${ext}`);
    const tmpUri = vscode.Uri.file(tmpPath);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(tmpUri, encoder.encode(proposedContent));

    try {
      // Open side-by-side diff as the primary UX
      await vscode.commands.executeCommand(
        'vscode.diff',
        fileUri,
        tmpUri,
        `IRA Fix: [${comment.rule}] ${comment.filePath}:${comment.line}`,
      );

      const action = await vscode.window.showInformationMessage(
        `Review the proposed fix for line ${comment.line}`,
        'Accept Fix',
        'Reject',
      );

      if (action === 'Accept Fix') {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(fileUri, fixRange, fixedCode);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(msg.fixApplied(true));
        onFixApplied?.();
      }
    } finally {
      // Always clean up temp file
      try { await vscode.workspace.fs.delete(tmpUri); } catch {}
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showErrorMessage(msg.fixFailed(errMsg));
  } finally {
    statusMsg.dispose();
  }
}
