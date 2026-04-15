import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { suggestAC } from '../commands/suggestAC';

// Build a diff with at least 15 added lines
const fakeDiff = [
  'diff --git a/file.ts b/file.ts',
  '--- a/file.ts',
  '+++ b/file.ts',
  '@@ -1,3 +1,20 @@',
  ...Array.from({ length: 16 }, (_, i) => `+added line ${i + 1}`),
  ' context line',
].join('\n');

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: any, cb: Function) => {
    const fullCmd = [cmd, ...args].join(' ');
    if (fullCmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else if (fullCmd.includes('branch --show-current')) {
      cb(null, 'feature/PROJ-123-something');
    } else if (fullCmd.includes('diff')) {
      cb(null, fakeDiff);
    } else if (fullCmd.includes('log --oneline')) {
      cb(null, 'abc123 commit msg');
    } else if (fullCmd.includes('symbolic-ref')) {
      cb(null, 'refs/remotes/origin/main');
    } else if (fullCmd.includes('rev-parse --verify')) {
      cb(null, 'main');
    } else {
      cb(null, '');
    }
  }),
}));

// Mock CopilotAIProvider
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('Generated AC text');
  });
  return { CopilotAIProvider };
});

// Mock authProvider
vi.mock('../services/authProvider', () => ({
  AuthProvider: {
    getInstance: vi.fn(() => ({
      resolveScmSession: vi.fn(),
    })),
  },
}));

// Mock credentialPrompts
const mockResolveJiraCredentials = vi.fn().mockResolvedValue({
  url: 'https://jira.example.com',
  email: 'test@example.com',
  token: 'jira-token',
  type: 'cloud',
});
const mockResolveAiApiKey = vi.fn().mockResolvedValue('test-api-key');
vi.mock('../utils/credentialPrompts', () => ({
  resolveJiraCredentials: (...args: any[]) => mockResolveJiraCredentials(...args),
  resolveAiApiKey: (...args: any[]) => mockResolveAiApiKey(...args),
}));

// Mock markdownPreview
vi.mock('../utils/markdownPreview', () => ({
  openMarkdownPreview: vi.fn(),
}));

// Shared mock fns used by JiraClient instances and ira-review exports
const mockFetchIssue = vi.fn();
const mockFetchEpicAndSubtasks = vi.fn();
const mockHasIraACComment = vi.fn();
const mockAddComment = vi.fn();
const mockGenerateAcceptanceCriteria = vi.fn();
const mockFormatACsForJiraComment = vi.fn();

