# IRA Demo: AI Test Case Generation
# Run: cd /path/to/IRA && vhs demos/4-test-generation.tape

Output demos/ira-test-generation.gif

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

Type "# Generate test cases from JIRA acceptance criteria"
Sleep 300ms
Enter
Sleep 400ms

Type `echo 'npx ira-review generate-tests --jira-ticket AUTH-234 --jira-url https://acme.atlassian.net --test-framework vitest --pr 87 --scm-provider github --github-repo acme/auth-service'`
Enter
Sleep 1.5s

Type "bash demos/simulate-tests.sh"
Enter

Sleep 18s
