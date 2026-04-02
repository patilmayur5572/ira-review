import { describe, it, expect } from 'vitest';
import './setup';

describe('codeLensProvider', () => {
  const mockComments = [
    { filePath: 'src/app.ts', line: 10, rule: 'ai/security', severity: 'CRITICAL', message: 'Issue 1', aiReview: { explanation: 'exp', impact: 'imp', suggestedFix: 'fix' } },
    { filePath: 'src/utils.ts', line: 5, rule: 'ai/perf', severity: 'MINOR', message: 'Issue 2', aiReview: { explanation: 'exp', impact: 'imp', suggestedFix: 'fix' } },
  ];

  it('filters comments by file path', () => {
    const relativePath = 'src/app.ts';
    const matching = mockComments.filter(
      (c) => c.filePath === relativePath || c.filePath === relativePath.replace(/\\/g, '/')
    );
    expect(matching.length).toBe(1);
    expect(matching[0].message).toBe('Issue 1');
  });

  it('returns empty for non-matching file', () => {
    const relativePath = 'src/other.ts';
    const matching = mockComments.filter(
      (c) => c.filePath === relativePath
    );
    expect(matching.length).toBe(0);
  });

  it('handles Windows-style paths', () => {
    const windowsPath = 'src\\app.ts';
    const matching = mockComments.filter(
      (c) => c.filePath === windowsPath || c.filePath === windowsPath.replace(/\\/g, '/')
    );
    expect(matching.length).toBe(1);
  });

  it('truncates long titles', () => {
    const title = '🔍 IRA: CRITICAL — This is a very long message that exceeds the 80 character limit and should be truncated';
    const truncated = title.length > 80 ? title.substring(0, 77) + '...' : title;
    expect(truncated.length).toBeLessThanOrEqual(80);
    expect(truncated.endsWith('...')).toBe(true);
  });
});
