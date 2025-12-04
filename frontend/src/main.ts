// Main application entry point

import { api, DirectoryEntry, RecentLocation } from './api';
import { ws, FileEvent } from './websocket';
import { FileTree } from './filetree';
import { MarkdownEditor } from './editor';
import { MermaidRenderer } from './mermaid-renderer';
import './styles/main.css';

interface Tab {
  path: string;
  name: string;
  dirty: boolean;
}

class InkwellApp {
  private fileTree: FileTree | null = null;
  private editor: MarkdownEditor | null = null;
  private mermaidRenderer: MermaidRenderer | null = null;
  private tabs: Tab[] = [];
  private activeTab: string | null = null;
  private editors: Map<string, string> = new Map();
  private theme: string = 'light';
  private markdownPanelOpen = false;
  private directoryPath = '';
  private recents: RecentLocation[] = [];

  private elements = {
    sidebar: document.getElementById('sidebar')!,
    fileTree: document.getElementById('file-tree')!,
    tabsContainer: document.getElementById('tabs-container')!,
    editorContainer: document.getElementById('editor-container')!,
    editorWrapper: document.getElementById('editor-wrapper')!,
    editorEl: document.getElementById('editor')!,
    markdownPanel: document.getElementById('markdown-panel')!,
    markdownContent: document.getElementById('markdown-content')!,
    emptyState: document.getElementById('empty-state')!,
    statusText: document.getElementById('status-text')!,
    wordCount: document.getElementById('word-count')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    themeToggle: document.getElementById('theme-toggle')!,
    newFileBtn: document.getElementById('new-file-btn')!,
    newFileModal: document.getElementById('new-file-modal')!,
    newFileName: document.getElementById('new-file-name') as HTMLInputElement,
    confirmNewFile: document.getElementById('confirm-new-file')!,
    cancelNewFile: document.getElementById('cancel-new-file')!,
    openFolderBtn: document.getElementById('open-folder-btn')!,
    directoryModal: document.getElementById('directory-modal')!,
    directoryPathInput: document.getElementById('directory-path-input') as HTMLInputElement,
    directoryList: document.getElementById('directory-list')!,
    confirmDirectory: document.getElementById('confirm-directory')!,
    cancelDirectory: document.getElementById('cancel-directory')!,
    toggleMarkdown: document.getElementById('toggle-markdown')!,
    closeMarkdownPanel: document.getElementById('close-markdown-panel')!,
    copyMarkdown: document.getElementById('copy-markdown')!,
    widthControl: document.getElementById('width-control')!,
    startupModal: document.getElementById('startup-modal')!,
    startupRecents: document.getElementById('startup-recents')!,
    startupBrowse: document.getElementById('startup-browse')!,
    startupContinue: document.getElementById('startup-continue')!,
    themeSelector: document.getElementById('theme-selector')!,
    closeThemeSelector: document.getElementById('close-theme-selector')!,
  };

