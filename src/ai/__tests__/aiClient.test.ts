import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAIProvider, parseAIResponse } from "../aiClient.js";
import type { AIConfig } from "../../types/config.js";

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

describe("createAIProvider - Azure OpenAI", () => {
  it("creates an Azure OpenAI provider", () => {
    const provider = createAIProvider({
      provider: "azure-openai",
      apiKey: "azure-key",
      baseUrl: "https://my-resource.openai.azure.com",
      deploymentName: "my-deployment",
      apiVersion: "2024-08-01-preview",
    });
    expect(provider).toBeDefined();
    expect(provider.review).toBeTypeOf("function");
  });

  it("throws when baseUrl is missing", () => {
    expect(() =>
      createAIProvider({
        provider: "azure-openai",
        apiKey: "azure-key",
      }),
    ).toThrow("Azure OpenAI requires a base URL");
  });
});

describe("createAIProvider - Anthropic", () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("creates an Anthropic provider", () => {
    const provider = createAIProvider({
      provider: "anthropic",
      apiKey: "anthropic-key",
      model: "claude-sonnet-4-20250514",
    });
    expect(provider).toBeDefined();
    expect(provider.review).toBeTypeOf("function");
  });

  it("returns structured AI review from Anthropic", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              explanation: "Anthropic found a bug",
              impact: "High impact",
              suggestedFix: "Fix it this way",
            }),
          },
        ],
      }),
    });

    const provider = createAIProvider({
      provider: "anthropic",
      apiKey: "anthropic-key",
    });

    const result = await provider.review("test prompt");
    expect(result.explanation).toBe("Anthropic found a bug");
    expect(result.impact).toBe("High impact");
    expect(result.suggestedFix).toBe("Fix it this way");
  });
});

describe("createAIProvider - Ollama", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("creates an Ollama provider", () => {
    const provider = createAIProvider({
      provider: "ollama",
      apiKey: "",
      model: "llama3",
      baseUrl: "http://localhost:11434",
    });
    expect(provider).toBeDefined();
    expect(provider.review).toBeTypeOf("function");
  });

  it("returns structured AI review from Ollama", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            explanation: "Ollama found an issue",
            impact: "Medium impact",
            suggestedFix: "Try this fix",
          }),
        },
      }),
    });

    const provider = createAIProvider({
      provider: "ollama",
      apiKey: "",
    });

    const result = await provider.review("test prompt");
    expect(result.explanation).toBe("Ollama found an issue");
    expect(result.impact).toBe("Medium impact");
    expect(result.suggestedFix).toBe("Try this fix");
  });
});

describe("parseAIResponse", () => {
  it("preserves object-shaped explanation as JSON string", () => {
    const content = JSON.stringify({
      explanation: { criteria: [{ id: "AC-1", given: "a", when: "b", then: "c" }], reviewHints: ["hint"] },
      impact: "test impact",
      suggestedFix: "test fix",
    });

    const result = parseAIResponse(content);
    // Should JSON.stringify the object, not replace with "No explanation provided."
    expect(result.explanation).toContain("criteria");
    expect(result.explanation).toContain("AC-1");
    expect(result.impact).toBe("test impact");
  });

  it("falls back to raw content when no explanation field exists", () => {
    const content = JSON.stringify({
      criteria: [{ id: "AC-1" }],
      reviewHints: ["hint"],
    });

    const result = parseAIResponse(content);
    // Should use the full content as explanation since no explicit explanation field
    expect(result.explanation).toContain("criteria");
  });
});

describe("createAIProvider - unsupported provider", () => {
  it("throws for unsupported provider", () => {
    expect(() =>
      createAIProvider({
        provider: "unsupported" as AIConfig["provider"],
        apiKey: "key",
      }),
    ).toThrow("Unsupported AI provider: unsupported");
  });
});
