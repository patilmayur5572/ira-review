import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import { ReviewHistoryStore } from '../services/reviewHistoryStore';

const mockGlobalState = {
  get: vi.fn(),
  update: vi.fn(),
  keys: vi.fn(() => []),
  setKeysForSync: vi.fn(),
};
const mockContext = {
  globalState: mockGlobalState,
  subscriptions: [],
  extensionUri: { fsPath: '/test' },
} as any;

function makeResult(overrides: Record<string, any> = {}) {
  return {
    pullRequestId: 'PR-42',
    reviewMode: 'standalone' as const,
    totalIssues: 2,
    reviewedIssues: 2,
    commentsPosted: 0,
    risk: { level: 'MEDIUM' as const, score: 45, maxScore: 100, factors: [], summary: 'Test risk' },
    framework: 'react' as const,
    complexity: null,
    acceptanceValidation: null,
    comments: [
      { filePath: 'src/a.ts', line: 1, rule: 'IRA/security', severity: 'CRITICAL', message: 'm1', aiReview: { explanation: '', impact: '', suggestedFix: '' } },
      { filePath: 'src/b.ts', line: 2, rule: 'IRA/perf', severity: 'MINOR', message: 'm2', aiReview: { explanation: '', impact: '', suggestedFix: '' } },
    ],
    ...overrides,
  };
}

