/**
 * Validates the VS Code walkthrough manifest in package.json.
 *
 * The walkthrough is declarative configuration — VS Code reads it on
 * extension install and renders the welcome page automatically. These tests
 * guard against schema drift: missing markdown files, broken command links,
 * or removed commands that walkthrough steps still reference.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const PKG_ROOT = path.dirname(PKG_PATH);
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));

const walkthroughs = pkg.contributes?.walkthroughs ?? [];
const declaredCommands = new Set<string>(
  (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command),
);

describe('VS Code Walkthrough manifest', () => {
  it('declares at least one walkthrough', () => {
    expect(walkthroughs.length).toBeGreaterThan(0);
  });

  it('every walkthrough has id, title, description, and steps', () => {
    for (const w of walkthroughs) {
      expect(w.id, `walkthrough missing id`).toBeTruthy();
      expect(w.title, `walkthrough ${w.id} missing title`).toBeTruthy();
      expect(w.description, `walkthrough ${w.id} missing description`).toBeTruthy();
      expect(Array.isArray(w.steps), `walkthrough ${w.id} steps must be an array`).toBe(true);
      expect(w.steps.length, `walkthrough ${w.id} must have at least one step`).toBeGreaterThan(0);
    }
  });

  it('every step references a markdown file that exists on disk', () => {
    for (const w of walkthroughs) {
      for (const step of w.steps) {
        const md = step.media?.markdown;
        expect(md, `step ${step.id} missing media.markdown`).toBeTruthy();
        const absPath = path.join(PKG_ROOT, md);
        expect(
          fs.existsSync(absPath),
          `step ${step.id} references missing markdown file: ${md}`,
        ).toBe(true);
      }
    }
  });

  it('every step has a unique id within its walkthrough', () => {
    for (const w of walkthroughs) {
      const ids = w.steps.map((s: { id: string }) => s.id);
      const unique = new Set(ids);
      expect(ids.length, `walkthrough ${w.id} has duplicate step ids`).toBe(unique.size);
    }
  });

  it('every command:ira.* link in step descriptions points to a registered command', () => {
    const linkRegex = /command:(ira\.[A-Za-z0-9]+)/g;
    for (const w of walkthroughs) {
      for (const step of w.steps) {
        const matches = [...(step.description ?? '').matchAll(linkRegex)];
        for (const m of matches) {
          const cmd = m[1];
          expect(
            declaredCommands.has(cmd),
            `step ${step.id} links to command ${cmd} which is not declared in contributes.commands`,
          ).toBe(true);
        }
      }
    }
  });

  it('every completionEvents onCommand:ira.* points to a registered command', () => {
    for (const w of walkthroughs) {
      for (const step of w.steps) {
        for (const evt of step.completionEvents ?? []) {
          const m = evt.match(/^onCommand:(ira\.[A-Za-z0-9]+)$/);
          if (m) {
            expect(
              declaredCommands.has(m[1]),
              `step ${step.id} completionEvent references unknown command ${m[1]}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('the Quick Start step is the first step (highest priority for new users)', () => {
    const getting = walkthroughs.find((w: { id: string }) => w.id === 'iraGettingStarted');
    expect(getting, 'iraGettingStarted walkthrough must exist').toBeTruthy();
    expect(getting.steps[0].id, 'first step should be Quick Start').toBe('iraQuickStart');
  });
});

describe('Walkthrough markdown content', () => {
  it('every markdown file has a top-level heading', () => {
    for (const w of walkthroughs) {
      for (const step of w.steps) {
        const md = path.join(PKG_ROOT, step.media.markdown);
        const content = fs.readFileSync(md, 'utf-8');
        expect(
          /^#\s+\S+/m.test(content),
          `${step.media.markdown} must start with a markdown heading`,
        ).toBe(true);
      }
    }
  });

  it('every markdown file is non-trivial (>200 bytes)', () => {
    for (const w of walkthroughs) {
      for (const step of w.steps) {
        const md = path.join(PKG_ROOT, step.media.markdown);
        const size = fs.statSync(md).size;
        expect(size, `${step.media.markdown} is suspiciously short (${size} bytes)`).toBeGreaterThan(200);
      }
    }
  });
});
