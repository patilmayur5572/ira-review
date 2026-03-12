import { describe, it, expect, vi, afterEach } from "vitest";
import { loadConfigFile } from "../configFile.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

describe("loadConfigFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty object when no config file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = loadConfigFile("/fake/dir");

    expect(result).toEqual({});
  });

  it("loads and maps .irarc.json", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith(".irarc.json"),
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        sonarUrl: "https://sonar.example.com",
        sonarToken: "tok",
        projectKey: "proj",
        pr: "42",
        scmProvider: "github",
        githubToken: "gh-tok",
        githubRepo: "owner/repo",
        dryRun: true,
      }),
    );

    const result = loadConfigFile("/fake/dir");

    expect(result.sonarUrl).toBe("https://sonar.example.com");
    expect(result.scmProvider).toBe("github");
    expect(result.githubToken).toBe("gh-tok");
    expect(result.githubRepo).toBe("owner/repo");
    expect(result.dryRun).toBe(true);
  });

  it("prefers .irarc.json over ira.config.json", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ pr: "from-irarc" }),
    );

    const result = loadConfigFile("/fake/dir");

    expect(result.pr).toBe("from-irarc");
    // Should read .irarc.json (first match)
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.resolve("/fake/dir", ".irarc.json"),
      "utf-8",
    );
  });

  it("falls back to ira.config.json", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith("ira.config.json"),
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ pr: "from-config" }),
    );

    const result = loadConfigFile("/fake/dir");

    expect(result.pr).toBe("from-config");
  });

  it("throws on malformed JSON", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("{ not valid json");

    expect(() => loadConfigFile("/fake/dir")).toThrow("Failed to parse config file");
  });

  it("ignores unknown fields", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        unknownField: "should be ignored",
        anotherRandom: 123,
        pr: "42",
      }),
    );

    const result = loadConfigFile("/fake/dir");

    expect(result.pr).toBe("42");
    expect(Object.keys(result)).toEqual(["pr"]);
  });

  it("ignores fields with wrong types", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        sonarUrl: 12345,
        dryRun: "yes",
        pr: "42",
      }),
    );

    const result = loadConfigFile("/fake/dir");

    expect(result.sonarUrl).toBeUndefined();
    expect(result.dryRun).toBeUndefined();
    expect(result.pr).toBe("42");
  });
});
