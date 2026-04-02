/**
 * IRA — Intelligent Review Assistant
 * Copilot AI Provider — uses VS Code's Language Model API
 * Zero config: works with the user's existing Copilot subscription
 */

import * as vscode from 'vscode';

export interface CopilotReviewResult {
  explanation: string;
  impact: string;
  suggestedFix: string;
}

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

  async review(prompt: string): Promise<CopilotReviewResult> {
    const fullText = await this.rawReview(prompt);
    return parseReviewResponse(fullText);
  }
}

function parseReviewResponse(text: string): CopilotReviewResult {
  // Try to parse structured response
  const explanationMatch = text.match(/(?:explanation|explain)[:\s]*(.+?)(?=\n(?:impact|suggest)|$)/is);
  const impactMatch = text.match(/impact[:\s]*(.+?)(?=\n(?:suggest|fix)|$)/is);
  const fixMatch = text.match(/(?:suggest(?:ed)?[\s_]*fix|fix)[:\s]*(.+?)$/is);

  if (explanationMatch && impactMatch && fixMatch) {
    return {
      explanation: explanationMatch[1].trim(),
      impact: impactMatch[1].trim(),
      suggestedFix: fixMatch[1].trim(),
    };
  }

  // Fallback: split text into thirds
  const lines = text.split('\n').filter(l => l.trim());
  const third = Math.ceil(lines.length / 3);

  return {
    explanation: lines.slice(0, third).join('\n').trim() || text,
    impact: lines.slice(third, third * 2).join('\n').trim() || 'See explanation above.',
    suggestedFix: lines.slice(third * 2).join('\n').trim() || 'Review the code based on the explanation.',
  };
}
