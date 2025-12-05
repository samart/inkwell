package git

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// Repository represents a git repository
type Repository struct {
	path      string
	remoteURL string
	repo      *git.Repository
}

// Path returns the repository path
func (r *Repository) Path() string {
	return r.path
}

// RemoteURL returns the remote URL if this is a cloned repo
func (r *Repository) RemoteURL() string {
	return r.remoteURL
}

// Status returns the current git status
func (r *Repository) Status() (*GitStatus, error) {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	status, err := worktree.Status()
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	// Get current branch
	head, err := r.repo.Head()
	branch := "HEAD"
	if err == nil {
		branch = head.Name().Short()
	}

	// Build file status list
	var files []FileStatus
	hasConflicts := false

	for path, fileStatus := range status {
		fs := FileStatus{
			Path: path,
		}

		// Determine status
		switch {
		case fileStatus.Worktree == git.Untracked:
			fs.Status = "untracked"
		case fileStatus.Worktree == git.Modified || fileStatus.Staging == git.Modified:
			fs.Status = "modified"
		case fileStatus.Worktree == git.Deleted || fileStatus.Staging == git.Deleted:
			fs.Status = "deleted"
		case fileStatus.Staging == git.Added:
			fs.Status = "added"
		case fileStatus.Worktree == git.UpdatedButUnmerged:
			fs.Status = "conflicted"
			hasConflicts = true
		default:
			// Check if staged
			if fileStatus.Staging != git.Unmodified {
				fs.Status = "modified"
			} else {
				continue // Skip unmodified files
			}
		}

		// Check if staged
		fs.Staged = fileStatus.Staging != git.Unmodified && fileStatus.Staging != git.Untracked

		files = append(files, fs)
	}

	// Calculate ahead/behind (simplified - just check if we have tracking)
	ahead, behind := r.calculateAheadBehind()

	return &GitStatus{
		Branch:       branch,
		Ahead:        ahead,
		Behind:       behind,
		Files:        files,
		HasConflicts: hasConflicts,
		IsClean:      len(files) == 0,
	}, nil
}

// calculateAheadBehind calculates commits ahead/behind remote
func (r *Repository) calculateAheadBehind() (ahead, behind int) {
	head, err := r.repo.Head()
	if err != nil {
		return 0, 0
	}

	// Get the upstream reference
	branchName := head.Name().Short()
	remoteBranch := plumbing.NewRemoteReferenceName("origin", branchName)

	remoteRef, err := r.repo.Reference(remoteBranch, true)
	if err != nil {
		// No tracking branch
		return 0, 0
	}

	// Count commits ahead (local commits not in remote)
	localCommit, err := r.repo.CommitObject(head.Hash())
	if err != nil {
		return 0, 0
	}

	remoteCommit, err := r.repo.CommitObject(remoteRef.Hash())
	if err != nil {
		return 0, 0
	}

	// Simple comparison - count commits reachable from local but not remote
	localIter, err := r.repo.Log(&git.LogOptions{From: localCommit.Hash})
	if err != nil {
		return 0, 0
	}

	localHashes := make(map[string]bool)
	localIter.ForEach(func(c *object.Commit) error {
		localHashes[c.Hash.String()] = true
		return nil
	})

	remoteIter, err := r.repo.Log(&git.LogOptions{From: remoteCommit.Hash})
	if err != nil {
		return 0, 0
	}

	remoteHashes := make(map[string]bool)
	remoteIter.ForEach(func(c *object.Commit) error {
		remoteHashes[c.Hash.String()] = true
		return nil
	})

	// Count ahead (in local but not remote)
	for hash := range localHashes {
		if !remoteHashes[hash] {
			ahead++
		}
	}

	// Count behind (in remote but not local)
	for hash := range remoteHashes {
		if !localHashes[hash] {
			behind++
		}
	}

	return ahead, behind
}

// Branch returns the current branch name
func (r *Repository) Branch() string {
	head, err := r.repo.Head()
	if err != nil {
		return "HEAD"
	}
	return head.Name().Short()
}

// IsClean returns true if there are no uncommitted changes
func (r *Repository) IsClean() (bool, error) {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return false, err
	}

	status, err := worktree.Status()
	if err != nil {
		return false, err
	}

	return status.IsClean(), nil
}

// GetRemoteURL returns the URL of the 'origin' remote
func (r *Repository) GetRemoteURL() string {
	remote, err := r.repo.Remote("origin")
	if err != nil {
		return ""
	}

	config := remote.Config()
	if len(config.URLs) > 0 {
		return config.URLs[0]
	}
	return ""
}

// FilterMarkdownFiles filters a list of file statuses to only include markdown files
func FilterMarkdownFiles(files []FileStatus) []FileStatus {
	var result []FileStatus
	for _, f := range files {
		ext := strings.ToLower(filepath.Ext(f.Path))
		if ext == ".md" || ext == ".markdown" {
			result = append(result, f)
		}
	}
	return result
}
