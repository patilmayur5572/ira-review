/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Status Bar Provider
 */

import * as vscode from 'vscode';
import type { RiskReport } from 'ira-review';

export function createStatusBar(): vscode.StatusBarItem {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(shield) IRA';
  statusBar.command = 'ira.reviewPR';
  statusBar.tooltip = 'Click to run IRA review';
  return statusBar;
}

export function updateStatusBar(statusBar: vscode.StatusBarItem, risk: RiskReport | null): void {
  if (!risk) {
    statusBar.text = '$(shield) IRA';
    statusBar.color = undefined;
    statusBar.tooltip = 'Click to run IRA review';
    return;
  }

  switch (risk.level) {
    case 'LOW':
      statusBar.text = '$(shield) IRA: LOW';
      statusBar.color = undefined;
      break;
    case 'MEDIUM':
      statusBar.text = '$(shield) IRA: MEDIUM ⚠️';
      statusBar.color = new vscode.ThemeColor('statusBarItem.warningBackground');
      break;
    case 'HIGH':
      statusBar.text = '$(shield) IRA: HIGH 🔴';
      statusBar.color = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
    case 'CRITICAL':
      statusBar.text = '$(shield) IRA: CRITICAL 🔴';
      statusBar.color = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
  }

  statusBar.tooltip = `Risk: ${risk.level} (${risk.score}/${risk.maxScore})`;
}
