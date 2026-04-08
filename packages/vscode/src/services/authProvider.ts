/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * AuthProvider — Centralized OAuth authentication for GitHub / Bitbucket
 *
 * Uses VS Code's built-in AuthenticationProvider API so users click
 * "Sign in with GitHub" instead of pasting PATs.
 * Tokens are stored via VS Code SecretStorage (OS keychain).
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';

export type ScmAuthProvider = 'github' | 'github-enterprise' | 'bitbucket';

export interface ScmSession {
  provider: ScmAuthProvider;
  accessToken: string;
  accountName: string;
}

const BITBUCKET_SECRET_KEY = 'ira-bitbucket-token';
const SONAR_SECRET_KEY = 'ira-sonar-token';
const JIRA_SECRET_KEY = 'ira-jira-token';
const AI_API_SECRET_KEY = 'ira-ai-api-key';
const GITHUB_SCOPES = ['repo'];

export class AuthProvider implements vscode.Disposable {
  private static instance: AuthProvider;
  private readonly secrets: vscode.SecretStorage;
  private readonly _onDidChangeSession = new vscode.EventEmitter<ScmSession | null>();
  readonly onDidChangeSession = this._onDidChangeSession.event;

  private readonly sessionCache = new Map<string, ScmSession>();
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(private readonly context: vscode.ExtensionContext) {
    this.secrets = context.secrets;

    // Invalidate GitHub cache when VS Code auth sessions change (token refresh / sign-out)
    this.disposables.push(
      vscode.authentication.onDidChangeSessions(e => {
        if (e.provider.id === 'github' || e.provider.id === 'github-enterprise') {
          this.sessionCache.delete('github');
          this.sessionCache.delete('github-enterprise');
          this._onDidChangeSession.fire(null);
        }
      }),
    );
  }

  static init(context: vscode.ExtensionContext): AuthProvider {
    if (!AuthProvider.instance) {
      AuthProvider.instance = new AuthProvider(context);
    }
    return AuthProvider.instance;
  }

  static getInstance(): AuthProvider {
    if (!AuthProvider.instance) {
      throw new Error('AuthProvider not initialized. Call AuthProvider.init() first.');
    }
    return AuthProvider.instance;
  }

  /**
   * Resolve the best available SCM token.
   * Priority: cached session → VS Code OAuth → settings PAT → null
   */
  async getSession(scmProvider: 'github' | 'bitbucket'): Promise<ScmSession | null> {
    const cached = this.sessionCache.get(scmProvider);
    if (cached) return cached;

    if (scmProvider === 'github') {
      return this.getGitHubSession();
    }
    return this.getBitbucketSession();
  }

  /**
   * Interactive sign-in: prompts the user for OAuth consent.
   */
  async signIn(scmProvider: 'github' | 'bitbucket'): Promise<ScmSession | null> {
    if (scmProvider === 'github') {
      return this.signInGitHub();
    }
    return this.signInBitbucket();
  }

  async signOut(): Promise<void> {
    this.sessionCache.clear();
    await Promise.all([
      this.secrets.delete(BITBUCKET_SECRET_KEY),
      this.secrets.delete(SONAR_SECRET_KEY),
      this.secrets.delete(JIRA_SECRET_KEY),
      this.secrets.delete(AI_API_SECRET_KEY),
    ]);
    this._onDidChangeSession.fire(null);
    vscode.window.showInformationMessage('IRA: Signed out.');
  }

  /**
   * Resolve an authenticated SCM token for the given workspace, handling
   * auto-detection, silent auth, and interactive sign-in fallback.
   * Returns the session or null if the user declines to authenticate.
   */
  async resolveScmSession(workspaceRoot: string): Promise<ScmSession | null> {
    let scmProvider: 'github' | 'bitbucket' =
      vscode.workspace.getConfiguration('ira').get<string>('scmProvider', 'github') as 'github' | 'bitbucket';

    // Auto-detect from git remote
    try {
      const remoteUrl = await execShell('git remote get-url origin', workspaceRoot);
      if (remoteUrl.includes('bitbucket')) {
        scmProvider = 'bitbucket';
      }
    } catch {
      // ignore — fall back to settings value
    }

    let session = await this.getSession(scmProvider);
    if (!session) {
      session = await this.signIn(scmProvider);
    }
    return session;
  }

  // ─── GitHub ────────────────────────────────────────────────────

