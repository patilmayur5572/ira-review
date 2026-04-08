#!/bin/bash
# Simulates IRA dry-run output for VHS demo recordings

sleep 0.5

printf "\n\033[1m🔍 IRA — AI-Powered PR Review\033[0m\n\n"
echo "  Mode:     AI-only"
echo "  SCM:      github"
echo "  PR:       #42"
echo "  Provider: openai"
echo "  Dry run:  yes"
echo ""

sleep 1.5

echo "  Risk: HIGH (45/100)  |  Issues: 4  |  Framework: React"
echo ""

sleep 1

echo "------------------------------------------------------------"
echo "  src/components/Auth.tsx:23"
echo "   Rule:     security:S5131 (BLOCKER)"
echo "   Message:  User input used directly in SQL query."
echo "   Explain:  The 'username' param is concatenated into a SQL"
echo "             string, creating a SQL injection vector."
echo "   Impact:   Attacker could execute arbitrary SQL, access or"
echo "             delete data, and gain database control."
echo "   Fix:      Use parameterized queries:"
echo "             db.query('SELECT * FROM users WHERE name = \$1',"
echo "             [username])"

sleep 1

echo ""
echo "------------------------------------------------------------"
echo "  src/hooks/useAuth.ts:47"
echo "   Rule:     react:S6478 (CRITICAL)"
echo "   Message:  Missing dependency in useEffect hook."
echo "   Explain:  useEffect is missing 'token' in its dependency"
echo "             array, causing stale closure bugs."
echo "   Impact:   Users may see incorrect data after re-login."
echo "   Fix:      useEffect(() => { fetchData(token); }, [token]);"

sleep 0.5

echo ""
printf "\033[32m✅ Review complete!\033[0m\n"
echo "   Issues: 4 found, 4 reviewed | Comments: 4 posted"
echo "   PR Risk: HIGH (45/100)"
echo ""
echo "DONE"
