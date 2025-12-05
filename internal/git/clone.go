package git

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
)

// CloneOptions holds options for cloning a repository
type CloneOptions struct {
	URL        string     `json:"url"`
	DestPath   string     `json:"destPath,omitempty"` // If empty, auto-generated in reposDir
	Branch     string     `json:"branch,omitempty"`   // If empty, uses default branch
	Depth      int        `json:"depth,omitempty"`    // 0 = full clone
	AuthConfig AuthConfig `json:"auth,omitempty"`
}

// CloneResult contains the result of a clone operation
type CloneResult struct {
	Path      string `json:"path"`
	RemoteURL string `json:"remoteUrl"`
	Branch    string `json:"branch"`
}

// progressWriter captures clone progress and sends to channel
type progressWriter struct {
	progressCh chan<- CloneProgress
	current    CloneProgress
}

func (pw *progressWriter) Write(p []byte) (n int, err error) {
	line := string(p)

	// Parse git progress output
	if strings.Contains(line, "Counting objects") {
		pw.current.Stage = "counting"
	} else if strings.Contains(line, "Compressing objects") {
		pw.current.Stage = "compressing"
	} else if strings.Contains(line, "Receiving objects") {
		pw.current.Stage = "receiving"
	} else if strings.Contains(line, "Resolving deltas") {
		pw.current.Stage = "resolving"
	}

	// Try to parse progress numbers (format: "Receiving objects: X% (Y/Z)")
	var percent, current, total int
	if n, _ := fmt.Sscanf(line, "%*s %*s %d%% (%d/%d)", &percent, &current, &total); n == 3 {
		pw.current.Current = current
		pw.current.Total = total
	}

	// Send progress update
	if pw.progressCh != nil {
		select {
		case pw.progressCh <- pw.current:
		default:
			// Don't block if channel is full
		}
	}

	return len(p), nil
}

// Clone clones a repository to the specified path
func (m *Manager) Clone(ctx context.Context, opts CloneOptions) (*CloneResult, error) {
	return m.CloneWithProgress(ctx, opts, nil)
}

// CloneWithProgress clones a repository with progress reporting
func (m *Manager) CloneWithProgress(ctx context.Context, opts CloneOptions, progressCh chan<- CloneProgress) (*CloneResult, error) {
	// Determine destination path
	destPath := opts.DestPath
	if destPath == "" {
		// Generate path from URL
		repoName := extractRepoName(opts.URL)
		if repoName == "" {
			repoName = "repo"
		}
		destPath = filepath.Join(m.reposDir, repoName)

		// Ensure unique path
		destPath = ensureUniquePath(destPath)
	}

	// Ensure parent directory exists
	parentDir := filepath.Dir(destPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create parent directory: %w", err)
	}

	// Get authentication
	auth, err := GetAuth(opts.AuthConfig)
	if err != nil {
		return nil, fmt.Errorf("authentication error: %w", err)
	}

	// Set up progress writer
	var progress *progressWriter
	if progressCh != nil {
		progress = &progressWriter{progressCh: progressCh}
	}

	// Configure clone options
	cloneOpts := &git.CloneOptions{
		URL:  opts.URL,
		Auth: auth,
	}

	if opts.Branch != "" {
		cloneOpts.ReferenceName = plumbing.NewBranchReferenceName(opts.Branch)
		cloneOpts.SingleBranch = true
	}

	if opts.Depth > 0 {
		cloneOpts.Depth = opts.Depth
	}

	if progress != nil {
		cloneOpts.Progress = progress
	}

	// Perform clone
	repo, err := git.PlainCloneContext(ctx, destPath, false, cloneOpts)
	if err != nil {
		// Clean up on failure
		os.RemoveAll(destPath)
		return nil, fmt.Errorf("clone failed: %w", err)
	}

	// Get current branch
	head, err := repo.Head()
	branchName := "main"
	if err == nil {
		branchName = head.Name().Short()
	}

	return &CloneResult{
		Path:      destPath,
		RemoteURL: opts.URL,
		Branch:    branchName,
	}, nil
}

// extractRepoName extracts the repository name from a URL
func extractRepoName(url string) string {
	// Handle SSH URLs: git@github.com:user/repo.git
	if strings.Contains(url, ":") && strings.Contains(url, "@") && !strings.HasPrefix(url, "ssh://") {
		parts := strings.Split(url, ":")
		if len(parts) == 2 {
			path := parts[1]
			// path is now "user/repo.git", extract repo name
			pathParts := strings.Split(path, "/")
			if len(pathParts) > 0 {
				return cleanRepoName(pathParts[len(pathParts)-1])
			}
		}
	}

	// Handle HTTPS URLs and ssh:// URLs: https://github.com/user/repo.git
	if strings.Contains(url, "/") {
		parts := strings.Split(url, "/")
		if len(parts) > 0 {
			return cleanRepoName(parts[len(parts)-1])
		}
	}

	return ""
}

// cleanRepoName removes .git suffix and cleans up the name
func cleanRepoName(name string) string {
	name = strings.TrimSuffix(name, ".git")
	name = strings.TrimSpace(name)
	return name
}

// ensureUniquePath returns a unique path by appending a number if needed
func ensureUniquePath(basePath string) string {
	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		return basePath
	}

	// Try adding numbers
	for i := 1; i < 1000; i++ {
		path := fmt.Sprintf("%s-%d", basePath, i)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			return path
		}
	}

	// Fallback (should never happen)
	return basePath
}

// ValidateCloneURL checks if a URL is a valid git repository URL
func ValidateCloneURL(url string) error {
	if url == "" {
		return fmt.Errorf("URL cannot be empty")
	}

	// Check for common patterns
	if strings.HasPrefix(url, "git@") ||
		strings.HasPrefix(url, "ssh://") ||
		strings.HasPrefix(url, "https://") ||
		strings.HasPrefix(url, "http://") ||
		strings.HasPrefix(url, "git://") {
		return nil
	}

	// Check if it looks like an SCP-style URL (git@host:path)
	if strings.Contains(url, "@") && strings.Contains(url, ":") {
		return nil
	}

	return fmt.Errorf("invalid git URL format: %s", url)
}

// GetReposDir returns the directory where cloned repos are stored
func (m *Manager) GetReposDir() string {
	return m.reposDir
}

// ListClonedRepos returns a list of repositories in the repos directory
func (m *Manager) ListClonedRepos() ([]CloneResult, error) {
	var repos []CloneResult

	entries, err := os.ReadDir(m.reposDir)
	if err != nil {
		if os.IsNotExist(err) {
			return repos, nil
		}
		return nil, fmt.Errorf("failed to read repos directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		repoPath := filepath.Join(m.reposDir, entry.Name())
		if !IsGitRepository(repoPath) {
			continue
		}

		// Open repository to get info
		repo, err := m.OpenRepository(repoPath)
		if err != nil {
			continue
		}

		repos = append(repos, CloneResult{
			Path:      repoPath,
			RemoteURL: repo.GetRemoteURL(),
			Branch:    repo.Branch(),
		})
	}

	return repos, nil
}
