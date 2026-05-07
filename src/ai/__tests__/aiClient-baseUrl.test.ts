import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the constructor args passed to the OpenAI SDK so we can verify that
// `baseURL` is threaded through when --ai-base-url / IRA_AI_BASE_URL is set.
const constructorCalls: Array<Record<string, unknown>> = [];

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      constructor(opts: Record<string, unknown>) {
        constructorCalls.push(opts);
      }
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "{}" } }],
          }),
        },
      };
    },
  };
});

beforeEach(() => {
  constructorCalls.length = 0;
});

describe("OpenAIProvider — --ai-base-url support", () => {
  it("passes baseURL to the OpenAI SDK when config.baseUrl is set", async () => {
    const { createAIProvider } = await import("../aiClient.js");
    createAIProvider({
      provider: "openai",
      apiKey: "sk-x",
      model: "gpt-4o-mini",
      baseUrl: "https://models.inference.ai.azure.com",
    });
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({
      apiKey: "sk-x",
      baseURL: "https://models.inference.ai.azure.com",
    });
  });

  it("omits baseURL when not configured (preserves OpenAI default)", async () => {
    const { createAIProvider } = await import("../aiClient.js");
    createAIProvider({
      provider: "openai",
      apiKey: "sk-x",
    });
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].baseURL).toBeUndefined();
  });
});
