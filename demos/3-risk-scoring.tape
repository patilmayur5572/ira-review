# IRA Demo: PR Risk Scoring
# Run: cd /path/to/IRA && vhs demos/3-risk-scoring.tape

Output demos/ira-risk-scoring.gif

Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 650
Set Padding 20
Set Margin 20
Set MarginFill "#0d1117"
Set BorderRadius 8
Set WindowBar Colorful
Set Theme "GitHub Dark"
Set TypingSpeed 35ms
Set LoopOffset 80%

Type "# PR risk scoring with Sonar + AI"
Sleep 300ms
Enter
Sleep 400ms

Type `echo 'npx ira-review review --pr 156 --scm-provider github --github-repo acme/payments --ai-provider anthropic --sonar-url https://sonarcloud.io --project-key my-org_payments-service --dry-run'`
Enter
Sleep 1.5s

Type "bash demos/simulate-risk.sh"
Enter

Sleep 15s
