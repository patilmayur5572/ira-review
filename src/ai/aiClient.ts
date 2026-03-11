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

        return parseAIResponse(content);
      },
      { maxAttempts: 3, baseDelayMs: 2000 },
    );
  }
}

function parseAIResponse(content: string): AIReviewComment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      explanation: content,
      impact: "Could not parse structured response.",
      suggestedFix: "Review the issue manually.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      explanation: content,
      impact: "Could not parse structured response.",
      suggestedFix: "Review the issue manually.",
    };
  }

  const obj = parsed as Record<string, unknown>;

  return {
    explanation: typeof obj.explanation === "string" && obj.explanation
      ? obj.explanation
      : "No explanation provided.",
    impact: typeof obj.impact === "string" && obj.impact
      ? obj.impact
      : "No impact assessment provided.",
    suggestedFix: typeof obj.suggestedFix === "string" && obj.suggestedFix
      ? obj.suggestedFix
      : "No fix suggested.",
  };
}

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model ?? "gpt-4o-mini");
    default:
      throw new Error(`Unsupported AI provider: ${config.provider as string}`);
  }
}
