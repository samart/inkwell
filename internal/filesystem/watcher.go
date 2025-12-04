package filesystem

import (
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
)

// EventType represents the type of file system event
type EventType string

const (
	EventCreated  EventType = "created"
	EventModified EventType = "modified"
	EventDeleted  EventType = "deleted"
	EventRenamed  EventType = "renamed"
)

// FileEvent represents a file system event
type FileEvent struct {
	Type EventType `json:"type"`
	Path string    `json:"path"` // Relative path from root
}

// Watcher watches for file system changes
type Watcher struct {
	rootDir   string
	watcher   *fsnotify.Watcher
	listeners []chan FileEvent
	mu        sync.RWMutex
	done      chan struct{}
	closed    bool
}

// NewWatcher creates a new file system watcher
func NewWatcher(rootDir string) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		rootDir: rootDir,
		watcher: fsWatcher,
		done:    make(chan struct{}),
	}

	// Add root directory and subdirectories
	if err := w.addDirRecursive(rootDir); err != nil {
		fsWatcher.Close()
		return nil, err
	}

	// Start watching
	go w.watch()

	return w, nil
}

// Subscribe returns a channel that receives file events
func (w *Watcher) Subscribe() chan FileEvent {
	w.mu.Lock()
	defer w.mu.Unlock()

	ch := make(chan FileEvent, 100)
	w.listeners = append(w.listeners, ch)
	return ch
}

// Unsubscribe removes a listener
func (w *Watcher) Unsubscribe(ch chan FileEvent) {
	w.mu.Lock()
	defer w.mu.Unlock()

	for i, listener := range w.listeners {
		if listener == ch {
			w.listeners = append(w.listeners[:i], w.listeners[i+1:]...)
			close(ch)
			return
		}
	}
}

// Close stops the watcher
func (w *Watcher) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true
	close(w.done)
	return w.watcher.Close()
}

// watch processes file system events
func (w *Watcher) watch() {
	for {
		select {
		case <-w.done:
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			w.handleEvent(event)
		case _, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			// Log error but continue watching
		}
	}
}

// handleEvent processes a single file system event
func (w *Watcher) handleEvent(event fsnotify.Event) {
	// Get relative path
	relPath, err := filepath.Rel(w.rootDir, event.Name)
	if err != nil {
		return
	}

	// Skip hidden files and directories
	if strings.HasPrefix(filepath.Base(event.Name), ".") {
		return
	}

	// Only care about markdown files for content changes
	isMarkdown := isMarkdownFile(event.Name)
	isDir := event.Op&fsnotify.Create != 0 // New directories need to be watched

	var fileEvent FileEvent
	fileEvent.Path = relPath

	switch {
	case event.Op&fsnotify.Create != 0:
		fileEvent.Type = EventCreated
		// Watch new directories
		if isDir {
			w.addDirRecursive(event.Name)
		}
	case event.Op&fsnotify.Write != 0:
		if !isMarkdown {
			return
		}
		fileEvent.Type = EventModified
	case event.Op&fsnotify.Remove != 0:
		fileEvent.Type = EventDeleted
	case event.Op&fsnotify.Rename != 0:
		fileEvent.Type = EventRenamed
	default:
		return
	}

	// Notify all listeners
	w.mu.RLock()
	defer w.mu.RUnlock()
	for _, ch := range w.listeners {
		select {
		case ch <- fileEvent:
		default:
			// Drop event if channel is full
		}
	}
}

// addDirRecursive adds a directory and its subdirectories to the watcher
func (w *Watcher) addDirRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip directories we can't access
		}

		// Skip hidden directories
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") && path != dir {
			return filepath.SkipDir
		}

		if info.IsDir() {
			return w.watcher.Add(path)
		}
		return nil
	})
}
