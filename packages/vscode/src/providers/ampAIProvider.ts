/**
 * IRA - Intelligent Review Assistant
 * AMP AI Provider - uses AMP CLI for code reviews
 * Requires: `amp` CLI installed and authenticated (`amp login`)
 */

import * as cp from 'child_process';
import { parseAIResponse } from 'ira-review';
import type { AIReviewComment } from 'ira-review';

export type AmpMode = 'smart' | 'rush' | 'deep';

/** Check whether the AMP CLI is available on the system PATH. */
export function isAmpCliAvailable(): boolean {
  try {
    cp.execSync('amp --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export class AmpAIProvider {
  private readonly mode: AmpMode;

  constructor(mode: AmpMode = 'smart') {
    this.mode = mode;
  }

  async rawReview(prompt: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // VS Code extension host may not inherit shell env vars (proxy, certs).
      // Scan user shell configs and merge any missing network/SSL vars.
      const env = { ...process.env };
      const os = require('os');
      const fs = require('fs');
      const path = require('path');
      const home = os.homedir();
      const isWin = process.platform === 'win32';

      const networkVars = [
        'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
        'http_proxy', 'https_proxy', 'no_proxy',
        'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS',
        'REQUESTS_CA_BUNDLE',
        'NODE_TLS_REJECT_UNAUTHORIZED',
      ];

      const missingVars = networkVars.filter(v => !env[v]);
      if (missingVars.length > 0) {
        const rcFiles = isWin
          ? [
              path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
              path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
            ]
          : ['.zshenv', '.zshrc', '.bashrc', '.bash_profile'].map(f => path.join(home, f));

        for (const rcPath of rcFiles) {
          try {
            const content = fs.readFileSync(rcPath, 'utf-8');
            for (const varName of missingVars) {
              if (env[varName]) continue;
              // Unix: export VAR=value / PowerShell: $env:VAR = "value"
              const re = isWin
                ? new RegExp(`\\$env:${varName}\\s*=\\s*["']?(.+?)["']?\\s*$`, 'm')
                : new RegExp(`${varName}=(.+?)(?:\\s|$)`);
              const match = content.match(re);
              if (match) {
                env[varName] = match[1].replace(/['"]/g, '').replace(/^~/, home).replace(/%USERPROFILE%/gi, home).trim();
              }
            }
          } catch { /* file not found */ }
        }
      }

      // Resolve tilde in cert paths
      for (const v of ['SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'REQUESTS_CA_BUNDLE']) {
        if (env[v]) env[v] = env[v].replace(/^~/, home);
      }

      const child = cp.spawn('amp', [
        '--execute', '--stream-json',
        '--mode', this.mode,
      ], { stdio: ['pipe', 'pipe', 'pipe'], env });

      child.stdin.write(prompt);
      child.stdin.end();

      let result = '';
      let errorOutput = '';

      let stdoutBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        // Keep the last element - it may be an incomplete line
        stdoutBuffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'result') {
              if (msg.is_error) {
                errorOutput = msg.error || 'AMP returned an error';
              } else {
                result = msg.result ?? '';
              }
            }
          } catch {
            // Non-JSON line - ignore
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        errorOutput += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`AMP CLI error: ${err.message}`));
      });

      child.on('close', (code) => {
        // Flush any remaining buffered data
        if (stdoutBuffer.trim()) {
          try {
            const msg = JSON.parse(stdoutBuffer);
            if (msg.type === 'result') {
              if (msg.is_error) {
                errorOutput = msg.error || 'AMP returned an error';
              } else {
                result = msg.result ?? '';
              }
            }
          } catch {
            // Non-JSON residual - ignore
          }
        }

        if (result) {
          resolve(result);
        } else if (errorOutput) {
          reject(new Error(`AMP CLI failed: ${errorOutput.trim()}`));
        } else if (code !== 0) {
          reject(new Error(`AMP CLI exited with code ${code}`));
        } else {
          resolve('');
        }
      });
    });
  }

  async review(prompt: string): Promise<AIReviewComment> {
    const fullText = await this.rawReview(prompt);
    const cleaned = fullText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return parseAIResponse(cleaned);
  }
}

/**
 * Review multiple prompts in parallel using AMP CLI.
 * Each prompt gets its own independent CLI process.
 */
export async function ampParallelReview(
  prompts: Array<{ key: string; prompt: string }>,
  mode: AmpMode,
  concurrency: number = 10,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const amp = new AmpAIProvider(mode);
  const queue = [...prompts];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const result = await amp.rawReview(item.prompt);
        results.set(item.key, result);
      } catch (error) {
        console.warn(`IRA: AMP review skipped for ${item.key}: ${error instanceof Error ? error.message : error}`);
        results.set(item.key, '');
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, prompts.length) }, () => processNext());
  await Promise.all(workers);
  return results;
}
