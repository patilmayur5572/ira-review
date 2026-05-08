# Changelog

All notable changes to the IRA VS Code extension will be documented in this file.

## [3.1.9] — 2026-05-09

### Underlying CLI

- Bundles [`ira-review`](https://www.npmjs.com/package/ira-review) **3.1.9** which fixes the **root cause** of "team rules not enforced". The old hand-rolled glob matcher in `src/utils/rulesFile.ts` only handled three patterns (`**/foo.ext`, `prefix/**`, exact match) and silently dropped rules using mid-glob patterns like `api/**/*.ts`, `ui/**/*.test.*`, or `ui/src/api/hooks/queries/**/*.ts`. Replaced with [picomatch](https://www.npmjs.com/package/picomatch) so all standard globs work. Also rolled in the JS-specific `console.log` silencer removal and the framework-auto-escape broadening (Vue/Django/Razor). See the [ira-review CHANGELOG](https://github.com/patilmayur5572/ira-review/blob/main/CHANGELOG.md#319--2026-05-09) for full details.

## [3.1.8] — 2026-05-09

### Version alignment

- The extension version is now aligned with the bundled `ira-review` CLI version. From this release onwards, the extension and CLI share a single version number to make support and compatibility obvious. (No extension features were dropped going from 3.1.2 → 3.1.8 — the jump only reflects CLI parity.)

### Underlying CLI

- Bundles [`ira-review`](https://www.npmjs.com/package/ira-review) **3.1.8**, which fixes the standalone-prompt silencing of `.ira-rules.json` team rules. Team rules are now respected via **semantic match on the rule's `description`** (a literal `bad:` example is no longer required); the AI will flag patterns like `console.log(...)` as soon as a rule says "do not commit console.log statements", with no per-snippet enumeration. The Section 7 (Defensive Coding) carve-out remains in place to prevent the v3.0.x null-suggestion flood. See the [ira-review CHANGELOG](https://github.com/patilmayur5572/ira-review/blob/main/CHANGELOG.md#318--2026-05-09) for full details.
- Cumulative CLI fixes since 3.1.2 also rolled in (PR-summary deduplication via hidden HTML marker, etc.).
- All fixes are CLI-side and surface automatically in the extension's PR-review flow; no setting changes required.

## [3.1.2] — 2026-05-08

### Underlying CLI

- Bundles [`ira-review`](https://www.npmjs.com/package/ira-review) **3.1.2**, which adds the **"All Clear" PR summary block** (celebratory ✅ banner when zero issues found and JIRA acceptance criteria are 100% covered, with an explicit "human reviewer approval is still required" reminder) and the new **`--no-post-acs-to-jira`** flag (env: `IRA_POST_ACS_TO_JIRA=false`) for keeping AI-generated AC suggestions in the PR summary only without posting back to the JIRA ticket. Also fixes a Bitbucket Server `400` on `getIssueComments` (switched from `/comments` to `/activities`) so dedup works on PR re-runs. See the [ira-review CHANGELOG](https://github.com/patilmayur5572/ira-review/blob/main/CHANGELOG.md#312--2026-05-08) for full details.
- Both fixes are CLI-side and surface automatically in the extension's PR-review flow; no setting changes required.

## [3.1.1] — 2026-05-08

### Fixed

- **Bitbucket Server token page 404 on first-time setup** — the Quick Start "Open Token Page" link now opens `${bitbucketUrl}/plugins/servlet/access-tokens/`, the top-level entry point. The previous per-user `/access-tokens/users/me/manage` URL 404'd on some Bitbucket Server installs the first time a user opened it, before "me" was resolved.

### Changed

- **Bitbucket Server token-creation guidance** — the Quick Start modal now explicitly tells users to grant **only** `Projects: Read` + `Repositories: Read` when creating their HTTP Access Token, with a note that IRA never needs Write or Admin scopes. Reduces accidental over-permissioning for first-time users.

### Underlying CLI

- Bundles [`ira-review`](https://www.npmjs.com/package/ira-review) **3.1.1**, which fixes a Windows / PowerShell CI failure where `git` stderr from `execSync` calls in `gitRoot.ts` and `reviewEngine.ts` was treated as a `NativeCommandError` and aborted the surrounding pipeline script. Pure CI-stability fix; no impact on Linux/macOS bash runners or VS Code itself.

## [3.1.0] — 2026-05-07

### Changed

- **TreeView labels** — `History ⭐` and `Trends ⭐` are now plain `History` and `Trends`. The star glyph was creating a misleading impression of "starred / paid / premium" features; IRA has no paid tier — every feature is available to every user. Pure cosmetic cleanup, no behaviour change.
- **Comment formatter delegated to the shared `ira-review` core** — `extension.ts` and `commands/reviewPR.ts` now both call `formatReviewComment` from the `ira-review` package (style: `detailed`) instead of duplicating the markdown template. Output is byte-identical to 3.0.2 for VS Code users; the change ensures all three call sites (Bitbucket Cloud client, BB Server client, VS Code) emit consistent comments. Bumps the runtime floor for the bundled `ira-review` to 3.1.0.

### Compatibility

- **Underlying CLI**: the bundled [`ira-review`](https://www.npmjs.com/package/ira-review) is now 3.1.0, which adds the GitHub Copilot CLI provider, full Bitbucket Server / Data Center support, JIRA Server / DC, two-pass critical review (`--ai-model-critical`), and centralised team rules (`--rules-url`). These are accessible from the npm CLI; the extension itself continues to use VS Code's built-in Copilot OAuth as its zero-config default. See the [ira-review CHANGELOG](https://github.com/patilmayur5572/ira-review/blob/main/CHANGELOG.md#310--2026-05-07) for the full list.
- **Breaking**: none — all existing commands, settings, and keybindings unchanged.

## [3.0.2] — 2026-05-05

### Changed

- **Bitbucket sign-in prompt** — Legacy `IRA: Sign In` prompt now reads "Paste your Bitbucket HTTP Token (Bitbucket → Settings → HTTP Tokens → Create)" instead of the deprecated "App Password" wording. The newer Quick Start flow already used the correct terminology.
- **Unlimited team rules** — Removed the 100-rule cap on `.ira-rules.json`. All valid rules are now loaded and enforced. A soft warning is logged above 500 rules since large rulesets can inflate the AI prompt; consider moving deterministic checks (naming, formatting) to ESLint. Applies to both the CLI and the VS Code extension.
- **Rules JSON Schema** — Removed `maxItems: 100` from `ira-rules.schema.json`.

## [3.0.0] — 2025-04-21

### Breaking Changes

- **Unified Review Command** — Consolidated all review commands into a single `reviewPR` command that handles both PR and local diff modes
- **AC Validation Rework** — `hasStructuredAC` heuristic now auto-switches between validating existing ACs (Given/When/Then, numbered lists) and generating new ACs from the diff (unstructured test step tables or empty fields)
- **Issue-Type Aware Validation** — AC validation logic is now issue-type aware; bug tickets focus on Expected vs Actual result gaps

### Added

- **JIRA Enrichment Service** — Shared service (`jiraEnrichment.ts`) detects tickets from branch names and handles AC validation or generation
- **Webview Results Panel** — New results panel with Post to JIRA button for sharing suggested ACs
- **AC Generation from Diff** — When a JIRA ticket lacks structured criteria, IRA generates ACs from the code diff (threshold lowered to 3 changed lines including deletions)
- **Generate PR Description + JIRA Intelligence** — PR description command now uses the same JIRA intelligence for AC generation

### Improved

- **Rule Limit** — Maximum custom rules in `.ira-rules.json` increased from 50 to 100
- **Local Review Performance** — Faster local diff reviews for small bug fixes
- **Error Handling** — User-friendly messages when not in a git repo or when branches are missing
- **AI Response Cleanup** — `cleanDescription` helper strips generic prefixes (CRITERION_1) and trailing MET/NOT_MET status; defensive parenthesis-balancing fix in webview prevents truncated AC descriptions

### Fixed

- AC descriptions truncation caused by unbalanced parentheses in AI responses
- Prompt improvements to prevent AI from cutting off AC text

## [1.0.1] - 2025-04-04

### Added

- **Generate Tests** - generate test cases from JIRA acceptance criteria in 8 frameworks (Cmd+Shift+P → IRA: Generate Tests)

### Fixed

- CLI version now correctly reports 1.0.1 (was showing 0.7.0)
- Feature table updated to reflect all available features

## [1.0.0] — 2025-04-03

### Added

- **Auto-Review on Save** — Automatically reviews files on save (`ira.autoReviewOnSave`)
  - Per-file 2-second debounce to avoid excessive API calls
- **One-Click "Apply Fix"** — CodeLens action to generate and apply AI fixes
  - Confirmation dialog before applying changes
  - Full undo support (Ctrl+Z)
- **Generate PR Description** — AI-powered PR description from diff
  - JIRA ticket auto-detection from branch name (e.g. `feature/PROJ-123-…`)
  - Supports both existing PRs and local `git diff main...HEAD`
- **Review History** — Browse past review results in a dedicated tree view
- **Trends Dashboard** — Visualize issues over time, severity breakdown, and recurring rules
- **Slack & Teams Notifications** — configure webhook URLs in settings for post-review alerts
  - Risk threshold filtering (`ira.notifyMinRisk`) — only notify on HIGH/CRITICAL
  - AC failure notifications (`ira.notifyOnAcFail`) — alert when JIRA criteria fail

### Improved

- **Risk scoring** — severity floor guarantees: BLOCKER → minimum HIGH, CRITICAL → minimum MEDIUM; MAJOR issues now contribute to score
- **Rule prefix** — renamed from `ai/` to `IRA/` (e.g. `IRA/security`, `IRA/best-practice`)
- **Bundle size** — reduced from 960KB to 269KB via native-fetch shim replacing node-fetch/tr46
- **Security** — XSS protection for dashboard webview inline data

### Fixed

- `filteredIssues` in Copilot review path was always `[]`, causing risk to always report LOW
- Security issues in standalone mode now correctly typed as `VULNERABILITY` (was matching stale `ai/` prefix)
- Per-file debounce for auto-review — saving file A then file B within 2s now correctly reviews both
- Silent error swallow during per-file AI review now logs warnings
- Offline grace period corrected to 7 days (was 5 days)

### Changed

- License: MIT

## [0.1.0] — 2025-04-02

### Added

- AI-powered PR reviews inside VS Code using GitHub Copilot's LM API (zero config)
- Support for external AI providers: OpenAI, Azure OpenAI, Anthropic, Ollama
- Diagnostics panel — review issues appear as squiggly lines with severity
- CodeLens annotations — inline issue summaries on affected lines
- TreeView sidebar — issues grouped by file with click-to-navigate
- StatusBar risk badge — real-time risk level indicator (LOW/MEDIUM/HIGH/CRITICAL)
- SCM support: GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server/Data Center
- Auto-detection of SCM provider from git remote URL
- VS Code authentication integration (GitHub, GHE) with PAT fallback
- SonarQube integration for enriched reviews
- JIRA integration for acceptance criteria validation
- Configurable minimum severity filter
- Framework auto-detection for context-aware reviews
