package git

import "time"

// GitStatus represents the current state of a git repository
type GitStatus struct {
	Branch       string       `json:"branch"`
	Ahead        int          `json:"ahead"`
	Behind       int          `json:"behind"`
	Files        []FileStatus `json:"files"`
	HasConflicts bool         `json:"hasConflicts"`
	IsClean      bool         `json:"isClean"`
	RemoteURL    string       `json:"remoteUrl,omitempty"`
}

// FileStatus represents a file's git status
type FileStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "modified", "added", "deleted", "untracked", "conflicted"
	Staged bool   `json:"staged"`
}

// Commit represents a git commit
type Commit struct {
	Hash      string    `json:"hash"`
	ShortHash string    `json:"shortHash"`
	Message   string    `json:"message"`
	Author    string    `json:"author"`
	Email     string    `json:"email"`
	Date      time.Time `json:"date"`
}

// BranchInfo represents branch information
type BranchInfo struct {
	Name       string `json:"name"`
	IsCurrent  bool   `json:"isCurrent"`
	IsRemote   bool   `json:"isRemote"`
	LastCommit string `json:"lastCommit"`
}

// DiffResult represents a file diff
type DiffResult struct {
	Path     string     `json:"path"`
	Hunks    []DiffHunk `json:"hunks"`
	IsBinary bool       `json:"isBinary"`
}

// DiffHunk represents a diff hunk
type DiffHunk struct {
	OldStart int      `json:"oldStart"`
	OldLines int      `json:"oldLines"`
	NewStart int      `json:"newStart"`
	NewLines int      `json:"newLines"`
	Lines    []string `json:"lines"`
}

// MergeConflict represents a merge conflict
type MergeConflict struct {
	Path         string `json:"path"`
	OurChanges   string `json:"ourChanges"`
	TheirChanges string `json:"theirChanges"`
	BaseContent  string `json:"baseContent"`
}

// CloneRequest represents a request to clone a repository
type CloneRequest struct {
	URL        string `json:"url"`
	SSHKeyPath string `json:"sshKeyPath,omitempty"`
	Username   string `json:"username,omitempty"`
	Password   string `json:"password,omitempty"`
}

// CloneProgress tracks clone operation progress
type CloneProgress struct {
	Stage           string `json:"stage"`           // "counting", "compressing", "receiving", "resolving"
	Current         int    `json:"current"`         // Current object count
	Total           int    `json:"total"`           // Total objects
	ReceivedBytes   int64  `json:"receivedBytes"`   // Bytes received
	ReceivedObjects int    `json:"receivedObjects"` // Objects received
}

// CommitRequest represents a request to create a commit
type CommitRequest struct {
	Message string   `json:"message"`
	Files   []string `json:"files,omitempty"` // Empty = commit all staged
}

// StageRequest represents a request to stage files
type StageRequest struct {
	Files []string `json:"files"`
}

// CheckoutRequest represents a request to checkout a branch
type CheckoutRequest struct {
	Branch string `json:"branch"`
	Create bool   `json:"create,omitempty"`
}

// PushRequest represents a request to push
type PushRequest struct {
	Remote string `json:"remote,omitempty"` // Default: "origin"
	Branch string `json:"branch,omitempty"` // Default: current branch
	Force  bool   `json:"force,omitempty"`
}

// PullRequest represents a request to pull
type PullRequest struct {
	Remote string `json:"remote,omitempty"` // Default: "origin"
	Branch string `json:"branch,omitempty"` // Default: current branch
	Rebase bool   `json:"rebase,omitempty"`
}

// ResolveConflictRequest represents a request to resolve a conflict
type ResolveConflictRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`            // Resolved content
	Strategy string `json:"strategy,omitempty"` // "ours", "theirs", or "custom"
}
