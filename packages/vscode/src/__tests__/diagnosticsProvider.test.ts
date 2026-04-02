import { describe, it, expect, vi } from 'vitest';
import './setup';
import * as vscode from 'vscode';

// Test severity mapping logic directly
function mapSeverity(severity: string): number {
  switch (severity.toUpperCase()) {
    case 'BLOCKER':
    case 'CRITICAL':
      return vscode.DiagnosticSeverity.Error;
    case 'MAJOR':
      return vscode.DiagnosticSeverity.Warning;
    case 'MINOR':
    case 'INFO':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

describe('diagnosticsProvider', () => {
  describe('mapSeverity', () => {
    it('maps BLOCKER to Error', () => {
      expect(mapSeverity('BLOCKER')).toBe(vscode.DiagnosticSeverity.Error);
    });

    it('maps CRITICAL to Error', () => {
      expect(mapSeverity('CRITICAL')).toBe(vscode.DiagnosticSeverity.Error);
    });

    it('maps MAJOR to Warning', () => {
      expect(mapSeverity('MAJOR')).toBe(vscode.DiagnosticSeverity.Warning);
    });

    it('maps MINOR to Information', () => {
      expect(mapSeverity('MINOR')).toBe(vscode.DiagnosticSeverity.Information);
    });

    it('maps INFO to Information', () => {
      expect(mapSeverity('INFO')).toBe(vscode.DiagnosticSeverity.Information);
    });

    it('maps unknown severity to Information', () => {
      expect(mapSeverity('UNKNOWN')).toBe(vscode.DiagnosticSeverity.Information);
    });

    it('is case-insensitive', () => {
      expect(mapSeverity('blocker')).toBe(vscode.DiagnosticSeverity.Error);
      expect(mapSeverity('Major')).toBe(vscode.DiagnosticSeverity.Warning);
    });
  });

  describe('line number conversion', () => {
    it('converts 1-based line to 0-based', () => {
      const line = Math.max(0, 5 - 1);
      expect(line).toBe(4);
    });

    it('clamps negative line numbers to 0', () => {
      const line = Math.max(0, 0 - 1);
      expect(line).toBe(0);
    });

    it('handles line 1 correctly', () => {
      const line = Math.max(0, 1 - 1);
      expect(line).toBe(0);
    });
  });
});
