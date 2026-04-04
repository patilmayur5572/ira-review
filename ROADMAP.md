# IRA Roadmap

## Phase 3 - Planned

### Dependency Vulnerability Scanning (SCA-lite) - Pro
- Integrated into the existing PR review flow - Pro users automatically get dependency scanning alongside code review
- When a PR modifies `package.json`, `requirements.txt`, `pom.xml`, etc., check newly added/bumped dependencies against the [OSV.dev](https://osv.dev/) API for known CVEs
- Flag vulnerable dependencies inline on the PR alongside code review comments
- Rule: `IRA/dependency-risk`
- Not a full SCA replacement (Trivy/Snyk) - focused on catching issues at PR review time
- Free users see a soft upsell: "Upgrade to Pro to scan dependencies for known vulnerabilities"

### Post to PR (selective comment posting)
- Allow users to selectively post review comments to the PR from the extension

### Custom Review Rules
- User-defined rules for project-specific patterns
