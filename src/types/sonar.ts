export type Severity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";

export interface SonarIssue {
  key: string;
  rule: string;
  severity: Severity;
  component: string;
  message: string;
  line?: number;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: SonarFlow[];
  type: string;
  effort?: string;
  tags: string[];
}

export interface SonarFlow {
  locations: SonarLocation[];
}

export interface SonarLocation {
  component: string;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  msg: string;
}

export interface SonarSearchResponse {
  total: number;
  p: number;
  ps: number;
  issues: SonarIssue[];
  components: SonarComponent[];
}

export interface SonarComponent {
  key: string;
  path?: string;
  name: string;
  qualifier: string;
}
