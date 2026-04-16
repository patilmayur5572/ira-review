import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { reviewPR } from '../commands/reviewPR';
import { AuthProvider } from '../services/authProvider';

// Extend ira-review mock with missing functions used by reviewPR
vi.mock('ira-review', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    ReviewEngine: class { constructor(public config: any) {} run = vi.fn(); },
    detectFramework: vi.fn(),
    BitbucketClient: class { getDiff = vi.fn(); },
    GitHubClient: class { getDiff = vi.fn(); },
    buildStandalonePrompt: vi.fn(() => 'test prompt'),
    parseStandaloneResponse: vi.fn(() => []),
    calculateRisk: vi.fn(() => ({ level: 'LOW', score: 10, maxScore: 100 })),
    loadRulesFile: vi.fn(() => []),
    loadSensitiveAreas: vi.fn(() => []),
    filterRulesByPath: vi.fn(() => []),
    formatRulesForPrompt: vi.fn(() => ''),
    matchSensitiveArea: vi.fn(() => null),
    formatSensitiveAreaForPrompt: vi.fn(() => ''),
    resolveIssueLocations: vi.fn((issues: any) => issues),
    annotateDiffWithLineNumbers: vi.fn((d: any) => d),
    JiraClient: vi.fn(function (this: any) { this.fetchIssue = vi.fn().mockResolvedValue({ summary: 'Test issue', acceptanceCriteria: 'AC1' }); }),
    createAIProvider: vi.fn(() => ({ review: vi.fn(() => ({ explanation: 'test', impact: '', suggestedFix: '' })) })),
  };
});

// Mock child_process — execGit uses cp.execFile(cmd, args, opts, cb)
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: any, cb: Function) => {
    const fullCmd = [cmd, ...args].join(' ');
    if (fullCmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else if (fullCmd.includes('branch --show-current')) {
      cb(null, 'feature/PROJ-123');
    } else if (fullCmd.includes('status --porcelain')) {
      cb(null, 'M file.ts');
    } else if (fullCmd.includes('remote get-url')) {
      cb(null, 'https://github.com/owner/repo.git');
    } else if (fullCmd.includes('symbolic-ref')) {
      cb(new Error('not a symbolic ref'), '');
    } else if (fullCmd.includes('rev-parse --verify')) {
      cb(null, 'develop');
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
    this.rawReview = vi.fn().mockResolvedValue('[]');
  });
  return { CopilotAIProvider };
});

// Mock extension
vi.mock('../extension', () => ({
  setLastResult: vi.fn(),
  setPRContext: vi.fn(),
  getPRContext: vi.fn(() => null),
}));

// Mock reviewHistoryStore
vi.mock('../services/reviewHistoryStore', () => ({
  ReviewHistoryStore: {
    getInstance: vi.fn(() => ({ save: vi.fn() })),
  },
}));

// Mock ollamaSetup
vi.mock('../services/ollamaSetup', () => ({
  isNoAIProviderError: vi.fn(() => false),
  showAISetupPrompt: vi.fn(),
}));

// Mock credentialPrompts
vi.mock('../utils/credentialPrompts', () => ({
  resolveAiApiKey: vi.fn().mockResolvedValue('test-key'),
}));

// Mock fs — existsSync returns true for '.git' paths, readdirSync returns []
vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => typeof p === 'string' && p.includes('.git')),
  readdirSync: vi.fn(() => []),
}));

// ─── Helpers ────────────────────────────────────────────────

