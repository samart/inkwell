// Main application entry point

import { api } from './api.js';
import { ws } from './websocket.js';
import { FileTree } from './filetree.js';
import { MarkdownEditor } from './editor.js';

class InkwellApp {
    constructor() {
        this.fileTree = null;
        this.editor = null;
        this.tabs = [];
        this.activeTab = null;
        this.editors = new Map(); // path -> editor content cache
        this.theme = 'light';

        this.elements = {
            sidebar: document.getElementById('sidebar'),
            fileTree: document.getElementById('file-tree'),
            tabsContainer: document.getElementById('tabs-container'),
            editorContainer: document.getElementById('editor-container'),
            editorWrapper: document.getElementById('editor-wrapper'),
            editorEl: document.getElementById('editor'),
            emptyState: document.getElementById('empty-state'),
            statusText: document.getElementById('status-text'),
            wordCount: document.getElementById('word-count'),
            searchInput: document.getElementById('search-input'),
            themeToggle: document.getElementById('theme-toggle'),
            newFileBtn: document.getElementById('new-file-btn'),
            newFileModal: document.getElementById('new-file-modal'),
            newFileName: document.getElementById('new-file-name'),
            confirmNewFile: document.getElementById('confirm-new-file'),
            cancelNewFile: document.getElementById('cancel-new-file'),
        };
    }

    async init() {
        // Load config
        try {
            const config = await api.getConfig();
            if (config.theme === 'dark') {
                this.setTheme('dark');
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }

        // Initialize file tree
        this.fileTree = new FileTree(this.elements.fileTree, {
            onFileSelect: (path) => this.selectFile(path),
            onFileOpen: (path) => this.openFile(path),
            onFileDeleted: (path) => this.closeTab(path),
        });

        await this.fileTree.load();

        // Initialize editor
        this.editor = new MarkdownEditor(this.elements.editorEl, {
            onLoad: (path) => this.setStatus('Loaded'),
            onSave: (path) => this.setStatus('Saved'),
            onChange: (path, content, dirty) => this.handleEditorChange(path, content, dirty),
            onError: (msg) => this.setStatus(msg),
            onStatus: (msg) => this.setStatus(msg),
        });

        await this.editor.init();

        // Connect WebSocket
        ws.connect();
        ws.on('fileEvent', (event) => this.handleFileEvent(event));
        ws.on('connected', () => this.setStatus('Connected'));
        ws.on('disconnected', () => this.setStatus('Disconnected'));

        // Setup event listeners
        this.setupEventListeners();

        // Check for initial file from URL
        const params = new URLSearchParams(window.location.search);
        const initialFile = params.get('file');
        if (initialFile) {
            this.openFile(initialFile);
        }

        this.setStatus('Ready');
    }

    setupEventListeners() {
        // Search
        this.elements.searchInput.addEventListener('input', (e) => {
            this.fileTree.setSearchQuery(e.target.value);
        });

        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });

        // New file button
        this.elements.newFileBtn.addEventListener('click', () => {
            this.showNewFileModal();
        });

        // New file modal
        this.elements.confirmNewFile.addEventListener('click', () => {
            this.createNewFile();
        });

        this.elements.cancelNewFile.addEventListener('click', () => {
            this.hideNewFileModal();
        });

