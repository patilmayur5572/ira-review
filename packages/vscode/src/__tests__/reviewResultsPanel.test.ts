import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

import * as vscode from 'vscode';

// Augment the vscode mock from setup.ts with createWebviewPanel.
// (setup.ts mocks vscode but does not include createWebviewPanel.)
(vscode.window as any).createWebviewPanel = vi.fn();
import { buildHtml, formatACValidationMarkdown, showReviewResultsPanel } from '../providers/reviewResultsPanel';
import type { PostToSCMCallback } from '../providers/reviewResultsPanel';
import type { ReviewResult, ReviewComment } from 'ira-review';

// ---- Helpers --------------------------------------------------------------

function makeAcceptanceValidation(overrides: Partial<NonNullable<ReviewResult['acceptanceValidation']>> = {}) {
  return {
    jiraKey: 'AUTH-234',
    summary: 'OAuth login',
    overallPass: false,
    criteria: [
      { description: 'OAuth2 login implemented', met: true, evidence: 'src/auth/oauth.ts' },
      { description: 'Rate limiting on login', met: false, evidence: 'Not found in diff' },
    ],
    ...overrides,
  };
}

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    pullRequestId: '42',
    framework: 'react',
    reviewMode: 'standalone',
    totalIssues: 0,
    reviewedIssues: 0,
    comments: [],
    commentsPosted: 0,
    risk: { level: 'LOW', score: 10, maxScore: 100 } as any,
    complexity: null,
    acceptanceValidation: null,
    ...overrides,
  } as ReviewResult;
}

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    filePath: 'src/foo.ts',
    line: 12,
    rule: 'IRA/security',
    severity: 'CRITICAL',
    message: 'SQL injection',
    aiReview: { explanation: 'e', impact: 'i', suggestedFix: 'f' },
    ...overrides,
  } as ReviewComment;
}

function makeScmCallback(overrides: Partial<PostToSCMCallback> = {}): PostToSCMCallback {
  return {
    scmLabel: 'GitHub',
    postComment: vi.fn().mockResolvedValue(true),
    getExistingKeys: vi.fn().mockResolvedValue(new Set<string>()),
    dedupKey: (c) => `${c.filePath}:${c.line}:${c.rule}`,
    ...overrides,
  };
}

// ---- formatACValidationMarkdown -------------------------------------------

describe('formatACValidationMarkdown', () => {
  it('formats AC validation with mixed pass/fail criteria', () => {
    const md = formatACValidationMarkdown(makeAcceptanceValidation());

    expect(md).toContain('<!-- ira:ac-summary;jiraKey=AUTH-234 -->');
    expect(md).toContain('## 🔍 IRA - Acceptance Criteria (AUTH-234)');
    expect(md).toContain('**1/2 ACs met**');
    expect(md).toContain('- ✅ OAuth2 login implemented');
    expect(md).toContain('- ❌ Rate limiting on login');
    expect(md).toContain('_Evidence:_ src/auth/oauth.ts');
    expect(md).toContain('_Evidence:_ Not found in diff');
    // Should NOT include the all-met checkmark when not all pass
    expect(md).not.toMatch(/\*\*1\/2 ACs met\*\* ✅/);
  });

  it('appends the all-met checkmark when every criterion passes', () => {
    const md = formatACValidationMarkdown(
      makeAcceptanceValidation({
        criteria: [
          { description: 'A', met: true, evidence: 'e1' },
          { description: 'B', met: true, evidence: 'e2' },
        ],
      }),
    );
    expect(md).toContain('**2/2 ACs met** ✅');
  });

  it('uses bug-fix language when issueType is bug', () => {
    const md = formatACValidationMarkdown(
      makeAcceptanceValidation({
        issueType: 'bug',
        criteria: [{ description: 'Fix applied', met: true, evidence: '' }],
      }),
    );
    expect(md).toContain('Bug Fix Validation');
    expect(md).toContain('**1/1 checks passed** ✅');
  });

  it('omits evidence line when evidence is empty/whitespace', () => {
    const md = formatACValidationMarkdown(
      makeAcceptanceValidation({
        criteria: [{ description: 'No evidence', met: false, evidence: '   ' }],
      }),
    );
    expect(md).not.toContain('_Evidence:_');
  });

  it('balances unclosed parentheses in descriptions', () => {
    const md = formatACValidationMarkdown(
      makeAcceptanceValidation({
        criteria: [{ description: 'Login (with Google', met: true, evidence: 'x' }],
      }),
    );
    expect(md).toContain('Login (with Google)');
  });
});

// ---- buildHtml AC summary post button -------------------------------------

