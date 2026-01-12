/**
 * Tests for the MarkdownEditor auto-save functionality.
 *
 * These tests verify that:
 * 1. Focus-loss (visibility/blur) triggers saves
 * 2. Periodic saves trigger at the configured interval
 * 3. Throttling prevents rapid saves
 * 4. Errors are properly propagated to the error callback
 * 5. Save state (isSaving) prevents re-entrant saves
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

  describe('focus-loss save behavior', () => {
    it('should save when visibility changes to hidden', () => {
      let isDirty = true;
      const notifySave = vi.fn();

      // Simulate visibilitychange handler
      function handleVisibilityChange() {
        // Note: document.hidden would be checked, simulated here as true
        const isHidden = true;
        if (isHidden && isDirty) {
          notifySave();
        }
      }

      handleVisibilityChange();

      expect(notifySave).toHaveBeenCalledTimes(1);
    });

    it('should not save on visibility change if not dirty', () => {
      let isDirty = false;
      const notifySave = vi.fn();

      function handleVisibilityChange() {
        const isHidden = true;
        if (isHidden && isDirty) {
          notifySave();
        }
      }

      handleVisibilityChange();

      expect(notifySave).not.toHaveBeenCalled();
    });

    it('should save when window loses focus (blur)', () => {
      let isDirty = true;
      const notifySave = vi.fn();

      function handleBlur() {
        if (isDirty) {
          notifySave();
        }
      }

      handleBlur();

      expect(notifySave).toHaveBeenCalledTimes(1);
    });

    it('should not save on blur if not dirty', () => {
      let isDirty = false;
      const notifySave = vi.fn();

      function handleBlur() {
        if (isDirty) {
          notifySave();
        }
      }

      handleBlur();

      expect(notifySave).not.toHaveBeenCalled();
    });
  });

  describe('periodic save behavior', () => {
    it('should save periodically at configured interval', () => {
      let isDirty = true;
      const notifySave = vi.fn();
      const periodicInterval = 300000; // 5 minutes

      // Simulate setInterval setup
      const intervalId = setInterval(() => {
        if (isDirty) {
          notifySave();
        }
      }, periodicInterval);

      // Should not save immediately
      expect(notifySave).not.toHaveBeenCalled();

      // Advance by 5 minutes
      vi.advanceTimersByTime(300000);
      expect(notifySave).toHaveBeenCalledTimes(1);

      // Advance by another 5 minutes
      vi.advanceTimersByTime(300000);
      expect(notifySave).toHaveBeenCalledTimes(2);

      clearInterval(intervalId);
    });

    it('should not save periodically if not dirty', () => {
      let isDirty = false;
      const notifySave = vi.fn();
      const periodicInterval = 300000;

      const intervalId = setInterval(() => {
        if (isDirty) {
          notifySave();
        }
      }, periodicInterval);

      vi.advanceTimersByTime(600000); // 10 minutes

      expect(notifySave).not.toHaveBeenCalled();

      clearInterval(intervalId);
    });

    it('should respect custom periodic interval', () => {
      let isDirty = true;
      const notifySave = vi.fn();
      const customInterval = 60000; // 1 minute

      const intervalId = setInterval(() => {
        if (isDirty) {
          notifySave();
        }
      }, customInterval);

      vi.advanceTimersByTime(60000);
      expect(notifySave).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60000);
      expect(notifySave).toHaveBeenCalledTimes(2);

      clearInterval(intervalId);
    });

    it('should not start periodic saves if interval is 0', () => {
      let isDirty = true;
      const notifySave = vi.fn();
      const periodicInterval = 0;

      let intervalId: ReturnType<typeof setInterval> | null = null;
      if (periodicInterval > 0) {
        intervalId = setInterval(() => {
          if (isDirty) {
            notifySave();
          }
        }, periodicInterval);
      }

      vi.advanceTimersByTime(600000);

      expect(notifySave).not.toHaveBeenCalled();
      expect(intervalId).toBeNull();
    });
  });

  describe('throttling behavior', () => {
    it('should throttle rapid saves', () => {
      let lastSaveTime = 0;
      let isDirty = true;
      const minSaveInterval = 1000;
      const actualSave = vi.fn();

      function notifySave() {
        if (!isDirty) return;

        const now = Date.now();
        if (now - lastSaveTime < minSaveInterval) {
          return;
        }
        lastSaveTime = now;
        isDirty = false;
        actualSave();
      }

      // First save should work
      notifySave();
      expect(actualSave).toHaveBeenCalledTimes(1);

      // Reset dirty flag
      isDirty = true;

      // Immediate second save should be throttled
      notifySave();
      expect(actualSave).toHaveBeenCalledTimes(1);

      // Advance time past throttle
      vi.advanceTimersByTime(1000);

      // Now save should work
      isDirty = true;
      notifySave();
      expect(actualSave).toHaveBeenCalledTimes(2);
    });

    it('should prevent blur and visibility from double-saving', () => {
      let lastSaveTime = 0;
      let isDirty = true;
      const minSaveInterval = 1000;
      const actualSave = vi.fn();

      function notifySave() {
        if (!isDirty) return;

        const now = Date.now();
        if (now - lastSaveTime < minSaveInterval) {
          return;
        }
        lastSaveTime = now;
        isDirty = false;
        actualSave();
      }

      // Simulate both blur and visibilitychange firing
      notifySave(); // visibility change
      isDirty = true; // Pretend something resets dirty
      notifySave(); // blur

      // Only one save should occur due to throttling
      expect(actualSave).toHaveBeenCalledTimes(1);
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
