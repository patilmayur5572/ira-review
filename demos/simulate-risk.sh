#!/bin/bash
# Simulates IRA PR Risk Scoring for VHS demo

sleep 0.5

printf "\n\033[1m🔍 IRA — AI-Powered PR Review\033[0m\n\n"
echo "  Mode:     Sonar + AI"
echo "  SCM:      github"
echo "  PR:       #156"
echo "  Provider: anthropic"
echo "  Dry run:  yes"
echo ""

sleep 1.5

echo "  Risk: CRITICAL (72/100)"
echo ""
echo "  | Factor            | Score | Detail                       |"
echo "  |-------------------|-------|------------------------------|"
echo "  | Blocker Issues    | 30/30 | 4 blocker issues found       |"
echo "  | Security Concerns | 15/20 | 2 vulns (CWE-89, CWE-79)    |"
echo "  | Code Complexity   | 12/15 | 3 files with complexity > 15 |"
echo "  | Critical Issues   | 10/20 | 2 critical issues found      |"
echo "  | Issue Density     | 5/15  | 1.8 issues per file changed  |"
echo ""

sleep 1

echo "  Complexity Hotspots"
echo "  | File                       | Complexity | Cognitive |"
echo "  |----------------------------|------------|-----------|"
echo "  | src/payments/processor.ts  | 32         | 28        |"
echo "  | src/payments/validation.ts | 24         | 19        |"
echo "  | src/middleware/auth.ts     | 18         | 16        |"
echo ""

sleep 1

echo "  9 issues found across 5 files (4 BLOCKER, 2 CRITICAL, 3 MAJOR)"

sleep 0.5

echo ""
printf "\033[32m✅ Review complete!\033[0m\n"
echo "   Issues: 9 found, 9 reviewed | Comments: 9 posted"
echo "   PR Risk: CRITICAL (72/100)"
echo ""
echo "DONE"
