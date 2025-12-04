// Milkdown editor wrapper

import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { upload, uploadConfig } from '@milkdown/plugin-upload';
import { indent } from '@milkdown/plugin-indent';
import { trailing } from '@milkdown/plugin-trailing';
import { nord } from '@milkdown/theme-nord';

import { api } from './api.js';

class MarkdownEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.editor = null;
        this.currentPath = null;
        this.isDirty = false;
        this.saveTimeout = null;
        this.lastContent = '';
    }

    async init() {
        const self = this;

        this.editor = await Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, this.container);
                ctx.set(defaultValueCtx, '');

                // Configure listener for changes
                ctx.set(listenerCtx, {
                    markdown: [(getMarkdown) => {
                        const content = getMarkdown();
                        if (content !== self.lastContent) {
                            self.lastContent = content;
                            self.handleChange(content);
                        }
                    }],
                });

                // Configure image upload
                ctx.set(uploadConfig.key, {
                    uploader: async (files, schema) => {
                        const images = [];
                        for (const file of files) {
                            try {
                                const result = await api.uploadImage(file);
                                const src = '/' + result.path;
                                const alt = file.name.replace(/\.[^/.]+$/, '');
                                images.push(schema.nodes.image.createAndFill({
                                    src,
                                    alt,
                                }));
                            } catch (error) {
                                console.error('Failed to upload image:', error);
                            }
                        }
                        return images;
                    },
                });
            })
            .config(nord)
            .use(commonmark)
            .use(gfm)
            .use(history)
            .use(clipboard)
            .use(listener)
            .use(upload)
            .use(indent)
            .use(trailing)
            .create();

        // Setup paste handler for images
        this.container.addEventListener('paste', this.handlePaste.bind(this));

        // Setup drop handler for images
        this.container.addEventListener('drop', this.handleDrop.bind(this));
        this.container.addEventListener('dragover', (e) => e.preventDefault());

        return this;
    }

    async loadFile(path) {
        try {
            const data = await api.getFile(path);
            this.currentPath = path;
            this.lastContent = data.content;
            this.isDirty = false;

            // Update editor content
            this.editor.action((ctx) => {
                const view = ctx.get(rootCtx);
                // Reset the editor with new content
            });

            // For now, destroy and recreate with new content
            await this.setContent(data.content);

            this.options.onLoad?.(path);
            return data;
        } catch (error) {
            console.error('Failed to load file:', error);
            throw error;
        }
    }

    async setContent(markdown) {
        // Milkdown doesn't have a straightforward setContent method,
        // so we need to recreate the editor
        this.container.innerHTML = '';
        this.lastContent = markdown;

        const self = this;

        this.editor = await Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, this.container);
                ctx.set(defaultValueCtx, markdown);

                ctx.set(listenerCtx, {
                    markdown: [(getMarkdown) => {
                        const content = getMarkdown();
                        if (content !== self.lastContent) {
                            self.lastContent = content;
                            self.handleChange(content);
                        }
                    }],
                });

                ctx.set(uploadConfig.key, {
                    uploader: async (files, schema) => {
                        const images = [];
                        for (const file of files) {
                            try {
                                const result = await api.uploadImage(file);
                                const src = '/' + result.path;
                                const alt = file.name.replace(/\.[^/.]+$/, '');
                                images.push(schema.nodes.image.createAndFill({
                                    src,
                                    alt,
                                }));
                            } catch (error) {
                                console.error('Failed to upload image:', error);
                            }
                        }
                        return images;
                    },
                });
            })
            .config(nord)
            .use(commonmark)
            .use(gfm)
            .use(history)
            .use(clipboard)
            .use(listener)
            .use(upload)
            .use(indent)
            .use(trailing)
            .create();
    }

    getContent() {
        return this.lastContent;
    }

    handleChange(content) {
        if (!this.currentPath) return;

        this.isDirty = true;
        this.options.onChange?.(this.currentPath, content, true);

        // Debounced auto-save
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.save();
        }, 1000);
    }

    async save() {
        if (!this.currentPath || !this.isDirty) return;

        try {
            await api.updateFile(this.currentPath, this.lastContent);
            this.isDirty = false;
            this.options.onSave?.(this.currentPath);
            this.options.onChange?.(this.currentPath, this.lastContent, false);
        } catch (error) {
            console.error('Failed to save:', error);
            this.options.onError?.('Failed to save: ' + error.message);
        }
    }

    async handlePaste(event) {
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

    async handleDrop(event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                event.preventDefault();
                await this.uploadAndInsertImage(file);
            }
        }
    }

    async uploadAndInsertImage(file) {
        try {
            this.options.onStatus?.('Uploading image...');
            const result = await api.uploadImage(file);
            const markdown = `![${file.name.replace(/\.[^/.]+$/, '')}](/${result.path})`;

            // Insert at cursor position - for now, append
            const content = this.lastContent + '\n\n' + markdown;
            await this.setContent(content);
            this.handleChange(content);

            this.options.onStatus?.('Image uploaded');
        } catch (error) {
            console.error('Failed to upload image:', error);
            this.options.onError?.('Failed to upload image: ' + error.message);
        }
    }

    focus() {
        this.container.querySelector('.ProseMirror')?.focus();
    }

    destroy() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.editor?.destroy();
    }

    getWordCount() {
        const text = this.lastContent.replace(/[#*`\[\]()]/g, '');
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        return words.length;
    }
}

export { MarkdownEditor };
