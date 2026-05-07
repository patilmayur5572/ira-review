import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

import * as vscode from 'vscode';

// setup.ts doesn't expose ConfigurationTarget; add it before importing modules that use it.
(vscode as any).ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
(vscode.env as any).openExternal = vi.fn().mockResolvedValue(true);

import { quickStart, extractBitbucketServerBaseUrl, suggestJiraUrlFromBitbucket } from '../commands/quickStart';
import { AuthProvider } from '../services/authProvider';

// ─── child_process mock ─────────────────────────────────────────────
// Quick Start calls `git remote get-url origin` to detect SCM.
let mockRemoteUrl = '';
let mockRemoteFails = false;

vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, _opts: any, cb: Function) => {
    if (cmd.includes('git remote get-url')) {
      if (mockRemoteFails) return cb(new Error('not a git repo'), '');
      return cb(null, mockRemoteUrl);
    }
    cb(null, '');
  }),
}));

// ─── credentialPrompts mock ─────────────────────────────────────────
const mockResolveJira = vi.fn();
const mockResolveAi = vi.fn();
vi.mock('../utils/credentialPrompts', () => ({
  resolveJiraCredentials: (...args: any[]) => mockResolveJira(...args),
  resolveAiApiKey: (...args: any[]) => mockResolveAi(...args),
}));

// ─── AuthProvider mock ──────────────────────────────────────────────
const mockGetSession = vi.fn();
const mockSignIn = vi.fn();
const mockGetJiraToken = vi.fn();
const mockStoreBitbucketToken = vi.fn().mockResolvedValue({
  provider: 'bitbucket',
  accessToken: 'tok',
  accountName: 'Bitbucket',
});
vi.spyOn(AuthProvider, 'getInstance').mockReturnValue({
  getSession: mockGetSession,
  signIn: mockSignIn,
  getJiraToken: mockGetJiraToken,
  storeBitbucketToken: mockStoreBitbucketToken,
} as any);

// ─── helpers ───────────────────────────────────────────────────────
function setConfigStub(values: Record<string, any>) {
  const updateMock = vi.fn().mockResolvedValue(undefined);
  (vscode.workspace.getConfiguration as any).mockReturnValue({
    get: (key: string, fallback?: any) => values[key] ?? fallback,
    update: updateMock,
  });
  return updateMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRemoteUrl = '';
  mockRemoteFails = false;
  (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
  mockGetSession.mockReset();
  mockSignIn.mockReset();
  mockGetJiraToken.mockReset();
  mockStoreBitbucketToken.mockClear();
  mockResolveJira.mockReset();
  mockResolveAi.mockReset();
  (vscode.window.showInformationMessage as any).mockReset();
  (vscode.window.showQuickPick as any).mockReset();
  (vscode.window.showInputBox as any).mockReset();
  (vscode.commands.executeCommand as any).mockReset();
});

// ─── extractBitbucketServerBaseUrl ─────────────────────────────────

describe('extractBitbucketServerBaseUrl', () => {
  it('extracts base URL from HTTPS clone URL', () => {
    expect(
      extractBitbucketServerBaseUrl('https://bitbucket.example.com/scm/PROJECT/repo.git'),
    ).toBe('https://bitbucket.example.com');
  });

  it('extracts base URL from SSH clone URL with port', () => {
    expect(
      extractBitbucketServerBaseUrl('ssh://git@bitbucket.example.com:7999/PROJECT/repo.git'),
    ).toBe('https://bitbucket.example.com');
  });

  it('extracts base URL from SCP-style SSH URL', () => {
    expect(
      extractBitbucketServerBaseUrl('git@bitbucket.example.com:PROJECT/repo.git'),
    ).toBe('https://bitbucket.example.com');
  });

  it('returns empty string for unrecognised URL', () => {
    expect(extractBitbucketServerBaseUrl('not-a-url')).toBe('');
  });
});

// ─── suggestJiraUrlFromBitbucket ───────────────────────────────────

