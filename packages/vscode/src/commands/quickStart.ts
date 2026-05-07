/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Quick Start - guided onboarding flow for first-time VS Code extension users.
 *
 * Chains all the prompts that previously required users to dig through
 * Settings → search "ira" → fill 4-6 fields manually. Auto-detects what it
 * can from the git remote, defers to existing helpers for JIRA / AI prompts,
 * and ends by offering to run the user's first review.
 *
 * This file ONLY adds new flow. It does not change any existing command.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { AuthProvider } from '../services/authProvider';
import { resolveJiraCredentials, resolveAiApiKey } from '../utils/credentialPrompts';

interface DetectedScm {
  scm: 'github' | 'bitbucket-cloud' | 'bitbucket-server' | 'unknown';
  baseUrl?: string;
  remoteUrl?: string;
}

interface QuickStartResult {
  completedScm: boolean;
  completedAi: boolean;
  completedJira: boolean;
  cancelled: boolean;
}

/**
 * Run the guided onboarding flow. Safe to invoke any number of times — every
 * step skips itself when already configured.
 */
export async function quickStart(): Promise<QuickStartResult> {
  const result: QuickStartResult = {
    completedScm: false,
    completedAi: false,
    completedJira: false,
    cancelled: false,
  };

  // ─── Step 0: workspace check ──────────────────────────────────────
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    await vscode.window.showInformationMessage(
      'IRA Quick Start needs an open project. Open a folder with a git remote, then run "IRA: Quick Start" again.',
      { modal: false },
      'OK',
    );
    result.cancelled = true;
    return result;
  }

  // ─── Step 1: detect SCM from git remote ──────────────────────────
  const detected = await detectScm(wsRoot);

  // ─── Step 2: SCM auth ────────────────────────────────────────────
  const scmDone = await ensureScmAuth(detected);
  if (scmDone === 'cancelled') {
    result.cancelled = true;
    return result;
  }
  result.completedScm = scmDone === 'configured' || scmDone === 'already';

  // ─── Step 3: AI provider ────────────────────────────────────────
  const aiDone = await ensureAi();
  if (aiDone === 'cancelled') {
    result.cancelled = true;
    return result;
  }
  result.completedAi = aiDone === 'configured' || aiDone === 'already';

  // ─── Step 4: JIRA (optional) ────────────────────────────────────
  const jiraDone = await ensureJira(detected);
  // JIRA is optional — "skipped" is not a cancellation
  result.completedJira = jiraDone === 'configured' || jiraDone === 'already';

  // ─── Step 5: completion ─────────────────────────────────────────
  await offerFirstReview(result);

  return result;
}

// ─── Internals ─────────────────────────────────────────────────────

async function detectScm(workspaceRoot: string): Promise<DetectedScm> {
  let remoteUrl = '';
  try {
    remoteUrl = await execShell('git remote get-url origin', workspaceRoot);
  } catch {
    return { scm: 'unknown' };
  }

  const lower = remoteUrl.toLowerCase();

  // Bitbucket Cloud
  if (lower.includes('bitbucket.org')) {
    return { scm: 'bitbucket-cloud', remoteUrl };
  }

  // Bitbucket Server / Data Center: URLs contain '/scm/' between host and project
  // e.g. https://bitbucket.example.com/scm/PROJECT/repo.git
  //      ssh://git@bitbucket.example.com:7999/PROJECT/repo.git
  if (lower.includes('/scm/') || lower.includes('bitbucket')) {
    const baseUrl = extractBitbucketServerBaseUrl(remoteUrl);
    return { scm: 'bitbucket-server', baseUrl, remoteUrl };
  }

  // GitHub (including Enterprise)
  if (lower.includes('github')) {
    return { scm: 'github', remoteUrl };
  }

  return { scm: 'unknown', remoteUrl };
}

/**
 * Extract the base URL of a Bitbucket Server install from a clone URL.
 * Handles HTTPS, SSH, and trailing-segment variations. Returns empty string
 * if the URL doesn't look like Bitbucket Server.
 */
export function extractBitbucketServerBaseUrl(remoteUrl: string): string {
  // SSH form: ssh://git@host:7999/PROJECT/repo.git
  const sshMatch = remoteUrl.match(/^ssh:\/\/[^@]+@([^:/]+)/i);
  if (sshMatch) {
    return `https://${sshMatch[1]}`;
  }

  // git@host:PROJECT/repo.git form
  const scpMatch = remoteUrl.match(/^[^@]+@([^:]+):/);
  if (scpMatch && !remoteUrl.startsWith('http')) {
    return `https://${scpMatch[1]}`;
  }

  // HTTPS form: https://host/scm/PROJECT/repo.git → https://host
  const httpsMatch = remoteUrl.match(/^(https?:\/\/[^/]+)/i);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  return '';
}

