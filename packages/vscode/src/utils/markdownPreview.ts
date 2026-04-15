/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * Utility to open markdown content in VS Code's rendered preview.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let tempDir: string | undefined;

function getTempDir(): string {
  if (!tempDir) {
    tempDir = path.join(os.tmpdir(), 'ira-review');
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Opens markdown content in VS Code's rendered preview panel.
 * Falls back to a raw text document if the preview command is unavailable.
 */
export async function openMarkdownPreview(
  content: string,
  filename: string,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside,
): Promise<void> {
  const filePath = path.join(getTempDir(), `${filename}-${Date.now()}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');

  const uri = vscode.Uri.file(filePath);

  try {
    await vscode.commands.executeCommand('markdown.showPreview', uri, { viewColumn });
  } catch {
    // Fallback: open as a regular text document
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { viewColumn, preview: true });
  }
}
