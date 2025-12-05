// Git status component for displaying branch and status in header
import { api, GitStatus, GitStatusResponse } from './api';

export class GitStatusComponent {
  private container: HTMLElement;
  private isRepo: boolean = false;
  private status: GitStatus | null = null;
  private onInitRepo: (() => void) | null = null;
  private onCloneRepo: (() => void) | null = null;
  private onTogglePanel: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setOnInitRepo(callback: () => void): void {
    this.onInitRepo = callback;
  }

  setOnCloneRepo(callback: () => void): void {
    this.onCloneRepo = callback;
  }

  setOnTogglePanel(callback: () => void): void {
    this.onTogglePanel = callback;
  }

  async refresh(): Promise<void> {
    try {
      const response = await api.getGitStatus();
      this.isRepo = response.isRepo;
      this.status = response.status || null;
      this.render();
    } catch (err) {
      console.error('Failed to get git status:', err);
      this.isRepo = false;
      this.status = null;
      this.render();
    }
  }

  update(response: GitStatusResponse): void {
    this.isRepo = response.isRepo;
    this.status = response.status || null;
    this.render();
  }

  private render(): void {
    if (!this.isRepo) {
      this.container.innerHTML = `
        <button class="git-init-btn" title="Initialize Git Repository">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M15.698 7.287L8.712.302a1.03 1.03 0 00-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 011.55 1.56l1.773 1.774a1.224 1.224 0 11-.733.692L8.52 5.902v4.253a1.225 1.225 0 11-1.008-.036V5.832a1.224 1.224 0 01-.665-1.605L5.02 2.401.302 7.12a1.03 1.03 0 000 1.457l6.986 6.986a1.03 1.03 0 001.457 0l6.953-6.953a1.03 1.03 0 000-1.457"/>
          </svg>
          <span>Init Git</span>
        </button>
        <div class="git-actions">
          <button class="git-action-btn git-clone-btn" title="Clone a remote repository">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 9H3V8h1v1zm0-3H3v1h1V6zm0-2H3v1h1V4zm0-2H3v1h1V2zm8-1v12c0 .55-.45 1-1 1H6v2l-1.5-1.5L3 16v-2H1c-.55 0-1-.45-1-1V1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1zm-1 10H1v2h2v-1h3v1h5v-2zm0-10H2v9h9V1z"/>
            </svg>
            Clone
          </button>
        </div>
      `;

      const initBtn = this.container.querySelector('.git-init-btn');
      initBtn?.addEventListener('click', () => this.handleInitRepo());

      const cloneBtn = this.container.querySelector('.git-clone-btn');
      cloneBtn?.addEventListener('click', () => this.handleCloneRepo());
      return;
    }

    if (!this.status) {
      this.container.innerHTML = '';
      return;
    }

    const { branch, ahead, behind, files, hasConflicts, isClean } = this.status;

    // Build sync indicator
    let syncIndicator = '';
    if (ahead > 0 || behind > 0) {
      syncIndicator = `<span class="git-sync">`;
      if (ahead > 0) {
        syncIndicator += `<span class="git-ahead" title="${ahead} commit(s) ahead">↑${ahead}</span>`;
      }
      if (behind > 0) {
        syncIndicator += `<span class="git-behind" title="${behind} commit(s) behind">↓${behind}</span>`;
      }
      syncIndicator += `</span>`;
    }

    // Build status indicator
    let statusIndicator = '';
    if (hasConflicts) {
      statusIndicator = `<span class="git-status-indicator git-conflict" title="Merge conflicts">!</span>`;
    } else if (!isClean) {
      const changedCount = files.length;
      statusIndicator = `<span class="git-status-indicator git-dirty" title="${changedCount} changed file(s)">●</span>`;
    }

    this.container.innerHTML = `
      <div class="git-branch clickable" title="Click to toggle Git panel">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M15.698 7.287L8.712.302a1.03 1.03 0 00-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 011.55 1.56l1.773 1.774a1.224 1.224 0 11-.733.692L8.52 5.902v4.253a1.225 1.225 0 11-1.008-.036V5.832a1.224 1.224 0 01-.665-1.605L5.02 2.401.302 7.12a1.03 1.03 0 000 1.457l6.986 6.986a1.03 1.03 0 001.457 0l6.953-6.953a1.03 1.03 0 000-1.457"/>
        </svg>
        <span class="git-branch-name">${branch}</span>
        ${syncIndicator}
        ${statusIndicator}
      </div>
    `;

    // Add click handler for toggling panel
    const branchDiv = this.container.querySelector('.git-branch');
    branchDiv?.addEventListener('click', () => {
      if (this.onTogglePanel) {
        this.onTogglePanel();
      }
    });
  }

  private async handleInitRepo(): Promise<void> {
    try {
      const response = await api.initGitRepo();
      this.update(response);
      if (this.onInitRepo) {
        this.onInitRepo();
      }
    } catch (err) {
      console.error('Failed to initialize git repository:', err);
      alert('Failed to initialize git repository: ' + (err as Error).message);
    }
  }

  private handleCloneRepo(): void {
    if (this.onCloneRepo) {
      this.onCloneRepo();
    }
  }

  getStatus(): GitStatus | null {
    return this.status;
  }

  isGitRepo(): boolean {
    return this.isRepo;
  }
}
