import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "../types/review.js";

export function detectReact(rootDir: string): Framework | null {
  const packageJsonPath = join(rootDir, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  const content = readFileSync(packageJsonPath, "utf-8");
  const pkg = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ("react" in deps) return "react";

  return null;
}
