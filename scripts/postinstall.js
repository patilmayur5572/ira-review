#!/usr/bin/env node

/**
 * IRA — Intelligent Review Assistant
 * Post-install nudge (TTY-gated, max 3 lines).
 */

if (process.stdout.isTTY) {
  console.log("");
  console.log("🚀 IRA installed! Run your first AI review:");
  console.log("   ira-review review --pr <number> --dry-run");
  console.log("");
}
