/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review PR Command
 */

import * as vscode from 'vscode';
import { ReviewEngine, detectFramework, BitbucketClient, GitHubClient, buildStandalonePrompt, parseStandaloneResponse, calculateRisk, loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt, resolveIssueLocations, annotateDiffWithLineNumbers as annotateDiffWithLineNumbersCore } from 'ira-review';
import type { IraConfig, ReviewResult, ReviewComment, BitbucketConfig, GitHubConfig } from 'ira-review';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { updateStatusBar } from '../providers/statusBarProvider';
import { IraIssuesProvider } from '../providers/treeViewProvider';
import { IraCodeLensProvider } from '../providers/codeLensProvider';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { setLastResult } from '../extension';
import { ReviewHistoryStore } from '../services/reviewHistoryStore';
import { AuthProvider } from '../services/authProvider';
import { isNoAIProviderError, showAISetupPrompt } from '../services/ollamaSetup';
import { resolveAiApiKey } from '../utils/credentialPrompts';
import * as msg from '../utils/messages';
import { execGit, detectRepo } from '../utils/git';
import { BitbucketServerDiffResponse, convertBBServerDiffToUnified, parseDiffByFile } from '../utils/diff';

export async function reviewPR(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  statusBar: vscode.StatusBarItem,
  treeProvider: IraIssuesProvider,
  codeLensProvider: IraCodeLensProvider,
): Promise<void> {
  const path = require('path');
  const fs = require('fs');
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage(msg.noWorkspace());
    return;
  }

  // Find all git repos under workspace
  const repos: string[] = [];
  if (fs.existsSync(path.join(wsRoot, '.git'))) repos.push(wsRoot);
  try {
    for (const entry of fs.readdirSync(wsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const child = path.join(wsRoot, entry.name);
      if (fs.existsSync(path.join(child, '.git'))) repos.push(child);
    }
  } catch { /* ignore */ }

  let workspaceRoot: string;
  if (repos.length === 0) {
    workspaceRoot = wsRoot;
  } else if (repos.length === 1) {
    workspaceRoot = repos[0];
  } else {
    const pick = await vscode.window.showQuickPick(
      repos.map(r => ({ label: path.basename(r), description: r, repoPath: r })),
      { placeHolder: 'Which project are you reviewing?' },
    );
    if (!pick) return;
    workspaceRoot = pick.repoPath;
  }

  // Ask: existing PR or local diff?
  const reviewMode = await vscode.window.showQuickPick(
    [
      { label: '$(git-pull-request) I have a PR number', id: 'pr' as const },
      { label: '$(git-branch) No PR yet (review local changes)', id: 'local' as const },
    ],
    { placeHolder: 'How would you like to review?' },
  );
  if (!reviewMode) return;

  let prNumber: string | null = null;
  if (reviewMode.id === 'pr') {
    prNumber = await detectPRNumber(workspaceRoot);
    if (!prNumber) return;
  }

  // For local mode, check for uncommitted changes before showing progress
  if (reviewMode.id === 'local') {
    const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
      ? require('path').dirname(vscode.window.activeTextEditor.document.uri.fsPath)
      : undefined;
    const gitRoot = activeFileDir
      ? await execGit('git rev-parse --show-toplevel', activeFileDir).catch(() => workspaceRoot)
      : workspaceRoot;
    const status = await execGit('git status --porcelain', gitRoot).catch(() => '');
    if (!status.trim()) {
      const action = await vscode.window.showInformationMessage(
        'No uncommitted changes found. If you already have a PR, use "I have a PR" to review it.',
        'Review a PR',
      );
      if (action === 'Review a PR') {
        vscode.commands.executeCommand('ira.reviewPR');
      }
      return;
    }
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.reviewPR, cancellable: true },
    async (progress, token) => {
      try {
        const config = vscode.workspace.getConfiguration('ira');

        // Local diff mode — review uncommitted changes
        if (reviewMode.id === 'local') {
          await runLocalDiffReview(config, workspaceRoot, context, diagnosticCollection, statusBar, treeProvider, codeLensProvider);
          return;
        }

        const repoInfo = await detectRepo(workspaceRoot);

        // Auth: resolve token via AuthProvider (auto-detects SCM, OAuth → SecretStorage → settings PAT)
        const scmSession = await AuthProvider.getInstance().resolveScmSession(workspaceRoot);
        if (!scmSession) {
          vscode.window.showErrorMessage(msg.authRequired());
          return;
        }
        const scmProvider = scmSession.provider === 'github-enterprise' ? 'github' : scmSession.provider;
        const scmToken = scmSession.accessToken;

        // Use GHE base URL from settings or auto-detected
        const gheUrl = config.get<string>('githubUrl', '') || repoInfo.baseUrl;

        const aiProvider = config.get<string>('aiProvider', 'copilot');
        const useCopilot = aiProvider === 'copilot';

        const authInstance = AuthProvider.getInstance();

        // If not using Copilot, require an API key
        if (!useCopilot) {
          const aiApiKey = await resolveAiApiKey();
          if (!aiApiKey) return;
        }

        let result: ReviewResult;

        progress.report({ message: 'Authenticated — fetching PR diff…' });

        if (useCopilot) {
          // Copilot mode: fetch diff via SCM client, review with VS Code LM API
          result = await runCopilotReview(config, scmProvider, repoInfo, gheUrl, scmToken, prNumber!, workspaceRoot, {
            onFileReviewed: (comments, fileIdx, totalFiles) => {
              updateDiagnostics(comments, diagnosticCollection, workspaceRoot);
              treeProvider.update(comments, workspaceRoot);
              codeLensProvider.update(comments);
            },
            onProgress: (message) => {
              progress.report({ message });
            },
          }, token);
          if (token.isCancellationRequested) { vscode.window.showInformationMessage('IRA: Operation cancelled.'); return; }
        } else {
          // Standard mode: use ReviewEngine with external AI provider
          const iraConfig: IraConfig = {
            scmProvider,
            scm: scmProvider === 'github'
              ? { owner: repoInfo.owner, repo: repoInfo.repo, token: scmToken, ...(gheUrl && { baseUrl: gheUrl }) }
              : { workspace: repoInfo.owner, repoSlug: repoInfo.repo, token: scmToken },
            ai: {
              provider: aiProvider as IraConfig['ai']['provider'],
              apiKey: await authInstance.getAiApiKey(),
              model: config.get<string>('aiModel', 'gpt-4o-mini'),
            },
            pullRequestId: prNumber!,
            dryRun: true,
            repoPath: workspaceRoot,
            minSeverity: config.get<string>('minSeverity', 'MAJOR') as IraConfig['minSeverity'],
          };

          const sonarUrl = config.get<string>('sonarUrl', '');
          if (sonarUrl) {
            iraConfig.sonar = {
              baseUrl: sonarUrl,
              token: await authInstance.getSonarToken(),
              projectKey: config.get<string>('sonarProjectKey', ''),
            };
          }

          const jiraUrl = config.get<string>('jiraUrl', '');
          if (jiraUrl) {
            const acField = config.get<string>('jiraAcField', '') || undefined;
            iraConfig.jira = {
              baseUrl: jiraUrl,
              email: config.get<string>('jiraEmail', ''),
              token: await authInstance.getJiraToken(),
              ...(acField && { acceptanceCriteriaField: acField }),
            };
            iraConfig.jiraAcSource = (config.get<string>('jiraAcSource', 'both') as IraConfig['jiraAcSource']);
          }

          // Detect JIRA ticket from branch name
          if (iraConfig.jira) {
            const branch = await execGit('git branch --show-current', workspaceRoot).catch(() => '');
            const jiraMatch = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
            if (jiraMatch) {
              iraConfig.jiraTicket = jiraMatch[1];
            }
          }

          progress.report({ message: 'Diff loaded — AI is reviewing your code…' });
          const engine = new ReviewEngine(iraConfig);
          result = await engine.run();
          if (token.isCancellationRequested) { vscode.window.showInformationMessage('IRA: Operation cancelled.'); return; }
        }

        progress.report({ message: 'Review complete — highlighting issues…' });
        setLastResult(result);

        progress.report({ message: 'Wrapping up — sending notifications…' });
        // Send notifications if configured
        try {
          const slackWebhookUrl = config.get<string>('slackWebhookUrl', '');
          const teamsWebhookUrl = config.get<string>('teamsWebhookUrl', '');
          if (slackWebhookUrl || teamsWebhookUrl) {
            const { Notifier } = await import('ira-review');
            const notifier = new Notifier({
              slackWebhookUrl: slackWebhookUrl || undefined,
              teamsWebhookUrl: teamsWebhookUrl || undefined,
              minRiskLevel: config.get<string>('notifyMinRisk', 'low') as any,
              notifyOnAcFail: config.get<boolean>('notifyOnAcFail', false),
            });
            await notifier.notify(result);
          }
        } catch (notifyErr) {
          console.warn('IRA: Notification failed:', notifyErr);
        }

        updateDiagnostics(result.comments, diagnosticCollection, workspaceRoot);
        updateStatusBar(statusBar, result.risk);
        treeProvider.update(result.comments, workspaceRoot);
        codeLensProvider.update(result.comments);

        // Save to review history
        try {
          const historyStore = ReviewHistoryStore.getInstance();
          await historyStore.save(result);
        } catch {
          // History store not initialized — soft fail
        }

        const successMsg = await msg.reviewPRSuccess(result.totalIssues, result.risk?.level);
        vscode.window.showInformationMessage(successMsg);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Review error:', message);
        if (isNoAIProviderError(message)) {
          showAISetupPrompt();
        } else {
          vscode.window.showErrorMessage(msg.reviewFailed(message));
        }
      }
    },
  );
}

