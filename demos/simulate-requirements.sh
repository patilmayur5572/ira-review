#!/bin/bash
# Simulates IRA Requirement Completion Tracking for VHS demo

sleep 0.5

printf "\n\033[1m📋 IRA — Requirement Completion Tracker\033[0m\n\n"
echo "  Ticket:     AUTH-234"
echo "  AI:         openai"
echo "  PR:         #87"
echo ""

sleep 1.5

echo "  JIRA: AUTH-234 - Add user authentication with OAuth2"
echo ""

sleep 1

printf "\033[1m  Requirement Completion: 80%% (4/5)\033[0m\n\n"

echo "  ┌────────────────────────────────────────────────────────┐"
echo "  │ AC  │ Status │ Requirement                            │"
echo "  ├─────┼────────┼────────────────────────────────────────┤"
printf "  │  1  │ \033[32m DONE \033[0m │ OAuth2 login with Google provider      │\n"
printf "  │  2  │ \033[32m DONE \033[0m │ JWT tokens on successful auth          │\n"
printf "  │  3  │ \033[32m DONE \033[0m │ Refresh token rotation (7-day)         │\n"
printf "  │  4  │ \033[32m DONE \033[0m │ Input validation on login endpoint     │\n"
printf "  │  5  │ \033[31m MISS \033[0m │ Rate limiting on login attempts        │\n"
echo "  └─────┴────────┴────────────────────────────────────────┘"
echo ""

sleep 2

echo "  Missing Implementation Details:"
echo "  ─────────────────────────────────────────────────────────"
echo "  AC #5 — Rate limiting on login attempts"
echo "    Evidence: No rate-limiting middleware found in diff."
echo "    Suggestion: Add express-rate-limit or custom middleware"
echo "                to POST /auth/login with 5 req/min window."
echo ""

sleep 1

printf "\033[32m✅ Requirement tracking complete!\033[0m\n"
echo "   Completion: 80% | 4 met, 1 missing"
echo "   Recommendation: Address AC #5 before merge"
echo ""
echo "DONE"