describe('buildHtml AC summary post button', () => {
  it('renders the post button when canPostACSummary=true and AC validation exists', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub',
      true,
    );
    expect(html).toContain('id="postACSummaryToSCM"');
    expect(html).toContain('Post AC Summary to GitHub');
  });

  it('does NOT render the post button when canPostACSummary=false', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub',
      false,
    );
    expect(html).not.toContain('id="postACSummaryToSCM"');
    expect(html).not.toContain('Post AC Summary to');
  });

  it('does NOT render the post button when AC validation is missing', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: null }),
      'GitHub',
      true,
    );
    expect(html).not.toContain('id="postACSummaryToSCM"');
  });

  it('does NOT render the post button when scmLabel is missing', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      true,
    );
    expect(html).not.toContain('id="postACSummaryToSCM"');
  });

  it('uses the SCM label in the button text (Bitbucket)', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'Bitbucket',
      true,
    );
    expect(html).toContain('Post AC Summary to Bitbucket');
  });

  it('escapes HTML special chars in scmLabel', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub <Enterprise>',
      true,
    );
    expect(html).toContain('Post AC Summary to GitHub &lt;Enterprise&gt;');
    expect(html).not.toContain('Post AC Summary to GitHub <Enterprise>');
  });

  it('renders post button even when there are no inline issues (AC-only PR)', () => {
    const html = buildHtml(
      makeResult({
        totalIssues: 0,
        comments: [],
        acceptanceValidation: makeAcceptanceValidation(),
      }),
      'Bitbucket',
      true,
    );
    expect(html).toContain('id="postACSummaryToSCM"');
    expect(html).toContain('Post AC Summary to Bitbucket');
  });

  it('exposes scmLabel to webview JS even when there are no inline issues', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub',
      true,
    );
    expect(html).toContain("const scmLabel = 'GitHub';");
  });

  it('includes click handler that posts the postACSummaryToSCM message', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub',
      true,
    );
    expect(html).toContain("vscode.postMessage({ type: 'postACSummaryToSCM' })");
  });

  it('includes result handler for postACSummaryResult', () => {
    const html = buildHtml(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      'GitHub',
      true,
    );
    expect(html).toContain("msg.type === 'postACSummaryResult'");
  });
});

// ---- showReviewResultsPanel message wiring --------------------------------

describe('showReviewResultsPanel postACSummaryToSCM message handler', () => {
  let mockPanel: any;
  let messageHandler: ((msg: any) => Promise<void>) | undefined;
  let disposeCallback: (() => void) | undefined;

  beforeEach(() => {
    // Reset module-level state by triggering disposal of the previous panel.
    // (showReviewResultsPanel keeps a module-level currentPanel reference and
    // only re-creates it when the previous one was disposed.)
    if (disposeCallback) disposeCallback();
    disposeCallback = undefined;
    messageHandler = undefined;

    mockPanel = {
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((handler: (msg: any) => Promise<void>) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
        postMessage: vi.fn().mockResolvedValue(true),
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn((cb: () => void) => {
        disposeCallback = cb;
      }),
    };
    (vscode.window.createWebviewPanel as any).mockReset();
    (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);
  });

  it('calls postSummary with formatted markdown and reports success', async () => {
    const postSummary = vi.fn().mockResolvedValue(true);
    const callback = makeScmCallback({ postSummary, scmLabel: 'GitHub' });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    expect(messageHandler).toBeDefined();
    await messageHandler!({ type: 'postACSummaryToSCM' });

    expect(postSummary).toHaveBeenCalledOnce();
    const markdownArg = postSummary.mock.calls[0][0];
    expect(markdownArg).toContain('AUTH-234');
    expect(markdownArg).toContain('1/2 ACs met');

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'postACSummaryResult',
      success: true,
    });
  });

  it('reports failure when postSummary returns false', async () => {
    const postSummary = vi.fn().mockResolvedValue(false);
    const callback = makeScmCallback({ postSummary });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    await messageHandler!({ type: 'postACSummaryToSCM' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'postACSummaryResult',
      success: false,
    });
  });

  it('reports failure when postSummary throws', async () => {
    const postSummary = vi.fn().mockRejectedValue(new Error('network down'));
    const callback = makeScmCallback({ postSummary });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    await messageHandler!({ type: 'postACSummaryToSCM' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'postACSummaryResult',
      success: false,
    });
  });

  it('does not call postSummary when AC validation is missing', async () => {
    const postSummary = vi.fn().mockResolvedValue(true);
    const callback = makeScmCallback({ postSummary });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: null }),
      undefined,
      callback,
    );

    await messageHandler!({ type: 'postACSummaryToSCM' });

    expect(postSummary).not.toHaveBeenCalled();
  });

  it('does not crash when postSummary callback is not provided', async () => {
    const callback = makeScmCallback({ postSummary: undefined });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    // Message should be safely ignored
    await expect(messageHandler!({ type: 'postACSummaryToSCM' })).resolves.toBeUndefined();
  });

  it('still wires existing postAllToSCM bulk-post for inline issues', async () => {
    const postComment = vi.fn().mockResolvedValue(true);
    const callback = makeScmCallback({ postComment });
    const result = makeResult({
      totalIssues: 1,
      comments: [makeComment()],
      acceptanceValidation: makeAcceptanceValidation(),
    });

    showReviewResultsPanel(result, undefined, callback);

    await messageHandler!({ type: 'postAllToSCM', indices: [0] });

    expect(postComment).toHaveBeenCalledOnce();
  });

  it('renders the AC post button HTML when postSummary callback is provided', () => {
    const callback = makeScmCallback({ postSummary: vi.fn(), scmLabel: 'Bitbucket' });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    expect(mockPanel.webview.html).toContain('id="postACSummaryToSCM"');
    expect(mockPanel.webview.html).toContain('Post AC Summary to Bitbucket');
  });

  it('does NOT render the AC post button when postSummary callback is missing', () => {
    const callback = makeScmCallback({ postSummary: undefined });

    showReviewResultsPanel(
      makeResult({ acceptanceValidation: makeAcceptanceValidation() }),
      undefined,
      callback,
    );

    expect(mockPanel.webview.html).not.toContain('id="postACSummaryToSCM"');
  });
});
