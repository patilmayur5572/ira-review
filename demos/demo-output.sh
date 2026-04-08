#!/bin/bash
# Simulated IRA review output for demo purposes

echo ""
echo "  ⚖️  IRA is proprietary software. See LICENSE for details."
echo "  📧 Contact: patilmayur5572@gmail.com"
echo "  📖 https://github.com/patilmayur5572/ira-review"
echo ""
sleep 1

echo "🔍 IRA - AI-Powered PR Review"
echo ""
echo "  Mode:     AI-only"
echo "  SCM:      github"
echo "  PR:       #42"
echo "  Provider: openai (gpt-4o-mini)"
echo "  Dry run:  yes"
echo ""
sleep 2

echo "  Reviewing src/auth/login.ts..."
sleep 1
echo "  Reviewing src/api/users.ts..."
sleep 1
echo "  Reviewing src/db/queries.ts..."
sleep 1
echo ""

echo "✅ Review complete!"
echo "   Total issues found:    5"
echo "   Issues reviewed (AI):  5"
echo "   Framework detected:    react"
echo "   Comments posted:       0 (dry-run)"
echo "   PR Risk:               HIGH (48/100)"
echo ""
sleep 1

echo "📊 Requirements: AUTH-234 - 67% Complete (4/6 AC met)"
echo ""
echo "  ✅ OAuth2 login flow implemented with Google provider"
echo "  ✅ JWT tokens generated on successful authentication"
echo "  ✅ Refresh token rotation with 7-day expiry"
echo "  ❌ Input validation on login endpoint - no email format check"
echo "  ✅ Logout endpoint clears session and revokes token"
echo "  ❌ Rate limiting on login attempts - not implemented"
echo ""
echo "  ⚠️  Edge Cases Not Covered:"
echo "     - What happens when Google OAuth is unreachable?"
echo "     - Token refresh during concurrent requests?"
echo ""
sleep 2

echo "┌─────────────────────────────────────────────────────────┐"
echo "│ 🔍 IRA Review - IRA/security (CRITICAL)                │"
echo "│                                                         │"
echo "│ > User input used directly in SQL query                 │"
echo "│                                                         │"
echo "│ Explanation: The username parameter is concatenated      │"
echo "│ into a SQL string, creating a SQL injection vector.      │"
echo "│                                                         │"
echo "│ Impact: Attacker could execute arbitrary SQL.            │"
echo "│                                                         │"
echo "│ Fix: db.query('SELECT * FROM users WHERE name = $1',    │"
echo "│      [username])                                         │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""
sleep 1

echo "# 🔍 IRA Review Summary"
echo ""
echo "## 🟠 Risk: HIGH (48/100)"
echo ""
echo "| Factor           | Score | Detail                       |"
echo "|------------------|-------|------------------------------|"
echo "| Blocker Issues   | 0/30  | 0 blocker issues found       |"
echo "| Critical Issues  | 20/25 | 2 critical issues found      |"
echo "| Major Issues     | 10/15 | 2 major issues found         |"
echo "| Security         | 15/20 | 2 security-related issues    |"
echo "| Code Complexity  | 3/10  | 1 high-complexity file       |"
echo ""
