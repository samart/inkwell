package git

import (
	"errors"
	"fmt"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport"
)

// PushResult contains the result of a push operation.
type PushResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// PullResult contains the result of a pull operation.
type PullResult struct {
	Success    bool   `json:"success"`
	Message    string `json:"message"`
	FastForward bool   `json:"fastForward"`
	NewCommits int    `json:"newCommits"`
}

// FetchResult contains the result of a fetch operation.
type FetchResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// Push pushes local commits to the remote.
func (r *Repository) Push(authConfig *AuthConfig) (*PushResult, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	// Get remote URL to determine auth type
	remote, err := r.repo.Remote("origin")
	if err != nil {
		return nil, fmt.Errorf("failed to get remote: %w", err)
	}

	urls := remote.Config().URLs
	if len(urls) == 0 {
		return nil, errors.New("no remote URL configured")
	}

	// Get auth
	var auth transport.AuthMethod
	if authConfig != nil {
		auth, err = GetAuth(*authConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth: %w", err)
		}
	} else {
		// Try default auth
		authType := DetectAuthType(urls[0])
		if authType == AuthTypeSSH {
			auth, err = GetAuth(AuthConfig{Type: AuthTypeSSH})
			if err != nil {
				// Continue without auth, might work for public repos
				auth = nil
			}
		}
	}

	// Push
	err = r.repo.Push(&git.PushOptions{
		RemoteName: "origin",
		Auth:       auth,
	})
	if err != nil {
		if errors.Is(err, git.NoErrAlreadyUpToDate) {
			return &PushResult{
				Success: true,
				Message: "Already up to date",
			}, nil
		}
		return nil, fmt.Errorf("failed to push: %w", err)
	}

	return &PushResult{
		Success: true,
		Message: "Push successful",
	}, nil
}

// Pull fetches and merges changes from the remote.
func (r *Repository) Pull(authConfig *AuthConfig) (*PullResult, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	wt, err := r.repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	// Get remote URL to determine auth type
	remote, err := r.repo.Remote("origin")
	if err != nil {
		return nil, fmt.Errorf("failed to get remote: %w", err)
	}

	urls := remote.Config().URLs
	if len(urls) == 0 {
		return nil, errors.New("no remote URL configured")
	}

	// Get auth
	var auth transport.AuthMethod
	if authConfig != nil {
		auth, err = GetAuth(*authConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth: %w", err)
		}
	} else {
		// Try default auth
		authType := DetectAuthType(urls[0])
		if authType == AuthTypeSSH {
			auth, err = GetAuth(AuthConfig{Type: AuthTypeSSH})
			if err != nil {
				// Continue without auth
				auth = nil
			}
		}
	}

	// Get current HEAD before pull
	headBefore, _ := r.repo.Head()

	// Pull
	err = wt.Pull(&git.PullOptions{
		RemoteName: "origin",
		Auth:       auth,
	})
	if err != nil {
		if errors.Is(err, git.NoErrAlreadyUpToDate) {
			return &PullResult{
				Success:    true,
				Message:    "Already up to date",
				FastForward: false,
				NewCommits: 0,
			}, nil
		}
		return nil, fmt.Errorf("failed to pull: %w", err)
	}

	// Count new commits
	headAfter, _ := r.repo.Head()
	newCommits := 0
	if headBefore != nil && headAfter != nil && headBefore.Hash() != headAfter.Hash() {
		// Count commits between before and after
		commitIter, err := r.repo.Log(&git.LogOptions{
			From: headAfter.Hash(),
		})
		if err == nil {
			for {
				c, err := commitIter.Next()
				if err != nil || c.Hash == headBefore.Hash() {
					break
				}
				newCommits++
			}
		}
	}

	return &PullResult{
		Success:     true,
		Message:     "Pull successful",
		FastForward: true, // go-git only supports fast-forward
		NewCommits:  newCommits,
	}, nil
}

