# Add Your Team's Review Rules (Optional)

Linters catch syntax. SonarQube catches known vulnerability patterns. But **what about your team's standards** — "always use parameterized queries", "never log PII", "use our shared component library instead of raw HTML"?

IRA loads team rules from a `.ira-rules.json` file at your repo root and injects them into every AI review. The model checks for your rules in the same pass as general issues — no extra API calls, no separate analysis.

## Two minutes to set up

1. Run **`IRA: Init Rules File`** to scaffold an empty `.ira-rules.json`
2. Add a few rules — each has a message, severity (BLOCKER / CRITICAL / MAJOR / MINOR), and optional bad/good code examples
3. Commit the file. Every PR review from now on enforces your rules.

```json
{
  "rules": [
    {
      "message": "Use parameterized queries for all SQL operations",
      "bad": "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
      "good": "db.query('SELECT * FROM users WHERE id = $1', [userId])",
      "severity": "CRITICAL"
    }
  ]
}
```

[Scaffold a Rules File](command:ira.initRules)
