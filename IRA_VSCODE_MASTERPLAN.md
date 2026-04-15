# IRA VS Code Extension — Master Plan

> **Mission:** Turn IRA from a CLI tool into a monetized VS Code extension that provides AI-powered code reviews inside the editor, covering 88%+ of the developer market with a single codebase.

> **Positioning:** The open-source CodeRabbit — works with your existing SonarQube + JIRA. Your code never leaves your machine.

---

## Table of Contents

1. [Positioning & Competitive Analysis](#1-positioning--competitive-analysis)
2. [Architecture Strategy](#2-architecture-strategy)
3. [Phased Roadmap](#3-phased-roadmap)
4. [Feature Tiers (Free vs Pro vs Team vs Enterprise)](#4-feature-tiers)
5. [Pricing Strategy](#5-pricing-strategy)
6. [Editor Support Strategy](#6-editor-support-strategy)
7. [Marketing & Sales Strategy](#7-marketing--sales-strategy)
8. [Publishing Guide](#8-publishing-guide)
9. [Financial Projections](#9-financial-projections)
10. [Tax & Legal (Australia)](#10-tax--legal-australia)
11. [License Protection](#11-license-protection)

---

## 1. Positioning & Competitive Analysis

### 1.1 One-line pitch

```
"The open-source CodeRabbit — works with your existing SonarQube + JIRA"
```

Why this works:
- Everyone searching for code review tools knows CodeRabbit → instant recognition
- "Open source" → trust + enterprise appeal
- "Works with existing stack" → no migration needed, plugs into what they already have

### 1.2 What IRA does that nobody else does

No single tool in the market combines these three things:

```
1. SonarQube issues + AI explanations in ONE review
   → SonarQube finds the issue, AI explains WHY and HOW to fix it
   → Nobody else does this

2. JIRA acceptance criteria → validated against actual code changes
   → "Did this PR actually implement what the ticket asked for?"
   → Nobody does this

3. Test case generation from JIRA tickets + code context
   → AI reads your JIRA AC + your diff → generates test cases
   → Nobody else connects JIRA → tests → code in one flow
```

### 1.3 Competitive landscape

| Feature | CodeRabbit | PR-Agent (Qodo) | Greptile | SonarQube | SonarLint | **IRA** |
|---|---|---|---|---|---|---|
| AI PR review | ✅ | ✅ | ✅ | ❌ (rules) | ❌ | ✅ |
| SonarQube + AI combined | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| JIRA AC validation | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| Requirement tracking | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| Test generation from JIRA | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| PR risk scoring | ❌ | ❌ | ❌ | ✅ (quality gate) | ❌ | ✅ |
| Self-hosted / local-first | ❌ (cloud) | ✅ | ❌ (cloud) | ✅ (server) | ✅ | ✅ |
| Open source | ❌ | ✅ (AGPL) | ❌ | Community only | Free | ✅ (AGPL) |
| Multi-LLM (OpenAI, Azure, Ollama) | ❌ | ✅ (buggy) | ❌ | ❌ | ❌ | ✅ |
| VS Code extension | ✅ | ❌ | ❌ | ✅ (SonarLint) | ✅ | ✅ (building) |
| Slack/Teams notifications | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Price** | **$12-24/user** | **Free/$19/user** | **$30/user** | **$0-490/mo** | **Free** | **Free + $10 Pro** |

### 1.4 Where competitors are better (be honest)

| Area | Who's better | Why |
|---|---|---|
| Codebase-wide context | CodeRabbit, Greptile | They build full code graphs; IRA reviews file-by-file |
| Auto-learning from feedback | CodeRabbit | Learns from 👍/👎 reactions |
| GitLab / Azure DevOps | PR-Agent | IRA only supports GitHub + Bitbucket |
| Scale / enterprise trust | SonarQube, CodeRabbit | NVIDIA uses CodeRabbit; Sonar has 20yr track record |
| Community size | PR-Agent (10.7K stars) | IRA is newer |

### 1.5 Four buyer personas

```
Persona 1 — The Google Searcher:
  Searches: "CodeRabbit alternative open source"
  Finds: IRA on VS Code Marketplace / GitHub / blog post
  Thinks: "Same thing but open source and $2/mo cheaper? Let me try"

Persona 2 — The SonarQube User:
  Has: SonarQube running in CI
  Problem: "Sonar finds issues but doesn't explain WHY or HOW to fix"
  Finds: IRA — "adds AI explanations to your Sonar issues"
  Thinks: "This plugs right into what I already have"

Persona 3 — The JIRA Team:
  Problem: "Nobody checks if the PR actually implements the JIRA ticket"
  Finds: IRA — "validates code against acceptance criteria"
  Thinks: "Wait, no other tool does this"

Persona 4 — The Privacy-Conscious:
  Problem: "CodeRabbit sees all our code on their servers"
  Finds: IRA — "open source, your code never leaves your machine"
  Thinks: "Finally, something my security team will approve"
```

---

## 2. Architecture Strategy

### 2.1 Monorepo Structure

```
ira-review/
├── packages/
│   ├── core/                    ← Current src/ (minus cli.ts)
│   │   ├── src/
│   │   │   ├── ai/             ← AI provider abstraction
│   │   │   ├── core/           ← ReviewEngine, RiskScorer, etc.
│   │   │   ├── frameworks/     ← Framework detection
│   │   │   ├── integrations/   ← JIRA, Notifier
│   │   │   ├── scm/            ← GitHub, Bitbucket clients
│   │   │   ├── types/          ← Shared types
│   │   │   ├── utils/          ← Retry, concurrency, config
│   │   │   └── index.ts        ← Public API (already exists)
│   │   ├── package.json        → "@ira-review/core"
│   │   └── tsconfig.json
│   │
│   ├── cli/                     ← CLI entry point only
│   │   ├── src/
│   │   │   └── cli.ts          ← Current cli.ts
│   │   ├── package.json        → "ira-review" (npm CLI — unchanged)
│   │   └── tsconfig.json
│   │
│   └── vscode/                  ← VS Code extension (NEW)
│       ├── src/
│       │   ├── extension.ts            ← Activate/deactivate
│       │   ├── commands/               ← Command handlers
│       │   │   ├── reviewPR.ts
│       │   │   ├── reviewFile.ts
│       │   │   ├── generateTests.ts
│       │   │   └── configureLicense.ts
│       │   ├── providers/              ← VS Code integration
│       │   │   ├── diagnosticsProvider.ts   ← Squiggly lines
│       │   │   ├── codeLensProvider.ts      ← Inline annotations
│       │   │   ├── treeViewProvider.ts      ← Sidebar panel
│       │   │   ├── statusBarProvider.ts     ← Risk badge
│       │   │   └── webviewProvider.ts       ← Dashboard
│       │   ├── services/               ← Extension-specific logic
│       │   │   ├── licenseManager.ts        ← License key validation
│       │   │   ├── reviewHistoryStore.ts    ← Local SQLite storage
│       │   │   ├── autoReviewer.ts          ← Review on save (Pro)
│       │   │   └── fixApplicator.ts         ← One-click fix (Pro)
│       │   └── webview/                ← Dashboard UI
│       │       ├── dashboard.html
│       │       ├── dashboard.js
│       │       └── dashboard.css
│       ├── resources/                  ← Icons, images
│       ├── package.json               → VS Code extension manifest
│       └── tsconfig.json
│
├── website/                     ← Pricing page (Phase 2)
│   ├── index.html              → ira-review.dev
│   └── pricing.html            → ira-review.dev/pricing
│
├── pnpm-workspace.yaml
├── package.json                 ← Root workspace config
├── LICENSE                      ← AGPL-3.0 (unchanged)
└── README.md
```

### 2.2 Local-First vs Backend — When to use what

```
Phase 1-3 (Month 1-4):  LOCAL-FIRST
  ├── All data stored on user's machine
  ├── VS Code globalState + local SQLite
  ├── No server needed except:
  │   ├── License key validation (1 serverless function)
  │   └── AI proxy for managed AI (optional)
  ├── Your infrastructure cost: ~$1/month
  └── User benefit: fast, offline, private

Phase 4+ (Month 5+):    ADD BACKEND (only when revenue > $3K/mo)
  ├── Supabase or PlanetScale database
  ├── Vercel serverless API
  ├── Used ONLY for Team features:
  │   ├── Team review aggregation
  │   ├── Shared team config
  │   └── Team dashboard
  ├── Your infrastructure cost: ~$50-100/month
  └── Individual Pro users still run local-first
```

**Rule: Never build backend infrastructure before you have paying customers to fund it.**

### 2.5 TODO — Bitbucket Server/Data Center support

The core `BitbucketClient` only supports **Bitbucket Cloud** API (`/repositories/workspace/repo/pullrequests/`). Bitbucket Server/Data Center uses a different API format (`/rest/api/1.0/projects/PROJECT/repos/repo/pull-requests/`).

| Variant | Copilot mode (extension) | Standard mode (core) | CLI |
|---|---|---|---|
| Bitbucket Cloud | ✅ | ✅ | ✅ |
| Bitbucket Server | ✅ (extension handles it) | ❌ TODO | ❌ TODO |
| Bitbucket Data Center | ✅ (same API as Server) | ❌ TODO | ❌ TODO |

**Action:** Add a `BitbucketServerClient` to `packages/core` that handles the Server/DC API format. This unblocks orgs using Bitbucket Server with OpenAI/Azure/Ollama (non-Copilot) providers.

### 2.3 Why local-first wins

| Factor | Local-first ✅ | Backend ❌ |
|---|---|---|
| Build time | 2-3 weeks | 6-8 weeks |
| Cost per user | $0 | $0.15-0.30/user |
| Privacy | Code never leaves user's machine | User's code sent to your server 😬 |
| Enterprise adoption | Easy (no data leaves org) | Blocked (security review needed) |
| Offline support | Works fully offline | Breaks without internet |
| Maintenance | Zero | 24/7 uptime, backups, monitoring |

### 2.4 Token / Auth UX — No admin needed

| Integration | CLI (today) | Extension (new) |
|---|---|---|
| GitHub | Pass `--github-token` every run | VS Code built-in auth (1 click "Allow") |
| Bitbucket | Pass `--bitbucket-token` | OAuth app (1 click "Sign in") |
| JIRA | Pass `--jira-token` | User creates own personal token (no admin needed) |
| AI (OpenAI) | Pass `--ai-api-key` | BYOK in settings OR VS Code LM API (zero config) |
| SonarQube | Pass `--sonar-token` | Optional, configured once in settings |

**Extension removes the "go ask your admin" problem entirely.**

---

## 3. Phased Roadmap

### Phase 1 — Foundation (Week 1-3) 🆓 FREE — $0 cost, $0 revenue

**Goal:** Publish a free extension, get 500+ installs, establish marketplace presence.

| Week | Task | Details |
|------|------|---------|
| **Week 1** | Monorepo restructure | Split into packages/core, packages/cli, packages/vscode. Ensure `npm publish` still works for CLI. |
| **Week 1** | Scaffold VS Code extension | Use `yo code` generator. Wire `@ira-review/core` as dependency. |
| **Week 2** | Core integration | Diagnostics provider (squiggly lines), CodeLens (inline annotations), Status bar (risk badge) |
| **Week 2** | Auth integration | Use `vscode.authentication.getSession('github')` for GitHub. OAuth for Bitbucket. No tokens needed from user. |
| **Week 2** | Settings | Map all CLI flags to `contributes.configuration` in package.json. User configures once in Settings. |
| **Week 3** | Sidebar + polish | Tree view for issues list. Icon design. Extension README with screenshots/GIFs. |
| **Week 3** | Test + publish | Test on VS Code, Cursor. Publish to VS Code Marketplace + Open VSX. |

**What ships:**
- ✅ Cmd+Shift+P → "IRA: Review Current PR" (manual trigger)
- ✅ Diagnostics (squiggly lines on flagged code)
- ✅ Sidebar tree view (list of all issues)
- ✅ Status bar risk badge
- ✅ GitHub built-in auth (no token needed)
- ✅ BYOK for AI (user's own key in settings)

**What's held back for Pro:**
- ❌ Auto-review on save
- ❌ One-click "Apply Fix"
- ❌ Review history
- ❌ Trends dashboard
- ❌ Custom rules
- ❌ Smart notifications

---

### Phase 2 — Pro Launch (Week 4-7) 💰 FIRST REVENUE

**Goal:** Launch Pro tier at $10/mo, get 50+ paying subscribers.

| Week | Task | Details |
|------|------|---------|
| **Week 4** | Buy domain | ira-review.dev (~$12/yr) — first and only expense |
| **Week 4** | LemonSqueezy setup | Create account, configure product ($10/mo, $100/yr), enable license key generation. |
| **Week 4** | License API | Deploy 1 serverless function on Vercel (free tier) to validate license keys. ~50 lines of code. |
| **Week 4** | LicenseManager in extension | `vscode.SecretStorage` to store key. Check on startup (1x/day). Soft upsell prompts for Pro features. |
| **Week 5** | Auto-review on save | `vscode.workspace.onDidSaveTextDocument` → run review → show diagnostics. Gated behind Pro license. |
| **Week 5** | One-click "Apply Fix" | CodeLens action → AI generates fix → shows diff preview → applies edit. Gated behind Pro. |
| **Week 6** | Local review history | Store every review result in VS Code `globalState` or local SQLite. Searchable, filterable. |
| **Week 6** | Trends dashboard | Webview panel showing charts: issues over time, risk per PR, top recurring issues. All rendered from local data. |
| **Week 7** | Pricing website | Simple landing page at ira-review.dev with pricing table + competitor comparison. |
| **Week 7** | Launch Pro | Announce on social media, update Marketplace listing. |

**Cost:** $12/yr (domain) + $1.00/sale (LemonSqueezy cut on $10)
**Revenue target:** $500-2,000/mo

**Upsell flow inside extension:**
```
User saves file → "💡 Enable auto-review? ⭐ Upgrade to Pro"
User clicks "Upgrade" → browser opens ira-review.dev/pricing
User pays on LemonSqueezy → gets license key via email
User: Cmd+Shift+P → "IRA: Activate License" → pastes key → Pro unlocked
```

---

### Phase 3 — Growth (Week 8-16) 📈 SCALE

**Goal:** 5,000+ installs, 200+ Pro subscribers, $2K+/mo revenue.

| Week | Task | Details |
|------|------|---------|
| **Week 8-9** | Content marketing | 4 blog posts (Dev.to, Medium, Hashnode). See Marketing Strategy section. |
| **Week 9** | Product Hunt launch | Prepare assets, launch on a Tuesday. |
| **Week 10** | Demo videos | 60-sec feature demo for Marketplace. 5-min deep dive for YouTube. |
| **Week 10-11** | Smart notifications | Slack/Teams webhook notifications for high-risk PRs. Pro feature. |
| **Week 11-12** | Custom rules engine | Allow users to define rules: "ignore test files", "strict mode on auth/". Pro feature. |
| **Week 12-14** | Iterate on feedback | Respond to every Marketplace review. Fix top issues. Add requested features. |
| **Week 14-16** | Localization | Extension in top 5 languages. |

**Cost:** $21/mo (domain + Vercel if needed)
**Revenue target:** $2,000-5,000/mo

---

### Phase 4 — Team + Enterprise (Month 5-8) 🏢 HIGH ARPU

**Goal:** Launch Team tier, close first Enterprise deals. **Only build backend here.**

| Month | Task | Details |
|-------|------|---------|
| **Month 5** | Build backend | Vercel + Supabase. Team review aggregation, shared config sync. |
| **Month 5** | Team dashboard | Web dashboard showing team-wide quality metrics, per-developer trends. |
| **Month 6** | Team tier launch | $8/user/mo (min 5 seats). Admin panel for seat management. |
| **Month 6-7** | Enterprise features | SSO/SAML, audit logs, custom AI deployment (Azure, Ollama), on-prem support. |
| **Month 7-8** | Enterprise outreach | Direct outreach to companies using IRA CLI in CI. Offer pilot programs. |
| **Month 8** | Commercial license | Offer AGPL exemption for enterprises embedding IRA. Custom pricing. |

**Cost:** $50-150/mo (backend infrastructure)
**Revenue target:** $10,000-20,000/mo

---

### Phase 5 — Platform Expansion (Month 9-12) 🌍

| Month | Task | Details |
|-------|------|---------|
| **Month 9-10** | JetBrains plugin | Only if revenue > $10K/mo. Start with subprocess approach (spawn `npx ira-review`). |
| **Month 10-11** | API platform | Open API for third-party integrations. |
| **Month 11-12** | GitHub App | One-click install on GitHub repos. Runs IRA on every PR automatically. |

---

## 4. Feature Tiers

### 4.1 Monetization Strategy — CLI as gateway, Extension as revenue

The CLI is the **top-of-funnel**. Every `npx ira-review` run is a developer who now knows IRA exists. The CLI is the marketing budget — it should never feel crippled, but AI-expensive features are **rate-limited** to create a natural upgrade path.

The extension **Pro tier** is the primary revenue engine. Target: **$500-2,000/mo** ($6K-24K/yr).

**Core principles:**
1. **Never remove a free feature.** Rate-limit expensive ones instead.
2. **CLI stays useful forever.** Developers who only use CI never need to pay.
3. **The extension upgrade is about experience** (automation, persistence, visual UI), not about unlocking features that the CLI already had.
4. **Existing users on old versions keep what they have.** Old npm versions continue to work. New versions (v1.3+) include usage tracking. Deprecate pre-1.3 on npm registry.

### 4.2 Feature matrix — CLI vs Extension Free vs Extension Pro vs Team

| Feature | CLI (free) | Extension Free | Extension Pro ($10/mo) | Team ($25/user/mo) |
|---------|:----------:|:--------------:|:----------------------:|:------------------:|
| **Core Review** | | | | |
| Full PR review (Sonar + AI / standalone) | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| Risk scoring (0-100) | ✅ | ✅ | ✅ | ✅ |
| .ira-rules.json (team rules) | ✅ | ✅ | ✅ | ✅ |
| Sensitive areas detection | ✅ | ✅ | ✅ | ✅ |
| Comment deduplication | ✅ | ✅ | ✅ | ✅ |
| Inline diagnostics + CodeLens | — | ✅ | ✅ | ✅ |
| Sidebar tree view | — | ✅ | ✅ | ✅ |
| Status bar risk badge | — | ✅ | ✅ | ✅ |
| GitHub built-in auth (zero config) | — | ✅ | ✅ | ✅ |
| Copilot AI (zero config) | — | ✅ | ✅ | ✅ |
| Multi-LLM (OpenAI, Azure, Anthropic, Ollama) | ✅ | ✅ | ✅ | ✅ |
| Slack/Teams notifications | ✅ | ✅ | ✅ | ✅ |
| **AI-Heavy Features (rate-limited)** | | | | |
| JIRA AC validation | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| Test case generation | **5/month** | **5/month** | ✅ Unlimited | ✅ Unlimited |
| PR description generation | — | **3/month** | ✅ Unlimited | ✅ Unlimited |
| AC suggestion (auto-post to JIRA) | **3/month** | **3/month** | ✅ Unlimited | ✅ Unlimited |
| **Pro Features** | | | | |
| Auto-review on save | — | — | ✅ | ✅ |
| One-click apply fix | — | — | ✅ | ✅ |
| Review history (searchable) | — | — | ✅ | ✅ |
| Trends dashboard | — | — | ✅ | ✅ |
| Priority support | — | — | ✅ | ✅ |
| **Team Features** | | | | |
| Multi-repo dashboard | — | — | — | 🔜 Coming soon |
| Team analytics | — | — | — | 🔜 Coming soon |
| Shared rules enforcement | — | — | — | 🔜 Coming soon |
| Seat management | — | — | — | 🔜 Coming soon |

**Pricing logic:**
- **Pro ($10/mo)** — individual developer. Pays for automation + unlimited AI features. Ships today.
- **Team ($25/user/mo, min 5 seats)** — engineering manager. Pays for visibility across repos + team. Ships when features are ready.
- Competitors: CodeRabbit $12/user, Qodo $19/user, Greptile $30/user. Team at $25 is competitive and justified by multi-repo + analytics.
- Pro at $10 undercuts every competitor for individual use. Team at $25 is middle-of-pack for team use.

### 4.3 Rate limiting implementation (offline, no server)

Since IRA is local-first with no backend, rate limits are tracked in a local file:

```
~/.config/ira/usage.json
{
  "testGenCount": 3,
  "testGenResetDate": "2026-05-01",
  "acSuggestCount": 1,
  "acSuggestResetDate": "2026-05-01",
  "prDescCount": 2,
  "prDescResetDate": "2026-05-01",
  "licenseKey": null
}
```

- Monthly reset based on calendar date (1st of each month)
- No phone-home, no telemetry — consistent with privacy-first positioning
- License key: a signed JWT generated at checkout (Polar.sh supports this)
- Key payload: `{ plan: "pro", expiresAt: "2027-04-11" }` — validated offline with a public key embedded in the binary
- When limit is hit: clear message with upgrade link, not a crash

```
⚠️  Test generation limit reached (5/5 this month)
   Upgrade to Pro for unlimited: https://ira-review.dev/pricing
   Resets on May 1, 2026
```

### 4.4 Handling existing users on older versions

Old npm versions (pre-1.3) have no usage tracking and will continue to work forever. You cannot remotely disable them. Strategy:

| Action | Effect |
|--------|--------|
| `npm deprecate ira-review@"<1.3.0" "Upgrade to 1.3+ for security patches and new features"` | npm shows deprecation warning on install |
| Stop backporting bug fixes to pre-1.3 | Security patches only in 1.3+ |
| New features (better prompts, new AI providers) only in 1.3+ | Natural incentive to upgrade |
| v1.3+ includes usage tracking for rate-limited features | The monetization boundary |

**Message to developers:** "We're not taking anything away. Old versions keep working. New versions are better and have a sustainable business model."

### 4.5 Team tier ($8/user/mo, min 5 seats) — Phase 4

| Feature | Description |
|---------|-------------|
| Everything in Pro | All Pro features for every team member |
| Team dashboard | Aggregate quality metrics across the team |
| Per-developer insights | Who introduces most risk? Who improves most? |
| Shared rules + config | Team-wide review rules, synced automatically |
| Admin panel | Manage seats, billing, permissions |

### 4.6 Enterprise tier (custom pricing, $500-2,000/mo) — Phase 4

| Feature | Description |
|---------|-------------|
| Everything in Team | All Team features |
| SSO / SAML | Single sign-on for enterprise identity |
| Audit logs | Every review action logged for compliance |
| Custom AI deployment | Azure OpenAI, Ollama, self-hosted LLMs |
| On-prem support | Full air-gapped deployment |
| Commercial license | License exemption for proprietary use |
| Dedicated support SLA | Guaranteed response times |

### 4.7 License validation: Polar.sh → custom server migration path

**Phase 1 (now → first $2K/mo): Polar.sh API — zero custom infra**

Use Polar's built-in license key validation API with `usage` / `limit_usage` / `increment_usage` fields. Polar tracks rate limits server-side — tamper-proof, no local file to bypass.

```
POST https://api.polar.sh/v1/customer-portal/license-keys/validate
{
  "key": "IRA-XXXX-XXXX-XXXX",
  "organization_id": "<your-polar-org-id>",
  "increment_usage": 1
}
→ { "status": "granted", "usage": 4, "limit_usage": null, "expires_at": "..." }
```

- Free users (no key): local counter in `~/.config/ira/usage.json` (bypassable — but free users weren't paying anyway)
- Pro users (have key): Polar validates + increments server-side — **cannot be bypassed**
- Cache validation result for 1 hour (offline grace: 24 hours)
- Polar uptime: 99.98% API, $10M seed (Accel-led), open source fallback
- Cost: $0/month (Polar takes 4% + $0.40 per transaction from sales)

**Phase 2 ($2K+/mo revenue): migrate to custom server**

When revenue justifies it, replace Polar validation with your own API:
- Vercel serverless function + Supabase/PlanetScale for usage tracking
- Full control over usage logic (multiple counters, custom reset periods)
- No vendor dependency for license validation
- Cost: ~$20-50/month

**Critical: abstract validation behind an interface from Day 1**

```typescript
// src/utils/licenseValidator.ts
interface LicenseResult {
  valid: boolean;
  usage: number;
  limitUsage: number | null;
  expiresAt: string | null;
}

async function validateLicense(key: string, incrementUsage?: number): Promise<LicenseResult>
```

Day 1: calls `api.polar.sh`. Day 200: calls `api.ira-review.dev`. The CLI and extension never know the difference. Swapping is a one-file change.

### 4.8 Rate limiting effort breakdown

| Task | Where | Effort | Status |
|------|-------|--------|--------|
| **`licenseValidator.ts`** — Polar API integration, cache, offline grace | `src/utils/` (shared) | **1 day** | 🔴 Not built |
| **`usageLimiter.ts`** — local counter for free users, delegates to validator for Pro | `src/utils/` (shared) | **4 hours** | 🔴 Not built |
| **`ira-review activate <key>` CLI command** — store key in `~/.config/ira/` | `src/cli.ts` | **2 hours** | 🔴 Not built |
| **Gate test generation in CLI** — check usage before `generateTestCases()` | `src/cli.ts` | **1 hour** | 🔴 Not built |
| **Gate AC suggestion in CLI** — check usage before AC generation | `src/core/reviewEngine.ts` | **1 hour** | 🔴 Not built |
| **Gate test generation in Extension** — check usage in `generateTests.ts` | `packages/vscode/` | **1 hour** | 🔴 Not built |
| **Gate PR description in Extension** — check usage in `generatePRDescription.ts` | `packages/vscode/` | **1 hour** | 🔴 Not built |
| **Auto-review on save** — Pro gate | `packages/vscode/` | — | ✅ Built & gated |
| **One-click apply fix** — Pro gate | `packages/vscode/` | — | ✅ Built & gated |
| **Review history + trends** — Pro gate | `packages/vscode/` | — | ✅ Built & gated |
| **Trends dashboard** — Pro gate | `packages/vscode/` | — | ✅ Built & gated |
| **Multi-repo dashboard** | `packages/vscode/` | **2-3 weeks** | 🔴 Not built |
| **Team analytics** | needs backend | **3-4 weeks** | 🔴 Not built |
| **Priority support** | process only | **0** | ✅ Just a label |
| | | **Total for v1.3:** | **~2-3 days** |

### 4.9 What Extension Pro actually has today vs what's missing

**Already built and Pro-gated (shipping today):**

| Feature | File | Value to developer |
|---------|------|--------------------|
| Auto-review on save | `autoReviewer.ts` | Catches bugs in real-time as you code |
| One-click apply fix | `fixApplicator.ts` | Click → see diff → apply AI fix |
| Review history | `historyTreeProvider.ts` | Track every past review, searchable |
| Trends dashboard | `dashboardProvider.ts` | Charts: issues over time, risk trends |

**Not built yet (future Pro):**

| Feature | Effort | When |
|---------|--------|------|
| Multi-repo dashboard | 2-3 weeks | v1.4+ |
| Team analytics | 3-4 weeks (needs backend) | Phase 4 |

**Pricing reality check:** 4 Pro features (auto-review, apply fix, history, trends) at $10/mo is thin but viable if the positioning is right. The pitch isn't "4 features for $10" — it's:

> *"IRA catches issues before your reviewer does. Pro makes that automatic — reviews run on every save, fixes apply in one click, and you can track your improvement over time."*

At $10/mo, the decision is: "Is this worth less than 10 minutes of my time per month?" For any developer earning $50+/hr, the answer is yes if they use auto-review even once a day.

**If $10/mo feels too high for 4 features, consider $6/mo or $60/yr.** Lower price = lower friction = more conversions. You'd need 83 subscribers at $10/mo for $10K/yr, or 139 at $6/mo. The conversion rate at $6 will likely be 2-3x higher than at $10, so net revenue could be similar.

### 4.10 Future revenue expansion: GitHub App (when ready to scale beyond $2K/mo)

If revenue exceeds $2K/mo and you want to scale further, the next step is a **GitHub App** that auto-runs on every PR:

- Installs in 2 clicks from GitHub Marketplace
- Auto-runs JIRA AC validation as a **PR check** (blocks merge if ACs aren't covered)
- Free tier: 50 reviews/month per org
- Team tier: $30/month per repo (unlimited reviews)
- Enterprise: $500/month per org (unlimited repos)

This shifts the buyer from individual developer to engineering manager (who has budget). Same review engine, different distribution. Keep this in your back pocket — don't build it until the extension Pro is generating steady revenue.

---

## 5. Pricing Strategy

### 5.1 Why $10/mo (not $8, not $12)

```
$8/mo:   Too cheap — signals "small utility, maybe not good"
$10/mo:  Sweet spot — clean number, clearly cheaper than CodeRabbit ($12)
$12/mo:  Same as CodeRabbit — "why try the unknown one?"
$19/mo:  Hard to justify without brand recognition
```

$10/mo with $100/yr annual plan (save $20) = clean numbers, easy to expense, easy impulse buy.

### 5.2 Pricing comparison for website

```
                    CodeRabbit    Greptile    Qodo      IRA
                    ─────────    ────────    ────      ───
Price               $12/mo       $30/mo      $19/mo    $10/mo ✅
Open source         ❌           ❌          Partial    ✅
Self-hosted         ❌           ❌          ✅         ✅
SonarQube + AI      ❌           ❌          ❌         ✅
JIRA AC validation  ❌           ❌          ❌         ✅
Test generation     ❌           ❌          ❌         ✅
Risk scoring        ❌           ❌          ❌         ✅
VS Code extension   ✅           ❌          ❌         ✅
Code stays local    ❌           ❌          ✅         ✅
```

### 5.3 Pricing page layout (anchoring trick)

```
┌──────────────────┬──────────────────┬──────────────────┐
│   🆓 Free        │   ⭐ Pro          │   🏢 Team         │
│   $0/forever     │   $10/mo         │   $8/user/mo     │
│                  │   $100/yr        │   min 5 seats    │
│                  │   (save $20)     │                  │
│                  │                  │                  │
│   Everything     │   Auto-review    │   Everything Pro │
│   in the CLI     │   Apply Fix      │   Team dashboard │
│   BYOK           │   History        │   Shared rules   │
│   Manual reviews │   Trends         │   Admin panel    │
│                  │   Notifications  │                  │
│                  │                  │                  │
│  [Installed]     │  [Buy Now →]     │  [Contact →]     │
└──────────────────┴──────────────────┴──────────────────┘

Users see Team at $8/user and feel Pro at $10 is great value for one person.
```

### 5.4 AI proxy cost reality (not a selling point)

```
Cost per AI review (GPT-4o-mini): ~$0.001
User doing 200 reviews/month via BYOK: ~$0.20/month on OpenAI
To break even on $10/mo managed AI: 10,000 reviews needed

Conclusion: "Managed AI" alone isn't worth $10/mo.
Lead with automation + insights. Managed AI is a free bonus.
```

---

## 6. Editor Support Strategy

### Day 1 — Build once, cover 88% of developers

Build ONE VS Code extension → publish to TWO registries → support SEVEN editors.

| Editor | How | Registry | Market Share |
|--------|-----|----------|-------------|
| VS Code | Native | VS Code Marketplace | ~74% |
| Cursor | Same extension (VS Code fork) | Open VSX | ~8% |
| Windsurf | Same extension (VS Code fork) | Open VSX | ~2% |
| Void | Same extension (VS Code fork) | Open VSX | ~1% |
| VSCodium | Same extension (VS Code fork) | Open VSX | ~1% |
| GitHub Codespaces | Same extension | VS Code Marketplace | ~1% |
| Gitpod | Same extension | Open VSX | ~1% |
| **Total** | **1 codebase, 2 publish commands** | | **~88%** |

### Phase 5 (Month 9+) — Only if revenue > $10K/mo

| Editor | Effort | Market Share | When |
|--------|--------|-------------|------|
| JetBrains (IntelliJ, WebStorm, PyCharm) | Full rewrite in Kotlin (or subprocess approach first) | ~10% | Month 9-10 |
| Neovim | Separate Lua plugin | ~2% | Maybe never (CLI serves them) |
| Emacs / Eclipse | Separate plugins | <1% | Never |

### Publish commands (covers 7 editors)

```bash
vsce publish          # → VS Code, Codespaces
ovsx publish          # → Cursor, Windsurf, Void, VSCodium, Gitpod
npm publish           # → CLI users (already doing this)
```

---

## 7. Marketing & Sales Strategy

### 7.1 Positioning — How to talk about IRA

```
❌ "AI-powered code review tool"              (generic, 50 other tools)
❌ "Cheapest code review extension"            (attracts wrong audience)
❌ "Enterprise review platform"               (can't back it up yet)

✅ "The open-source CodeRabbit — works with your SonarQube + JIRA"
```

Key differentiators to highlight in every piece of content:
1. **OPEN SOURCE** — "Audit every line. No black boxes."
2. **PRIVACY-FIRST** — "Your code stays on your machine. Always."
3. **SELF-HOSTED AI** — "Works with Ollama. No data leaves your network."
4. **EDITOR-NATIVE** — "Not another dashboard. Lives in your editor."
5. **CI/CD + EDITOR** — "Same tool in your pipeline AND your editor."

### 7.2 Marketplace listing

```
Extension name:    IRA — AI Code Reviews
Subtitle:          Open-source AI code reviews with SonarQube + JIRA integration

Description (first 3 lines):
  "AI-powered code reviews inside your editor.
   The open-source alternative to CodeRabbit.
   Works with your existing SonarQube and JIRA — your code never leaves your machine."

Keywords (Marketplace search):
  code review, AI code review, SonarQube, sonar, pull request review,
  JIRA, CodeRabbit alternative, code quality, security scanner
```

### 7.3 Pre-launch (during Phase 1)

| Action | Platform | Goal |
|--------|----------|------|
| Teaser posts | Twitter/X, LinkedIn | "Building an AI code review extension. What features would you want?" |
| Build in public | Twitter/X | Share progress screenshots, GIFs weekly |
| GitHub stars campaign | GitHub | Ask existing CLI users to star the repo |
| Early access list | ira-review.dev | Collect emails for launch notification |

### 7.4 Launch (Phase 1 complete)

| Action | Platform | When |
|--------|----------|------|
| Marketplace listing | VS Code Marketplace + Open VSX | Day 1 |
| Launch tweet thread | Twitter/X | Day 1 — 10-tweet thread with GIFs |
| LinkedIn post | LinkedIn | Day 1 — professional angle |
| Reddit post | r/vscode, r/webdev, r/programming | Day 2 |
| Hacker News | Show HN | Day 3 |
| Dev.to article | Dev.to | Day 4 — technical deep-dive |

### 7.5 Growth content calendar (Phase 3)

| Week | Title | Platform | Angle |
|------|-------|----------|-------|
| Week 8 | "I replaced CodeRabbit with my own open-source tool" | Dev.to, Medium | Open-source alternative |
| Week 9 | "How AI caught a security bug my team missed" | LinkedIn | Enterprise/security |
| Week 10 | "Adding AI code reviews to VS Code in 5 minutes" | Dev.to | Tutorial/how-to |
| Week 12 | "From CLI tool to $X/mo in revenue" | Indie Hackers, Twitter | Build-in-public story |

### 7.6 Product Hunt launch checklist

```
When: Tuesday or Wednesday (best launch days)
Prepare:
  ├── 5 high-quality screenshots
  ├── 60-sec demo video
  ├── Tagline: "AI code reviews inside your editor. Open source."
  ├── Maker comment explaining the story
  ├── Ask 10+ friends to upvote at launch (morning PT)
  └── Respond to every comment within 1 hour
```

### 7.7 Community engagement

```
Daily:   Respond to every GitHub issue / Marketplace review
Weekly:  Share a tip/feature highlight on Twitter
Monthly: Blog post + metrics update + user poll
```

---

## 8. Publishing Guide

### 8.1 Prerequisites

```bash
npm install -g @vscode/vsce    # VS Code Marketplace publisher
npm install -g ovsx            # Open VSX publisher

# Create publisher accounts:
# 1. VS Code Marketplace: https://marketplace.visualstudio.com/manage
# 2. Open VSX: https://open-vsx.org (sign in with GitHub)
```

### 8.2 Extension package.json (VS Code manifest)

```jsonc
{
  "name": "ira-review-vscode",
  "displayName": "IRA — AI Code Reviews",
  "description": "AI-powered code reviews inside your editor. Open source, privacy-first.",
  "version": "1.0.0",
  "publisher": "ira-review",
  "icon": "resources/icon.png",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Linters", "Testing", "Other"],
  "keywords": ["code review", "AI", "SonarQube", "pull request", "security", "JIRA"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",

  "contributes": {
    "commands": [
      { "command": "ira.reviewPR", "title": "IRA: Review Current PR" },
      { "command": "ira.reviewFile", "title": "IRA: Review Current File" },
      { "command": "ira.generateTests", "title": "IRA: Generate Tests" },
      { "command": "ira.showDashboard", "title": "IRA: Show Dashboard" },
      { "command": "ira.activateLicense", "title": "IRA: Activate Pro License" },
      { "command": "ira.configure", "title": "IRA: Configure" }
    ],
    "configuration": {
      "title": "IRA Review",
      "properties": {
        "ira.scmProvider": {
          "type": "string",
          "enum": ["github", "bitbucket"],
          "default": "github"
        },
        "ira.aiProvider": {
          "type": "string",
          "enum": ["openai", "azure-openai", "anthropic", "ollama"],
          "default": "openai"
        },
        "ira.aiModel": {
          "type": "string",
          "default": "gpt-4o-mini"
        },
        "ira.minSeverity": {
          "type": "string",
          "enum": ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"],
          "default": "MAJOR"
        },
        "ira.autoReviewOnSave": {
          "type": "boolean",
          "default": false,
          "description": "⭐ Pro: Automatically review files on save"
        }
      }
    },
    "viewsContainers": {
      "activitybar": [
        { "id": "ira-explorer", "title": "IRA Review", "icon": "resources/ira-icon.svg" }
      ]
    },
    "views": {
      "ira-explorer": [
        { "id": "ira-issues", "name": "Issues" },
        { "id": "ira-history", "name": "History" }
      ]
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/patilmayur5572/ira-review"
  },
  "license": "AGPL-3.0"
}
```

### 8.3 Marketplace listing assets

```
Required:
  ├── icon.png (128x128, clear at small sizes)
  ├── README.md with:
  │   ├── Hero banner (1280x640)
  │   ├── 3-5 annotated screenshots
  │   ├── Demo GIF (15-30 seconds)
  │   ├── Quick start (3 steps)
  │   ├── Free vs Pro comparison table
  │   └── Links to docs, GitHub, website
  ├── CHANGELOG.md
  └── LICENSE
```

### 8.4 CI/CD automated publishing

```yaml
# .github/workflows/publish.yml
name: Publish Extension
on:
  push:
    tags: ['v*']

jobs:
  publish-cli:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: cd packages/cli && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-vscode:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && cd packages/vscode && npm run build
      - run: cd packages/vscode && npx vsce publish
        env:
          VSCE_PAT: ${{ secrets.VSCE_TOKEN }}
      - run: cd packages/vscode && npx ovsx publish
        env:
          OVSX_PAT: ${{ secrets.OVSX_TOKEN }}
```

---

## 9. Financial Projections

### 9.1 Cost structure

**Fixed costs:**

| Item | Phase 1-2 | Phase 3 | Phase 4+ |
|------|-----------|---------|----------|
| Domain (ira-review.dev) | $1/mo | $1/mo | $1/mo |
| Vercel (license API) | $0 (free) | $0 | $20/mo |
| Supabase (team DB) | — | — | $25/mo |
| **Total** | **$1/mo** | **$1/mo** | **$46/mo** |

**Variable costs (per Pro user/month):**

| Item | Cost |
|------|------|
| LemonSqueezy (5% + $0.50) | $1.00 on $10/mo |
| AI proxy (if used, avg) | $0.10 |
| **Total per user** | **$1.10** |
| **Net per Pro user** | **$8.90/mo (89% margin)** |

### 9.2 Revenue projections

| Month | Phase | Free installs | Pro users | Team seats | Revenue/mo | Costs/mo | **Profit/mo** |
|-------|-------|--------------|-----------|------------|------------|----------|---------------|
| 1 | Foundation | 500 | 0 | 0 | $0 | $1 | -$1 |
| 2 | Pro launch | 1,500 | 30 | 0 | $300 | $34 | **$266** |
| 3 | Growing | 3,000 | 90 | 0 | $900 | $100 | **$800** |
| 4 | Marketing | 6,000 | 200 | 0 | $2,000 | $221 | **$1,779** |
| 5 | Scaling | 10,000 | 350 | 0 | $3,500 | $386 | **$3,114** |
| 6 | Team launch | 15,000 | 500 | 15 | $5,120 | $613 | **$4,507** |
| 9 | Growth | 30,000 | 800 | 50 | $8,400 | $987 | **$7,413** |
| 12 | Mature | 50,000 | 1,500 | 150 | $16,200 | $1,851 | **$14,349** |

### 9.3 Break-even

```
Fixed costs (Phase 2):     $1/month
Variable cost per user:    $1.10/month
Price per user:            $10/month
Contribution margin:       $8.90/user/month

Break-even:                1 Pro user covers all fixed costs
Ramen profitability:       ~56 Pro users ($500/mo)
Full-time viable:          ~337 Pro users ($3,000/mo)
Strong business:           ~1,125 Pro users ($10,000/mo)
```

---

## 10. Tax & Legal (Australia)

### 10.1 LemonSqueezy handles global taxes

LemonSqueezy is your **Merchant of Record** — they sell to the customer, collect all international VAT/GST/Sales Tax, then pay you. Global tax complexity is their problem.

### 10.2 Australian obligations

**ABN (Australian Business Number):**
```
When:    Get it when Phase 2 launches (first dollar earned)
         Takes 5 minutes at abr.gov.au, free, instant approval
         NOT needed during Phase 1 ($0 revenue)
Cost:    Free
```

**GST:**
```
IRA revenue < $75K AUD/year:   No GST registration needed
IRA revenue > $75K AUD/year:   Register for GST
Export of services:             0% GST (most sales are international)
```

**Income Tax:**
```
Australian tax rates (2025-26):
  $0 - $18,200:         0%
  $18,201 - $45,000:    16%
  $45,001 - $135,000:   30%
  $135,001 - $190,000:  37%
  $190,001+:            45%
  + Medicare Levy:       2%

IRA income stacks on top of your salary.
```

### 10.3 Business structure roadmap (tax optimization)

```
Phase 1-2 (earning $0-$50K AUD/yr):
  → Sole Trader + ABN (free, 5 minutes)
  → Track expenses, claim deductions
  → Lodge with personal tax return

Phase 3+ (earning $50K-$150K AUD/yr):
  → Set up Pty Ltd ($500-1,000 setup)
  → Flat 25% company tax vs your 30-45% personal rate
  → Leave profits in company, pay yourself strategically
  → Get an accountant ($1,500/yr — pays for itself)

Scaling ($150K+ AUD/yr):
  → Consider Trust + Bucket Company structure
  → Split income with family if applicable
  → Get a proper tax advisor (~$3K/yr)
```

**Example savings with Pty Ltd:**
```
Salary $110K + IRA $30K:
  Sole Trader:  IRA taxed at 37% + 2% = $11,700 tax
  Pty Ltd:      IRA taxed at 25%     = $7,500 tax
  SAVING:       $4,200/year
```

### 10.4 Deductible expenses (claim from Day 1)

```
  ├── Domain name ($12/yr)
  ├── Software subscriptions (Amp, Cursor, etc.)
  ├── OpenAI API costs
  ├── LemonSqueezy fees
  ├── Accountant fees
  ├── Laptop (instant write-off if < $20K)
  ├── Home office: 67 cents/hour worked
  └── Any freelancers hired
```

### 10.5 Timeline

```
Now:           Nothing (earning $0, building Phase 1)
Phase 2 week:  Get ABN (5 min, free) — right before enabling payments
$75K AUD/yr:   Register for GST + lodge quarterly BAS
$50K+ AUD/yr:  Consider Pty Ltd for 25% flat tax rate
Always:        Track every expense in a spreadsheet or Xero
```

> ⚠️ This is general guidance. Get a registered tax agent when earning real money.

---

## 11. License Protection

### 11.1 Reality of VS Code extension licensing

Since extensions are JavaScript running locally, someone **could** decompile and patch out the license check. This is true for every paid extension (GitLens, Wallaby.js, Quokka.js).

### 11.2 Why it doesn't matter

```
To bypass the license, someone must:
  1. Download and decompile the .vsix         (2 min)
  2. Find and patch the license check          (10 min)
  3. Repack and sideload                       (5 min)
  4. Redo this on EVERY update                 (20 min/month)
  Total: ~40 min/month to save $10/month

Most developers earn $50-100+ AUD/hour.
40 min to save $10 = earning $15/hour. Nobody does that.
```

### 11.3 Practical protection (what successful extensions use)

```typescript
class LicenseManager {
  async isPro(): Promise<boolean> {
    // 1. Check cached result (don't call server on every action)
    const cached = this.context.globalState.get<LicenseCache>('ira-license');
    if (cached && Date.now() - cached.checkedAt < 86400000) { // 24 hours
      return cached.valid;
    }

    // 2. Validate with server (1x/day)
    const key = await this.secrets.get('ira-license-key');
    if (!key) return false;

    try {
      const res = await fetch('https://api.ira-review.dev/validate', {
        method: 'POST',
        body: JSON.stringify({ key, machineId: vscode.env.machineId }),
      });
      const data = await res.json();

      // 3. Cache result locally
      await this.context.globalState.update('ira-license', {
        valid: data.valid,
        plan: data.plan,
        checkedAt: Date.now(),
      });
      return data.valid;
    } catch {
      // 4. Offline grace: trust cached result for 7 days
      return cached?.valid ?? false;
    }
  }
}
```

**Server-side protections:**

| Protection | How |
|---|---|
| Machine ID binding | `vscode.env.machineId` limits activations per key |
| Activation limit | LemonSqueezy: "max 3 devices per key" |
| Usage anomaly detection | Flag if 1 key validates from 20+ IPs |
| Periodic revalidation | 1x/day check, 7-day offline grace period |

**Principle:** Make buying easier than pirating. Don't punish paying customers with aggressive DRM.

---

## Future Work — Revolutionary Features

### 1. Team-Trained Reviews ("What would my tech lead say?")
**Effort:** 1-2 weeks | **Target tier:** Pro/Team | **Priority:** HIGH

Fetch past PR review comments from GitHub/Bitbucket → AI learns team-specific patterns → reviews code like your senior developer would. No competitor does this.

**Value prop:** Scales senior developer knowledge across the entire team. A 500-person company has 5 senior devs bottlenecking 100 PRs — this clones their review instincts.

**Requirements:**
- Fetch past PR review comments via SCM API
- Analyze and categorize team patterns
- Local storage for team rules
- Inject team context into review prompts
- Settings: number of past PRs to learn from

### 2. Blast Radius Analysis ("What else will this break?")
**Effort:** 2-3 weeks | **Target tier:** Pro | **Priority:** MEDIUM

Analyze imports/dependencies, git history (files that change together), and JIRA bug correlation to show the impact zone of a change.

**Value prop:** Prevents production incidents before they happen. "You changed auth/validateToken.ts — this file was involved in 4 bug tickets last quarter, and the last 3 changes also required changes in middleware/cors.ts."

**Requirements:**
- Import/dependency parser (multi-language)
- Git log analysis (co-change patterns)
- JIRA bug ticket ↔ file correlation
- Blast radius visualization webview
- Cross-file analysis across entire repo

### 3. Sprint Health Score (JIRA + Code Quality = Manager's Dream)
**Effort:** 1-2 weeks | **Target tier:** Team/Enterprise | **Priority:** HIGH

Connect JIRA sprint data with code quality metrics across all PRs in a sprint. The missing dashboard every VP of Engineering would pay for.

**Value prop:** "Sprint 23: 8 tickets done, but 3 PRs merged without tests, risk score increased 40%, and 2 JIRA tickets only partially implemented (AC 3/5 met)." Engineering managers have NO visibility into code quality per sprint today.

**Requirements:**
- JIRA Sprint API integration
- Aggregate quality metrics across sprint PRs
- Map JIRA tickets → PRs → quality scores
- Sprint Health webview dashboard
- Sprint-level reporting and trends

---

## Summary — Decision Checklist

```
Positioning:
  ✅ "Open-source CodeRabbit for SonarQube + JIRA teams"
  ✅ Lead with privacy, open source, existing stack integration

Architecture:
  ✅ Monorepo: packages/core + packages/cli + packages/vscode
  ✅ Local-first storage (no backend until Phase 4)
  ✅ Core library shared between CLI and extension

Pricing:
  ✅ CLI = free forever (gateway / marketing engine)
  ✅ CLI rate-limits: test gen (5/mo), AC suggest (3/mo) — upgrade path to Pro
  ✅ Extension Free = CLI parity + IDE UX (diagnostics, CodeLens, TreeView)
  ✅ Pro = $10/mo or $100/yr (unlimited AI features + automation + history)
  ✅ Team = $8/user/mo (Phase 4 only)
  ✅ Enterprise = custom pricing (Phase 4+)
  ✅ Rate limits: offline via ~/.config/ira/usage.json (no server needed)
  ✅ License keys: signed JWT validated offline (Polar.sh generates them)
  ✅ Old versions (pre-1.3): keep working, deprecated on npm, no new features
  ✅ Payment via Polar.sh (MoR — handles taxes, invoices, license keys)

Editor support:
  ✅ Day 1: VS Code + Open VSX = 88% market (one codebase)
  ✅ Phase 5: JetBrains (only if revenue > $10K/mo)
  ❌ Skip: Neovim, Emacs, Eclipse (CLI serves them)

Marketing:
  ✅ Launch on Marketplace, Reddit, HN, Dev.to, Product Hunt
  ✅ Comparison content: "IRA vs CodeRabbit"
  ✅ Build in public on Twitter/X
  ✅ Target SonarQube users + JIRA teams as primary audience

Tax (Australia):
  ✅ ABN when Phase 2 launches (free, 5 min)
  ✅ Sole Trader until $50K AUD/yr
  ✅ Pty Ltd when $50K+ (25% flat vs 30-45% personal)
  ✅ No GST until $75K AUD/yr

Open source & CLI:
  ✅ Keep repo public (trust + discovery engine)
  ✅ Proprietary license (CLI free for personal + commercial use)
  ✅ CLI = free gateway, rate-limited on AI-heavy features (v1.3+)
  ✅ Extension Pro = revenue engine ($10/mo)
  ✅ GitHub App = future scale engine (per-repo pricing, when ready)
```

---

## 12. New Machine Setup - Recovery Guide

If you lose access to your machine, here's how to get back up and running from scratch.

### 12.1 Prerequisites

- Node.js 18+ installed
- Git installed
- VS Code installed (for extension development)

### 12.2 Clone and install

```bash
git clone https://github.com/YOUR_PRIVATE_REPO/ira.git
cd ira
npm install
npm run build
```

### 12.3 Restore credentials

All credentials are cloud-based. Nothing is stored only on the laptop.

| Credential | How to restore | Where to go |
|---|---|---|
| **npm publish token** | Generate a new access token | https://www.npmjs.com > Access Tokens > Generate New Token (Automation) |
| **VS Code Marketplace** | Generate a new Azure DevOps PAT | https://dev.azure.com > User Settings > Personal Access Tokens > New Token (scope: Marketplace Manage) |
| **Open VSX** | Generate a new token | https://open-vsx.org > Settings > Access Tokens |
| **GitHub PAT (public repo sync)** | Generate a new fine-grained token | https://github.com/settings/tokens > Fine-grained > scope to patilmayur5572/ira-review, Contents: Read and write |
| **GitHub Actions secrets** | Already stored on GitHub, not on your machine | Private repo > Settings > Secrets and variables > Actions |

### 12.4 Configure npm

```bash
# Login to npm
npm login

# Verify
npm whoami
```

### 12.5 Configure VS Code extension publishing

```bash
# Install vsce (VS Code Extension CLI)
npm install -g @vscode/vsce

# Login with your Azure DevOps PAT
vsce login ira-review

# Install ovsx for Open VSX
npm install -g ovsx
```

### 12.6 Configure git

```bash
git config --global user.name "Mayur Patil"
git config --global user.email "patilmayur5572@gmail.com"
```

### 12.7 Update GitHub Actions secrets (if tokens changed)

Go to private repo > Settings > Secrets and variables > Actions:

| Secret name | Value |
|---|---|
| `NPM_TOKEN` | Your new npm automation token |
| `PUBLIC_REPO_TOKEN` | Your new GitHub fine-grained PAT |

### 12.8 Verify everything works

```bash
# Build
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build extension
cd packages/vscode
npm run build

# Package extension (creates .vsix)
npm run package

# Dry run publish (does not actually publish)
vsce ls
```

### 12.9 Release checklist

```
1. Make changes on a feature branch
2. Push branch, create PR, merge to main
3. Go to private repo > Releases > Draft new release
4. Create tag (e.g. v1.2.0), write release notes, hit Publish
5. Automated:
   - publish.yml publishes to npm
   - sync-public-repo.yml syncs README + docs + tag + release to public repo
6. Manually publish extension (if not automated):
   cd packages/vscode
   npm run build:prod
   npm run publish-ext
```

### 12.10 Key URLs

| What | URL |
|---|---|
| Private repo | https://github.com/YOUR_ORG/ira (your private GitHub) |
| Public repo | https://github.com/patilmayur5572/ira-review |
| npm package | https://www.npmjs.com/package/ira-review |
| VS Code Marketplace | https://marketplace.visualstudio.com/items?itemName=ira-review.ira-review-vscode |
| Open VSX | https://open-vsx.org/extension/ira-review/ira-review-vscode |
| Support email | patilmayur5572@gmail.com |
