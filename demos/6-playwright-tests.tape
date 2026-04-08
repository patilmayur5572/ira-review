# IRA Demo: Playwright Test Generation
# Run: cd /path/to/IRA && vhs demos/6-playwright-tests.tape

Output demos/ira-playwright-tests.gif

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

Type "# Generate Playwright E2E tests from JIRA acceptance criteria"
Sleep 300ms
Enter
Sleep 400ms

Type `echo 'npx ira-review generate-tests --jira-ticket PAY-301 --jira-url https://acme.atlassian.net --test-framework playwright --pr 156 --scm-provider github --github-repo acme/payments'`
Enter
Sleep 1.5s

Type "bash demos/simulate-playwright.sh"
Enter

Sleep 18s
