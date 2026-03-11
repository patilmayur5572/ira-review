export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFactor {
  name: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface RiskReport {
  level: RiskLevel;
  score: number;
  maxScore: number;
  factors: RiskFactor[];
  summary: string;
}

export interface ComplexityMetric {
  filePath: string;
  complexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
}

export interface ComplexityReport {
  files: ComplexityMetric[];
  averageComplexity: number;
  averageCognitiveComplexity: number;
  hotspots: ComplexityMetric[];
}