        this.elements.newFileName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.createNewFile();
            } else if (e.key === 'Escape') {
                this.hideNewFileModal();
            }
        });

        this.elements.newFileModal.querySelector('.modal-backdrop').addEventListener('click', () => {
            this.hideNewFileModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + S - Save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                this.editor?.save();
            }

            // Cmd/Ctrl + W - Close tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                if (this.activeTab) {
                    this.closeTab(this.activeTab);
                }
            }

            // Cmd/Ctrl + N - New file
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                this.showNewFileModal();
            }

            // Cmd/Ctrl + P - Quick search
            if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
                e.preventDefault();
                this.elements.searchInput.focus();
            }
        });
    }

    selectFile(path) {
        this.fileTree.setActiveFile(path);
    }

    async openFile(path) {
        // Check if already open in a tab
        const existingTab = this.tabs.find(t => t.path === path);
        if (existingTab) {
            this.switchToTab(path);
            return;
        }

        // Create new tab
        const tab = {
            path,
            name: path.split('/').pop(),
            dirty: false,
        };

        this.tabs.push(tab);
        this.renderTabs();
        this.switchToTab(path);
    }

    async switchToTab(path) {
        // Save current editor state
        if (this.activeTab && this.editor) {
            this.editors.set(this.activeTab, this.editor.getContent());
        }

        this.activeTab = path;
        this.fileTree.setActiveFile(path);
        this.renderTabs();

        // Show editor
        this.elements.emptyState.classList.add('hidden');
        this.elements.editorWrapper.classList.add('visible');

        // Load file content
        const cached = this.editors.get(path);
        if (cached !== undefined) {
            await this.editor.setContent(cached);
            this.editor.currentPath = path;
        } else {
            await this.editor.loadFile(path);
        }

        this.updateWordCount();
        this.editor.focus();
    }

    closeTab(path) {
        const index = this.tabs.findIndex(t => t.path === path);
        if (index === -1) return;

        const tab = this.tabs[index];

        // Check for unsaved changes
        if (tab.dirty) {
            if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) {
                return;
            }
        }

        // Remove tab
        this.tabs.splice(index, 1);
        this.editors.delete(path);

        // Switch to another tab or show empty state
        if (this.activeTab === path) {
            if (this.tabs.length > 0) {
                const newIndex = Math.min(index, this.tabs.length - 1);
                this.switchToTab(this.tabs[newIndex].path);
            } else {
                this.activeTab = null;
                this.elements.editorWrapper.classList.remove('visible');
                this.elements.emptyState.classList.remove('hidden');
                this.fileTree.setActiveFile(null);
            }
        }

        this.renderTabs();
    }

    renderTabs() {
        this.elements.tabsContainer.innerHTML = this.tabs.map(tab => `
            <button class="tab ${tab.path === this.activeTab ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}"
                    data-path="${this.escapeAttr(tab.path)}">
                <span class="tab-name">${this.escapeHtml(tab.name)}</span>
                <span class="tab-close" data-close="${this.escapeAttr(tab.path)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </span>
            </button>
        `).join('');

        // Add event listeners
        this.elements.tabsContainer.querySelectorAll('.tab').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.tab-close')) {
                    this.closeTab(e.target.closest('.tab-close').dataset.close);
                } else {
                    this.switchToTab(el.dataset.path);
                }
            });
        });
    }

    handleEditorChange(path, content, dirty) {
        const tab = this.tabs.find(t => t.path === path);
        if (tab) {
            tab.dirty = dirty;
            this.renderTabs();
        }
        this.updateWordCount();
    }

    handleFileEvent(event) {
        console.log('File event:', event);

        if (event.eventType === 'modified' && event.path !== this.activeTab) {
            // File was modified externally, refresh if it's open
            if (this.tabs.find(t => t.path === event.path)) {
                // Could show notification or auto-reload
            }
        }

        // Refresh file tree on any change
        this.fileTree.refresh();
    }

    setTheme(theme) {
        this.theme = theme;
        document.body.dataset.theme = theme;

        const lightSheet = document.getElementById('theme-light');
        const darkSheet = document.getElementById('theme-dark');

        if (theme === 'dark') {
            lightSheet.disabled = true;
            darkSheet.disabled = false;
        } else {
            lightSheet.disabled = false;
            darkSheet.disabled = true;
        }
    }

    toggleTheme() {
        this.setTheme(this.theme === 'light' ? 'dark' : 'light');
    }

    showNewFileModal() {
        this.elements.newFileModal.classList.remove('hidden');
        this.elements.newFileName.value = '';
        this.elements.newFileName.focus();
    }

    hideNewFileModal() {
        this.elements.newFileModal.classList.add('hidden');
    }

    async createNewFile() {
        let name = this.elements.newFileName.value.trim();
        if (!name) return;

        // Add .md extension if not present
        if (!name.toLowerCase().endsWith('.md')) {
            name += '.md';
        }

        try {
            await api.createFile(name, `# ${name.replace('.md', '')}\n\n`);
            this.hideNewFileModal();
            await this.fileTree.refresh();
            this.openFile(name);
        } catch (error) {
            alert('Failed to create file: ' + error.message);
        }
    }

    setStatus(text) {
        this.elements.statusText.textContent = text;
    }

    updateWordCount() {
        if (this.editor) {
            const count = this.editor.getWordCount();
            this.elements.wordCount.textContent = `${count} words`;
        } else {
            this.elements.wordCount.textContent = '';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttr(text) {
        return text.replace(/"/g, '&quot;');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new InkwellApp();
    app.init().catch(console.error);
});