/**
 * Suggest a JIRA URL based on the Bitbucket Server base URL. Returns empty
 * string if no reasonable suggestion can be made.
 *
 * Heuristic: bitbucket.<rest> → jira.<rest>. Most enterprises follow this.
 */
export function suggestJiraUrlFromBitbucket(bitbucketBaseUrl: string): string {
  if (!bitbucketBaseUrl) return '';
  try {
    const u = new URL(bitbucketBaseUrl);
    // bitbucket.host.com → jira.host.com (most common pattern)
    if (u.hostname.startsWith('bitbucket.')) {
      const rest = u.hostname.replace(/^bitbucket\./, '');
      return `${u.protocol}//jira.${rest}`;
    }
  } catch {
    return '';
  }
  return '';
}

type StepOutcome = 'configured' | 'already' | 'skipped' | 'cancelled';

async function ensureScmAuth(detected: DetectedScm): Promise<StepOutcome> {
  const auth = AuthProvider.getInstance();
  const config = vscode.workspace.getConfiguration('ira');

  // GitHub — defer to existing OAuth flow (it's already great)
  if (detected.scm === 'github') {
    const existing = await auth.getSession('github');
    if (existing) {
      vscode.window.showInformationMessage(`IRA: Already signed in to GitHub as ${existing.accountName}`);
      return 'already';
    }
    const session = await auth.signIn('github');
    return session ? 'configured' : 'cancelled';
  }

  // Bitbucket Server — needs HTTP Access Token + bitbucketUrl saved to settings
  if (detected.scm === 'bitbucket-server') {
    // Ensure bitbucketUrl is set
    let bbUrl = config.get<string>('bitbucketUrl', '');
    if (!bbUrl && detected.baseUrl) {
      const accept = await vscode.window.showQuickPick(
        [
          { label: `$(check) Use ${detected.baseUrl}`, id: 'accept' as const },
          { label: '$(edit) Enter a different URL', id: 'change' as const },
        ],
        { placeHolder: `Detected Bitbucket Server: ${detected.baseUrl}`, ignoreFocusOut: true },
      );
      if (!accept) return 'cancelled';
      if (accept.id === 'accept') {
        bbUrl = detected.baseUrl;
      } else {
        const input = await vscode.window.showInputBox({
          prompt: 'Bitbucket Server base URL',
          placeHolder: 'https://bitbucket.yourcompany.com',
          value: detected.baseUrl,
          ignoreFocusOut: true,
        });
        if (!input) return 'cancelled';
        bbUrl = input.trim().replace(/\/+$/, '');
      }
      await config.update('bitbucketUrl', bbUrl, vscode.ConfigurationTarget.Global);
    } else if (!bbUrl) {
      const input = await vscode.window.showInputBox({
        prompt: 'Bitbucket Server base URL',
        placeHolder: 'https://bitbucket.yourcompany.com',
        ignoreFocusOut: true,
      });
      if (!input) return 'cancelled';
      bbUrl = input.trim().replace(/\/+$/, '');
      await config.update('bitbucketUrl', bbUrl, vscode.ConfigurationTarget.Global);
    }

    // Already have a token?
    const existing = await auth.getSession('bitbucket');
    if (existing) {
      vscode.window.showInformationMessage('IRA: Already signed in to Bitbucket');
      return 'already';
    }

    // Prompt for HTTP Access Token (NOT password)
    const tokenPageUrl = `${bbUrl}/plugins/servlet/access-tokens/users/me/manage`;
    const action = await vscode.window.showInformationMessage(
      'IRA: You need a Bitbucket HTTP Access Token (not your password).\n\n📍 Bitbucket → User icon → Manage account → HTTP access tokens → Create',
      { modal: true },
      '🔗 Open Token Page',
      'I have one',
    );
    if (action === '🔗 Open Token Page') {
      await vscode.env.openExternal(vscode.Uri.parse(tokenPageUrl));
    } else if (!action) {
      return 'cancelled';
    }

    const token = await vscode.window.showInputBox({
      prompt: 'Paste your Bitbucket HTTP Access Token (NOT your login password)',
      placeHolder: 'e.g. NjM2MjY4Nzkz... (random string, no fixed prefix)',
      password: true,
      ignoreFocusOut: true,
      validateInput: validateBitbucketServerToken,
    });
    if (!token) return 'cancelled';

    await auth.storeBitbucketToken(token.trim());
    vscode.window.showInformationMessage('IRA: Bitbucket token saved securely 🔐');
    return 'configured';
  }

  // Bitbucket Cloud — API Token (App Passwords are deprecated)
  if (detected.scm === 'bitbucket-cloud') {
    const existing = await auth.getSession('bitbucket');
    if (existing) {
      vscode.window.showInformationMessage('IRA: Already signed in to Bitbucket');
      return 'already';
    }

    const action = await vscode.window.showInformationMessage(
      'IRA: You need a Bitbucket API Token.\n\n📍 id.atlassian.com → Security → API tokens → Create. (App Passwords also work but are deprecated.)',
      { modal: true },
      '🔗 Open Token Page',
      'I have one',
    );
    if (action === '🔗 Open Token Page') {
      await vscode.env.openExternal(vscode.Uri.parse('https://id.atlassian.com/manage-profile/security/api-tokens'));
    } else if (!action) {
      return 'cancelled';
    }

    const token = await vscode.window.showInputBox({
      prompt: 'Paste your Bitbucket API Token',
      placeHolder: 'ATATT... (or legacy ATBB... App Password)',
      password: true,
      ignoreFocusOut: true,
    });
    if (!token) return 'cancelled';

    await auth.storeBitbucketToken(token.trim());
    vscode.window.showInformationMessage('IRA: Bitbucket token saved securely 🔐');
    return 'configured';
  }

  // Unknown SCM — let the user pick
  const pick = await vscode.window.showQuickPick(
    [
      { label: '$(github) GitHub', id: 'github' as const },
      { label: '$(globe) Bitbucket', id: 'bitbucket' as const },
      { label: '$(skip) Skip — I\'ll set this up later', id: 'skip' as const },
    ],
    { placeHolder: 'Could not detect SCM from git remote. Which do you use?', ignoreFocusOut: true },
  );
  if (!pick || pick.id === 'skip') return 'skipped';

  if (pick.id === 'github') {
    const session = await auth.signIn('github');
    return session ? 'configured' : 'cancelled';
  }
  // Re-enter quickStart with explicit BB cloud assumption
  return ensureScmAuth({ scm: 'bitbucket-cloud' });
}

