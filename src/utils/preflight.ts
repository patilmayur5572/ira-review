import { execSync } from "node:child_process";

export interface PreflightCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  passed: boolean;
}

/**
 * Detect SCM provider by parsing .git/config remote URL.
 * Returns "github", "bitbucket", or null if undetectable.
 */
export function detectScmFromGit(): "github" | "bitbucket" | null {
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (/github\.com/i.test(remoteUrl)) return "github";
    if (/bitbucket\.org/i.test(remoteUrl)) return "bitbucket";
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect AI provider from available environment variables.
 * Returns the provider name or null if no key is found.
 */
export function detectAiProvider(): { provider: string; key: string } | null {
  if (process.env.IRA_AI_API_KEY) {
    const provider = process.env.IRA_AI_PROVIDER ?? "openai";
    return { provider, key: process.env.IRA_AI_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", key: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY };
  }
  return null;
}

/**
 * Detect whether the current directory is inside a git repository.
 */
export function detectGitRepo(): { root: string; remote: string | null } | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    let remote: string | null = null;
    try {
      remote = execSync("git config --get remote.origin.url", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      // No remote configured
    }

    return { root, remote };
  } catch {
    return null;
  }
}

/**
 * Run all preflight checks and return a summary.
 * Does NOT throw — returns a list of issues with ✓/✗ status.
 */
export function runPreflight(): PreflightResult {
  const checks: PreflightCheck[] = [];

  // 1. Git repo detection
  const git = detectGitRepo();
  checks.push({
    label: "Git repository",
    ok: git !== null,
    detail: git ? `Root: ${git.root}` : "Not inside a git repository",
  });

  // 2. SCM provider detection
  const scmEnv = process.env.IRA_SCM_PROVIDER;
  const scmFromGit = detectScmFromGit();
  const scm = scmEnv ?? scmFromGit;
  checks.push({
    label: "SCM provider",
    ok: scm !== null,
    detail: scm
      ? `${scm}${scmEnv ? " (from env)" : " (auto-detected from git remote)"}`
      : "Could not detect. Set IRA_SCM_PROVIDER or add a git remote.",
  });

  // 3. SCM token
  const hasScmToken =
    scm === "github"
      ? !!process.env.IRA_GITHUB_TOKEN
      : !!process.env.IRA_BITBUCKET_TOKEN;
  const scmTokenEnv = scm === "github" ? "IRA_GITHUB_TOKEN" : "IRA_BITBUCKET_TOKEN";
  checks.push({
    label: "SCM token",
    ok: hasScmToken,
    detail: hasScmToken
      ? `${scmTokenEnv} is set`
      : `Missing ${scmTokenEnv}. Required to post review comments.`,
  });

  // 4. AI provider detection
  const aiDetected = detectAiProvider();
  checks.push({
    label: "AI provider",
    ok: aiDetected !== null,
    detail: aiDetected
      ? `${aiDetected.provider} (key: ${aiDetected.key.slice(0, 4)}…)`
      : "No AI key found. Set IRA_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
  });

  // 5. Repository slug
  const repoSlug = scm === "github"
    ? process.env.IRA_GITHUB_REPO
    : process.env.IRA_REPO;
  const repoEnv = scm === "github" ? "IRA_GITHUB_REPO" : "IRA_REPO";
  checks.push({
    label: "Repository",
    ok: !!repoSlug,
    detail: repoSlug
      ? repoSlug
      : `Missing ${repoEnv}. Required to identify the target repository.`,
  });

  return {
    checks,
    passed: checks.every((c) => c.ok),
  };
}

/**
 * Format preflight results for console output.
 */
export function formatPreflight(result: PreflightResult): string {
  const lines = result.checks.map((c) => {
    const icon = c.ok ? "✓" : "✗";
    return `  ${icon} ${c.label}: ${c.detail}`;
  });

  const header = result.passed
    ? "✅ All preflight checks passed"
    : "⚠️  Some preflight checks failed";

  return `${header}\n${lines.join("\n")}`;
}
