import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the package version from the bundled package.json at runtime.
 *
 * Both the CLI's `--version` flag (src/cli.ts) and the v3.1.6 PR-summary
 * footer need to surface the installed package version. Hard-coding the
 * literal in either place caused the v3.1.2 Jenkins false positive (CLI
 * reported 3.1.0 while npm had installed 3.1.2). Reading from package.json
 * keeps every surface in lockstep.
 *
 * Returns "unknown" on any failure — never throws — because surfaces that
 * call this (e.g. summary footer) are decorative and must not crash a
 * review run.
 */
export function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Bundled CLI lives at <pkg>/dist/<file>.js; package.json is one level up.
    // When running from source via tsx, src/utils/<file>.ts is two levels under <pkg>.
    const candidates = [
      resolve(here, "..", "package.json"),       // dist/utils/* → ../package.json
      resolve(here, "..", "..", "package.json"), // src/utils/*  → ../../package.json
    ];
    for (const pkgPath of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string; name?: string };
        if (pkg.name === "ira-review" && pkg.version) return pkg.version;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through to unknown
  }
  return "unknown";
}
