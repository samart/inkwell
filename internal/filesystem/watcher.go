package filesystem

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	rootDir      string
	watcher      *fsnotify.Watcher
	listeners    []chan FileEvent
	mu           sync.RWMutex
	done         chan struct{}
	closed       bool
	watchedPaths map[string]bool  // Track watched directories
	pathsMu      sync.RWMutex     // Separate mutex for paths map
	debouncer    *eventDebouncer  // Debounce rapid events
}

// eventDebouncer coalesces rapid file events
type eventDebouncer struct {
	events map[string]*pendingEvent
	mu     sync.Mutex
	delay  time.Duration
}

type pendingEvent struct {
	event  FileEvent
	timer  *time.Timer
	notify func(FileEvent)
}

func newEventDebouncer(delay time.Duration) *eventDebouncer {
	return &eventDebouncer{
		events: make(map[string]*pendingEvent),
		delay:  delay,
	}
}

func (d *eventDebouncer) add(event FileEvent, notify func(FileEvent)) {
	d.mu.Lock()
	defer d.mu.Unlock()

	key := event.Path + ":" + string(event.Type)

	if pending, exists := d.events[key]; exists {
		// Reset the timer
		pending.timer.Stop()
		pending.event = event
		pending.timer = time.AfterFunc(d.delay, func() {
			d.fire(key)
		})
	} else {
		d.events[key] = &pendingEvent{
			event:  event,
			notify: notify,
			timer: time.AfterFunc(d.delay, func() {
				d.fire(key)
			}),
		}
	}
}

func (d *eventDebouncer) fire(key string) {
	d.mu.Lock()
	pending, exists := d.events[key]
	if exists {
		delete(d.events, key)
	}
	d.mu.Unlock()

	if exists && pending.notify != nil {
		pending.notify(pending.event)
	}
}

func (d *eventDebouncer) stop() {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, pending := range d.events {
		pending.timer.Stop()
	}
	d.events = make(map[string]*pendingEvent)
}

// NewWatcher creates a new file system watcher
func NewWatcher(rootDir string) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		rootDir:      rootDir,
		watcher:      fsWatcher,
		done:         make(chan struct{}),
		watchedPaths: make(map[string]bool),
		debouncer:    newEventDebouncer(50 * time.Millisecond),
	}

	// Add root directory and subdirectories
	if err := w.addDirRecursive(rootDir); err != nil {
		fsWatcher.Close()
		return nil, err
	}

	log.Printf("Watcher initialized with %d directories", len(w.watchedPaths))

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

// Close stops the watcher and cleans up all resources
func (w *Watcher) Close() error {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return nil
	}
	w.closed = true
	w.mu.Unlock()

	// Stop debouncer first
	if w.debouncer != nil {
		w.debouncer.stop()
	}

	// Signal done to stop the watch goroutine
	close(w.done)

	// Close all listener channels
	w.mu.Lock()
	for _, ch := range w.listeners {
		close(ch)
	}
	w.listeners = nil
	w.mu.Unlock()

	// Clear watched paths
	w.pathsMu.Lock()
	w.watchedPaths = nil
	w.pathsMu.Unlock()

	log.Printf("Watcher closed")
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

	// Check if this is a directory by looking at our tracked paths or checking filesystem
	w.pathsMu.RLock()
	isTrackedDir := w.watchedPaths[event.Name]
	w.pathsMu.RUnlock()

	var fileEvent FileEvent
	fileEvent.Path = relPath

	switch {
	case event.Op&fsnotify.Create != 0:
		fileEvent.Type = EventCreated
		// Check if newly created item is a directory
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			w.addDirRecursive(event.Name)
		}
	case event.Op&fsnotify.Write != 0:
		// Only care about markdown files for content changes
		if !isMarkdownFile(event.Name) {
			return
		}
		fileEvent.Type = EventModified
	case event.Op&fsnotify.Remove != 0:
		fileEvent.Type = EventDeleted
		// Remove watch for deleted directories
		if isTrackedDir {
			w.removeDir(event.Name)
		}
	case event.Op&fsnotify.Rename != 0:
		fileEvent.Type = EventRenamed
		// Remove watch for renamed directories (they'll be re-added if still accessible)
		if isTrackedDir {
			w.removeDir(event.Name)
		}
	default:
		return
	}

	// Use debouncer for all events to coalesce rapid changes
	w.debouncer.add(fileEvent, w.notifyListeners)
}

// notifyListeners sends an event to all registered listeners
func (w *Watcher) notifyListeners(event FileEvent) {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if w.closed {
		return
	}

	for _, ch := range w.listeners {
		select {
		case ch <- event:
		default:
			// Drop event if channel is full
		}
	}
}

// removeDir removes a directory and its subdirectories from the watcher
func (w *Watcher) removeDir(dir string) {
	w.pathsMu.Lock()
	defer w.pathsMu.Unlock()

	// Remove the directory itself
	if w.watchedPaths[dir] {
		if err := w.watcher.Remove(dir); err != nil {
			// Log but continue - the path may already be gone
			log.Printf("Warning: could not remove watch for %s: %v", dir, err)
		}
		delete(w.watchedPaths, dir)
	}

	// Remove any subdirectories that start with this path
	prefix := dir + string(filepath.Separator)
	for path := range w.watchedPaths {
		if strings.HasPrefix(path, prefix) {
			if err := w.watcher.Remove(path); err != nil {
				// Log but continue
				log.Printf("Warning: could not remove watch for %s: %v", path, err)
			}
			delete(w.watchedPaths, path)
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
			// Check if already watching this path
			w.pathsMu.RLock()
			alreadyWatching := w.watchedPaths[path]
			w.pathsMu.RUnlock()

			if alreadyWatching {
				return nil
			}

			if err := w.watcher.Add(path); err != nil {
				log.Printf("Warning: could not watch directory %s: %v", path, err)
				return nil // Continue with other directories
			}

			w.pathsMu.Lock()
			w.watchedPaths[path] = true
			w.pathsMu.Unlock()
		}
		return nil
	})
}

// WatchCount returns the number of directories being watched (for debugging)
func (w *Watcher) WatchCount() int {
	w.pathsMu.RLock()
	defer w.pathsMu.RUnlock()
	return len(w.watchedPaths)
}
