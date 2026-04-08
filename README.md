# IRA - Intelligent Review Assistant

![IRA Review](docs/images/hero-banner.png)

**AI-powered code reviews for your editor and CI pipeline. Privacy-first, runs locally. Zero plaintext secrets.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ira-review.ira-review-vscode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)
[![npm](https://img.shields.io/npm/v/ira-review?color=red)](https://www.npmjs.com/package/ira-review)

---

## 🔒 Security First - No Secret Ever Touches Disk in Plaintext

This is a core design principle, not an afterthought.

| Where | How secrets are stored | Details |
|---|---|---|
| **VS Code Extension** | OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) | GitHub uses VS Code OAuth. Bitbucket, Sonar, JIRA, and AI keys use SecretStorage |
| **CLI** | Environment variables | Read from `IRA_*` env vars at runtime. Never written to disk |
| **CI Pipelines** | Your CI secrets manager | GitHub Actions secrets, Jenkins credentials, HashiCorp Vault, Azure Key Vault |

**What this means for your team:**
- GitHub users authenticate with one click via VS Code OAuth. No tokens to copy or paste
- Bitbucket users enter their token once in a masked prompt. It goes straight to the OS keychain
- Copilot users need zero configuration. It uses the existing VS Code GitHub session
- `IRA: Sign Out` wipes all secrets from the keychain in one command
- Token refresh is automatic. IRA detects VS Code session changes and invalidates stale tokens
- No cloud service, no telemetry, no analytics. Code and tokens never leave your infrastructure

> **For your security team:** IRA is not a SaaS. It runs entirely on developer machines and CI runners. Tokens are used only to call APIs you already trust (GitHub, Bitbucket, SonarQube, JIRA, OpenAI). The authentication module is a single auditable file with full test coverage.

---

## What is IRA?

IRA reviews your pull requests using AI and posts inline comments with explanations, impact assessments, and suggested fixes directly on your PR.

**Works with any language.** Supports GitHub, GitHub Enterprise, Bitbucket Cloud, and Bitbucket Server/Data Center.

### Features

**Free:**
- AI-powered code review with inline PR comments
- Risk scoring (0-100) with auto-labeling on GitHub
- JIRA acceptance criteria validation with per-criterion pass/fail
- Test generation from JIRA tickets (8 frameworks)
- SonarQube issue enrichment with AI explanations
- Slack and Teams notifications with risk threshold filtering
- GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server
- OpenAI, Azure OpenAI, Anthropic, Ollama (local), GitHub Copilot

**Pro ($10/mo):**
- Auto-review on save
- One-click "Apply Fix" via CodeLens
- Review history with search
- Trends dashboard (issues over time, severity breakdown)

---

## Setup Guides

### VS Code Extension with GitHub

![IRA Sign In via Command Palette](docs/images/vscode-sign-in.png)

1. Install the extension: search **"IRA - AI Code Reviews"** in the Extensions panel, or run:
   ```bash
   code --install-extension ira-review.ira-review-vscode
   ```
2. Open a project with a GitHub remote
3. Run `IRA: Sign In` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Click "Sign in with GitHub" in the popup. VS Code handles the OAuth flow
5. Run `IRA: Review Current PR` and enter your PR number
6. Issues appear inline in your editor within seconds

![IRA inline diagnostics and TreeView](docs/images/vscode-review-diagnostics.png)

That's it. Copilot is the default AI provider, so no API key is needed.

**GitHub Enterprise:** Works the same way. If your org has not approved the VS Code OAuth app, fall back to a PAT via `ira.githubToken` in settings.

### VS Code Extension with Bitbucket

1. Install the extension from the VS Code Marketplace
2. Open a project with a Bitbucket remote
3. Run `IRA: Review Current PR` from the Command Palette
4. IRA auto-detects Bitbucket from your git remote URL
5. A masked input box appears: paste your Bitbucket access token (read-only scope)
6. The token is stored in the OS keychain. You will not be asked again
7. Issues appear inline in your editor within seconds

![Bitbucket token stored securely](docs/images/vscode-bitbucket-token.png)

**Bitbucket Server / Data Center:** Set `ira.bitbucketUrl` in settings to your server URL (e.g. `https://bitbucket.yourcompany.com`).

### VS Code Optional Integrations

All integrations are optional. IRA works with just GitHub/Bitbucket + Copilot out of the box.

**SonarQube:**
1. Set `ira.sonarUrl` to your SonarQube server URL in settings
2. Set `ira.sonarProjectKey` in settings
3. The Sonar token is stored securely in the OS keychain

**JIRA:**
1. Set `ira.jiraUrl` and `ira.jiraEmail` in settings
2. The JIRA token is stored securely in the OS keychain

**Alternative AI provider (OpenAI, Anthropic, Ollama):**
1. Change `ira.aiProvider` in settings to `openai`, `anthropic`, or `ollama`
2. The AI API key is stored securely in the OS keychain (not needed for Ollama)

### CLI with GitHub

![IRA CLI review output](docs/images/cli-review-output.png)

```bash
# Install (optional - you can use npx directly)
npm install -g ira-review

# Run a review
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token 'ghp_xxxxx' \
  --github-repo owner/repo \
  --ai-api-key 'sk-xxxxx' \
  --dry-run
```

Drop `--dry-run` to post comments directly on the PR.

**Add JIRA validation:**
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

**Add SonarQube:**
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

### CI with GitHub Actions

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

**Add JIRA + Sonar in CI:**
```yaml
      - run: |
          npx ira-review review \
            --pr ${{ github.event.pull_request.number }} \
            --scm-provider github \
            --github-token ${{ secrets.GITHUB_TOKEN }} \
            --github-repo ${{ github.repository }} \
            --sonar-url ${{ vars.SONAR_URL }} \
            --sonar-token ${{ secrets.SONAR_TOKEN }} \
            --project-key ${{ vars.SONAR_PROJECT_KEY }} \
            --jira-url ${{ vars.JIRA_URL }} \
            --jira-email ${{ vars.JIRA_EMAIL }} \
            --jira-token ${{ secrets.JIRA_TOKEN }} \
            --jira-ticket AUTH-234 \
            --no-config-file
        env:
          IRA_AI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

All tokens come from GitHub Actions secrets. Nothing is hardcoded.

### CI with Bitbucket Pipelines

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

---

## Example Output

**JIRA requirement tracking posted on your PR:**

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

**Inline comments on the exact lines:**

```
🔍 IRA Review - IRA/security (CRITICAL)

> User input used directly in SQL query without sanitization.

Explanation: The username parameter is concatenated into a SQL string,
creating a SQL injection vector.

Impact: Attacker could execute arbitrary SQL and gain database control.

Suggested Fix: Use parameterized queries:
  db.query('SELECT * FROM users WHERE name = $1', [username])
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
| **GitHub Copilot** (VS Code default) | `ira.aiProvider: copilot` | Zero config. Uses existing VS Code auth |
| **OpenAI** (CLI default) | `--ai-provider openai` | Pass key with `--ai-api-key` or set `IRA_AI_API_KEY` |
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

## What's New in v1.1.0

- 🔒 **Zero Plaintext Secrets** - all tokens now use OS-native keychain storage via VS Code SecretStorage
- 🔑 **OAuth Authentication** - sign in with GitHub via VS Code's built-in OAuth flow. No more PATs
- 🏢 **GitHub Enterprise OAuth** - full support for GHE instances
- 🔐 **Secure Token Storage** - Sonar, JIRA, AI API keys, and Bitbucket tokens all stored in OS keychain
- 🔄 **Token Refresh Awareness** - automatic cache invalidation on session changes
- ⚙️ **Centralized Auth** - unified authentication service with per-provider session caching
- ➕ **Sign In / Sign Out Commands** - dedicated commands for managing authentication
- ↩️ **PAT Fallback** - existing PAT workflows still work. OAuth is additive

---

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally, or GitHub Copilot for the VS Code extension)
- A GitHub or Bitbucket repo with an open PR

## Support

- Issues and feature requests: patilmayur5572@gmail.com
- CLI reference: `npx ira-review review --help`

## License

[Proprietary](LICENSE). See LICENSE file for details.
