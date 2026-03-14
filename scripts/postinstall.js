#!/usr/bin/env node

/**
 * IRA — Intelligent Review Assistant
 * AGPL-3.0 License Notice
 *
 * This postinstall script displays a license reminder.
 * It does NOT collect any data or telemetry.
 */

const NOTICE = `
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   IRA — Intelligent Review Assistant                         │
│   Licensed under AGPL-3.0                                    │
│                                                              │
│   ⚖️  AGPL-3.0 requires that any modifications or use in     │
│   network services (including CI/CD) must make the full      │
│   source code available under the same license.              │
│                                                              │
│   🏢 For commercial/proprietary use without AGPL             │
│   obligations, a commercial license is available.            │
│                                                              │
│   📧 Contact: patilmayur5572@gmail.com                       │
│   📖 License: https://github.com/patilmayur5572/ira-review  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
`;

console.log(NOTICE);
