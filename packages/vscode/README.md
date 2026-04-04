# IRA - Intelligent Review Assistant

**AI code reviews inside your editor. Privacy-first, runs locally.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ira-review.ira-review-vscode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)

---

## Features

- 🔍 **AI-Powered Code Reviews** - review PRs using GitHub Copilot, OpenAI, Anthropic, or Ollama (local)
- 📄 **Review Current File** - review the currently open file without needing a PR
- 🎯 **Diagnostics** - issues show up as squiggly lines in your editor, just like TypeScript errors
- 📝 **CodeLens** - inline annotations on affected lines so you don't miss anything
- 🌳 **TreeView** - sidebar panel with all issues grouped by file
- 🛡️ **Risk Score** - status bar badge showing the overall risk level of your PR
- 🔗 **SonarQube + JIRA** - enrich reviews with static analysis and acceptance criteria validation
- 📢 **Slack & Teams Notifications** - get notified after reviews with risk threshold filtering
- 📋 **Generate PR Description** - AI-powered PR descriptions with JIRA ticket auto-detection from branch names
- 🧪 **Generate Tests** - generate test cases from JIRA acceptance criteria in 8 frameworks

<!-- Screenshot: Diagnostics view showing issues as squiggly lines -->

<!-- Screenshot: TreeView sidebar with issues grouped by file -->

<!-- Screenshot: StatusBar showing risk badge -->

---

## Quick Start

1. **Install** the extension from the VS Code Marketplace
2. **Open a project** that has a git remote (GitHub, GHE, or Bitbucket)
3. **Run `IRA: Review Current PR`** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

That's it. Issues will appear inline in your editor within seconds.

---

## Example Output

```
🔍 IRA: Found 3 issues (Risk: MEDIUM)

src/routes/todos.ts
  ⚠️ [IRA/security] SQL injection risk - user input not sanitized
  ℹ️ [IRA/performance] Missing database index on frequently queried column

src/middleware/auth.ts
  🔴 [IRA/security] JWT secret hardcoded - use environment variable
```

---

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| PR Reviews | ✅ | ✅ |
| Review Current File | ✅ | ✅ |
| Copilot AI (zero config) | ✅ | ✅ |
| OpenAI / Anthropic / Ollama | ✅ | ✅ |
| Diagnostics + CodeLens | ✅ | ✅ |
| TreeView + Risk Score | ✅ | ✅ |
| SonarQube Integration | ✅ | ✅ |
| JIRA AC Validation | ✅ | ✅ |
| Generate PR Description | ✅ | ✅ |
| Test Generation from JIRA | ✅ | ✅ |
| Slack & Teams Notifications | ✅ | ✅ |
| Auto-review on Save | - | ✅ |
| One-click Apply Fix | - | ✅ |
| Review History + Trends | - | ✅ |
| Priority Support | - | ✅ |

---

## Supported Providers

### SCM

| Provider                          | Status |
| --------------------------------- | :----: |
| GitHub                            |   ✅   |
| GitHub Enterprise                 |   ✅   |
| Bitbucket Cloud                   |   ✅   |
| Bitbucket Server / Data Center    |   ✅   |

### AI

| Provider                          | Status |
| --------------------------------- | :----: |
| GitHub Copilot (zero config)      |   ✅   |
| OpenAI                            |   ✅   |
| Azure OpenAI                      |   ✅   |
| Anthropic                         |   ✅   |
| Ollama (local)                    |   ✅   |

---

## Configuration

Open **Settings > Extensions > IRA** or add these to your `settings.json`:

| Setting              | Description                                        | Default     |
| -------------------- | -------------------------------------------------- | ----------- |
| `ira.aiProvider`     | AI backend: `copilot`, `openai`, `anthropic`, `ollama` | `copilot`   |
| `ira.scmProvider`    | SCM platform: `github`, `bitbucket`                | auto-detect |
| `ira.bitbucketUrl`   | Base URL for Bitbucket Server / Data Center        |             |
| `ira.sonarUrl`       | SonarQube server URL                               |             |
| `ira.sonarToken`     | SonarQube authentication token                     |             |
| `ira.jiraUrl`        | JIRA instance URL for AC validation                |             |
| `ira.jiraToken`      | JIRA API token                                     |             |
| `ira.slackWebhookUrl` | Slack webhook URL for review notifications | |
| `ira.teamsWebhookUrl` | Teams webhook URL for review notifications | |
| `ira.notifyMinRisk`   | Minimum risk level to trigger notifications: `low`, `medium`, `high`, `critical` | `low` |
| `ira.notifyOnAcFail`  | Notify when JIRA acceptance criteria fail | `false` |

---

## Commands

- `IRA: Review Current PR`
- `IRA: Review Current File`
- `IRA: Generate Tests`
- `IRA: Generate PR Description`
- `IRA: Show Risk Score`
- `IRA: Activate Pro License`
- `IRA: Deactivate Pro License`
- `IRA: Configure`

---

## Links

- **Marketplace**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)
- **Support**: patilmayur5572@gmail.com
