/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Generate Tests Command
 */

import * as vscode from 'vscode';
import { JiraClient, generateTestCases, createAIProvider, detectFramework } from 'ira-review';
import type { TestFramework, AIProviderType } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { resolveJiraCredentials, resolveAiApiKey } from '../utils/credentialPrompts';
import { suppressAutoReviewPopup } from '../services/autoReviewer';
import * as msg from '../utils/messages';
import * as cp from 'child_process';

const TEST_FRAMEWORKS: TestFramework[] = ['jest', 'vitest', 'mocha', 'playwright', 'cypress', 'gherkin', 'pytest', 'junit'];

export async function generateTests(): Promise<void> {
  const jiraKey = await vscode.window.showInputBox({
    prompt: msg.prompts.jiraTicket,
    placeHolder: msg.prompts.jiraTicketPlaceholder,
  });

  if (!jiraKey) return;

  const normalizedKey = jiraKey.trim().toUpperCase();

  const config = vscode.workspace.getConfiguration('ira');
  const defaultFramework = config.get<string>('testFramework', 'jest');

  const frameworkPick = await vscode.window.showQuickPick(
    TEST_FRAMEWORKS.map(f => ({ label: f, picked: f === defaultFramework })),
    { placeHolder: msg.prompts.testFramework },
  );

  if (!frameworkPick) return;

  const testFramework = frameworkPick.label as TestFramework;

  const jiraCreds = await resolveJiraCredentials();
  if (!jiraCreds) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.generateTests(testFramework), cancellable: false },
    async () => {
      suppressAutoReviewPopup(true);
      try {
        const jira = new JiraClient({ baseUrl: jiraCreds.url, email: jiraCreds.email, token: jiraCreds.token, type: jiraCreds.type });
        const issue = await jira.fetchIssue(normalizedKey);

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

        const aiProvider = config.get<string>('aiProvider', 'copilot');
        let result;

        if (aiProvider === 'copilot') {
          const copilot = new CopilotAIProvider();
          result = await generateTestCases(issue, testFramework, copilot, framework);
        } else {
          const aiApiKey = await resolveAiApiKey();
          if (!aiApiKey) return;
          const provider = createAIProvider({
            provider: aiProvider as AIProviderType,
            apiKey: aiApiKey,
            model: config.get<string>('aiModel', 'gpt-4o-mini'),
          });
          result = await generateTestCases(issue, testFramework, provider, framework);
        }

        if (result.testCases.length === 0) {
          vscode.window.showWarningMessage(msg.testGenEmpty(normalizedKey, result.parseWarning));
          return;
        }

        const output = result.testCases
          .map(tc => `// ${tc.type}: ${tc.description}\n// Criterion: ${tc.criterion}\n${tc.code}`)
          .join('\n\n');

        const languageMap: Record<string, string> = {
          jest: 'typescript',
          vitest: 'typescript',
          mocha: 'typescript',
          playwright: 'typescript',
          cypress: 'typescript',
          gherkin: 'gherkin',
          pytest: 'python',
          junit: 'java',
        };

        const doc = await vscode.workspace.openTextDocument({
          content: output,
          language: languageMap[testFramework] ?? 'plaintext',
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Generate Tests error:', message);
        vscode.window.showErrorMessage(msg.testGenFailed(message));
      } finally {
        suppressAutoReviewPopup(false);
      }
    },
  );
}

function execGit(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}
