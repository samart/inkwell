// Frontend-specific editor wrapper that uses the shared MarkdownEditor
// with API-based image upload

import { MarkdownEditor as SharedMarkdownEditor } from '@inkwell/editor';
import type { EditorOptions as SharedEditorOptions, Heading } from '@inkwell/editor';

// Import Crepe theme CSS
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/code-mirror.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/frame.css';

import { api } from './api';

// Re-export Heading type for consumers
export type { Heading };

interface EditorOptions {
  onLoad?: (path: string) => void;
  onSave?: (path: string) => void;
  onChange?: (path: string, content: string, dirty: boolean) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
}

/**
 * MarkdownEditor wrapper for the standalone frontend.
 * Provides API-based file operations and image upload.
 */
export class MarkdownEditor {
  private editor: SharedMarkdownEditor;
  private options: EditorOptions;

  private isSaving = false;

  constructor(container: HTMLElement, options: EditorOptions = {}) {
    this.options = options;

    // Create shared editor with API-based image upload
    const sharedOptions: SharedEditorOptions = {
      onLoad: options.onLoad,
      // Intercept onSave to trigger actual auto-save to disk
      onSave: (path: string) => {
        // Prevent re-entrant saves (save() calls onSave on success)
        if (this.isSaving) {
          this.options.onSave?.(path);
          return;
        }
        // Auto-save: actually persist to disk
        this.performAutoSave(path);
      },
      onChange: options.onChange,
      onError: options.onError,
      onStatus: options.onStatus,
      onImageUpload: async (file: File) => {
        // Use the API to upload the image
        const result = await api.uploadImage(file);
        // Return the path for use in markdown
        return '/images/' + result.path.replace('assets/', '');
      },
    };

    this.editor = new SharedMarkdownEditor(container, sharedOptions);
  }

  private async performAutoSave(path: string): Promise<void> {
    if (this.isSaving) return;

    this.isSaving = true;
    try {
      const content = this.getContent();
      await api.updateFile(path, content);
      this.editor.markSaved();
      this.options.onSave?.(path);
    } catch (error) {
      console.error('[AutoSave] Failed to save:', error);
      this.options.onError?.('Auto-save failed: ' + (error as Error).message);
    } finally {
      this.isSaving = false;
    }
  }

  async init(): Promise<this> {
    await this.editor.init();
    return this;
  }

  async loadFile(path: string): Promise<void> {
    try {
      console.log('[Editor] Loading file:', path);
      const data = await api.getFile(path);
      console.log('[Editor] File data received, content length:', data.content.length);

      await this.editor.loadContent(path, data.content);
      console.log('[Editor] Content loaded');
    } catch (error) {
      console.error('Failed to load file:', error);
      throw error;
    }
  }

  async setContent(markdown: string): Promise<void> {
    await this.editor.setContent(markdown);
  }

  getContent(): string {
    return this.editor.getContent();
  }

  async save(): Promise<void> {
    const path = this.editor.getCurrentPath();
    if (!path || this.isSaving) return;

    this.isSaving = true;
    try {
      const content = this.getContent();
      await api.updateFile(path, content);
      this.editor.markSaved();
      this.options.onSave?.(path);
    } catch (error) {
      console.error('Failed to save:', error);
      this.options.onError?.('Failed to save: ' + (error as Error).message);
    } finally {
      this.isSaving = false;
    }
  }

  focus(): void {
    this.editor.focus();
  }

  destroy(): void {
    this.editor.destroy();
  }

  getWordCount(): number {
    return this.editor.getWordCount();
  }

  getCurrentPath(): string | null {
    return this.editor.getCurrentPath();
  }

  setCurrentPath(path: string | null): void {
    this.editor.setCurrentPath(path);
  }

  getHeadings(): Heading[] {
    return this.editor.getHeadings();
  }

  scrollToLine(lineNumber: number): void {
    this.editor.scrollToLine(lineNumber);
  }
}
