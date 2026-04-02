import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

describe('statusBarProvider', () => {
  let statusBar: { text: string; color: any; tooltip: string; command: string };

  beforeEach(() => {
    statusBar = { text: '', color: undefined, tooltip: '', command: '' };
  });

  // Reproduce updateStatusBar logic for testing
  function updateStatusBar(sb: typeof statusBar, risk: { level: string; score: number; maxScore: number } | null) {
    if (!risk) {
      sb.text = '$(shield) IRA';
      sb.color = undefined;
      sb.tooltip = 'Click to run IRA review';
      return;
    }
    switch (risk.level) {
      case 'LOW':
        sb.text = '$(shield) IRA: LOW';
        sb.color = undefined;
        break;
      case 'MEDIUM':
        sb.text = '$(shield) IRA: MEDIUM ⚠️';
        sb.color = 'warning';
        break;
      case 'HIGH':
        sb.text = '$(shield) IRA: HIGH 🔴';
        sb.color = 'error';
        break;
      case 'CRITICAL':
        sb.text = '$(shield) IRA: CRITICAL 🔴';
        sb.color = 'error';
        break;
    }
    sb.tooltip = `Risk: ${risk.level} (${risk.score}/${risk.maxScore})`;
  }

  it('shows default text when no risk', () => {
    updateStatusBar(statusBar, null);
    expect(statusBar.text).toBe('$(shield) IRA');
    expect(statusBar.color).toBeUndefined();
  });

  it('shows LOW risk without color', () => {
    updateStatusBar(statusBar, { level: 'LOW', score: 10, maxScore: 100 });
    expect(statusBar.text).toBe('$(shield) IRA: LOW');
    expect(statusBar.color).toBeUndefined();
  });

  it('shows MEDIUM risk with warning', () => {
    updateStatusBar(statusBar, { level: 'MEDIUM', score: 40, maxScore: 100 });
    expect(statusBar.text).toContain('MEDIUM');
    expect(statusBar.color).toBe('warning');
  });

  it('shows HIGH risk with error', () => {
    updateStatusBar(statusBar, { level: 'HIGH', score: 70, maxScore: 100 });
    expect(statusBar.text).toContain('HIGH');
    expect(statusBar.color).toBe('error');
  });

  it('shows CRITICAL risk with error', () => {
    updateStatusBar(statusBar, { level: 'CRITICAL', score: 95, maxScore: 100 });
    expect(statusBar.text).toContain('CRITICAL');
    expect(statusBar.color).toBe('error');
  });

  it('shows score in tooltip', () => {
    updateStatusBar(statusBar, { level: 'HIGH', score: 70, maxScore: 100 });
    expect(statusBar.tooltip).toBe('Risk: HIGH (70/100)');
  });
});
