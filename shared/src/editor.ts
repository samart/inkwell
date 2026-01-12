// Milkdown Crepe editor wrapper - Shared package version
// This version is decoupled from any specific backend/API

import { Crepe, CrepeFeature } from '@milkdown/crepe';
import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx } from '@milkdown/kit/core';
import {
  blockquoteSchema,
  wrapInBlockquoteCommand,
  isNodeSelectedCommand,
  headingSchema,
  wrapInHeadingCommand,
  codeBlockSchema,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';

// Re-export Crepe theme CSS paths for consumers to import
export const CREPE_STYLES = [
  '@milkdown/crepe/theme/common/style.css',
  '@milkdown/crepe/theme/common/prosemirror.css',
  '@milkdown/crepe/theme/common/reset.css',
  '@milkdown/crepe/theme/common/toolbar.css',
  '@milkdown/crepe/theme/common/block-edit.css',
  '@milkdown/crepe/theme/common/placeholder.css',
  '@milkdown/crepe/theme/common/code-mirror.css',
  '@milkdown/crepe/theme/common/list-item.css',
  '@milkdown/crepe/theme/common/table.css',
  '@milkdown/crepe/theme/common/link-tooltip.css',
  '@milkdown/crepe/theme/common/image-block.css',
  '@milkdown/crepe/theme/common/cursor.css',
  '@milkdown/crepe/theme/frame.css',
] as const;

export interface Heading {
  level: number;
  text: string;
  line: number;
}

/**
 * Image upload handler type.
 * Receives a File and should return the URL/path to use in markdown.
 */
export type ImageUploadHandler = (file: File) => Promise<string>;

export interface EditorOptions {
  /** Called when a file is loaded */
  onLoad?: (path: string) => void;
  /** Called when file is saved */
  onSave?: (path: string) => void;
  /** Called when content changes */
  onChange?: (path: string, content: string, dirty: boolean) => void;
  /** Called on error */
  onError?: (message: string) => void;
  /** Called for status updates */
  onStatus?: (message: string) => void;
  /**
   * Handler for image uploads. If not provided, image upload is disabled.
   * Should return the URL/path to use in the markdown.
   */
  onImageUpload?: ImageUploadHandler;
  /** Placeholder text shown in empty editor */
  placeholder?: string;
  /**
   * Periodic auto-save interval in milliseconds.
   * Saves every N ms if there are unsaved changes.
   * Set to 0 to disable. Default: 300000 (5 minutes)
   */
  periodicSaveInterval?: number;
  /**
   * Save when window/tab loses focus.
   * Default: true
   */
  saveOnBlur?: boolean;
  /**
   * Minimum time between saves in milliseconds.
   * Prevents rapid saves from overlapping events.
   * Default: 1000 (1 second)
   */
  minSaveInterval?: number;
}

export class MarkdownEditor {
  private container: HTMLElement;
  private options: EditorOptions;
  private crepe: Crepe | null = null;
  private currentPath: string | null = null;
  private isDirty = false;
  private lastContent = '';
  private initialized = false;

  // Auto-save state
  private periodicSaveTimer: number | null = null;
  private lastSaveTime = 0;
  private lastSavedContent = ''; // Content at last save, to avoid redundant saves

  constructor(container: HTMLElement, options: EditorOptions = {}) {
    this.container = container;
    this.options = options;
  }

  async init(): Promise<this> {
    await this.createEditor('');
    this.initialized = true;

    // Setup paste handler for images
    this.container.addEventListener('paste', this.handlePaste.bind(this));

    // Setup drop handler for images
    this.container.addEventListener('drop', this.handleDrop.bind(this));
    this.container.addEventListener('dragover', (e) => e.preventDefault());

    // Setup auto-save: focus loss handlers
    if (this.options.saveOnBlur !== false) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('blur', this.handleBlur);
    }

    // Setup auto-save: periodic timer
    const periodicInterval = this.options.periodicSaveInterval ?? 300000; // 5 minutes default
    if (periodicInterval > 0) {
      this.periodicSaveTimer = window.setInterval(() => {
        if (this.isDirty) {
          this.notifySave();
        }
      }, periodicInterval);
    }

    return this;
  }

  // Arrow functions to preserve 'this' binding for event listeners
  private handleVisibilityChange = (): void => {
    if (document.hidden && this.isDirty) {
      this.notifySave();
    }
  };

  private handleBlur = (): void => {
    if (this.isDirty) {
      this.notifySave();
    }
  };

  private async createEditor(initialContent: string): Promise<void> {
    // Destroy existing editor
    if (this.crepe) {
      this.crepe.destroy();
    }

    this.container.innerHTML = '';
    this.lastContent = initialContent;

    const self = this;

    this.crepe = new Crepe({
      root: this.container,
      defaultValue: initialContent,
      features: {
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Latex]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: this.options.placeholder || 'Start writing...',
        },
        [CrepeFeature.Toolbar]: {
          buildToolbar: (builder: { getGroup: (key: string) => { addItem: (key: string, item: { icon: string; active: (ctx: Ctx) => boolean; onRun: (ctx: Ctx) => void }) => void } }) => {
            const formattingGroup = builder.getGroup('formatting');

            // Add H1 heading
            formattingGroup.addItem('heading1', {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 12l3-2v8"/></svg>`,
              active: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                return commands.call(isNodeSelectedCommand.key, headingSchema.type(ctx));
              },
              onRun: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(wrapInHeadingCommand.key, 1);
              },
            });

            // Add H2 heading
            formattingGroup.addItem('heading2', {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>`,
              active: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                return commands.call(isNodeSelectedCommand.key, headingSchema.type(ctx));
              },
              onRun: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(wrapInHeadingCommand.key, 2);
              },
            });

            // Add H3 heading
            formattingGroup.addItem('heading3', {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/></svg>`,
              active: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                return commands.call(isNodeSelectedCommand.key, headingSchema.type(ctx));
              },
              onRun: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(wrapInHeadingCommand.key, 3);
              },
            });

            // Add blockquote
            formattingGroup.addItem('blockquote', {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7.17 17C7.68 17 8.15 16.71 8.37 16.26L9.79 13.42C9.93 13.14 10 12.84 10 12.53V8C10 7.45 9.55 7 9 7H5C4.45 7 4 7.45 4 8V12C4 12.55 4.45 13 5 13H7L5.97 15.06C5.52 15.95 6.17 17 7.17 17ZM17.17 17C17.68 17 18.15 16.71 18.37 16.26L19.79 13.42C19.93 13.14 20 12.84 20 12.53V8C20 7.45 19.55 7 19 7H15C14.45 7 14 7.45 14 8V12C14 12.55 14.45 13 15 13H17L15.97 15.06C15.52 15.95 16.17 17 17.17 17Z"/></svg>`,
              active: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                return commands.call(isNodeSelectedCommand.key, blockquoteSchema.type(ctx));
              },
              onRun: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(wrapInBlockquoteCommand.key);
              },
            });

            // Add code block
            formattingGroup.addItem('codeblock', {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8-3 4 3 4"/><path d="m14 8 3 4-3 4"/></svg>`,
              active: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                return commands.call(isNodeSelectedCommand.key, codeBlockSchema.type(ctx));
              },
              onRun: (ctx: Ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(createCodeBlockCommand.key);
              },
            });
          },
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: async (file: File) => {
            if (!self.options.onImageUpload) {
              console.warn('Image upload not configured');
              return '';
            }
            try {
              self.options.onStatus?.('Uploading image...');
              const imagePath = await self.options.onImageUpload(file);
              self.options.onStatus?.('Image uploaded');
              return imagePath;
            } catch (error) {
              console.error('Failed to upload image:', error);
              self.options.onError?.('Failed to upload image: ' + (error as Error).message);
              return '';
            }
          },
        },
      },
    });

    // Listen for content changes
    this.crepe.on((listenerManager) => {
      listenerManager.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown && self.initialized) {
          self.lastContent = markdown;
          self.handleChange(markdown);
        }
      });
    });

    await this.crepe.create();
  }

  /**
   * Load content from a path. The actual file reading should be done by the consumer.
   * This is a convenience method for tracking the current path.
   */
  async loadContent(path: string, content: string): Promise<void> {
    this.currentPath = path;
    this.isDirty = false;
    this.lastSavedContent = content; // Track what's on disk
    await this.setContent(content);
    this.options.onLoad?.(path);
  }

  async setContent(markdown: string): Promise<void> {
    this.lastContent = markdown;

    if (this.crepe) {
      // Recreate editor with new content
      await this.createEditor(markdown);
    }
  }

  getContent(): string {
    if (this.crepe) {
      return this.crepe.getMarkdown();
    }
    return this.lastContent;
  }

  private handleChange(content: string): void {
    if (!this.currentPath) return;

    this.isDirty = true;
    this.options.onChange?.(this.currentPath, content, true);
    // Auto-save is triggered by focus loss or periodic timer, not on every change
  }

  /**
   * Notify that content should be saved.
   * The actual save implementation is handled by the consumer via onSave.
   * Includes throttling to prevent rapid saves from overlapping events.
   * Skips save if content hasn't actually changed from last saved state.
   */
  notifySave(): void {
    if (!this.currentPath || !this.isDirty) return;

    const content = this.getContent();

    // Skip if content is identical to what's already saved
    if (content === this.lastSavedContent) {
      this.isDirty = false;
      return;
    }

    // Throttle: don't save more frequently than minSaveInterval
    const now = Date.now();
    const minInterval = this.options.minSaveInterval ?? 1000;
    if (now - this.lastSaveTime < minInterval) {
      return;
    }
    this.lastSaveTime = now;

    this.isDirty = false;
    this.lastSavedContent = content; // Update saved content reference
    this.options.onSave?.(this.currentPath);
    this.options.onChange?.(this.currentPath, content, false);
  }

  /**
   * Mark the editor as saved (reset dirty state).
   * Called by consumers after successfully persisting content.
   */
  markSaved(): void {
    this.isDirty = false;
    this.lastSavedContent = this.getContent(); // Update saved content reference
    if (this.currentPath) {
      this.options.onChange?.(this.currentPath, this.lastSavedContent, false);
    }
  }

  private async handlePaste(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    if (!items || !this.options.onImageUpload) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await this.uploadAndInsertImage(file);
        }
        break;
      }
    }
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0 || !this.options.onImageUpload) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        await this.uploadAndInsertImage(file);
      }
    }
  }

  private async uploadAndInsertImage(file: File): Promise<void> {
    if (!this.options.onImageUpload) return;

    try {
      this.options.onStatus?.('Uploading image...');
      const imagePath = await this.options.onImageUpload(file);

      // Insert image markdown at cursor
      if (this.crepe && imagePath) {
        const currentContent = this.getContent();
        const imageMarkdown = `![${file.name.replace(/\.[^/.]+$/, '')}](${imagePath})`;
        // Append to end for now (Crepe handles insertion via its own UI)
        await this.setContent(currentContent + '\n\n' + imageMarkdown);
      }

      this.options.onStatus?.('Image uploaded');
    } catch (error) {
      console.error('Failed to upload image:', error);
      this.options.onError?.('Failed to upload image: ' + (error as Error).message);
    }
  }

  focus(): void {
    const proseMirror = this.container.querySelector('.ProseMirror') as HTMLElement;
    proseMirror?.focus();
  }

  destroy(): void {
    // Clean up periodic save timer
    if (this.periodicSaveTimer) {
      clearInterval(this.periodicSaveTimer);
      this.periodicSaveTimer = null;
    }

    // Clean up focus-loss event listeners
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleBlur);

    this.crepe?.destroy();
  }

  getWordCount(): number {
    const text = this.lastContent.replace(/[#*`\[\]()]/g, '');
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }

  setCurrentPath(path: string | null): void {
    this.currentPath = path;
  }

  getHeadings(): Heading[] {
    const content = this.lastContent;
    const lines = content.split('\n');
    const headings: Heading[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: i + 1,
        });
      }
    }

    return headings;
  }

  scrollToLine(lineNumber: number): void {
    const proseMirror = this.container.querySelector('.ProseMirror') as HTMLElement;
    if (!proseMirror) return;

    // Find the heading element - Milkdown renders headings as h1-h6 elements
    const headings = proseMirror.querySelectorAll('h1, h2, h3, h4, h5, h6');

    // Count headings in the markdown to find the right one
    const content = this.lastContent;
    const lines = content.split('\n');
    let headingIndex = 0;

    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      if (lines[i].match(/^#{1,6}\s+/)) {
        headingIndex++;
      }
    }

    const targetHeading = headings[headingIndex] as HTMLElement;
    if (targetHeading) {
      targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Add a brief highlight effect
      targetHeading.classList.add('heading-highlight');
      setTimeout(() => targetHeading.classList.remove('heading-highlight'), 1500);
    }
  }

  /**
   * Check if the editor has unsaved changes.
   */
  isDirtyState(): boolean {
    return this.isDirty;
  }
}
