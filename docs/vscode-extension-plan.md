# Inkwell VSCode Extension - Feasibility Analysis & Plan

## Implementation Progress

### Phase 1: Shared Package Extraction - COMPLETE

**Date completed:** 2025-12-19

**What was implemented:**

1. **Created `shared/` package** (`@inkwell/editor`)
   - `shared/package.json` - npm package with Milkdown dependencies
   - `shared/tsconfig.json` - TypeScript configuration
   - `shared/src/index.ts` - Package exports

2. **Abstracted `editor.ts`** (`shared/src/editor.ts`)
   - Added `onImageUpload?: (file: File) => Promise<string>` callback
   - Added `loadContent(path, content)` method for consumer-provided content
   - Added `markSaved()` method for external save handling
   - Removed direct API dependency
   - Exported `CREPE_STYLES` constant for CSS import paths

3. **Moved `mermaid-renderer.ts`** (`shared/src/mermaid-renderer.ts`)
   - Copied as-is (already self-contained)

4. **Created shared styles**
   - `shared/src/styles/editor.css` - Milkdown editor overrides
   - `shared/src/styles/mermaid.css` - Mermaid diagram styling
   - `shared/src/styles/index.ts` - Module for TypeScript resolution

5. **Updated frontend to use shared package**
   - `frontend/package.json` - Added `"@inkwell/editor": "file:../shared"`
   - `frontend/src/editor.ts` - Now a thin wrapper that:
     - Imports `MarkdownEditor` from `@inkwell/editor`
     - Provides API-based `onImageUpload` handler
     - Handles file loading via `api.getFile()`
   - `frontend/src/mermaid-renderer.ts` - Re-exports from shared

6. **Verified builds work**
   - `cd shared && npm run build` - TypeScript compiles
   - `cd frontend && npm run build` - Vite builds successfully
   - `make build` - Full Go + frontend build works

**Files created/modified:**
```
shared/                          # NEW
├── package.json
├── tsconfig.json
├── dist/                        # Compiled output
└── src/
    ├── index.ts
    ├── editor.ts
    ├── mermaid-renderer.ts
    └── styles/
        ├── index.ts
        ├── editor.css
        └── mermaid.css

frontend/
├── package.json                 # MODIFIED - added @inkwell/editor dependency
└── src/
    ├── editor.ts                # MODIFIED - now wrapper around shared
    └── mermaid-renderer.ts      # MODIFIED - re-exports from shared
```

### Next: Phase 2 - Extension Scaffold

Ready to begin in new session. Tasks:
1. Create `vscode-extension/` directory
2. Use Yeoman generator (`yo code`) or manual setup
3. Set up TypeScript + esbuild bundling
4. Configure `package.json` with custom editor contribution

---

## Executive Summary

**Yes, this is absolutely feasible.** The current architecture is well-suited for creating a VSCode extension because the core Milkdown editor (`editor.ts`) is already decoupled from file I/O and git operations. VSCode provides all the infrastructure Inkwell currently builds in Go (file browsing, git, history, tabs).

## Architecture Comparison

| Feature | Standalone Inkwell | VSCode Extension |
|---------|-------------------|------------------|
| File browsing | Go backend + FileTree component | VSCode Explorer |
| Git operations | Go backend + GitPanel | VSCode SCM |
| File history | Go backend API | VSCode Timeline |
| Tabs | InkwellApp tabs | VSCode Editor Tabs |
| File save/load | Go REST API | VSCode TextDocument |
| **Markdown editor** | **Milkdown Crepe** | **Milkdown Crepe (reused)** |
| Image handling | Go backend upload | VSCode workspace assets |

## What Can Be Reused

### Directly Reusable (90%+ as-is)

1. **`editor.ts`** - The Milkdown Crepe wrapper (core WYSIWYG editor)
2. **`mermaid-renderer.ts`** - Diagram rendering
3. **`styles/main.css`** - All styling (themes, editor appearance)
4. **All Milkdown/Crepe CSS imports** - Already modular

### Needs Adaptation

1. **Image upload** - Replace `api.uploadImage()` with VSCode workspace file operations
2. **File save** - Replace `api.updateFile()` with `vscode.workspace.applyEdit()`

### Not Needed (VSCode provides)

- `api.ts` - VSCode handles file I/O
- `filetree.ts` - VSCode Explorer
- `git-panel.ts`, `git-status.ts`, `git-clone.ts` - VSCode SCM
- `websocket.ts` - Not needed
- `main.ts` - Replaced by extension activation

---

## Proposed Project Structure

```
markdown-editor/
├── frontend/                    # Existing standalone frontend
│   └── src/
│       ├── editor.ts            # Shared - symlink or npm package
│       ├── mermaid-renderer.ts  # Shared
│       └── styles/main.css      # Shared
│
├── vscode-extension/            # NEW - VSCode extension
│   ├── package.json             # Extension manifest
│   ├── src/
│   │   ├── extension.ts         # Extension entry point
│   │   ├── markdownEditorProvider.ts  # CustomTextEditorProvider
│   │   └── webview/
│   │       ├── main.ts          # Webview entry (slim)
│   │       └── vscode-bridge.ts # VSCode <-> Webview messaging
│   ├── media/
│   │   └── editor.css           # Bundle of shared styles
│   └── webview-dist/            # Bundled webview assets
│
├── shared/                      # NEW - Shared code package
│   ├── package.json
│   └── src/
│       ├── editor.ts            # Moved here
│       ├── mermaid-renderer.ts
│       └── styles/
│
└── cmd/inkwell/                 # Existing Go backend
```

---

## Implementation Strategy

### Option A: Monorepo with Shared Package (Recommended)

Create a shared npm package (`@inkwell/editor`) containing the core editor logic:

