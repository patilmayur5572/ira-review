# IRA Demo: AI Code Review Comments
# Run: cd /path/to/IRA && vhs demos/1-code-review.tape

Output demos/ira-code-review.gif

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

Type "# AI code review on a GitHub PR"
Sleep 300ms
Enter
Sleep 400ms

Type `echo 'npx ira-review review --pr 42 --scm-provider github --github-repo acme/web-app --dry-run'`
Enter
Sleep 1.5s

Type "bash demos/simulate-review.sh"
Enter

Sleep 15s
