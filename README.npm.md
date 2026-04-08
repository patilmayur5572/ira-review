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
IRA: Found 3 issues (Risk: MEDIUM - 47/100)

src/routes/todos.ts
  [BLOCKER]  SQL injection risk - user input passed directly to query
  [MAJOR]    Missing database index on frequently queried column

src/middleware/auth.ts
  [CRITICAL] JWT secret hardcoded - move to environment variable

JIRA AC Validation (PROJ-1234):          # when --jira-ticket is provided
  [PASS] User can create a todo item
  [FAIL] Input is validated before save
  [PASS] Error returns 422 with details
```

Each issue is posted as an inline comment on the exact PR line with explanation, impact, and suggested fix.

**Features:**

- Risk scoring (0-100) with severity breakdown and PR labels
- Inline AI comments with explanation, impact, and suggested fix
- JIRA acceptance criteria validation with per-criterion pass/fail
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
      "severity": "CRITICAL",
      "paths": ["src/db/**", "src/api/**"]
    },
    {
      "message": "Never use console.log in production code",
      "bad": "console.log('User:', user);",
      "good": "logger.info('User created', { userId: user.id });",
      "severity": "MINOR"
    }
  ]
}
```

- `message` + `severity` required. `bad`/`good` examples and `paths` are optional.
- Rules without `paths` apply to all files. Rules with `paths` match only those directories.
- Maximum 30 rules. Deterministic checks (naming, formatting) belong in ESLint.
- Invalid rules are skipped with a warning, not a crash.
- No license gating. Works in CLI, CI/CD, and VS Code extension.

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

[Proprietary](LICENSE)

---

[Full docs](https://github.com/patilmayur5572/ira-review) | [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode) | Support: patilmayur5572@gmail.com
