# Changelog

All notable changes to the IRA VS Code extension will be documented in this file.

## [0.1.0] - 2025-04-02

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
