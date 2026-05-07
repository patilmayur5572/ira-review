import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";

// Capture the spawn args + simulate copilot CLI output per-test.
let lastSpawnArgs: { cmd: string; args: string[]; opts: Record<string, unknown> } | undefined;
let mockChildSetup: (child: MockChild) => void = () => {};

class MockChild extends EventEmitter {
  stdout = new EventEmitter() as Readable;
  stderr = new EventEmitter() as Readable;
}

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[], opts: Record<string, unknown>) => {
      lastSpawnArgs = { cmd, args, opts };
      const child = new MockChild();
      // Defer to next tick so the caller can attach listeners first.
      setImmediate(() => mockChildSetup(child));
      return child;
    }),
  };
});

beforeEach(() => {
  lastSpawnArgs = undefined;
  mockChildSetup = () => {};
});

describe("CopilotCliProvider", () => {
  it("spawns `copilot` with the documented v0.0.367 flag set", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");

    mockChildSetup = (child) => {
      child.stdout.emit("data", Buffer.from('{"explanation":"x","impact":"y","suggestedFix":"z"}'));
      child.emit("close", 0);
    };

    const provider = new CopilotCliProvider("gpt-4.1");
    const result = await provider.review("test prompt");

    expect(lastSpawnArgs?.cmd).toBe("copilot");
    expect(lastSpawnArgs?.args).toEqual([
      "-p", "test prompt",
      "-s",
      "--allow-all-tools",
      "--no-color",
      "--model=gpt-4.1",
    ]);
    expect(result.explanation).toBe("x");
    expect(result.impact).toBe("y");
    expect(result.suggestedFix).toBe("z");
  });

  it("defaults to gpt-4.1 when no model is provided", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    const provider = new CopilotCliProvider();

    mockChildSetup = (child) => {
      child.stdout.emit("data", Buffer.from('{"explanation":"a","impact":"b","suggestedFix":"c"}'));
      child.emit("close", 0);
    };

    await provider.review("p");
    expect(lastSpawnArgs?.args).toContain("--model=gpt-4.1");
  });

  it("honours COPILOT_MODEL env var when no model is provided", async () => {
    process.env.COPILOT_MODEL = "claude-sonnet-4.5";
    try {
      const { CopilotCliProvider } = await import("../aiClient.js");
      const provider = new CopilotCliProvider();

      mockChildSetup = (child) => {
        child.stdout.emit("data", Buffer.from('{"explanation":"a","impact":"b","suggestedFix":"c"}'));
        child.emit("close", 0);
      };

      await provider.review("p");
      expect(lastSpawnArgs?.args).toContain("--model=claude-sonnet-4.5");
    } finally {
      delete process.env.COPILOT_MODEL;
    }
  });

  it("strips defensive code-fence wrapping from output (forward-compat)", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    mockChildSetup = (child) => {
      child.stdout.emit("data", Buffer.from('```json\n{"explanation":"e","impact":"i","suggestedFix":"f"}\n```'));
      child.emit("close", 0);
    };
    const result = await new CopilotCliProvider().review("p");
    expect(result.explanation).toBe("e");
  });

  it("rejects with hint when GITHUB_TOKEN is bad (401/forbidden)", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    mockChildSetup = (child) => {
      child.stderr.emit("data", Buffer.from("HTTP 401 Unauthorized"));
      child.emit("close", 1);
    };
    await expect(new CopilotCliProvider().review("p")).rejects.toThrow(/Copilot Requests/);
  });

  it("rejects with hint when folder is untrusted", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    mockChildSetup = (child) => {
      child.stderr.emit("data", Buffer.from("untrusted folder /workspace"));
      child.emit("close", 1);
    };
    await expect(new CopilotCliProvider().review("p")).rejects.toThrow(/trusted_folders/);
  });

  it("rejects with proxy hint on network failure", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    mockChildSetup = (child) => {
      child.stderr.emit("data", Buffer.from("getaddrinfo ENOTFOUND api.github.example.com"));
      child.emit("close", 1);
    };
    await expect(new CopilotCliProvider().review("p")).rejects.toThrow(/HTTPS_PROXY/);
  });

  it("rejects with install hint when copilot binary is not on PATH", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");
    mockChildSetup = (child) => {
      const err = new Error("spawn copilot ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      child.emit("error", err);
    };
    await expect(new CopilotCliProvider().review("p")).rejects.toThrow(/npm install -g @github\/copilot/);
  });
});

describe("createAIProvider — copilot-cli", () => {
  it("creates a CopilotCliProvider when provider is copilot-cli", async () => {
    const { createAIProvider, CopilotCliProvider } = await import("../aiClient.js");
    const provider = createAIProvider({
      provider: "copilot-cli",
      apiKey: "",        // not used by this provider
      model: "gpt-5",
    });
    expect(provider).toBeInstanceOf(CopilotCliProvider);
  });
});
