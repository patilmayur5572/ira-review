# ira-review

**AI-powered PR reviews with optional SonarQube integration and built-in JIRA intelligence.**

We've all been there. Someone opens a PR, and now the team has to comb through it for bugs, security issues, complexity hotspots, and whether it actually meets the acceptance criteria. It's tedious and eats up review time.

IRA takes that off your plate. Point it at a pull request and it runs an AI-powered review — posting clear comments with explanations, impact assessments, and suggested fixes. If you have SonarQube or SonarCloud, IRA can pull in those issues too and enrich them with AI analysis. But Sonar isn't required. IRA works just fine in **standalone mode**, reviewing your PRs with AI alone.

On top of that, it scores the overall risk of your PR, flags complex code, checks your JIRA acceptance criteria, deduplicates comments across re-runs, and can send review summaries to Slack or Microsoft Teams.

## Language and framework support

IRA works with **any language**. In standalone mode, it reviews your PR using AI directly. When SonarQube is configured, it picks up the issues that Sonar already found and sends them to AI for explanation and fixes — so if Sonar can analyze your code, IRA can review it.

IRA itself is an npm package and needs Node.js to run, but your project doesn't have to be a JavaScript project. You just run IRA as a CLI tool in your pipeline, the same way you'd use any other linting or code quality tool.

### JavaScript and TypeScript projects

JS/TS projects get the most out of IRA. You can install it as a dev dependency and use the CLI or the programmatic API directly.

```bash
npm install --save-dev ira-review
npx ira-review review --pr 42 --dry-run
```

IRA also auto-detects your framework and tailors AI suggestions to match its conventions:

| Framework | How it's detected |
|---|---|
| React | `react` in `package.json` dependencies |
| Angular | `@angular/core` in `package.json` dependencies |
| Vue | `vue` in `package.json` dependencies |
| NestJS | `@nestjs/core` in `package.json` dependencies |
| Node.js | `package.json` exists (fallback) |

### Java, Kotlin, Scala, and other JVM projects

You don't need to touch your `pom.xml` or `build.gradle`. Just add a step in your CI that runs IRA using `npx`. Most CI runners already have Node.js installed.

```yaml
# GitHub Actions example
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx ira-review review --pr ${{ github.event.pull_request.number }} --scm-provider github --dry-run
```

### Python projects

Same idea. Just run IRA as a one-off command in your pipeline.

```yaml
# GitHub Actions example
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx ira-review review --pr ${{ github.event.pull_request.number }} --scm-provider github --dry-run
```

You can also add it to a Makefile if that's how your team works:

```makefile
review:
	npx ira-review review --pr $(PR) --dry-run
```

### Go, Rust, C#, PHP, Ruby, Swift, and everything else

It all works the same way. If Node.js is available in your CI environment (and it almost always is), just run:

```bash
npx ira-review review \
  --pr $PR_ID \
  --dry-run
```

Add `--sonar-url` and `--sonar-token` if you want SonarQube analysis included. Without them, IRA runs in standalone mode.

`npx` downloads and runs IRA on the fly, so there's nothing to install beforehand.

### No Node.js? Use Docker

If your CI environment doesn't have Node.js and you can't install it, you can run IRA through Docker:

```bash
docker run --rm node:20-slim npx ira-review review \
  --pr $PR_ID \
  --dry-run
```

## How it works

### With SonarQube

```mermaid
flowchart LR
    subgraph Your CI/CD Pipeline
        A[Developer pushes code] --> B[SonarQube analyzes PR]
        B --> C[IRA picks up issues]
    end
    subgraph IRA Review Engine
        C --> D[Filters by severity]
        D --> E[Detects framework]
        E --> F[AI generates reviews]
        F --> G[Calculates risk score]
    end
    G --> H[Posts comments on PR]
    G --> I[Validates JIRA AC]
    G --> J[Sends notifications]
```

### Standalone mode (no Sonar)

```mermaid
flowchart LR
    subgraph Your CI/CD Pipeline
        A[Developer pushes code] --> C[IRA reviews PR]
    end
    subgraph IRA Review Engine
        C --> E[Detects framework]
        E --> F[AI generates reviews]
        F --> G[Calculates risk score]
    end
    G --> H[Posts comments on PR]
    G --> I[Validates JIRA AC]
    G --> J[Sends notifications]
```

