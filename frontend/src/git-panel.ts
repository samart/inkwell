// Git panel component for managing git operations
import { api, GitStatus, GitFileStatus, GitCommit, GitBranch } from './api';

type TabType = 'changes' | 'history' | 'branches';

export class GitPanel {
  private container: HTMLElement;
  private status: GitStatus | null = null;
  private branches: GitBranch[] = [];
  private isRepo: boolean = false;
  private currentTab: TabType = 'changes';
  private onStatusChange: ((status: GitStatus | null) => void) | null = null;
  private isPushing: boolean = false;
  private isPulling: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setOnStatusChange(callback: (status: GitStatus | null) => void): void {
    this.onStatusChange = callback;
  }

  async refresh(): Promise<void> {
    try {
      const response = await api.getGitStatus();
      this.isRepo = response.isRepo;
      this.status = response.status || null;

      // Also load branches if we're on the branches tab
      if (this.isRepo && this.currentTab === 'branches') {
        await this.loadBranches();
      }

      this.render();
      if (this.onStatusChange) {
        this.onStatusChange(this.status);
      }
    } catch (err) {
      console.error('Failed to get git status:', err);
      this.isRepo = false;
      this.status = null;
      this.render();
    }
  }

  private async loadBranches(): Promise<void> {
    try {
      const result = await api.listBranches();
      this.branches = result.branches;
    } catch (err) {
      console.error('Failed to load branches:', err);
      this.branches = [];
    }
  }

  updateStatus(status: GitStatus | null, isRepo: boolean = true): void {
    this.status = status;
    this.isRepo = isRepo;
    this.render();
  }

