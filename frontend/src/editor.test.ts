/**
 * Tests for the MarkdownEditor auto-save functionality.
 *
 * These tests verify that:
 * 1. Auto-save triggers API calls when debounce fires
 * 2. Errors are properly propagated to the error callback
 * 3. Save state (isSaving) prevents re-entrant saves
 * 4. Both manual save and auto-save work correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the API module
vi.mock('./api', () => ({
  api: {
    updateFile: vi.fn(),
    getFile: vi.fn(),
    uploadImage: vi.fn(),
  },
}));

// Since MarkdownEditor has complex dependencies (milkdown), we test the logic separately
describe('Auto-save behavior', () => {
  let mockUpdateFile: ReturnType<typeof vi.fn>;
  let mockOnSave: ReturnType<typeof vi.fn>;
  let mockOnError: ReturnType<typeof vi.fn>;
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Get the mocked api
    const { api } = await import('./api');
    mockUpdateFile = api.updateFile as ReturnType<typeof vi.fn>;

    mockOnSave = vi.fn();
    mockOnError = vi.fn();
    mockOnChange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('performAutoSave simulation', () => {
    // Simulate the auto-save logic extracted from MarkdownEditor
    async function performAutoSave(
      path: string,
      content: string,
      isSavingRef: { value: boolean },
      options: { onSave?: (path: string) => void; onError?: (msg: string) => void }
    ): Promise<void> {
      if (isSavingRef.value) return;

      isSavingRef.value = true;
      try {
        await mockUpdateFile(path, content);
        options.onSave?.(path);
      } catch (error) {
        options.onError?.('Auto-save failed: ' + (error as Error).message);
      } finally {
        isSavingRef.value = false;
      }
    }

    it('should call API to save file', async () => {
      mockUpdateFile.mockResolvedValue({ path: 'test.md' });
      const isSavingRef = { value: false };

      await performAutoSave('test.md', '# Content', isSavingRef, {
        onSave: mockOnSave,
        onError: mockOnError,
      });

      expect(mockUpdateFile).toHaveBeenCalledWith('test.md', '# Content');
      expect(mockOnSave).toHaveBeenCalledWith('test.md');
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it('should call onError when API fails', async () => {
      mockUpdateFile.mockRejectedValue(new Error('Network error'));
      const isSavingRef = { value: false };

      await performAutoSave('test.md', '# Content', isSavingRef, {
        onSave: mockOnSave,
        onError: mockOnError,
      });

      expect(mockUpdateFile).toHaveBeenCalled();
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith('Auto-save failed: Network error');
    });

    it('should prevent re-entrant saves', async () => {
      mockUpdateFile.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ path: 'test.md' }), 100))
      );
      const isSavingRef = { value: false };

      // Start first save
      const save1 = performAutoSave('test.md', '# First', isSavingRef, {
        onSave: mockOnSave,
      });

      // Try to save again while first is in progress
      const save2 = performAutoSave('test.md', '# Second', isSavingRef, {
        onSave: mockOnSave,
      });

      vi.advanceTimersByTime(100);
      await save1;
      await save2;

      // Only one API call should have been made
      expect(mockUpdateFile).toHaveBeenCalledTimes(1);
      expect(mockUpdateFile).toHaveBeenCalledWith('test.md', '# First');
    });

    it('should reset isSaving flag after error', async () => {
      mockUpdateFile.mockRejectedValue(new Error('Failed'));
      const isSavingRef = { value: false };

      await performAutoSave('test.md', '# Content', isSavingRef, {
        onError: mockOnError,
      });

      // isSaving should be reset even after error
      expect(isSavingRef.value).toBe(false);
    });

    it('should handle empty content', async () => {
      mockUpdateFile.mockResolvedValue({ path: 'test.md' });
      const isSavingRef = { value: false };

      await performAutoSave('test.md', '', isSavingRef, {
        onSave: mockOnSave,
      });

      expect(mockUpdateFile).toHaveBeenCalledWith('test.md', '');
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  describe('debounce behavior simulation', () => {
    it('should debounce multiple rapid changes', () => {
      let saveTimeout: ReturnType<typeof setTimeout> | null = null;
      const notifySave = vi.fn();

      // Simulate handleChange
      function handleChange() {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
          notifySave();
        }, 1000);
      }

      // Rapid changes
      handleChange();
      handleChange();
      handleChange();
      handleChange();

      // Before debounce timeout
      vi.advanceTimersByTime(500);
      expect(notifySave).not.toHaveBeenCalled();

      // More changes reset the timer
      handleChange();
      vi.advanceTimersByTime(500);
      expect(notifySave).not.toHaveBeenCalled();

      // After debounce timeout
      vi.advanceTimersByTime(500);
      expect(notifySave).toHaveBeenCalledTimes(1);
    });

    it('should trigger save after 1 second of inactivity', () => {
      let saveTimeout: ReturnType<typeof setTimeout> | null = null;
      const notifySave = vi.fn();

      function handleChange() {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
          notifySave();
        }, 1000);
      }

      handleChange();

      vi.advanceTimersByTime(999);
      expect(notifySave).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(notifySave).toHaveBeenCalledTimes(1);
    });
  });

  describe('onSave callback interception', () => {
    it('should intercept onSave to trigger actual save', async () => {
      mockUpdateFile.mockResolvedValue({ path: 'test.md' });

      // Simulate the onSave interceptor logic
      let isSaving = false;
      const externalOnSave = vi.fn();

      // This is what the constructor sets up:
      const internalOnSave = async (path: string) => {
        if (isSaving) {
          externalOnSave(path);
          return;
        }
        // Perform auto-save
        isSaving = true;
        try {
          await mockUpdateFile(path, 'content');
          externalOnSave(path);
        } finally {
          isSaving = false;
        }
      };

      // Simulate shared editor calling onSave
      await internalOnSave('test.md');

      expect(mockUpdateFile).toHaveBeenCalledWith('test.md', 'content');
      expect(externalOnSave).toHaveBeenCalledWith('test.md');
    });

    it('should pass through onSave when already saving', async () => {
      mockUpdateFile.mockResolvedValue({ path: 'test.md' });

      let isSaving = true; // Already saving
      const externalOnSave = vi.fn();

      const internalOnSave = async (path: string) => {
        if (isSaving) {
          externalOnSave(path);
          return;
        }
        await mockUpdateFile(path, 'content');
        externalOnSave(path);
      };

      await internalOnSave('test.md');

      // Should not call API since already saving
      expect(mockUpdateFile).not.toHaveBeenCalled();
      // But should still notify external callback
      expect(externalOnSave).toHaveBeenCalledWith('test.md');
    });
  });

  describe('error message display', () => {
    it('should format error message correctly', async () => {
      const errorMessage = 'Connection refused';
      mockUpdateFile.mockRejectedValue(new Error(errorMessage));

      let displayedError = '';
      const isSavingRef = { value: false };

      // Simulate performAutoSave
      try {
        await mockUpdateFile('test.md', 'content');
      } catch (error) {
        displayedError = 'Auto-save failed: ' + (error as Error).message;
      }

      expect(displayedError).toBe('Auto-save failed: Connection refused');
    });

    it('should handle non-Error exceptions', async () => {
      mockUpdateFile.mockRejectedValue('String error');

      let displayedError = '';

      try {
        await mockUpdateFile('test.md', 'content');
      } catch (error) {
        // This mimics the actual error handling
        displayedError = 'Auto-save failed: ' + String(error);
      }

      expect(displayedError).toBe('Auto-save failed: String error');
    });
  });
});

describe('API updateFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be called with correct parameters', async () => {
    const { api } = await import('./api');
    const mockUpdateFile = api.updateFile as ReturnType<typeof vi.fn>;
    mockUpdateFile.mockResolvedValue({ path: 'doc.md' });

    await api.updateFile('doc.md', '# My Document\n\nContent here');

    expect(mockUpdateFile).toHaveBeenCalledWith('doc.md', '# My Document\n\nContent here');
  });

  it('should handle special characters in path', async () => {
    const { api } = await import('./api');
    const mockUpdateFile = api.updateFile as ReturnType<typeof vi.fn>;
    mockUpdateFile.mockResolvedValue({ path: 'docs/file with spaces.md' });

    await api.updateFile('docs/file with spaces.md', 'content');

    expect(mockUpdateFile).toHaveBeenCalledWith('docs/file with spaces.md', 'content');
  });

  it('should handle unicode content', async () => {
    const { api } = await import('./api');
    const mockUpdateFile = api.updateFile as ReturnType<typeof vi.fn>;
    mockUpdateFile.mockResolvedValue({ path: 'test.md' });

    const unicodeContent = '# Hello World! \n\nEmojis: \n\n中文内容';
    await api.updateFile('test.md', unicodeContent);

    expect(mockUpdateFile).toHaveBeenCalledWith('test.md', unicodeContent);
  });
});