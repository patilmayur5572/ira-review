import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectScmFromGit, detectAiProvider, detectGitRepo, runPreflight, formatPreflight } from "../preflight.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExecSync = vi.mocked(execSync);

describe("detectScmFromGit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 'github' when remote contains github.com", () => {
    mockExecSync.mockReturnValue("git@github.com:user/repo.git\n");
    expect(detectScmFromGit()).toBe("github");
  });

  it("returns 'bitbucket' when remote contains bitbucket.org", () => {
    mockExecSync.mockReturnValue("git@bitbucket.org:team/repo.git\n");
    expect(detectScmFromGit()).toBe("bitbucket");
  });

  it("returns null when remote is unknown", () => {
    mockExecSync.mockReturnValue("git@gitlab.com:user/repo.git\n");
    expect(detectScmFromGit()).toBeNull();
  });

  it("returns null when git command fails", () => {
    mockExecSync.mockImplementation(() => { throw new Error("not a git repo"); });
    expect(detectScmFromGit()).toBeNull();
  });
});

describe("detectAiProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.IRA_AI_API_KEY;
    delete process.env.IRA_AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("detects IRA_AI_API_KEY with default provider", () => {
    process.env.IRA_AI_API_KEY = "sk-test-key";
    const result = detectAiProvider();
    expect(result).toEqual({ provider: "openai", key: "sk-test-key" });
  });

  it("detects IRA_AI_API_KEY with custom provider", () => {
    process.env.IRA_AI_API_KEY = "sk-test-key";
    process.env.IRA_AI_PROVIDER = "anthropic";
    const result = detectAiProvider();
    expect(result).toEqual({ provider: "anthropic", key: "sk-test-key" });
  });

  it("detects OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-openai-key";
    const result = detectAiProvider();
    expect(result).toEqual({ provider: "openai", key: "sk-openai-key" });
  });

  it("detects ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-anthropic-key";
    const result = detectAiProvider();
    expect(result).toEqual({ provider: "anthropic", key: "sk-anthropic-key" });
  });

  it("returns null when no key is set", () => {
    expect(detectAiProvider()).toBeNull();
  });
});

describe("detectGitRepo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns root and remote when in a git repo", () => {
    mockExecSync
      .mockReturnValueOnce("/home/user/project\n")
      .mockReturnValueOnce("git@github.com:user/repo.git\n");

    const result = detectGitRepo();
    expect(result).toEqual({ root: "/home/user/project", remote: "git@github.com:user/repo.git" });
  });

  it("returns root with null remote when no remote exists", () => {
    mockExecSync
      .mockReturnValueOnce("/home/user/project\n")
      .mockImplementationOnce(() => { throw new Error("no remote"); });

    const result = detectGitRepo();
    expect(result).toEqual({ root: "/home/user/project", remote: null });
  });

  it("returns null when not in a git repo", () => {
    mockExecSync.mockImplementation(() => { throw new Error("not a git repo"); });
    expect(detectGitRepo()).toBeNull();
  });
});

describe("runPreflight", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.IRA_SCM_PROVIDER;
    delete process.env.IRA_AI_API_KEY;
    delete process.env.IRA_AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.IRA_GITHUB_TOKEN;
    delete process.env.IRA_BITBUCKET_TOKEN;
    delete process.env.IRA_GITHUB_REPO;
    delete process.env.IRA_REPO;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reports all checks as failed when nothing is configured", () => {
    mockExecSync.mockImplementation(() => { throw new Error("fail"); });
    const result = runPreflight();
    expect(result.passed).toBe(false);
    expect(result.checks.filter(c => !c.ok).length).toBeGreaterThanOrEqual(3);
  });

  it("reports checks as passed when everything is configured", () => {
    mockExecSync
      .mockReturnValueOnce("/project\n") // git root
      .mockReturnValueOnce("git@github.com:user/repo.git\n") // remote for detectGitRepo
      .mockReturnValueOnce("git@github.com:user/repo.git\n"); // remote for detectScmFromGit

    process.env.IRA_GITHUB_TOKEN = "ghp_test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.IRA_GITHUB_REPO = "user/repo";

    const result = runPreflight();
    expect(result.passed).toBe(true);
    expect(result.checks.every(c => c.ok)).toBe(true);
  });

  it("shows all missing items at once, not just the first", () => {
    mockExecSync.mockImplementation(() => { throw new Error("fail"); });
    const result = runPreflight();
    // Should have checks for git, SCM, SCM token, AI, and repo
    expect(result.checks.length).toBe(5);
  });
});

describe("formatPreflight", () => {
  it("formats passing results", () => {
    const output = formatPreflight({
      passed: true,
      checks: [{ label: "Git", ok: true, detail: "OK" }],
    });
    expect(output).toContain("✅ All preflight checks passed");
    expect(output).toContain("✓ Git: OK");
  });

  it("formats failing results", () => {
    const output = formatPreflight({
      passed: false,
      checks: [{ label: "AI", ok: false, detail: "Missing key" }],
    });
    expect(output).toContain("⚠️  Some preflight checks failed");
    expect(output).toContain("✗ AI: Missing key");
  });
});