describe('suggestAC', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore the default execFile mock (tests that override it leave stale state)
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, 'feature/PROJ-123-something');
        } else if (fullCmd.includes('diff')) {
          cb(null, fakeDiff);
        } else if (fullCmd.includes('log --oneline')) {
          cb(null, 'abc123 commit msg');
        } else if (fullCmd.includes('symbolic-ref')) {
          cb(null, 'refs/remotes/origin/main');
        } else if (fullCmd.includes('rev-parse --verify')) {
          cb(null, 'main');
        } else {
          cb(null, '');
        }
      },
    );

    // Override the ira-review JiraClient from setup.ts with richer mock
    const iraReview = await import('ira-review');
    mockFetchIssue.mockResolvedValue({
      fields: { summary: 'Test issue', acceptanceCriteria: '', description: '' },
    });
    mockFetchEpicAndSubtasks.mockResolvedValue({ epicSummary: 'Epic summary', subtasks: [] });
    mockHasIraACComment.mockResolvedValue(false);
    mockAddComment.mockResolvedValue(undefined);
    (iraReview.JiraClient as any).mockImplementation(function (this: any) {
      this.fetchIssue = mockFetchIssue;
      this.fetchEpicAndSubtasks = mockFetchEpicAndSubtasks;
      this.hasIraACComment = mockHasIraACComment;
      this.addComment = mockAddComment;
    });

    // Override generateAcceptanceCriteria and formatACsForJiraComment
    mockGenerateAcceptanceCriteria.mockResolvedValue({
      jiraKey: 'PROJ-123',
      summary: 'Test summary',
      sources: ['diff'],
      criteria: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      reviewHints: [],
      totalCriteria: 1,
    });
    mockFormatACsForJiraComment.mockReturnValue('formatted comment');
    (iraReview as any).generateAcceptanceCriteria = mockGenerateAcceptanceCriteria;
    (iraReview as any).formatACsForJiraComment = mockFormatACsForJiraComment;

    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
    // Override withProgress to provide both progress and cancellation token
    (vscode.window.withProgress as any).mockImplementation(
      (opts: any, task: any) => task({ report: vi.fn() }, { isCancellationRequested: false }),
    );
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'jiraAcField') return '';
        if (key === 'jiraAcSource') return 'both';
        return '';
      }),
    });
    // Default: pick local diff source
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) My local changes', id: 'local' });
    // Reset credential mock
    mockResolveJiraCredentials.mockResolvedValue({
      url: 'https://jira.example.com',
      email: 'test@example.com',
      token: 'jira-token',
      type: 'cloud',
    });
  });

  it('should show error if no workspace', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await suggestAC();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No workspace folder open — open a project first',
    );
  });

  it('should detect JIRA ticket from branch name', async () => {
    await suggestAC();
    // Branch is 'feature/PROJ-123-something' so ticket is auto-detected — no input prompt needed
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
  });

  it('should prompt for ticket when not in branch name', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, '');
        } else if (fullCmd.includes('diff')) {
          cb(null, fakeDiff);
        } else if (fullCmd.includes('log --oneline')) {
          cb(null, 'abc123 commit msg');
        } else if (fullCmd.includes('symbolic-ref')) {
          cb(null, 'refs/remotes/origin/main');
        } else if (fullCmd.includes('rev-parse --verify')) {
          cb(null, 'main');
        } else {
          cb(null, '');
        }
      },
    );
    (vscode.window.showInputBox as any).mockResolvedValue('PROJ-456');

    await suggestAC();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
  });

  it('should return if user cancels ticket input', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, '');
        } else {
          cb(null, '');
        }
      },
    );
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    await suggestAC();
    expect(mockResolveJiraCredentials).not.toHaveBeenCalled();
  });

  it('should return if JIRA credentials not available', async () => {
    mockResolveJiraCredentials.mockResolvedValue(null);

    await suggestAC();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should show message if AC already exists', async () => {
    mockFetchIssue.mockResolvedValue({
      fields: {
        summary: 'Test issue',
        acceptanceCriteria: 'Existing AC content',
        description: '',
      },
    });

    await suggestAC();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('already has acceptance criteria'),
    );
  });

  it('should show error when JIRA fetch fails', async () => {
    mockFetchIssue.mockRejectedValue(new Error('JIRA connection refused'));

    await suggestAC();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('JIRA connection refused'),
    );
  });

  it('should show message when diff has too few added lines', async () => {
    const smallDiff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,8 @@',
      ...Array.from({ length: 5 }, (_, i) => `+added line ${i + 1}`),
      ' context line',
    ].join('\n');
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, 'feature/PROJ-123-something');
        } else if (fullCmd.includes('diff')) {
          cb(null, smallDiff);
        } else if (fullCmd.includes('log --oneline')) {
          cb(null, 'abc123 commit msg');
        } else if (fullCmd.includes('symbolic-ref')) {
          cb(null, 'refs/remotes/origin/main');
        } else if (fullCmd.includes('rev-parse --verify')) {
          cb(null, 'main');
        } else {
          cb(null, '');
        }
      },
    );
    mockFetchIssue.mockResolvedValue({
      fields: { summary: 'Test issue', acceptanceCriteria: '', description: '' },
    });

    await suggestAC();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Not enough code changes'),
    );
  });

  it('should show warning when no code changes found', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, cb: Function) => {
        const fullCmd = [cmd, ...args].join(' ');
        if (fullCmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/workspace');
        } else if (fullCmd.includes('branch --show-current')) {
          cb(null, 'feature/PROJ-123-something');
        } else if (fullCmd.includes('diff')) {
          cb(null, '');
        } else if (fullCmd.includes('symbolic-ref')) {
          cb(null, 'refs/remotes/origin/main');
        } else if (fullCmd.includes('rev-parse --verify')) {
          cb(null, 'main');
        } else {
          cb(null, '');
        }
      },
    );
    mockFetchIssue.mockResolvedValue({
      fields: { summary: 'Test issue', acceptanceCriteria: '', description: '' },
    });

    await suggestAC();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No code changes'),
    );
  });

});
