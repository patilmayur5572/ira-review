import type { SonarConfig } from "../types/config.js";
import type { ComplexityReport, ComplexityMetric } from "../types/risk.js";
import { withRetry, fetchWithTimeout, RetryableError } from "../utils/retry.js";

const COMPLEXITY_THRESHOLD = 15;

interface SonarMeasure {
  metric: string;
  value: string;
}

interface SonarComponentMeasure {
  key: string;
  path?: string;
  measures: SonarMeasure[];
}

interface SonarMeasuresResponse {
  components: SonarComponentMeasure[];
  paging: { total: number; pageIndex: number; pageSize: number };
}

export class ComplexityAnalyzer {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly projectKey: string;

  constructor(config: SonarConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.projectKey = config.projectKey;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    };
  }

  async analyze(pullRequestId: string): Promise<ComplexityReport> {
    const metrics = await this.fetchComplexityMetrics(pullRequestId);

    const averageComplexity =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.complexity, 0) / metrics.length
        : 0;

    const averageCognitiveComplexity =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.cognitiveComplexity, 0) /
          metrics.length
        : 0;

    const hotspots = metrics.filter(
      (m) =>
        m.complexity > COMPLEXITY_THRESHOLD ||
        m.cognitiveComplexity > COMPLEXITY_THRESHOLD,
    );

    return {
      files: metrics,
      averageComplexity,
      averageCognitiveComplexity,
      hotspots,
    };
  }

  private async fetchComplexityMetrics(
    pullRequestId: string,
  ): Promise<ComplexityMetric[]> {
    return withRetry(async () => {
      const params = new URLSearchParams({
        component: this.projectKey,
        pullRequest: pullRequestId,
        metricKeys: "complexity,cognitive_complexity,ncloc",
        qualifiers: "FIL",
        ps: "500",
      });

      const url = `${this.baseUrl}/api/measures/component_tree?${params}`;
      const response = await fetchWithTimeout(url, { headers: this.headers });

      if (!response.ok) {
        const body = await response.text();
        throw new RetryableError(
          `Sonar Measures API error (${response.status}): ${body}`,
          response.status,
        );
      }

      const data = (await response.json()) as SonarMeasuresResponse;

      return data.components.map((comp) => {
        const getValue = (metric: string) =>
          Number(comp.measures.find((m) => m.metric === metric)?.value ?? 0);

        const colonIndex = (comp.path ?? comp.key).indexOf(":");
        const filePath =
          colonIndex >= 0
            ? (comp.path ?? comp.key).slice(colonIndex + 1)
            : (comp.path ?? comp.key);

        return {
          filePath,
          complexity: getValue("complexity"),
          cognitiveComplexity: getValue("cognitive_complexity"),
          linesOfCode: getValue("ncloc"),
        };
      });
    });
  }
}
