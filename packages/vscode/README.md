# Know If Your PR Will Be Rejected - Before You Push

Every team has the same problem. PRs go up, reviewers leave 12 comments, half of them are things the author already knew but forgot. The PR goes back, gets reworked, re-reviewed, and everyone loses a day.

**IRA is your first reviewer before humans get involved.** It reviews the full PR diff, gives you a risk score, and shows every issue inline in your editor before you push.

For individual devs: fewer rejections, faster approvals. For tech leads: fewer review rounds, less time spent on obvious catches.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ira-review.ira-review-vscode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode)

```
IRA: Found 3 issues (Risk: MEDIUM - 47/100)

src/routes/todos.ts
  [BLOCKER] SQL injection risk - user input passed directly to query
  [MAJOR]   Missing database index on frequently queried column

src/middleware/auth.ts
  [CRITICAL] JWT secret hardcoded - move to environment variable

JIRA AC Validation (PROJ-1234):
  AC 1: User can create a todo item        COVERED
  AC 2: Input is validated before save      NOT COVERED
  AC 3: Error returns 422 with details      COVERED
```

---

## The Feature No Other Extension Has: JIRA Ticket vs PR Validation

Your reviewer opens the PR and asks: "Does this actually cover AC #3?"

IRA answers that before they have to ask. It pulls the JIRA ticket from your branch name, reads the acceptance criteria, diffs them against your code changes, and tells you exactly which ACs are covered and which are not.

No other VS Code extension, no CI bot, and no AI tool does this. This alone saves entire review rounds.

![IRA inline diagnostics and TreeView](docs/images/vscode-review-diagnostics.png)

---

## What IRA Does

1. **Catches bugs that linters miss** - security issues, logic gaps, and edge cases across your entire PR diff
2. **Enforces your team's rules** - commit a `.ira-rules.json` and IRA checks every PR against your standards automatically
3. **Validates your code against the JIRA ticket** - checks whether your changes actually satisfy the acceptance criteria
4. **Scores the risk** (0-100) so you know if your PR is safe to submit or needs more work
5. **Shows issues inline in your editor** - squiggly lines, CodeLens, and sidebar panel, exactly like TypeScript errors
6. **Generates PR descriptions** from your diff and JIRA context so your PRs stop showing up with one-line descriptions

All of this runs locally. Your code never leaves your machine.

---

## What Changes When You Use IRA

**Before IRA:**
- Push PR, wait 2 days for review
- Get 12 comments, half of them are things you already knew but forgot
- Reviewer asks "does this match the AC?" and you scramble to re-read the ticket
- Rework, re-push, wait again
- Repeat until everyone is annoyed

**After IRA:**
- Run `IRA: Review Current PR` before pushing
- Fix the 3 issues IRA found in 10 minutes
- PR description is already written, JIRA ACs are validated
- Reviewer sees a clean PR, leaves one minor comment, approves
- You look like you have your act together

The difference is not the tool. The difference is that your reviewer sees a PR that has already been reviewed.

---

## "I Already Have GitHub Copilot. Why Do I Need This?"

Copilot helps you write code. IRA tells you if that code will survive review.

| | Copilot | IRA |
|---|---|---|
| **Job** | Write code faster | Review code before humans do |
| **When** | While you type | After you finish, before you push |
| **Scope** | Current line/function | Entire PR diff across all files |
| **JIRA awareness** | None | Validates code against acceptance criteria |
| **Risk scoring** | None | 0-100 risk score with breakdown |
| **SonarQube** | None | Enriches reviews with static analysis data |
| **Output** | Code suggestions | Inline diagnostics, CodeLens, risk badge |

They are complementary. Use Copilot to write. Use IRA to review. IRA uses your existing Copilot subscription as its default AI backend, so there is nothing extra to configure.

---

## Quick Start (under 60 seconds)

1. Install IRA from the VS Code Marketplace
2. Open a project with a GitHub or Bitbucket remote
3. `Cmd+Shift+P` > `IRA: Review Current PR`
4. Pick "I have a PR number" or "No PR yet (review local changes)"
5. Issues appear inline in your editor

That is it. If you have GitHub Copilot, IRA uses it automatically. No API keys, no config files, no setup wizard. No PR? No problem - IRA diffs your local changes against the default branch.

**Bitbucket?** IRA auto-detects it from your git remote. It will ask for your token once and store it in the OS keychain.

**SonarQube or JIRA?** Optional. Set the URL in settings, and IRA prompts for the token on first use. Stored securely, never in plaintext.

---

## Custom Review Rules

Your team has standards that no linter enforces. "Always use parameterized queries." "Never log PII." "API routes must validate request bodies." These rules exist in a wiki somewhere, and every reviewer checks for them manually.

