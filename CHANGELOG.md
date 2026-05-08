# Changelog — ira-review (CLI)

All notable changes to the `ira-review` CLI / SDK package are documented here.
The VS Code extension changelog lives in `packages/vscode/CHANGELOG.md`.

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
