import { describe, it, expect } from "vitest";
import { annotateDiffWithLineNumbers } from "../promptBuilder.js";

describe("annotateDiffWithLineNumbers", () => {
  it("annotates a basic hunk with line numbers", () => {
    const diff = [
      "@@ -10,3 +20,3 @@",
      " context line",
      "+added line",
      " another context",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -10,3 +20,3 @@",
        "L20:  context line",
        "L21: +added line",
        "L22:  another context",
      ].join("\n"),
    );
  });

  it("handles multiple hunks resetting line numbers", () => {
    const diff = [
      "@@ -1,2 +1,2 @@",
      " first",
      "+second",
      "@@ -50,2 +100,2 @@",
      " hundred",
      "+hundred-one",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -1,2 +1,2 @@",
        "L1:  first",
        "L2: +second",
        "@@ -50,2 +100,2 @@",
        "L100:  hundred",
        "L101: +hundred-one",
      ].join("\n"),
    );
  });

  it("marks removed lines without incrementing counter", () => {
    const diff = [
      "@@ -5,3 +5,2 @@",
      " keep",
      "-removed",
      " after",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -5,3 +5,2 @@",
        "L5:  keep",
        "(removed): -removed",
        "L6:  after",
      ].join("\n"),
    );
  });

  it("annotates context lines with line numbers", () => {
    const diff = [
      "@@ -1,3 +1,3 @@",
      " line one",
      " line two",
      " line three",
    ].join("\n");

    const result = annotateDiffWithLineNumbers(diff);
    expect(result).toBe(
      [
        "@@ -1,3 +1,3 @@",
        "L1:  line one",
        "L2:  line two",
        "L3:  line three",
      ].join("\n"),
    );
  });

  it("returns empty string for empty diff", () => {
    expect(annotateDiffWithLineNumbers("")).toBe("");
  });
});