Here's the full flow in detail:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CI as CI/CD Pipeline
    participant Sonar as SonarQube (optional)
    participant IRA as IRA Review
    participant AI as OpenAI
    participant SCM as Bitbucket / GitHub
    participant JIRA as JIRA (optional)
    participant Notify as Slack / Teams (optional)

    Dev->>CI: Push code / Open PR
    opt SonarQube configured
        CI->>Sonar: Run static analysis
        Sonar-->>CI: Analysis complete
    end
    CI->>IRA: Run ira-review
    opt SonarQube configured
        IRA->>Sonar: Fetch PR issues (API)
        Sonar-->>IRA: Issues matching min severity
    end
    IRA->>AI: Send each issue for review
    AI-->>IRA: Explanation + Impact + Fix
    IRA->>IRA: Calculate risk score
    IRA->>IRA: Check for duplicate comments
    opt JIRA configured
        IRA->>JIRA: Fetch acceptance criteria
        JIRA-->>IRA: AC from ticket
        IRA->>AI: Validate AC against issues
        AI-->>IRA: Pass/Fail per criterion
    end
    IRA->>SCM: Post inline comments (deduplicated)
    IRA->>SCM: Post summary comment
    opt Notifications configured
        IRA->>Notify: Send review summary
    end
```

## What it does

1. Reviews your pull request using AI — with or without SonarQube issues
2. When SonarQube is configured, pulls issues and filters by minimum severity (default: CRITICAL and above)
3. Detects your framework (React, Angular, Vue, NestJS, Node) to give smarter suggestions
4. Sends each issue to AI for a plain-English explanation and a concrete fix
5. Calculates a risk score for the PR based on issues, security concerns, and complexity
6. Analyzes code complexity and highlights the hotspots
7. Validates JIRA acceptance criteria against the PR (if you've set up JIRA)
8. Deduplicates comments — re-runs skip issues that were already commented on
9. Posts a formatted summary comment with risk score, overview, and complexity hotspots
10. Posts inline comments back to your pull request on Bitbucket or GitHub
11. Sends review summaries to Slack and/or Microsoft Teams (if webhooks are configured)

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

### Standalone mode (no SonarQube)

The fastest way to try it out. This runs a pure AI review and prints everything to your terminal.

```bash
export OPENAI_API_KEY=[REDACTED:api-key]

npx ira-review review \
  --pr 42 \
  --dry-run
```

### With SonarQube

If you have SonarQube or SonarCloud, add your Sonar config to get issue-level analysis:

```bash
npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --dry-run
```

### Posting to Bitbucket

Once you're happy with how it works, drop the `--dry-run` flag and add your Bitbucket credentials to start posting comments on real PRs:

```bash
npx ira-review review \
  --pr 42 \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo
```

### Posting to GitHub

Use `--scm-provider github` to post comments on GitHub PRs:

```bash
npx ira-review review \
  --pr 42 \
  --scm-provider github \
  --github-token ghp_xxxxx \
  --github-repo owner/repo
```

## Config file

Instead of passing flags every time, you can create a `.irarc.json` or `ira.config.json` in your project root:

```json
{
  "sonarUrl": "https://sonarcloud.io",
  "sonarToken": "sqa_xxxxx",
  "projectKey": "my-org_my-project",
  "scmProvider": "github",
  "githubToken": "ghp_xxxxx",
  "githubRepo": "owner/repo",
  "minSeverity": "MAJOR",
  "slackWebhook": "https://hooks.slack.com/services/xxx/yyy/zzz",
  "dryRun": false
}
```

**Priority order:** CLI flags > config file > environment variables. So you can set your defaults in the config file and override them with flags when needed.

## PR risk scoring

Every review automatically calculates a risk score based on five factors:

| Factor | Max Points | What it measures |
|---|---|---|
| Blocker Issues | 30 | Number of blocker-level issues |
| Critical Issues | 20 | Number of critical-level issues |
| Issue Density | 15 | Issues per file changed |
| Security Concerns | 20 | Vulnerabilities, CWE/OWASP-tagged issues |
| Code Complexity | 15 | Files with cyclomatic/cognitive complexity > 15 |

Risk levels: **LOW** (0-19), **MEDIUM** (20-39), **HIGH** (40-59), **CRITICAL** (60+)

In dry-run mode you'll see something like:

```
═══════════════════════════════════════════════════
🟠 PR Risk Score: HIGH (45/100)
═══════════════════════════════════════════════════
   ▓ Blocker Issues: 20/30 - 2 blocker issues found
   ▓ Security Concerns: 10/20 - 1 security-related issue
   ▓ Code Complexity: 10/15 - 2 high-complexity files
   ▓ Critical Issues: 5/20 - 1 critical issue found
   ░ Issue Density: 0/15 - 0.5 issues per file changed