/** Lightweight heuristic: catches the most common password mistake. */
function validateBitbucketServerToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return 'Tokens never contain spaces. Did you paste a password?';
  if (trimmed.length < 16) return 'HTTP Access Tokens are typically 30+ characters. This looks too short.';
  return null;
}

async function ensureAi(): Promise<StepOutcome> {
  const config = vscode.workspace.getConfiguration('ira');
  const provider = config.get<string>('aiProvider', 'copilot');

  // Copilot and AMP need no key — they use the user's existing session
  if (provider === 'copilot' || provider === 'amp') {
    return 'already';
  }

  // For other providers, defer to the existing helper
  const key = await resolveAiApiKey();
  return key ? 'configured' : 'cancelled';
}

async function ensureJira(detected: DetectedScm): Promise<StepOutcome> {
  const config = vscode.workspace.getConfiguration('ira');
  const existingUrl = config.get<string>('jiraUrl', '');
  const existingToken = await AuthProvider.getInstance().getJiraToken();
  if (existingUrl && existingToken) {
    return 'already';
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(check) Yes — set up JIRA (recommended for AC validation)', id: 'yes' as const },
      { label: '$(skip) Skip — I don\'t use JIRA or I\'ll do it later', id: 'skip' as const },
    ],
    { placeHolder: 'Do you want to enable JIRA Acceptance Criteria validation?', ignoreFocusOut: true },
  );
  if (!choice || choice.id === 'skip') return 'skipped';

  // Pre-fill JIRA URL suggestion from BB Server URL if we can derive one
  if (!existingUrl && detected.scm === 'bitbucket-server' && detected.baseUrl) {
    const suggestion = suggestJiraUrlFromBitbucket(detected.baseUrl);
    if (suggestion) {
      const accept = await vscode.window.showQuickPick(
        [
          { label: `$(check) Use ${suggestion}`, id: 'accept' as const },
          { label: '$(edit) Enter a different URL', id: 'change' as const },
        ],
        { placeHolder: `Suggested JIRA URL based on your Bitbucket: ${suggestion}`, ignoreFocusOut: true },
      );
      if (accept?.id === 'accept') {
        await config.update('jiraUrl', suggestion, vscode.ConfigurationTarget.Global);
      }
      // If they pick "change" or cancel, resolveJiraCredentials will prompt below
    }
  }

  const creds = await resolveJiraCredentials();
  return creds ? 'configured' : 'cancelled';
}

async function offerFirstReview(result: QuickStartResult): Promise<void> {
  if (result.cancelled) return;

  const items: string[] = [];
  if (result.completedScm) items.push('SCM signed in ✅');
  if (result.completedAi) items.push('AI provider ready ✅');
  if (result.completedJira) items.push('JIRA configured ✅');

  const summary = items.length > 0
    ? `IRA Quick Start complete!\n\n${items.join('\n')}`
    : 'IRA Quick Start finished. Run "IRA: Review Current PR" when ready.';

  const action = await vscode.window.showInformationMessage(
    summary,
    { modal: false },
    'Run a Review Now',
    'Done',
  );

  if (action === 'Run a Review Now') {
    await vscode.commands.executeCommand('ira.reviewPR');
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
