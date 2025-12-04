// API client for Inkwell backend

const API_BASE = '/api';

class Api {
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Request failed');
        }

        return data.data;
    }

    // File tree
    async getTree() {
        return this.request('/tree');
    }

    // File operations
    async getFile(path) {
        return this.request(`/files?path=${encodeURIComponent(path)}`);
    }

    async createFile(path, content = '') {
        return this.request('/files', {
            method: 'POST',
            body: JSON.stringify({ path, content }),
        });
    }

    async updateFile(path, content) {
        return this.request(`/files?path=${encodeURIComponent(path)}`, {
            method: 'PUT',
            body: JSON.stringify({ path, content }),
        });
    }

    async deleteFile(path) {
        return this.request(`/files?path=${encodeURIComponent(path)}`, {
            method: 'DELETE',
        });
    }

    // Image upload
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${API_BASE}/images`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Upload failed');
        }

        return data.data;
    }

    // Config
    async getConfig() {
        return this.request('/config');
    }
}

export const api = new Api();