Put them in `.ira-rules.json` at your repo root. IRA enforces them on every review.

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
      "severity": "MINOR"
    }
  ]
}
```

Run `IRA: Init Rules File` from the command palette to scaffold one. IRA ships a JSON Schema, so you get autocomplete and validation as you edit. Rules are scoped by `paths` (optional), capped at 30 per file, and enforced in every review surface with no license gating.

### Sensitive Areas

Mark critical parts of your codebase so IRA reviews them with extra scrutiny:

```json
{
  "rules": [],
  "sensitiveAreas": [
    "src/services/payment/**",
    "**/auth/**"
  ]
}
```

When a reviewed file matches a sensitive path, the AI applies deeper analysis and the risk score is amplified. Issues in sensitive code weigh heavier because the blast radius is bigger. A 🔒 badge shows in the output so reviewers know which files need extra attention.

---

## Where IRA Pays for Itself

**Friday PR, Monday surprise.** You push before the weekend. Monday morning there are 14 comments. IRA catches 11 of those before you push. The other 3 are style opinions. You cannot automate taste, but you can automate catching a missing null check.

**The PR that broke production.** A SQL query was vulnerable, and the review missed it. IRA flags injection risks, hardcoded secrets, missing input validation, and auth bypasses. It catches what the review checklist was supposed to catch.

**3 rounds of review per PR.** Junior devs submit PRs that bounce back repeatedly. Give them IRA. The obvious issues get caught before they reach your desk.

---

## Security

| Secret | Storage |
|---|---|
| GitHub / GHE token | VS Code OAuth, stored in OS keychain (same as Copilot) |
| Bitbucket token | Prompted once via masked input, stored in OS keychain |
| SonarQube token | OS keychain via SecretStorage |
| JIRA token | OS keychain via SecretStorage |
| AI API key | OS keychain via SecretStorage |

No tokens in plaintext `settings.json`. GitHub tokens auto-refresh and IRA invalidates stale sessions automatically. `IRA: Sign Out` wipes all secrets from the keychain in one command. No cloud service, no telemetry, no token forwarding. Everything runs locally.

---

## Commands

All commands are available via `Cmd+Shift+P` (or `Ctrl+Shift+P` on Windows/Linux).

| Command | What it does |
|---|---|
| `IRA: Review Current PR` | Review all changed files in a pull request, or review local changes without a PR |
| `IRA: Review Current File` | Review the active editor file |
| `IRA: Generate PR Description` | Generate a PR description from the diff and JIRA context |
| `IRA: Generate Tests` | Generate test cases from JIRA acceptance criteria |
| `IRA: Init Rules File` | Scaffold a `.ira-rules.json` in the workspace root |
| `IRA: Validate JIRA AC` | Validate local changes against JIRA acceptance criteria (no PR needed) |
| `IRA: Show Risk Score` | Calculate and display the risk score for the current file |
| `IRA: Sign In (GitHub / Bitbucket)` | Authenticate with your SCM provider |
| `IRA: Sign Out` | Clear all stored credentials from the OS keychain |
| `IRA: Configure` | Open IRA settings |
| `IRA: Activate Pro License` | Enter a Pro license key |

---

## Under the Hood

- **AI Providers:** GitHub Copilot (default, zero config), OpenAI, Azure OpenAI, Anthropic, Ollama (fully local)
- **SCM Providers:** GitHub, GitHub Enterprise, Bitbucket Cloud, Bitbucket Server/Data Center
- **JIRA:** Cloud (Atlassian-hosted) and Server/Data Center (self-hosted) with auto-detection
- **Integrations:** SonarQube (static analysis enrichment), JIRA (acceptance criteria validation), Slack and Teams (review notifications)

---

## Free vs Pro

| Feature | Free | Pro ($10/mo) |
|---|:---:|:---:|
| PR Reviews + File Reviews | Yes | Yes |
| Copilot AI (zero config) | Yes | Yes |
| OpenAI / Anthropic / Ollama | Yes | Yes |
| Inline Diagnostics + CodeLens | Yes | Yes |
| TreeView + Risk Score | Yes | Yes |
| Custom Review Rules | Yes | Yes |
| SonarQube Integration | Yes | Yes |
| JIRA AC Validation | Yes | Yes |
| Test Case Generation | Yes | Yes |
| PR Description Generation | Yes | Yes |
| Slack / Teams Notifications | Yes | Yes |
| Comment Deduplication | Yes | Yes |
| Auto-review on Save | - | Yes |
| One-click Apply Fix | - | Yes |
| Review History + Trends | - | Yes |

---

## Links

- [npm package](https://www.npmjs.com/package/ira-review) (CLI + CI integration)
- [GitHub](https://github.com/patilmayur5572/ira-review) (docs, setup guides, CI examples)
- Support: patilmayur5572@gmail.com