// Fetch fetches changes from the remote without merging.
func (r *Repository) Fetch(authConfig *AuthConfig) (*FetchResult, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	// Get remote URL
	remote, err := r.repo.Remote("origin")
	if err != nil {
		return nil, fmt.Errorf("failed to get remote: %w", err)
	}

	urls := remote.Config().URLs
	if len(urls) == 0 {
		return nil, errors.New("no remote URL configured")
	}

	// Get auth
	var auth transport.AuthMethod
	if authConfig != nil {
		auth, err = GetAuth(*authConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth: %w", err)
		}
	} else {
		// Try default auth
		authType := DetectAuthType(urls[0])
		if authType == AuthTypeSSH {
			auth, err = GetAuth(AuthConfig{Type: AuthTypeSSH})
			if err != nil {
				auth = nil
			}
		}
	}

	// Fetch
	err = r.repo.Fetch(&git.FetchOptions{
		RemoteName: "origin",
		Auth:       auth,
		RefSpecs: []config.RefSpec{
			"+refs/heads/*:refs/remotes/origin/*",
		},
	})
	if err != nil {
		if errors.Is(err, git.NoErrAlreadyUpToDate) {
			return &FetchResult{
				Success: true,
				Message: "Already up to date",
			}, nil
		}
		return nil, fmt.Errorf("failed to fetch: %w", err)
	}

	return &FetchResult{
		Success: true,
		Message: "Fetch successful",
	}, nil
}

// SetUpstream sets the upstream tracking branch for the current branch.
func (r *Repository) SetUpstream(remoteName, remoteBranch string) error {
	if r.repo == nil {
		return errors.New("repository not initialized")
	}

	head, err := r.repo.Head()
	if err != nil {
		return fmt.Errorf("failed to get HEAD: %w", err)
	}

	if !head.Name().IsBranch() {
		return errors.New("not on a branch")
	}

	branchName := head.Name().Short()

	cfg, err := r.repo.Config()
	if err != nil {
		return fmt.Errorf("failed to get config: %w", err)
	}

	cfg.Branches[branchName] = &config.Branch{
		Name:   branchName,
		Remote: remoteName,
		Merge:  plumbing.NewBranchReferenceName(remoteBranch),
	}

	err = r.repo.SetConfig(cfg)
	if err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	return nil
}

// PushNewBranch pushes a new local branch to the remote and sets up tracking.
func (r *Repository) PushNewBranch(authConfig *AuthConfig) (*PushResult, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	// Get current branch
	head, err := r.repo.Head()
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD: %w", err)
	}

	if !head.Name().IsBranch() {
		return nil, errors.New("not on a branch")
	}

	branchName := head.Name().Short()

	// Get remote URL
	remote, err := r.repo.Remote("origin")
	if err != nil {
		return nil, fmt.Errorf("failed to get remote: %w", err)
	}

	urls := remote.Config().URLs
	if len(urls) == 0 {
		return nil, errors.New("no remote URL configured")
	}

	// Get auth
	var auth transport.AuthMethod
	if authConfig != nil {
		auth, err = GetAuth(*authConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth: %w", err)
		}
	} else {
		authType := DetectAuthType(urls[0])
		if authType == AuthTypeSSH {
			auth, err = GetAuth(AuthConfig{Type: AuthTypeSSH})
			if err != nil {
				auth = nil
			}
		}
	}

	// Push with refspec to create the remote branch
	refSpec := config.RefSpec(fmt.Sprintf("+refs/heads/%s:refs/heads/%s", branchName, branchName))
	err = r.repo.Push(&git.PushOptions{
		RemoteName: "origin",
		Auth:       auth,
		RefSpecs:   []config.RefSpec{refSpec},
	})
	if err != nil && !errors.Is(err, git.NoErrAlreadyUpToDate) {
		return nil, fmt.Errorf("failed to push: %w", err)
	}

	// Set up tracking
	err = r.SetUpstream("origin", branchName)
	if err != nil {
		// Non-fatal, push succeeded
		return &PushResult{
			Success: true,
			Message: "Push successful (tracking not set)",
		}, nil
	}

	return &PushResult{
		Success: true,
		Message: "Push successful",
	}, nil
}
