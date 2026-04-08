# IRA Demo: Requirement Completion Tracking
# Run: cd /path/to/IRA && vhs demos/5-requirement-tracking.tape

Output demos/ira-requirement-tracking.gif

Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 700
Set Padding 20
Set Margin 20
Set MarginFill "#0d1117"
Set BorderRadius 8
Set WindowBar Colorful
Set Theme "GitHub Dark"
Set TypingSpeed 35ms
Set LoopOffset 80%

Type "# Track requirement completion against JIRA ticket"
Sleep 300ms
Enter
Sleep 400ms

Type `echo 'npx ira-review review --pr 87 --scm-provider github --github-repo acme/auth-service --jira-url https://acme.atlassian.net --jira-ticket AUTH-234 --dry-run'`
Enter
Sleep 1.5s

Type "bash demos/simulate-requirements.sh"
Enter

Sleep 15s