describe('suggestJiraUrlFromBitbucket', () => {
  it('swaps bitbucket.* host for jira.*', () => {
    expect(suggestJiraUrlFromBitbucket('https://bitbucket.example.com'))
      .toBe('https://jira.example.com');
  });

  it('returns empty string for non-bitbucket-prefixed hosts', () => {
    expect(suggestJiraUrlFromBitbucket('https://scm.acme.com')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(suggestJiraUrlFromBitbucket('')).toBe('');
  });

  it('returns empty string for invalid URL', () => {
    expect(suggestJiraUrlFromBitbucket('not a url')).toBe('');
  });
});

// ─── quickStart workspace guard ────────────────────────────────────

describe('quickStart workspace guard', () => {
  it('returns cancelled when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    setConfigStub({});
    (vscode.window.showInformationMessage as any).mockResolvedValue('OK');

    const result = await quickStart();

    expect(result.cancelled).toBe(true);
    expect(result.completedScm).toBe(false);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('open project'),
      expect.any(Object),
      'OK',
    );
  });
});

// ─── quickStart Bitbucket Server happy path ────────────────────────

describe('quickStart - Bitbucket Server happy path', () => {
  it('detects BB Server URL, prompts for token, saves both, configures JIRA', async () => {
    mockRemoteUrl = 'https://bitbucket.example.com/scm/PROJECT/repo.git';
    const updateMock = setConfigStub({
      bitbucketUrl: '',
      jiraUrl: '',
      aiProvider: 'copilot', // Copilot needs no key
    });

    // Step: BB Server URL accept
    (vscode.window.showQuickPick as any)
      .mockResolvedValueOnce({ id: 'accept' }) // accept BB URL
      .mockResolvedValueOnce({ id: 'yes' })    // enable JIRA
      .mockResolvedValueOnce({ id: 'accept' }); // accept JIRA URL suggestion

    // Step: not yet signed in
    mockGetSession.mockResolvedValue(null);

    // Step: token info dialog
    (vscode.window.showInformationMessage as any)
      .mockResolvedValueOnce('I have one') // skip browser
      .mockResolvedValueOnce(undefined)    // BB token saved toast
      .mockResolvedValueOnce('Done');      // final summary

    // Step: token input
    (vscode.window.showInputBox as any).mockResolvedValue('a-valid-http-access-token-1234567');

    // Step: JIRA already not set, so resolveJiraCredentials runs
    mockGetJiraToken.mockResolvedValue('');
    mockResolveJira.mockResolvedValue({
      url: 'https://jira.example.com',
      type: 'server',
      email: '',
      token: 'jira-tok',
    });

    const result = await quickStart();

    expect(result.completedScm).toBe(true);
    expect(result.completedAi).toBe(true); // copilot
    expect(result.completedJira).toBe(true);
    expect(result.cancelled).toBe(false);

    // Confirms BB URL was persisted to settings
    expect(updateMock).toHaveBeenCalledWith(
      'bitbucketUrl',
      'https://bitbucket.example.com',
      expect.anything(),
    );

    // Confirms BB token was stored in SecretStorage
    expect(mockStoreBitbucketToken).toHaveBeenCalledWith('a-valid-http-access-token-1234567');

    // Confirms JIRA URL suggestion was persisted
    expect(updateMock).toHaveBeenCalledWith(
      'jiraUrl',
      'https://jira.example.com',
      expect.anything(),
    );
  });

  it('opens the BB token page in browser when user clicks "Open Token Page"', async () => {
    mockRemoteUrl = 'https://bitbucket.example.com/scm/PROJECT/repo.git';
    setConfigStub({ bitbucketUrl: '', aiProvider: 'copilot' });

    (vscode.window.showQuickPick as any)
      .mockResolvedValueOnce({ id: 'accept' })
      .mockResolvedValueOnce({ id: 'skip' }); // skip JIRA

    mockGetSession.mockResolvedValue(null);
    mockGetJiraToken.mockResolvedValue('');

    (vscode.window.showInformationMessage as any)
      .mockResolvedValueOnce('🔗 Open Token Page')
      .mockResolvedValueOnce(undefined)  // saved toast
      .mockResolvedValueOnce(undefined); // final summary

    (vscode.window.showInputBox as any).mockResolvedValue('valid-token-with-enough-length');

    await quickStart();

    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    );
  });

  it('cancels gracefully when user dismisses BB URL confirmation', async () => {
    mockRemoteUrl = 'https://bitbucket.example.com/scm/PROJECT/repo.git';
    setConfigStub({ bitbucketUrl: '', aiProvider: 'copilot' });

    (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

    const result = await quickStart();

    expect(result.cancelled).toBe(true);
    expect(result.completedScm).toBe(false);
  });

  it('skips Bitbucket sign-in when token already exists', async () => {
    mockRemoteUrl = 'https://bitbucket.example.com/scm/PROJECT/repo.git';
    setConfigStub({ bitbucketUrl: 'https://bitbucket.example.com', aiProvider: 'copilot' });

    mockGetSession.mockResolvedValue({ provider: 'bitbucket', accessToken: 'existing', accountName: 'Bitbucket' });
    mockGetJiraToken.mockResolvedValue('');

    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' }); // skip JIRA
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedScm).toBe(true);
    expect(mockStoreBitbucketToken).not.toHaveBeenCalled();
  });
});

