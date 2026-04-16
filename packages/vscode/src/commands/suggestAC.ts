/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Suggest AC Command — generate acceptance criteria from local changes
 * or any PR's code changes, and post them to JIRA as a comment.
 */

import * as vscode from 'vscode';
import { JiraClient, generateAcceptanceCriteria, formatACsForJiraComment, createAIProvider, BitbucketClient } from 'ira-review';
import type { AIProviderType, BitbucketConfig } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { AmpAIProvider, isAmpCliAvailable } from '../providers/ampAIProvider';
import { AuthProvider } from '../services/authProvider';
import { resolveJiraCredentials, resolveAiApiKey } from '../utils/credentialPrompts';
import * as msg from '../utils/messages';
import { openMarkdownPreview } from '../utils/markdownPreview';
import { execGit, detectRepo, detectDefaultBranch } from '../utils/git';

const MAX_DIFF_LENGTH = 100_000;
const MIN_ADDED_LINES = 10;

export async function suggestAC(): Promise<void> {
  const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
    ? require('path').dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const fallbackDir = activeFileDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!fallbackDir) {
    vscode.window.showErrorMessage(msg.noWorkspace());
    return;
  }
  const workspaceRoot = await execGit('git rev-parse --show-toplevel', fallbackDir).catch(() => fallbackDir);

  // Step 1: Detect JIRA ticket from branch name, or prompt
  const branch = await execGit('git branch --show-current', workspaceRoot).catch(() => '');
  const ticketMatch = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
  let jiraKey = ticketMatch?.[1] ?? '';

  if (!jiraKey) {
    const input = await vscode.window.showInputBox({
      prompt: msg.prompts.jiraTicket,
      placeHolder: msg.prompts.jiraTicketPlaceholder,
      ignoreFocusOut: true,
    });
    if (!input) return;
    jiraKey = input.trim().toUpperCase();
  }

  // Step 2: Resolve JIRA credentials
  const config = vscode.workspace.getConfiguration('ira');
  const jiraCreds = await resolveJiraCredentials();
  if (!jiraCreds) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.suggestAC(jiraKey), cancellable: true },
    async (progress, token) => {
      try {
        // Step 3: Fetch JIRA ticket
        const acField = config.get<string>('jiraAcField', '') || undefined;
        const jira = new JiraClient({ baseUrl: jiraCreds.url, email: jiraCreds.email, token: jiraCreds.token, type: jiraCreds.type, acceptanceCriteriaField: acField });
        const issue = await jira.fetchIssue(jiraKey);
        if (token.isCancellationRequested) { vscode.window.showInformationMessage('IRA: Operation cancelled.'); return; }
        progress.report({ message: 'Ticket loaded — reading your code changes…' });

        // Step 4: Check if ACs already exist (respecting jiraAcSource setting)
        const acSource = config.get<string>('jiraAcSource', 'both');
        const explicitAC = issue.fields.acceptanceCriteria?.trim() || '';
        const descriptionAC = issue.fields.description?.trim() || '';
        const hasExistingAC = acSource === 'customField' ? !!explicitAC
          : acSource === 'description' ? !!descriptionAC
          : !!(explicitAC || descriptionAC);
        if (hasExistingAC) {
          vscode.window.showInformationMessage(msg.acAlreadyExists(jiraKey));
          return;
        }

        // Step 5: Choose diff source
        const diffSource = await vscode.window.showQuickPick(
          [
            { label: '$(git-branch) My local changes', id: 'local' as const },
            { label: '$(git-pull-request) A PR number (anyone\'s PR)', id: 'pr' as const },
          ],
          { placeHolder: 'Generate ACs from which code changes?' },
        );
        if (!diffSource) return;

        let diff = '';

        if (diffSource.id === 'pr') {
          const prNumber = await vscode.window.showInputBox({
            prompt: 'Enter the PR number',
            placeHolder: 'e.g. 123',
            ignoreFocusOut: true,
          });
          if (!prNumber) return;

          progress.report({ message: `Fetching PR #${prNumber} diff…` });
          const repoInfo = await detectRepo(workspaceRoot);
          const scmSession = await AuthProvider.getInstance().resolveScmSession(workspaceRoot);
          if (!scmSession) {
            vscode.window.showErrorMessage('SCM authentication required. Configure a token in IRA settings.');
            return;
          }
          const scmProvider = scmSession.provider === 'github-enterprise' ? 'github' : scmSession.provider;
          const scmToken = scmSession.accessToken;

          if (scmProvider === 'github') {
            const gheUrl = config.get<string>('githubUrl', '') || repoInfo.baseUrl;
            const apiBase = gheUrl || 'https://api.github.com';
            const resp = await fetch(`${apiBase}/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`, {
              headers: { 'Authorization': `Bearer ${scmToken}`, 'Accept': 'application/vnd.github.v3.diff' },
            });
            if (!resp.ok) { const text = await resp.text(); throw new Error(formatApiError(resp.status, text, 'GitHub')); }
            diff = await resp.text();
          } else {
            const bbUrl = config.get<string>('bitbucketUrl', '');
            const bbBaseUrl = bbUrl ? bbUrl.replace(/\/+$/, '') : '';
            if (bbBaseUrl) {
              const resp = await fetch(
                `${bbBaseUrl}/rest/api/1.0/projects/${repoInfo.owner}/repos/${repoInfo.repo}/pull-requests/${prNumber}/diff?contextLines=3`,
                { headers: { 'Authorization': `Bearer ${scmToken}`, 'Accept': 'text/plain' } },
              );
              if (!resp.ok) { const text = await resp.text(); throw new Error(formatApiError(resp.status, text, 'Bitbucket')); }
              diff = await resp.text();
            } else {
              const client = new BitbucketClient({ workspace: repoInfo.owner, repoSlug: repoInfo.repo, token: scmToken } as BitbucketConfig);
              diff = await client.getDiff(prNumber);
            }
          }
        } else {
          const defaultBranch = await detectDefaultBranch(workspaceRoot);
          diff = await execGit(`git diff ${defaultBranch}`, workspaceRoot);
          if (!diff.trim()) {
            diff = await execGit('git diff HEAD', workspaceRoot);
          }
        }

        if (!diff.trim()) {
          vscode.window.showWarningMessage(msg.noChanges());
          return;
        }

        if (token.isCancellationRequested) { vscode.window.showInformationMessage('IRA: Operation cancelled.'); return; }

        // Step 6: Check minimum added lines
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
        if (addedLines < MIN_ADDED_LINES) {
          vscode.window.showWarningMessage(msg.acInsufficientChanges());
          return;
        }

        if (diff.length > MAX_DIFF_LENGTH) {
          diff = diff.slice(0, MAX_DIFF_LENGTH) + '\n... [diff truncated]';
        }

        progress.report({ message: 'Gathered context — generating acceptance criteria…' });
        if (token.isCancellationRequested) { vscode.window.showInformationMessage('IRA: Operation cancelled.'); return; }
        // Step 7: Get commit messages
        const commitLog = await execGit(`git log --oneline -20 --no-decorate`, workspaceRoot).catch(() => '');
        const commitMessages = commitLog ? commitLog.split('\n').filter(Boolean) : [];

        // Step 8: Fetch epic/subtask context
        const { epicSummary, subtasks } = await jira.fetchEpicAndSubtasks(jiraKey);

        // Step 9: Build AI provider and generate ACs
        const aiProviderName = config.get<string>('aiProvider', 'copilot');
        let aiProvider;
        if (aiProviderName === 'amp') {
          if (!isAmpCliAvailable()) {
            vscode.window.showErrorMessage('AMP CLI not found — install it from ampcode.com/install and run `amp login`');
            return;
          }
          const ampMode = config.get<string>('ampMode', 'deep') as 'smart' | 'rush' | 'deep';
          aiProvider = {
            review: async (prompt: string) => {
              const amp = new AmpAIProvider(ampMode);
              const raw = await amp.rawReview(prompt);
              return { explanation: raw, impact: '', suggestedFix: '' };
            },
          };
        } else if (aiProviderName === 'copilot') {
          aiProvider = {
            review: async (prompt: string) => {
              const copilot = new CopilotAIProvider();
              const raw = await copilot.rawReview(prompt);
              return { explanation: raw, impact: '', suggestedFix: '' };
            },
          };
        } else {
          const apiKey = await resolveAiApiKey();
          if (!apiKey) return;
          aiProvider = createAIProvider({ provider: aiProviderName as AIProviderType, apiKey, model: config.get<string>('aiModel', 'gpt-4o-mini') });
        }

        const result = await generateAcceptanceCriteria(issue, aiProvider, null, {
          diff,
          commitMessages,
          branchName: branch || null,
          epicSummary,
          subtasks,
        });

        progress.report({ message: 'ACs ready — posting to JIRA…' });

        // Post to JIRA (always post — allows ACs to be refreshed when code changes)
        const comment = formatACsForJiraComment(result, 'local', branch || null);
        await jira.addComment(jiraKey, comment);

        progress.report({ message: 'Posted — opening preview…' });
        // Step 12: Show results in rendered markdown preview
        const markdown = buildACMarkdown(result);
        await openMarkdownPreview(markdown, `ac-${jiraKey}`);

        // Step 13: Success message
        vscode.window.showInformationMessage(msg.acSuggestSuccess(result.totalCriteria, jiraKey));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(msg.acValidationFailed(message));
      }
    },
  );
}

