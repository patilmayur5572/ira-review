# ira-review

**AI-powered PR reviews with built-in JIRA intelligence.**

IRA picks up your SonarQube issues, sends them through AI, and posts clear comments on your pull request with an explanation, impact, and suggested fix. It also scores PR risk, flags complex code, and validates JIRA acceptance criteria.

Works with **any language** SonarQube can analyze — Java, Python, Go, C#, TypeScript, and more.

## Install

```bash
npm install ira-review
```

## Quick start

```bash
export OPENAI_API_KEY=sk-xxxxx

npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --dry-run
```

Post comments on a real PR:

```bash
npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo
```

## CLI reference

```
ira-review review [options]

Options:
  --sonar-url <url>          SonarQube base URL
  --sonar-token <token>      Sonar API token
  --project-key <key>        Sonar project key
  --pr <id>                  Pull request ID
  --bitbucket-token <token>  Bitbucket API token
  --repo <repo>              workspace/repo-slug
  --ai-provider <provider>   AI provider (default: openai)
  --ai-model <model>         AI model (default: gpt-4o-mini)
  --bitbucket-url <url>      Bitbucket base URL (self-hosted)
  --dry-run                  Print to terminal instead of posting
  --min-severity <level>     Minimum severity (BLOCKER|CRITICAL|MAJOR|MINOR|INFO)
  --jira-url <url>           JIRA base URL
  --jira-email <email>       JIRA account email
  --jira-token <token>       JIRA API token
  --jira-ticket <key>        JIRA ticket key (e.g. PROJ-123)
  --jira-ac-field <field>    Custom field ID for acceptance criteria
  --slack-webhook <url>      Slack webhook URL for notifications
  --teams-webhook <url>      Teams webhook URL for notifications
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (required) |
| `IRA_SONAR_URL` | SonarQube/SonarCloud URL |
| `IRA_SONAR_TOKEN` | Sonar API token |
| `IRA_PROJECT_KEY` | Sonar project key |
| `IRA_PR` | Pull request ID |
| `IRA_BITBUCKET_TOKEN` | Bitbucket API token |
| `IRA_BITBUCKET_URL` | Bitbucket Server URL (self-hosted only) |
| `IRA_REPO` | `workspace/repo-slug` format |
| `IRA_JIRA_URL` | JIRA base URL |
| `IRA_JIRA_EMAIL` | JIRA account email |
| `IRA_JIRA_TOKEN` | JIRA API token |
| `IRA_SLACK_WEBHOOK` | Slack webhook URL |
| `IRA_TEAMS_WEBHOOK` | Teams webhook URL |

## Programmatic usage

```typescript
import { ReviewEngine } from "ira-review";

const engine = new ReviewEngine({
  sonar: {
    baseUrl: "https://sonarcloud.io",
    token: "sqa_xxxxx",
    projectKey: "my-org_my-project",
  },
  scm: {
    token: "bb_xxxxx",
    workspace: "my-workspace",
    repoSlug: "my-repo",
  },
  ai: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
  },
  pullRequestId: "42",
  dryRun: true,
});

const result = await engine.run();
console.log(`Risk: ${result.risk?.level}`);
```

## Requirements

- Node.js 18+
- SonarQube or SonarCloud with PR analysis enabled
- OpenAI API key
- Bitbucket repo with an open pull request

## License

MIT

---

📖 **Full documentation, architecture diagrams, and examples:** [github.com/patilmayur5572/ira-review](https://github.com/patilmayur5572/ira-review)
