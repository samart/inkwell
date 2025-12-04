// Milkdown Crepe editor wrapper

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
// Import Crepe theme CSS (using exported paths from package.json)
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

export interface Heading {
  level: number;
  text: string;
  line: number;
}

interface EditorOptions {
  onLoad?: (path: string) => void;
  onSave?: (path: string) => void;
  onChange?: (path: string, content: string, dirty: boolean) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
}

export class MarkdownEditor {
  private container: HTMLElement;
  private options: EditorOptions;
  private crepe: Crepe | null = null;
  private currentPath: string | null = null;
  private isDirty = false;
  private saveTimeout: number | null = null;
  private lastContent = '';
  private initialized = false;

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

    return this;
  }

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
          text: 'Start writing...',
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
            try {
              self.options.onStatus?.('Uploading image...');
              const result = await api.uploadImage(file);
              self.options.onStatus?.('Image uploaded');
              return '/images/' + result.path.replace('assets/', '');
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

  async loadFile(path: string): Promise<void> {
    try {
      console.log('[Editor] Loading file:', path);
      const data = await api.getFile(path);
      console.log('[Editor] File data received, content length:', data.content.length);
      this.currentPath = path;
      this.isDirty = false;

      await this.setContent(data.content);
      console.log('[Editor] Content set complete');

      this.options.onLoad?.(path);
    } catch (error) {
      console.error('Failed to load file:', error);
      throw error;
    }
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

    // Debounced auto-save
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      this.save();
    }, 1000);
  }

  async save(): Promise<void> {
    if (!this.currentPath || !this.isDirty) return;

    try {
      const content = this.getContent();
      await api.updateFile(this.currentPath, content);
      this.isDirty = false;
      this.options.onSave?.(this.currentPath);
      this.options.onChange?.(this.currentPath, content, false);
    } catch (error) {
      console.error('Failed to save:', error);
      this.options.onError?.('Failed to save: ' + (error as Error).message);
    }
  }

  private async handlePaste(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    if (!items) return;

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
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        await this.uploadAndInsertImage(file);
      }
    }
  }

  private async uploadAndInsertImage(file: File): Promise<void> {
    try {
      this.options.onStatus?.('Uploading image...');
      const result = await api.uploadImage(file);
      const imagePath = '/images/' + result.path.replace('assets/', '');

      // Insert image markdown at cursor
      if (this.crepe) {
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
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
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
}