  private render(): void {
    if (!this.isRepo) {
      this.container.innerHTML = `
        <div class="git-panel-empty">
          <p>Not a git repository</p>
          <p class="git-panel-hint">Initialize or clone a repository to use git features</p>
        </div>
      `;
      return;
    }

    if (!this.status) {
      this.container.innerHTML = `
        <div class="git-panel-loading">Loading...</div>
      `;
      return;
    }

    const hasRemote = this.status?.remoteUrl;

    this.container.innerHTML = `
      <div class="git-panel">
        <div class="git-panel-header">
          <div class="git-panel-tabs">
            <button class="git-tab ${this.currentTab === 'changes' ? 'active' : ''}" data-tab="changes">
              Changes ${this.getChangesCount()}
            </button>
            <button class="git-tab ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history" disabled>
              History
            </button>
            <button class="git-tab ${this.currentTab === 'branches' ? 'active' : ''}" data-tab="branches">
              Branches
            </button>
          </div>
          ${hasRemote ? `
            <div class="git-remote-actions">
              <button class="git-remote-btn" data-action="pull" title="Pull from remote" ${this.isPulling ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 12a.75.75 0 01-.75-.75V5.56L5.53 7.28a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06L8.75 5.56v5.69A.75.75 0 018 12z"/>
                  <path d="M2 13.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"/>
                </svg>
                ${this.isPulling ? 'Pulling...' : 'Pull'}
              </button>
              <button class="git-remote-btn" data-action="push" title="Push to remote" ${this.isPushing ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 4a.75.75 0 01.75.75v5.69l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V4.75A.75.75 0 018 4z"/>
                  <path d="M2 2.75a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"/>
                </svg>
                ${this.isPushing ? 'Pushing...' : 'Push'}
              </button>
            </div>
          ` : ''}
        </div>
        <div class="git-panel-content">
          ${this.renderCurrentTab()}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private getChangesCount(): string {
    if (!this.status?.files.length) return '';
    return `(${this.status.files.length})`;
  }

  private renderCurrentTab(): string {
    switch (this.currentTab) {
      case 'changes':
        return this.renderChangesTab();
      case 'history':
        return '<div class="git-panel-placeholder">History coming soon...</div>';
      case 'branches':
        return this.renderBranchesTab();
      default:
        return '';
    }
  }

  private renderBranchesTab(): string {
    const localBranches = this.branches.filter(b => !b.isRemote);
    const remoteBranches = this.branches.filter(b => b.isRemote);

    let html = `
      <div class="git-branch-actions">
        <button class="git-branch-create-btn" data-action="create-branch">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
          </svg>
          New Branch
        </button>
      </div>
    `;

    if (localBranches.length > 0) {
      html += `
        <div class="git-section">
          <div class="git-section-header">
            <span class="git-section-title">Local Branches (${localBranches.length})</span>
          </div>
          <div class="git-branch-list">
            ${localBranches.map(b => this.renderBranchItem(b)).join('')}
          </div>
        </div>
      `;
    }

    if (remoteBranches.length > 0) {
      html += `
        <div class="git-section">
          <div class="git-section-header">
            <span class="git-section-title">Remote Branches (${remoteBranches.length})</span>
          </div>
          <div class="git-branch-list">
            ${remoteBranches.map(b => this.renderBranchItem(b)).join('')}
          </div>
        </div>
      `;
    }

    if (localBranches.length === 0 && remoteBranches.length === 0) {
      html += `
        <div class="git-panel-clean">
          <p>No branches found</p>
          <p class="git-panel-hint">Create a commit to initialize a branch</p>
        </div>
      `;
    }

    return html;
  }

  private renderBranchItem(branch: GitBranch): string {
    const displayName = branch.isRemote ? branch.name.replace(/^origin\//, '') : branch.name;

    return `
      <div class="git-branch-item ${branch.isCurrent ? 'current' : ''}" data-branch="${branch.name}" data-is-remote="${branch.isRemote}">
        <span class="git-branch-icon">
          ${branch.isCurrent ? `
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
          ` : `
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
            </svg>
          `}
        </span>
        <span class="git-branch-name">${displayName}</span>
        ${branch.upstream ? `<span class="git-branch-upstream" title="Tracks ${branch.upstream}">${branch.upstream}</span>` : ''}
        ${!branch.isCurrent && !branch.isRemote ? `
          <div class="git-branch-actions-inline">
            <button class="git-branch-action" data-action="checkout" title="Switch to branch">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            </button>
            <button class="git-branch-action git-action-danger" data-action="delete" title="Delete branch">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
              </svg>
            </button>
          </div>
        ` : ''}
        ${branch.isRemote ? `
          <div class="git-branch-actions-inline">
            <button class="git-branch-action" data-action="checkout-remote" title="Checkout remote branch">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderChangesTab(): string {
    if (!this.status) return '';

    const stagedFiles = this.status.files.filter(f => f.staged);
    const unstagedFiles = this.status.files.filter(f => !f.staged);

    if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
      return `
        <div class="git-panel-clean">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
          <p>No changes</p>
          <p class="git-panel-hint">Working tree is clean</p>
        </div>
      `;
    }

    let html = '';

    // Staged files section
    if (stagedFiles.length > 0) {
      html += `
        <div class="git-section">
          <div class="git-section-header">
            <span class="git-section-title">Staged Changes (${stagedFiles.length})</span>
            <button class="git-section-action" data-action="unstage-all" title="Unstage all">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.75 1a.75.75 0 00-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75h-4.5zM8 4.5l-1.25-1.5h2.5L8 4.5z"/>
                <path d="M10.88 9.38a.75.75 0 10-1.06-1.06L8 10.14 6.18 8.32a.75.75 0 10-1.06 1.06l1.82 1.82-1.82 1.82a.75.75 0 101.06 1.06L8 12.26l1.82 1.82a.75.75 0 101.06-1.06l-1.82-1.82 1.82-1.82z"/>
              </svg>
            </button>
          </div>
          <div class="git-file-list">
            ${stagedFiles.map(f => this.renderFileItem(f, true)).join('')}
          </div>
        </div>
      `;
    }

    // Unstaged files section
    if (unstagedFiles.length > 0) {
      html += `
        <div class="git-section">
          <div class="git-section-header">
            <span class="git-section-title">Changes (${unstagedFiles.length})</span>
            <button class="git-section-action" data-action="stage-all" title="Stage all">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.75.75 0 01.75.75v5.69l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V4.75A.75.75 0 018 4z"/>
              </svg>
            </button>
          </div>
          <div class="git-file-list">
            ${unstagedFiles.map(f => this.renderFileItem(f, false)).join('')}
          </div>
        </div>
      `;
    }

    // Commit section (only show if there are staged files)
    if (stagedFiles.length > 0) {
      html += `
        <div class="git-commit-section">
          <textarea class="git-commit-message" placeholder="Commit message..." rows="3"></textarea>
          <button class="git-commit-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.93 8.5a4.002 4.002 0 01-7.86 0H.75a.75.75 0 010-1.5h3.32a4.002 4.002 0 017.86 0h3.32a.75.75 0 010 1.5h-3.32zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
            </svg>
            Commit
          </button>
        </div>
      `;
    }

    return html;
  }

  private renderFileItem(file: GitFileStatus, staged: boolean): string {
    const statusClass = `git-status-${file.status}`;
    const statusIcon = this.getStatusIcon(file.status);
    const fileName = file.path.split('/').pop() || file.path;
    const filePath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

    return `
      <div class="git-file-item ${statusClass}" data-path="${file.path}" data-staged="${staged}">
        <span class="git-file-status" title="${file.status}">${statusIcon}</span>
        <span class="git-file-name" title="${file.path}">
          ${fileName}
          ${filePath ? `<span class="git-file-path">${filePath}</span>` : ''}
        </span>
        <div class="git-file-actions">
          ${staged ? `
            <button class="git-file-action" data-action="unstage" title="Unstage">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12a.75.75 0 01-.75-.75V5.56L5.53 7.28a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06L8.75 5.56v5.69A.75.75 0 018 12z"/>
              </svg>
            </button>
          ` : `
            <button class="git-file-action" data-action="stage" title="Stage">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.75.75 0 01.75.75v5.69l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V4.75A.75.75 0 018 4z"/>
              </svg>
            </button>
            <button class="git-file-action git-action-danger" data-action="discard" title="Discard changes">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
              </svg>
            </button>
          `}
        </div>
      </div>
    `;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'modified':
        return 'M';
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      case 'untracked':
        return 'U';
      case 'conflicted':
        return '!';
      default:
        return '?';
    }
  }

  private attachEventListeners(): void {
    // Tab switching
    this.container.querySelectorAll('.git-tab').forEach(tab => {
      tab.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        if (target.hasAttribute('disabled')) return;
        const tabType = target.dataset.tab as TabType;
        if (tabType) {
          this.currentTab = tabType;
          if (tabType === 'branches') {
            await this.loadBranches();
          }
          this.render();
        }
      });
    });

    // Push/Pull buttons
    this.container.querySelector('[data-action="push"]')?.addEventListener('click', async () => {
      await this.handlePush();
    });

    this.container.querySelector('[data-action="pull"]')?.addEventListener('click', async () => {
      await this.handlePull();
    });

    // Create branch
    this.container.querySelector('[data-action="create-branch"]')?.addEventListener('click', async () => {
      await this.handleCreateBranch();
    });

    // Branch actions
    this.container.querySelectorAll('.git-branch-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        const branchItem = target.closest('.git-branch-item') as HTMLElement;
        const branchName = branchItem?.dataset.branch;

        if (!branchName) return;

        switch (action) {
          case 'checkout':
          case 'checkout-remote':
            await this.handleCheckout(branchName);
            break;
          case 'delete':
            await this.handleDeleteBranch(branchName);
            break;
        }
      });
    });

    // Stage all
    this.container.querySelector('[data-action="stage-all"]')?.addEventListener('click', async () => {
      await this.handleStageAll();
    });

    // Unstage all
    this.container.querySelector('[data-action="unstage-all"]')?.addEventListener('click', async () => {
      await this.handleUnstageAll();
    });

    // File actions
    this.container.querySelectorAll('.git-file-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        const fileItem = target.closest('.git-file-item') as HTMLElement;
        const path = fileItem?.dataset.path;

        if (!path) return;

        switch (action) {
          case 'stage':
            await this.handleStageFile(path);
            break;
          case 'unstage':
            await this.handleUnstageFile(path);
            break;
          case 'discard':
            await this.handleDiscardFile(path);
            break;
        }
      });
    });

    // Commit
    this.container.querySelector('.git-commit-btn')?.addEventListener('click', async () => {
      const textarea = this.container.querySelector('.git-commit-message') as HTMLTextAreaElement;
      const message = textarea?.value.trim();
      if (message) {
        await this.handleCommit(message);
      }
    });

    // Commit on Ctrl+Enter
    this.container.querySelector('.git-commit-message')?.addEventListener('keydown', async (e) => {
      const event = e as KeyboardEvent;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const textarea = e.target as HTMLTextAreaElement;
        const message = textarea?.value.trim();
        if (message) {
          await this.handleCommit(message);
        }
      }
    });
  }

  private async handleStageFile(path: string): Promise<void> {
    try {
      const result = await api.stageFiles([path]);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
    } catch (err) {
      console.error('Failed to stage file:', err);
      alert('Failed to stage file: ' + (err as Error).message);
    }
  }

  private async handleUnstageFile(path: string): Promise<void> {
    try {
      const result = await api.unstageFiles([path]);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
    } catch (err) {
      console.error('Failed to unstage file:', err);
      alert('Failed to unstage file: ' + (err as Error).message);
    }
  }

  private async handleDiscardFile(path: string): Promise<void> {
    if (!confirm(`Discard changes to ${path}? This cannot be undone.`)) {
      return;
    }

    try {
      const result = await api.discardChanges([path]);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
    } catch (err) {
      console.error('Failed to discard changes:', err);
      alert('Failed to discard changes: ' + (err as Error).message);
    }
  }

  private async handleStageAll(): Promise<void> {
    try {
      const result = await api.stageFiles([], true);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
    } catch (err) {
      console.error('Failed to stage all:', err);
      alert('Failed to stage all: ' + (err as Error).message);
    }
  }

  private async handleUnstageAll(): Promise<void> {
    try {
      const result = await api.unstageFiles([], true);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
    } catch (err) {
      console.error('Failed to unstage all:', err);
      alert('Failed to unstage all: ' + (err as Error).message);
    }
  }

  private async handleCommit(message: string): Promise<void> {
    try {
      const result = await api.commit(message);
      this.updateStatus(result.status);
      if (this.onStatusChange) {
        this.onStatusChange(result.status);
      }
      // Clear the commit message
      const textarea = this.container.querySelector('.git-commit-message') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = '';
      }
      // Show success message
      this.showCommitSuccess(result.commit);
    } catch (err) {
      console.error('Failed to commit:', err);
      alert('Failed to commit: ' + (err as Error).message);
    }
  }

  private showCommitSuccess(commit: GitCommit): void {
    // Brief success indicator
    const successEl = document.createElement('div');
    successEl.className = 'git-commit-success';
    successEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
      </svg>
      <span>Committed ${commit.shortHash}</span>
    `;
    this.container.appendChild(successEl);
    setTimeout(() => successEl.remove(), 3000);
  }


  private async handlePush(): Promise<void> {
    if (this.isPushing || !this.status) return;
    
    this.isPushing = true;
    this.render();
    
    try {
      const result = await api.push();
      this.status = result.status;
      this.render();
      
      if (result.result.success) {
        this.showNotification(result.result.message, 'success');
      }
      
      if (this.onStatusChange) {
        this.onStatusChange(this.status);
      }
    } catch (error) {
      console.error('Push failed:', error);
      this.showNotification(error instanceof Error ? error.message : 'Push failed', 'error');
    } finally {
      this.isPushing = false;
      this.render();
    }
  }

  private async handlePull(): Promise<void> {
    if (this.isPulling || !this.status) return;
    
    this.isPulling = true;
    this.render();
    
    try {
      const result = await api.pull();
      this.status = result.status;
      this.render();
      
      if (result.result.success) {
        const message = result.result.newCommits > 0
          ? `Pulled ${result.result.newCommits} new commit${result.result.newCommits > 1 ? 's' : ''}`
          : result.result.message;
        this.showNotification(message, 'success');
      }
      
      if (this.onStatusChange) {
        this.onStatusChange(this.status);
      }
    } catch (error) {
      console.error('Pull failed:', error);
      this.showNotification(error instanceof Error ? error.message : 'Pull failed', 'error');
    } finally {
      this.isPulling = false;
      this.render();
    }
  }

  private async handleCreateBranch(): Promise<void> {
    const name = prompt('Enter new branch name:');
    if (!name || !name.trim()) return;
    
    const branchName = name.trim();
    
    try {
      const result = await api.createBranch(branchName);
      this.branches = result.branches;
      this.render();
      this.showNotification(`Created branch '${branchName}'`, 'success');
    } catch (error) {
      console.error('Create branch failed:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to create branch', 'error');
    }
  }

  private async handleCheckout(branchName: string): Promise<void> {
    try {
      // Check if it's a remote branch (needs to create local tracking branch)
      const isRemote = branchName.startsWith('origin/');
      const localName = isRemote ? branchName.replace('origin/', '') : branchName;
      
      const result = await api.checkout(localName, isRemote);
      this.status = result.status;
      this.branches = result.branches;
      this.render();
      this.showNotification(`Switched to branch '${localName}'`, 'success');
      
      if (this.onStatusChange) {
        this.onStatusChange(this.status);
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to checkout branch', 'error');
    }
  }

  private async handleDeleteBranch(branchName: string): Promise<void> {
    if (!confirm(`Delete branch '${branchName}'?`)) return;
    
    try {
      const result = await api.deleteBranch(branchName);
      this.branches = result.branches;
      this.render();
      this.showNotification(`Deleted branch '${branchName}'`, 'success');
    } catch (error) {
      console.error('Delete branch failed:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to delete branch', 'error');
    }
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.className = `git-notification git-notification-${type}`;
    notification.textContent = message;
    this.container.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}
