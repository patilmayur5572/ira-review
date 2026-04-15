/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Shared git utility functions used across commands.
 */

import * as cp from 'child_process';

/**
 * Execute a git command safely using execFile with shell: true.
 * shell: true is required on macOS when VS Code is launched from Finder
 * so that git is found in PATH.
 */
export function execGit(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(/\s+/);
    cp.execFile(cmd, args, { cwd, shell: true, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

export interface RepoInfo {
  owner: string;
  repo: string;
  baseUrl?: string;
}

/**
 * Parse a git remote URL into owner/repo/baseUrl.
 * Supports GitHub, GitHub Enterprise, Bitbucket Server (HTTPS + SSH), and Bitbucket Cloud.
 */
export function detectRepoFromUrl(url: string): RepoInfo {
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

  return { owner: '', repo: '' };
}

/**
 * Detect the repo owner/name from the git remote URL.
 */
export async function detectRepo(cwd: string): Promise<RepoInfo> {
  try {
    const url = await execGit('git remote get-url origin', cwd);
    return detectRepoFromUrl(url);
  } catch {
    return { owner: '', repo: '' };
  }
}

/**
 * Fetch the source branch name of a PR from the SCM API.
 * Returns the branch name string, or empty string on failure.
 */
export async function fetchPRSourceBranch(
  scmProvider: 'github' | 'bitbucket',
  repoInfo: RepoInfo,
  prNumber: string,
  scmToken: string,
  options?: { bitbucketUrl?: string; gheUrl?: string },
): Promise<string> {
  try {
    const bbUrl = options?.bitbucketUrl;
    if (scmProvider === 'bitbucket' && bbUrl) {
      // Bitbucket Server
      const url = `${bbUrl.replace(/\/+$/, '')}/rest/api/1.0/projects/${repoInfo.owner}/repos/${repoInfo.repo}/pull-requests/${prNumber}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${scmToken}`, 'Accept': 'application/json' },
      });
      if (!resp.ok) return '';
      const data = await resp.json() as any;
      return data?.fromRef?.displayId ?? '';
    } else if (scmProvider === 'bitbucket') {
      // Bitbucket Cloud
      const url = `https://api.bitbucket.org/2.0/repositories/${repoInfo.owner}/${repoInfo.repo}/pullrequests/${prNumber}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${scmToken}`, 'Accept': 'application/json' },
      });
      if (!resp.ok) return '';
      const data = await resp.json() as any;
      return data?.source?.branch?.name ?? '';
    } else {
      // GitHub / GitHub Enterprise
      const apiBase = options?.gheUrl || 'https://api.github.com';
      const url = `${apiBase}/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${scmToken}`, 'Accept': 'application/json' },
      });
      if (!resp.ok) return '';
      const data = await resp.json() as any;
      return data?.head?.ref ?? '';
    }
  } catch {
    return '';
  }
}

/**
 * Detect the default branch (silent — no user prompt).
 * Tries: origin/HEAD symbolic ref → develop → main → master → falls back to 'main'.
 */
export async function detectDefaultBranch(cwd: string): Promise<string> {
  try {
    const ref = await execGit('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    return ref.replace('refs/remotes/origin/', '');
  } catch { /* ignore */ }

  for (const branch of ['develop', 'main', 'master']) {
    try {
      await execGit(`git rev-parse --verify ${branch}`, cwd);
      return branch;
    } catch { /* ignore */ }
  }

  return 'main';
}
