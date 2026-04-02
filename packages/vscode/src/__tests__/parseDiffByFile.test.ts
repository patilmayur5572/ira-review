import { describe, it, expect } from 'vitest';
import './setup';

// Reproduce the parseDiffByFile function for testing (mirrors src/commands/reviewPR.ts)
function parseDiffByFile(diff: string): Map<string, string> {
  const fileMap = new Map<string, string>();
  const fileSections = diff.split(/^diff --git /m);
  for (const section of fileSections) {
    if (!section.trim()) continue;

    // Standard: diff --git a/file.ts b/file.ts
    // Bitbucket Server: diff --git src://file.ts dst://file.ts
    const headerMatch = section.match(/^(?:a\/|src:\/\/)(.+?)\s+(?:b\/|dst:\/\/)(.+)/);
    if (!headerMatch) continue;
    const bPath = headerMatch[2];
    if (bPath === '/dev/null') continue;
    fileMap.set(bPath, `diff --git ${section}`);
  }
  return fileMap;
}

describe('parseDiffByFile', () => {
  it('parses standard git diff format', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import express from 'express';
+import cors from 'cors';
 const app = express();
`;
    const result = parseDiffByFile(diff);
    expect(result.size).toBe(1);
    expect(result.has('src/app.ts')).toBe(true);
  });

  it('parses Bitbucket Server src:// dst:// format', () => {
    const diff = `diff --git src://src/utils.ts dst://src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,3 +10,5 @@
+export function helper() {}
`;
    const result = parseDiffByFile(diff);
    expect(result.size).toBe(1);
    expect(result.has('src/utils.ts')).toBe(true);
  });

  it('skips deleted files (/dev/null destination)', () => {
    const diff = `diff --git a/old-file.ts b//dev/null
--- a/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-deleted content
`;
    const result = parseDiffByFile(diff);
    expect(result.size).toBe(0);
  });

  it('handles multiple files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
+line
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
+line
`;
    const result = parseDiffByFile(diff);
    expect(result.size).toBe(2);
    expect(result.has('src/a.ts')).toBe(true);
    expect(result.has('src/b.ts')).toBe(true);
  });

  it('returns empty map for empty diff', () => {
    const result = parseDiffByFile('');
    expect(result.size).toBe(0);
  });

  it('returns empty map for non-diff text', () => {
    const result = parseDiffByFile('some random text\nwithout diff markers');
    expect(result.size).toBe(0);
  });
});
