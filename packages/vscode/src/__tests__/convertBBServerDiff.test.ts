import { describe, it, expect } from 'vitest';
import './setup';

// Reproduce the function and types for testing
interface BitbucketServerDiffResponse {
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

function convertBBServerDiffToUnified(json: BitbucketServerDiffResponse): string {
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

describe('convertBBServerDiffToUnified', () => {
  it('converts JSON diff with added lines', () => {
    const json: BitbucketServerDiffResponse = {
      diffs: [{
        source: { toString: 'src/app.ts' },
        destination: { toString: 'src/app.ts' },
        hunks: [{
          segments: [{
            type: 'ADDED',
            lines: [{ line: 'const x = 1;', destination: 1 }],
          }],
        }],
      }],
    };
    const result = convertBBServerDiffToUnified(json);
    expect(result).toContain('diff --git a/src/app.ts b/src/app.ts');
    expect(result).toContain('+const x = 1;');
  });

  it('converts JSON diff with removed lines', () => {
    const json: BitbucketServerDiffResponse = {
      diffs: [{
        source: { toString: 'src/old.ts' },
        destination: { toString: 'src/old.ts' },
        hunks: [{
          segments: [{
            type: 'REMOVED',
            lines: [{ line: 'old code', source: 1 }],
          }],
        }],
      }],
    };
    const result = convertBBServerDiffToUnified(json);
    expect(result).toContain('-old code');
  });

  it('converts JSON diff with context lines', () => {
    const json: BitbucketServerDiffResponse = {
      diffs: [{
        source: { toString: 'src/ctx.ts' },
        destination: { toString: 'src/ctx.ts' },
        hunks: [{
          segments: [{
            type: 'CONTEXT',
            lines: [{ line: 'unchanged', source: 1, destination: 1 }],
          }],
        }],
      }],
    };
    const result = convertBBServerDiffToUnified(json);
    expect(result).toContain(' unchanged');
  });

  it('handles multiple diffs', () => {
    const json: BitbucketServerDiffResponse = {
      diffs: [
        { source: { toString: 'a.ts' }, destination: { toString: 'a.ts' }, hunks: [] },
        { source: { toString: 'b.ts' }, destination: { toString: 'b.ts' }, hunks: [] },
      ],
    };
    const result = convertBBServerDiffToUnified(json);
    expect(result).toContain('a/a.ts');
    expect(result).toContain('a/b.ts');
  });

  it('handles empty diffs array', () => {
    const result = convertBBServerDiffToUnified({ diffs: [] });
    expect(result).toBe('');
  });

  it('handles new file (no source)', () => {
    const json: BitbucketServerDiffResponse = {
      diffs: [{
        destination: { toString: 'new-file.ts' },
        hunks: [{
          segments: [{ type: 'ADDED', lines: [{ line: 'new content' }] }],
        }],
      }],
    };
    const result = convertBBServerDiffToUnified(json);
    expect(result).toContain('a//dev/null');
    expect(result).toContain('b/new-file.ts');
  });
});
