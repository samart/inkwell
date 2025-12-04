// File tree component

import { api, FileNode, FileMetadata } from './api';

export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
}

interface FileTreeOptions {
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onFileDeleted?: (path: string) => void;
  onRename?: (path: string) => void;
  onHeadingClick?: (path: string, line: number) => void;
}

export class FileTree {
  private container: HTMLElement;
  private options: FileTreeOptions;
  private tree: FileNode | null = null;
  private expandedDirs: Set<string> = new Set();
  private activeFile: string | null = null;
  private searchQuery = '';
  private tooltip: HTMLElement | null = null;
  private tooltipTimeout: number | null = null;
  private metadataCache: Map<string, FileMetadata> = new Map();
  private outline: OutlineHeading[] = [];
  private outlineExpanded = true;
  private collapsedSiblings: boolean = true; // Auto-collapse siblings when file is active
  private expandedSiblingGroups: Set<string> = new Set(); // Track which sibling groups are expanded

  constructor(container: HTMLElement, options: FileTreeOptions = {}) {
    this.container = container;
    this.options = options;

    // Load expanded dirs from localStorage
    try {
      const saved = localStorage.getItem('inkwell-expanded-dirs');
      if (saved) {
        this.expandedDirs = new Set(JSON.parse(saved));
      }
    } catch {
      // Ignore
    }
  }

  async load(): Promise<void> {
    this.showLoading();
    try {
      this.tree = await api.getTree();
      this.render();
    } catch (error) {
      this.showError((error as Error).message);
    }
  }

  async refresh(): Promise<void> {
    try {
      this.tree = await api.getTree();
      this.render();
    } catch (error) {
      console.error('Failed to refresh tree:', error);
    }
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.render();
  }

  setActiveFile(path: string | null): void {
    // Reset expanded siblings when switching to a new file
    if (path !== this.activeFile) {
      this.expandedSiblingGroups.clear();
    }
    this.activeFile = path;
    this.render();
  }

  private render(): void {
    if (!this.tree) {
      this.showEmpty();
      return;
    }

    const filtered = this.filterTree(this.tree);
    if (!filtered || (filtered.children && filtered.children.length === 0)) {
      if (this.searchQuery) {
        this.showEmpty('No files match your search');
      } else {
        this.showEmpty('No markdown files found');
      }
      return;
    }

    this.container.innerHTML = '';
    this.renderNodeWithCollapse(filtered, 0, null);
  }

  // Get the parent directory path from a file path
  private getParentPath(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '';
  }

  // Render a group of sibling nodes with potential collapsing
  private renderNodeWithCollapse(node: FileNode, depth: number, _parentPath: string | null): void {
    // Skip root node itself, just render children with collapse logic
    if (depth === 0 && node.isDir) {
      this.renderChildrenWithCollapse(node.children || [], depth, node.path);
      return;
    }

    this.renderSingleNode(node, depth);

    // Render outline for active file
    if (!node.isDir && this.activeFile === node.path && this.outline.length > 0) {
      this.renderOutline(depth);
    }

    if (node.isDir && this.expandedDirs.has(node.path) && node.children) {
      this.renderChildrenWithCollapse(node.children, depth + 1, node.path);
    }
  }

  // Render children with smart collapse behavior
  private renderChildrenWithCollapse(children: FileNode[], depth: number, parentPath: string): void {
    if (!this.activeFile || !this.collapsedSiblings || this.searchQuery) {
      // No collapse when no active file, collapse disabled, or searching
      children.forEach(child => this.renderNodeWithCollapse(child, depth, parentPath));
      return;
    }

    const activeParent = this.getParentPath(this.activeFile);
    const isActiveParent = activeParent === parentPath || (parentPath === '' && !activeParent.includes('/'));

    if (!isActiveParent) {
      // Not the parent of active file, render normally
      children.forEach(child => this.renderNodeWithCollapse(child, depth, parentPath));
      return;
    }

    // This directory contains the active file - apply collapse logic
    const groupKey = parentPath || 'root';
    const isExpanded = this.expandedSiblingGroups.has(groupKey);

    // Separate active file, files before it, and files after it
    const activeIndex = children.findIndex(c => c.path === this.activeFile);

    if (activeIndex === -1) {
      // Active file not directly in this list, render normally
      children.forEach(child => this.renderNodeWithCollapse(child, depth, parentPath));
      return;
    }

    // Get siblings before and after
    const beforeActive = children.slice(0, activeIndex);
    const activeNode = children[activeIndex];
    const afterActive = children.slice(activeIndex + 1);

    // Render "show more" pill for files before (if any and collapsed)
    if (beforeActive.length > 0 && !isExpanded) {
      this.renderCollapsedPill(beforeActive, depth, groupKey, 'before');
    } else {
      beforeActive.forEach(child => this.renderNodeWithCollapse(child, depth, parentPath));
    }

    // Always render the active file
    this.renderNodeWithCollapse(activeNode, depth, parentPath);

    // Render "show more" pill for files after (if any and collapsed)
    if (afterActive.length > 0 && !isExpanded) {
      this.renderCollapsedPill(afterActive, depth, groupKey, 'after');
    } else {
      afterActive.forEach(child => this.renderNodeWithCollapse(child, depth, parentPath));
    }
  }

