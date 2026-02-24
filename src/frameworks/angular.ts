import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "../types/review.js";

export function detectAngular(rootDir: string): Framework | null {
  if (existsSync(join(rootDir, "angular.json"))) return "angular";
  return null;
}
