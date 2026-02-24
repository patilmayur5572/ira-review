import type { Framework } from "../types/review.js";
import { detectAngular } from "./angular.js";
import { detectReact } from "./react.js";
import { detectVue } from "./vue.js";
import { detectNest } from "./nest.js";
import { detectNode } from "./node.js";

type Detector = (rootDir: string) => Framework | null;

// Order matters: more specific frameworks first, generic "node" last
const detectors: Detector[] = [
  detectAngular,
  detectNest,
  detectReact,
  detectVue,
  detectNode,
];

export async function detectFramework(
  rootDir: string,
): Promise<Framework | null> {
  for (const detect of detectors) {
    const result = detect(rootDir);
    if (result) return result;
  }
  return null;
}
