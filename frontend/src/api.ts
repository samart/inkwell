// API client for Inkwell backend

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface FileData {
  path: string;
  content: string;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

interface ConfigData {
  theme: string;
  rootDir: string;
  initialFile: string;
}

interface ImageUploadResult {
  path: string;
}

interface DirectoryEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface DirectoryListResult {
  current: string;
  parent: string;
  directories: DirectoryEntry[];
}

interface FileMetadata {
  path: string;
  size: number;
  modifiedTime: string;
  isDir: boolean;
}

interface RecentLocation {
  path: string;
  name: string;
  lastOpened: string;
}

// Git types
interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'conflicted';
  staged: boolean;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  hasConflicts: boolean;
  isClean: boolean;
  remoteUrl?: string;
}

interface GitStatusResponse {
  isRepo: boolean;
  status?: GitStatus;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
}

interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream?: string;
}

interface PushPullResult {
  success: boolean;
  message: string;
}

interface PullResult extends PushPullResult {
  fastForward: boolean;
  newCommits: number;
}

interface AuthOptions {
  sshKeyPath?: string;
  sshPassphrase?: string;
  username?: string;
  password?: string;
}

class Api {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data: ApiResponse<T> = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.data as T;
  }

  async getTree(): Promise<FileNode> {
    return this.request<FileNode>('/tree');
  }

  async getFile(path: string): Promise<FileData> {
    return this.request<FileData>(`/files?path=${encodeURIComponent(path)}`);
  }

  async createFile(path: string, content: string = ''): Promise<{ path: string }> {
    return this.request<{ path: string }>('/files', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  }

  async updateFile(path: string, content: string): Promise<{ path: string }> {
    return this.request<{ path: string }>(`/files?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    });
  }

  async deleteFile(path: string): Promise<void> {
    await this.request<void>(`/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
  }

  async uploadImage(file: File): Promise<ImageUploadResult> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE}/images`, {
      method: 'POST',
      body: formData,
    });

    const data: ApiResponse<ImageUploadResult> = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Upload failed');
    }

    return data.data as ImageUploadResult;
  }

  async getConfig(): Promise<ConfigData> {
    return this.request<ConfigData>('/config');
  }

  async listDirectories(path?: string): Promise<DirectoryListResult> {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request<DirectoryListResult>(`/directories${params}`);
  }

  async changeDirectory(path: string): Promise<{ path: string }> {
    return this.request<{ path: string }>('/directories', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }


  async getFileMetadata(path: string): Promise<FileMetadata> {
    return this.request<FileMetadata>(`/files/metadata?path=${encodeURIComponent(path)}`);
  }

  async getRecents(): Promise<RecentLocation[]> {
    return this.request<RecentLocation[]>('/recents');
  }

  // Git operations
  async getGitStatus(): Promise<GitStatusResponse> {
    return this.request<GitStatusResponse>('/git/status');
  }

  async initGitRepo(): Promise<GitStatusResponse> {
    return this.request<GitStatusResponse>('/git/init', {
      method: 'POST',
    });
  }

  // Stage files for commit
  async stageFiles(files: string[], all: boolean = false): Promise<{ status: GitStatus }> {
    return this.request<{ status: GitStatus }>('/git/stage', {
      method: 'POST',
      body: JSON.stringify({ files, all }),
    });
  }

  // Unstage files
  async unstageFiles(files: string[], all: boolean = false): Promise<{ status: GitStatus }> {
    return this.request<{ status: GitStatus }>('/git/unstage', {
      method: 'POST',
      body: JSON.stringify({ files, all }),
    });
  }

  // Create a commit
  async commit(message: string, files?: string[]): Promise<{ commit: GitCommit; status: GitStatus }> {
    return this.request<{ commit: GitCommit; status: GitStatus }>('/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message, files }),
    });
  }

  // Discard changes to files
  async discardChanges(files: string[], all: boolean = false): Promise<{ status: GitStatus }> {
    return this.request<{ status: GitStatus }>('/git/discard', {
      method: 'POST',
      body: JSON.stringify({ files, all }),
    });
  }

  // Push commits to remote
  async push(auth?: AuthOptions): Promise<{ result: PushPullResult; status: GitStatus }> {
    return this.request<{ result: PushPullResult; status: GitStatus }>('/git/push', {
      method: 'POST',
      body: JSON.stringify(auth || {}),
    });
  }

  // Pull commits from remote
  async pull(auth?: AuthOptions): Promise<{ result: PullResult; status: GitStatus }> {
    return this.request<{ result: PullResult; status: GitStatus }>('/git/pull', {
      method: 'POST',
      body: JSON.stringify(auth || {}),
    });
  }

  // Fetch updates from remote
  async fetch(auth?: AuthOptions): Promise<{ result: PushPullResult; status: GitStatus }> {
    return this.request<{ result: PushPullResult; status: GitStatus }>('/git/fetch', {
      method: 'POST',
      body: JSON.stringify(auth || {}),
    });
  }

  // List all branches
  async listBranches(): Promise<{ branches: GitBranch[]; current: string }> {
    return this.request<{ branches: GitBranch[]; current: string }>('/git/branches');
  }

  // Checkout a branch
  async checkout(name: string, create: boolean = false): Promise<{ status: GitStatus; branches: GitBranch[] }> {
    return this.request<{ status: GitStatus; branches: GitBranch[] }>('/git/checkout', {
      method: 'POST',
      body: JSON.stringify({ name, create }),
    });
  }

  // Create a new branch
  async createBranch(name: string): Promise<{ branches: GitBranch[] }> {
    return this.request<{ branches: GitBranch[] }>('/git/branches/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Delete a branch
  async deleteBranch(name: string): Promise<{ branches: GitBranch[] }> {
    return this.request<{ branches: GitBranch[] }>('/git/branches/delete', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Rename a branch
  async renameBranch(name: string, newName: string): Promise<{ branches: GitBranch[]; status: GitStatus }> {
    return this.request<{ branches: GitBranch[]; status: GitStatus }>('/git/branches/rename', {
      method: 'POST',
      body: JSON.stringify({ name, newName }),
    });
  }

  // Get commit history
  async getHistory(limit: number = 50, skip: number = 0, filePath?: string): Promise<{ commits: GitCommit[] }> {
    let url = `/git/history?limit=${limit}&skip=${skip}`;
    if (filePath) {
      url += `&path=${encodeURIComponent(filePath)}`;
    }
    return this.request<{ commits: GitCommit[] }>(url);
  }

  // Get commit details
  async getCommitDetail(hash: string): Promise<CommitDetail> {
    return this.request<CommitDetail>(`/git/commit-detail?hash=${encodeURIComponent(hash)}`);
  }

  // Get diff between two commits
  async getDiff(fromHash: string, toHash: string, filePath?: string): Promise<DiffResult> {
    let url = `/git/diff?from=${encodeURIComponent(fromHash)}&to=${encodeURIComponent(toHash)}`;
    if (filePath) {
      url += `&path=${encodeURIComponent(filePath)}`;
    }
    return this.request<DiffResult>(url);
  }

  // Get file content at a specific commit
  async getFileAtCommit(hash: string, filePath: string): Promise<{ content: string; hash: string; path: string }> {
    return this.request<{ content: string; hash: string; path: string }>(
      `/git/file-at-commit?hash=${encodeURIComponent(hash)}&path=${encodeURIComponent(filePath)}`
    );
  }

  // Quick commit: stage, commit, and optionally push
  async quickCommit(message: string, files?: string[], push: boolean = false): Promise<QuickCommitResult> {
    return this.request<QuickCommitResult>('/git/quick-commit', {
      method: 'POST',
      body: JSON.stringify({ message, files, push }),
    });
  }
}

// History types
interface FileChange {
  path: string;
  oldPath?: string;
  action: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

interface CommitDetail {
  commit: GitCommit;
  changes: FileChange[];
}

interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'header';
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface FileDiff {
  path: string;
  oldPath?: string;
  action: string;
  binary: boolean;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

interface DiffResult {
  fromCommit: string;
  toCommit: string;
  files: FileDiff[];
}

interface QuickCommitResult {
  commit: GitCommit;
  status: GitStatus;
  push?: PushPullResult;
  pushError?: string;
}

export const api = new Api();
export type { FileNode, FileData, ConfigData, DirectoryEntry, DirectoryListResult, FileMetadata, RecentLocation, GitStatus, GitFileStatus, GitStatusResponse, GitCommit, GitBranch, PushPullResult, PullResult, AuthOptions, FileChange, CommitDetail, DiffLine, FileDiff, DiffResult, QuickCommitResult };
