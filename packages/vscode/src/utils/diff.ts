/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Shared diff utility functions used across commands.
 */

// Bitbucket Server diff JSON types
export interface BitbucketServerDiffResponse {
  diffs: Array<{
    source?: { toString: string };
    destination?: { toString: string };
    hunks?: Array<{
      segments: Array<{
        type: 'ADDED' | 'REMOVED' | 'CONTEXT';
        lines: Array<{ line: string; source?: number; destination?: number }>;
      }>;
    }>;
  }>;
}

/**
 * Convert Bitbucket Server JSON diff format to standard unified diff.
 */
export function convertBBServerDiffToUnified(json: BitbucketServerDiffResponse): string {
  const parts: string[] = [];
  for (const diff of json.diffs ?? []) {
    const src = diff.source?.toString ?? '/dev/null';
    const dst = diff.destination?.toString ?? '/dev/null';
    parts.push(`diff --git a/${src} b/${dst}`);
    parts.push(`--- a/${src}`);
    parts.push(`+++ b/${dst}`);
    for (const hunk of diff.hunks ?? []) {
      parts.push('@@ -1,0 +1,0 @@');
      for (const seg of hunk.segments) {
        const prefix = seg.type === 'ADDED' ? '+' : seg.type === 'REMOVED' ? '-' : ' ';
        for (const line of seg.lines) {
          parts.push(`${prefix}${line.line}`);
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Parse a unified diff string into a map of filePath → diffSection.
 * Handles both standard git diff and Bitbucket Server src:// dst:// formats.
 * Skips deleted files (destination = /dev/null or +++ /dev/null).
 */
export function parseDiffByFile(diff: string): Map<string, string> {
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
    if (section.includes('\n+++ /dev/null')) continue;
    fileMap.set(bPath, `diff --git ${section}`);
  }
  return fileMap;
}
