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
│   Proprietary License                                        │
│                                                              │
│   This software is proprietary. See the LICENSE file for     │
│   full terms. Unauthorized copying or distribution is        │
│   prohibited.                                                │
│                                                              │
│   🏢 Commercial licenses available for teams and             │
│   enterprise use.                                            │
│                                                              │
│   📧 Contact: patilmayur5572@gmail.com                       │
│   📖 License: https://github.com/patilmayur5572/ira-review  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
`;

console.log(NOTICE);
