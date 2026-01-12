i like op# Auto-Save Design Document

## Overview

This document outlines the research, options, and recommended approach for improving auto-save functionality in Inkwell. The goal is to prevent data loss while maintaining good user experience and performance.

## Current Implementation

**Location:** `shared/src/editor.ts` and `frontend/src/editor.ts`

**Strategy:** Debounce-based auto-save
- Default delay: 5000ms (5 seconds) after typing stops
- Configurable via `autoSaveDelay` option
- Frontend wrapper intercepts `onSave` callback to call `api.updateFile()`

**Flow:**
1. User types → `handleChange()` called
2. Sets `isDirty = true`
3. Clears existing timeout, sets new timeout for `autoSaveDelay` ms
4. When timeout expires → `notifySave()` → `onSave()` callback
5. Frontend wrapper performs actual API save

**Gap:** No handling for:
- Window/tab focus loss (user switches away)
- Periodic backup saves (long typing sessions)
- Tab close/browser crash scenarios

---

## Auto-Save Strategies

### 1. Debounce-Based (Current)

Saves X seconds after user stops typing.

| Aspect | Detail |
|--------|--------|
| **Trigger** | Typing stops for N seconds |
| **Typical Interval** | 3-7 seconds |
| **Pros** | Efficient, natural save point, minimal server load |
| **Cons** | Could lose up to N seconds if crash occurs |
| **Best For** | Primary save mechanism |

**Our current 5-second delay is industry standard.**

### 2. Focus-Based (Proposed)

Saves when browser window/tab loses focus.

| Aspect | Detail |
|--------|--------|
| **Trigger** | Tab hidden, window blur, or navigation |
| **APIs** | `visibilitychange`, `blur`, `pagehide` |
| **Pros** | Saves before user switches context, prevents tab close data loss |
| **Cons** | Can trigger unnecessary saves if user frequently switches |
| **Best For** | Catching context switches |

**Browser APIs:**

```typescript
// Most reliable for tab switching
document.addEventListener('visibilitychange', () => {
  if (document.hidden && this.isDirty) {
    this.save();
  }
});

// Window loses focus (Alt+Tab, clicking outside)
window.addEventListener('blur', () => {
  if (this.isDirty) {
    this.save();
  }
});
```

**Reliability:**
- `visibilitychange`: Excellent (98%+ browser support, fires reliably)
- `blur`: Good (100% support, less reliable for tab switches)
- `beforeunload`: Poor (blocked on mobile, time-limited, use for warnings only)

### 3. Periodic/Time-Based (Proposed)

Saves at regular intervals regardless of user activity.

| Aspect | Detail |
|--------|--------|
| **Trigger** | Every N seconds if dirty |
| **Typical Interval** | 30-300 seconds |
| **Pros** | Guaranteed max data loss window, catches edge cases |
| **Cons** | Can create unnecessary server load |
| **Best For** | Safety net / backup mechanism |

**Common intervals:**
- Aggressive: 10-15 seconds (Google Docs)
- Balanced: 30-60 seconds (most apps)
- Conservative: 2-5 minutes (traditional)

### 4. Hybrid (Recommended)

Combines multiple strategies for maximum safety.

```
Debounce (5s) + Focus Loss + Periodic (5min)
```

---

## Industry Examples

| App | Strategy | Debounce | Periodic | Focus Save |
|-----|----------|----------|----------|------------|
| **Google Docs** | Aggressive hybrid | ~2-5s | Yes (continuous) | Yes |
| **Notion** | Optimistic hybrid | ~1-2s | Background sync | Yes |
| **VS Code** | Configurable | 1s (configurable) | Optional | Optional ("onFocusChange") |
| **Obsidian** | Immediate (local) | Immediate | N/A | N/A |
| **Medium** | Moderate | ~5-7s | ~30s | Yes |

---

## Chosen Approach

**Decision:** Focus Loss + Periodic saves (no debounce)

**Rationale:** Debounce-based saving (even at 5 seconds) creates excessive file writes that:
- Flood IDE Local History with entries
- Trigger unnecessary file watcher events
- Create noise for tools watching the filesystem

**Save Triggers:**
1. **Focus loss** - When tab becomes hidden or window loses focus
2. **Periodic** - Every 5 minutes (configurable) as a safety net

**Trade-off accepted:** Maximum data loss increases from 5 seconds to 5 minutes, but this is acceptable because:
- Most data loss occurs when switching away (covered by focus loss)
- Long uninterrupted editing sessions are rare
- Users can reduce periodic interval if desired
- IDE/tool noise is significantly reduced

