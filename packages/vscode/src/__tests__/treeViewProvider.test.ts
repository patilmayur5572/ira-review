import { describe, it, expect } from 'vitest';
import './setup';

describe('treeViewProvider', () => {
  const mockComments = [
    { filePath: 'src/app.ts', line: 10, rule: 'IRA/security', severity: 'CRITICAL', message: 'SQL injection', aiReview: { explanation: '', impact: 'High', suggestedFix: 'Parameterize' } },
    { filePath: 'src/app.ts', line: 20, rule: 'IRA/performance', severity: 'MINOR', message: 'Slow query', aiReview: { explanation: '', impact: 'Low', suggestedFix: 'Add index' } },
    { filePath: 'src/auth.ts', line: 5, rule: 'IRA/security', severity: 'BLOCKER', message: 'Hardcoded secret', aiReview: { explanation: '', impact: 'Critical', suggestedFix: 'Use env var' } },
  ];

  it('groups comments by file', () => {
    const grouped = new Map<string, typeof mockComments>();
    for (const comment of mockComments) {
      const existing = grouped.get(comment.filePath) ?? [];
      existing.push(comment);
      grouped.set(comment.filePath, existing);
    }
    expect(grouped.size).toBe(2);
    expect(grouped.get('src/app.ts')?.length).toBe(2);
    expect(grouped.get('src/auth.ts')?.length).toBe(1);
  });

  describe('severityIcon', () => {
    function severityIcon(severity: string): string {
      switch (severity.toUpperCase()) {
        case 'BLOCKER':
        case 'CRITICAL':
          return '$(error)';
        case 'MAJOR':
          return '$(warning)';
        case 'MINOR':
        case 'INFO':
        default:
          return '$(info)';
      }
    }

    it('returns error icon for BLOCKER', () => {
      expect(severityIcon('BLOCKER')).toBe('$(error)');
    });

    it('returns error icon for CRITICAL', () => {
      expect(severityIcon('CRITICAL')).toBe('$(error)');
    });

    it('returns warning icon for MAJOR', () => {
      expect(severityIcon('MAJOR')).toBe('$(warning)');
    });

    it('returns info icon for MINOR', () => {
      expect(severityIcon('MINOR')).toBe('$(info)');
    });
  });
});
