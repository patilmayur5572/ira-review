/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Generate Tests Command
 */

import * as vscode from 'vscode';
import { JiraClient, generateTestCases, createAIProvider, detectFramework } from 'ira-review';
import type { TestFramework, AIProviderType } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';

const TEST_FRAMEWORKS: TestFramework[] = ['jest', 'vitest', 'mocha', 'playwright', 'cypress', 'gherkin', 'pytest', 'junit'];

export async function generateTests(): Promise<void> {
  const jiraKey = await vscode.window.showInputBox({
    prompt: 'Enter the JIRA ticket key',
    placeHolder: 'e.g. PROJ-123',
  });

  if (!jiraKey) return;

  const config = vscode.workspace.getConfiguration('ira');
  const defaultFramework = config.get<string>('testFramework', 'jest');

  const frameworkPick = await vscode.window.showQuickPick(
    TEST_FRAMEWORKS.map(f => ({ label: f, picked: f === defaultFramework })),
    { placeHolder: 'Select a test framework' },
  );

  if (!frameworkPick) return;

  const testFramework = frameworkPick.label as TestFramework;

  const jiraUrl = config.get<string>('jiraUrl', '');
  const jiraEmail = config.get<string>('jiraEmail', '');
  const jiraToken = config.get<string>('jiraToken', '');

  if (!jiraUrl || !jiraEmail || !jiraToken) {
    vscode.window.showErrorMessage('IRA: JIRA configuration is missing. Go to Settings → IRA to set jiraUrl, jiraEmail, and jiraToken.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'IRA: Generating Tests...', cancellable: false },
    async () => {
      try {
        const jira = new JiraClient({ baseUrl: jiraUrl, email: jiraEmail, token: jiraToken });
        const issue = await jira.fetchIssue(jiraKey);

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
          result = await generateTestCases(issue, testFramework, provider, framework);
        }

        if (result.testCases.length === 0) {
          vscode.window.showWarningMessage(
            `IRA: No test cases generated for ${jiraKey}.${result.parseWarning ? ` (${result.parseWarning})` : ''}`,
          );
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
        vscode.window.showErrorMessage(`IRA: Failed to generate tests — ${message}`);
      }
    },
  );
}