  // Render an elegant collapsed pill showing hidden files
  private renderCollapsedPill(hiddenNodes: FileNode[], depth: number, groupKey: string, position: 'before' | 'after'): void {
    const pill = document.createElement('div');
    pill.className = 'sibling-collapse-pill';
    pill.dataset.depth = String(depth);
    pill.dataset.position = position;

    const count = hiddenNodes.length;
    const fileText = count === 1 ? 'file' : 'files';

    pill.innerHTML = `
      <span class="collapse-pill-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
      <span class="collapse-pill-text">${count} more ${fileText}</span>
    `;

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expandedSiblingGroups.add(groupKey);
      this.render();
    });

    this.container.appendChild(pill);
  }

  // Render a single node (extracted from original renderNode)
  private renderSingleNode(node: FileNode, depth: number): void {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.path = node.path;
    item.dataset.depth = String(depth);

    if (node.isDir) {
      item.classList.add('directory');
      if (this.expandedDirs.has(node.path)) {
        item.classList.add('expanded');
      }
    } else {
      if (this.activeFile === node.path) {
        item.classList.add('active');
      }
    }

    let html = '';

    if (node.isDir) {
      html += `<svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>`;
      html += `<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>`;
    } else {
      html += `<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>`;
    }

    html += `<span class="tree-name">${this.escapeHtml(node.name)}</span>`;
    item.innerHTML = html;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (node.isDir) {
        this.toggleDir(node.path);
      } else {
        this.options.onFileSelect?.(node.path);
      }
    });

    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!node.isDir) {
        this.options.onFileOpen?.(node.path);
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, node);
    });

    // Tooltip on hover
    item.addEventListener('mouseenter', (e) => {
      this.showTooltip(e, node);
    });

    item.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    this.container.appendChild(item);
  }

  private filterTree(node: FileNode): FileNode | null {
    if (!this.searchQuery) {
      return node;
    }

    if (!node.isDir) {
      const matches = node.name.toLowerCase().includes(this.searchQuery);
      return matches ? node : null;
    }

    const filteredChildren = node.children
      ?.map(child => this.filterTree(child))
      .filter((child): child is FileNode => child !== null);

    if (!filteredChildren || filteredChildren.length === 0) {
      return null;
    }

    return { ...node, children: filteredChildren };
  }

  private renderNode(node: FileNode, depth: number): void {
    // Skip root node itself, just render children
    if (depth === 0 && node.isDir) {
      node.children?.forEach(child => this.renderNode(child, depth));
      return;
    }

    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.path = node.path;
    item.dataset.depth = String(depth);

    if (node.isDir) {
      item.classList.add('directory');
      if (this.expandedDirs.has(node.path)) {
        item.classList.add('expanded');
      }
    } else {
      if (this.activeFile === node.path) {
        item.classList.add('active');
      }
    }

    let html = '';

    if (node.isDir) {
      html += `<svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>`;
      html += `<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>`;
    } else {
      html += `<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>`;
    }

    html += `<span class="tree-name">${this.escapeHtml(node.name)}</span>`;
    item.innerHTML = html;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (node.isDir) {
        this.toggleDir(node.path);
      } else {
        this.options.onFileSelect?.(node.path);
      }
    });

    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!node.isDir) {
        this.options.onFileOpen?.(node.path);
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, node);
    });

    // Tooltip on hover
    item.addEventListener('mouseenter', (e) => {
      this.showTooltip(e, node);
    });

    item.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    this.container.appendChild(item);

    // Render outline for active file
    if (!node.isDir && this.activeFile === node.path && this.outline.length > 0) {
      this.renderOutline(depth);
    }

    if (node.isDir && this.expandedDirs.has(node.path) && node.children) {
      node.children.forEach(child => this.renderNode(child, depth + 1));
    }
  }

  private renderOutline(_fileDepth: number): void {
    // Create outline container
    const outlineContainer = document.createElement('div');
    outlineContainer.className = 'outline-container';
    if (this.outlineExpanded) {
      outlineContainer.classList.add('expanded');
    }

    // Create outline header (collapsible)
    const outlineHeader = document.createElement('div');
    outlineHeader.className = 'outline-header';
    outlineHeader.innerHTML = `
      <svg class="outline-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span class="outline-title">Outline</span>
    `;
    outlineHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      this.outlineExpanded = !this.outlineExpanded;
      outlineContainer.classList.toggle('expanded', this.outlineExpanded);
    });
    outlineContainer.appendChild(outlineHeader);

    // Create outline items
    const outlineItems = document.createElement('div');
    outlineItems.className = 'outline-items';

    for (const heading of this.outline) {
      const headingItem = document.createElement('div');
      headingItem.className = 'outline-item';
      headingItem.dataset.level = String(heading.level);
      headingItem.dataset.line = String(heading.line);

      headingItem.innerHTML = `
        <span class="outline-text">${this.escapeHtml(heading.text)}</span>
      `;

      headingItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeFile) {
          this.options.onHeadingClick?.(this.activeFile, heading.line);
        }
      });

      outlineItems.appendChild(headingItem);
    }

    outlineContainer.appendChild(outlineItems);
    this.container.appendChild(outlineContainer);
  }

  updateOutline(headings: OutlineHeading[]): void {
    this.outline = headings;
    this.render();
  }

  clearOutline(): void {
    this.outline = [];
    this.render();
  }

  private toggleDir(path: string): void {
    if (this.expandedDirs.has(path)) {
      this.expandedDirs.delete(path);
    } else {
      this.expandedDirs.add(path);
    }

    try {
      localStorage.setItem('inkwell-expanded-dirs', JSON.stringify([...this.expandedDirs]));
    } catch {
      // Ignore
    }

    this.render();
  }

  private showContextMenu(event: MouseEvent, node: FileNode): void {
    const existing = document.querySelector('.tree-context-menu');
    if (existing) {
      existing.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'tree-context-menu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    let html = '';

    if (!node.isDir) {
      html += `<div class="tree-context-menu-item" data-action="open">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Open
      </div>`;
    }

    html += `<div class="tree-context-menu-item" data-action="rename">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
      </svg>
      Rename
    </div>`;

    html += `<div class="tree-context-menu-divider"></div>`;

    html += `<div class="tree-context-menu-item danger" data-action="delete">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Delete
    </div>`;

    menu.innerHTML = html;

    menu.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      if (!action) return;

      menu.remove();

      switch (action) {
        case 'open':
          this.options.onFileOpen?.(node.path);
          break;
        case 'rename':
          this.options.onRename?.(node.path);
          break;
        case 'delete':
          if (confirm(`Delete "${node.name}"?`)) {
            try {
              await api.deleteFile(node.path);
              this.options.onFileDeleted?.(node.path);
              await this.refresh();
            } catch (error) {
              alert('Failed to delete: ' + (error as Error).message);
            }
          }
          break;
      }
    });

    document.body.appendChild(menu);

    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  private showLoading(): void {
    this.container.innerHTML = `
      <div class="tree-loading">
        <div class="tree-loading-spinner"></div>
        Loading...
      </div>
    `;
  }

  private showEmpty(message = 'No markdown files found'): void {
    this.container.innerHTML = `
      <div class="tree-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        ${this.escapeHtml(message)}
      </div>
    `;
  }

  private showError(message: string): void {
    this.container.innerHTML = `
      <div class="tree-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        ${this.escapeHtml(message)}
      </div>
    `;
  }


  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private createTooltip(): HTMLElement {
    if (this.tooltip) return this.tooltip;
    
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'file-tooltip';
    document.body.appendChild(this.tooltip);
    return this.tooltip;
  }

  private async showTooltip(event: MouseEvent, node: FileNode): Promise<void> {
    // Clear any pending tooltip
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    // Delay showing tooltip
    this.tooltipTimeout = window.setTimeout(async () => {
      const tooltip = this.createTooltip();
      
      // Check cache first
      let metadata = this.metadataCache.get(node.path);
      
      if (!metadata) {
        // Show loading state
        tooltip.innerHTML = `
          <div class="tooltip-path">${this.escapeHtml(node.path)}</div>
          <div class="tooltip-loading">Loading...</div>
        `;
        tooltip.classList.add('visible');
        this.positionTooltip(event);
        
        try {
          metadata = await api.getFileMetadata(node.path);
          this.metadataCache.set(node.path, metadata);
        } catch {
          tooltip.innerHTML = `
            <div class="tooltip-path">${this.escapeHtml(node.path)}</div>
            <div class="tooltip-error">Could not load metadata</div>
          `;
          return;
        }
      }
      
      // Show full metadata
      tooltip.innerHTML = `
        <div class="tooltip-path">${this.escapeHtml(node.path)}</div>
        <div class="tooltip-meta">
          <span class="tooltip-size">${node.isDir ? 'Directory' : this.formatFileSize(metadata.size)}</span>
          <span class="tooltip-modified">Modified: ${metadata.modifiedTime}</span>
        </div>
      `;
      tooltip.classList.add('visible');
      this.positionTooltip(event);
    }, 400);
  }

  private positionTooltip(event: MouseEvent): void {
    if (!this.tooltip) return;
    
    const padding = 10;
    let left = event.clientX + padding;
    let top = event.clientY + padding;
    
    // Ensure tooltip doesn't go off-screen
    const rect = this.tooltip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) {
      left = event.clientX - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight) {
      top = event.clientY - rect.height - padding;
    }
    
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hideTooltip(): void {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }
    if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
