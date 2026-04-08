# IRA - AI-Powered Code Reviews for Pull Requests

IRA reviews your pull requests using AI and posts inline comments with explanations, impact assessments, and suggested fixes.

**Works with any language.** Supports GitHub, GitHub Enterprise, Bitbucket Cloud, and Bitbucket Server/Data Center.

> 🆕 **Also available as a [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)** - AI reviews right inside your editor with zero-config Copilot support.

## 🔒 Security First - No Secret Ever Touches Disk in Plaintext

| Where | How secrets are stored |
|---|---|
| **CLI** | Environment variables - read from `IRA_*` env vars at runtime. Never written to disk |
| **CI Pipelines** | Your CI secrets manager - GitHub Actions secrets, Jenkins credentials, HashiCorp Vault, Azure Key Vault |
| **VS Code Extension** | OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) via SecretStorage |

- No cloud service, no telemetry, no analytics. Code and tokens never leave your infrastructure
- Config files (`.irarc.json`) block token fields by design
- All reviews run locally on your machine or CI runner

## Quick Start

![IRA CLI review output](docs/images/cli-review-output.png)

### CLI with GitHub

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --dry-run
```

Drop `--dry-run` to post comments on the PR.

### CLI with Bitbucket

```bash
npx ira-review review \
  --pr 42 \
  --bitbucket-token 'bb_xxxxx' \
  --repo my-workspace/my-repo \
  --ai-api-key 'sk-xxxxx' \
  --dry-run
```

**For Bitbucket Server / Data Center:**
```bash
npx ira-review review \
  --pr 42 \
  --bitbucket-token 'bb_xxxxx' \
  --repo my-workspace/my-repo \
  --bitbucket-url https://bitbucket.yourcompany.com \
  --ai-api-key 'sk-xxxxx'
```

## Install

```bash
npx ira-review review --help            # no install needed
npm install -g ira-review                # or install globally
npm install --save-dev ira-review        # or add to your project
```

## What IRA posts on your PR

```
🔍 IRA Review - IRA/security (CRITICAL)

> User input used directly in SQL query without sanitization.

Explanation: The username parameter is concatenated into a SQL string,
creating a SQL injection vector.

Impact: Attacker could execute arbitrary SQL and gain database control.

Suggested Fix: Use parameterized queries:
  db.query('SELECT * FROM users WHERE name = $1', [username])
```

## Capabilities

| Feature | Description |
|---|---|
| **AI Code Review** | Inline PR comments with explanation, impact, and suggested fix |
| **Risk Scoring** | 0-100 score with auto-labels on GitHub (`ira:critical` / `ira:high` / `ira:medium` / `ira:low`) |
| **JIRA AC Validation** | Per-criterion pass/fail with % completion against acceptance criteria |
| **Test Generation** | Generate tests from JIRA tickets in 8 frameworks (Jest, Vitest, Mocha, Playwright, Cypress, Gherkin, Pytest, JUnit) |
| **SonarQube Enrichment** | AI explanations and fixes for existing Sonar issues |
| **Smart Notifications** | Slack and Teams with risk threshold filtering (`--notify-min-risk high --notify-on-ac-fail`) |
| **Framework Detection** | Tailored suggestions for React, Angular, Vue, NestJS, and more |
| **Multi-SCM** | GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server/Data Center |
| **Multi-AI** | OpenAI, Azure OpenAI, Anthropic, Ollama (local/free) |

## Quick Reference

| What you want | What to add |
|---|---|
| AI-only review | `--pr`, SCM token, `--ai-api-key` |
| + SonarQube | `--sonar-url`, `--sonar-token`, `--project-key` |
| + JIRA validation | `--jira-url`, `--jira-email`, `--jira-token`, `--jira-ticket` |
| + Test generation | `--generate-tests --test-framework vitest` |
| + Slack notify | `--slack-webhook https://hooks.slack.com/services/xxx` |
| + Teams notify | `--teams-webhook https://outlook.office.com/webhook/xxx` |
| Only high risk alerts | `--notify-min-risk high` |
| Preview only | `--dry-run` |
| Use Anthropic | `--ai-provider anthropic --ai-api-key sk-ant-xxx` |
| Use Ollama (free) | `--ai-provider ollama` |

## CI Setup

### GitHub Actions

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

### Bitbucket Pipelines

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: AI Code Review
          script:
            - npx ira-review review
                --pr $BITBUCKET_PR_ID
                --repo $BITBUCKET_REPO_FULL_NAME
                --no-config-file
          environment:
            IRA_AI_API_KEY: $OPENAI_API_KEY
            IRA_BITBUCKET_TOKEN: $BB_TOKEN
```

**With Bitbucket Server + JIRA + Sonar:**
```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: AI Code Review
          script:
            - npx ira-review review
                --pr $BITBUCKET_PR_ID
                --repo $BITBUCKET_REPO_FULL_NAME
                --bitbucket-url $BITBUCKET_SERVER_URL
                --sonar-url $SONAR_URL
                --sonar-token $SONAR_TOKEN
                --project-key $SONAR_PROJECT_KEY
                --jira-url $JIRA_URL
                --jira-email $JIRA_EMAIL
                --jira-token $JIRA_TOKEN
                --jira-ticket AUTH-234
                --no-config-file
          environment:
            IRA_AI_API_KEY: $OPENAI_API_KEY
            IRA_BITBUCKET_TOKEN: $BB_TOKEN
```

> Use `--no-config-file` in CI pipelines that run on untrusted PRs (forks, external contributors).

All tokens come from your CI secrets manager. Nothing is hardcoded.

## Config File

Create `.irarc.json` in your project root:

```json
{
  "scmProvider": "github",
  "githubRepo": "owner/repo",
  "aiModel": "gpt-4o-mini",
  "minSeverity": "MAJOR"
}
```

CLI flags > env vars > config file. Tokens are blocked from config files for security.

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)

## License

[Proprietary](LICENSE). See LICENSE file for details.

📖 **Full docs:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
🧩 **VS Code Extension:** [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)
