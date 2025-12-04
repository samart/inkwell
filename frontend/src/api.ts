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
}

export const api = new Api();
export type { FileNode, FileData, ConfigData, DirectoryEntry, DirectoryListResult, FileMetadata, RecentLocation };
