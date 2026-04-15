/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Centralized user-facing messages — warm, empowering tone.
 * Developer should feel progressive, valued, and smart.
 */

import * as cp from 'child_process';

let cachedName: string | undefined;

/** Get the developer's first name from git config, cached for the session. */
export async function getDevName(): Promise<string> {
  if (cachedName !== undefined) return cachedName;
  try {
    const fullName = await new Promise<string>((resolve, reject) => {
      cp.exec('git config user.name', (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    // Extract first name: "Mayur Patil" → "Mayur", "patilmayur5572" → "patilmayur5572"
    cachedName = fullName.split(/[\s._-]/)[0] || '';
  } catch {
    cachedName = '';
  }
  return cachedName;
}

/** Personalized prefix — capitalizes the next word when no name is available. */
function greet(name: string, nextWord: string): string {
  return name ? `${name}, ${nextWord}` : nextWord.charAt(0).toUpperCase() + nextWord.slice(1);
}

// ─── Success / Info ─────────────────────────────────────────

export async function reviewFileSuccess(issueCount: number, filePath: string, rulesCount: number, sensitiveTag: string): Promise<string> {
  const name = await getDevName();
  const rulesNote = rulesCount > 0 ? ` (${rulesCount} team rules active)` : '';
  if (issueCount === 0) {
    return `${sensitiveTag}Clean code — nothing to flag in ${filePath} ✨${rulesNote}`;
  }
  return `${sensitiveTag}${greet(name, 'caught')} ${issueCount} issue${issueCount !== 1 ? 's' : ''} early in ${filePath} 👀${rulesNote}`;
}

export async function reviewPRSuccess(issueCount: number, riskLevel: string | undefined): Promise<string> {
  const name = await getDevName();
  const risk = riskLevel ?? 'N/A';
  if (issueCount === 0) {
    return `${greet(name, 'PR')} looks clean — no issues found ✨ (Risk: ${risk})`;
  }
  return `${greet(name, 'PR')} scanned — caught ${issueCount} issue${issueCount !== 1 ? 's' : ''} before review 🛡️ (Risk: ${risk})`;
}

export function riskResult(icon: string, level: string, score: number, maxScore: number, sensitiveTag: string, detail: string): string {
  const action = level === 'CRITICAL' ? 'needs immediate attention'
    : level === 'HIGH' ? 'worth a second look'
    : level === 'MEDIUM' ? 'a few things to check'
    : 'looking good, safe to ship';
  return `${icon} ${sensitiveTag}${level} risk — ${action} (${score}/${maxScore})${detail}`;
}

export function testGenSuccess(count: number, jiraKey: string): string {
  return `Generated ${count} test case${count !== 1 ? 's' : ''} for ${jiraKey} — ready to plug in 🧪`;
}

export function testGenEmpty(jiraKey: string, parseWarning?: string): string {
  if (parseWarning) {
    return `Couldn't extract test cases for ${jiraKey} — the AI response was in an unexpected format. Try again?`;
  }
  return `No test gaps found for ${jiraKey} — AC coverage looks solid 👍`;
}

export function rulesCreated(): string {
  return 'Team rules file ready — customize and commit to share with your team 🤝';
}

export function rulesAlreadyExist(): string {
  return 'Rules file already exists — opening it for you';
}

export function fixApplied(canUndo: boolean): string {
  return canUndo ? 'Fix applied — Ctrl+Z to undo if needed ✅' : 'Fix applied ✅';
}

export function signedIn(label: string): string {
  return `Signed in as ${label} 👋`;
}

export function signedOut(): string {
  return 'Signed out — see you next time';
}

export function tokenSaved(provider: string): string {
  return `${provider} token saved securely 🔐`;
}

export function proActivated(): string {
  return '🎉 Pro activated — all features unlocked!';
}

export function proDeactivated(): string {
  return 'Pro license deactivated';
}

export async function acValidationSuccess(jiraKey: string, passCount: number, failCount: number): Promise<string> {
  const name = await getDevName();
  if (failCount === 0) {
    return `${greet(name, 'all')} acceptance criteria passed for ${jiraKey} ✅`;
  }
  return `${jiraKey}: ${passCount} AC passed, ${failCount} need attention 📋`;
}

export function acAlreadyExists(jiraKey: string): string {
  return `${jiraKey} already has acceptance criteria — no need to generate new ones`;
}

export function acAlreadyPosted(jiraKey: string): string {
  return `IRA already posted AC suggestions on ${jiraKey} — check the comments`;
}

export function acSuggestSuccess(count: number, jiraKey: string): string {
  return `Posted ${count} acceptance criteria to ${jiraKey} as a JIRA comment ✅`;
}

export function acInsufficientChanges(): string {
  return 'Not enough code changes to generate meaningful acceptance criteria — keep coding!';
}

// ─── Warnings ───────────────────────────────────────────────

export function fileEmpty(): string {
  return 'Nothing to review — this file is empty';
}

export function noAC(jiraKey: string): string {
  return `No acceptance criteria found on ${jiraKey} — check the ticket or configure the AC custom field`;
}

export function noChanges(): string {
  return 'No code changes found to validate against — commit some changes first';
}

export function noDiff(): string {
  return 'No diff found — make sure you have changes relative to the default branch';
}

// ─── Errors ─────────────────────────────────────────────────

export function noWorkspace(): string {
  return 'No workspace folder open — open a project first';
}

export function noActiveFile(): string {
  return 'No file open — open a file to review';
}

export function reviewFailed(error: string): string {
  return `Review didn't complete — ${error}`;
}

export function testGenFailed(error: string): string {
  return `Test generation didn't complete — ${error}`;
}

export function riskFailed(error: string): string {
  return `Risk calculation didn't complete — ${error}`;
}

export function acValidationFailed(error: string): string {
  return `AC validation didn't complete — ${error}`;
}

export function prDescFailed(error: string): string {
  return `PR description didn't complete — ${error}`;
}

export function fixFailed(error: string): string {
  return `Fix generation didn't complete — ${error}`;
}

export function authRequired(): string {
  return 'Sign in first — run "IRA: Sign In" from the command palette';
}

export function authCancelled(provider: string): string {
  return `${provider} sign-in was cancelled — try again when ready`;
}

export function noPRNumber(): string {
  return 'Couldn\'t detect a PR number — enter it manually';
}

export function couldNotOpenFile(filePath: string): string {
  return `Couldn't open ${filePath} — check the file path`;
}

// ─── Progress Titles ────────────────────────────────────────

export const progress = {
  reviewFile: 'Reviewing file…',
  reviewPR: 'Scanning PR for issues…',
  generateTests: (framework: string) => `Generating ${framework} test cases…`,
  calculateRisk: 'Calculating risk score…',
  validateAC: (key: string) => `Checking ${key} acceptance criteria…`,
  generatePRDesc: 'Crafting PR description…',
  suggestAC: (key: string) => `Generating acceptance criteria for ${key}…`,
  autoReview: '$(sync~spin) Auto-reviewing…',
  generatingFix: '$(sync~spin) Generating fix…',
  pullingModel: (model: string) => `Pulling ${model}… this may take a few minutes`,
};

// ─── Prompts ────────────────────────────────────────────────

export const prompts = {
  jiraTicket: 'Which JIRA ticket? (e.g. PROJ-123)',
  jiraTicketPlaceholder: 'PROJ-123',
  testFramework: 'Which test framework does this project use?',
  prNumber: (branch: string) => `What's the PR number for "${branch}"?`,
  prNumberPlaceholder: 'e.g. 123 (from your PR URL)',
  pickProject: 'Which project should get the rules file?',
  prDescMode: 'How would you like to generate the PR description?',
  signInTo: 'Sign in with…',
};
