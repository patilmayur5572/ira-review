import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import * as vscode from 'vscode';
import { AuthProvider } from '../services/authProvider';

vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, _opts: any, cb: Function) => {
    if (cmd.includes('remote get-url')) {
      cb(null, 'https://github.com/owner/repo.git');
    } else {
      cb(null, '');
    }
  }),
}));

/**
 * Helper to build a fake ExtensionContext with SecretStorage.
 */
function createFakeContext(): vscode.ExtensionContext {
  const store = new Map<string, string>();
  return {
    secrets: {
      get: vi.fn((key: string) => Promise.resolve(store.get(key))),
      store: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      delete: vi.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
      onDidChange: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    (AuthProvider as any).instance = undefined;
  });

  // ─── Singleton ──────────────────────────────────────────────────

  it('should initialise once and return the same instance', () => {
    const ctx = createFakeContext();
    const a = AuthProvider.init(ctx);
    const b = AuthProvider.init(ctx);
    expect(a).toBe(b);
  });

  it('getInstance() should throw if not initialised', () => {
    expect(() => AuthProvider.getInstance()).toThrowError(
      'AuthProvider not initialized',
    );
  });

  it('getInstance() should return the instance after init()', () => {
    const ctx = createFakeContext();
    const instance = AuthProvider.init(ctx);
    expect(AuthProvider.getInstance()).toBe(instance);
  });

  // ─── GitHub — silent OAuth ──────────────────────────────────────

  it('should return GitHub session from VS Code OAuth (silent)', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'gh-token-123',
      account: { label: 'octocat' },
    });

    const session = await auth.getSession('github');
    expect(session).toEqual({
      provider: 'github',
      accessToken: 'gh-token-123',
      accountName: 'octocat',
    });
  });

  it('should fall back to PAT when OAuth has no session', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'githubToken') return 'pat-abc';
        return '';
      }),
    });
    (vscode.authentication.getSession as any).mockResolvedValue(null);

    const session = await auth.getSession('github');
    expect(session).toEqual({
      provider: 'github',
      accessToken: 'pat-abc',
      accountName: 'PAT',
    });
  });

  it('should return null when no OAuth or PAT available for GitHub', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue(null);

    const session = await auth.getSession('github');
    expect(session).toBeNull();
  });

  // ─── GitHub Enterprise ──────────────────────────────────────────

  it('should use github-enterprise provider when githubUrl is set', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'githubUrl') return 'https://ghe.corp.com/api/v3';
        return '';
      }),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'ghe-token',
      account: { label: 'corp-user' },
    });

    const session = await auth.getSession('github');
    expect(session?.provider).toBe('github-enterprise');
    expect(vscode.authentication.getSession).toHaveBeenCalledWith(
      'github-enterprise',
      ['repo'],
      { createIfNone: false },
    );
  });

  // ─── Cached session ─────────────────────────────────────────────

  it('should return cached session on subsequent calls', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'tok',
      account: { label: 'user' },
    });

    const first = await auth.getSession('github');
    const second = await auth.getSession('github');
    expect(first).toBe(second);
    // OAuth should only be called once because the second call uses cache
    expect(vscode.authentication.getSession).toHaveBeenCalledTimes(1);
  });

  it('should cache github and bitbucket sessions independently', async () => {
    const ctx = createFakeContext();
    await ctx.secrets.store('ira-bitbucket-token', 'bb-tok');
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'gh-tok',
      account: { label: 'ghUser' },
    });

    const ghSession = await auth.getSession('github');
    const bbSession = await auth.getSession('bitbucket');
    expect(ghSession?.accessToken).toBe('gh-tok');
    expect(bbSession?.accessToken).toBe('bb-tok');
    expect(ghSession).not.toBe(bbSession);
  });

  // ─── Bitbucket ──────────────────────────────────────────────────

  it('should retrieve Bitbucket token from SecretStorage', async () => {
    const ctx = createFakeContext();
    // Pre-store a token
    await ctx.secrets.store('ira-bitbucket-token', 'bb-secret');

    const auth = AuthProvider.init(ctx);
    const session = await auth.getSession('bitbucket');
    expect(session).toEqual({
      provider: 'bitbucket',
      accessToken: 'bb-secret',
      accountName: 'Bitbucket',
    });
  });

  it('should fall back to Bitbucket PAT from settings', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'bitbucketToken') return 'bb-pat';
        return '';
      }),
    });

    const session = await auth.getSession('bitbucket');
    expect(session).toEqual({
      provider: 'bitbucket',
      accessToken: 'bb-pat',
      accountName: 'PAT',
    });
  });

  it('should return null when no Bitbucket token available', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });

    const session = await auth.getSession('bitbucket');
    expect(session).toBeNull();
  });

  // ─── signIn (GitHub) ────────────────────────────────────────────

  it('signIn(github) should trigger interactive OAuth', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'new-gh-tok',
      account: { label: 'ghUser' },
    });

    const session = await auth.signIn('github');
    expect(session?.accessToken).toBe('new-gh-tok');
    expect(vscode.authentication.getSession).toHaveBeenCalledWith(
      'github',
      ['repo'],
      { createIfNone: true },
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'IRA: Signed in as ghUser',
    );
  });

  it('signIn(github) should show error on failure', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockRejectedValue(
      new Error('cancelled'),
    );

    const session = await auth.signIn('github');
    expect(session).toBeNull();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'IRA: GitHub sign-in was cancelled or failed.',
    );
  });

  // ─── signIn (Bitbucket) ─────────────────────────────────────────

  it('signIn(bitbucket) should store token in SecretStorage', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.window.showInputBox as any).mockResolvedValue('bb-new-token');

    const session = await auth.signIn('bitbucket');
    expect(session?.accessToken).toBe('bb-new-token');
    expect(ctx.secrets.store).toHaveBeenCalledWith(
      'ira-bitbucket-token',
      'bb-new-token',
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'IRA: Bitbucket token saved securely.',
    );
  });

  it('signIn(bitbucket) should return null if user cancels', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    const session = await auth.signIn('bitbucket');
    expect(session).toBeNull();
  });

  // ─── signOut ────────────────────────────────────────────────────

  it('signOut should clear cache and delete all stored secrets', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    // First sign in
    (vscode.window.showInputBox as any).mockResolvedValue('bb-tok');
    await auth.signIn('bitbucket');

    await auth.signOut();
    expect(ctx.secrets.delete).toHaveBeenCalledWith('ira-bitbucket-token');
    expect(ctx.secrets.delete).toHaveBeenCalledWith('ira-sonar-token');
    expect(ctx.secrets.delete).toHaveBeenCalledWith('ira-jira-token');
    expect(ctx.secrets.delete).toHaveBeenCalledWith('ira-ai-api-key');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'IRA: Signed out.',
    );

    // After sign out, getSession should not return cached value
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue(null);
    const session = await auth.getSession('github');
    expect(session).toBeNull();
  });

  // ─── onDidChangeSession event ───────────────────────────────────

  it('should fire onDidChangeSession when session changes', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    const listener = vi.fn();
    auth.onDidChangeSession(listener);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ''),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'tok',
      account: { label: 'user' },
    });

    await auth.getSession('github');
    // EventEmitter.fire is mocked in setup.ts
    expect((auth as any)._onDidChangeSession.fire).toHaveBeenCalled();
  });

  // ─── Secret helpers (Sonar / JIRA / AI API key) ──────────────────

  it('getSonarToken should return SecretStorage value over settings', async () => {
    const ctx = createFakeContext();
    await ctx.secrets.store('ira-sonar-token', 'sonar-secret');
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => 'settings-sonar-tok'),
    });

    const token = await auth.getSonarToken();
    expect(token).toBe('sonar-secret');
  });

  it('getSonarToken should fall back to settings when no secret stored', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'sonarToken') return 'settings-sonar';
        return '';
      }),
    });

    const token = await auth.getSonarToken();
    expect(token).toBe('settings-sonar');
  });

  it('getJiraToken should return SecretStorage value over settings', async () => {
    const ctx = createFakeContext();
    await ctx.secrets.store('ira-jira-token', 'jira-secret');
    const auth = AuthProvider.init(ctx);

    const token = await auth.getJiraToken();
    expect(token).toBe('jira-secret');
  });

  it('getAiApiKey should return SecretStorage value over settings', async () => {
    const ctx = createFakeContext();
    await ctx.secrets.store('ira-ai-api-key', 'ai-secret-key');
    const auth = AuthProvider.init(ctx);

    const token = await auth.getAiApiKey();
    expect(token).toBe('ai-secret-key');
  });

  it('storeAiApiKey should persist to SecretStorage', async () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    await auth.storeAiApiKey('new-ai-key');
    expect(ctx.secrets.store).toHaveBeenCalledWith('ira-ai-api-key', 'new-ai-key');

    const token = await auth.getAiApiKey();
    expect(token).toBe('new-ai-key');
  });

  // ─── resolveScmSession ───────────────────────────────────────────

  it('resolveScmSession should auto-detect provider and return session', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, _opts: any, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else {
        cb(null, '');
      }
    });

    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'scmProvider') return 'github';
        return '';
      }),
    });
    (vscode.authentication.getSession as any).mockResolvedValue({
      accessToken: 'resolved-tok',
      account: { label: 'resolvedUser' },
    });

    const session = await auth.resolveScmSession('/test/workspace');
    expect(session).not.toBeNull();
    expect(session?.accessToken).toBe('resolved-tok');
  });

  it('resolveScmSession should return null when user declines sign-in', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, _opts: any, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, 'https://github.com/owner/repo.git');
      } else {
        cb(null, '');
      }
    });

    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'scmProvider') return 'github';
        return '';
      }),
    });
    // silent getSession returns nothing
    (vscode.authentication.getSession as any)
      .mockResolvedValueOnce(null)   // silent attempt in getSession
      .mockRejectedValueOnce(new Error('cancelled')); // interactive attempt in signIn

    const session = await auth.resolveScmSession('/test/workspace');
    expect(session).toBeNull();
  });

  // ─── dispose ────────────────────────────────────────────────────

  it('should dispose event emitter and listeners', () => {
    const ctx = createFakeContext();
    const auth = AuthProvider.init(ctx);
    auth.dispose();
    expect((auth as any)._onDidChangeSession.dispose).toHaveBeenCalled();
  });
});
