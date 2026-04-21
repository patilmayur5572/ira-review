# Changelog

All notable changes to the IRA VS Code extension will be documented in this file.

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