  async init(): Promise<void> {
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
      onHeadingClick: (path, line) => this.scrollToHeading(path, line),
    });

    await this.fileTree.load();

    // Initialize editor
    this.editor = new MarkdownEditor(this.elements.editorEl, {
      onLoad: () => this.setStatus('Loaded'),
      onSave: () => this.setStatus('Saved'),
      onChange: (path, _content, dirty) => this.handleEditorChange(path, dirty),
      onError: (msg) => this.setStatus(msg),
      onStatus: (msg) => this.setStatus(msg),
    });

    await this.editor.init();

    // Initialize Mermaid diagram renderer
    this.mermaidRenderer = new MermaidRenderer(this.elements.editorEl);
    this.mermaidRenderer.start();

    // Connect WebSocket
    ws.connect();
    ws.on('fileEvent', (event) => this.handleFileEvent(event as FileEvent));
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

    // Check for recents and show startup modal if available
    try {
      this.recents = await api.getRecents();
      if (this.recents.length > 1) {
        // Only show if there are multiple recent locations to choose from
        this.showStartupModal();
      }
    } catch (e) {
      console.error('Failed to load recents:', e);
    }

    this.setStatus('Ready');
  }

  private setupEventListeners(): void {
    // Search
    this.elements.searchInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.fileTree?.setSearchQuery(target.value);
    });

    // Theme toggle - show selector popup
    this.elements.themeToggle.addEventListener('click', () => {
      this.toggleThemeSelector();
    });

    // Theme selector close button
    this.elements.closeThemeSelector.addEventListener('click', () => {
      this.hideThemeSelector();
    });

    // Theme card clicks
    this.elements.themeSelector.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', () => {
        const theme = (card as HTMLElement).dataset.theme!;
        this.setTheme(theme);
        this.updateThemeCards();
      });
    });

    // Close theme selector when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!this.elements.themeSelector.classList.contains('hidden') &&
          !this.elements.themeSelector.contains(target) &&
          !this.elements.themeToggle.contains(target)) {
        this.hideThemeSelector();
      }
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

    this.elements.newFileModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hideNewFileModal();
    });

    // Open folder button
    this.elements.openFolderBtn.addEventListener('click', () => {
      this.showDirectoryModal();
    });

    // Directory modal
    this.elements.confirmDirectory.addEventListener('click', () => {
      this.openDirectory();
    });

    this.elements.cancelDirectory.addEventListener('click', () => {
      this.hideDirectoryModal();
    });

    this.elements.directoryPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.openDirectory();
      } else if (e.key === 'Escape') {
        this.hideDirectoryModal();
      }
    });

    this.elements.directoryModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hideDirectoryModal();
    });

    // Startup modal
    this.elements.startupBrowse.addEventListener('click', () => {
      this.hideStartupModal();
      this.showDirectoryModal();
    });

    this.elements.startupContinue.addEventListener('click', () => {
      this.hideStartupModal();
    });

    this.elements.startupModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hideStartupModal();
    });

    // Markdown panel buttons
    this.elements.toggleMarkdown.addEventListener('click', () => this.toggleMarkdownPanel());
    this.elements.closeMarkdownPanel.addEventListener('click', () => this.toggleMarkdownPanel(false));
    this.elements.copyMarkdown.addEventListener('click', () => this.copyMarkdownToClipboard());

    // Width control buttons
    this.elements.widthControl.querySelectorAll('.width-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const width = (btn as HTMLElement).dataset.width as 'narrow' | 'normal' | 'wide' | 'full';
        this.setEditorWidth(width);
      });
    });

    // Close markdown panel when clicking into editor
    this.elements.editorWrapper.addEventListener('click', () => {
      if (this.markdownPanelOpen) {
        this.toggleMarkdownPanel(false);
      }
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

  private selectFile(path: string): void {
    this.fileTree?.setActiveFile(path);
  }

  async openFile(path: string): Promise<void> {
    // Check if already open in a tab
    const existingTab = this.tabs.find(t => t.path === path);
    if (existingTab) {
      this.switchToTab(path);
      return;
    }

    // Create new tab
    const tab: Tab = {
      path,
      name: path.split('/').pop() || path,
      dirty: false,
    };

    this.tabs.push(tab);
    this.renderTabs();
    this.switchToTab(path);
  }

  private async switchToTab(path: string): Promise<void> {
    // Save current editor state
    if (this.activeTab && this.editor) {
      this.editors.set(this.activeTab, this.editor.getContent());
    }

    this.activeTab = path;
    this.fileTree?.setActiveFile(path);
    this.renderTabs();

    // Show editor
    this.elements.emptyState.classList.add('hidden');
    this.elements.editorWrapper.classList.remove('hidden');

    // Load file content
    const cached = this.editors.get(path);
    if (cached !== undefined) {
      await this.editor?.setContent(cached);
      this.editor?.setCurrentPath(path);
    } else {
      await this.editor?.loadFile(path);
    }

    this.updateWordCount();
    this.updateOutline();
    this.editor?.focus();
  }

  private closeTab(path: string): void {
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
        this.elements.editorWrapper.classList.add('hidden');
        this.elements.emptyState.classList.remove('hidden');
        this.fileTree?.setActiveFile(null);
      }
    }

    this.renderTabs();
  }

  private renderTabs(): void {
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
        const target = e.target as HTMLElement;
        const closeBtn = target.closest('.tab-close');
        if (closeBtn) {
          this.closeTab(closeBtn.getAttribute('data-close')!);
        } else {
          this.switchToTab((el as HTMLElement).dataset.path!);
        }
      });
    });
  }

  private handleEditorChange(path: string, dirty: boolean): void {
    const tab = this.tabs.find(t => t.path === path);
    if (tab) {
      tab.dirty = dirty;
      this.renderTabs();
    }
    this.updateWordCount();
    this.updateOutline();

    // Update markdown panel if open
    if (this.markdownPanelOpen) {
      this.updateMarkdownView();
    }
  }

  private handleFileEvent(event: FileEvent): void {
    console.log('File event:', event);

    // Refresh file tree on any change
    this.fileTree?.refresh();
  }

  private setTheme(theme: string): void {
    this.theme = theme;
    document.body.dataset.theme = theme;

    // Add 'dark' class for any dark theme (for legacy CSS selectors)
    if (theme.startsWith('dark')) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }

    // Update toggle button title to show current theme
    const themeNames: Record<string, string> = {
      'light': 'Light',
      'light-sepia': 'Sepia',
      'light-ocean': 'Ocean',
      'dark': 'Dark',
      'dark-nord': 'Nord',
      'dark-monokai': 'Monokai',
    };
    this.elements.themeToggle.title = `Theme: ${themeNames[theme] || theme}`;
  }

  // Theme selector methods
  private toggleThemeSelector(): void {
    const isHidden = this.elements.themeSelector.classList.contains('hidden');
    if (isHidden) {
      this.showThemeSelector();
    } else {
      this.hideThemeSelector();
    }
  }

  private showThemeSelector(): void {
    this.elements.themeSelector.classList.remove('hidden');
    this.updateThemeCards();
  }

  private hideThemeSelector(): void {
    this.elements.themeSelector.classList.add('hidden');
  }

  private updateThemeCards(): void {
    this.elements.themeSelector.querySelectorAll('.theme-card').forEach(card => {
      const cardTheme = (card as HTMLElement).dataset.theme;
      card.classList.toggle('active', cardTheme === this.theme);
    });
  }

  private showNewFileModal(): void {
    this.elements.newFileModal.classList.remove('hidden');
    this.elements.newFileName.value = '';
    this.elements.newFileName.focus();
  }

  private hideNewFileModal(): void {
    this.elements.newFileModal.classList.add('hidden');
  }

  private async createNewFile(): Promise<void> {
    let name = this.elements.newFileName.value.trim();
    if (!name) return;

    // Add .md extension if not present
    if (!name.toLowerCase().endsWith('.md')) {
      name += '.md';
    }

    try {
      await api.createFile(name, `# ${name.replace('.md', '')}\n\n`);
      this.hideNewFileModal();
      await this.fileTree?.refresh();
      this.openFile(name);
    } catch (error) {
      alert('Failed to create file: ' + (error as Error).message);
    }
  }

  private setStatus(text: string): void {
    this.elements.statusText.textContent = text;
  }

  private updateWordCount(): void {
    if (this.editor) {
      const count = this.editor.getWordCount();
      this.elements.wordCount.textContent = `${count} words`;
    } else {
      this.elements.wordCount.textContent = '';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return text.replace(/"/g, '&quot;');
  }

  // Directory chooser methods
  private async showDirectoryModal(): Promise<void> {
    this.elements.directoryModal.classList.remove('hidden');

    // Load recents
    try {
      this.recents = await api.getRecents();
    } catch (error) {
      console.error('Failed to load recents:', error);
      this.recents = [];
    }

    // Load initial directory listing - start one level up from current
    try {
      // First get current directory info to find its parent
      const currentResult = await api.listDirectories();
      const parentPath = currentResult.parent;

      // Now load the parent directory listing
      const result = await api.listDirectories(parentPath);
      this.directoryPath = result.current;
      this.elements.directoryPathInput.value = result.current;
      this.renderDirectoryList(result.directories, result.parent);
    } catch (error) {
      console.error('Failed to list directories:', error);
    }

    this.elements.directoryPathInput.focus();
  }

  private hideDirectoryModal(): void {
    this.elements.directoryModal.classList.add('hidden');
  }

  private renderDirectoryList(directories: DirectoryEntry[], parent: string): void {
    let html = '';

    // Show recents section if we have recents and we're at the initial view
    if (this.recents.length > 0) {
      html += '<div class="recents-section">';
      html += '<div class="recents-header">Recent Locations</div>';
      for (const recent of this.recents) {
        html += `
          <div class="directory-item recent" data-path="${this.escapeAttr(recent.path)}" data-recent="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <div class="recent-info">
              <span class="recent-name">${this.escapeHtml(recent.name)}</span>
              <span class="recent-path">${this.escapeHtml(recent.path)}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
      html += '<div class="directory-divider"></div>';
      html += '<div class="browse-header">Browse</div>';
    }

    // Add parent directory option
    if (parent !== this.directoryPath) {
      html += `
        <div class="directory-item parent" data-path="${this.escapeAttr(parent)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>..</span>
        </div>
      `;
    }

    // Add directories
    for (const dir of directories) {
      html += `
        <div class="directory-item" data-path="${this.escapeAttr(dir.path)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>${this.escapeHtml(dir.name)}</span>
        </div>
      `;
    }

    if (directories.length === 0 && parent === this.directoryPath) {
      html += '<div class="directory-empty">No subdirectories</div>';
    }

    this.elements.directoryList.innerHTML = html;

    // Add click handlers for regular directory items
    this.elements.directoryList.querySelectorAll('.directory-item:not([data-recent])').forEach(el => {
      el.addEventListener('click', async () => {
        const path = (el as HTMLElement).dataset.path!;
        try {
          const result = await api.listDirectories(path);
          this.directoryPath = result.current;
          this.elements.directoryPathInput.value = result.current;
          // Clear recents after navigating (only show on initial view)
          this.recents = [];
          this.renderDirectoryList(result.directories, result.parent);
        } catch (error) {
          console.error('Failed to list directories:', error);
        }
      });

      el.addEventListener('dblclick', async () => {
        const path = (el as HTMLElement).dataset.path!;
        this.elements.directoryPathInput.value = path;
        await this.openDirectory();
      });
    });

    // Add click handlers for recent items (single click opens)
    this.elements.directoryList.querySelectorAll('.directory-item[data-recent]').forEach(el => {
      el.addEventListener('click', async () => {
        const path = (el as HTMLElement).dataset.path!;
        this.elements.directoryPathInput.value = path;
        await this.openDirectory();
      });
    });
  }

  private async openDirectory(): Promise<void> {
    const path = this.elements.directoryPathInput.value.trim();
    if (!path) return;

    try {
      await api.changeDirectory(path);
      this.hideDirectoryModal();

      // Close all tabs
      this.tabs = [];
      this.editors.clear();
      this.activeTab = null;
      this.renderTabs();

      // Show empty state and close markdown panel
      this.elements.editorWrapper.classList.add('hidden');
      this.elements.emptyState.classList.remove('hidden');
      this.toggleMarkdownPanel(false);

      // Refresh file tree
      await this.fileTree?.load();
      this.setStatus('Opened: ' + path);
    } catch (error) {
      alert('Failed to open directory: ' + (error as Error).message);
    }
  }

  // Editor width methods
  private setEditorWidth(width: 'narrow' | 'normal' | 'wide' | 'full'): void {
    this.elements.editorEl.dataset.width = width;

    // Update active button
    this.elements.widthControl.querySelectorAll('.width-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.width === width);
    });
  }

  // Markdown panel methods
  private toggleMarkdownPanel(open?: boolean): void {
    this.markdownPanelOpen = open ?? !this.markdownPanelOpen;

    this.elements.markdownPanel.classList.toggle('hidden', !this.markdownPanelOpen);
    this.elements.toggleMarkdown.classList.toggle('active', this.markdownPanelOpen);

    if (this.markdownPanelOpen) {
      this.updateMarkdownView();
    }
  }

  private updateMarkdownView(): void {
    if (this.editor) {
      const markdown = this.editor.getContent();
      this.elements.markdownContent.textContent = markdown;
    }
  }

  private async copyMarkdownToClipboard(): Promise<void> {
    if (!this.editor) return;

    const markdown = this.editor.getContent();
    try {
      await navigator.clipboard.writeText(markdown);
      this.setStatus('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      this.setStatus('Failed to copy');
    }
  }

  private scrollToHeading(_path: string, line: number): void {
    this.editor?.scrollToLine(line);
  }

  private updateOutline(): void {
    if (this.editor && this.activeTab) {
      const headings = this.editor.getHeadings();
      this.fileTree?.updateOutline(headings);
    } else {
      this.fileTree?.clearOutline();
    }
  }

  // Startup modal methods
  private showStartupModal(): void {
    this.elements.startupModal.classList.remove('hidden');
    this.renderStartupRecents();
  }

  private hideStartupModal(): void {
    this.elements.startupModal.classList.add('hidden');
  }

  private renderStartupRecents(): void {
    let html = '';
    for (const recent of this.recents) {
      html += `
        <div class="startup-recent-item" data-path="${this.escapeAttr(recent.path)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <div class="startup-recent-info">
            <span class="startup-recent-name">${this.escapeHtml(recent.name)}</span>
            <span class="startup-recent-path">${this.escapeHtml(recent.path)}</span>
          </div>
        </div>
      `;
    }
    this.elements.startupRecents.innerHTML = html;

    // Add click handlers
    this.elements.startupRecents.querySelectorAll('.startup-recent-item').forEach(el => {
      el.addEventListener('click', async () => {
        const path = (el as HTMLElement).dataset.path!;
        await this.openStartupDirectory(path);
      });
    });
  }

  private async openStartupDirectory(path: string): Promise<void> {
    try {
      await api.changeDirectory(path);
      this.hideStartupModal();
      await this.fileTree?.load();
      this.setStatus('Opened: ' + path);
    } catch (error) {
      alert('Failed to open directory: ' + (error as Error).message);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new InkwellApp();
  app.init().catch(console.error);
});
