#!/bin/bash
# Simulates IRA JIRA acceptance criteria validation for VHS demo

sleep 0.5

printf "\n\033[1m🔍 IRA — AI-Powered PR Review\033[0m\n\n"
echo "  Mode:     AI-only"
echo "  SCM:      github"
echo "  PR:       #87"
echo "  Provider: openai"
echo "  Dry run:  yes"
echo ""

sleep 1.5

echo "  Risk: LOW (12/100)  |  Issues: 1  |  Framework: NestJS"
echo ""

sleep 1

echo "  JIRA: AUTH-234 - Add user authentication with OAuth2"
echo ""
echo "  [PASS] OAuth2 login flow implemented with Google provider"
echo "  [PASS] JWT tokens generated on successful authentication"
echo "  [PASS] Refresh token rotation with 7-day expiry"
echo "  [FAIL] Input validation on login endpoint - no email check"
echo "  [PASS] Logout endpoint clears session and revokes token"
echo "  [FAIL] Rate limiting on login attempts - not implemented"
echo ""

sleep 1.5

echo "------------------------------------------------------------"
echo "  src/auth/login.ts:34"
echo "   Rule:     ai:input-validation (CRITICAL)"
echo "   Message:  Email parameter is not validated."
echo "   Explain:  Login endpoint accepts email but does not"
echo "             validate format before OAuth2 provider lookup."
echo "   Impact:   Invalid emails could cause errors or be used"
echo "             for enumeration attacks."
echo "   Fix:      if (!isValidEmail(email)) return"
echo "             res.status(400).json({ error: 'Invalid email' });"

sleep 0.5

echo ""
printf "\033[32m✅ Review complete!\033[0m\n"
echo "   Issues: 1 found, 1 reviewed | JIRA AC: FAIL (4/6 passed)"
echo "   PR Risk: LOW (12/100)"
echo ""
echo "DONE"
