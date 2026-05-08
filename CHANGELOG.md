# Changelog — ira-review (CLI)

All notable changes to the `ira-review` CLI / SDK package are documented here.
The VS Code extension changelog lives in `packages/vscode/CHANGELOG.md`.

## [3.1.7] — 2026-05-08

### Fixed

- **Standalone-mode prompt silenced team rules in `.ira-rules.json`.**
  Production validation against a real PR (a deliberate `console.log`
  insertion in a tRPC procedure file matched by an `api/**/*.ts` rule)
  returned `Issues found: 0` even though the team had a matching team
  rule (`proper-logging-levels`, MINOR, with a `bad: console.log('start
  procedure');` example). Root cause: the hard-coded standalone-review
  prompt in `src/ai/promptBuilder.ts` contains seven `Do NOT report:`
  exception lists (one per checklist category) plus the global "Skip
  style-only concerns: naming, formatting, import order, pattern
  preferences, missing comments" line and a "when in doubt, do not
  report" framing. Claude / Copilot CLI honoured those silencers AND
  silenced the matching team rule, because nothing in the prompt told
  them which authority wins.
  - **Fix**: when team rules are passed, the prompt now appends a
    `PRECEDENCE — Team Rules vs general checklist guidance` paragraph
    that subordinates every "Do NOT report" / "Skip" clause in
    checklist sections 1–6 (and the global "style-only" / "when in
    doubt" framing) to **specific** team rules whose `bad:` example
    matches the diff. Vague rules with no matching snippet do **not**
    override the silencers.
  - **Section 7 (Defensive Coding) is explicitly NOT overridden** —
    a team rule that loosely mentions "type safety", "best practices",
    or "defensive coding" without a specific `bad:` snippet for the
    exact code pattern in the diff cannot re-open the v3.0.x
    null-suggestion floodgate. Section 7's framework-null-safety
    guards remain authoritative.
  - **Behaviour for projects with no `.ira-rules.json` is unchanged** —
    the precedence paragraph is only emitted when `teamRulesSection`
    is provided to `buildStandalonePrompt`, so consumers without team
    rules get the same conservative defaults as in 3.1.6.
  - Test count: 511 → 515 (4 new tests in
    `src/ai/__tests__/promptBuilder.test.ts` cover the precedence
    paragraph being emitted only when team rules exist, the Section 7
    carve-out being preserved, and the verbatim Section 7 guards
    remaining in the checklist).

- **PR summary deduplication — one comment per PR, not per push.** Production
  CI runs were posting a fresh IRA summary comment on every pipeline
  trigger (i.e. every push to the source branch), cluttering the PR with
  N nearly-identical summaries. `ReviewEngine.run()`
  has always called `scmClient.postSummary()` unconditionally on each run, and
  before this release `postSummary()` had **zero** dedup logic — it always
  POSTed a new top-level comment. Inline review comments were already
  deduplicated by `CommentTracker.getExistingIraComments()` (since v3.0.0),
  but summaries were not.
  - **Fix**: a hidden HTML marker `<!-- ira:summary -->` (exported as
    `IRA_SUMMARY_TAG` from `src/core/summaryBuilder.ts`) is now emitted as
    the very first line of every IRA summary. Renders as nothing in
    Bitbucket / GitHub markdown.
  - All three SCM clients gained a `findExistingSummaryCommentId(prId)`
    method that pages through the PR's top-level comments, finds the one
    containing `IRA_SUMMARY_TAG`, and returns its id (plus `version` for
    Bitbucket Server, which 409s on `PUT /comments/{id}` without it).
    `postSummary()` now calls `findExistingSummaryCommentId` first; if a
    previous IRA summary exists it **edits in place** (`PUT` on Bitbucket /
    Bitbucket Server, `PATCH /issues/comments/{id}` on GitHub) instead of
    POSTing a new comment.
  - **Endpoint choice mirrors the per-provider conventions already in use
    by `getExistingIraComments`**: Bitbucket Server uses `/activities`
    (because `GET /comments` 400s without a `path` query param — see
    v3.1.4 fix); Bitbucket Cloud uses `/pullrequests/{id}/comments` with
    `.next` pagination; GitHub uses `/issues/{id}/comments` (NOT
    `/pulls/.../comments`, which is review-comments-only).
  - **Inline-comment dedup is unaffected.** The summary tag has no
    `file=`/`line=`/`rule=` fields, so the inline-dedup regex
    `IRA_META_RE = /<!-- ira:file=(...);line=(\d+);rule=(...) -->/` in
    `src/scm/commentTracker.ts` does not match it. Verified by a new
    regression suite in `commentTracker.test.ts` that covers (1) the
    literal tag, (2) the full `buildSummary` output, (3) the Bitbucket
    Cloud `comment.inline` fallback, (4) the GitHub `**File:**` issue-
    comment fallback, and (5) the Bitbucket Server `/activities`
    fallback all continue to behave correctly.
  - Test count: 493 → 511 (18 new tests cover find-existing happy path +
    no-existing-fallback for all three providers, plus the inline-dedup
    regression tests above).

### Why this ships separately from 3.1.6

3.1.6 was already published to npm before the multi-summary noise and the
prompt-silencer behaviour were observed in the wild. Rather than republish
3.1.6 (impossible — npm versions are immutable) or tag 3.1.6 as broken (it
isn't; the summary redesign and Windows Copilot CLI fix work as designed),
this is a focused follow-on patch that adds **only** the dedup behaviour
and the team-rules precedence paragraph. No other code paths are touched.

### Unchanged from 3.1.6

- VS Code extension stays at `3.1.2` — it consumes the structured
  `ReviewResult`, never the markdown summary, so it is unaffected by both
  3.1.6's redesign and 3.1.7's dedup tag.
- `buildSummary(result, meta?)` signature is unchanged; the tag is constant.
- README files are unchanged — this is an internal posting-behaviour fix,
  not a user-facing feature.

## [3.1.6] — 2026-05-08

### Changed

- **PR summary redesign — professional, scannable engineering report.**
  Replaced the v3.1.5 "AI-slop" output (multi-line celebration block,
  conversational greetings like "Nice work on PR #42!", redundant risk
  badges, large overview table) with a single load-bearing status-dot
  headline, one metrics line, and structured sections.
  - **Headline**: `### 🟢 IRA Review · LOW risk (0/100)` — single line,
    one status dot whose colour reflects the **worst signal** across
    risk level + AC gap + BLOCKER findings (worst-wins precedence).
  - **Metrics line**: `5 files reviewed · 1 finding · PROJ-1234: 3/5
    ACs met` — single dot-separated line replaces the 4-row overview
    table.
  - **Sections**: `Findings`, `Acceptance Criteria — <KEY> (% covered,
    n/m)`, `Risk Factors` (Sonar mode only), `Complexity Hotspots`,
    `Suggested Acceptance Criteria — <KEY>`, `Generated Test Cases`.
    Each section is self-contained; missing data omits the section
    rather than rendering "N/A" rows.
  - **Footer**: single italicised line `_ira-review 3.1.6 ·
    copilot-cli/claude-sonnet-4.5_` followed by the human-approval
    reminder. Provider/model now surfaced so reviewers can see
    which AI produced the findings.
  - **`ReviewResult.filesReviewed`** added (optional) — populated by
    `ReviewEngine.run()` so the metrics line can report file count
    even on a clean PR (sonar mode = files with issues; standalone =
    files in diff). Prior summary had no way to surface this.
  - **VS Code extension is unaffected** — it builds its own webview
    HTML from the structured `ReviewResult`, never the markdown.
  - Test count: 14 → 26 (12 new tests cover dot precedence, AC
    metric variants, footer formatting, section omission).

### Refactored

- **Shared `readPackageVersion()` helper** (`src/utils/packageInfo.ts`)
  now used by both `cli.ts` (`--version` flag) and the new summary
  footer. Eliminates the drift class that caused the v3.1.2 false
  positive (CLI reported 3.1.0 while npm had installed 3.1.2).

### Fixed

- **Copilot CLI provider — `-p ""` collapsed by Windows cmd.exe.** 3.1.5
  passed `-p ""` followed by `-s` to satisfy Copilot CLI's prompt flag
  while delivering the actual prompt via stdin. On Windows with
  `shell: true`, cmd.exe **strips the empty-string argument** before
  invoking copilot, so the next flag (`-s`) was consumed as the value
  of `-p`. Copilot then literally treated `-s` as the user prompt and
  responded with `'I received "-s" but I'm not sure what you'd like
  me to do…'` for every file. The fix is to **omit `-p` entirely** —
  Copilot CLI 1.0.43+ reads the prompt from stdin when `-p` is absent
  (per github/copilot-cli#1046). This is the only form that survives
  cmd.exe quirks while still keeping the command line tiny enough to
  fit Windows' 8,191-char limit and feeding the full prompt — however
  large — through stdin. Tests updated to assert `-p` is no longer in
  the args list at all.

## [3.1.5] — 2026-05-08

### Fixed

- **Copilot CLI provider — Windows "command line is too long" failures.**
  The `CopilotCliProvider` previously passed the prompt as a `-p <prompt>`
  argument. On Windows, `spawn(..., { shell: true })` routes the call
  through `cmd.exe`, which truncates command lines at **8,191 characters**
  and rejects them with `Copilot CLI failed: The command line is too long.`
  This caused **every per-file review to silently fail** on Windows CI agents
  for any non-trivial PR (observed: a 5-file React PR where every file's
  diff exceeded the limit, producing a misleading "All Clear" summary
  even though zero files were actually reviewed). The provider now pipes
  the prompt body through the child process's **stdin** (with `-p ""` so
  Copilot CLI 1.x reads from stdin per github/copilot-cli#1046). Args
  stay tiny and constant, so the prompt size is bounded only by the AI
  model's context window (~700 KB / 200K tokens for claude-sonnet-4.5)
  instead of the OS shell. New regression test exercises a ~50 KB prompt.

## [3.1.4] — 2026-05-08

### Fixed

- **Bitbucket Server comment dedup 400 — second code path.** The 3.1.2 fix
  switched `BitbucketServerClient.getIssueComments()` from
  `/pull-requests/{id}/comments` (which 400s without a `path` query param —
  it's the per-file inline-comments endpoint) to `/activities`, but missed
  a second Bitbucket Server code path inside `CommentTracker.getBitbucketServerIraComments()`.
  That path was still hitting `/comments` and tripping the same 400, which
  blocked review posting on every PR after the first one. It now also reads
  from `/activities`, filters for `action === "COMMENTED"`, and recursively
  walks nested replies (where IRA's reply-thread dedup metadata can also
  live). Test coverage in `commentTracker.test.ts` updated accordingly.

## [3.1.3] — 2026-05-08

### Fixed

- **`ira-review --version` now reads from `package.json` at runtime** instead of a hard-coded literal in `src/cli.ts`. The literal had drifted from the published npm version — both 3.1.1 and 3.1.2 self-reported as `"3.1.0"`, causing strict CI version assertions (e.g. Jenkins pipelines that compare `ira-review --version` against the pinned `IRA_VERSION`) to fail even when the correct binary was installed and running. Version is now resolved once at startup via `import.meta.url` → `<pkg>/package.json`, so the CLI's self-reported version can never drift from the published npm version again. No behavioural changes; functionally identical to 3.1.2.

## [3.1.2] — 2026-05-08

### Added

- **"All Clear" PR summary block** — When IRA completes a review and finds zero issues at or above the configured severity threshold, the PR summary now leads with a celebratory ✅ block: `Nice work on PR #N`, a brief description of what was reviewed (file count or framework), AC coverage if validated, the risk score, an explicit `Safe to approve from an automated-review standpoint` confirmation, AND a clear reminder that **human reviewer approval is still required before merge**. Previously a clean review just showed `Total issues: 0` in the overview table with no positive signal — reviewers couldn't tell at a glance whether IRA had actually run successfully or had silently skipped something. New block lives in `src/core/summaryBuilder.ts` and is purely additive (no config flag, no opt-in needed; only renders when `comments.length === 0`).
- **`--no-post-acs-to-jira` flag (env: `IRA_POST_ACS_TO_JIRA=false`)** — Suppresses the "post AI-generated acceptance criteria as a comment on the JIRA ticket" step that runs when a ticket has no ACs. Suggestions still appear in the PR summary's `## 📝 Suggested Acceptance Criteria` section so reviewers see them; nothing is written back to JIRA. Useful for CI environments that don't want IRA touching JIRA tickets at all (e.g. pipelines running on every webhook). Defaults to `true` (post enabled) for backwards compatibility — no-op for existing setups. The All Clear block adapts its wording so it doesn't claim a JIRA post happened when it didn't.

### Fixed

- **Bitbucket Server comment dedup 400 error** — `BitbucketServerClient.getIssueComments()` was calling `GET /pull-requests/{id}/comments?start=&limit=`, which Bitbucket Server rejects with `400: The path query parameter is required when retrieving comments` because that endpoint is the per-file inline-comment listing API. Switched to `GET /pull-requests/{id}/activities`, filtering for `action === "COMMENTED"` and recursively collecting nested replies. This is the correct way to enumerate every comment on a PR for de-duplication purposes against previous IRA runs. Without this, IRA would post the review successfully on the first run but crash on every subsequent run when it tried to check for prior comments.

## [3.1.1] — 2026-05-08

### Fixed

- **PowerShell compatibility on Windows CI agents** — `resolveGitRoot()` (`src/utils/gitRoot.ts`) and the AC-generation `git log` call (`src/core/reviewEngine.ts`) now pass `stdio: ["pipe", "pipe", "pipe"]` to `execSync`. Previously, when these `git` invocations ran outside a checkout (e.g. against an empty `ai-dry-run` workspace), git would print `fatal: not a git repository` to inherited stderr; under PowerShell this is interpreted as a `NativeCommandError` and aborts the surrounding script even though IRA itself catches the exception and recovers. Piping stderr keeps git's diagnostic out of the parent shell. Other `git` execSync sites (`src/utils/preflight.ts`, `src/utils/env.ts`, `src/cli.ts`) already piped stderr and were unaffected.

## [3.1.0] — 2026-05-07

### Added

- **GitHub Copilot CLI as an AI provider** (`--ai-provider copilot-cli`) — IRA shells out to `@github/copilot` (`copilot -p ... -s --allow-all-tools --model=<model>`) and uses the user's Copilot entitlement (GHE supported via `GH_HOST`). No API key needed; auth via `GITHUB_TOKEN` env var with "Copilot Requests" permission. Adds `CopilotCliProvider` in `src/ai/aiClient.ts` with workspace-trust pre-config hint and proxy/CA hints in failure messages.
- **Bitbucket Server / Data Center SCM provider** (`--bitbucket-type server`) — Full PR review, inline comment posting, and comment de-duplication against a self-hosted Bitbucket DC instance via the `1.0/projects/{key}/repos/{slug}/pull-requests/...` REST surface. Auto-detected from `--bitbucket-url` when not on `*.bitbucket.org`. New module `src/scm/bitbucketServer.ts` + `src/scm/__tests__/bitbucketServer.test.ts`.
- **`--comment-style <compact|detailed>`** — Choose the inline PR comment template. `compact` (the new default) is webhook/CI-friendly: severity-first header, one-sentence message, with long-form Explanation/Impact/Suggested-Fix collapsed inside `<details>`. `detailed` opts back into the pre-3.1.0 verbose block. **Behaviour change:** pre-3.1.0 had no `--comment-style` flag and effectively rendered the verbose block on every line; PRs re-reviewed with 3.1.0 will show noticeably terser inline comments unless you pass `--comment-style detailed` (or set `IRA_COMMENT_STYLE=detailed`). New module `src/utils/commentFormatter.ts` + tests.
- **`--ai-model-critical <model>`** — Two-pass review: Pass 1 uses `--ai-model` for the bulk review; Pass 2 re-runs only `CRITICAL` / `BLOCKER` findings against this stronger model. Cuts premium-request burn while preserving deep analysis on the issues that matter. Maps from `IRA_AI_MODEL_CRITICAL`.
- **`--rules-url <url>`** — Load a central `.ira-rules.json` from an HTTPS URL instead of (or alongside) the repo-local file. Useful for fleet-wide team rules without committing to every repo. New helpers in `src/utils/rulesFile.ts`.
- **JIRA Server / Data Center support** — `JiraClient` now speaks both the v2 (Server/DC) and v3 (Cloud) REST APIs, auto-selecting based on `--jira-type` or hostname. Server PAT auth flow added with clearer 401 hints. New `src/integrations/__tests__/jiraClient-server.test.ts`.
- **`--ai-base-url` for OpenAI / Anthropic** — Point at on-prem or proxied gateways (Azure-style fronts, internal LLM gateways). Test coverage in `src/ai/__tests__/aiClient-baseUrl.test.ts`.

### Changed

- **AC field auto-resolution** — `JiraClient.resolveAcField()` now queries `/rest/api/{2|3}/field` and matches `/acceptance.?criteria/i` against custom fields, falling back to `customfield_10035` only when discovery fails or the PAT lacks permission. Pre-3.1.0 you had to pass `--jira-ac-field` explicitly for non-default tenants.
- **Comment de-duplication** — `commentTracker.ts` uses a stable hash of `(file, line, severity, message)` so re-runs on the same PR commit don't double-post inline comments. Works across both Bitbucket Cloud and Server.
- **Removed the 100-rule cap** on `.ira-rules.json` (carried over from 3.0.2 vsix). Soft warning above 500 rules.

### Fixed

- Outdated Bitbucket sign-in copy ("App Password" → "HTTP Token").
- AC text truncation caused by unbalanced parentheses in some AI responses.

### Compatibility

- **Node.js**: 18+ (unchanged)
- **Breaking**: none — new flags are additive; previous `--ai-provider` values (`openai`, `azure-openai`, `anthropic`, `ollama`, `amp`) all still resolve identically.

## [3.0.2] — 2026-05-05

- Bitbucket sign-in prompt copy fix and removal of the 100-rule cap. (CLI side; previously only released as the VS Code extension 3.0.2.)

## [3.0.1] — 2025-04-22

- Bulk post to SCM from webview panel + Bitbucket Server dedup.

## [3.0.0] — 2025-04-21

- Unified review command, JIRA AC intelligence, webview results panel.

(Older history: see `packages/vscode/CHANGELOG.md`.)