describe('ReviewHistoryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ReviewHistoryStore as any)['instance'] = undefined;
  });

  it('save() stores entry in globalState', async () => {
    mockGlobalState.get.mockReturnValue([]);
    const store = ReviewHistoryStore.init(mockContext);

    await store.save(makeResult());

    expect(mockGlobalState.update).toHaveBeenCalledWith(
      'ira-review-history',
      expect.arrayContaining([expect.objectContaining({ pullRequestId: 'PR-42' })])
    );
  });

  it('getAll() returns empty array when no history', () => {
    mockGlobalState.get.mockReturnValue(undefined);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getAll()).toEqual([]);
  });

  it('getRecent(5) returns at most 5 entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, pullRequestId: `PR-${i}` }));
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getRecent(5)).toHaveLength(5);
  });

  it('search() filters entries by PR number', () => {
    const entries = [
      { id: '1', pullRequestId: 'PR-42', riskLevel: null, comments: [] },
      { id: '2', pullRequestId: 'PR-99', riskLevel: null, comments: [] },
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    const results = store.search('PR-42');
    expect(results).toHaveLength(1);
    expect(results[0].pullRequestId).toBe('PR-42');
  });

  it('search() filters entries by rule name', () => {
    const entries = [
      { id: '1', pullRequestId: 'PR-1', riskLevel: null, comments: [
        { message: 'test', rule: 'IRA/security', filePath: 'a.ts' },
      ]},
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    const results = store.search('security');
    expect(results).toHaveLength(1);
  });

  it('getTrends() returns empty trends when no history', () => {
    mockGlobalState.get.mockReturnValue([]);
    const store = ReviewHistoryStore.init(mockContext);

    const trends = store.getTrends();
    expect(trends.issuesOverTime).toEqual([]);
    expect(trends.severityBreakdown).toEqual({});
  });

  it('getTrends() calculates correct severity breakdown', () => {
    const entries = [
      { id: '1', pullRequestId: 'PR-1', timestamp: Date.now(), totalIssues: 2, riskScore: null, riskLevel: null, comments: [
        { severity: 'CRITICAL', rule: 'r1', message: '', filePath: '' },
        { severity: 'MINOR', rule: 'r2', message: '', filePath: '' },
      ]},
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    const trends = store.getTrends();
    expect(trends.severityBreakdown).toEqual({ CRITICAL: 1, MINOR: 1 });
  });

  it('save() limits to MAX_ENTRIES (200)', async () => {
    const existing = Array.from({ length: 200 }, (_, i) => ({ id: `${i}` }));
    mockGlobalState.get.mockReturnValue(existing);
    const store = ReviewHistoryStore.init(mockContext);

    await store.save(makeResult());

    const savedEntries = mockGlobalState.update.mock.calls[0][1];
    expect(savedEntries).toHaveLength(200);
  });

  it('getTrends() returns direction=insufficient with fewer than 6 entries', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      id: `${i}`, pullRequestId: `PR-${i}`, timestamp: Date.now() - i * 86400000,
      totalIssues: 5, riskScore: null, riskLevel: null,
      comments: [{ severity: 'MAJOR', rule: 'IRA/security', message: 'm', filePath: 'a.ts' }],
    }));
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    const trends = store.getTrends();
    expect(trends.direction).toBe('insufficient');
  });

  it('getTrends() returns direction=improving when recent issues decrease', () => {
    // entries are newest-first: recent 5 have 2 issues, previous 5 have 10 issues
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`, pullRequestId: `PR-R${i}`, timestamp: Date.now() - i * 86400000,
        totalIssues: 2, riskScore: null, riskLevel: null, comments: [],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, pullRequestId: `PR-P${i}`, timestamp: Date.now() - (5 + i) * 86400000,
        totalIssues: 10, riskScore: null, riskLevel: null, comments: [],
      })),
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getTrends().direction).toBe('improving');
  });

  it('getTrends() returns direction=worsening when recent issues increase', () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`, pullRequestId: `PR-R${i}`, timestamp: Date.now() - i * 86400000,
        totalIssues: 10, riskScore: null, riskLevel: null, comments: [],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, pullRequestId: `PR-P${i}`, timestamp: Date.now() - (5 + i) * 86400000,
        totalIssues: 2, riskScore: null, riskLevel: null, comments: [],
      })),
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getTrends().direction).toBe('worsening');
  });

  it('getTrends() returns direction=stable when issue counts are similar', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`, pullRequestId: `PR-${i}`, timestamp: Date.now() - i * 86400000,
      totalIssues: 5, riskScore: null, riskLevel: null, comments: [],
    }));
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getTrends().direction).toBe('stable');
  });

  it('getTrends() computes hotspot files sorted by issue count', () => {
    const entries = [
      { id: '1', pullRequestId: 'PR-1', timestamp: Date.now(), totalIssues: 4, riskScore: null, riskLevel: null, comments: [
        { severity: 'CRITICAL', rule: 'IRA/security', message: 'm1', filePath: 'src/auth.ts' },
        { severity: 'MAJOR', rule: 'IRA/security', message: 'm2', filePath: 'src/auth.ts' },
        { severity: 'MAJOR', rule: 'IRA/error-handling', message: 'm3', filePath: 'src/api.ts' },
        { severity: 'MINOR', rule: 'IRA/defensive', message: 'm4', filePath: 'src/utils.ts' },
      ]},
    ];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    const trends = store.getTrends();
    expect(trends.hotspotFiles).toHaveLength(3);
    expect(trends.hotspotFiles[0].filePath).toBe('src/auth.ts');
    expect(trends.hotspotFiles[0].issueCount).toBe(2);
    expect(trends.hotspotFiles[0].topRule).toBe('IRA/security');
    expect(trends.hotspotFiles[1].filePath).toBe('src/api.ts');
    expect(trends.hotspotFiles[2].filePath).toBe('src/utils.ts');
  });

  it('getTrends() limits hotspot files to top 3', () => {
    const comments = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].flatMap((f) =>
      Array.from({ length: 5 - ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].indexOf(f) }, () => ({
        severity: 'MAJOR', rule: 'IRA/security', message: 'm', filePath: f,
      })),
    );
    const entries = [{ id: '1', pullRequestId: 'PR-1', timestamp: Date.now(), totalIssues: comments.length, riskScore: null, riskLevel: null, comments }];
    mockGlobalState.get.mockReturnValue(entries);
    const store = ReviewHistoryStore.init(mockContext);

    expect(store.getTrends().hotspotFiles).toHaveLength(3);
  });

  it('clear() removes all entries', async () => {
    mockGlobalState.get.mockReturnValue([{ id: '1' }]);
    const store = ReviewHistoryStore.init(mockContext);

    await store.clear();

    expect(mockGlobalState.update).toHaveBeenCalledWith('ira-review-history', []);
  });
});
