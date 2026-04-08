import { describe, it, expect, vi, afterEach } from "vitest";
import { loadRulesFile, filterRulesByPath, formatRulesForPrompt, loadSensitiveAreas, matchSensitiveArea, formatSensitiveAreaForPrompt } from "../rulesFile.js";
import type { IraRule } from "../rulesFile.js";
import * as fs from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

describe("loadRulesFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when no .ira-rules.json exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = loadRulesFile("/fake/dir");
    expect(result).toEqual([]);
  });

  it("loads and parses valid rules file with all fields", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        rules: [
          {
            id: "sql-1",
            message: "Use parameterized queries",
            bad: "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
            good: "db.query('SELECT * FROM users WHERE id = $1', [userId])",
            severity: "CRITICAL",
            paths: ["src/db/**"],
            author: "alice",
            createdAt: "2024-01-15",
          },
        ],
      }),
    );

    const result = loadRulesFile("/fake/dir");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sql-1");
    expect(result[0].message).toBe("Use parameterized queries");
    expect(result[0].bad).toContain("SELECT");
    expect(result[0].good).toContain("$1");
    expect(result[0].severity).toBe("CRITICAL");
    expect(result[0].paths).toEqual(["src/db/**"]);
    expect(result[0].author).toBe("alice");
    expect(result[0].createdAt).toBe("2024-01-15");
  });

  it("loads rules with only required fields", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        rules: [{ message: "No console.log", severity: "MINOR" }],
      }),
    );

    const result = loadRulesFile("/fake/dir");
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("No console.log");
    expect(result[0].severity).toBe("MINOR");
    expect(result[0].bad).toBeUndefined();
    expect(result[0].good).toBeUndefined();
  });

  it("skips rules missing message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        rules: [{ severity: "MAJOR" }],
      }),
    );

    const result = loadRulesFile("/fake/dir");
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("missing 'message' or 'severity'"),
    );
  });

  it("skips rules missing severity", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        rules: [{ message: "Do something" }],
      }),
    );

    const result = loadRulesFile("/fake/dir");
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("missing 'message' or 'severity'"),
    );
  });

  it("skips rules with invalid severity value", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        rules: [{ message: "Do something", severity: "HIGH" }],
      }),
    );

    const result = loadRulesFile("/fake/dir");
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid severity 'HIGH'"),
    );
  });

  it("caps at 30 rules with ESLint suggestion in warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rules = Array.from({ length: 35 }, (_, i) => ({
      message: `Rule ${i + 1}`,
      severity: "MINOR",
    }));
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ rules }));

    const result = loadRulesFile("/fake/dir");
    expect(result).toHaveLength(30);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("more than 30 rules"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Move deterministic rules to ESLint"),
    );
  });

  it("handles malformed JSON gracefully", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("{ not valid json");

    const result = loadRulesFile("/fake/dir");
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("syntax errors"),
    );
  });
});

describe("filterRulesByPath", () => {
  const ruleAll: IraRule = { message: "Global rule", severity: "MAJOR" };
  const ruleApi: IraRule = { message: "API rule", severity: "MAJOR", paths: ["src/api/**"] };
  const ruleTests: IraRule = { message: "Test rule", severity: "MINOR", paths: ["**/*.test.ts"] };

  it("returns all rules when no paths specified", () => {
    const result = filterRulesByPath([ruleAll], "anything/file.ts");
    expect(result).toHaveLength(1);
  });

  it("includes rules matching path pattern", () => {
    const result = filterRulesByPath([ruleApi], "src/api/users.ts");
    expect(result).toHaveLength(1);
  });

  it("excludes rules not matching path pattern", () => {
    const result = filterRulesByPath([ruleApi], "src/utils/helper.ts");
    expect(result).toHaveLength(0);
  });

  it("handles mixed rules (some with paths, some without)", () => {
    const result = filterRulesByPath([ruleAll, ruleApi, ruleTests], "src/api/users.ts");
    expect(result).toHaveLength(2); // ruleAll (no paths) + ruleApi (matches)
  });

  it("matches **/*.ext patterns", () => {
    const result = filterRulesByPath([ruleTests], "src/components/Button.test.ts");
    expect(result).toHaveLength(1);
  });
});

