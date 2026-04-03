# Changelog

All notable changes to the IRA VS Code extension will be documented in this file.

## [1.0.0] — 2025-04-03

### Added

- **Pro License System** — Polar.sh-powered license activation/deactivation
  - Secure key storage via VS Code SecretStorage
  - Machine ID binding for per-device activation limits
  - 24-hour validation cache with 7-day offline grace period
  - Commands: `IRA: Activate Pro License`, `IRA: Deactivate Pro License`
- **Auto-Review on Save** ⭐ Pro — Automatically reviews files on save (`ira.autoReviewOnSave`)
  - Per-file 2-second debounce to avoid excessive API calls
  - Soft upsell prompt for free users (shown once per session)
- **One-Click "Apply Fix"** ⭐ Pro — CodeLens action to generate and apply AI fixes
  - Confirmation dialog before applying changes
  - Full undo support (Ctrl+Z)
- **Generate PR Description** — AI-powered PR description from diff (free for all users)
  - JIRA ticket auto-detection from branch name (e.g. `feature/PROJ-123-…`)
  - Supports both existing PRs and local `git diff main...HEAD`
- **Review History** ⭐ Pro — Browse past review results in a dedicated tree view
- **Trends Dashboard** ⭐ Pro — Visualize issues over time, severity breakdown, and recurring rules
- Pro badge in status bar when license is active
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

- License: switched from AGPL-3.0 to proprietary

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