// ─── quickStart GitHub path ────────────────────────────────────────

describe('quickStart - GitHub', () => {
  it('uses existing OAuth signIn for GitHub', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });

    mockGetSession.mockResolvedValue(null);
    mockSignIn.mockResolvedValue({ provider: 'github', accessToken: 'gh-token', accountName: 'alice' });
    mockGetJiraToken.mockResolvedValue('');

    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' }); // skip JIRA
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedScm).toBe(true);
    expect(mockSignIn).toHaveBeenCalledWith('github');
  });

  it('reports already-configured when GitHub session exists', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });

    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'alice' });
    mockGetJiraToken.mockResolvedValue('');

    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedScm).toBe(true);
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

// ─── quickStart AI step ────────────────────────────────────────────

describe('quickStart - AI step', () => {
  it('treats Copilot as already-configured (no key needed)', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'alice' });
    mockGetJiraToken.mockResolvedValue('');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedAi).toBe(true);
    expect(mockResolveAi).not.toHaveBeenCalled();
  });

  it('treats AMP as already-configured (no key needed)', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'amp' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedAi).toBe(true);
    expect(mockResolveAi).not.toHaveBeenCalled();
  });

  it('calls resolveAiApiKey for OpenAI', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'openai' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('');
    mockResolveAi.mockResolvedValue('sk-test-key');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedAi).toBe(true);
    expect(mockResolveAi).toHaveBeenCalled();
  });

  it('marks cancelled when user declines API key prompt', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'openai' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockResolveAi.mockResolvedValue(null);

    const result = await quickStart();

    expect(result.cancelled).toBe(true);
  });
});

// ─── quickStart JIRA optional step ────────────────────────────────

describe('quickStart - JIRA optional', () => {
  it('skips JIRA entirely when user picks "Skip"', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedJira).toBe(false);
    expect(result.cancelled).toBe(false); // skipping JIRA is NOT cancellation
    expect(mockResolveJira).not.toHaveBeenCalled();
  });

  it('skips JIRA configuration when JIRA URL + token already exist', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot', jiraUrl: 'https://x.atlassian.net' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('existing-jira-token');
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.completedJira).toBe(true);
    expect(mockResolveJira).not.toHaveBeenCalled(); // already configured
  });
});

// ─── quickStart final review offer ────────────────────────────────

describe('quickStart - final review offer', () => {
  it('runs ira.reviewPR when user clicks "Run a Review Now"', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Run a Review Now');

    await quickStart();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('ira.reviewPR');
  });

  it('does NOT run ira.reviewPR when user clicks "Done"', async () => {
    mockRemoteUrl = 'https://github.com/owner/repo.git';
    setConfigStub({ aiProvider: 'copilot' });
    mockGetSession.mockResolvedValue({ provider: 'github', accessToken: 'gh', accountName: 'a' });
    mockGetJiraToken.mockResolvedValue('');
    (vscode.window.showQuickPick as any).mockResolvedValueOnce({ id: 'skip' });
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    await quickStart();

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

// ─── quickStart unknown SCM ───────────────────────────────────────

describe('quickStart - unknown SCM fallback', () => {
  it('asks the user when git remote cannot be detected', async () => {
    mockRemoteFails = true;
    setConfigStub({ aiProvider: 'copilot' });
    mockGetJiraToken.mockResolvedValue('');

    (vscode.window.showQuickPick as any)
      .mockResolvedValueOnce({ id: 'skip' }) // skip SCM step
      .mockResolvedValueOnce({ id: 'skip' }); // skip JIRA
    (vscode.window.showInformationMessage as any).mockResolvedValue('Done');

    const result = await quickStart();

    expect(result.cancelled).toBe(false);
    // SCM was skipped, not configured
    expect(result.completedScm).toBe(false);
  });
});
