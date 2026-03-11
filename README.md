# ira-review

Your PRs get flagged by SonarQube. Then someone has to go read each issue, figure out what it means, and decide how to fix it. That takes time.

**ira-review** does that for you. It pulls your SonarQube issues, runs them through AI, and posts clear, actionable comments right on your pull request. Explanation, impact, suggested fix. Done.

It also scores the overall risk of your PR, highlights complex code, and can validate JIRA acceptance criteria automatically.

## What it does

1. Fetches issues from SonarQube/SonarCloud for a specific PR
2. Filters down to what matters (BLOCKER and CRITICAL only)
3. Detects your framework (React, Angular, Vue, NestJS, Node) for smarter suggestions
4. Sends each issue to AI for a human-readable explanation and fix
5. Calculates a PR risk score based on issues, security concerns, and complexity
6. Analyzes code complexity and flags hotspots
7. Validates JIRA acceptance criteria against the PR (optional)
8. Posts inline comments back to your PR on Bitbucket

## Install

```bash
npm install ira-review
```

## Quick start

The fastest way to try it out. This runs against real Sonar data but prints results to your terminal instead of posting to Bitbucket. No Bitbucket token needed.

```bash
export OPENAI_API_KEY=sk-xxxxx

npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --dry-run
```

When you're ready to post comments to a real PR:

```bash
npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --bitbucket-token bb_xxxxx \
  --repo my-workspace/my-repo
```

## PR Risk Scoring

Every review automatically calculates a risk score based on five factors:

| Factor | Max Points | What it measures |
|---|---|---|
| Blocker Issues | 30 | Number of blocker-level issues |
| Critical Issues | 20 | Number of critical-level issues |
| Issue Density | 15 | Issues per file changed |
| Security Concerns | 20 | Vulnerabilities, CWE/OWASP-tagged issues |
| Code Complexity | 15 | Files with cyclomatic/cognitive complexity > 15 |

Risk levels: **LOW** (0-19), **MEDIUM** (20-39), **HIGH** (40-59), **CRITICAL** (60+)

In dry-run mode you'll see output like:

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

## Code Complexity Insights

ira-review fetches complexity metrics from SonarQube's measures API and flags hotspots:

- **Cyclomatic complexity** (how many paths through the code)
- **Cognitive complexity** (how hard it is to understand)
- **Lines of code** per file

Files with complexity > 15 are flagged as hotspots. This feeds into the risk score and shows up in dry-run output.

## JIRA Acceptance Criteria Validation

Connect your JIRA to validate whether a PR meets its ticket's acceptance criteria. This is optional and only runs when you provide JIRA config.

```bash
npx ira-review review \
  --sonar-url https://sonarcloud.io \
  --sonar-token sqa_xxxxx \
  --project-key my-org_my-project \
  --pr 42 \
  --jira-url https://yourcompany.atlassian.net \
  --jira-email dev@company.com \
  --jira-token jira_xxxxx \
  --jira-ticket PROJ-123 \
  --dry-run
```

It fetches the JIRA ticket, extracts the acceptance criteria, and uses AI to check each criterion against the SonarQube analysis. Output looks like:

```
✅ JIRA Acceptance: PROJ-123 - Add user authentication
   ✅ CRITERION_1: MET - Authentication endpoint implemented
      No blocker issues in auth module
   ❌ CRITERION_2: NOT_MET - Input validation
      Critical security issue found in login handler
```

If your team uses a custom field for acceptance criteria, pass the field ID:

```bash
--jira-ac-field customfield_10042
```

Default field is `customfield_10035`.

## Use it in code

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
  // Optional: JIRA integration
  jira: {
    baseUrl: "https://yourcompany.atlassian.net",
    email: "dev@company.com",
    token: "jira_xxxxx",
  },
  jiraTicket: "PROJ-123",
});

const result = await engine.run();

