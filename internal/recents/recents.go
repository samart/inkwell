// Package recents manages recent locations for the Inkwell editor
package recents

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	maxRecents   = 5
	inkwellDir   = ".inkwell"
	recentsFile  = "recents.json"
)

// Location represents a recently opened directory
type Location struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	LastOpened time.Time `json:"lastOpened"`
}

// Manager handles recent locations storage and retrieval
type Manager struct {
	mu        sync.RWMutex
	locations []Location
	filePath  string
}

// New creates a new recents manager
func New() (*Manager, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	inkwellPath := filepath.Join(home, inkwellDir)
	if err := os.MkdirAll(inkwellPath, 0755); err != nil {
		return nil, err
	}

	m := &Manager{
		filePath:  filepath.Join(inkwellPath, recentsFile),
		locations: make([]Location, 0),
	}

	// Load existing recents
	if err := m.load(); err != nil && !os.IsNotExist(err) {
		// Log but don't fail - we can start fresh
		return m, nil
	}

	return m, nil
}

// load reads recents from disk
func (m *Manager) load() error {
	data, err := os.ReadFile(m.filePath)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	return json.Unmarshal(data, &m.locations)
}

// save writes recents to disk
func (m *Manager) save() error {
	m.mu.RLock()
	data, err := json.MarshalIndent(m.locations, "", "  ")
	m.mu.RUnlock()

	if err != nil {
		return err
	}

	return os.WriteFile(m.filePath, data, 0644)
}

// Add adds or updates a location in the recents list
func (m *Manager) Add(path string) error {
	// Get absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	// Check if directory exists
	info, err := os.Stat(absPath)
	if err != nil || !info.IsDir() {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove if already exists
	newLocations := make([]Location, 0, maxRecents)
	for _, loc := range m.locations {
		if loc.Path != absPath {
			newLocations = append(newLocations, loc)
		}
	}

	// Add to front
	loc := Location{
		Path:       absPath,
		Name:       filepath.Base(absPath),
		LastOpened: time.Now(),
	}
	newLocations = append([]Location{loc}, newLocations...)

	// Trim to max size
	if len(newLocations) > maxRecents {
		newLocations = newLocations[:maxRecents]
	}

	m.locations = newLocations

	// Save asynchronously
	go m.save()

	return nil
}

// GetAll returns all recent locations
func (m *Manager) GetAll() []Location {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Return a copy
	result := make([]Location, len(m.locations))
	copy(result, m.locations)
	return result
}

// Clear removes all recent locations
func (m *Manager) Clear() error {
	m.mu.Lock()
	m.locations = make([]Location, 0)
	m.mu.Unlock()

	return m.save()
}