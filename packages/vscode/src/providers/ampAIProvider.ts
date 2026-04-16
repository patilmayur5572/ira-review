/**
 * IRA — Intelligent Review Assistant
 * AMP AI Provider — uses AMP CLI for code reviews
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
      const child = cp.spawn('amp', [
        '--execute', '--stream-json',
        '--mode', this.mode,
        prompt,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let result = '';
      let errorOutput = '';

      let stdoutBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        // Keep the last element — it may be an incomplete line
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
            // Non-JSON line — ignore
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
            // Non-JSON residual — ignore
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
  concurrency: number = 5,
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
