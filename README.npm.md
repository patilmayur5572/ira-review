# IRA - AI-Powered Code Reviews for Pull Requests

IRA reviews your pull requests using AI and posts inline comments with explanations, impact assessments, and suggested fixes.

**Works with any language.** Supports GitHub and Bitbucket Cloud.

## Try it now

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

## Install

```bash
npx ira-review review --help            # no install needed
npm install -g ira-review                # or install globally
npm install --save-dev ira-review        # or add to your project
```

## What can IRA do?

- **Inline PR comments** with explanation, impact, and suggested fix
- **Risk scoring** (0 to 100) based on blockers, security, complexity, and more
- **Risk labels** on GitHub PRs (`ira:critical` / `ira:high` / `ira:medium` / `ira:low`)
- **Requirement tracking** shows % completion of JIRA acceptance criteria per PR
- **Test case generation** from JIRA AC in 8 frameworks: Jest, Vitest, Mocha, Playwright, Cypress, Gherkin, Pytest, JUnit
- **Framework detection** tailors suggestions for React, Angular, Vue, NestJS
- **Comment deduplication** so re-runs skip already-commented issues
- **Smart notifications** via Slack and Teams with risk threshold filtering (`--notify-min-risk high --notify-on-ac-fail`)
- **CI-ready** works with GitHub Actions, Bitbucket Pipelines, or any CI

## Quick reference

| What you want | What to add | Example |
|---|---|---|
| AI-only review | `--pr`, SCM token, `--ai-api-key` | `npx ira-review review --pr 42 --scm-provider github --github-token ghp_xxx --github-repo owner/repo --ai-api-key sk-xxx` |
| + SonarQube | `--sonar-url`, `--sonar-token`, `--project-key` | `... --sonar-url https://sonarcloud.io --sonar-token sqa_xxx --project-key my-org_my-project` |
| + JIRA validation | `--jira-url`, `--jira-email`, `--jira-token`, `--jira-ticket` | `... --jira-url https://acme.atlassian.net --jira-email dev@acme.com --jira-token xxx --jira-ticket AUTH-234` |
| + Test generation | `--generate-tests`, `--test-framework` | `... --generate-tests --test-framework vitest` |
| + Notifications | `--slack-webhook` or `--teams-webhook` | `... --slack-webhook https://hooks.slack.com/services/xxx` |
| Notify only high risk | `--notify-min-risk` | `... --notify-min-risk high` (only HIGH and CRITICAL trigger a notification) |
| Notify on AC failure | `--notify-on-ac-fail` | `... --notify-on-ac-fail` (notify when JIRA AC fails, regardless of risk) |
| Risk labels | Automatic on GitHub | `ira:critical`, `ira:high`, `ira:medium`, `ira:low` applied automatically |
| Preview only | `--dry-run` | `... --dry-run` (prints to terminal, doesn't post on PR) |
| Use Anthropic | `--ai-provider anthropic` | `... --ai-provider anthropic --ai-api-key sk-ant-xxx` |
| Use Ollama (free) | `--ai-provider ollama` | `... --ai-provider ollama` (no API key needed) |
| Generate tests only | `generate-tests` command | `npx ira-review generate-tests --jira-ticket AUTH-234 --test-framework jest --ai-api-key sk-xxx` |

## GitHub Actions setup

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

## Config file

Create `.irarc.json` in your project root:

```json
{
  "scmProvider": "github",
  "githubRepo": "owner/repo",
  "aiModel": "gpt-4o-mini",
  "minSeverity": "MAJOR"
}
```

CLI flags > env vars > config file. Tokens and keys are blocked from config files for security.

## Security

- Runs in your CI. Tokens never leave your infrastructure
- No telemetry, analytics, or tracking
- Open source. Every line is auditable

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)

## License

[AGPL-3.0](LICENSE). For commercial licensing, contact [patilmayur5572@gmail.com](mailto:patilmayur5572@gmail.com).

📖 **Full docs and examples:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
