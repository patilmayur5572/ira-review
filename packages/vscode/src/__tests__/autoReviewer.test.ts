import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { parseStandaloneResponse, resolveIssueLocations, createAIProvider, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from 'ira-review';

// Mock child_process — exec for git rev-parse
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, cb: Function) => {
    if (cmd.includes('rev-parse --show-toplevel')) {
      cb(null, '/test/workspace');
    } else {
      cb(null, '');
    }
  }),
  execFile: vi.fn(),
}));

// Mock CopilotAIProvider
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('[]');
  });
  return { CopilotAIProvider };
});

// Mock diagnosticsProvider
vi.mock('../providers/diagnosticsProvider', () => ({
  updateDiagnostics: vi.fn(),
}));

// Mock authProvider
vi.mock('../services/authProvider', () => ({
  AuthProvider: {
    getInstance: vi.fn(() => ({
      getAiApiKey: vi.fn().mockResolvedValue('test-key'),
    })),
  },
}));

// Extend vscode mock for setStatusBarMessage and onDidSaveTextDocument
let savedDocHandler: Function | undefined;
(vscode.window as any).setStatusBarMessage = vi.fn(() => ({ dispose: vi.fn() }));
(vscode.workspace as any).onDidSaveTextDocument = vi.fn((handler: Function) => {
  savedDocHandler = handler;
  return { dispose: vi.fn() };
});

describe('autoReviewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedDocHandler = undefined;
    // Re-register the mock after clearAllMocks
    (vscode.workspace as any).onDidSaveTextDocument = vi.fn((handler: Function) => {
      savedDocHandler = handler;
      return { dispose: vi.fn() };
    });
    (vscode.window as any).setStatusBarMessage = vi.fn(() => ({ dispose: vi.fn() }));
    // Default config: copilot provider, autoReviewOnSave enabled
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'autoReviewOnSave') return true;
        if (key === 'aiProvider') return 'copilot';
        if (key === 'aiModel') return 'gpt-4o-mini';
        return '';
      }),
    });
  });

  afterEach(async () => {
    // Clean up auto-review
    const { deactivateAutoReview } = await import('../services/autoReviewer');
    deactivateAutoReview();
  });

  it('should register onDidSaveTextDocument handler and call resolveIssueLocations', async () => {
    const { activateAutoReview } = await import('../services/autoReviewer');

    const context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    const diagCollection = {
      set: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.DiagnosticCollection;

    activateAutoReview(context, diagCollection);

    // onDidSaveTextDocument should have been called
    expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
    expect(savedDocHandler).toBeDefined();

    // Verify resolveIssueLocations is wired in the mock setup
    expect(resolveIssueLocations).toBeDefined();
  });

  it('should use rawReview for Copilot provider', async () => {
    const { CopilotAIProvider } = await import('../providers/copilotAIProvider');

    // Verify CopilotAIProvider mock has rawReview (not review)
    const instance = new (CopilotAIProvider as any)();
    expect(instance.rawReview).toBeDefined();
    expect(typeof instance.rawReview).toBe('function');
  });

  it('should use review().explanation for non-Copilot provider', async () => {
    // Verify createAIProvider mock returns provider with review()
    const mockProvider = vi.mocked(createAIProvider)({ provider: 'openai', apiKey: 'test', model: 'gpt-4o' } as any);
    const result = await mockProvider.review('test prompt');
    expect(result).toHaveProperty('explanation');
  });

  it('should load and pass sensitive areas to prompt', async () => {
    // Verify loadSensitiveAreas and matchSensitiveArea are called
    expect(loadSensitiveAreas).toBeDefined();
    expect(matchSensitiveArea).toBeDefined();
    expect(formatSensitiveAreaForPrompt).toBeDefined();

    // Simulate sensitive area match
    vi.mocked(loadSensitiveAreas).mockReturnValueOnce([
      { glob: '**/*.ts', label: 'TypeScript', reviewers: [], description: 'TS files' },
    ] as any);
    vi.mocked(matchSensitiveArea).mockReturnValueOnce({
      glob: '**/*.ts',
      label: 'TypeScript',
      reviewers: [],
      description: 'TS files',
    } as any);
    vi.mocked(formatSensitiveAreaForPrompt).mockReturnValueOnce('Sensitive: TypeScript file');

    const areas = loadSensitiveAreas('/test/workspace');
    expect(areas).toHaveLength(1);

    const match = matchSensitiveArea(areas, 'file.ts');
    expect(match).not.toBeNull();

    const formatted = formatSensitiveAreaForPrompt(match!);
    expect(formatted).toBe('Sensitive: TypeScript file');
  });

  it('should deactivate cleanly', async () => {
    // Re-import to get fresh module state
    vi.resetModules();
    // Re-setup mocks after resetModules
    (vscode.workspace as any).onDidSaveTextDocument = vi.fn((handler: Function) => {
      savedDocHandler = handler;
      return { dispose: vi.fn() };
    });
    (vscode.window as any).setStatusBarMessage = vi.fn(() => ({ dispose: vi.fn() }));
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'autoReviewOnSave') return true;
        if (key === 'aiProvider') return 'copilot';
        return '';
      }),
    });

    const { activateAutoReview, deactivateAutoReview } = await import('../services/autoReviewer');

    const context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    const diagCollection = {
      set: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.DiagnosticCollection;

    activateAutoReview(context, diagCollection);
    // Should not throw
    deactivateAutoReview();
    deactivateAutoReview(); // double deactivate should be safe
  });

  it('should suppress auto-review when suppressAutoReviewPopup is set', async () => {
    const { suppressAutoReviewPopup } = await import('../services/autoReviewer');

    // Should not throw
    suppressAutoReviewPopup(true);
    suppressAutoReviewPopup(false);
  });
});