describe("formatRulesForPrompt", () => {
  it("returns empty string for no rules", () => {
    expect(formatRulesForPrompt([])).toBe("");
  });

  it("formats rules with bad/good examples", () => {
    const rules: IraRule[] = [
      {
        message: "Use parameterized queries",
        severity: "CRITICAL",
        bad: "db.query(sql)",
        good: "db.query(sql, params)",
      },
    ];
    const result = formatRulesForPrompt(rules);
    expect(result).toContain("## Team Rules");
    expect(result).toContain("Rule 1: Use parameterized queries");
    expect(result).toContain("Severity: CRITICAL");
    expect(result).toContain("BAD:");
    expect(result).toContain("db.query(sql)");
    expect(result).toContain("GOOD:");
    expect(result).toContain("db.query(sql, params)");
  });

  it("formats rules without bad/good examples", () => {
    const rules: IraRule[] = [
      { message: "Validate inputs", severity: "MAJOR" },
    ];
    const result = formatRulesForPrompt(rules);
    expect(result).toContain("Rule 1: Validate inputs");
    expect(result).toContain("Severity: MAJOR");
    expect(result).not.toContain("BAD:");
    expect(result).not.toContain("GOOD:");
  });
});

describe("loadSensitiveAreas", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns empty array when no file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadSensitiveAreas("/fake")).toEqual([]);
  });

  it("returns empty array when no sensitiveAreas key", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ rules: [] }));
    expect(loadSensitiveAreas("/fake")).toEqual([]);
  });

  it("loads string paths and derives labels", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      rules: [],
      sensitiveAreas: ["src/services/payment/**", "**/auth/**"],
    }));
    const result = loadSensitiveAreas("/fake");
    expect(result).toHaveLength(2);
    expect(result[0].glob).toBe("src/services/payment/**");
    expect(result[0].label).toBe("payment");
    expect(result[1].glob).toBe("**/auth/**");
    expect(result[1].label).toBe("auth");
  });

  it("skips non-string entries", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      rules: [],
      sensitiveAreas: ["src/payment/**", 123, null, { glob: "test" }],
    }));
    const result = loadSensitiveAreas("/fake");
    expect(result).toHaveLength(1);
  });

  it("deduplicates entries", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      rules: [],
      sensitiveAreas: ["src/auth/**", "src/auth/**", "src/payment/**"],
    }));
    const result = loadSensitiveAreas("/fake");
    expect(result).toHaveLength(2);
  });
});

describe("matchSensitiveArea", () => {
  const areas = [
    { glob: "src/services/payment/**", label: "payment" },
    { glob: "**/auth/**", label: "auth" },
  ];

  it("matches prefix/** pattern", () => {
    const match = matchSensitiveArea(areas, "src/services/payment/charge.ts");
    expect(match).not.toBeNull();
    expect(match!.label).toBe("payment");
  });

  it("matches **/file pattern", () => {
    const areasWithSuffix = [
      { glob: "src/services/payment/**", label: "payment" },
      { glob: "**/jwt.ts", label: "jwt" },
    ];
    const match = matchSensitiveArea(areasWithSuffix, "src/middleware/auth/jwt.ts");
    expect(match).not.toBeNull();
    expect(match!.label).toBe("jwt");
  });

  it("returns null for non-matching paths", () => {
    expect(matchSensitiveArea(areas, "src/utils/helpers.ts")).toBeNull();
  });

  it("returns first match when multiple match", () => {
    const match = matchSensitiveArea(areas, "src/services/payment/auth/handler.ts");
    expect(match!.label).toBe("payment");
  });
});

describe("formatSensitiveAreaForPrompt", () => {
  it("formats with label and glob", () => {
    const result = formatSensitiveAreaForPrompt({ glob: "src/payment/**", label: "payment" });
    expect(result).toContain("Sensitive Area");
    expect(result).toContain("payment");
    expect(result).toContain("extra scrutiny");
  });
});
