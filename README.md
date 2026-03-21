# IRA — AI-Powered Code Reviews for Pull Requests

IRA (Intelligent Review Assistant) reviews your pull requests using AI. It posts inline comments with explanations, impact assessments, and suggested fixes — directly on your PR.

**Works with any language.** Supports GitHub and Bitbucket (Cloud & Server).

## Two review modes

1. **AI-only** — IRA reads your PR diff and finds bugs, security issues, and performance problems.
2. **Sonar + AI** — IRA pulls your SonarQube issues and enriches each one with AI explanations and fixes.

## Try it now

```bash
export IRA_AI_API_KEY=your-key-here

npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo \
  --dry-run
```

Drop `--dry-run` to post comments on the PR.

## Install

```bash
npx ira-review review --pr 42 --dry-run   # no install needed
npm install -g ira-review                   # or install globally
npm install --save-dev ira-review           # or add to your project
```

## Quick start

### AI-only review (GitHub)

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo
```

### Sonar + AI review (Bitbucket)

```bash
npx ira-review review \
  --pr 42 \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo
```

## Choose your AI provider

| Provider | Flag | Notes |
|---|---|---|
| **OpenAI** (default) | `--ai-provider openai` | Set `IRA_AI_API_KEY` |
| **Azure OpenAI** | `--ai-provider azure-openai` | Also needs `--ai-base-url` and `--ai-deployment` |
| **Anthropic** | `--ai-provider anthropic` | Set `IRA_AI_API_KEY` |
| **Google Gemini** | `--ai-provider gemini` | Set `IRA_AI_API_KEY` |
| **Ollama** (local) | `--ai-provider ollama` | No API key needed |

> **Tip:** Use `--ai-model-critical gpt-4o` to send high-severity issues to a stronger model while keeping costs low.

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
      - run: npx ira-review review
             --pr ${{ github.event.pull_request.number }}
             --scm-provider github
             --github-token ${{ secrets.GITHUB_TOKEN }}
             --github-repo ${{ github.repository }}
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

> **Note:** Use `--no-config-file` in CI pipelines that run on untrusted PRs (forks, external contributors).

## Optional integrations

| Integration | What it does | Key flags |
|---|---|---|
| **SonarQube** | Enriches Sonar issues with AI analysis | `--sonar-url`, `--sonar-token`, `--project-key` |
| **JIRA** | Validates PR against acceptance criteria | `--jira-url`, `--jira-email`, `--jira-token`, `--jira-ticket` |
| **Slack** | Sends review summary to a channel | `--slack-webhook` |
| **Teams** | Sends review summary to a channel | `--teams-webhook` |

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

## What IRA posts

- **Inline comments** on the exact lines with explanation, impact, and suggested fix.
- **Summary comment** with a risk score (0–100), issue breakdown, and complexity hotspots.

## Security

- Runs in your CI — tokens never leave your infrastructure
- No telemetry, analytics, or tracking
- Config files block sensitive fields automatically
- Open source — every line is auditable

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)
- A GitHub or Bitbucket repo with an open PR

## License

[AGPL-3.0](LICENSE) — For commercial licensing, contact [patilmayur5572@gmail.com](mailto:patilmayur5572@gmail.com).

---

📖 **Full CLI reference:** Run `npx ira-review review --help`
