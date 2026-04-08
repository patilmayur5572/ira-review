/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review PR Command
 */

import * as vscode from 'vscode';
import { ReviewEngine, detectFramework, BitbucketClient, GitHubClient, buildStandalonePrompt, parseStandaloneResponse, calculateRisk, loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from 'ira-review';
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
import * as cp from 'child_process';

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

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.reviewPR, cancellable: false },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('ira');

        // Local diff mode — review changes against default branch
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

        if (useCopilot) {
          // Copilot mode: fetch diff via SCM client, review with VS Code LM API
          result = await runCopilotReview(config, scmProvider, repoInfo, gheUrl, scmToken, prNumber!, workspaceRoot);
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
            iraConfig.jira = {
              baseUrl: jiraUrl,
              email: config.get<string>('jiraEmail', ''),
              token: await authInstance.getJiraToken(),
            };
          }

          // Detect JIRA ticket from branch name
          if (iraConfig.jira) {
            const branch = await execGit('git branch --show-current', workspaceRoot).catch(() => '');
            const jiraMatch = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
            if (jiraMatch) {
              iraConfig.jiraTicket = jiraMatch[1];
            }
          }

          const engine = new ReviewEngine(iraConfig);
          result = await engine.run();
        }

        setLastResult(result);

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

        // Save to review history (all users — UI gated behind Pro)
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

async function runCopilotReview(
  config: vscode.WorkspaceConfiguration,
  scmProvider: 'github' | 'bitbucket',
  repoInfo: { owner: string; repo: string; baseUrl?: string },
  gheUrl: string | undefined,
  scmToken: string,
  prNumber: string,
  workspaceRoot: string,
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
  const copilot = new CopilotAIProvider();
  const comments: ReviewComment[] = [];

  let fileIndex = 0;
  for (const [filePath, diff] of diffByFile) {
    fileIndex++;
    try {
      const filteredRules = filterRulesByPath(rules, filePath);
      const rulesSection = formatRulesForPrompt(filteredRules);
      const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
      const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
      const annotatedDiff = annotateDiffWithLineNumbers(diff);
      const prompt = buildStandalonePrompt(filePath, annotatedDiff, framework, null, rulesSection, sensitiveContext);
      const rawResponse = await copilot.rawReview(prompt);
      // Parse the raw AI response into structured issues
      try {
        const issues = parseStandaloneResponse(rawResponse);
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`IRA: AI review skipped for ${filePath}: ${msg}`);
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

  const defaultBranch = await detectDefaultBranch(gitRoot);
  let fullDiff = await execGit(`git diff ${defaultBranch}`, gitRoot);
  if (!fullDiff.trim()) {
    fullDiff = await execGit('git diff HEAD', gitRoot);
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
      const annotatedDiff = annotateDiffWithLineNumbers(diff);
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

      const issues = parseStandaloneResponse(rawResponse);
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
  try {
    const ref = await execGit('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    return ref.replace('refs/remotes/origin/', '');
  } catch { /* ignore */ }
  for (const branch of ['main', 'master']) {
    try {
      await execGit(`git rev-parse --verify ${branch}`, cwd);
      return branch;
    } catch { /* ignore */ }
  }
  return 'main';
}

function parseDiffByFile(diff: string): Map<string, string> {
  const fileMap = new Map<string, string>();
  const fileSections = diff.split(/^diff --git /m);
  for (const section of fileSections) {
    if (!section.trim()) continue;

    // Standard: diff --git a/file.ts b/file.ts
    // Bitbucket Server: diff --git src://file.ts dst://file.ts
    const headerMatch = section.match(/^(?:a\/|src:\/\/)(.+?)\s+(?:b\/|dst:\/\/)(.+)/);
    if (!headerMatch) continue;
    const bPath = headerMatch[2];
    if (bPath === '/dev/null') continue;
    fileMap.set(bPath, `diff --git ${section}`);
  }
  return fileMap;
}

/**
 * Annotate diff lines with absolute file line numbers so the AI reports accurate positions.
 * Transforms:  "+  const x = 1;"  →  "L280: +  const x = 1;"
 */
function annotateDiffWithLineNumbers(diffSection: string): string {
  const lines = diffSection.split('\n');
  const result: string[] = [];
  let currentLine = 1;

  for (const line of lines) {
    // Parse hunk header to get the starting line number
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      result.push(line);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      result.push(`L${currentLine}: ${line}`);
      currentLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.push(line); // removed lines don't advance the line counter
    } else {
      // context line
      result.push(`L${currentLine}: ${line}`);
      currentLine++;
    }
  }
  return result.join('\n');
}

// Bitbucket Server diff JSON types
interface BitbucketServerDiffResponse {
  diffs: Array<{
    source?: { toString: string };
    destination?: { toString: string };
    hunks?: Array<{
      segments: Array<{
        type: 'ADDED' | 'REMOVED' | 'CONTEXT';
        lines: Array<{ line: string; source?: number; destination?: number }>;
      }>;
    }>;
  }>;
}

function convertBBServerDiffToUnified(json: BitbucketServerDiffResponse): string {
  const parts: string[] = [];
  for (const diff of json.diffs ?? []) {
    const src = diff.source?.toString ?? '/dev/null';
    const dst = diff.destination?.toString ?? '/dev/null';
    parts.push(`diff --git a/${src} b/${dst}`);
    parts.push(`--- a/${src}`);
    parts.push(`+++ b/${dst}`);
    for (const hunk of diff.hunks ?? []) {
      parts.push('@@ -1,0 +1,0 @@');
      for (const seg of hunk.segments) {
        const prefix = seg.type === 'ADDED' ? '+' : seg.type === 'REMOVED' ? '-' : ' ';
        for (const line of seg.lines) {
          parts.push(`${prefix}${line.line}`);
        }
      }
    }
  }
  return parts.join('\n');
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

async function detectRepo(cwd: string): Promise<{ owner: string; repo: string; baseUrl?: string }> {
  try {
    const url = await execGit('git remote get-url origin', cwd);
    // github.com (SSH or HTTPS)
    const ghMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (ghMatch) {
      return { owner: ghMatch[1], repo: ghMatch[2] };
    }

    // Bitbucket Server: https://bitbucket.srv.company.com/scm/PROJECT/repo.git
    const bbServerMatch = url.match(/https?:\/\/[^/]+\/scm\/([^/]+)\/([^/.]+)/);
    if (bbServerMatch) {
      return { owner: bbServerMatch[1], repo: bbServerMatch[2] };
    }

    // Bitbucket Server SSH: ssh://git@bitbucket.srv.company.com/PROJECT/repo.git
    const bbSshMatch = url.match(/@[^/]+[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (bbSshMatch) {
      return { owner: bbSshMatch[1], repo: bbSshMatch[2] };
    }

    // GitHub Enterprise: https://ghe.company.com/owner/repo.git
    const gheMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/([^/.]+)/);
    if (gheMatch) {
      return { owner: gheMatch[2], repo: gheMatch[3], baseUrl: `https://${gheMatch[1]}/api/v3` };
    }
  } catch {
    // ignore
  }
  return { owner: '', repo: '' };
}

function execGit(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}
