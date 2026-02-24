import { describe, it, expect, vi } from "vitest";
import { createAIProvider } from "../aiClient.js";

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    explanation: "This is a bug",
                    impact: "Could crash the app",
                    suggestedFix: "Replace X with Y",
                  }),
                },
              },
            ],
          }),
        },
      };
    },
  };
});

describe("createAIProvider", () => {
  it("creates an OpenAI provider", () => {
    const provider = createAIProvider({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    expect(provider).toBeDefined();
    expect(provider.review).toBeTypeOf("function");
  });

  it("returns structured AI review from OpenAI", async () => {
    const provider = createAIProvider({
      provider: "openai",
      apiKey: "sk-test",
    });

    const result = await provider.review("test prompt");

    expect(result.explanation).toBe("This is a bug");
    expect(result.impact).toBe("Could crash the app");
    expect(result.suggestedFix).toBe("Replace X with Y");
  });

  it("uses default model when not specified", () => {
    const provider = createAIProvider({
      provider: "openai",
      apiKey: "sk-test",
    });
    expect(provider).toBeDefined();
  });
});