  private async getGitHubSession(): Promise<ScmSession | null> {
    const config = vscode.workspace.getConfiguration('ira');
    const isGHE = !!config.get<string>('githubUrl', '');
    const providerId = isGHE ? 'github-enterprise' : 'github';

    // 1. Try silent (no prompt) OAuth
    try {
      const session = await vscode.authentication.getSession(providerId, GITHUB_SCOPES, {
        createIfNone: false,
      });
      if (session) {
        return this.cacheSession({
          provider: providerId,
          accessToken: session.accessToken,
          accountName: session.account.label,
        });
      }
    } catch {
      // Not signed in yet
    }

    // 2. Fall back to PAT from settings
    const pat = config.get<string>('githubToken', '');
    if (pat) {
      return this.cacheSession({
        provider: providerId,
        accessToken: pat,
        accountName: 'PAT',
      });
    }

    return null;
  }

  private async signInGitHub(): Promise<ScmSession | null> {
    const config = vscode.workspace.getConfiguration('ira');
    const isGHE = !!config.get<string>('githubUrl', '');

    let providerId: ScmAuthProvider = 'github';
    if (isGHE) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(globe) GitHub Enterprise', id: 'github-enterprise' as const },
          { label: '$(github) GitHub.com', id: 'github' as const },
        ],
        { placeHolder: 'Sign in to…' },
      );
      if (!choice) return null;
      providerId = choice.id;
    }

    try {
      const session = await vscode.authentication.getSession(providerId, GITHUB_SCOPES, {
        createIfNone: true,
      });
      const scmSession = this.cacheSession({
        provider: providerId,
        accessToken: session.accessToken,
        accountName: session.account.label,
      });
      vscode.window.showInformationMessage(`IRA: Signed in as ${session.account.label}`);
      return scmSession;
    } catch {
      vscode.window.showErrorMessage('IRA: GitHub sign-in was cancelled or failed.');
      return null;
    }
  }

  // ─── Bitbucket ─────────────────────────────────────────────────
  // Bitbucket doesn't have a built-in VS Code auth provider, so
  // we store a token in SecretStorage (still better than plaintext settings).

  private async getBitbucketSession(): Promise<ScmSession | null> {
    const token = await this.secrets.get(BITBUCKET_SECRET_KEY);
    if (token) {
      return this.cacheSession({
        provider: 'bitbucket',
        accessToken: token,
        accountName: 'Bitbucket',
      });
    }

    // Fall back to settings PAT
    const pat = vscode.workspace.getConfiguration('ira').get<string>('bitbucketToken', '');
    if (pat) {
      return this.cacheSession({
        provider: 'bitbucket',
        accessToken: pat,
        accountName: 'PAT',
      });
    }

    return null;
  }

  private async signInBitbucket(): Promise<ScmSession | null> {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your Bitbucket access token (read-only scope recommended)',
      placeHolder: 'ATBB…',
      password: true,
      ignoreFocusOut: true,
    });

    if (!token) return null;

    await this.secrets.store(BITBUCKET_SECRET_KEY, token);
    const session = this.cacheSession({
      provider: 'bitbucket',
      accessToken: token,
      accountName: 'Bitbucket',
    });
    vscode.window.showInformationMessage('IRA: Bitbucket token saved securely.');
    return session;
  }

  // ─── Secret helpers (Sonar / JIRA / AI API key) ─────────────────
  // These tokens don't have an OAuth flow but should still live in
  // SecretStorage rather than plaintext settings.json.
  // Each getter falls back to the legacy settings value so existing
  // users aren't broken.

  async getSonarToken(): Promise<string> {
    return (await this.secrets.get(SONAR_SECRET_KEY))
      ?? vscode.workspace.getConfiguration('ira').get<string>('sonarToken', '');
  }

  async storeSonarToken(token: string): Promise<void> {
    await this.secrets.store(SONAR_SECRET_KEY, token);
  }

  async getJiraToken(): Promise<string> {
    return (await this.secrets.get(JIRA_SECRET_KEY))
      ?? vscode.workspace.getConfiguration('ira').get<string>('jiraToken', '');
  }

  async storeJiraToken(token: string): Promise<void> {
    await this.secrets.store(JIRA_SECRET_KEY, token);
  }

  async getAiApiKey(): Promise<string> {
    return (await this.secrets.get(AI_API_SECRET_KEY))
      ?? vscode.workspace.getConfiguration('ira').get<string>('aiApiKey', '');
  }

  async storeAiApiKey(key: string): Promise<void> {
    await this.secrets.store(AI_API_SECRET_KEY, key);
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private cacheSession(session: ScmSession): ScmSession {
    // Cache under the canonical key: 'github' for both github & github-enterprise
    const key = session.provider === 'github-enterprise' ? 'github' : session.provider;
    this.sessionCache.set(key, session);
    this._onDidChangeSession.fire(session);
    return session;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this._onDidChangeSession.dispose();
  }
}

function execShell(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { cwd }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}
