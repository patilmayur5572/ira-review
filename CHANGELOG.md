# Changelog — ira-review (CLI)

All notable changes to the `ira-review` CLI / SDK package are documented here.
The VS Code extension changelog lives in `packages/vscode/CHANGELOG.md`.

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