```

## Code complexity insights

IRA fetches complexity metrics from SonarQube's measures API (when configured) and flags the files that need attention:

- **Cyclomatic complexity** tells you how many paths exist through the code
- **Cognitive complexity** tells you how hard it is to understand
- **Lines of code** per file gives you a sense of scale

Any file with complexity above 15 gets flagged as a hotspot. This feeds into the risk score and shows up in dry-run output.

## Summary comments

IRA posts a formatted summary comment on every PR with:

- **Risk score** — the overall risk level with a breakdown of contributing factors
- **Overview** — a high-level summary of what the review found
- **Complexity hotspots** — files with high cyclomatic or cognitive complexity
- **JIRA AC results** — pass/fail status for each acceptance criterion (if JIRA is configured)

This gives reviewers a quick at-a-glance view without scrolling through individual inline comments.

## Comment deduplication

When you re-run IRA on the same PR (e.g., after pushing a fix), it checks existing comments and skips issues that were already commented on. No more duplicate comments cluttering your PR. This works automatically — no configuration needed.

## Slack and Teams notifications

Send review summaries to your team's channels by providing webhook URLs:

```bash
npx ira-review review \
  --pr 42 \
  --slack-webhook https://hooks.slack.com/services/xxx/yyy/zzz \
  --teams-webhook https://outlook.office.com/webhook/xxx
```

Both can be used at the same time. The notification includes the risk score, issue count, and a link back to the PR.

## JIRA acceptance criteria validation

If your team tracks acceptance criteria in JIRA, IRA can check whether a PR actually meets them. This is completely optional and only kicks in when you provide your JIRA config.

```bash
npx ira-review review \
  --pr 42 \
  --jira-url https://yourcompany.atlassian.net \
  --jira-email dev@company.com \
  --jira-token jira_xxxxx \
  --jira-ticket PROJ-123 \
  --dry-run
```

IRA fetches the JIRA ticket, pulls out the acceptance criteria, and uses AI to check each one against the review analysis. The output looks like:

```
✅ JIRA Acceptance: PROJ-123 - Add user authentication
   ✅ CRITERION_1: MET - Authentication endpoint implemented
      No blocker issues in auth module
   ❌ CRITERION_2: NOT_MET - Input validation
      Critical security issue found in login handler
```

If your team stores acceptance criteria in a custom field, just pass the field ID:

```bash
--jira-ac-field customfield_10042
```

The default field is `customfield_10035`.

## Using it in code

If you want more control, you can use IRA programmatically instead of the CLI:

```typescript
import { ReviewEngine } from "ira-review";

const engine = new ReviewEngine({
  // SonarQube is optional — omit to run in standalone mode
  sonar: {
    baseUrl: "https://sonarcloud.io",
    token: "sqa_xxxxx",
    projectKey: "my-org_my-project",
  },
  scmProvider: "github", // "bitbucket" (default) or "github"
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
  // Optional JIRA integration
  jira: {
    baseUrl: "https://yourcompany.atlassian.net",
    email: "dev@company.com",
    token: "jira_xxxxx",
  },
  jiraTicket: "PROJ-123",
  // Optional notifications
  notifications: {
    slackWebhookUrl: "https://hooks.slack.com/services/xxx/yyy/zzz",
    teamsWebhookUrl: "https://outlook.office.com/webhook/xxx",
  },
});

