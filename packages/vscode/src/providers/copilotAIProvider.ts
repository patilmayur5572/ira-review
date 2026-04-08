/**
 * IRA — Intelligent Review Assistant
 * Copilot AI Provider — uses VS Code's Language Model API
 * Zero config: works with the user's existing Copilot subscription
 */

import * as vscode from 'vscode';
import { parseAIResponse } from 'ira-review';
import type { AIReviewComment } from 'ira-review';

export class CopilotAIProvider {
  async rawReview(prompt: string): Promise<string> {
    const model = await this.selectModel();
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages);
    let fullText = '';
    for await (const chunk of response.text) {
      fullText += chunk;
    }
    return fullText;
  }

  private async selectModel(): Promise<vscode.LanguageModelChat> {
    const preferredFamilies = ['claude-3.5-sonnet', 'gpt-4o', 'o1', 'gpt-4', 'claude-3-haiku'];

    for (const family of preferredFamilies) {
      const models = await vscode.lm.selectChatModels({ family });
      if (models.length > 0) {
        return models[0];
      }
    }

    const allModels = await vscode.lm.selectChatModels();
    if (allModels.length > 0) {
      return allModels[0];
    }

    throw new Error('No Copilot language model available. Make sure GitHub Copilot is installed and signed in.');
  }

  async review(prompt: string): Promise<AIReviewComment> {
    const fullText = await this.rawReview(prompt);
    // Strip markdown code fences that Copilot often wraps around JSON
    const cleaned = fullText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return parseAIResponse(cleaned);
  }
}
