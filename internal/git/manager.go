// Package git provides Git repository management for Inkwell
package git

import (
	"os"
	"path/filepath"
	"sync"

	"github.com/go-git/go-git/v5"
)

// Manager handles Git operations for Inkwell
type Manager struct {
	reposDir string // ~/.inkwell/repos/ for cloned repos
	mu       sync.RWMutex
	repo     *Repository // Current repository (if any)
}

// NewManager creates a new Git manager
func NewManager() (*Manager, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	reposDir := filepath.Join(homeDir, ".inkwell", "repos")
	if err := os.MkdirAll(reposDir, 0755); err != nil {
		return nil, err
	}

	return &Manager{
		reposDir: reposDir,
	}, nil
}

// ReposDir returns the directory where cloned repos are stored
func (m *Manager) ReposDir() string {
	return m.reposDir
}

// OpenRepository opens a git repository at the given path
// Returns nil if the path is not a git repository
func (m *Manager) OpenRepository(path string) (*Repository, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Try to open as a git repo
	gitRepo, err := git.PlainOpen(path)
	if err != nil {
		if err == git.ErrRepositoryNotExists {
			m.repo = nil
			return nil, nil // Not a git repo, not an error
		}
		return nil, err
	}

	repo := &Repository{
		path: path,
		repo: gitRepo,
	}

	m.repo = repo
	return repo, nil
}

// CurrentRepository returns the currently opened repository
func (m *Manager) CurrentRepository() *Repository {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.repo
}

// IsGitRepository checks if a path is a git repository
func IsGitRepository(path string) bool {
	_, err := git.PlainOpen(path)
	return err == nil
}

// FindGitRoot finds the root of a git repository containing the given path
// Returns empty string if not in a git repository
func FindGitRoot(path string) string {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return ""
	}

	// Walk up the directory tree looking for .git
	current := absPath
	for {
		gitDir := filepath.Join(current, ".git")
		if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached filesystem root
			return ""
		}
		current = parent
	}
}

// Init initializes a new git repository at the given path
func Init(path string) (*Repository, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	gitRepo, err := git.PlainInit(absPath, false)
	if err != nil {
		return nil, err
	}

	return &Repository{
		path: absPath,
		repo: gitRepo,
	}, nil
}