---

## Implementation

**Configuration options:**

```typescript
interface EditorOptions {
  // Removed: autoSaveDelay (debounce)
  periodicSaveInterval?: number;    // Periodic backup (default: 300000ms = 5min, 0 = disabled)
  saveOnBlur?: boolean;             // Save on focus loss (default: true)
  minSaveInterval?: number;         // Throttle: min time between saves (default: 1000ms)
}
```

**Implementation:**

```typescript
class MarkdownEditor {
  private periodicSaveTimer: number | null = null;
  private lastSaveTime: number = 0;
  private minSaveInterval: number = 1000;

  async init(): Promise<this> {
    // ... existing init ...

    // Setup visibility change handler
    if (this.options.saveOnBlur !== false) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('blur', this.handleBlur);
    }

    // Setup periodic save
    const interval = this.options.periodicSaveInterval ?? 300000; // 5 minutes
    if (interval > 0) {
      this.periodicSaveTimer = window.setInterval(() => {
        if (this.isDirty) {
          this.notifySave();
        }
      }, interval);
    }

    return this;
  }

  private handleVisibilityChange = () => {
    if (document.hidden && this.isDirty) {
      this.notifySave();
    }
  };

  private handleBlur = () => {
    if (this.isDirty) {
      this.notifySave();
    }
  };

  // Throttling prevents rapid saves from blur+visibility firing together
  notifySave(): void {
    if (!this.currentPath || !this.isDirty) return;

    const now = Date.now();
    if (now - this.lastSaveTime < this.minSaveInterval) {
      return;
    }
    this.lastSaveTime = now;

    // ... existing save logic ...
  }

  destroy(): void {
    if (this.periodicSaveTimer) clearInterval(this.periodicSaveTimer);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleBlur);
    this.crepe?.destroy();
  }
}
```

---

## Future Enhancements (Optional)

Additional hardening for production robustness:

1. **localStorage emergency backup** - Save to localStorage as crash recovery
2. **Network failure retry** - Queue failed saves, retry with backoff
3. **Offline mode** - Detect offline, queue saves, sync when online
4. **Multi-tab sync** - Use BroadcastChannel to prevent conflicts

---

## Edge Cases

### Tab Close Without Saving

**Problem:** User closes tab with unsaved changes.

**Solution:** `visibilitychange` fires when tab is closed (before unload), allowing save. For extra safety, add localStorage backup:

```typescript
private emergencyBackup(): void {
  if (this.isDirty && this.currentPath) {
    localStorage.setItem('inkwell-backup', JSON.stringify({
      path: this.currentPath,
      content: this.getContent(),
      timestamp: Date.now()
    }));
  }
}

// On init, check for backup and offer recovery
private checkEmergencyBackup(): void {
  const backup = localStorage.getItem('inkwell-backup');
  if (backup) {
    // Show recovery dialog...
  }
}
```

### Network Failures

**Problem:** Save fails due to network issues.

**Solution:** Already handled in `frontend/src/editor.ts` - shows error via `onError` callback. Future enhancement could add retry queue.

### Concurrent Edits (Multiple Tabs)

**Problem:** Same file open in multiple tabs.

**Solution:** Future enhancement using BroadcastChannel API or server-side conflict detection.

---

## Configuration Defaults

| Setting | Default | Rationale |
|---------|---------|-----------|
| `periodicSaveInterval` | 300000ms (5min) | Safety net without excess saves |
| `saveOnBlur` | true | Catches most data loss scenarios |
| `minSaveInterval` | 1000ms | Prevents save spam from overlapping events |

---

## CLI Flag Updates

```go
// internal/config/config.go
type Config struct {
    // ... existing ...
    PeriodicSaveInterval  int  // --periodic-save-interval (default: 300000, 0 = disabled)
    SaveOnBlur            bool // --save-on-blur (default: true)
}
```

Note: Remove the existing `--auto-save-delay` flag (debounce is being removed).

---

## Implementation Plan

1. Remove debounce logic from `shared/src/editor.ts`
2. Add focus-loss handlers (`visibilitychange` + `blur`)
3. Add periodic save with configurable interval
4. Add throttling to prevent rapid saves
5. Update CLI flags (remove `autoSaveDelay`, add new flags)
6. Update tests

---

## References

- [Page Visibility API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [visibilitychange event (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
- [VS Code Auto Save Settings](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save)