const result = await engine.run();

console.log(`Risk: ${result.risk?.level}`);
console.log(`Complexity hotspots: ${result.complexity?.hotspots.length}`);
console.log(`AC validation: ${result.acceptanceValidation?.overallPass}`);
```

If you just want to preview without posting anything, add `dryRun: true` to the config.

## Environment variables

If you're tired of passing flags every time, set these environment variables instead. CLI flags and config file values still take priority.

| Variable | What it does |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `IRA_SONAR_URL` | SonarQube/SonarCloud URL (optional) |
| `IRA_SONAR_TOKEN` | Sonar API token (optional) |
| `IRA_PROJECT_KEY` | Sonar project key (optional) |
| `IRA_PR` | Pull request ID |
| `IRA_SCM_PROVIDER` | `bitbucket` (default) or `github` |
| `IRA_BITBUCKET_TOKEN` | Bitbucket API token |
| `IRA_BITBUCKET_URL` | Bitbucket Server URL (only for self-hosted) |
| `IRA_REPO` | `workspace/repo-slug` format |
| `IRA_GITHUB_TOKEN` | GitHub API token |
| `IRA_GITHUB_REPO` | `owner/repo` format |
| `IRA_GITHUB_URL` | GitHub Enterprise URL (only for self-hosted) |
| `IRA_MIN_SEVERITY` | Minimum severity to include: `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO` (default: `CRITICAL`) |
| `IRA_SLACK_WEBHOOK` | Slack incoming webhook URL (optional) |
| `IRA_TEAMS_WEBHOOK` | Microsoft Teams webhook URL (optional) |
| `IRA_JIRA_URL` | JIRA base URL (optional) |
| `IRA_JIRA_EMAIL` | JIRA account email (optional) |
| `IRA_JIRA_TOKEN` | JIRA API token (optional) |

You can also copy `.env.example` to `.env` and fill in the values there.

## CI/CD examples

### Bitbucket Pipelines

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: AI Code Review
          script:
            - npx ira-review review --pr $BITBUCKET_PR_ID --repo $BITBUCKET_REPO_FULL_NAME
          environment:
            OPENAI_API_KEY: $OPENAI_API_KEY
            IRA_SONAR_URL: $SONAR_URL
            IRA_SONAR_TOKEN: $SONAR_TOKEN
            IRA_PROJECT_KEY: $SONAR_PROJECT_KEY
            IRA_BITBUCKET_TOKEN: $BB_TOKEN
```

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
            --github-repo ${{ github.repository }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          IRA_SONAR_URL: ${{ secrets.SONAR_URL }}
          IRA_SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          IRA_PROJECT_KEY: ${{ secrets.SONAR_PROJECT_KEY }}
```

Remove the `IRA_SONAR_*` variables to run in standalone mode without SonarQube.

All tokens come from your pipeline's secret variables. IRA never stores or transmits them anywhere else.

## What the comments look like

When IRA posts to your PR, each comment looks something like this:

```
🔍 IRA Review - typescript:S1854 (BLOCKER)

> Remove this useless assignment to local variable "data".

Explanation: The variable "data" is assigned a value that is never used
before being reassigned on line 15. This is dead code that adds confusion.

Impact: Dead code makes the codebase harder to read and maintain. It can
also mask real bugs if developers assume the assignment has a purpose.

Suggested Fix: Remove the assignment on line 10 entirely, or if the
variable is needed later, move the declaration to where it's first used.
```

## CLI reference

```
ira-review review [options]

Options:
  --sonar-url <url>          SonarQube base URL (optional — omit for standalone mode)
  --sonar-token <token>      Sonar API token
  --project-key <key>        Sonar project key
  --pr <id>                  Pull request ID
  --scm-provider <provider>  SCM provider: bitbucket (default) or github
  --bitbucket-token <token>  Bitbucket API token
  --bitbucket-url <url>      Bitbucket base URL (self-hosted)
  --repo <repo>              workspace/repo-slug (Bitbucket)
  --github-token <token>     GitHub API token
  --github-repo <repo>       owner/repo (GitHub)
  --github-url <url>         GitHub Enterprise base URL (self-hosted)
  --min-severity <level>     Minimum issue severity: BLOCKER, CRITICAL, MAJOR, MINOR, INFO (default: CRITICAL)
  --ai-provider <provider>   AI provider (default: openai)
  --ai-model <model>         AI model (default: gpt-4o-mini)
  --slack-webhook <url>      Slack incoming webhook URL for notifications
  --teams-webhook <url>      Microsoft Teams webhook URL for notifications
  --dry-run                  Print to terminal instead of posting
  --jira-url <url>           JIRA base URL
  --jira-email <email>       JIRA account email
  --jira-token <token>       JIRA API token
  --jira-ticket <key>        JIRA ticket key (e.g. PROJ-123)
  --jira-ac-field <field>    Custom field ID for acceptance criteria
```

## How it's built

```
src/
  core/
    sonarClient.ts           Sonar API client with pagination and retry
    issueProcessor.ts        Filters and groups issues by file
    reviewEngine.ts          Orchestrates the full review pipeline
    riskScorer.ts            Calculates PR risk score from 5 factors
    complexityAnalyzer.ts    Fetches and analyzes code complexity metrics
    acceptanceValidator.ts   Validates JIRA acceptance criteria using AI
    summaryBuilder.ts        Builds formatted summary comments for PRs
  ai/
    aiClient.ts              Pluggable AI provider (OpenAI for now)
    promptBuilder.ts         Builds structured prompts per issue
  scm/
    bitbucket.ts             Posts inline PR comments to Bitbucket
    github.ts                Posts inline PR comments to GitHub
    commentTracker.ts        Tracks existing comments for deduplication
  integrations/
    jiraClient.ts            JIRA REST API client
    notifier.ts              Sends review summaries to Slack and Teams
  frameworks/
    detector.ts              Auto-detects React, Angular, Vue, NestJS, Node
  utils/
    retry.ts                 Exponential backoff with jitter
    concurrency.ts           Caps parallel AI calls (default: 3)
    env.ts                   Resolves config from env vars and CLI flags
    configFile.ts            Loads .irarc.json or ira.config.json from project root
  types/
    config.ts                All config interfaces
    sonar.ts                 Sonar API types
    review.ts                Review result types and provider interfaces
    risk.ts                  Risk scoring and complexity types
    jira.ts                  JIRA and acceptance criteria types
```

## Built-in reliability

All external API calls to Sonar, OpenAI, Bitbucket, GitHub, and JIRA automatically retry up to 3 times with exponential backoff. AI calls run with a concurrency limit of 3 so you don't hit rate limits. If something optional like complexity analysis, JIRA validation, or notifications fails, the review still completes and the failure shows up as a warning instead of crashing the whole run. You don't need to configure any of this.

## Security

Your tokens are safe.

- IRA runs on your servers, not ours. It's just an npm package. When it runs in your CI/CD pipeline, your tokens stay in your infrastructure. The package author has zero access to them.
- The code is fully open source. Every line is auditable. Tokens are only used in `Authorization` headers to APIs you already own.
- Only compiled code ships to npm. No source files, no config, no secrets. Just the `dist/` folder.
- There's no telemetry, no analytics, and no tracking. The only network calls IRA makes are to the APIs you explicitly configure: Sonar, OpenAI, Bitbucket/GitHub, and optionally JIRA, Slack, and Teams.

Think of it like ESLint or the AWS CLI. You install it, give it your credentials at runtime, and it does its job. Nobody else sees your data.

## Development

```bash
npm install          # install deps
npm run typecheck    # type check
npm test             # run all tests
npm run test:watch   # watch mode
npm run build        # build ESM + CJS + types
```

## Requirements

- Node.js 18+
- An OpenAI API key (pay-per-use, not free tier)
- A Bitbucket or GitHub repo with an open pull request
- SonarQube or SonarCloud project with PR analysis enabled (optional — IRA works without it)
- JIRA Cloud instance for acceptance criteria validation (optional)
- Slack/Teams webhook URLs for notifications (optional)

## License

MIT
