import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { parseStandaloneResponse, resolveIssueLocations } from 'ira-review';
import { reviewFile } from '../commands/reviewFile';

// Mock child_process — execGit uses cp.execFile(cmd, args, opts, cb)
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: any, cb: Function) => {
    const fullCmd = [cmd, ...args].join(' ');
    if (fullCmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else {
      cb(null, '');
    }
  }),
}));

// Mock CopilotAIProvider at top level so it's available before module import
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('raw review response');
  });
  return { CopilotAIProvider };
});

vi.mock('../extension', () => ({
  setLastResult: vi.fn(),
}));

vi.mock('../services/ollamaSetup', () => ({
  isNoAIProviderError: vi.fn(() => false),
  showAISetupPrompt: vi.fn(),
}));

vi.mock('../utils/credentialPrompts', () => ({
  resolveAiApiKey: vi.fn().mockResolvedValue('test-key'),
}));

vi.mock('../providers/diagnosticsProvider', () => ({
  updateDiagnostics: vi.fn(),
}));

vi.mock('../providers/statusBarProvider', () => ({
  updateStatusBar: vi.fn(),
}));

// ─── Helper factories ───────────────────────────────────────

function makeContext(): vscode.ExtensionContext {
  return {
    secrets: {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

function makeDiagnosticCollection(): vscode.DiagnosticCollection {
  return { set: vi.fn(), clear: vi.fn(), dispose: vi.fn() } as unknown as vscode.DiagnosticCollection;
}

function makeStatusBar(): vscode.StatusBarItem {
  return { text: '', color: undefined, tooltip: '', command: '', show: vi.fn(), dispose: vi.fn() } as unknown as vscode.StatusBarItem;
}

function makeTreeProvider() {
  return { update: vi.fn() } as any;
}

function makeCodeLensProvider() {
  return { update: vi.fn() } as any;
}

describe('reviewFile', () => {
  let context: vscode.ExtensionContext;
  let diagnosticCollection: vscode.DiagnosticCollection;
  let statusBar: vscode.StatusBarItem;
  let treeProvider: ReturnType<typeof makeTreeProvider>;
  let codeLensProvider: ReturnType<typeof makeCodeLensProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeContext();
    diagnosticCollection = makeDiagnosticCollection();
    statusBar = makeStatusBar();
    treeProvider = makeTreeProvider();
    codeLensProvider = makeCodeLensProvider();

    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });
  });

  it('should show error if no active editor', async () => {
    (vscode.window as any).activeTextEditor = undefined;

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No file open — open a file to review');
  });

  it('should show warning if file is empty', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => '',
      },
    };

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Nothing to review — this file is empty');
  });

  it('should run copilot review and show success message', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([
      {
        line: 1,
        category: 'test',
        severity: 'MAJOR',
        message: 'issue',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
        evidence: 'variable x is assigned but never used in any subsequent code path',
      },
    ] as any);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('issue'),
    );
  });

  it('should show clean code message when no issues found', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([]);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Clean code'),
    );
  });

  it('should show error message when AI provider throws', async () => {
    const { CopilotAIProvider } = await import('../providers/copilotAIProvider');
    vi.mocked(CopilotAIProvider).mockImplementationOnce(function (this: any) {
      this.rawReview = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));
    } as any);

    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('API rate limit exceeded'),
    );
  });

  it('should show AI setup prompt when no AI provider error', async () => {
    const { CopilotAIProvider } = await import('../providers/copilotAIProvider');
    const { isNoAIProviderError, showAISetupPrompt } = await import('../services/ollamaSetup');

    vi.mocked(CopilotAIProvider).mockImplementationOnce(function (this: any) {
      this.rawReview = vi.fn().mockRejectedValue(new Error('No AI provider'));
    } as any);
    vi.mocked(isNoAIProviderError).mockReturnValueOnce(true);

    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(showAISetupPrompt).toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('should handle git rev-parse failure gracefully', async () => {
    const cp = await import('child_process');
    vi.mocked(cp.execFile).mockImplementationOnce(((cmd: string, args: string[], opts: any, cb: Function) => {
      const fullCmd = [cmd, ...args].join(' ');
      if (fullCmd.includes('rev-parse --show-toplevel')) {
        cb(new Error('not a git repo'));
      } else {
        cb(null, '');
      }
    }) as any);

    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([]);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it('should not filter out issues without evidence field (v2.0.2 regression)', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    // Issue with NO evidence — was previously filtered out by the evidence check
    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([
      {
        line: 1,
        category: 'security',
        severity: 'MAJOR',
        message: 'SQL injection risk',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
        // evidence is undefined — AI prompt doesn't request it
      },
    ] as any);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    // Issue should NOT be dropped — the evidence filter was removed
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('issue'),
    );
  });

  it('should not filter out issues with short evidence field (v2.0.2 regression)', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    // Issue with short evidence (< 20 chars) — was previously filtered out
    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([
      {
        line: 1,
        category: 'test',
        severity: 'MAJOR',
        message: 'unused var',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
        evidence: 'short',
      },
    ] as any);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('issue'),
    );
  });

  it('should call resolveIssueLocations for line resolution (v2.0.2 regression)', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;\nconst y = 2;',
      },
    };

    const mockIssues = [
      {
        line: 1,
        category: 'test',
        severity: 'MAJOR',
        message: 'test issue',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
      },
    ];

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce(mockIssues as any);
    vi.mocked(resolveIssueLocations).mockReturnValueOnce(mockIssues as any);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    // resolveIssueLocations should be called with the raw issues and file content
    expect(resolveIssueLocations).toHaveBeenCalledWith(mockIssues, 'const x = 1;\nconst y = 2;');
  });

  it('should handle AI returning issues with out-of-range line numbers', async () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'line1\nline2\nline3',
      },
    };

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([
      {
        line: 999,
        category: 'test',
        severity: 'MAJOR',
        message: 'out of range issue',
        explanation: 'exp',
        impact: 'imp',
        suggestedFix: 'fix',
        evidence: 'variable at line 999 references undefined scope which causes runtime crash',
      },
    ] as any);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('issue'),
    );
  });

  it('should use non-copilot AI provider when configured', async () => {
    const { createAIProvider } = await import('ira-review');
    const { resolveAiApiKey } = await import('../utils/credentialPrompts');

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'openai';
        if (key === 'aiModel') return 'gpt-4o-mini';
        return '';
      }),
    });

    vi.mocked(resolveAiApiKey).mockResolvedValueOnce('test-key');
    vi.mocked(createAIProvider).mockReturnValueOnce({
      review: vi.fn().mockResolvedValue({ explanation: 'openai response', impact: '', suggestedFix: '' }),
    } as any);

    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    vi.mocked(parseStandaloneResponse).mockReturnValueOnce([]);
    vi.mocked(resolveIssueLocations).mockImplementationOnce((issues: any) => issues);

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(createAIProvider).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it('should return early when non-copilot provider and no API key', async () => {
    const { createAIProvider } = await import('ira-review');
    const { resolveAiApiKey } = await import('../utils/credentialPrompts');

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'openai';
        return '';
      }),
    });

    vi.mocked(resolveAiApiKey).mockResolvedValueOnce(undefined as any);

    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/workspace/file.ts', path: 'file.ts' },
        getText: () => 'const x = 1;',
      },
    };

    await reviewFile(context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);

    expect(createAIProvider).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });
});
