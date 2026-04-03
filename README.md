# IRA - Intelligent Review Assistant

**AI-powered code reviews for your editor and CI pipeline. Privacy-first, runs locally.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ira-review.ira-review-vscode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)
[![npm](https://img.shields.io/npm/v/ira-review?color=red)](https://www.npmjs.com/package/ira-review)

---

## What is IRA?

IRA reviews your pull requests using AI and posts inline comments with explanations, impact assessments, and suggested fixes directly on your PR.

**Works with any language.** Supports GitHub, GitHub Enterprise, Bitbucket Cloud, and Bitbucket Server/Data Center.

## How to get IRA

### VS Code Extension

Search **"IRA - AI Code Reviews"** in the Extensions panel, or:

```bash
code --install-extension ira-review.ira-review-vscode
```

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)

### CLI (npm)

```bash
npx ira-review review --pr 42 --dry-run
```

[View on npm](https://www.npmjs.com/package/ira-review)

---

## Features

### Free

- AI-powered code review with inline PR comments
- Risk scoring (0-100) with auto-labeling on GitHub
- JIRA acceptance criteria validation with per-criterion pass/fail
- Test generation from JIRA tickets (8 frameworks)
- SonarQube issue enrichment with AI explanations
- Slack and Teams notifications with risk threshold filtering
- GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server
- OpenAI, Azure OpenAI, Anthropic, Ollama (local), GitHub Copilot

### Pro ($10/mo)

- Auto-review on save
- One-click "Apply Fix" via CodeLens
- Review history with search
- Trends dashboard (issues over time, severity breakdown)

---

## Quick Start

### VS Code

1. Install the extension
2. Open a project with a git remote
3. Run `IRA: Review Current PR` from the Command Palette (`Cmd+Shift+P`)

### CLI

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --dry-run
```

### CI/CD (GitHub Actions)

```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: |
          npx ira-review review \
            --pr ${{ github.event.pull_request.number }} \
            --scm-provider github \
            --github-token ${{ secrets.GITHUB_TOKEN }} \
            --github-repo ${{ github.repository }} \
            --no-config-file
        env:
          IRA_AI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Quick Reference

| What you want | What to add |
|---|---|
| AI-only review | `--pr 42 --scm-provider github --github-token ghp_xxx --github-repo owner/repo --ai-api-key sk-xxx` |
| + SonarQube | `--sonar-url https://sonarcloud.io --sonar-token sqa_xxx --project-key my-org_my-project` |
| + JIRA validation | `--jira-url https://acme.atlassian.net --jira-email dev@acme.com --jira-token xxx --jira-ticket AUTH-234` |
| + Test generation | `--generate-tests --test-framework vitest` |
| + Slack notifications | `--slack-webhook https://hooks.slack.com/services/xxx` |
| + Teams notifications | `--teams-webhook https://outlook.office.com/webhook/xxx` |
| Notify only high risk | `--notify-min-risk high` |
| Notify on AC failure | `--notify-on-ac-fail` |
| Preview in terminal | `--dry-run` |
| Use Anthropic | `--ai-provider anthropic --ai-api-key sk-ant-xxx` |
| Use Ollama (free) | `--ai-provider ollama` |
| Save on AI costs | `--ai-model gpt-4o-mini --ai-model-critical gpt-4o` |
| Generate tests only | `npx ira-review generate-tests --jira-ticket AUTH-234 --test-framework jest --ai-api-key sk-xxx` |
| Save tests to file | `--output tests/auth.test.ts` |

## AI Providers

| Provider | Flag | Notes |
|---|---|---|
| **OpenAI** (default) | `--ai-provider openai` | Pass key with `--ai-api-key` or set `IRA_AI_API_KEY` |
| **Azure OpenAI** | `--ai-provider azure-openai` | Also needs `--ai-base-url` and `--ai-deployment` |
| **Anthropic** | `--ai-provider anthropic` | Pass key with `--ai-api-key` or set `IRA_AI_API_KEY` |
| **Ollama** (local) | `--ai-provider ollama` | Runs locally, no API key needed |

## Supported Test Frameworks

| Framework | Language | Style |
|---|---|---|
| `jest` | JavaScript/TypeScript | `describe` / `it` / `expect` |
| `vitest` | JavaScript/TypeScript | `describe` / `it` / `expect` |
| `mocha` | JavaScript/TypeScript | `describe` / `it` + Chai |
| `playwright` | TypeScript | `test` / `page` / E2E |
| `cypress` | JavaScript | `cy.visit` / `cy.get` / E2E |
| `gherkin` | Any (BDD) | `Given` / `When` / `Then` |
| `pytest` | Python | `def test_` / `assert` |
| `junit` | Java/Kotlin | `@Test` / `assertEquals` |

---

## What IRA posts on your PR

```
IRA Review - IRA/security (CRITICAL)

> User input used directly in SQL query without sanitization.

Explanation: The username parameter is concatenated into a SQL string,
creating a SQL injection vector.

Impact: Attacker could execute arbitrary SQL and gain database control.

Suggested Fix: Use parameterized queries:
  db.query('SELECT * FROM users WHERE name = $1', [username])
```

---

## Security

- Runs in your CI or editor. Your code never leaves your infrastructure.
- No telemetry, analytics, or tracking.
- Config files block sensitive fields automatically.

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)
- A GitHub or Bitbucket repo with an open PR

## Support

- Issues and feature requests: patilmayur5572@gmail.com
- CLI reference: `npx ira-review review --help`

## License

[Proprietary](LICENSE). See LICENSE file for details.
