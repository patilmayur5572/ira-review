import OpenAI from "openai";
import type { AIConfig } from "../types/config.js";
import type { AIProvider, AIReviewComment } from "../types/review.js";
import { withRetry } from "../utils/retry.js";

class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async review(prompt: string): Promise<AIReviewComment> {
    return withRetry(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        const parsed = JSON.parse(content) as AIReviewComment;
        return {
          explanation: parsed.explanation ?? "No explanation provided.",
          impact: parsed.impact ?? "No impact assessment provided.",
          suggestedFix: parsed.suggestedFix ?? "No fix suggested.",
        };
      },
      { maxAttempts: 3, baseDelayMs: 2000 },
    );
  }
}

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model ?? "gpt-4o-mini");
    default:
      throw new Error(`Unsupported AI provider: ${config.provider as string}`);
  }
}