```
shared/
├── package.json
├── src/
│   ├── index.ts           # Export MarkdownEditor class
│   ├── editor.ts          # Core editor (modified for abstraction)
│   ├── mermaid-renderer.ts
│   └── types.ts           # Shared types
└── styles/
    └── main.css
```

**Changes to `editor.ts`:**

```typescript
// Add abstraction for image upload
interface EditorOptions {
  onImageUpload?: (file: File) => Promise<string>;  // Return URL/path
  // ... existing options
}

// Remove direct api.uploadImage() dependency
// Let consumer provide the implementation
```

Then both `frontend/` and `vscode-extension/` import from `@inkwell/editor`.

### Option B: Copy with Divergence

Simply copy `editor.ts` and adapt. Simpler initially but harder to maintain.

---

## VSCode Extension Implementation Details

### 1. Extension Manifest (`package.json`)

```json
{
  "name": "inkwell-markdown",
  "displayName": "Inkwell Markdown Editor",
  "description": "WYSIWYG Markdown editing with Milkdown",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "customEditors": [{
      "viewType": "inkwell.markdownEditor",
      "displayName": "Inkwell Editor",
      "selector": [{
        "filenamePattern": "*.md"
      }],
      "priority": "option"
    }],
    "configuration": {
      "title": "Inkwell",
      "properties": {
        "inkwell.theme": {
          "type": "string",
          "enum": ["light", "dark", "sepia", "nord"],
          "default": "light"
        }
      }
    }
  }
}
```

### 2. Custom Editor Provider (`markdownEditorProvider.ts`)

```typescript
import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      'inkwell.markdownEditor',
      new MarkdownEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlContent(webviewPanel.webview);

    // Send initial content to webview
    webviewPanel.webview.postMessage({
      type: 'setContent',
      content: document.getText()
    });

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'edit') {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.content
        );
        await vscode.workspace.applyEdit(edit);
      }

      if (msg.type === 'uploadImage') {
        // Handle image - save to workspace assets folder
        const uri = await this.saveImage(msg.data, msg.filename);
        webviewPanel.webview.postMessage({
          type: 'imageUploaded',
          path: uri
        });
      }
    });

    // Sync document changes to webview
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({
          type: 'setContent',
          content: document.getText()
        });
      }
    });
  }
}
```

### 3. Webview Entry (`webview/main.ts`)

```typescript
import { MarkdownEditor } from '@inkwell/editor';  // Shared package

const vscode = acquireVsCodeApi();

const editor = new MarkdownEditor(document.getElementById('editor')!, {
  onImageUpload: async (file: File) => {
    // Send to extension for handling
    const buffer = await file.arrayBuffer();
    vscode.postMessage({
      type: 'uploadImage',
      data: Array.from(new Uint8Array(buffer)),
      filename: file.name
    });

    // Wait for response
    return new Promise(resolve => {
      window.addEventListener('message', (e) => {
        if (e.data.type === 'imageUploaded') {
          resolve(e.data.path);
        }
      }, { once: true });
    });
  },

  onChange: (path, content, dirty) => {
    vscode.postMessage({ type: 'edit', content });
  }
});

// Listen for content updates from extension
window.addEventListener('message', (event) => {
  if (event.data.type === 'setContent') {
    editor.setContent(event.data.content);
  }
});
```

---

## Development Phases

### Phase 1: Shared Package Extraction
**Estimated effort: 1-2 days**

1. Create `shared/` directory with `package.json`
2. Move `editor.ts`, `mermaid-renderer.ts`, styles
3. Add abstraction layer for image upload
4. Update standalone frontend to import from shared

### Phase 2: Extension Scaffold
**Estimated effort: 1 day**

1. Create `vscode-extension/` with Yeoman generator (`yo code`)
2. Set up TypeScript, bundling (esbuild/webpack)
3. Configure `package.json` with custom editor contribution

### Phase 3: Core Integration
**Estimated effort: 2-3 days**

1. Implement `MarkdownEditorProvider`
2. Create webview HTML template
3. Bundle Milkdown + styles for webview
4. Implement two-way document sync

### Phase 4: Image Handling
**Estimated effort: 1 day**

1. Implement image paste/drop in webview
2. Save images to workspace `assets/` folder
3. Generate relative paths for markdown

### Phase 5: Polish
**Estimated effort: 1-2 days**

1. Theme sync with VSCode
2. Settings integration
3. Extension icon, README
4. Testing on different platforms

---

## Key Technical Decisions

### 1. Use `CustomTextEditorProvider` (not `CustomEditorProvider`)

- VSCode handles file persistence
- Get undo/redo for free
- Easier dirty state management

### 2. Bundle with esbuild

- Fast bundling for both extension and webview
- Tree-shaking to minimize bundle size

### 3. `retainContextWhenHidden: true`

- Keeps editor state when tab is hidden
- Prevents re-initialization overhead

### 4. Priority: "option"

- Users can still use VSCode's default markdown preview
- Right-click -> "Open With..." to choose Inkwell

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Milkdown bundle size (~500KB) | Lazy load, code splitting |
| Performance on large files | Use incremental updates, not full replace |
| Theme mismatch | Read VSCode theme via CSS variables |
| Undo/redo sync issues | Debounce edits, batch small changes |

---

## Summary

Creating an Inkwell VSCode extension is **highly feasible** and would:

- Reuse **~80%** of the editor code
- Eliminate the need for the Go backend for VSCode users
- Integrate seamlessly with VSCode's file/git/history features
- Maintain both versions from a shared codebase

**Recommended approach**: Option A (shared package) for long-term maintainability.

---

## References

- [VSCode Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [VSCode Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [vscode-markdown-editor (reference implementation)](https://github.com/zaaack/vscode-markdown-editor)
- [VSCode Custom Editor Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/custom-editor-sample)