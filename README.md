# IRA - AI-Powered Code Reviews for Pull Requests

IRA (Intelligent Review Assistant) reviews your pull requests using AI. It posts inline comments with explanations, impact assessments, and suggested fixes directly on your PR.

**Works with any language.** Supports GitHub and Bitbucket Cloud.

## What can IRA do?

- **Review your code** using AI and post inline comments with explanation, impact, and fix
- **Score PR risk** from 0 to 100 and auto-label your PRs on GitHub
- **Track requirement completion** against JIRA acceptance criteria with percentage and per-criterion status
- **Generate test cases** from JIRA tickets in 8 frameworks (Jest, Vitest, Mocha, Playwright, Cypress, Gherkin, Pytest, JUnit)
- **Enrich SonarQube issues** with AI-powered explanations when Sonar is connected
- **Notify your team** via Slack or Microsoft Teams after each review

## Try it in 30 seconds

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --dry-run
```

This prints the review in your terminal. Drop `--dry-run` to post it on the PR.

## Install

```bash
npx ira-review review --help            # no install needed
npm install -g ira-review                # or install globally
npm install --save-dev ira-review        # or add to your project
```

## How to use IRA

Pick the combination that fits your workflow. Each example builds on the previous one.

### 1. AI-only review

The simplest setup. IRA reads your PR diff and finds bugs, security issues, and performance problems.

**GitHub:**
```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx'
```

**Bitbucket Cloud:**
```bash
npx ira-review review \
  --pr 42 \
  --bitbucket-token 'bb_xxxxx' \
  --repo my-workspace/my-repo \
  --ai-api-key 'sk-xxxxx'
```

### 2. Review with JIRA (requirement tracking + AC validation)

Connect a JIRA ticket and IRA will tell you how much of the acceptance criteria is actually implemented, with per-criterion pass/fail and edge case warnings.

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --jira-url https://yourcompany.atlassian.net \
  --jira-email you@company.com \
  --jira-token 'jira_xxxxx' \
  --jira-ticket AUTH-234
```

Example output posted on your PR:

```
📊 Requirements: AUTH-234 - 67% Complete (4/6 AC met)

  ✅ OAuth2 login flow implemented with Google provider
  ✅ JWT tokens generated on successful authentication
  ✅ Refresh token rotation with 7-day expiry
  ❌ Input validation on login endpoint - no email format check
  ✅ Logout endpoint clears session and revokes token
  ❌ Rate limiting on login attempts - not implemented

  ⚠️ Edge Cases Not Covered:
     - What happens when Google OAuth is unreachable?
     - Token refresh during concurrent requests?
```

### 3. Review with JIRA + test generation

Add `--generate-tests` to any review command and IRA will generate test scaffolding alongside the code review.

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --jira-url https://yourcompany.atlassian.net \
  --jira-email you@company.com \
  --jira-token 'jira_xxxxx' \
  --jira-ticket AUTH-234 \
  --generate-tests \
  --test-framework vitest
```

### 4. Standalone test generation (no review)

Don't need a review? Generate test cases directly from a JIRA ticket.

```bash
npx ira-review generate-tests \
  --jira-ticket AUTH-234 \
  --jira-url https://yourcompany.atlassian.net \
  --jira-email you@company.com \
  --jira-token 'jira_xxxxx' \
  --ai-api-key 'sk-xxxxx' \
  --test-framework playwright
```

Add `--pr 42 --scm-provider github --github-repo owner/repo` to include code context from a PR for higher precision.

Add `--output tests/auth.test.ts` to save the generated tests to a file.

### 5. Sonar + AI review

Already using SonarQube? IRA pulls your Sonar issues and enriches each one with AI explanations and suggested fixes.

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --sonar-url https://sonarcloud.io \
  --sonar-token 'sqa_xxxxx' \
  --project-key my-org_my-project
```

You can combine this with JIRA, test generation, and notifications too.

## Quick reference

