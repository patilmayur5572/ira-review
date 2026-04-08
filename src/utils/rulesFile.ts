import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface IraRule {
  id?: string;
  message: string;
  bad?: string;
  good?: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR';
  paths?: string[];
  author?: string;
  createdAt?: string;
}

export interface SensitiveArea {
  glob: string;
  label: string;
}

export interface IraRulesFile {
  rules: IraRule[];
  sensitiveAreas?: SensitiveArea[];
}

const VALID_SEVERITIES = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] as const;
const MAX_RULES = 30;

function loadRawRulesFile(cwd?: string): Record<string, unknown> | null {
  const dir = cwd ?? process.cwd();
  const filePath = resolve(dir, '.ira-rules.json');

  if (!existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch {
    console.warn('IRA: .ira-rules.json has syntax errors. Team rules will not be enforced.');
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    console.warn('IRA: .ira-rules.json has syntax errors. Team rules will not be enforced.');
    return null;
  }

  return parsed as Record<string, unknown>;
}

export function loadRulesFile(cwd?: string): IraRule[] {
  const parsed = loadRawRulesFile(cwd);

  if (!parsed || !Array.isArray(parsed.rules)) {
    if (parsed) {
      console.warn('IRA: .ira-rules.json has syntax errors. Team rules will not be enforced.');
    }
    return [];
  }

  const rawRules = parsed.rules as unknown[];
  const valid: IraRule[] = [];

  for (const entry of rawRules) {
    if (!entry || typeof entry !== 'object') {
      console.warn("IRA: Skipping invalid rule — missing 'message' or 'severity'");
      continue;
    }

    const rule = entry as Record<string, unknown>;

    if (typeof rule.message !== 'string' || typeof rule.severity !== 'string') {
      console.warn("IRA: Skipping invalid rule — missing 'message' or 'severity'");
      continue;
    }

    if (!VALID_SEVERITIES.includes(rule.severity as typeof VALID_SEVERITIES[number])) {
      console.warn(`IRA: Skipping rule — invalid severity '${rule.severity}'. Use BLOCKER, CRITICAL, MAJOR, or MINOR.`);
      continue;
    }

    valid.push({
      message: rule.message,
      severity: rule.severity as IraRule['severity'],
      ...(typeof rule.id === 'string' && { id: rule.id }),
      ...(typeof rule.bad === 'string' && { bad: rule.bad }),
      ...(typeof rule.good === 'string' && { good: rule.good }),
      ...(Array.isArray(rule.paths) && { paths: rule.paths.filter((p): p is string => typeof p === 'string') }),
      ...(typeof rule.author === 'string' && { author: rule.author }),
      ...(typeof rule.createdAt === 'string' && { createdAt: rule.createdAt }),
    });
  }

  if (valid.length > MAX_RULES) {
    console.warn('IRA: .ira-rules.json has more than 30 rules. Only the first 30 will be enforced. Tip: Move deterministic rules to ESLint and keep only nuanced, context-dependent rules in IRA.');
    return valid.slice(0, MAX_RULES);
  }

  return valid;
}

export function filterRulesByPath(rules: IraRule[], filePath: string): IraRule[] {
  return rules.filter((rule) => {
    if (!rule.paths || rule.paths.length === 0) {
      return true;
    }
    return rule.paths.some((pattern) => matchPattern(pattern, filePath));
  });
}

function matchPattern(pattern: string, filePath: string): boolean {
  // Handle **/*.ext patterns (match any file ending with .ext)
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3); // e.g. "*.test.ts"
    if (suffix.startsWith('*')) {
      // **/*.test.ts -> match files ending with .test.ts
      const ext = suffix.slice(1); // ".test.ts"
      return filePath.endsWith(ext);
    }
    // **/foo -> match any path ending with /foo or equal to foo
    return filePath.endsWith('/' + suffix) || filePath === suffix;
  }

  // Handle prefix/** patterns (match any file starting with prefix/)
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3); // e.g. "src/api"
    return filePath.startsWith(prefix + '/') || filePath === prefix;
  }

  // Exact match
  return filePath === pattern;
}

export function loadSensitiveAreas(cwd?: string): SensitiveArea[] {
  const parsed = loadRawRulesFile(cwd);

  if (!parsed || !Array.isArray(parsed.sensitiveAreas)) {
    return [];
  }

  const seen = new Set<string>();
  return (parsed.sensitiveAreas as unknown[])
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .filter((glob) => {
      if (seen.has(glob)) return false;
      seen.add(glob);
      return true;
    })
    .map((glob) => ({
      glob,
      label: deriveLabelFromGlob(glob),
    }));
}

function deriveLabelFromGlob(glob: string): string {
  // "src/services/payment/**" → "payment"
  // "**/auth/**" → "auth"
  // "src/config/database.*" → "database"
  const cleaned = glob.replace(/\*+\/?/g, '').replace(/\/$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? glob;
  // Remove file extension if present
  return last.replace(/\.[^.]+$/, '');
}

export function matchSensitiveArea(areas: SensitiveArea[], filePath: string): SensitiveArea | null {
  return areas.find((area) => matchPattern(area.glob, filePath)) ?? null;
}

export function formatSensitiveAreaForPrompt(area: SensitiveArea): string {
  return `## ⚠️ Sensitive Area\nThis file is in a sensitive area: **${area.label}** (${area.glob}). Review this code with extra scrutiny — issues here have higher blast radius.`;
}

export function formatRulesForPrompt(rules: IraRule[]): string {
  if (rules.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Team Rules',
    'Your team has defined the following coding standards. Consider them when reviewing the code above.',
    '',
  ];

  rules.forEach((rule, index) => {
    lines.push(`Rule ${index + 1}: ${rule.message}`);
    lines.push(`Severity: ${rule.severity}`);
    if (rule.bad) {
      lines.push('BAD:');
      lines.push(rule.bad);
    }
    if (rule.good) {
      lines.push('GOOD:');
      lines.push(rule.good);
    }
    lines.push('');
  });

  return lines.join('\n');
}
