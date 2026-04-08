/**
 * IRA — Intelligent Review Assistant
 * Ollama Setup Service — guides users without Copilot/AI keys to a working setup
 */

import * as vscode from 'vscode';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';

/** Check if Ollama is running locally */
async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** List models already pulled in Ollama */
async function listLocalModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ name: string }> };
    return (data.models ?? []).map(m => m.name);
  } catch {
    return [];
  }
}

/** Pull a model in Ollama, showing progress */
async function pullModel(model: string): Promise<boolean> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `IRA: Pulling ${model}… this may take a few minutes`, cancellable: false },
    async () => {
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model }),
        });
        if (!response.ok) return false;
        // Consume the streaming response to wait for completion
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
        return true;
      } catch {
        return false;
      }
    },
  );
}

/** Configure IRA settings to use Ollama */
async function configureOllama(model: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('ira');
  await config.update('aiProvider', 'ollama', vscode.ConfigurationTarget.Global);
  await config.update('aiModel', model, vscode.ConfigurationTarget.Global);
}

/**
 * Full Ollama setup flow:
 * 1. Check if Ollama is running
 * 2. If yes → check for models → pull if needed → configure
 * 3. If no → open download page
 * 4. After setup → auto-review open file if available
 */
export async function setupOllama(): Promise<void> {
  const running = await isOllamaRunning();

  if (!running) {
    const action = await vscode.window.showInformationMessage(
      'IRA: Ollama is not running. Install it (free, ~2 min), then run this command again.',
      'Download Ollama',
    );
    if (action === 'Download Ollama') {
      vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/download'));
    }
    return;
  }

  // Ollama is running — check for available models
  const models = await listLocalModels();

  let model: string;
  if (models.length > 0) {
    // Use the first available model
    model = models[0];
  } else {
    // No models — pull the default
    const pulled = await pullModel(DEFAULT_MODEL);
    if (!pulled) {
      vscode.window.showErrorMessage('IRA: Failed to pull model. Check that Ollama is running and try again.');
      return;
    }
    model = DEFAULT_MODEL;
  }

  await configureOllama(model);

  // Auto-review the open file if one exists
  if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.getText().trim()) {
    const runNow = await vscode.window.showInformationMessage(
      `IRA: Ollama configured with ${model}. Want to run a review on the open file?`,
      'Review Now',
    );
    if (runNow === 'Review Now') {
      await vscode.commands.executeCommand('ira.reviewFile');
    }
  } else {
    vscode.window.showInformationMessage(`IRA: You're all set! Right-click any file to start a review.`);
  }
}

/**
 * Show the guided setup notification when no AI provider is available.
 * Called from reviewFile/reviewPR catch blocks.
 */
export async function showAISetupPrompt(): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    'IRA needs an AI engine to review code. Want to set up Ollama? It\'s free and runs locally.',
    'Setup Ollama',
    'I have an API key',
  );

  if (action === 'Setup Ollama') {
    await vscode.commands.executeCommand('ira.setupOllama');
  } else if (action === 'I have an API key') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'ira.aiProvider');
  }
}

/** Check if an error message indicates no AI provider is available */
export function isNoAIProviderError(message: string): boolean {
  return message.includes('No Copilot language model available')
    || message.includes('No language model available');
}
