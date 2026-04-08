import { describe, it, expect, vi } from "vitest";
import { execSync } from "node:child_process";
import { resolveGitRoot } from "../gitRoot.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe("resolveGitRoot", () => {
  it("returns trimmed git root path on success", () => {
    mockedExecSync.mockReturnValue("/Users/dev/project\n");
    const result = resolveGitRoot();
    expect(result).toBe("/Users/dev/project");
    expect(mockedExecSync).toHaveBeenCalledWith("git rev-parse --show-toplevel", { encoding: "utf-8" });
  });

  it("falls back to process.cwd() on failure", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });
    const result = resolveGitRoot();
    expect(result).toBe(process.cwd());
  });
});
