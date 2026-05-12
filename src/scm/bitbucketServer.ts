/**
 * Bitbucket Server / Data Center client.
 *
 * Differs from Bitbucket Cloud (src/scm/bitbucket.ts) in three big ways:
 *   1. URL pattern:      /rest/api/1.0/projects/{P}/repos/{R}/pull-requests/{N}/...
 *   2. JSON shapes:      comments use { text, anchor:{path,line,lineType,fileType} },
 *                        PR state lives at top-level "state" but commit hash is in fromRef.
 *   3. Pagination:       start / limit / isLastPage / nextPageStart (NOT a "next" URL).
 *
 * Reference implementation lives in packages/vscode/src/extension.ts and
 * packages/vscode/src/commands/reviewPR.ts — that code is proven against real
 * enterprise BB Server instances and is the source of truth for any edge cases.
 *
 * The legacy BitbucketClient (Cloud) is intentionally NOT touched.
 */

import type { BitbucketConfig, CommentStyle } from "../types/config.js";
import type { ReviewComment, SCMProvider, PRState } from "../types/review.js";
import { withRetry, fetchWithTimeout, RetryableError, parseApiError } from "../utils/retry.js";
import { formatReviewComment } from "../utils/commentFormatter.js";
import { IRA_SUMMARY_TAG } from "../core/summaryBuilder.js";

/** Bitbucket Server JSON diff shape (returned by /pull-requests/{n}/diff). */
interface BitbucketServerDiffResponse {
  diffs: Array<{
    source?: { toString: string };
    destination?: { toString: string };
    hunks?: Array<{
      segments: Array<{
        type: "ADDED" | "REMOVED" | "CONTEXT";
        lines: Array<{ line: string; source?: number; destination?: number }>;
      }>;
    }>;
  }>;
}

/** Convert BB Server's structured diff JSON into a standard unified diff string. */
export function convertBBServerDiffToUnified(json: BitbucketServerDiffResponse): string {
  const parts: string[] = [];
  for (const diff of json.diffs ?? []) {
    const src = diff.source?.toString ?? "/dev/null";
    const dst = diff.destination?.toString ?? "/dev/null";
    parts.push(`diff --git a/${src} b/${dst}`);
    parts.push(`--- a/${src}`);
    parts.push(`+++ b/${dst}`);
    for (const hunk of diff.hunks ?? []) {
      parts.push("@@ -1,0 +1,0 @@");
      for (const seg of hunk.segments) {
        const prefix = seg.type === "ADDED" ? "+" : seg.type === "REMOVED" ? "-" : " ";
        for (const line of seg.lines) {
          parts.push(`${prefix}${line.line}`);
        }
      }
    }
  }
  return parts.join("\n");
}

interface BBServerPaginatedResponse<T> {
  values: T[];
  isLastPage: boolean;
  nextPageStart?: number;
  size?: number;
  start?: number;
  limit?: number;
}

interface BBServerPRDetail {
  state?: string;
  fromRef?: { latestCommit?: string };
  toRef?: { latestCommit?: string };
}

interface BBServerChange {
  path?: { toString?: string };
  type?: string;
}

/**
 * Bitbucket Server / Data Center client.
 *
 * Re-uses BitbucketConfig: `workspace` field doubles as the BB Server PROJECT key
 * (e.g. "PROJ"), `repoSlug` is the repo slug, and `baseUrl` MUST be set to the
 * server root (e.g. https://bitbucket.example.com — no trailing /rest/api/1.0).
 */