| What you want | What to add | Example |
|---|---|---|
| AI-only review | `--pr`, SCM token, `--ai-api-key` | `npx ira-review review --pr 42 --scm-provider github --github-token ghp_xxx --github-repo owner/repo --ai-api-key sk-xxx` |
| + SonarQube | `--sonar-url`, `--sonar-token`, `--project-key` | `... --sonar-url https://sonarcloud.io --sonar-token sqa_xxx --project-key my-org_my-project` |
| + JIRA validation | `--jira-url`, `--jira-email`, `--jira-token`, `--jira-ticket` | `... --jira-url https://acme.atlassian.net --jira-email dev@acme.com --jira-token xxx --jira-ticket AUTH-234` |
| + Test generation | `--generate-tests`, `--test-framework` | `... --generate-tests --test-framework vitest` |
| + Slack notifications | `--slack-webhook` | `... --slack-webhook https://hooks.slack.com/services/xxx` |
| + Teams notifications | `--teams-webhook` | `... --teams-webhook https://outlook.office.com/webhook/xxx` |
| Notify only high risk | `--notify-min-risk` | `... --slack-webhook https://hooks.slack.com/xxx --notify-min-risk high` (only HIGH and CRITICAL trigger a notification) |
| Notify on AC failure | `--notify-on-ac-fail` | `... --slack-webhook https://hooks.slack.com/xxx --notify-on-ac-fail` (notify when JIRA acceptance criteria fail, regardless of risk) |
| Risk labels | Automatic on GitHub | Labels like `ira:critical`, `ira:high`, `ira:medium`, `ira:low` are applied automatically |
| Preview in terminal | `--dry-run` | `... --dry-run` (prints output, doesn't post on PR) |
| Use Anthropic | `--ai-provider anthropic` | `... --ai-provider anthropic --ai-api-key sk-ant-xxx` |
| Use Ollama (free) | `--ai-provider ollama` | `... --ai-provider ollama` (no API key needed) |
| Save on AI costs | `--ai-model` + `--ai-model-critical` | `... --ai-model gpt-4o-mini --ai-model-critical gpt-4o` |
| Generate tests only | `generate-tests` command | `npx ira-review generate-tests --jira-ticket AUTH-234 --test-framework jest --ai-api-key sk-xxx` |
| Save tests to file | `--output` | `... generate-tests --jira-ticket AUTH-234 --test-framework vitest --output tests/auth.test.ts` |

## Supported test frameworks

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

## AI providers

| Provider | Flag | Notes |
|---|---|---|
| **OpenAI** (default) | `--ai-provider openai` | Pass key with `--ai-api-key` or set `IRA_AI_API_KEY` |
| **Azure OpenAI** | `--ai-provider azure-openai` | Also needs `--ai-base-url` and `--ai-deployment` |
| **Anthropic** | `--ai-provider anthropic` | Pass key with `--ai-api-key` or set `IRA_AI_API_KEY` |
| **Ollama** (local) | `--ai-provider ollama` | Runs locally, no API key needed |

> **Tip:** Use `--ai-model gpt-4o-mini` for most issues and `--ai-model-critical gpt-4o` for blockers. This keeps costs low without sacrificing quality on critical findings.

## CI/CD setup

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

Want JIRA validation in CI? Add these flags to the run command:

```
--jira-url ${{ vars.JIRA_URL }} \
--jira-email ${{ vars.JIRA_EMAIL }} \
--jira-token ${{ secrets.JIRA_TOKEN }} \
--jira-ticket AUTH-234
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

> Use `--no-config-file` in CI pipelines that run on untrusted PRs (forks, external contributors).

## Smart notifications

By default, IRA sends a Slack or Teams notification after every review. You can control exactly when notifications fire so your team only hears about what matters.

### How it works

| Setup | What happens | Best for |
|---|---|---|
| No flags set | Every review triggers a notification | Small teams that want full visibility |
| `--notify-min-risk high` | Only HIGH (40+) and CRITICAL (60+) PRs trigger notifications. LOW and MEDIUM stay silent | Reducing noise, focusing on risky PRs |
| `--notify-min-risk high --notify-on-ac-fail` | Notifies on HIGH/CRITICAL risk **or** when JIRA acceptance criteria fail, even on low risk PRs | **Recommended for tech leads.** Catches both risky code and incomplete requirements |
| `--notify-on-ac-fail` alone | Every review still triggers a notification (no risk filter), but AC failures are guaranteed to notify | Teams that want full visibility but never want to miss an AC failure |

### Example: only ping on high risk PRs

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --slack-webhook 'https://hooks.slack.com/services/xxx' \
  --notify-min-risk high
```

Your `#code-reviews` channel only gets pinged for HIGH and CRITICAL PRs. Everything else reviews silently.

### Example: catch risky PRs and incomplete requirements

```bash
--notify-min-risk high --notify-on-ac-fail
```

Tech leads get notified for two things: risky PRs and PRs that don't fully implement the JIRA requirements. Low risk, well-implemented PRs stay quiet.

### What triggers a notification?

Here's exactly when your Slack or Teams channel gets a message:

| PR risk | AC status | No flags | `--notify-min-risk high` | `+ --notify-on-ac-fail` |
|---|---|---|---|---|
| LOW (5) | AC passes | ✅ Notified | Silent | Silent |
| LOW (12) | AC fails | ✅ Notified | Silent | ✅ Notified |
| MEDIUM (25) | AC passes | ✅ Notified | Silent | Silent |
| HIGH (45) | AC passes | ✅ Notified | ✅ Notified | ✅ Notified |
| CRITICAL (72) | AC fails | ✅ Notified | ✅ Notified | ✅ Notified |

### Configuration

All three ways to set this up:

```bash
# CLI flags
--notify-min-risk high --notify-on-ac-fail

# Environment variables (works in CI)
IRA_NOTIFY_MIN_RISK=high
IRA_NOTIFY_ON_AC_FAIL=true

# Config file (.irarc.json)
{ "notifyMinRisk": "high", "notifyOnAcFail": true }
```

## PR risk visibility

IRA makes risk visible directly in your PR list so tech leads can prioritize without opening each PR.

### GitHub: risk labels

IRA applies color-coded labels to your PRs after each review:

| Label | Score | Color |
|---|---|---|
| `ira:critical` | 60 to 100 | 🔴 Red |
| `ira:high` | 40 to 59 | 🟠 Orange |
| `ira:medium` | 20 to 39 | 🟡 Yellow |
| `ira:low` | 0 to 19 | 🟢 Green |

Labels update automatically when risk changes. Filter your PR list with `label:ira:critical label:ira:high` to prioritize reviews.

### Bitbucket: build status

Bitbucket doesn't support PR labels, so IRA posts a **build status** on the PR commit instead. This shows as a status icon (✅ ❌ 🟡) in the PR list.

| Risk level | Build status | Icon in PR list |
|---|---|---|
| CRITICAL | FAILED | 🔴 Red X |
| HIGH | FAILED | 🔴 Red X |
| MEDIUM | INPROGRESS | 🟡 Yellow dot |
| LOW | SUCCESSFUL | 🟢 Green check |

Hover over the icon to see the full risk score. You can also configure Bitbucket branch permissions to **block merging** when the IRA Risk status is FAILED, preventing high-risk PRs from being merged without review.

## What IRA posts on your PR

**Inline comments** on the exact lines:

```
🔍 IRA Review - ai/security (CRITICAL)

> User input used directly in SQL query without sanitization.

Explanation: The username parameter is concatenated into a SQL string,
creating a SQL injection vector.

Impact: Attacker could execute arbitrary SQL and gain database control.

Suggested Fix: Use parameterized queries:
  db.query('SELECT * FROM users WHERE name = $1', [username])
```

**Summary comment** with risk score, issue breakdown, requirement completion (if JIRA is connected), and complexity hotspots (if Sonar is connected).

## Config file

Create `.irarc.json` in your project root to set defaults:

```json
{
  "scmProvider": "github",
  "githubRepo": "owner/repo",
  "aiModel": "gpt-4o-mini",
  "minSeverity": "MAJOR"
}
```

CLI flags override env vars, which override the config file. Tokens and keys are blocked from config files for security.

## Security

- Runs in your CI. Tokens never leave your infrastructure
- No telemetry, analytics, or tracking
- Config files block sensitive fields automatically
- Open source. Every line is auditable

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)
- A GitHub or Bitbucket repo with an open PR

## License

[AGPL-3.0](LICENSE). For commercial licensing, contact [patilmayur5572@gmail.com](mailto:patilmayur5572@gmail.com).

📖 **Full CLI reference:** Run `npx ira-review review --help`
