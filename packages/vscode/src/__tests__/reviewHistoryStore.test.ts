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

  it('clear() removes all entries', async () => {
    mockGlobalState.get.mockReturnValue([{ id: '1' }]);
    const store = ReviewHistoryStore.init(mockContext);

    await store.clear();

    expect(mockGlobalState.update).toHaveBeenCalledWith('ira-review-history', []);
  });
});