function formatApiError(status: number, body: string, provider: string): string {
  const statusMessages: Record<number, string> = {
    401: 'Authentication failed — check your token',
    403: 'Access denied — check your permissions',
    404: 'Not found — check the PR number or repo',
    429: 'Rate limited — try again shortly',
    500: 'Server error — try again in a moment',
    502: 'Service temporarily unavailable',
    503: 'Service unavailable — try again shortly',
  };
  const friendly = statusMessages[status] ?? `HTTP ${status}`;
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const msg = json.message ?? json.error?.message ?? json.error ?? json.errors?.[0]?.message;
      if (typeof msg === 'string' && msg.length > 0 && msg.length < 200) return `${provider} (${status}): ${msg}`;
    } catch { /* fall through */ }
  }
  if (trimmed.startsWith('<!') || trimmed.includes('<body')) return `${provider} (${status}): ${friendly}`;
  if (trimmed.length > 0 && trimmed.length < 150) return `${provider} (${status}): ${trimmed}`;
  return `${provider} (${status}): ${friendly}`;
}

function buildACMarkdown(result: import('ira-review').ACGenerationResult): string {
  const lines: string[] = [];
  lines.push(`# Acceptance Criteria`);
  lines.push('');

  for (const ac of result.criteria) {
    lines.push(`**${ac.id}:**`);
    lines.push(`Given ${ac.given}`);
    lines.push(`When ${ac.when}`);
    lines.push(`Then ${ac.then}`);
    lines.push('');
  }

  if (result.reviewHints.length > 0) {
    lines.push('**Questions for PO to consider:**');
    lines.push('');
    for (const hint of result.reviewHints) {
      lines.push(`- ${hint}`);
    }
    lines.push('');
  }

  lines.push('> 📝 **Note for testers:** Run `IRA: Generate Tests` in VS Code to create automated tests from these criteria.');
  return lines.join('\n');
}

