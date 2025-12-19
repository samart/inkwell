import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Inkwell Markdown Editor is now active');

  // Register the custom editor provider
  context.subscriptions.push(MarkdownEditorProvider.register(context));
}

export function deactivate() {
  console.log('Inkwell Markdown Editor has been deactivated');
}
