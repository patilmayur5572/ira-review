# Run Your First Review

With setup complete, you can review a pull request or your local uncommitted changes.

## Two ways to review

**Reviewing an existing PR:**
1. Run **`IRA: Review Current PR`**
2. Pick "I have a PR number"
3. Enter the PR number — IRA fetches the diff, runs each file through AI, and shows results

**Reviewing local changes (no PR yet):**
1. Run **`IRA: Review Current PR`**
2. Pick "No PR yet (review local changes)"
3. IRA diffs your uncommitted work against the default branch

## What you'll see

- **Inline diagnostics** in your editor (squigglies on problem lines)
- **Risk score** in the status bar (LOW / MEDIUM / HIGH / CRITICAL)
- **Issues panel** in the IRA Review sidebar
- **JIRA AC validation** if your branch name contains a ticket key (e.g. `feature/AUTH-234`)

[Run Your First Review](command:ira.reviewPR)
