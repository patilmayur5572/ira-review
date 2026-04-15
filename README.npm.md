# ira-review

Review pull requests from your terminal. Get risk scores, inline comments, JIRA validation, and team rule enforcement before anyone else sees your code.

```bash
npx ira-review review --pr 42 --scm-provider github \
  --github-token "$GITHUB_TOKEN" --github-repo owner/repo \
  --ai-api-key "$OPENAI_API_KEY" --dry-run
```

No install required. Drop `--dry-run` to post comments directly on the PR. For Bitbucket, replace the GitHub flags with `--bitbucket-token` and `--repo`.

---

## What You Get

```
🔍 IRA — Scanning PR before your reviewers do

  ✓ Config loaded — AI-only mode, openai, PR #42
  ✓ Diff loaded — 4 files changed
  ✓ Review complete — 3 issues found

────────────────────────────────────────────────────────────
📄 src/routes/auth.ts:31
   Rule:     IRA/security (CRITICAL)
   Message:  User input passed directly to SQL query
   Explain:  The username parameter is concatenated into a SQL string,
             creating a SQL injection vector.
   Impact:   Attacker could execute arbitrary SQL and gain database control.
   Fix:      BEFORE: `db.query(`SELECT * FROM users WHERE name = ${username}`)`
             → AFTER: `db.query('SELECT * FROM users WHERE name = $1', [username])`

────────────────────────────────────────────────────────────
📄 src/middleware/cors.ts:8
   Rule:     IRA/error-handling (MAJOR)
   Message:  Empty catch block swallows CORS validation errors
   Explain:  fetch() failure in CORS preflight is caught and ignored,
             leaving the request in an undefined state.
   Impact:   Silent CORS failures in production with no logging.
   Fix:      BEFORE: `} catch {}`
             → AFTER: `} catch (err) { logger.error('CORS preflight failed', err); throw err; }`

# 🔍 IRA Review Summary

## 🟡 Risk: MEDIUM (38/100)

| Metric        | Value    |
|---------------|----------|
| Review mode   | AI-only  |
| Total issues  | 3        |
| Reviewed (AI) | 3        |
| Framework     | react    |

## ✅ Requirements: AUTH-234 — 83% Complete (5/6)

  ✅ OAuth2 login flow implemented with Google provider
  ✅ JWT tokens generated on successful authentication
  ✅ Refresh token rotation with 7-day expiry
  ❌ Input validation on login endpoint — no email format check
  ✅ Logout endpoint clears session and revokes token
  ✅ Rate limiting on login attempts

  ⚠️ Edge Cases Not Covered
  - What happens when Google OAuth is unreachable?
  - Token refresh during concurrent requests?
```

Each issue is posted as an inline comment on the exact PR line with explanation, impact, and a minimal BEFORE → AFTER fix.

**Features:**

- Evidence-based reviews — 7 categories (security, business logic, race conditions, data consistency, async, error handling, defensive coding), each with explicit false-positive exclusions. Issues without concrete evidence are filtered out.
- Risk scoring (0-100) with severity breakdown and PR labels
- Inline AI comments with explanation, impact, and minimal BEFORE → AFTER fix
- JIRA acceptance criteria validation with per-criterion pass/fail and edge case detection
- JIRA AC auto-detection — finds AC from custom field or description automatically
- Custom team review rules via `.ira-rules.json` (see below)
- Test case generation from JIRA tickets (Jest, Vitest, Playwright, etc.)
- Comment deduplication across re-runs
- Slack and Teams notifications with risk threshold filtering

---

## Custom Review Rules

Commit a `.ira-rules.json` to your repo root. Rules are injected into the AI prompt alongside the diff. No extra API calls, no separate pass.

```json
{
  "rules": [
    {
      "message": "Use parameterized queries for all SQL operations",
      "bad": "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
      "good": "db.query('SELECT * FROM users WHERE id = $1', [userId])",
      "severity": "CRITICAL",
      "paths": ["src/db/**", "src/api/**"]
    },
    {
      "message": "Never use console.log in production code",
      "bad": "console.log('User:', user);",
      "good": "logger.info('User created', { userId: user.id });",
      "severity": "MINOR"
    }
  ],
  "sensitiveAreas": [
    "src/services/payment/**",
    "**/auth/**",
    "src/config/database.*"
  ]
}
```

**Rules:**
- `message` + `severity` required. `bad`/`good` examples and `paths` are optional.
- Rules without `paths` apply to all files. Rules with `paths` match only those directories.
- Maximum 50 rules. Deterministic checks (naming, formatting) belong in ESLint.
- Invalid rules are skipped with a warning, not a crash.
- No license gating. Works in CLI, CI/CD, and VS Code extension.

**Sensitive Areas:**
- Files matching a sensitive area glob get extra scrutiny during review and Apply Fix.
- Labels are derived from the glob automatically (`src/services/payment/**` → "payment").
- Sensitive file findings get a higher weight in risk scoring.

---

## Use Cases

**Pre-push check (local dev):**
```bash
npx ira-review review --pr 42 --scm-provider github \
  --github-token "$GITHUB_TOKEN" --github-repo owner/repo \
  --ai-api-key "$OPENAI_API_KEY" --dry-run
```
Review in your terminal before pushing. Nothing gets posted.

**CI gate (GitHub Actions):**
```yaml
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

**CI gate (Bitbucket Pipelines):**
```yaml
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

---

## Add Integrations

All optional. IRA works with just an SCM token and an AI key.

| What you want | Flags to add |
|---|---|
| JIRA validation | `--jira-url` `--jira-email` `--jira-token` `--jira-ticket PROJ-123` |
| SonarQube enrichment | `--sonar-url` `--sonar-token` `--project-key my-project` |
| Test generation | `--generate-tests --test-framework vitest` |
| Slack notifications | `--slack-webhook https://hooks.slack.com/services/xxx` |
| Teams notifications | `--teams-webhook https://outlook.office.com/webhook/xxx` |
| Only notify on high risk | `--notify-min-risk high` |
| Use Anthropic | `--ai-provider anthropic` |
| Use Ollama (free, local) | `--ai-provider ollama` |

---

## Install

```bash
npx ira-review review --help       # no install needed
npm install -g ira-review           # or install globally
npm install --save-dev ira-review   # or add to your project
```

## Config File

Optional. Create `.irarc.json` in your project root:

```json
{
  "scmProvider": "github",
  "githubRepo": "owner/repo",
  "aiModel": "gpt-4o-mini",
  "minSeverity": "MAJOR"
}
```

CLI flags override env vars, which override the config file. Token fields are blocked from config files by design.

## Supported Providers

**SCM:** GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server/Data Center

**AI:** OpenAI (default), Azure OpenAI, Anthropic, Ollama (local, no key needed)

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)

## Security

Tokens are read from environment variables or CLI flags at runtime. Nothing is written to disk. Config files block token fields by design. No telemetry, no cloud service.

## License

[MIT](LICENSE)

---

[Full docs](https://github.com/patilmayur5572/ira-review) | [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode) | Support: patilmayur5572@gmail.com
