# ira-review

**AI-powered PR reviews with optional SonarQube, JIRA, and Slack/Teams integration.**

Point IRA (Intelligent Review Assistant) at a pull request and it posts inline comments with explanations, impact assessments, and suggested fixes. Works in two modes:

- **AI-only** - reviews your PR diff directly, finds bugs, security issues, and performance problems
- **Sonar + AI** - pulls SonarQube issues and enriches them with AI analysis

Works with **any language** (Java, Python, Go, C#, TypeScript, and more). Supports **GitHub** and **Bitbucket** (Cloud & Server).

## Try it now

```bash
export IRA_AI_API_KEY=sk-xxxxx

npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo \
  --dry-run
```

Drop `--dry-run` to post comments directly on the PR.

## Install

```bash
npx ira-review review --pr 42 --dry-run          # run once, no install
npm install --save-dev ira-review                  # add to project
npm install -g ira-review                          # install globally
```

## Quick start

### AI-only review

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo
```

### Sonar + AI review

```bash
npx ira-review review \
  --pr 42 \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo
```

### AI providers

| Provider | Flag | Key required? |
|---|---|---|
| **OpenAI** (default) | `--ai-provider openai` | Yes |
| **Azure OpenAI** | `--ai-provider azure-openai` | Yes + `--ai-base-url`, `--ai-deployment` |
| **Anthropic** | `--ai-provider anthropic` | Yes |
| **Ollama** (local) | `--ai-provider ollama` | No |

Use `--ai-model-critical gpt-4o` to route BLOCKER/CRITICAL issues to a stronger model.

## GitHub Actions

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
      - run: npx ira-review review
             --pr ${{ github.event.pull_request.number }}
             --scm-provider github
             --github-token ${{ secrets.GITHUB_TOKEN }}
             --github-repo ${{ github.repository }}
             --no-config-file
        env:
          IRA_AI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## What it does

- **AI code review** - finds bugs, security issues, and performance problems in your PR diff
- **Risk scoring** - calculates a 0-100 risk score from 5 factors (blockers, criticals, density, security, complexity)
- **Framework detection** - auto-detects React, Angular, Vue, NestJS, Node and tailors suggestions
- **Comment deduplication** - re-runs skip already-commented issues (tracked by file + line + rule)
- **JIRA validation** - checks PR against JIRA acceptance criteria using AI
- **Notifications** - sends summaries to Slack and/or Microsoft Teams
- **Summary comment** - posts a formatted overview with risk score, issues, and complexity hotspots

## Config file

Create `.irarc.json` or `ira.config.json` for non-sensitive defaults:

```json
{
  "projectKey": "my-org_my-project",
  "scmProvider": "github",
  "githubRepo": "owner/repo",
  "aiModel": "gpt-4o-mini",
  "minSeverity": "MAJOR"
}
```

**Priority:** CLI flags > env vars > config file. Tokens, keys, URLs, and webhooks are **blocked** from config files for security. Use `--no-config-file` in CI with untrusted PRs.

## Environment variables

| Variable | Description |
|---|---|
| `IRA_AI_API_KEY` | AI API key (**required**, except Ollama). Also accepts `OPENAI_API_KEY` |
| `IRA_AI_BASE_URL` | AI base URL (Azure endpoint, Ollama URL) |
| `IRA_AI_API_VERSION` | Azure OpenAI API version |
| `IRA_AI_DEPLOYMENT_NAME` | Azure OpenAI deployment name |
| `IRA_PR` | Pull request ID |
| `IRA_SCM_PROVIDER` | `bitbucket` (default) or `github` |
| `IRA_BITBUCKET_TOKEN` | Bitbucket API token |
| `IRA_REPO` | Bitbucket `workspace/repo-slug` |
| `IRA_GITHUB_TOKEN` | GitHub API token |
| `IRA_GITHUB_REPO` | GitHub `owner/repo` |
| `IRA_MIN_SEVERITY` | Minimum severity (default: `CRITICAL`) |
| `IRA_SONAR_URL` | SonarQube URL *(optional)* |
| `IRA_SONAR_TOKEN` | Sonar API token *(optional)* |
| `IRA_PROJECT_KEY` | Sonar project key *(optional)* |
| `IRA_JIRA_URL` | JIRA base URL *(optional)* |
| `IRA_JIRA_EMAIL` | JIRA email *(optional)* |
| `IRA_JIRA_TOKEN` | JIRA API token *(optional)* |
| `IRA_JIRA_TICKET` | JIRA ticket key *(optional)* |
| `IRA_SLACK_WEBHOOK` | Slack webhook *(optional)* |
| `IRA_TEAMS_WEBHOOK` | Teams webhook *(optional)* |

## CLI reference

```
ira-review review [options]

Required:
  --pr <id>                    Pull request ID

SCM:
  --scm-provider <provider>    bitbucket (default) or github
  --bitbucket-token <token>    Bitbucket API token
  --repo <repo>                Bitbucket workspace/repo-slug
  --github-token <token>       GitHub API token
  --github-repo <repo>         GitHub owner/repo

AI:
  --ai-provider <provider>     openai (default), azure-openai, anthropic, ollama
  --ai-model <model>           AI model (default: gpt-4o-mini)
  --ai-model-critical <model>  Stronger model for BLOCKER/CRITICAL issues
  --ai-base-url <url>          AI provider base URL
  --ai-api-version <version>   Azure OpenAI API version
  --ai-deployment <name>       Azure OpenAI deployment name

SonarQube (optional):
  --sonar-url <url>            SonarQube/SonarCloud base URL
  --sonar-token <token>        Sonar API token
  --project-key <key>          Sonar project key

Review:
  --min-severity <level>       BLOCKER, CRITICAL (default), MAJOR, MINOR, INFO
  --dry-run                    Print to terminal instead of posting

JIRA (optional):
  --jira-url <url>             JIRA base URL
  --jira-email <email>         JIRA account email
  --jira-token <token>         JIRA API token
  --jira-ticket <key>          JIRA ticket key
  --jira-ac-field <field>      Custom field for acceptance criteria

Notifications (optional):
  --slack-webhook <url>        Slack webhook URL
  --teams-webhook <url>        Teams webhook URL

Config:
  --config <path>              Path to config file
  --no-config-file             Disable auto-loading config from repo
```

## Programmatic usage

```typescript
import { ReviewEngine } from "ira-review";

const engine = new ReviewEngine({
  scmProvider: "github",
  scm: { token: process.env.GITHUB_TOKEN!, owner: "my-org", repo: "my-repo" },
  ai: { provider: "openai", apiKey: process.env.IRA_AI_API_KEY! },
  pullRequestId: "42",
  dryRun: true,
});

const result = await engine.run();
console.log(`Risk: ${result.risk?.level} (${result.risk?.score}/${result.risk?.maxScore})`);
```

## Security

- Runs on your servers - tokens never leave your infrastructure
- No telemetry, analytics, or tracking
- Config files block sensitive fields automatically
- Prompt injection protection on all untrusted content
- Open source - every line auditable

## Requirements

- Node.js 18+
- AI provider API key (OpenAI, Azure OpenAI, Anthropic) or Ollama
- GitHub or Bitbucket repo with an open pull request

## License

AGPL-3.0 - see [LICENSE](LICENSE). For commercial licensing, contact [mayur@ira-review.dev](mailto:mayur@ira-review.dev).

---

📖 **Full docs, architecture diagrams, and examples:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
