# IRA — AI-Powered Code Reviews for Pull Requests

IRA reviews your pull requests using AI and posts inline comments with explanations, impact assessments, and suggested fixes.

**Works with any language.** Supports GitHub and Bitbucket.

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

## Two review modes

1. **AI-only** — finds bugs, security issues, and performance problems in your PR diff.
2. **Sonar + AI** — pulls SonarQube issues and enriches them with AI explanations and fixes.

## AI providers

| Provider | Flag |
|---|---|
| **OpenAI** (default) | `--ai-provider openai` |
| **Azure OpenAI** | `--ai-provider azure-openai` |
| **Anthropic** | `--ai-provider anthropic` |
| **Google Gemini** | `--ai-provider gemini` |
| **Ollama** (local, no key) | `--ai-provider ollama` |

## Key features

- **Inline PR comments** with explanation, impact, and suggested fix
- **Risk scoring** (0–100) based on blockers, security, complexity, and more
- **Framework detection** — tailors suggestions for React, Angular, Vue, NestJS
- **Comment deduplication** — re-runs skip already-commented issues
- **Optional integrations** — SonarQube, JIRA, Slack, Microsoft Teams
- **CI-ready** — works with GitHub Actions, Bitbucket Pipelines, or any CI

## Quick GitHub Actions setup

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

- Runs in your CI — tokens never leave your infrastructure
- No telemetry, analytics, or tracking
- Open source — every line is auditable

## Requirements

- Node.js 18+
- An AI provider API key (or Ollama running locally)

## License

[AGPL-3.0](LICENSE) — For commercial licensing, contact [patilmayur5572@gmail.com](mailto:patilmayur5572@gmail.com).

---

📖 **Full docs & examples:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