interface ProgressCallbacks {
  onFileReviewed?: (comments: ReviewComment[], fileIndex: number, totalFiles: number) => void;
  onProgress?: (message: string) => void;
}

async function runCopilotReview(
  config: vscode.WorkspaceConfiguration,
  scmProvider: 'github' | 'bitbucket',
  repoInfo: { owner: string; repo: string; baseUrl?: string },
  gheUrl: string | undefined,
  scmToken: string,
  prNumber: string,
  workspaceRoot: string,
  callbacks?: ProgressCallbacks,
  token?: vscode.CancellationToken,
): Promise<ReviewResult> {
  // 1. Fetch diff
  const bbUrl = config.get<string>('bitbucketUrl', '');
  let fullDiff: string;

  if (scmProvider === 'bitbucket' && bbUrl) {
    // Bitbucket Server API (different URL structure from Bitbucket Cloud)
    const diffUrl = `${bbUrl.replace(/\/+$/, '')}/rest/api/1.0/projects/${repoInfo.owner}/repos/${repoInfo.repo}/pull-requests/${prNumber}/diff?contextLines=3`;
    const response = await fetch(diffUrl, {
      headers: {
        'Authorization': `Bearer ${scmToken}`,
        'Accept': 'text/plain',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bitbucket API error (${response.status}): ${text}`);
    }

    const rawText = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    // Bitbucket Server returns JSON diff format, convert to unified diff
    if (contentType.includes('application/json') || rawText.trimStart().startsWith('{')) {
      const json = JSON.parse(rawText) as BitbucketServerDiffResponse;
      fullDiff = convertBBServerDiffToUnified(json);
    } else {
      fullDiff = rawText;
    }
  } else if (scmProvider === 'github') {
    const client = new GitHubClient({ owner: repoInfo.owner, repo: repoInfo.repo, token: scmToken, ...(gheUrl && { baseUrl: gheUrl }) } as GitHubConfig);
    fullDiff = await client.getDiff(prNumber);
  } else {
    // Bitbucket Cloud
    const client = new BitbucketClient({ workspace: repoInfo.owner, repoSlug: repoInfo.repo, token: scmToken, baseUrl: bbUrl } as BitbucketConfig);
    fullDiff = await client.getDiff(prNumber);
  }
  const diffByFile = parseDiffByFile(fullDiff);

  if (diffByFile.size === 0) {
    throw new Error('No changed files found in this PR.');
  }

  // 3. Detect framework
  let framework: Awaited<ReturnType<typeof detectFramework>> = null;
  try {
    framework = await detectFramework(workspaceRoot);
  } catch {
    // ignore
  }

  // 4. Load team rules
  const rules = loadRulesFile(workspaceRoot);
  const sensitiveAreas = loadSensitiveAreas(workspaceRoot);

  // 5. Review each file with Copilot
  callbacks?.onProgress?.(`Found ${diffByFile.size} changed files — starting review…`);
  const copilot = new CopilotAIProvider();
  const comments: ReviewComment[] = [];

  let fileIndex = 0;
  const totalFiles = diffByFile.size;
  for (const [filePath, diff] of diffByFile) {
    if (token?.isCancellationRequested) break;
    fileIndex++;
    callbacks?.onProgress?.(`Reviewing ${filePath.split('/').pop()} (${fileIndex}/${totalFiles})…`);
    try {
      const filteredRules = filterRulesByPath(rules, filePath);
      const rulesSection = formatRulesForPrompt(filteredRules);
      const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
      const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
      const annotatedDiff = annotateDiffWithLineNumbersCore(diff);
      const prompt = buildStandalonePrompt(filePath, annotatedDiff, framework, null, rulesSection, sensitiveContext);
      const rawResponse = await copilot.rawReview(prompt);
      // Parse the raw AI response into structured issues
      try {
        const rawIssues = parseStandaloneResponse(rawResponse);
        const resolved = resolveIssueLocations(rawIssues, annotatedDiff);
        const issues = resolved.filter(
          (issue) => issue.evidence && issue.evidence.length >= 20
        );
        for (const issue of issues) {
          comments.push({
            filePath,
            line: issue.line,
            rule: `IRA/${issue.category}`,
            severity: issue.severity,
            message: issue.message,
            aiReview: {
              explanation: issue.explanation,
              impact: issue.impact,
              suggestedFix: issue.suggestedFix,
            },
          });
        }
      } catch (parseError) {
        comments.push({
          filePath,
          line: 1,
          rule: 'IRA/review',
          severity: 'MAJOR',
          message: 'AI review finding',
          aiReview: { explanation: rawResponse, impact: 'See above', suggestedFix: 'Review manually' },
        });
      }
      callbacks?.onFileReviewed?.(comments, fileIndex, totalFiles);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`IRA: AI review skipped for ${filePath}: ${errMsg}`);
    }
  }

  // Check if any reviewed file was in a sensitive area
  const hasSensitiveFiles = [...diffByFile.keys()].some(fp => matchSensitiveArea(sensitiveAreas, fp) !== null);

  // 5. Calculate risk
  const sonarIssues = comments.map((c, i) => ({
    key: `AI-${i}`,
    rule: c.rule,
    severity: c.severity as 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
    component: c.filePath,
    message: c.message,
    line: c.line,
    type: c.rule.includes('security') ? 'VULNERABILITY' as const : 'CODE_SMELL' as const,
    flows: [] as { locations: { component: string; msg: string }[] }[],
    tags: [c.rule.replace('IRA/', '')],
  }));

  const risk = comments.length > 0
    ? calculateRisk({
        allIssues: sonarIssues,
        filteredIssues: sonarIssues,
        complexity: null,
        filesChanged: diffByFile.size,
        sensitiveFileMultiplier: hasSensitiveFiles ? 2 : 1,
      })
    : null;

  return {
    pullRequestId: prNumber,
    framework,
    reviewMode: 'standalone',
    totalIssues: comments.length,
    reviewedIssues: comments.length,
    comments,
    commentsPosted: 0,
    risk,
    complexity: null,
    acceptanceValidation: null,
  };
}

async function runLocalDiffReview(
  config: vscode.WorkspaceConfiguration,
  workspaceRoot: string,
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  statusBar: vscode.StatusBarItem,
  treeProvider: IraIssuesProvider,
  codeLensProvider: IraCodeLensProvider,
): Promise<void> {
  // Re-resolve git root from active editor to ensure we're inside a repo
  const activeFileDir = vscode.window.activeTextEditor?.document.uri.fsPath
    ? require('path').dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const gitRoot = activeFileDir
    ? await execGit('git rev-parse --show-toplevel', activeFileDir).catch(() => workspaceRoot)
    : workspaceRoot;

  let fullDiff = await execGit('git diff HEAD', gitRoot);
  if (!fullDiff.trim()) {
    fullDiff = await execGit('git diff', gitRoot);
  }
  if (!fullDiff.trim()) {
    vscode.window.showWarningMessage(msg.noChanges());
    return;
  }

  const diffByFile = parseDiffByFile(fullDiff);
  let framework: Awaited<ReturnType<typeof detectFramework>> = null;
  try { framework = await detectFramework(gitRoot); } catch { /* ignore */ }

  const rules = loadRulesFile(gitRoot);
  const sensitiveAreas = loadSensitiveAreas(gitRoot);
  const copilot = new CopilotAIProvider();
  const comments: ReviewComment[] = [];

  const aiProvider = config.get<string>('aiProvider', 'copilot');

  for (const [filePath, diff] of diffByFile) {
    try {
      const filteredRules = filterRulesByPath(rules, filePath);
      const rulesSection = formatRulesForPrompt(filteredRules);
      const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
      const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
      const annotatedDiff = annotateDiffWithLineNumbersCore(diff);
      const prompt = buildStandalonePrompt(filePath, annotatedDiff, framework, null, rulesSection, sensitiveContext);

      let rawResponse: string;
      if (aiProvider === 'copilot') {
        rawResponse = await copilot.rawReview(prompt);
      } else {
        const { resolveAiApiKey } = await import('../utils/credentialPrompts');
        const apiKey = await resolveAiApiKey();
        if (!apiKey) return;
        const { createAIProvider: createProvider } = await import('ira-review');
        const provider = createProvider({
          provider: aiProvider as any,
          apiKey,
          model: config.get<string>('aiModel', 'gpt-4o-mini'),
        });
        rawResponse = (await provider.review(prompt)).explanation;
      }

      const rawIssues = parseStandaloneResponse(rawResponse);
      const issues = resolveIssueLocations(rawIssues, annotatedDiff);
      for (const issue of issues) {
        comments.push({
          filePath,
          line: issue.line,
          rule: `IRA/${issue.category}`,
          severity: issue.severity,
          message: issue.message,
          aiReview: {
            explanation: issue.explanation,
            impact: issue.impact,
            suggestedFix: issue.suggestedFix,
          },
        });
      }
    } catch (error) {
      console.warn(`IRA: Review skipped for ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const sonarIssues = comments.map((c, i) => ({
    key: `AI-${i}`,
    rule: c.rule,
    severity: c.severity as 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
    component: c.filePath,
    message: c.message,
    line: c.line,
    type: c.rule.includes('security') ? 'VULNERABILITY' as const : 'CODE_SMELL' as const,
    flows: [] as { locations: { component: string; msg: string }[] }[],
    tags: [c.rule.replace('IRA/', '')],
  }));

  const hasSensitiveFiles = [...diffByFile.keys()].some(fp => matchSensitiveArea(sensitiveAreas, fp) !== null);
  const risk = comments.length > 0
    ? calculateRisk({
        allIssues: sonarIssues,
        filteredIssues: sonarIssues,
        complexity: null,
        filesChanged: diffByFile.size,
        sensitiveFileMultiplier: hasSensitiveFiles ? 2 : 1,
      })
    : null;

  const result: ReviewResult = {
    pullRequestId: 'local-diff',
    framework,
    reviewMode: 'standalone',
    totalIssues: comments.length,
    reviewedIssues: comments.length,
    comments,
    commentsPosted: 0,
    risk,
    complexity: null,
    acceptanceValidation: null,
  };

  setLastResult(result);
  updateDiagnostics(result.comments, diagnosticCollection, gitRoot);
  updateStatusBar(statusBar, result.risk);
  treeProvider.update(result.comments, gitRoot);
  codeLensProvider.update(result.comments);

  const successMsg = await msg.reviewPRSuccess(result.totalIssues, result.risk?.level);
  vscode.window.showInformationMessage(successMsg);
}

async function detectDefaultBranch(cwd: string): Promise<string> {
  // Try to auto-detect a sensible default
  let detected = '';
  try {
    const ref = await execGit('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    detected = ref.replace('refs/remotes/origin/', '');
  } catch { /* ignore */ }
  if (!detected) {
    for (const branch of ['develop', 'main', 'master']) {
      try {
        await execGit(`git rev-parse --verify ${branch}`, cwd);
        detected = branch;
        break;
      } catch { /* ignore */ }
    }
  }

  const currentBranch = await execGit('git branch --show-current', cwd).catch(() => '');

  // Always confirm with the user — auto-detection can't handle feature-to-feature branching
  const input = await vscode.window.showInputBox({
    prompt: `Which branch should we diff against?${currentBranch ? ` (current: ${currentBranch})` : ''}`,
    value: detected || 'develop',
    placeHolder: 'e.g. develop, main, feature/parent-branch',
    ignoreFocusOut: true,
  });
  if (!input) return detected || 'main';
  return input.trim();
}

async function detectPRNumber(cwd: string): Promise<string | null> {
  // Always ask the user — branch names contain JIRA ticket numbers, not PR numbers
  const branch = await execGit('git branch --show-current', cwd).catch(() => '');
  const prNumber = await vscode.window.showInputBox({
    prompt: branch ? msg.prompts.prNumber(branch) : 'What\'s the PR number?',
    placeHolder: msg.prompts.prNumberPlaceholder,
  });
  return prNumber ?? null;
}