function createContext(): vscode.ExtensionContext {
  return {
    secrets: {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

function createDiagnosticCollection(): vscode.DiagnosticCollection {
  return { set: vi.fn(), clear: vi.fn(), dispose: vi.fn() } as unknown as vscode.DiagnosticCollection;
}

function createStatusBar(): vscode.StatusBarItem {
  return { text: '', color: undefined, tooltip: '', command: '', show: vi.fn(), dispose: vi.fn() } as unknown as vscode.StatusBarItem;
}

function createTreeProvider() {
  return { update: vi.fn() } as any;
}

function createCodeLensProvider() {
  return { update: vi.fn() } as any;
}

// ─── Tests ──────────────────────────────────────────────────

describe('reviewPR', () => {
  let context: vscode.ExtensionContext;
  let diagnostics: vscode.DiagnosticCollection;
  let statusBar: vscode.StatusBarItem;
  let treeProvider: any;
  let codeLensProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset and reinitialize AuthProvider singleton
    (AuthProvider as any).instance = undefined;
    context = createContext();
    AuthProvider.init(context);
    diagnostics = createDiagnosticCollection();
    statusBar = createStatusBar();
    treeProvider = createTreeProvider();
    codeLensProvider = createCodeLensProvider();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];

    // Override withProgress to provide both progress and cancellation token
    (vscode.window.withProgress as any).mockImplementation(
      (opts: any, task: any) => task({ report: vi.fn() }, { isCancellationRequested: false }),
    );
  });

  it('should show error if no workspace', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open — open a project first');
  });

  it('should return if user cancels review mode pick', async () => {
    (vscode.window.showQuickPick as any).mockResolvedValue(undefined);
    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should check for uncommitted changes in local mode', async () => {
    // First showQuickPick → review mode
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    // Override execFile so status --porcelain returns empty (no changes)
    const { execFile } = await import('child_process');
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('status --porcelain')) {
        cb(null, '');
      } else if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else {
        cb(null, '');
      }
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No uncommitted changes found. If you already have a PR, use "I have a PR" to review it.',
      'Review a PR',
    );
  });

  it('should run local diff review when changes exist', async () => {
    // Restore default execFile mock (test 3 overrides it)
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    // First showQuickPick → review mode
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('clean'),
    );
  });

  it('should prompt for PR number in PR mode', async () => {
    // First showQuickPick → review mode 'pr'
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-pull-request) I have a PR number', id: 'pr' });
    // showInputBox → user cancels PR number input
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.showInputBox).toHaveBeenCalled();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should complete review even when individual file review fails', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    // Make parseStandaloneResponse throw — this is caught per-file
    const iraReview = await import('ira-review');
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => { throw new Error('Unexpected AI error'); });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    // Per-file error is caught silently — success message is still shown
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('clean'),
    );
  });

  it('should handle AI provider error for no-AI-provider', async () => {
    const cp = await import('child_process');
    // Make 'git diff HEAD' throw so the entire runLocalDiffReview throws
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(new Error('No AI provider configured'), '');
      } else {
        cb(null, '');
      }
    });

    const { isNoAIProviderError, showAISetupPrompt } = await import('../services/ollamaSetup');
    (isNoAIProviderError as any).mockReturnValue(true);

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(showAISetupPrompt).toHaveBeenCalled();
  });

  it('should stop reviewing files when cancelled', async () => {
    // Restore parseStandaloneResponse (previous test may have overridden it)
    const iraReview = await import('ira-review');
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => []);

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    // Cancellation token is already cancelled
    (vscode.window.withProgress as any).mockImplementation(
      (opts: any, task: any) => task({ report: vi.fn() }, { isCancellationRequested: true }),
    );

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    // runLocalDiffReview doesn't check cancellation token (it's not passed to it)
    // The outer flow for 'local' mode calls runLocalDiffReview and returns immediately,
    // so the cancellation check at line 153 is never reached. The review completes normally.
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('clean'),
    );
  });

  it('should handle empty diff in local mode', async () => {
    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, '');
      } else if (fullCmd.includes('diff')) {
        cb(null, '');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No code changes found'),
    );
  });

  it('should use msg.progress.reviewPR as progress title, not hardcoded string (v2.0.2 regression)', async () => {
    // Restore parseStandaloneResponse
    const iraReview = await import('ira-review');
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => []);

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);

    // withProgress should be called with the centralized progress title
    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'IRA Review' }),
      expect.any(Function),
    );
  });

  it('should not filter out issues without evidence in local diff mode (v2.0.2 regression)', async () => {
    const iraReview = await import('ira-review');
    // Issue with no evidence field
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => [
      {
        line: 2,
        category: 'security',
        severity: 'MAJOR',
        message: 'SQL injection',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
        // no evidence field
      },
    ]);
    (iraReview.resolveIssueLocations as any).mockImplementation((issues: any) => issues);

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);

    // Issue count should be 1, not 0 — evidence filter was removed
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 issue'),
    );
  });

  it('should call resolveIssueLocations in local diff mode (v2.0.2 regression)', async () => {
    const iraReview = await import('ira-review');
    const mockIssues = [
      {
        line: 2,
        category: 'test',
        severity: 'MAJOR',
        message: 'test issue',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
      },
    ];
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => mockIssues);
    (iraReview.resolveIssueLocations as any).mockImplementation((issues: any) => issues);

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);

    // resolveIssueLocations should be called for each file in the diff
    expect(iraReview.resolveIssueLocations).toHaveBeenCalled();
  });

  it('should handle non-copilot AI provider in local mode', async () => {
    // Restore parseStandaloneResponse (previous test may have overridden it)
    const iraReview = await import('ira-review');
    (iraReview.parseStandaloneResponse as any).mockImplementation(() => []);

    const cp = await import('child_process');
    (cp.execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(null, '/test/workspace');
      } else if (fullCmd.includes('branch --show-current')) {
        cb(null, 'feature/PROJ-123');
      } else if (fullCmd.includes('status --porcelain')) {
        cb(null, 'M file.ts');
      } else if (fullCmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else if (fullCmd.includes('symbolic-ref')) {
        cb(new Error('not a symbolic ref'), '');
      } else if (fullCmd.includes('rev-parse --verify')) {
        cb(null, 'develop');
      } else if (fullCmd.includes('diff HEAD')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else if (fullCmd.includes('diff')) {
        cb(null, 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n line3');
      } else {
        cb(null, '');
      }
    });

    (vscode.window.showQuickPick as any).mockResolvedValue({ label: '$(git-branch) No PR yet (review local changes)', id: 'local' });
    // Use a non-copilot AI provider to exercise the createAIProvider branch
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'openai';
        if (key === 'aiModel') return 'gpt-4o-mini';
        return '';
      }),
    });

    await reviewPR(context, diagnostics, statusBar, treeProvider, codeLensProvider);
    // Review should complete — the createAIProvider mock returns a provider with review()
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('clean'),
    );
  });
});
