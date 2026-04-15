import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { JiraClient } from 'ira-review';
import { validateJiraAC } from '../commands/validateJiraAC';

// Mock child_process — execGit uses cp.execFile(cmd, args, opts, cb)
let mockBranch = 'feature/PROJ-456-fix';
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: any, cb: Function) => {
    const fullCmd = [cmd, ...args].join(' ');
    if (fullCmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else if (fullCmd.includes('branch --show-current')) {
      cb(null, mockBranch);
    } else if (fullCmd.includes('diff HEAD')) {
      cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
    } else if (fullCmd.includes('diff')) {
      cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
    } else {
      cb(null, '');
    }
  }),
}));

// Mock CopilotAIProvider
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('# Validation Result\n\nAll ACs passed');
  });
  return { CopilotAIProvider };
});

// Mock AuthProvider
vi.mock('../services/authProvider', () => {
  const instance = {
    resolveScmSession: vi.fn().mockResolvedValue({ provider: 'github', accessToken: 'test-token' }),
  };
  return {
    AuthProvider: {
      getInstance: vi.fn(() => instance),
      init: vi.fn(),
    },
  };
});

// Mock markdownPreview
const mockOpenMarkdownPreview = vi.fn();
vi.mock('../utils/markdownPreview', () => ({
  openMarkdownPreview: (...args: any[]) => mockOpenMarkdownPreview(...args),
}));

// Mock resolveJiraCredentials
const mockResolveJiraCredentials = vi.fn().mockResolvedValue({
  url: 'https://jira.test.com',
  email: 'test@test.com',
  token: 'token',
  type: 'cloud',
});
vi.mock('../utils/credentialPrompts', () => ({
  resolveJiraCredentials: (...args: any[]) => mockResolveJiraCredentials(...args),
  resolveAiApiKey: vi.fn().mockResolvedValue('test-api-key'),
}));

// Override ira-review JiraClient mock for this file
const mockFetchIssue = vi.fn().mockResolvedValue({
  fields: {
    summary: 'Fix login bug',
    acceptanceCriteria: 'User can log in successfully',
    description: 'Login page should work',
  },
});

describe('validateJiraAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBranch = 'feature/PROJ-456-fix';
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'jiraAcField') return '';
        if (key === 'jiraAcSource') return 'both';
        return '';
      }),
    });
    mockResolveJiraCredentials.mockResolvedValue({
      url: 'https://jira.test.com',
      email: 'test@test.com',
      token: 'token',
      type: 'cloud',
    });
    // Override JiraClient.fetchIssue from setup.ts mock
    mockFetchIssue.mockResolvedValue({
      fields: {
        summary: 'Fix login bug',
        acceptanceCriteria: 'User can log in successfully',
        description: 'Login page should work',
      },
    });
    (JiraClient as any).mockImplementation(function (this: any) {
      this.fetchIssue = mockFetchIssue;
    });
    // Default: user picks "local changes"
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) My local changes', id: 'local' });
  });

  it('should show error if no workspace', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await validateJiraAC();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open — open a project first');
  });

  it('should detect JIRA ticket from branch name', async () => {
    await validateJiraAC();
    // Branch is 'feature/PROJ-456-fix', so no input prompt needed
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.window.withProgress).toHaveBeenCalled();
  });

  it('should prompt for ticket when not in branch', async () => {
    mockBranch = '';
    (vscode.window.showInputBox as any).mockResolvedValue('PROJ-789');

    await validateJiraAC();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
  });

  it('should return if user cancels ticket input', async () => {
    mockBranch = '';
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    await validateJiraAC();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should return if JIRA credentials not resolved', async () => {
    mockResolveJiraCredentials.mockResolvedValue(null);

    await validateJiraAC();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should show warning if no acceptance criteria found', async () => {
    mockFetchIssue.mockResolvedValue({
      fields: {
        summary: 'Fix login bug',
        acceptanceCriteria: undefined,
        description: undefined,
      },
    });

    await validateJiraAC();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No acceptance criteria'),
    );
  });

  it('should run validation and show results', async () => {
    await validateJiraAC();

    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(mockOpenMarkdownPreview).toHaveBeenCalled();
  });

  it('should show error when JIRA fetch fails', async () => {
    mockFetchIssue.mockRejectedValue(new Error('JIRA auth failed'));

    await validateJiraAC();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('JIRA auth failed'),
    );
  });

  it('should show warning when no diff found', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, mockBranch);
        } else if (fullCmd.includes('diff')) {
          cb(null, '');
        } else {
          cb(null, '');
        }
      },
    );

    await validateJiraAC();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No code changes'),
    );
  });

  it('should use customField AC source when configured', async () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'jiraAcField') return '';
        if (key === 'jiraAcSource') return 'customField';
        return '';
      }),
    });
    mockFetchIssue.mockResolvedValue({
      fields: {
        summary: 'Fix login bug',
        acceptanceCriteria: '',
        description: 'Some description with AC',
      },
    });

    await validateJiraAC();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No acceptance criteria'),
    );
  });

  it('should return if user cancels diff source pick', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue(undefined);

    await validateJiraAC();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });
});
