/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Shared credential prompts with guided navigation
 */

import * as vscode from 'vscode';
import { AuthProvider } from '../services/authProvider';

interface JiraCredentials {
  url: string;
  type: 'cloud' | 'server';
  email: string;
  token: string;
}

/**
 * Prompt for all JIRA credentials, showing navigation guidance and
 * "Open Token Page" buttons. Returns null if user cancels at any step.
 */
export async function resolveJiraCredentials(): Promise<JiraCredentials | null> {
  const config = vscode.workspace.getConfiguration('ira');
  const auth = AuthProvider.getInstance();

  // 1. JIRA URL
  let url = config.get<string>('jiraUrl', '');
  if (!url) {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter your JIRA base URL (copy from your browser address bar)',
      placeHolder: 'https://yourcompany.atlassian.net  or  https://jira.yourcompany.com',
      ignoreFocusOut: true,
    });
    if (!input) return null;
    url = input.trim().replace(/\/+$/, '');
    await config.update('jiraUrl', url, vscode.ConfigurationTarget.Global);
  }

  // 2. JIRA Type — auto-detect from URL when possible
  let type = config.get<string>('jiraType', '') as 'cloud' | 'server' | '';
  if (!type) {
    if (url.includes('atlassian.net')) {
      type = 'cloud';
      await config.update('jiraType', type, vscode.ConfigurationTarget.Global);
    } else {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '$(cloud) Jira Cloud', description: 'Hosted by Atlassian (*.atlassian.net)', id: 'cloud' as const },
          { label: '$(server) Jira Server / Data Center', description: 'Self-hosted by your company', id: 'server' as const },
        ],
        { placeHolder: 'Which type of JIRA is this?' },
      );
      if (!pick) return null;
      type = pick.id;
      await config.update('jiraType', type, vscode.ConfigurationTarget.Global);
    }
  }

  // 3. Email (Cloud only)
  let email = config.get<string>('jiraEmail', '');
  if (type === 'cloud' && !email) {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter your Atlassian account email',
      placeHolder: 'you@company.com',
      ignoreFocusOut: true,
    });
    if (!input) return null;
    email = input.trim();
    await config.update('jiraEmail', email, vscode.ConfigurationTarget.Global);
  }

  // 4. Token — with "Open Token Page" button
  let token = await auth.getJiraToken();
  if (!token) {
    const tokenPageUrl = type === 'cloud'
      ? 'https://id.atlassian.com/manage-profile/security/api-tokens'
      : `${url}/secure/ViewProfile.jspa`;

    const nav = type === 'cloud'
      ? 'id.atlassian.com → Security → API tokens → Create'
      : 'JIRA → Profile avatar (top-right) → Personal Access Tokens → Create';

    const action = await vscode.window.showInformationMessage(
      `IRA: You need a JIRA ${type === 'cloud' ? 'API token' : 'Personal Access Token'}.\n\n📍 ${nav}`,
      { modal: true },
      '🔗 Open Token Page',
      'I have one',
    );

    if (action === '🔗 Open Token Page') {
      await vscode.env.openExternal(vscode.Uri.parse(tokenPageUrl));
    } else if (!action) {
      return null;
    }

    const input = await vscode.window.showInputBox({
      prompt: `Paste your JIRA ${type === 'cloud' ? 'API token' : 'Personal Access Token'}`,
      placeHolder: type === 'cloud' ? 'ATATT3xFfGF0...' : 'NjM2MjY4...',
      password: true,
      ignoreFocusOut: true,
    });
    if (!input) return null;
    token = input.trim();
    await auth.storeJiraToken(token);
  }

  return { url, type, email, token };
}

/**
 * Prompt for AI API key with provider-specific guidance.
 * Returns the key or null if cancelled.
 */
export async function resolveAiApiKey(): Promise<string | null> {
  const auth = AuthProvider.getInstance();
  let apiKey = await auth.getAiApiKey();
  if (apiKey) return apiKey;

  const config = vscode.workspace.getConfiguration('ira');
  const provider = config.get<string>('aiProvider', 'copilot');

  const guidance: Record<string, { nav: string; url: string; placeholder: string }> = {
    'openai': {
      nav: 'platform.openai.com → API Keys → Create new secret key',
      url: 'https://platform.openai.com/api-keys',
      placeholder: 'sk-proj-...',
    },
    'anthropic': {
      nav: 'console.anthropic.com → Settings → API Keys → Create Key',
      url: 'https://console.anthropic.com/settings/keys',
      placeholder: 'sk-ant-...',
    },
    'azure-openai': {
      nav: 'Azure Portal → Your OpenAI resource → Keys and Endpoint',
      url: 'https://portal.azure.com',
      placeholder: 'abc123...',
    },
    'ollama': {
      nav: 'No API key needed for Ollama (local)',
      url: '',
      placeholder: '',
    },
  };

  const info = guidance[provider] ?? guidance['openai'];

  if (provider === 'ollama') {
    return 'ollama-local';
  }

  const action = await vscode.window.showInformationMessage(
    `IRA: You need an API key for ${provider}.\n\n📍 ${info.nav}`,
    { modal: true },
    '🔗 Open API Key Page',
    'I have one',
  );

  if (action === '🔗 Open API Key Page') {
    await vscode.env.openExternal(vscode.Uri.parse(info.url));
  } else if (!action) {
    return null;
  }

  const input = await vscode.window.showInputBox({
    prompt: `Paste your ${provider} API key`,
    placeHolder: info.placeholder,
    password: true,
    ignoreFocusOut: true,
  });
  if (!input) return null;
  apiKey = input.trim();
  await auth.storeAiApiKey(apiKey);
  return apiKey;
}
