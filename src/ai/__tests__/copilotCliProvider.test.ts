import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";

// Capture the spawn args + simulate copilot CLI output per-test.
let lastSpawnArgs: { cmd: string; args: string[]; opts: Record<string, unknown> } | undefined;
let lastStdinWrites: string[] = [];
let lastStdinEnded = false;
let mockChildSetup: (child: MockChild) => void = () => {};

class MockChild extends EventEmitter {
  stdout = new EventEmitter() as Readable;
  stderr = new EventEmitter() as Readable;
  // Writable-ish stub that records what the provider feeds in via stdin.
  stdin = {
    write: (chunk: string | Buffer): boolean => {
      lastStdinWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    },
    end: (): void => { lastStdinEnded = true; },
  };
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
  lastStdinWrites = [];
  lastStdinEnded = false;
  mockChildSetup = () => {};
});

describe("CopilotCliProvider", () => {
  it("spawns `copilot` with constant flags and pipes the prompt via stdin (avoids Windows 8191-char cmd.exe limit)", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");

    mockChildSetup = (child) => {
      child.stdout.emit("data", Buffer.from('{"explanation":"x","impact":"y","suggestedFix":"z"}'));
      child.emit("close", 0);
    };

    const provider = new CopilotCliProvider("gpt-4.1");
    const result = await provider.review("test prompt");

    expect(lastSpawnArgs?.cmd).toBe("copilot");
    // Prompt must NOT appear in args — it goes via stdin so the command line
    // stays small enough to fit Windows' cmd.exe 8191-char limit even for
    // multi-file PR diffs.
    expect(lastSpawnArgs?.args).toEqual([
      "-p", "",
      "-s",
      "--allow-all-tools",
      "--no-color",
      "--model=gpt-4.1",
    ]);
    expect(lastSpawnArgs?.args).not.toContain("test prompt");
    // Prompt must arrive via stdin and stdin must be closed so copilot knows
    // the input is complete (otherwise it'd hang waiting for more bytes).
    expect(lastStdinWrites.join("")).toBe("test prompt");
    expect(lastStdinEnded).toBe(true);
    expect(result.explanation).toBe("x");
    expect(result.impact).toBe("y");
    expect(result.suggestedFix).toBe("z");
  });

  it("pipes a 50KB prompt via stdin without ever placing it on the command line", async () => {
    const { CopilotCliProvider } = await import("../aiClient.js");

    mockChildSetup = (child) => {
      child.stdout.emit("data", Buffer.from('{"explanation":"ok","impact":"ok","suggestedFix":"ok"}'));
      child.emit("close", 0);
    };

    // ~50KB — far above Windows cmd.exe's 8191-char limit and Node's CreateProcess
    // 32767-char limit. Has to go through stdin to work at all on Windows.
    const hugePrompt = "// large diff line\n".repeat(2700);
    expect(hugePrompt.length).toBeGreaterThan(40_000);

    const provider = new CopilotCliProvider("gpt-4.1");
    await provider.review(hugePrompt);

    // The args slot reserved for the prompt is empty — nothing leaked onto the cmd line.
    expect(lastSpawnArgs?.args[0]).toBe("-p");
    expect(lastSpawnArgs?.args[1]).toBe("");
    // The full prompt arrived via stdin verbatim and stdin was closed.
    expect(lastStdinWrites.join("")).toBe(hugePrompt);
    expect(lastStdinEnded).toBe(true);
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
