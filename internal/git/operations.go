package git

import (
	"fmt"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// Stage adds files to the staging area
func (r *Repository) Stage(paths []string) error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	for _, path := range paths {
		_, err := worktree.Add(path)
		if err != nil {
			return fmt.Errorf("failed to stage %s: %w", path, err)
		}
	}

	return nil
}

// StageAll stages all changes (git add -A)
func (r *Repository) StageAll() error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Add all changes
	err = worktree.AddWithOptions(&git.AddOptions{
		All: true,
	})
	if err != nil {
		return fmt.Errorf("failed to stage all: %w", err)
	}

	return nil
}

// Unstage removes files from the staging area (git reset HEAD <files>)
func (r *Repository) Unstage(paths []string) error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	head, err := r.repo.Head()
	if err != nil {
		// No commits yet - remove from index entirely
		for _, path := range paths {
			_, err := worktree.Remove(path)
			if err != nil {
				// Try to reset the file instead
				if resetErr := worktree.Reset(&git.ResetOptions{
					Mode: git.MixedReset,
				}); resetErr != nil {
					return fmt.Errorf("failed to unstage %s: %w", path, err)
				}
			}
		}
		return nil
	}

	// Get the commit to reset to
	commit, err := r.repo.CommitObject(head.Hash())
	if err != nil {
		return fmt.Errorf("failed to get HEAD commit: %w", err)
	}

	// Get the tree from the commit
	tree, err := commit.Tree()
	if err != nil {
		return fmt.Errorf("failed to get tree: %w", err)
	}

	// For each path, reset it to HEAD state
	for _, path := range paths {
		// Check if file exists in HEAD
		_, err := tree.File(path)
		if err != nil {
			// File doesn't exist in HEAD, so it's a new file - remove from index
			if _, rmErr := worktree.Remove(path); rmErr != nil {
				// Ignore remove errors for new files
			}
		} else {
			// File exists in HEAD - reset to HEAD version in index
			if err := worktree.Reset(&git.ResetOptions{
				Mode: git.MixedReset,
			}); err != nil {
				return fmt.Errorf("failed to unstage %s: %w", path, err)
			}
		}
	}

	return nil
}

// UnstageAll unstages all files (git reset HEAD)
func (r *Repository) UnstageAll() error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	err = worktree.Reset(&git.ResetOptions{
		Mode: git.MixedReset,
	})
	if err != nil {
		return fmt.Errorf("failed to unstage all: %w", err)
	}

	return nil
}

// CommitOptions holds options for creating a commit
type CommitOptions struct {
	Message    string   `json:"message"`
	AuthorName string   `json:"authorName,omitempty"`
	AuthorEmail string  `json:"authorEmail,omitempty"`
	Files      []string `json:"files,omitempty"` // If empty, commits all staged
}

// Commit creates a new commit with staged changes
func (r *Repository) Commit(opts CommitOptions) (*Commit, error) {
	if opts.Message == "" {
		return nil, fmt.Errorf("commit message cannot be empty")
	}

	worktree, err := r.repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	// If specific files are provided, stage them first
	if len(opts.Files) > 0 {
		for _, file := range opts.Files {
			if _, err := worktree.Add(file); err != nil {
				return nil, fmt.Errorf("failed to stage %s: %w", file, err)
			}
		}
	}

	// Check if there are staged changes
	status, err := worktree.Status()
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	hasStaged := false
	for _, s := range status {
		if s.Staging != git.Unmodified && s.Staging != git.Untracked {
			hasStaged = true
			break
		}
	}

	if !hasStaged {
		return nil, fmt.Errorf("nothing to commit, no staged changes")
	}

	// Set up author info
	authorName := opts.AuthorName
	authorEmail := opts.AuthorEmail

	if authorName == "" {
		authorName = "Inkwell User"
	}
	if authorEmail == "" {
		authorEmail = "user@inkwell.local"
	}

	// Create the commit
	hash, err := worktree.Commit(opts.Message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create commit: %w", err)
	}

	// Get the commit object
	commitObj, err := r.repo.CommitObject(hash)
	if err != nil {
		return nil, fmt.Errorf("failed to get commit: %w", err)
	}

	return &Commit{
		Hash:      hash.String(),
		ShortHash: hash.String()[:7],
		Message:   commitObj.Message,
		Author:    commitObj.Author.Name,
		Email:     commitObj.Author.Email,
		Date:      commitObj.Author.When,
	}, nil
}

// Discard discards changes to files (git checkout -- <files>)
func (r *Repository) Discard(paths []string) error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Get HEAD commit
	head, err := r.repo.Head()
	if err != nil {
		return fmt.Errorf("failed to get HEAD: %w", err)
	}

	commit, err := r.repo.CommitObject(head.Hash())
	if err != nil {
		return fmt.Errorf("failed to get HEAD commit: %w", err)
	}

	tree, err := commit.Tree()
	if err != nil {
		return fmt.Errorf("failed to get tree: %w", err)
	}

	// Get the filesystem
	fs := worktree.Filesystem

	for _, path := range paths {
		// Get the file from HEAD
		file, err := tree.File(path)
		if err != nil {
			// File doesn't exist in HEAD - it's a new untracked file
			// We can't discard it with this method, skip it
			continue
		}

		// Get the content
		content, err := file.Contents()
		if err != nil {
			return fmt.Errorf("failed to read %s from HEAD: %w", path, err)
		}

		// Write it back to the working directory
		f, err := fs.Create(path)
		if err != nil {
			return fmt.Errorf("failed to create %s: %w", path, err)
		}

		_, err = f.Write([]byte(content))
		f.Close()
		if err != nil {
			return fmt.Errorf("failed to write %s: %w", path, err)
		}
	}

	return nil
}

// DiscardAll discards all unstaged changes
func (r *Repository) DiscardAll() error {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	err = worktree.Checkout(&git.CheckoutOptions{
		Force: true,
	})
	if err != nil {
		return fmt.Errorf("failed to discard all: %w", err)
	}

	return nil
}

// GetStagedFiles returns a list of staged file paths
func (r *Repository) GetStagedFiles() ([]string, error) {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	status, err := worktree.Status()
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	var staged []string
	for path, s := range status {
		if s.Staging != git.Unmodified && s.Staging != git.Untracked {
			staged = append(staged, path)
		}
	}

	return staged, nil
}

// GetUnstagedFiles returns a list of unstaged file paths (modified but not staged)
func (r *Repository) GetUnstagedFiles() ([]string, error) {
	worktree, err := r.repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	status, err := worktree.Status()
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	var unstaged []string
	for path, s := range status {
		if s.Worktree != git.Unmodified {
			unstaged = append(unstaged, path)
		}
	}

	return unstaged, nil
}
