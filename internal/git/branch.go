package git

import (
	"errors"
	"fmt"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
)

// Branch represents a git branch.
type Branch struct {
	Name      string `json:"name"`
	IsRemote  bool   `json:"isRemote"`
	IsCurrent bool   `json:"isCurrent"`
	Upstream  string `json:"upstream,omitempty"`
}

// ListBranches returns all local and remote branches.
func (r *Repository) ListBranches() ([]Branch, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	var branches []Branch

	// Get current branch
	head, err := r.repo.Head()
	currentBranch := ""
	if err == nil && head.Name().IsBranch() {
		currentBranch = head.Name().Short()
	}

	// List local branches
	branchIter, err := r.repo.Branches()
	if err != nil {
		return nil, fmt.Errorf("failed to list branches: %w", err)
	}

	err = branchIter.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().Short()
		branch := Branch{
			Name:      name,
			IsRemote:  false,
			IsCurrent: name == currentBranch,
		}

		// Try to get upstream tracking branch
		cfg, err := r.repo.Config()
		if err == nil {
			if branchCfg, ok := cfg.Branches[name]; ok {
				branch.Upstream = branchCfg.Remote + "/" + branchCfg.Merge.Short()
			}
		}

		branches = append(branches, branch)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to iterate branches: %w", err)
	}

	// List remote branches
	remoteRefs, err := r.repo.References()
	if err != nil {
		return nil, fmt.Errorf("failed to list references: %w", err)
	}

	err = remoteRefs.ForEach(func(ref *plumbing.Reference) error {
		if ref.Name().IsRemote() {
			name := ref.Name().Short()
			// Skip HEAD references
			if strings.HasSuffix(name, "/HEAD") {
				return nil
			}
			branches = append(branches, Branch{
				Name:     name,
				IsRemote: true,
			})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to iterate remote refs: %w", err)
	}

	return branches, nil
}

// CurrentBranch returns the name of the current branch.
func (r *Repository) CurrentBranch() (string, error) {
	if r.repo == nil {
		return "", errors.New("repository not initialized")
	}

	head, err := r.repo.Head()
	if err != nil {
		return "", fmt.Errorf("failed to get HEAD: %w", err)
	}

	if !head.Name().IsBranch() {
		return "", errors.New("HEAD is not on a branch (detached HEAD state)")
	}

	return head.Name().Short(), nil
}

// CreateBranch creates a new branch at the current HEAD.
func (r *Repository) CreateBranch(name string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	head, err := r.repo.Head()
	if err != nil {
		return fmt.Errorf("failed to get HEAD: %w", err)
	}

	// Create branch reference
	refName := plumbing.NewBranchReferenceName(name)
	ref := plumbing.NewHashReference(refName, head.Hash())

	err = r.repo.Storer.SetReference(ref)
	if err != nil {
		return fmt.Errorf("failed to create branch: %w", err)
	}

	return nil
}

// DeleteBranch deletes a local branch.
func (r *Repository) DeleteBranch(name string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	// Check if branch exists
	refName := plumbing.NewBranchReferenceName(name)
	_, err := r.repo.Reference(refName, false)
	if err != nil {
		if errors.Is(err, plumbing.ErrReferenceNotFound) {
			return fmt.Errorf("branch '%s' not found", name)
		}
		return fmt.Errorf("failed to find branch: %w", err)
	}

	// Check if it's the current branch
	head, err := r.repo.Head()
	if err == nil && head.Name() == refName {
		return errors.New("cannot delete current branch")
	}

	// Delete the branch
	err = r.repo.Storer.RemoveReference(refName)
	if err != nil {
		return fmt.Errorf("failed to delete branch: %w", err)
	}

	// Also remove from config if present
	cfg, err := r.repo.Config()
	if err == nil {
		if _, ok := cfg.Branches[name]; ok {
			delete(cfg.Branches, name)
			_ = r.repo.SetConfig(cfg)
		}
	}

	return nil
}

// Checkout switches to the specified branch.
func (r *Repository) Checkout(name string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	wt, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Try local branch first
	refName := plumbing.NewBranchReferenceName(name)
	_, err = r.repo.Reference(refName, false)
	if err == nil {
		// Local branch exists, checkout
		err = wt.Checkout(&git.CheckoutOptions{
			Branch: refName,
		})
		if err != nil {
			return fmt.Errorf("failed to checkout: %w", err)
		}
		return nil
	}

	// Try remote tracking branch (origin/name)
	remoteRefName := plumbing.NewRemoteReferenceName("origin", name)
	remoteRef, err := r.repo.Reference(remoteRefName, true)
	if err != nil {
		return fmt.Errorf("branch '%s' not found", name)
	}

	// Create local branch from remote
	err = wt.Checkout(&git.CheckoutOptions{
		Branch: refName,
		Hash:   remoteRef.Hash(),
		Create: true,
	})
	if err != nil {
		return fmt.Errorf("failed to checkout: %w", err)
	}

	// Set up tracking
	cfg, err := r.repo.Config()
	if err == nil {
		cfg.Branches[name] = &config.Branch{
			Name:   name,
			Remote: "origin",
			Merge:  plumbing.NewBranchReferenceName(name),
		}
		_ = r.repo.SetConfig(cfg)
	}

	return nil
}

// CheckoutCreate creates a new branch and switches to it.
func (r *Repository) CheckoutCreate(name string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	wt, err := r.repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	refName := plumbing.NewBranchReferenceName(name)
	err = wt.Checkout(&git.CheckoutOptions{
		Branch: refName,
		Create: true,
	})
	if err != nil {
		return fmt.Errorf("failed to create and checkout branch: %w", err)
	}

	return nil
}

// RenameBranch renames a branch.
func (r *Repository) RenameBranch(oldName, newName string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	// Get the old branch ref
	oldRefName := plumbing.NewBranchReferenceName(oldName)
	oldRef, err := r.repo.Reference(oldRefName, true)
	if err != nil {
		if errors.Is(err, plumbing.ErrReferenceNotFound) {
			return fmt.Errorf("branch '%s' not found", oldName)
		}
		return fmt.Errorf("failed to find branch: %w", err)
	}

	// Check if new name already exists
	newRefName := plumbing.NewBranchReferenceName(newName)
	_, err = r.repo.Reference(newRefName, false)
	if err == nil {
		return fmt.Errorf("branch '%s' already exists", newName)
	}

	// Create new reference
	newRef := plumbing.NewHashReference(newRefName, oldRef.Hash())
	err = r.repo.Storer.SetReference(newRef)
	if err != nil {
		return fmt.Errorf("failed to create new branch: %w", err)
	}

	// If renaming current branch, update HEAD
	head, _ := r.repo.Head()
	if head != nil && head.Name() == oldRefName {
		headRef := plumbing.NewSymbolicReference(plumbing.HEAD, newRefName)
		err = r.repo.Storer.SetReference(headRef)
		if err != nil {
			return fmt.Errorf("failed to update HEAD: %w", err)
		}
	}

	// Update config
	cfg, err := r.repo.Config()
	if err == nil {
		if branchCfg, ok := cfg.Branches[oldName]; ok {
			branchCfg.Name = newName
			cfg.Branches[newName] = branchCfg
			delete(cfg.Branches, oldName)
			_ = r.repo.SetConfig(cfg)
		}
	}

	// Delete old reference
	err = r.repo.Storer.RemoveReference(oldRefName)
	if err != nil {
		return fmt.Errorf("failed to remove old branch: %w", err)
	}

	return nil
}
