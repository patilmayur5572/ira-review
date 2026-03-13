# ira-review

**AI-powered PR reviews — with optional SonarQube integration.**

IRA runs standalone AI code reviews on your pull requests, or enhances SonarQube issues with AI-powered explanations, impact analysis, and suggested fixes. It scores PR risk, flags complex code, validates JIRA acceptance criteria, and posts a summary comment — with automatic comment deduplication on re-runs.

Works with **GitHub** and **Bitbucket** (Cloud & Server). Supports **any language** — Java, Python, Go, C#, TypeScript, and more.

## Install

**Run once with `npx` (no install needed):**
```bash
npx ira-review review --pr 42 --dry-run
```

**Install as a dev dependency (recommended for projects):**
```bash
npm install --save-dev ira-review
npx ira-review review --pr 42 --dry-run
```

**Install globally:**
```bash
npm install -g ira-review
ira-review review --pr 42 --dry-run
```

## Quick start

### Standalone AI review (no SonarQube)

```bash
export OPENAI_API_KEY=sk-xxxxx

npx ira-review review \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo \
  --pr 42 \
  --dry-run
```

### With SonarQube integration

```bash
npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --scm-provider bitbucket \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo \
  --pr 42
```

## Config file

Create `.irarc.json` or `ira.config.json` in your project root for **non-secret settings only**:

```json
{
  "sonarUrl": "https://sonarcloud.io",
  "projectKey": "my-org_my-project",
  "scmProvider": "github",
  "minSeverity": "MAJOR"
}
```

**⚠️ Never put tokens or API keys in config files.** All secrets should come from environment variables or CI/CD secrets. IRA doesn't store your credentials — that's the whole point.

CLI flags override config file values, which override environment variables.

## CLI reference

```
ira-review review [options]

Options:
  --sonar-url <url>          SonarQube/SonarCloud base URL (optional)
  --sonar-token <token>      Sonar API token
  --project-key <key>        Sonar project key
  --pr <id>                  Pull request ID
  --scm-provider <provider>  SCM provider: bitbucket or github (default: bitbucket)
  --bitbucket-token <token>  Bitbucket API token
  --repo <repo>              Bitbucket workspace/repo-slug
  --bitbucket-url <url>      Bitbucket Server base URL (self-hosted)
  --github-token <token>     GitHub API token
  --github-repo <repo>       GitHub owner/repo
  --github-url <url>         GitHub Enterprise base URL
  --ai-provider <provider>   AI provider (default: openai)
  --ai-model <model>         AI model (default: gpt-4o-mini)
  --min-severity <level>     Minimum severity: BLOCKER|CRITICAL|MAJOR|MINOR|INFO (default: CRITICAL)
  --dry-run                  Print to terminal instead of posting
  --slack-webhook <url>      Slack webhook URL for notifications
  --teams-webhook <url>      Teams webhook URL for notifications
  --jira-url <url>           JIRA base URL
  --jira-email <email>       JIRA account email
  --jira-token <token>       JIRA API token
  --jira-ticket <key>        JIRA ticket key (e.g. PROJ-123)
  --jira-ac-field <field>    Custom field ID for acceptance criteria
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (**required**) |
| `IRA_SONAR_URL` | SonarQube/SonarCloud URL (optional) |
| `IRA_SONAR_TOKEN` | Sonar API token |
| `IRA_PROJECT_KEY` | Sonar project key |
| `IRA_PR` | Pull request ID |
| `IRA_SCM_PROVIDER` | `bitbucket` or `github` |
| `IRA_BITBUCKET_TOKEN` | Bitbucket API token |
| `IRA_BITBUCKET_URL` | Bitbucket Server URL (self-hosted) |
| `IRA_REPO` | Bitbucket `workspace/repo-slug` |
| `IRA_GITHUB_TOKEN` | GitHub API token |
| `IRA_GITHUB_REPO` | GitHub `owner/repo` |
| `IRA_GITHUB_URL` | GitHub Enterprise base URL |
| `IRA_JIRA_URL` | JIRA base URL |
| `IRA_JIRA_EMAIL` | JIRA account email |
| `IRA_JIRA_TOKEN` | JIRA API token |
| `IRA_SLACK_WEBHOOK` | Slack webhook URL |
| `IRA_TEAMS_WEBHOOK` | Teams webhook URL |

## Programmatic usage

```typescript
import { ReviewEngine } from "ira-review";

const engine = new ReviewEngine({
  // SonarQube is optional — omit to run standalone AI review
  sonar: {
    baseUrl: "https://sonarcloud.io",
    token: "sqa_xxxxx",
    projectKey: "my-org_my-project",
  },
  scmProvider: "github",
  scm: {
    token: "ghp_xxxxx",
    owner: "my-org",
    repo: "my-repo",
  },
  ai: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
  },
  pullRequestId: "42",
  minSeverity: "MAJOR",
  dryRun: true,
});

const result = await engine.run();
console.log(`Risk: ${result.risk?.level}`);
```

## Requirements

- Node.js 18+
- OpenAI API key
- GitHub or Bitbucket repo with an open pull request
- SonarQube/SonarCloud *(optional — for Sonar-enhanced reviews)*

## License

MIT

---

📖 **Full documentation, architecture diagrams, and examples:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
