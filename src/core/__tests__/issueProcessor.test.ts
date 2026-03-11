import { describe, it, expect } from "vitest";
import { filterIssues, groupIssuesByFile } from "../issueProcessor.js";
import type { SonarIssue } from "../../types/sonar.js";

function makeIssue(overrides: Partial<SonarIssue> = {}): SonarIssue {
  return {
    key: "AX-001",
    rule: "typescript:S1234",
    severity: "BLOCKER",
    component: "project:src/app.ts",
    message: "Fix this",
    type: "BUG",
    flows: [],
    tags: [],
    ...overrides,
  };
}

describe("filterIssues", () => {
  it("keeps BLOCKER and CRITICAL issues", () => {
    const issues = [
      makeIssue({ severity: "BLOCKER" }),
      makeIssue({ severity: "CRITICAL" }),
      makeIssue({ severity: "MAJOR" }),
      makeIssue({ severity: "MINOR" }),
      makeIssue({ severity: "INFO" }),
    ];

    const result = filterIssues(issues);

    expect(result).toHaveLength(2);
    expect(result[0].severity).toBe("BLOCKER");
    expect(result[1].severity).toBe("CRITICAL");
  });

  it("returns empty array when no matching severities", () => {
    const issues = [
      makeIssue({ severity: "MAJOR" }),
      makeIssue({ severity: "MINOR" }),
    ];

    expect(filterIssues(issues)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(filterIssues([])).toHaveLength(0);
  });

  it("filters by custom minSeverity=MAJOR", () => {
    const issues = [
      makeIssue({ severity: "BLOCKER" }),
      makeIssue({ severity: "CRITICAL" }),
      makeIssue({ severity: "MAJOR" }),
      makeIssue({ severity: "MINOR" }),
      makeIssue({ severity: "INFO" }),
    ];

    const result = filterIssues(issues, "MAJOR");
    expect(result).toHaveLength(3);
  });

  it("filters by custom minSeverity=BLOCKER", () => {
    const issues = [
      makeIssue({ severity: "BLOCKER" }),
      makeIssue({ severity: "CRITICAL" }),
    ];

    const result = filterIssues(issues, "BLOCKER");
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("BLOCKER");
  });

  it("includes all issues with minSeverity=INFO", () => {
    const issues = [
      makeIssue({ severity: "BLOCKER" }),
      makeIssue({ severity: "INFO" }),
    ];

    const result = filterIssues(issues, "INFO");
    expect(result).toHaveLength(2);
  });
});

describe("groupIssuesByFile", () => {
  it("groups issues by file path", () => {
    const issues = [
      makeIssue({ component: "project:src/a.ts" }),
      makeIssue({ component: "project:src/b.ts" }),
      makeIssue({ component: "project:src/a.ts", key: "AX-002" }),
    ];

    const result = groupIssuesByFile(issues);

    expect(result).toHaveLength(2);

    const fileA = result.find((g) => g.filePath === "src/a.ts");
    expect(fileA?.issues).toHaveLength(2);

    const fileB = result.find((g) => g.filePath === "src/b.ts");
    expect(fileB?.issues).toHaveLength(1);
  });

  it("strips project prefix from component key", () => {
    const issues = [makeIssue({ component: "my-project:src/index.ts" })];
    const result = groupIssuesByFile(issues);
    expect(result[0].filePath).toBe("src/index.ts");
  });

  it("handles component without colon", () => {
    const issues = [makeIssue({ component: "src/index.ts" })];
    const result = groupIssuesByFile(issues);
    expect(result[0].filePath).toBe("src/index.ts");
  });
});
