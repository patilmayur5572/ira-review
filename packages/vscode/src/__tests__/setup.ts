import { vi } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Diagnostic: class { constructor(public range: any, public message: string, public severity: number) { this.source = ''; } source: string; },
  Range: class { constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {} },
  Uri: { file: (path: string) => ({ fsPath: path, path }) },
  ThemeColor: class { constructor(public id: string) {} },
  ThemeIcon: { File: { id: 'file' } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class {
    label: string; collapsibleState: number; command?: any; tooltip?: string; iconPath?: any; description?: string;
    constructor(label: string, collapsibleState: number) { this.label = label; this.collapsibleState = collapsibleState; }
  },
  EventEmitter: class { event = () => {}; fire = vi.fn(); dispose = vi.fn(); },
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: vi.fn(() => ({ text: '', color: undefined, tooltip: '', command: '', show: vi.fn(), dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    showTextDocument: vi.fn(),
    withProgress: vi.fn((opts: any, task: any) => task({ report: vi.fn() })),
    registerWebviewViewProvider: vi.fn(),
    registerTreeDataProvider: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    asRelativePath: vi.fn((uri: any) => typeof uri === 'string' ? uri : uri.path),
    openTextDocument: vi.fn(() => ({ uri: { fsPath: '/test/doc' } })),
  },
  languages: {
    createDiagnosticCollection: vi.fn(() => ({ set: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
    registerCodeLensProvider: vi.fn(),
  },
  commands: { executeCommand: vi.fn(), registerCommand: vi.fn() },
  CodeLens: class { constructor(public range: any, public command?: any) {} },
  LanguageModelChatMessage: { User: (text: string) => ({ role: 'user', text }) },
  lm: { selectChatModels: vi.fn() },
  authentication: { getSession: vi.fn() },
  ProgressLocation: { Notification: 1 },
  env: { machineId: 'test-machine-id', openExternal: vi.fn() },
}));

// Mock ira-review
vi.mock('ira-review', () => ({
  ReviewEngine: class { constructor(public config: any) {} run = vi.fn(); },
  detectFramework: vi.fn(),
  BitbucketClient: class { getDiff = vi.fn(); },
  GitHubClient: class { getDiff = vi.fn(); },
  buildStandalonePrompt: vi.fn(() => 'test prompt'),
  parseStandaloneResponse: vi.fn(() => []),
  calculateRisk: vi.fn(() => ({ level: 'LOW', score: 10, maxScore: 100 })),
  JiraClient: vi.fn(function (this: any) { this.fetchIssue = vi.fn().mockResolvedValue({ summary: 'Test issue', acceptanceCriteria: 'AC1' }); }),
  createAIProvider: vi.fn(() => ({ review: vi.fn(() => ({ explanation: 'test', impact: '', suggestedFix: '' })) })),
}));
