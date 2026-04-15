import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { JiraClient, generateTestCases } from 'ira-review';
import { generateTests } from '../commands/generateTests';

// Mock child_process
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

// Mock CopilotAIProvider
vi.mock('../providers/copilotAIProvider', () => {
  const CopilotAIProvider = vi.fn(function (this: any) {
    this.rawReview = vi.fn().mockResolvedValue('test output');
  });
  return { CopilotAIProvider };
});

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

// Mock autoReviewer
vi.mock('../services/autoReviewer', () => ({
  suppressAutoReviewPopup: vi.fn(),
}));

// JiraClient and generateTestCases mocks are configured in beforeEach
// (using the ira-review mock from setup.ts)
const mockFetchIssue = vi.fn();
const mockGenerateTestCases = vi.fn();

describe('generateTests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'copilot';
        if (key === 'jiraAcField') return '';
        if (key === 'jiraAcSource') return 'both';
        if (key === 'testFramework') return 'jest';
        return '';
      }),
    });
    mockResolveJiraCredentials.mockResolvedValue({
      url: 'https://jira.test.com',
      email: 'test@test.com',
      token: 'token',
      type: 'cloud',
    });
    // Wire JiraClient mock from setup.ts
    mockFetchIssue.mockResolvedValue({
      fields: {
        summary: 'Test issue',
        acceptanceCriteria: 'AC1',
        description: 'Description',
      },
    });
    (JiraClient as any).mockImplementation(function (this: any) {
      this.fetchIssue = mockFetchIssue;
    });
    // Wire generateTestCases mock from setup.ts
    mockGenerateTestCases.mockResolvedValue({
      testCases: [
        { type: 'unit', description: 'should validate input', criterion: 'AC-1', code: 'it("should validate input", () => {});' },
      ],
      parseWarning: undefined,
    });
    (generateTestCases as any).mockImplementation((...args: any[]) => mockGenerateTestCases(...args));
    // Default: user provides ticket and picks framework
    (vscode.window.showInputBox as any).mockResolvedValue('PROJ-123');
    (vscode.window.showQuickPick as any).mockResolvedValue({ label: 'jest', picked: true });
  });

  it('should return if user cancels JIRA ticket input', async () => {
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    await generateTests();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should return if user cancels framework pick', async () => {
    (vscode.window.showInputBox as any).mockResolvedValue('PROJ-123');
    (vscode.window.showQuickPick as any).mockResolvedValue(undefined);

    await generateTests();
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should return if JIRA credentials not resolved', async () => {
    mockResolveJiraCredentials.mockResolvedValue(null);

    await generateTests();
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('should generate tests and show document', async () => {
    await generateTests();

    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('should show warning when no test cases generated', async () => {
    mockGenerateTestCases.mockResolvedValue({
      testCases: [],
      parseWarning: undefined,
    });

    await generateTests();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('PROJ-123'),
    );
  });

  it('should show error when JIRA fetch fails', async () => {
    mockFetchIssue.mockRejectedValue(new Error('JIRA timeout'));

    await generateTests();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('JIRA timeout'),
    );
  });

  it('should show warning with parse warning message', async () => {
    mockGenerateTestCases.mockResolvedValue({
      testCases: [],
      parseWarning: 'unexpected format',
    });

    await generateTests();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('unexpected format'),
    );
  });

  it('should use non-copilot AI provider', async () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'aiProvider') return 'openai';
        if (key === 'jiraAcField') return '';
        if (key === 'jiraAcSource') return 'both';
        if (key === 'testFramework') return 'jest';
        if (key === 'aiModel') return 'gpt-4o-mini';
        return '';
      }),
    });

    const { resolveAiApiKey } = await import('../utils/credentialPrompts');
    const { createAIProvider } = await import('ira-review');

    await generateTests();

    expect(resolveAiApiKey).toHaveBeenCalled();
    expect(createAIProvider).toHaveBeenCalled();
  });
});
