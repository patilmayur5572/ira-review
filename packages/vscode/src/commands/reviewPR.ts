/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review PR Command
 */

import * as vscode from 'vscode';
import { ReviewEngine, detectFramework, BitbucketClient, GitHubClient, buildStandalonePrompt, parseStandaloneResponse, calculateRisk, loadRulesFile, filterRulesByPath, formatRulesForPrompt } from 'ira-review';
import type { IraConfig, ReviewResult, ReviewComment, BitbucketConfig, GitHubConfig } from 'ira-review';
import { updateDiagnostics } from '../providers/diagnosticsProvider';
import { updateStatusBar } from '../providers/statusBarProvider';
import { IraIssuesProvider } from '../providers/treeViewProvider';
import { IraCodeLensProvider } from '../providers/codeLensProvider';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { setLastResult } from '../extension';
import { ReviewHistoryStore } from '../services/reviewHistoryStore';
import { AuthProvider } from '../services/authProvider';
import * as cp from 'child_process';

export async function reviewPR(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  statusBar: vscode.StatusBarItem,
  treeProvider: IraIssuesProvider,
  codeLensProvider: IraCodeLensProvider,
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('IRA: No workspace folder open.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'IRA: Reviewing PR...', cancellable: false },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('ira');
        const prNumber = await detectPRNumber(workspaceRoot);

        if (!prNumber) {
          vscode.window.showErrorMessage('IRA: Could not detect PR number. Please check your branch name.');
          return;
        }

        const repoInfo = await detectRepo(workspaceRoot);

        // Auth: resolve token via AuthProvider (auto-detects SCM, OAuth → SecretStorage → settings PAT)
        const scmSession = await AuthProvider.getInstance().resolveScmSession(workspaceRoot);
        if (!scmSession) {
          vscode.window.showErrorMessage('IRA: Authentication required. Run "IRA: Sign In" from the command palette.');
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
          const aiApiKey = await authInstance.getAiApiKey();
          if (!aiApiKey) {
            vscode.window.showErrorMessage('IRA: AI API key not configured. Go to Settings → IRA → AI API Key.');
            return;
          }
        }

        let result: ReviewResult;

        if (useCopilot) {
          // Copilot mode: fetch diff via SCM client, review with VS Code LM API
          result = await runCopilotReview(config, scmProvider, repoInfo, gheUrl, scmToken, prNumber, workspaceRoot);
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
            pullRequestId: prNumber,
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
        treeProvider.update(result.comments);
        codeLensProvider.update(result.comments);

        // Save to review history (all users — UI gated behind Pro)
        try {
          const historyStore = ReviewHistoryStore.getInstance();
          await historyStore.save(result);
        } catch {
          // History store not initialized — soft fail
        }

        vscode.window.showInformationMessage(
          `IRA: Found ${result.totalIssues} issues (Risk: ${result.risk?.level ?? 'N/A'})`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Review error:', message);
        vscode.window.showErrorMessage(`IRA: Review failed — ${message}`);
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

  // 5. Review each file with Copilot
  const copilot = new CopilotAIProvider();
  const comments: ReviewComment[] = [];

  let fileIndex = 0;
  for (const [filePath, diff] of diffByFile) {
    fileIndex++;
    try {
      const filteredRules = filterRulesByPath(rules, filePath);
      const rulesSection = formatRulesForPrompt(filteredRules);
      const prompt = buildStandalonePrompt(filePath, diff, framework, null, rulesSection);
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
  const branch = await execGit('git branch --show-current', cwd).catch(() => 'unknown');
  const prNumber = await vscode.window.showInputBox({
    prompt: `Enter the Pull Request number for branch "${branch}"`,
    placeHolder: 'e.g. 123 (find it in your Bitbucket/GitHub PR URL)',
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
