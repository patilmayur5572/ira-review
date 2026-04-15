import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { generatePRDescription } from '../commands/generatePRDescription';
import { AuthProvider } from '../services/authProvider';

// Mock child_process — execGit uses cp.execFile(cmd, args, opts, cb)
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: any, cb: Function) => {
    const fullCmd = [cmd, ...args].join(' ');
    if (fullCmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else if (fullCmd.includes('branch --show-current')) {
      cb(null, 'feature/PROJ-123-add-feature');
    } else if (fullCmd.includes('remote get-url')) {
      cb(null, 'https://github.com/owner/repo.git');
    } else if (fullCmd.includes('symbolic-ref')) {
      cb(null, 'refs/remotes/origin/main');
    } else if (fullCmd.includes('diff')) {
      cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
    } else if (fullCmd.includes('rev-parse --verify')) {
      cb(null, 'main');
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
    // Reset and reinitialize AuthProvider singleton so generatePRDescription can use it
    (AuthProvider as any).instance = undefined;
    AuthProvider.init({
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext);
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
  });

  it('should show error if no workspace', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await generatePRDescription();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open — open a project first');
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
    // PR number prompt is shown before progress toast
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
    // PR number prompt happens before progress — cancelling silently returns
    expect(vscode.window.showInputBox).toHaveBeenCalled();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should show error when AI provider fails', async () => {
    const { CopilotAIProvider } = await import('../providers/copilotAIProvider');
    (CopilotAIProvider as any).mockImplementation(function (this: any) {
      this.rawReview = vi.fn().mockRejectedValue(new Error('Model overloaded'));
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'No PR yet', value: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Model overloaded'),
    );
  });

  it('should handle empty diff gracefully', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(null, 'refs/remotes/origin/main');
      } else if (fullCmd.includes('diff')) {
        cb(null, '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'main');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'No PR yet', value: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No diff found'),
    );
  });

  it('should truncate large diffs', async () => {
    const { CopilotAIProvider } = await import('../providers/copilotAIProvider');
    (CopilotAIProvider as any).mockImplementation(function (this: any) {
      this.rawReview = vi.fn().mockResolvedValue('# PR Description\n\nGenerated content');
    });

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/test');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(null, 'refs/remotes/origin/main');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'x'.repeat(200000));
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'main');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'No PR yet', value: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await generatePRDescription();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });
});
