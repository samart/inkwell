// File tree component

import { api } from './api.js';

class FileTree {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.tree = null;
        this.expandedDirs = new Set();
        this.activeFile = null;
        this.searchQuery = '';

        // Load expanded dirs from localStorage
        try {
            const saved = localStorage.getItem('inkwell-expanded-dirs');
            if (saved) {
                this.expandedDirs = new Set(JSON.parse(saved));
            }
        } catch (e) {
            // Ignore
        }
    }

    async load() {
        this.showLoading();
        try {
            this.tree = await api.getTree();
            this.render();
        } catch (error) {
            this.showError(error.message);
        }
    }

    async refresh() {
        try {
            this.tree = await api.getTree();
            this.render();
        } catch (error) {
            console.error('Failed to refresh tree:', error);
        }
    }

    setSearchQuery(query) {
        this.searchQuery = query.toLowerCase();
        this.render();
    }

    setActiveFile(path) {
        this.activeFile = path;
        this.render();
    }

    render() {
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
        this.renderNode(filtered, 0);
    }

    filterTree(node) {
        if (!this.searchQuery) {
            return node;
        }

        if (!node.isDir) {
            const matches = node.name.toLowerCase().includes(this.searchQuery);
            return matches ? node : null;
        }

        const filteredChildren = node.children
            ?.map(child => this.filterTree(child))
            .filter(child => child !== null);

        if (!filteredChildren || filteredChildren.length === 0) {
            return null;
        }

        return { ...node, children: filteredChildren };
    }

    renderNode(node, depth) {
        // Skip root node itself, just render children
        if (depth === 0 && node.isDir) {
            node.children?.forEach(child => this.renderNode(child, depth));
            return;
        }

        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.path = node.path;
        item.dataset.depth = depth;

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

        // Build content
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

        // Event listeners
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

        this.container.appendChild(item);

        // Render children if directory is expanded
        if (node.isDir && this.expandedDirs.has(node.path) && node.children) {
            node.children.forEach(child => this.renderNode(child, depth + 1));
        }
    }

    toggleDir(path) {
        if (this.expandedDirs.has(path)) {
            this.expandedDirs.delete(path);
        } else {
            this.expandedDirs.add(path);
        }

        // Save to localStorage
        try {
            localStorage.setItem('inkwell-expanded-dirs', JSON.stringify([...this.expandedDirs]));
        } catch (e) {
            // Ignore
        }

        this.render();
    }

    showContextMenu(event, node) {
        // Remove existing context menu
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

        // Event listeners
        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
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
                            alert('Failed to delete: ' + error.message);
                        }
                    }
                    break;
            }
        });

        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="tree-loading">
                <div class="tree-loading-spinner"></div>
                Loading...
            </div>
        `;
    }

    showEmpty(message = 'No markdown files found') {
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

    showError(message) {
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

export { FileTree };
