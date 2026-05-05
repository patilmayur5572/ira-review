# Run Quick Start

IRA reviews your pull requests with AI before your team does. To get started, run **Quick Start** — it auto-detects your SCM from the git remote, walks you through token setup, and optionally configures JIRA.

## What Quick Start does for you

- **Auto-detects** GitHub, Bitbucket Cloud, or Bitbucket Server from your git remote
- **Pre-fills the Bitbucket Server base URL** so you don't have to find it
- Uses the **right prompt copy** for each provider — HTTP Access Token for Bitbucket Server (not a password), API Token for Bitbucket Cloud, OAuth for GitHub
- **Suggests a JIRA URL** based on your Bitbucket setup when it can
- Stores all tokens in your **OS keychain** (macOS Keychain, Windows Credential Manager, Linux libsecret) — never plaintext

Takes about 2 minutes. You only need to do it once.

[Run Quick Start](command:ira.quickStart)
