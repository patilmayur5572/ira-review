import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectFramework } from "../detector.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("detectFramework", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ira-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects React from package.json", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0" } }),
    );
    expect(await detectFramework(tempDir)).toBe("react");
  });

  it("detects Angular from angular.json", async () => {
    writeFileSync(join(tempDir, "angular.json"), "{}");
    // Also create package.json so node detector doesn't match first
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    expect(await detectFramework(tempDir)).toBe("angular");
  });

  it("detects Vue from package.json", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { vue: "^3.0.0" } }),
    );
    expect(await detectFramework(tempDir)).toBe("vue");
  });

  it("detects NestJS from package.json", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { "@nestjs/core": "^10.0.0" } }),
    );
    expect(await detectFramework(tempDir)).toBe("nestjs");
  });

  it("falls back to node when only package.json exists", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4.0.0" } }),
    );
    expect(await detectFramework(tempDir)).toBe("node");
  });

  it("returns null when no markers found", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    expect(await detectFramework(tempDir)).toBeNull();
  });
});
