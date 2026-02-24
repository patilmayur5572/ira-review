import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfigFromEnv } from "../env.js";

describe("resolveConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setAllEnvVars() {
    process.env.IRA_SONAR_URL = "https://sonar.example.com";
    process.env.IRA_SONAR_TOKEN = "sonar-tok";
    process.env.IRA_PROJECT_KEY = "my-project";
    process.env.IRA_PR = "42";
    process.env.IRA_BITBUCKET_TOKEN = "bb-tok";
    process.env.IRA_REPO = "workspace/repo";
    process.env.OPENAI_API_KEY = "sk-test";
  }

  it("resolves config from environment variables", () => {
    setAllEnvVars();
    const config = resolveConfigFromEnv();

    expect(config.sonar.baseUrl).toBe("https://sonar.example.com");
    expect(config.sonar.token).toBe("sonar-tok");
    expect(config.sonar.projectKey).toBe("my-project");
    expect(config.pullRequestId).toBe("42");
    expect(config.scm.workspace).toBe("workspace");
    expect(config.scm.repoSlug).toBe("repo");
    expect(config.ai.apiKey).toBe("sk-test");
  });

  it("CLI overrides take precedence over env vars", () => {
    setAllEnvVars();
    const config = resolveConfigFromEnv({
      sonarUrl: "https://cli.example.com",
      pr: "99",
    });

    expect(config.sonar.baseUrl).toBe("https://cli.example.com");
    expect(config.pullRequestId).toBe("99");
    expect(config.sonar.token).toBe("sonar-tok");
  });

  it("throws when required env var is missing", () => {
    expect(() => resolveConfigFromEnv()).toThrow(
      "Missing required environment variable",
    );
  });

  it("throws when repo format is invalid (non-dry-run)", () => {
    setAllEnvVars();
    process.env.IRA_REPO = "invalid-repo-format";

    expect(() => resolveConfigFromEnv()).toThrow("workspace/repo-slug format");
  });

  it("throws when SCM config missing in non-dry-run mode", () => {
    process.env.IRA_SONAR_URL = "https://sonar.example.com";
    process.env.IRA_SONAR_TOKEN = "tok";
    process.env.IRA_PROJECT_KEY = "proj";
    process.env.IRA_PR = "1";
    process.env.OPENAI_API_KEY = "sk-test";

    expect(() => resolveConfigFromEnv()).toThrow(
      "Bitbucket token and repo are required",
    );
  });

  it("allows missing SCM config in dry-run mode", () => {
    process.env.IRA_SONAR_URL = "https://sonar.example.com";
    process.env.IRA_SONAR_TOKEN = "tok";
    process.env.IRA_PROJECT_KEY = "proj";
    process.env.IRA_PR = "1";
    process.env.OPENAI_API_KEY = "sk-test";

    const config = resolveConfigFromEnv({ dryRun: true });

    expect(config.dryRun).toBe(true);
    expect(config.sonar.baseUrl).toBe("https://sonar.example.com");
    expect(config.scm.token).toBe("");
  });
});
