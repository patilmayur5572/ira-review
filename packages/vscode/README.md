# IRA - Intelligent Review Assistant

**The open-source CodeRabbit. AI code reviews inside your editor.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ira-review.ira-review-vscode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-green.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub Stars](https://img.shields.io/github/stars/patilmayur5572/ira-review?style=social)](https://github.com/patilmayur5572/ira-review)

---

## Features

- 🔍 **AI-Powered Code Reviews** - review PRs using GitHub Copilot, OpenAI, Anthropic, or Ollama (local)
- 🎯 **Diagnostics** - issues show up as squiggly lines in your editor, just like TypeScript errors
- 📝 **CodeLens** - inline annotations on affected lines so you don't miss anything
- 🌳 **TreeView** - sidebar panel with all issues grouped by file
- 🛡️ **Risk Score** - status bar badge showing the overall risk level of your PR
- 🔗 **SonarQube + JIRA** - enrich reviews with static analysis and acceptance criteria validation

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
  ⚠️ [ai/security] SQL injection risk - user input not sanitized
  ℹ️ [ai/performance] Missing database index on frequently queried column

src/middleware/auth.ts
  🔴 [ai/security] JWT secret hardcoded - use environment variable
```

---

## Free vs Pro

| Feature                    | Free | Pro ($10/mo) |
| -------------------------- | :--: | :----------: |
| PR Reviews                 |  ✅  |      ✅      |
| Copilot AI (zero config)   |  ✅  |      ✅      |
| OpenAI / Anthropic / Ollama|  ✅  |      ✅      |
| Diagnostics + CodeLens     |  ✅  |      ✅      |
| TreeView + Risk Score      |  ✅  |      ✅      |
| SonarQube Integration      |  ✅  |      ✅      |
| JIRA AC Validation         |  ✅  |      ✅      |
| Auto-review on Save        |  -   |      ✅      |
| One-click Apply Fix        |  -   |      ✅      |
| Review History + Trends    |  -   |      ✅      |
| Post to PR (selective)     |  -   |      ✅      |
| Custom Review Rules        |  -   |      ✅      |
| Priority Support           |  -   |      ✅      |

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

---

## Links

- **GitHub**: [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
- **CLI Package**: `npm install -g ira-review`
- **License**: [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0)
