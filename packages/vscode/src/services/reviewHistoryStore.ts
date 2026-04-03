/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Review History Store — stores all review results locally (all users)
 * UI access gated behind Pro license
 */

import * as vscode from 'vscode';
import type { ReviewResult } from 'ira-review';

export interface HistoryEntry {
  id: string;
  timestamp: number;
  pullRequestId: string;
  reviewMode: string;
  totalIssues: number;
  riskLevel: string | null;
  riskScore: number | null;
  framework: string | null;
  issuesBySeverity: Record<string, number>;
  comments: ReviewResult['comments'];
}

const HISTORY_KEY = 'ira-review-history';
const MAX_ENTRIES = 200;

export class ReviewHistoryStore {
  private static instance: ReviewHistoryStore;
  private context: vscode.ExtensionContext;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static init(context: vscode.ExtensionContext): ReviewHistoryStore {
    if (!ReviewHistoryStore.instance) {
      ReviewHistoryStore.instance = new ReviewHistoryStore(context);
    }
    return ReviewHistoryStore.instance;
  }

  static getInstance(): ReviewHistoryStore {
    if (!ReviewHistoryStore.instance) {
      throw new Error('ReviewHistoryStore not initialized.');
    }
    return ReviewHistoryStore.instance;
  }

  async save(result: ReviewResult): Promise<void> {
    const entries = this.getAll();

    const issuesBySeverity: Record<string, number> = {};
    for (const c of result.comments) {
      issuesBySeverity[c.severity] = (issuesBySeverity[c.severity] ?? 0) + 1;
    }

    const entry: HistoryEntry = {
      id: `${Date.now()}-${result.pullRequestId}`,
      timestamp: Date.now(),
      pullRequestId: result.pullRequestId,
      reviewMode: result.reviewMode,
      totalIssues: result.totalIssues,
      riskLevel: result.risk?.level ?? null,
      riskScore: result.risk?.score ?? null,
      framework: result.framework,
      issuesBySeverity,
      comments: result.comments,
    };

    entries.unshift(entry);

    if (entries.length > MAX_ENTRIES) {
      entries.length = MAX_ENTRIES;
    }

    await this.context.globalState.update(HISTORY_KEY, entries);
    this._onDidChange.fire();
  }

  getAll(): HistoryEntry[] {
    return this.context.globalState.get<HistoryEntry[]>(HISTORY_KEY) ?? [];
  }

  getRecent(count: number): HistoryEntry[] {
    return this.getAll().slice(0, count);
  }

  search(query: string): HistoryEntry[] {
    const q = query.toLowerCase();
    return this.getAll().filter((e) =>
      e.pullRequestId.toLowerCase().includes(q) ||
      e.riskLevel?.toLowerCase().includes(q) ||
      e.comments.some((c) =>
        c.message.toLowerCase().includes(q) ||
        c.rule.toLowerCase().includes(q) ||
        c.filePath.toLowerCase().includes(q)
      )
    );
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(HISTORY_KEY, []);
    this._onDidChange.fire();
  }

  getTrends(): TrendData {
    const entries = this.getAll();
    if (entries.length === 0) {
      return { issuesOverTime: [], riskOverTime: [], topRules: [], severityBreakdown: {} };
    }

    const issuesOverTime = entries.map((e) => ({
      date: new Date(e.timestamp).toISOString().split('T')[0],
      count: e.totalIssues,
      pr: e.pullRequestId,
    })).reverse();

    const riskOverTime = entries
      .filter((e) => e.riskScore !== null)
      .map((e) => ({
        date: new Date(e.timestamp).toISOString().split('T')[0],
        score: e.riskScore!,
        level: e.riskLevel!,
        pr: e.pullRequestId,
      })).reverse();

    const ruleCounts = new Map<string, number>();
    const severityBreakdown: Record<string, number> = {};
    for (const entry of entries) {
      for (const c of entry.comments) {
        ruleCounts.set(c.rule, (ruleCounts.get(c.rule) ?? 0) + 1);
        severityBreakdown[c.severity] = (severityBreakdown[c.severity] ?? 0) + 1;
      }
    }

    const topRules = [...ruleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, count]) => ({ rule, count }));

    return { issuesOverTime, riskOverTime, topRules, severityBreakdown };
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

export interface TrendData {
  issuesOverTime: Array<{ date: string; count: number; pr: string }>;
  riskOverTime: Array<{ date: string; score: number; level: string; pr: string }>;
  topRules: Array<{ rule: string; count: number }>;
  severityBreakdown: Record<string, number>;
}
