package git

import (
	"errors"
	"fmt"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// FileChange represents a change to a file in a commit.
type FileChange struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"` // For renames
	Action    string `json:"action"`            // added, modified, deleted, renamed
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// CommitDetail contains full commit information including changes.
type CommitDetail struct {
	Commit  Commit       `json:"commit"`
	Changes []FileChange `json:"changes"`
}

// DiffLine represents a single line in a diff.
type DiffLine struct {
	Type    string `json:"type"` // context, add, delete, header
	Content string `json:"content"`
	OldLine int    `json:"oldLine,omitempty"`
	NewLine int    `json:"newLine,omitempty"`
}

// FileDiff represents the diff of a single file.
type FileDiff struct {
	Path      string     `json:"path"`
	OldPath   string     `json:"oldPath,omitempty"`
	Action    string     `json:"action"`
	Binary    bool       `json:"binary"`
	Lines     []DiffLine `json:"lines"`
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
}

// CommitDiffResult contains the diff between two commits.
type CommitDiffResult struct {
	FromCommit string     `json:"fromCommit"`
	ToCommit   string     `json:"toCommit"`
	Files      []FileDiff `json:"files"`
}

// GetHistory returns the commit history.
func (r *Repository) GetHistory(limit int, skip int, filePath string) ([]Commit, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	logOptions := &git.LogOptions{
		Order: git.LogOrderCommitterTime,
	}

	// Filter by file path if specified
	if filePath != "" {
		logOptions.PathFilter = func(path string) bool {
			return path == filePath || strings.HasPrefix(path, filePath+"/")
		}
	}

	iter, err := r.repo.Log(logOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to get log: %w", err)
	}
	defer iter.Close()

	var commits []Commit
	count := 0
	skipped := 0

	err = iter.ForEach(func(c *object.Commit) error {
		// Skip commits for pagination
		if skipped < skip {
			skipped++
			return nil
		}

		// Limit number of commits
		if limit > 0 && count >= limit {
			return fmt.Errorf("limit reached")
		}

		commits = append(commits, Commit{
			Hash:      c.Hash.String(),
			ShortHash: c.Hash.String()[:7],
			Message:   strings.TrimSpace(c.Message),
			Author:    c.Author.Name,
			Email:     c.Author.Email,
			Date:      c.Author.When,
		})
		count++
		return nil
	})

	// Ignore "limit reached" error
	if err != nil && err.Error() != "limit reached" {
		return nil, err
	}

	return commits, nil
}

// GetCommit returns details for a specific commit.
func (r *Repository) GetCommit(hash string) (*CommitDetail, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	commitHash := plumbing.NewHash(hash)
	commit, err := r.repo.CommitObject(commitHash)
	if err != nil {
		return nil, fmt.Errorf("commit not found: %w", err)
	}

	detail := &CommitDetail{
		Commit: Commit{
			Hash:      commit.Hash.String(),
			ShortHash: commit.Hash.String()[:7],
			Message:   strings.TrimSpace(commit.Message),
			Author:    commit.Author.Name,
			Email:     commit.Author.Email,
			Date:      commit.Author.When,
		},
	}

	// Get parent to calculate diff
	if commit.NumParents() > 0 {
		parent, err := commit.Parent(0)
		if err == nil {
			changes, err := r.getCommitChanges(parent, commit)
			if err == nil {
				detail.Changes = changes
			}
		}
	} else {
		// Initial commit - all files are added
		tree, err := commit.Tree()
		if err == nil {
			tree.Files().ForEach(func(f *object.File) error {
				detail.Changes = append(detail.Changes, FileChange{
					Path:   f.Name,
					Action: "added",
				})
				return nil
			})
		}
	}

	return detail, nil
}

// getCommitChanges calculates file changes between two commits.
func (r *Repository) getCommitChanges(from, to *object.Commit) ([]FileChange, error) {
	fromTree, err := from.Tree()
	if err != nil {
		return nil, err
	}

	toTree, err := to.Tree()
	if err != nil {
		return nil, err
	}

	changes, err := fromTree.Diff(toTree)
	if err != nil {
		return nil, err
	}

	var fileChanges []FileChange
	for _, change := range changes {
		fc := FileChange{}

		action, err := change.Action()
		if err != nil {
			continue
		}

		switch action.String() {
		case "Insert":
			fc.Action = "added"
			fc.Path = change.To.Name
		case "Delete":
			fc.Action = "deleted"
			fc.Path = change.From.Name
		case "Modify":
			fc.Action = "modified"
			fc.Path = change.To.Name
		default:
			fc.Action = "modified"
			if change.To.Name != "" {
				fc.Path = change.To.Name
			} else {
				fc.Path = change.From.Name
			}
		}

		// Get stats if possible
		patch, err := change.Patch()
		if err == nil {
			for _, stat := range patch.Stats() {
				if stat.Name == fc.Path {
					fc.Additions = stat.Addition
					fc.Deletions = stat.Deletion
					break
				}
			}
		}

		fileChanges = append(fileChanges, fc)
	}

	return fileChanges, nil
}

// GetDiff returns the diff between two commits.
func (r *Repository) GetDiff(fromHash, toHash string) (*CommitDiffResult, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	fromCommit, err := r.repo.CommitObject(plumbing.NewHash(fromHash))
	if err != nil {
		return nil, fmt.Errorf("from commit not found: %w", err)
	}

	toCommit, err := r.repo.CommitObject(plumbing.NewHash(toHash))
	if err != nil {
		return nil, fmt.Errorf("to commit not found: %w", err)
	}

	fromTree, err := fromCommit.Tree()
	if err != nil {
		return nil, err
	}

	toTree, err := toCommit.Tree()
	if err != nil {
		return nil, err
	}

	changes, err := fromTree.Diff(toTree)
	if err != nil {
		return nil, err
	}

	result := &CommitDiffResult{
		FromCommit: fromHash[:7],
		ToCommit:   toHash[:7],
	}

	for _, change := range changes {
		fileDiff, err := r.changeToFileDiff(change)
		if err != nil {
			continue
		}
		result.Files = append(result.Files, *fileDiff)
	}

	return result, nil
}

// GetFileDiff returns the diff for a specific file between two commits.
func (r *Repository) GetFileDiff(fromHash, toHash, filePath string) (*FileDiff, error) {
	if r.repo == nil {
		return nil, errors.New("repository not initialized")
	}

	fromCommit, err := r.repo.CommitObject(plumbing.NewHash(fromHash))
	if err != nil {
		return nil, fmt.Errorf("from commit not found: %w", err)
	}

	toCommit, err := r.repo.CommitObject(plumbing.NewHash(toHash))
	if err != nil {
		return nil, fmt.Errorf("to commit not found: %w", err)
	}

	fromTree, err := fromCommit.Tree()
	if err != nil {
		return nil, err
	}

	toTree, err := toCommit.Tree()
	if err != nil {
		return nil, err
	}

	changes, err := fromTree.Diff(toTree)
	if err != nil {
		return nil, err
	}

	for _, change := range changes {
		// Check if this change matches the file path
		if change.From.Name == filePath || change.To.Name == filePath {
			return r.changeToFileDiff(change)
		}
	}

	return nil, fmt.Errorf("file not found in diff: %s", filePath)
}

// changeToFileDiff converts a go-git Change to our FileDiff format.
func (r *Repository) changeToFileDiff(change *object.Change) (*FileDiff, error) {
	fileDiff := &FileDiff{}

	action, err := change.Action()
	if err != nil {
		return nil, err
	}

	switch action.String() {
	case "Insert":
		fileDiff.Action = "added"
		fileDiff.Path = change.To.Name
	case "Delete":
		fileDiff.Action = "deleted"
		fileDiff.Path = change.From.Name
	case "Modify":
		fileDiff.Action = "modified"
		fileDiff.Path = change.To.Name
	default:
		fileDiff.Action = "modified"
		if change.To.Name != "" {
			fileDiff.Path = change.To.Name
		} else {
			fileDiff.Path = change.From.Name
		}
	}

	patch, err := change.Patch()
	if err != nil {
		return fileDiff, nil // Return without diff lines
	}

	// Parse patch to get diff lines
	for _, filePatch := range patch.FilePatches() {
		from, to := filePatch.Files()

		// Check if binary
		if filePatch.IsBinary() {
			fileDiff.Binary = true
			continue
		}

		// Match file path
		var matchPath string
		if to != nil {
			matchPath = to.Path()
		} else if from != nil {
			matchPath = from.Path()
		}

		if matchPath != fileDiff.Path && matchPath != change.From.Name {
			continue
		}

		for _, chunk := range filePatch.Chunks() {
			content := chunk.Content()
			lines := strings.Split(content, "\n")

			for _, line := range lines {
				if line == "" {
					continue
				}

				diffLine := DiffLine{Content: line}

				switch chunk.Type() {
				case 0: // Equal
					diffLine.Type = "context"
				case 1: // Add
					diffLine.Type = "add"
					fileDiff.Additions++
				case 2: // Delete
					diffLine.Type = "delete"
					fileDiff.Deletions++
				}

				fileDiff.Lines = append(fileDiff.Lines, diffLine)
			}
		}
	}

	return fileDiff, nil
}

// GetFileAtCommit returns the content of a file at a specific commit.
func (r *Repository) GetFileAtCommit(hash, filePath string) (string, error) {
	if r.repo == nil {
		return "", errors.New("repository not initialized")
	}

	commit, err := r.repo.CommitObject(plumbing.NewHash(hash))
	if err != nil {
		return "", fmt.Errorf("commit not found: %w", err)
	}

	tree, err := commit.Tree()
	if err != nil {
		return "", err
	}

	file, err := tree.File(filePath)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}

	content, err := file.Contents()
	if err != nil {
		return "", err
	}

	return content, nil
}
