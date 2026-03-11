import { describe, it, expect, vi, afterEach } from "vitest";
import { ComplexityAnalyzer } from "../complexityAnalyzer.js";

vi.mock("../../utils/retry.js", () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const sonarConfig = {
  baseUrl: "https://sonar.example.com",
  token: "test-token",
  projectKey: "my-project",
};

function makeMeasuresResponse(
  components: Array<{
    key: string;
    path?: string;
    measures: Array<{ metric: string; value: string }>;
  }>,
) {
  return {
    components,
    paging: { total: components.length, pageIndex: 1, pageSize: 500 },
  };
}

describe("ComplexityAnalyzer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses complexity metrics correctly", async () => {
    const response = makeMeasuresResponse([
      {
        key: "my-project:src/app.ts",
        path: "src/app.ts",
        measures: [
          { metric: "complexity", value: "12" },
          { metric: "cognitive_complexity", value: "8" },
          { metric: "ncloc", value: "150" },
        ],
      },
      {
        key: "my-project:src/utils.ts",
        path: "src/utils.ts",
        measures: [
          { metric: "complexity", value: "5" },
          { metric: "cognitive_complexity", value: "3" },
          { metric: "ncloc", value: "40" },
        ],
      },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const analyzer = new ComplexityAnalyzer(sonarConfig);
    const report = await analyzer.analyze("42");

    expect(report.files).toHaveLength(2);
    expect(report.files[0].filePath).toBe("src/app.ts");
    expect(report.files[0].complexity).toBe(12);
    expect(report.files[0].cognitiveComplexity).toBe(8);
    expect(report.files[0].linesOfCode).toBe(150);
    expect(report.averageComplexity).toBe(8.5);
    expect(report.averageCognitiveComplexity).toBe(5.5);
  });

  it("detects hotspots when complexity exceeds threshold (15)", async () => {
    const response = makeMeasuresResponse([
      {
        key: "my-project:src/complex.ts",
        path: "src/complex.ts",
        measures: [
          { metric: "complexity", value: "25" },
          { metric: "cognitive_complexity", value: "20" },
          { metric: "ncloc", value: "300" },
        ],
      },
      {
        key: "my-project:src/simple.ts",
        path: "src/simple.ts",
        measures: [
          { metric: "complexity", value: "3" },
          { metric: "cognitive_complexity", value: "2" },
          { metric: "ncloc", value: "20" },
        ],
      },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const analyzer = new ComplexityAnalyzer(sonarConfig);
    const report = await analyzer.analyze("42");

    expect(report.hotspots).toHaveLength(1);
    expect(report.hotspots[0].filePath).toBe("src/complex.ts");
    expect(report.hotspots[0].complexity).toBe(25);
  });

  it("returns empty report for empty response", async () => {
    const response = makeMeasuresResponse([]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const analyzer = new ComplexityAnalyzer(sonarConfig);
    const report = await analyzer.analyze("42");

    expect(report.files).toHaveLength(0);
    expect(report.hotspots).toHaveLength(0);
    expect(report.averageComplexity).toBe(0);
    expect(report.averageCognitiveComplexity).toBe(0);
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const analyzer = new ComplexityAnalyzer(sonarConfig);

    await expect(analyzer.analyze("42")).rejects.toThrow(
      "Sonar Measures API error (401)",
    );
  });
});
