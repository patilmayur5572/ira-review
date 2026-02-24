import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "../types/review.js";

export function detectNode(rootDir: string): Framework | null {
  if (existsSync(join(rootDir, "package.json"))) return "node";
  return null;
}
