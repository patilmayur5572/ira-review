import { describe, it, expect } from "vitest";
import { formatReviewComment, buildDedupMarker } from "../commentFormatter.js";
import type { CommentFormatterInput } from "../commentFormatter.js";

const baseComment: CommentFormatterInput = {
  filePath: "src/x.ts",
  line: 10,
  rule: "team:my-rule",
  severity: "MAJOR",
  message: "Avoid `any` here.",
  aiReview: {
    explanation: "Loses type safety.",
    impact: "Refactors will silently break.",
    suggestedFix: "type Foo = { id: string };",
  },
};

describe("formatReviewComment — invariants", () => {
  it("compact format includes the dedup marker on line 1", () => {
    const out = formatReviewComment(baseComment, { style: "compact" });
    expect(out.split("\n")[0]).toBe("<!-- ira:file=src/x.ts;line=10;rule=team:my-rule -->");
  });

  it("detailed format includes the dedup marker on line 1", () => {
    const out = formatReviewComment(baseComment, { style: "detailed" });
    expect(out.split("\n")[0]).toBe("<!-- ira:file=src/x.ts;line=10;rule=team:my-rule -->");
  });

  it("default style is compact", () => {
    const out = formatReviewComment(baseComment);
    expect(out).toContain("⚠️ **MAJOR**");
    expect(out).not.toContain("🔍 **IRA Review**");
  });

  it("CommentTracker dedup regex matches the marker", () => {
    // Mirror of IRA_META_RE in src/scm/commentTracker.ts — keep in sync.
    const re = /<!-- ira:file=([^;]+);line=(\d+);rule=([^\s]+) -->/;
    const out = formatReviewComment(baseComment, { style: "compact" });
    const m = out.match(re);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("src/x.ts");
    expect(m![2]).toBe("10");
    expect(m![3]).toBe("team:my-rule");
  });
});

describe("formatReviewComment — severity-aware verbosity", () => {
  it("MINOR emits only header + sentence (no fix code, no <details>)", () => {
    const out = formatReviewComment({ ...baseComment, severity: "MINOR" }, { style: "compact" });
    expect(out).toContain("💡 **MINOR**");
    expect(out).not.toContain("```");
    expect(out).not.toContain("<details>");
  });

  it("MAJOR emits compact pattern with collapsed <details>", () => {
    const out = formatReviewComment({ ...baseComment, severity: "MAJOR" }, { style: "compact" });
    expect(out).toContain("⚠️ **MAJOR**");
    expect(out).toContain("```");
    expect(out).toContain("<details><summary>Why this matters</summary>");
    expect(out).toContain("Loses type safety.");
  });

  it("CRITICAL expands explanation/impact (not collapsed)", () => {
    const out = formatReviewComment({ ...baseComment, severity: "CRITICAL" }, { style: "compact" });
    expect(out).toContain("🚨 **CRITICAL**");
    expect(out).not.toContain("<details>");
    expect(out).toContain("**Why:** Loses type safety.");
    expect(out).toContain("**Impact:** Refactors will silently break.");
  });

  it("BLOCKER expands explanation/impact (not collapsed)", () => {
    const out = formatReviewComment({ ...baseComment, severity: "BLOCKER" }, { style: "compact" });
    expect(out).toContain("🛑 **BLOCKER**");
    expect(out).not.toContain("<details>");
    expect(out).toContain("**Why:** Loses type safety.");
  });
});

describe("formatReviewComment — detailed (legacy)", () => {
  it("emits the legacy header and sections", () => {
    const out = formatReviewComment(baseComment, { style: "detailed" });
    expect(out).toContain("🔍 **IRA Review** - `team:my-rule` (MAJOR)");
    expect(out).toContain("**Explanation:** Loses type safety.");
    expect(out).toContain("**Impact:** Refactors will silently break.");
    expect(out).toContain("**Suggested Fix:**");
    expect(out).toContain("type Foo = { id: string };");
  });
});

describe("buildDedupMarker", () => {
  it("matches the format that CommentTracker reads", () => {
    expect(buildDedupMarker("a/b.ts", 7, "rule-x")).toBe(
      "<!-- ira:file=a/b.ts;line=7;rule=rule-x -->",
    );
  });
});
