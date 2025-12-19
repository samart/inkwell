/**
 * Webview entry point for the Inkwell Markdown Editor
 * This runs inside the webview and communicates with the extension via postMessage
 */

// Declare the VSCode API type
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Get the VSCode API
const vscode = acquireVsCodeApi();

// Editor instance (will be initialized after DOM is ready)
let editor: any = null;
let isUpdatingFromExtension = false;

/**
 * Initialize the editor
 */
async function initEditor() {
  const container = document.getElementById('editor');
  if (!container) {
    console.error('Editor container not found');
    vscode.postMessage({ type: 'error', message: 'Editor container not found' });
    return;
  }

  try {
    // For Phase 2, we'll use a placeholder since we need to bundle the shared package
    // The full Milkdown integration will be done in Phase 3
    container.innerHTML = `
      <div style="padding: 20px; font-family: system-ui, sans-serif;">
        <h2>Inkwell Markdown Editor</h2>
        <p style="color: var(--vscode-descriptionForeground);">
          Extension scaffold loaded successfully!
        </p>
        <p style="color: var(--vscode-descriptionForeground);">
          The full WYSIWYG editor will be integrated in Phase 3.
        </p>
        <div id="content-preview" style="
          margin-top: 20px;
          padding: 16px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          white-space: pre-wrap;
          font-family: var(--vscode-editor-font-family), monospace;
          font-size: var(--vscode-editor-font-size);
          max-height: 400px;
          overflow: auto;
        "></div>
        <textarea id="content-editor" style="
          margin-top: 20px;
          width: 100%;
          min-height: 300px;
          padding: 16px;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-family: var(--vscode-editor-font-family), monospace;
          font-size: var(--vscode-editor-font-size);
          resize: vertical;
        " placeholder="Edit markdown here..."></textarea>
      </div>
    `;

    // Set up basic editing for now
    const textarea = document.getElementById('content-editor') as HTMLTextAreaElement;
    const preview = document.getElementById('content-preview');

    if (textarea && preview) {
      // Send edits back to the extension
      let debounceTimer: number | undefined;
      textarea.addEventListener('input', () => {
        if (isUpdatingFromExtension) return;

        // Debounce to avoid too many messages
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          vscode.postMessage({
            type: 'edit',
            content: textarea.value,
          });
        }, 300);
      });

      // Store references for content updates
      editor = { textarea, preview };
    }

    // Tell the extension we're ready
    vscode.postMessage({ type: 'ready' });
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    vscode.postMessage({
      type: 'error',
      message: `Failed to initialize: ${error}`,
    });
  }
}

/**
 * Handle messages from the extension
 */
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'setContent':
      if (editor) {
        isUpdatingFromExtension = true;
        editor.textarea.value = message.content;
        editor.preview.textContent = message.content;
        // Reset flag after DOM updates
        requestAnimationFrame(() => {
          isUpdatingFromExtension = false;
        });
      }
      break;

    case 'imageUploaded':
      // For Phase 3: Insert the image into the editor
      console.log('Image uploaded:', message.path);
      break;

    case 'imageUploadError':
      console.error('Image upload failed:', message.error);
      break;
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditor);
} else {
  initEditor();
}