console.log(`Risk: ${result.risk?.level}`);
console.log(`Complexity hotspots: ${result.complexity?.hotspots.length}`);
console.log(`AC validation: ${result.acceptanceValidation?.overallPass}`);
```

Want to preview without posting? Add `dryRun: true` to the config.

## Environment variables

Tired of passing flags every time? Set these instead. CLI flags still override them if you pass both.

| Variable | What it does |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `IRA_SONAR_URL` | SonarQube/SonarCloud URL |
| `IRA_SONAR_TOKEN` | Sonar API token |
| `IRA_PROJECT_KEY` | Sonar project key |
| `IRA_PR` | Pull request ID |
| `IRA_BITBUCKET_TOKEN` | Bitbucket API token |
| `IRA_BITBUCKET_URL` | Bitbucket Server URL (only for self-hosted) |
| `IRA_REPO` | `workspace/repo-slug` format |
| `IRA_JIRA_URL` | JIRA base URL (optional) |
| `IRA_JIRA_EMAIL` | JIRA account email (optional) |
| `IRA_JIRA_TOKEN` | JIRA API token (optional) |

Copy `.env.example` to `.env` and fill it in.

## CI/CD example

Here's how you'd wire it into a Bitbucket Pipeline:

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

All tokens come from your pipeline's secret variables. The package never sees or stores them.

## What comments look like

When ira-review posts to your PR, each comment looks like this:

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
    reviewEngine.ts          Orchestrates the full pipeline
    riskScorer.ts            Calculates PR risk score from 5 factors
    complexityAnalyzer.ts    Fetches and analyzes code complexity metrics
    acceptanceValidator.ts   Validates JIRA AC using AI
  ai/
    aiClient.ts              Pluggable AI provider (OpenAI today)
    promptBuilder.ts         Builds structured prompts per issue
  scm/
    bitbucket.ts             Posts inline PR comments
  integrations/
    jiraClient.ts            JIRA REST API client
  frameworks/
    detector.ts              Auto-detects React, Angular, Vue, NestJS, Node
  utils/
    retry.ts                 Exponential backoff with jitter
    concurrency.ts           Caps parallel AI calls (default: 3)
    env.ts                   Resolves config from env vars + CLI flags
  types/
    config.ts                All config interfaces
    sonar.ts                 Sonar API types
    review.ts                Review result types and provider interfaces
    risk.ts                  Risk scoring and complexity types
    jira.ts                  JIRA and acceptance criteria types
```

## Built-in reliability

Every external API call (Sonar, OpenAI, Bitbucket, JIRA) automatically retries up to 3 times with exponential backoff. AI calls run with a concurrency limit of 3 to avoid hitting rate limits. Complexity analysis is fault-tolerant and won't block the review if the measures API is unavailable. You don't need to configure any of this.

## Security

Your tokens are safe. Here's why:

- **ira-review runs on your servers, not ours.** It's just an npm package. When it runs in your CI/CD pipeline, tokens live in your infrastructure. The package author has zero access.
- **The code is open source.** Every line is auditable. Tokens are only used in `Authorization` headers to APIs you already own.
- **Only compiled code ships to npm.** No source files, no config, no secrets. Just the `dist/` folder.
- **No telemetry. No analytics. No tracking.** The only network calls are the APIs you explicitly configure: Sonar, OpenAI, Bitbucket, and optionally JIRA.

Think of it like any CLI tool (ESLint, AWS CLI, Docker). You install it, you give it your credentials at runtime, it does its job. The author never sees your data.

## Development

```bash
npm install          # install deps
npm run typecheck    # type check
npm test             # run all 64 tests
npm run test:watch   # watch mode
npm run build        # build ESM + CJS + types
```

## Requirements

- Node.js 18+
- A SonarQube or SonarCloud project with PR analysis enabled
- An OpenAI API key (pay-per-use, not free)
- A Bitbucket repo with an open PR
- (Optional) JIRA Cloud instance for acceptance criteria validation

## License

MIT
