import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { generatePRDescription } from '../commands/generatePRDescription';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, cb: Function) => {
    if (cmd.includes('branch --show-current')) {
      cb(null, 'feature/PROJ-123-add-feature');
    } else if (cmd.includes('remote get-url')) {
      cb(null, 'https://github.com/owner/repo.git');
    } else if (cmd.includes('diff main...HEAD')) {
      cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
    } else {
      cb(null, '');
    }
  }),
}));

// Mock CopilotAIProvider at top level so it's available before module import
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('# PR Description\n\nGenerated content');
  });
  return { CopilotAIProvider };
});

describe('generatePRDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
  });

  it('should show error if no workspace', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await generatePRDescription();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('IRA: No workspace folder open.');
  });

  it('should show quick pick with two options', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue(undefined);
    await generatePRDescription();
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    const args = (vscode.window.showQuickPick as any).mock.calls[0];
    expect(args[0]).toHaveLength(2);
    expect(args[0][0].value).toBe('pr');
    expect(args[0][1].value).toBe('local');
  });

  it('should do nothing if user cancels quick pick', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue(undefined);
    await generatePRDescription();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should use local diff when "No PR yet" is selected', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'No PR yet', value: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('should detect JIRA ticket from branch name', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'No PR yet', value: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'jiraUrl') return 'https://jira.example.com';
        if (key === 'jiraEmail') return 'test@example.com';
        if (key === 'jiraToken') return 'jira-token';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.withProgress).toHaveBeenCalled();
    // JIRA client should have been instantiated (branch has PROJ-123)
    const { JiraClient } = await import('ira-review');
    expect(JiraClient).toHaveBeenCalled();
  });

  it('should request PR number when "I have a PR" is selected', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'I have a PR', value: 'pr' });
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'scmProvider') return 'github';
        if (key === 'githubToken') return 'test-token';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
  });

  it('should handle user cancelling PR number input', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'I have a PR', value: 'pr' });
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'githubToken') return 'test-token';
        if (key === 'scmProvider') return 'github';
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('PR number is required'),
    );
  });
});
