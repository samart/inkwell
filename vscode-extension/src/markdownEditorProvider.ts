import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Custom editor provider for Markdown files using Milkdown/Crepe WYSIWYG editor.
 * Uses CustomTextEditorProvider so VSCode handles file persistence automatically.
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = 'inkwell.markdownEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Register the custom editor provider with VSCode
   */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true, // Keep editor state when tab is hidden
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  /**
   * Called when a custom editor is opened
   */
  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Configure the webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'out'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.joinPath(this.context.extensionUri, 'node_modules'),
      ],
    };

    // Set up the webview content
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Track if we're currently updating from external changes
    let isUpdatingFromExternal = false;

    // Send initial content to webview once it's ready
    const sendInitialContent = () => {
      webviewPanel.webview.postMessage({
        type: 'setContent',
        content: document.getText(),
        path: document.uri.fsPath,
      });
    };

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          // Webview is ready, send initial content
          sendInitialContent();
          break;

        case 'edit':
          // Don't process edits if we're updating from external changes
          if (isUpdatingFromExternal) {
            return;
          }

          // Apply edit to the document
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            message.content
          );
          await vscode.workspace.applyEdit(edit);
          break;

        case 'uploadImage':
          // Handle image upload - save to workspace assets folder
          await this.handleImageUpload(
            document,
            webviewPanel.webview,
            message.data,
            message.filename
          );
          break;

        case 'error':
          vscode.window.showErrorMessage(`Inkwell Editor: ${message.message}`);
          break;
      }
    });

    // Sync document changes to webview (e.g., external edits, undo/redo)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // Only sync if changes came from outside the webview
        if (e.contentChanges.length > 0) {
          isUpdatingFromExternal = true;
          webviewPanel.webview.postMessage({
            type: 'setContent',
            content: document.getText(),
          });
          // Reset flag after a short delay to allow the webview to process
          setTimeout(() => {
            isUpdatingFromExternal = false;
          }, 100);
        }
      }
    });

    // Clean up when the editor is closed
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
    });
  }

  /**
   * Handle image upload from the webview
   */
  private async handleImageUpload(
    document: vscode.TextDocument,
    webview: vscode.Webview,
    data: number[],
    filename: string
  ): Promise<void> {
    try {
      // Get the workspace folder
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      // Create assets directory if it doesn't exist
      const assetsDir = vscode.Uri.joinPath(workspaceFolder.uri, 'assets');
      try {
        await vscode.workspace.fs.stat(assetsDir);
      } catch {
        await vscode.workspace.fs.createDirectory(assetsDir);
      }

      // Generate unique filename
      const timestamp = Date.now();
      const ext = path.extname(filename) || '.png';
      const baseName = path.basename(filename, ext);
      const uniqueFilename = `${baseName}-${timestamp}${ext}`;

      // Write the file
      const imageUri = vscode.Uri.joinPath(assetsDir, uniqueFilename);
      await vscode.workspace.fs.writeFile(imageUri, new Uint8Array(data));

      // Calculate relative path from document to image
      const documentDir = path.dirname(document.uri.fsPath);
      const relativePath = path.relative(documentDir, imageUri.fsPath);

      // Send the path back to the webview
      webview.postMessage({
        type: 'imageUploaded',
        path: relativePath.replace(/\\/g, '/'), // Normalize path separators
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to upload image: ${errorMessage}`);
      webview.postMessage({
        type: 'imageUploadError',
        error: errorMessage,
      });
    }
  }

  /**
   * Get the HTML content for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs for resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
    );

    // Get theme from configuration
    const theme = vscode.workspace.getConfiguration('inkwell').get('theme', 'light');

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Inkwell Markdown Editor</title>
</head>
<body data-theme="${theme}">
  <div id="editor"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Generate a random nonce for Content Security Policy
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
