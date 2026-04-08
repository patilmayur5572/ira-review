/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Show Risk Score Command (standalone)
 */

import * as vscode from 'vscode';
import { detectFramework, buildStandalonePrompt, parseStandaloneResponse, createAIProvider, calculateRisk, loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from 'ira-review';
import type { AIProviderType } from 'ira-review';
import { CopilotAIProvider } from '../providers/copilotAIProvider';
import { AuthProvider } from '../services/authProvider';
import { getLastResult, setLastResult } from '../extension';
import { resolveAiApiKey } from '../utils/credentialPrompts';
import * as msg from '../utils/messages';
import * as cp from 'child_process';

export async function showRisk(): Promise<void> {
  // If we already have a result with risk data, show it immediately
  const existing = getLastResult();
  if (existing?.risk) {
    showRiskReport(existing.risk);
    return;
  }

  // Otherwise, run a quick review on the current file to calculate risk
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage(msg.noActiveFile());
    return;
  }

  const document = editor.document;
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const fileContent = document.getText();

  if (!fileContent.trim()) {
    vscode.window.showWarningMessage(msg.fileEmpty());
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: msg.progress.calculateRisk, cancellable: false },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('ira');
        const activeFileDir = require('path').dirname(document.uri.fsPath);
        const workspaceRoot = await execGit('git rev-parse --show-toplevel', activeFileDir).catch(() =>
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? activeFileDir,
        );

        let framework: Awaited<ReturnType<typeof detectFramework>> = null;
        if (workspaceRoot) {
          try { framework = await detectFramework(workspaceRoot); } catch { /* ignore */ }
        }

        const rules = workspaceRoot ? loadRulesFile(workspaceRoot) : [];
        const filteredRules = filterRulesByPath(rules, filePath);
        const rulesSection = formatRulesForPrompt(filteredRules);
        const sensitiveAreas = loadSensitiveAreas(workspaceRoot);
        const sensitiveMatch = matchSensitiveArea(sensitiveAreas, filePath);
        const sensitiveContext = sensitiveMatch ? formatSensitiveAreaForPrompt(sensitiveMatch) : undefined;
        const prompt = buildStandalonePrompt(filePath, fileContent, framework, null, rulesSection, sensitiveContext);

        const aiProvider = config.get<string>('aiProvider', 'copilot');
        let rawResponse: string;

        if (aiProvider === 'copilot') {
          const copilot = new CopilotAIProvider();
          rawResponse = await copilot.rawReview(prompt);
        } else {
          const aiApiKey = await resolveAiApiKey();
          if (!aiApiKey) return;
          const provider = createAIProvider({
            provider: aiProvider as AIProviderType,
            apiKey: aiApiKey,
            model: config.get<string>('aiModel', 'gpt-4o-mini'),
          });
          const result = await provider.review(prompt);
          rawResponse = result.explanation;
        }

        const issues = parseStandaloneResponse(rawResponse);
        const sonarIssues = issues.map((issue, i) => ({
          key: `AI-${i}`,
          rule: `IRA/${issue.category}`,
          severity: issue.severity as 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
          component: filePath,
          message: issue.message,
          line: issue.line,
          type: issue.category.includes('security') ? 'VULNERABILITY' as const : 'CODE_SMELL' as const,
          flows: [] as { locations: { component: string; msg: string }[] }[],
          tags: [issue.category],
        }));

        const risk = calculateRisk({
          allIssues: sonarIssues,
          filteredIssues: sonarIssues,
          complexity: null,
          filesChanged: 1,
          sensitiveFileMultiplier: sensitiveMatch ? 2 : 1,
        });

        // Store so subsequent calls are instant
        setLastResult({
          pullRequestId: 'file-review',
          framework,
          reviewMode: 'standalone' as const,
          totalIssues: issues.length,
          reviewedIssues: issues.length,
          comments: [],
          commentsPosted: 0,
          risk,
          complexity: null,
          acceptanceValidation: null,
        });

        showRiskReport(risk, sensitiveMatch?.label);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('IRA: Show Risk error:', message);
        vscode.window.showErrorMessage(msg.riskFailed(message));
      }
    },
  );
}

function showRiskReport(risk: { level: string; score: number; maxScore: number; factors: { name: string; score: number; detail: string }[]; summary: string }, sensitiveLabel?: string): void {
  const icon = risk.level === 'CRITICAL' ? '🔴' : risk.level === 'HIGH' ? '🟠' : risk.level === 'MEDIUM' ? '🟡' : '🟢';
  const topFactors = risk.factors
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(f => `${f.name}: ${f.detail}`)
    .join(' · ');

  const sensitiveTag = sensitiveLabel ? '🔒 ' + sensitiveLabel + ' · ' : '';
  const detail = topFactors ? ` — ${topFactors}` : '';
  const message = msg.riskResult(icon, risk.level, risk.score, risk.maxScore, sensitiveTag, detail);
  vscode.window.showInformationMessage(message);
}

function execGit(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}