export class BitbucketServerClient implements SCMProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly project: string;
  private readonly repoSlug: string;
  private readonly commentStyle: CommentStyle;
  private readonly prDetailCache = new Map<string, Promise<BBServerPRDetail>>();

  constructor(config: BitbucketConfig, opts: { commentStyle?: CommentStyle } = {}) {
    if (!config.baseUrl) {
      throw new Error(
        "BitbucketServerClient requires baseUrl (e.g. https://bitbucket.example.com).",
      );
    }
    // Strip trailing slashes AND a trailing /rest/api/1.0 suffix if user passed one.
    this.baseUrl = config.baseUrl
      .replace(/\/+$/, "")
      .replace(/\/rest\/api\/1\.0$/, "");
    this.project = config.workspace; // BB Server uses PROJECT key in this slot
    this.repoSlug = config.repoSlug;
    this.commentStyle = opts.commentStyle ?? "compact";
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private prUrl(prId: string, suffix = ""): string {
    return `${this.baseUrl}/rest/api/1.0/projects/${this.project}/repos/${this.repoSlug}/pull-requests/${prId}${suffix}`;
  }

  async postComment(comment: ReviewComment, pullRequestId: string): Promise<void> {
    const body = formatReviewComment(comment, { style: this.commentStyle });
    const url = this.prUrl(pullRequestId, "/comments");

    // BB Server inline-comment anchor — note `lineType:'ADDED'`+`fileType:'TO'` is what works.
    const payload: Record<string, unknown> = { text: body };
    if (comment.line > 0) {
      payload.anchor = {
        path: comment.filePath,
        line: comment.line,
        lineType: "ADDED",
        fileType: "TO",
      };
    }

    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();

        // If inline anchor failed (line not in diff), retry as a general PR comment.
        if (response.status === 400 && payload.anchor) {
          const retryResp = await fetchWithTimeout(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ text: body }),
          });
          if (!retryResp.ok) {
            const rt = await retryResp.text();
            throw new RetryableError(
              parseApiError(retryResp.status, rt, "Bitbucket Server"),
              retryResp.status,
            );
          }
          return;
        }

        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
    });
  }

  async postSummary(summary: string, pullRequestId: string): Promise<void> {
    // v3.1.7: dedup via hidden HTML marker. If a previous IRA summary already
    // exists on this PR, EDIT it in place (PUT /comments/{id}); otherwise POST
    // a fresh one. Stops the "one summary per push" noise observed in prod.
    const existing = await this.findExistingSummaryCommentId(pullRequestId);
    if (existing) {
      await this.editSummary(pullRequestId, existing.id, existing.version, summary);
      return;
    }
    const url = this.prUrl(pullRequestId, "/comments");
    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ text: summary }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
    });
  }

  /**
   * Find a previously-posted IRA summary on this PR by scanning every PR
   * comment for the hidden `IRA_SUMMARY_TAG`. Returns the comment id AND its
   * current `version` integer — Bitbucket Server's PUT /comments/{id} REQUIRES
   * `version` in the body or it returns 409 Conflict.
   *
   * Uses the same /activities pagination pattern as `getIssueComments` because
   * GET /comments requires a `path` query param (it's the per-file inline-
   * comments endpoint and 400s without it).
   */
  async findExistingSummaryCommentId(
    pullRequestId: string,
  ): Promise<{ id: number; version: number } | null> {
    type CommentNode = { id?: number; version?: number; text?: string };
    type Activity = { action?: string; comment?: CommentNode };

    let start = 0;
    while (true) {
      const url = this.prUrl(pullRequestId, `/activities?start=${start}&limit=100`);
      const data = await withRetry(async () => {
        const response = await fetchWithTimeout(url, { headers: this.headers });
        if (!response.ok) {
          const text = await response.text();
          throw new RetryableError(
            parseApiError(response.status, text, "Bitbucket Server"),
            response.status,
          );
        }
        return (await response.json()) as BBServerPaginatedResponse<Activity>;
      });

      for (const activity of data.values) {
        if (activity.action !== "COMMENTED") continue;
        const c = activity.comment;
        if (
          c &&
          typeof c.id === "number" &&
          typeof c.version === "number" &&
          typeof c.text === "string" &&
          c.text.includes(IRA_SUMMARY_TAG)
        ) {
          return { id: c.id, version: c.version };
        }
      }
      if (data.isLastPage) break;
      start = data.nextPageStart ?? start + 100;
    }
    return null;
  }

  private async editSummary(
    pullRequestId: string,
    commentId: number,
    version: number,
    summary: string,
  ): Promise<void> {
    const url = this.prUrl(pullRequestId, `/comments/${commentId}`);
    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify({ text: summary, version }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
    });
  }

  async getIssueComments(pullRequestId: string): Promise<string[]> {
    // Bitbucket Server's GET /pull-requests/{id}/comments REQUIRES a `path`
    // query parameter (it's the per-file inline-comments listing endpoint).
    // To get every comment on a PR for dedup, use /activities instead, which
    // returns all PR activities (comments, approvals, merges, etc.) and does
    // not require path. Filter for action === 'COMMENTED', then collect both
    // top-level comment text AND any nested replies.
    type CommentNode = { text?: string; comments?: CommentNode[] };
    type Activity = {
      action?: string;
      commentAction?: string;
      comment?: CommentNode;
    };

    const collect = (node: CommentNode | undefined, sink: string[]): void => {
      if (!node) return;
      if (typeof node.text === "string" && node.text.length > 0) sink.push(node.text);
      if (Array.isArray(node.comments)) {
        for (const child of node.comments) collect(child, sink);
      }
    };

    const bodies: string[] = [];
    let start = 0;
    while (true) {
      const url = this.prUrl(pullRequestId, `/activities?start=${start}&limit=100`);
      const data = await withRetry(async () => {
        const response = await fetchWithTimeout(url, { headers: this.headers });
        if (!response.ok) {
          const text = await response.text();
          throw new RetryableError(
            parseApiError(response.status, text, "Bitbucket Server"),
            response.status,
          );
        }
        return (await response.json()) as BBServerPaginatedResponse<Activity>;
      });

      for (const activity of data.values) {
        if (activity.action === "COMMENTED") collect(activity.comment, bodies);
      }
      if (data.isLastPage) break;
      start = data.nextPageStart ?? start + 100;
    }
    return bodies;
  }

  async getFileContent(filePath: string, pullRequestId: string): Promise<string> {
    const pr = await this.getPRDetail(pullRequestId);
    const sha = pr.fromRef?.latestCommit;
    if (!sha) {
      throw new Error(
        `Could not resolve source commit for PR #${pullRequestId} (fromRef.latestCommit missing).`,
      );
    }

    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // /raw/{path}?at={sha} returns the file body verbatim.
    const url = `${this.baseUrl}/projects/${this.project}/repos/${this.repoSlug}/raw/${encodedPath}?at=${sha}`;

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, { headers: this.headers });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
      return response.text();
    });
  }

  async getPRState(pullRequestId: string): Promise<PRState> {
    try {
      const pr = await this.getPRDetail(pullRequestId);
      const state = pr.state?.toUpperCase();
      if (state === "MERGED") return "merged";
      if (state === "DECLINED" || state === "SUPERSEDED") return "declined";
      if (state === "OPEN") return "open";
      return "unknown";
    } catch (error) {
      const status = error instanceof RetryableError ? error.statusCode : undefined;
      if (status === 404) {
        throw new Error(
          `PR #${pullRequestId} was not found in ${this.project}/${this.repoSlug} — it may have been deleted.\n` +
          `  💡 Double-check the PR number and project key.`,
        );
      }
      return "unknown";
    }
  }

  async getDiff(pullRequestId: string): Promise<string> {
    const url = this.prUrl(pullRequestId, "/diff?contextLines=3");
    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        headers: { ...this.headers, Accept: "text/plain" },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
      const rawText = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      // BB Server may return JSON regardless of Accept header — convert to unified diff.
      if (contentType.includes("application/json") || rawText.trimStart().startsWith("{")) {
        const json = JSON.parse(rawText) as BitbucketServerDiffResponse;
        return convertBBServerDiffToUnified(json);
      }
      return rawText;
    });
  }

  async getDiffPerFile(pullRequestId: string): Promise<Map<string, string>> {
    const fileMap = new Map<string, string>();

    // 1. Page through /changes to enumerate added/modified files.
    const changedFiles: string[] = [];
    let start = 0;
    while (true) {
      const url = this.prUrl(pullRequestId, `/changes?start=${start}&limit=100`);
      const data = await withRetry(async () => {
        const response = await fetchWithTimeout(url, { headers: this.headers });
        if (!response.ok) {
          const text = await response.text();
          throw new RetryableError(
            parseApiError(response.status, text, "Bitbucket Server"),
            response.status,
          );
        }
        return (await response.json()) as BBServerPaginatedResponse<BBServerChange>;
      });

      for (const change of data.values) {
        if (change.type === "DELETE") continue;
        const path = change.path?.toString;
        if (path) changedFiles.push(path);
      }

      if (data.isLastPage) break;
      start = data.nextPageStart ?? start + 100;
    }

    // 2. Fetch per-file diff. BB Server diff endpoint accepts ?path= just like Cloud.
    for (const filePath of changedFiles) {
      try {
        const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
        const url = this.prUrl(
          pullRequestId,
          `/diff/${encodedPath}?contextLines=3`,
        );
        const diff = await withRetry(async () => {
          const response = await fetchWithTimeout(
            url,
            { headers: { ...this.headers, Accept: "text/plain" } },
            15000,
          );
          if (!response.ok) {
            const text = await response.text();
            throw new RetryableError(
              parseApiError(response.status, text, "Bitbucket Server"),
              response.status,
            );
          }
          const rawText = await response.text();
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("application/json") || rawText.trimStart().startsWith("{")) {
            return convertBBServerDiffToUnified(JSON.parse(rawText) as BitbucketServerDiffResponse);
          }
          return rawText;
        });
        if (diff.trim()) fileMap.set(filePath, diff);
      } catch {
        // Soft-fail per file — match BitbucketClient behaviour.
      }
    }

    return fileMap;
  }

  async applyRiskLabel(
    pullRequestId: string,
    riskLevel: string,
    riskScore: number,
  ): Promise<void> {
    const pr = await this.getPRDetail(pullRequestId);
    const sha = pr.fromRef?.latestCommit;
    if (!sha) return; // Soft-fail: nothing to attach the build status to.

    // IRA build status is advisory only — it must never block PR merges.
    // Always report SUCCESSFUL; the actual risk level is conveyed in `name`.
    const state = "SUCCESSFUL";

    const url = `${this.baseUrl}/rest/build-status/1.0/commits/${sha}`;
    await withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          key: "ira-risk",
          state,
          name: `IRA Risk: ${riskLevel} (${riskScore}/100)`,
          description: `IRA assessed this PR as ${riskLevel.toLowerCase()} risk`,
          url: "https://www.npmjs.com/package/ira-review",
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
    });
  }

  private getPRDetail(pullRequestId: string): Promise<BBServerPRDetail> {
    const cached = this.prDetailCache.get(pullRequestId);
    if (cached) return cached;

    const promise = withRetry(async () => {
      const response = await fetchWithTimeout(this.prUrl(pullRequestId), {
        headers: this.headers,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new RetryableError(
          parseApiError(response.status, text, "Bitbucket Server"),
          response.status,
        );
      }
      return (await response.json()) as BBServerPRDetail;
    });

    this.prDetailCache.set(pullRequestId, promise);
    return promise;
  }
}
