package server

import (
	"encoding/json"
	"net/http"

	"inkwell/internal/git"
)

// handleGitStatus returns the git status of the current repository
func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data: map[string]interface{}{
				"isRepo": false,
			},
		})
		return
	}

	repo := s.git.CurrentRepository()
	if repo == nil {
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data: map[string]interface{}{
				"isRepo": false,
			},
		})
		return
	}

	status, err := repo.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get git status: "+err.Error())
		return
	}

	// Add remote URL if available
	status.RemoteURL = repo.GetRemoteURL()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"isRepo": true,
			"status": status,
		},
	})
}

// handleGitInit initializes a new git repository in the current directory
func (s *Server) handleGitInit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, http.StatusInternalServerError, "Git manager not initialized")
		return
	}

	// Check if already a repo
	if repo := s.git.CurrentRepository(); repo != nil {
		writeError(w, http.StatusBadRequest, "Directory is already a git repository")
		return
	}

	// Initialize the repository
	rootDir := s.config.RootDir
	if err := initGitRepository(rootDir); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to initialize repository: "+err.Error())
		return
	}

	// Open the newly created repository
	repo, err := s.git.OpenRepository(rootDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to open new repository: "+err.Error())
		return
	}

	status, err := repo.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get status: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"isRepo": true,
			"status": status,
		},
	})
}

// initGitRepository initializes a new git repository at the given path
func initGitRepository(path string) error {
	_, err := git.Init(path)
	return err
}

// CloneRequest represents a request to clone a repository
type CloneRequest struct {
	URL        string `json:"url"`
	Branch     string `json:"branch,omitempty"`
	Depth      int    `json:"depth,omitempty"`
	SSHKeyPath string `json:"sshKeyPath,omitempty"`
	Username   string `json:"username,omitempty"`
	Password   string `json:"password,omitempty"`
}

// handleGitClone clones a remote repository
func (s *Server) handleGitClone(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, http.StatusInternalServerError, "Git manager not initialized")
		return
	}

	var req CloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// Validate URL
	if err := git.ValidateCloneURL(req.URL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Detect auth type and configure
	authType := git.DetectAuthType(req.URL)
	authConfig := git.AuthConfig{
		Type:       authType,
		SSHKeyPath: req.SSHKeyPath,
		Username:   req.Username,
		Password:   req.Password,
	}

	// Clone the repository
	result, err := s.git.Clone(r.Context(), git.CloneOptions{
		URL:        req.URL,
		Branch:     req.Branch,
		Depth:      req.Depth,
		AuthConfig: authConfig,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Clone failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    result,
	})
}

// handleGitListRepos lists all cloned repositories
func (s *Server) handleGitListRepos(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, http.StatusInternalServerError, "Git manager not initialized")
		return
	}

	repos, err := s.git.ListClonedRepos()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to list repositories: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    repos,
	})
}

// handleGitValidateURL validates a git repository URL
func (s *Server) handleGitValidateURL(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Query().Get("url")
	if url == "" {
		writeError(w, http.StatusBadRequest, "URL parameter required")
		return
	}

	err := git.ValidateCloneURL(url)
	authType := git.DetectAuthType(url)

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"valid":    err == nil,
			"error":    errorString(err),
			"authType": string(authType),
		},
	})
}

// errorString returns error message or empty string
func errorString(err error) string {
	if err != nil {
		return err.Error()
	}
	return ""
}

// StageRequest represents a request to stage files
type StageRequest struct {
	Files []string `json:"files"`
	All   bool     `json:"all,omitempty"`
}

// handleGitStage stages files for commit
func (s *Server) handleGitStage(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req StageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	var err error
	if req.All {
		err = repo.StageAll()
	} else if len(req.Files) > 0 {
		err = repo.Stage(req.Files)
	} else {
		writeError(w, http.StatusBadRequest, "No files specified")
		return
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to stage: "+err.Error())
		return
	}

	// Return updated status
	status, err := repo.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get status: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"status": status,
		},
	})
}

// UnstageRequest represents a request to unstage files
type UnstageRequest struct {
	Files []string `json:"files"`
	All   bool     `json:"all,omitempty"`
}

// handleGitUnstage unstages files
func (s *Server) handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req UnstageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	var err error
	if req.All {
		err = repo.UnstageAll()
	} else if len(req.Files) > 0 {
		err = repo.Unstage(req.Files)
	} else {
		writeError(w, http.StatusBadRequest, "No files specified")
		return
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unstage: "+err.Error())
		return
	}

	// Return updated status
	status, err := repo.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get status: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"status": status,
		},
	})
}

// CommitRequest represents a request to create a commit
type CommitRequest struct {
	Message     string   `json:"message"`
	Files       []string `json:"files,omitempty"`
	AuthorName  string   `json:"authorName,omitempty"`
	AuthorEmail string   `json:"authorEmail,omitempty"`
}

// handleGitCommit creates a new commit
func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req CommitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Message == "" {
		writeError(w, http.StatusBadRequest, "Commit message is required")
		return
	}

	commit, err := repo.Commit(git.CommitOptions{
		Message:     req.Message,
		Files:       req.Files,
		AuthorName:  req.AuthorName,
		AuthorEmail: req.AuthorEmail,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to commit: "+err.Error())
		return
	}

	// Return commit info and updated status
	status, _ := repo.Status()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"commit": commit,
			"status": status,
		},
	})
}

// DiscardRequest represents a request to discard changes
type DiscardRequest struct {
	Files []string `json:"files"`
	All   bool     `json:"all,omitempty"`
}

// handleGitDiscard discards changes to files
func (s *Server) handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req DiscardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	var err error
	if req.All {
		err = repo.DiscardAll()
	} else if len(req.Files) > 0 {
		err = repo.Discard(req.Files)
	} else {
		writeError(w, http.StatusBadRequest, "No files specified")
		return
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to discard: "+err.Error())
		return
	}

	// Return updated status
	status, err := repo.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get status: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"status": status,
		},
	})
}

// AuthRequest represents authentication info for remote operations
type AuthRequest struct {
	SSHKeyPath    string `json:"sshKeyPath,omitempty"`
	SSHPassphrase string `json:"sshPassphrase,omitempty"`
	Username      string `json:"username,omitempty"`
	Password      string `json:"password,omitempty"`
}

// handleGitPush pushes commits to the remote
func (s *Server) handleGitPush(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req AuthRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Build auth config if provided
	var authConfig *git.AuthConfig
	if req.SSHKeyPath != "" || req.Username != "" {
		remoteURL := repo.GetRemoteURL()
		authType := git.DetectAuthType(remoteURL)
		authConfig = &git.AuthConfig{
			Type:          authType,
			SSHKeyPath:    req.SSHKeyPath,
			SSHPassphrase: req.SSHPassphrase,
			Username:      req.Username,
			Password:      req.Password,
		}
	}

	result, err := repo.Push(authConfig)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Push failed: "+err.Error())
		return
	}

	// Return result and updated status
	status, _ := repo.Status()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"result": result,
			"status": status,
		},
	})
}

// handleGitPull pulls commits from the remote
func (s *Server) handleGitPull(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req AuthRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Build auth config if provided
	var authConfig *git.AuthConfig
	if req.SSHKeyPath != "" || req.Username != "" {
		remoteURL := repo.GetRemoteURL()
		authType := git.DetectAuthType(remoteURL)
		authConfig = &git.AuthConfig{
			Type:          authType,
			SSHKeyPath:    req.SSHKeyPath,
			SSHPassphrase: req.SSHPassphrase,
			Username:      req.Username,
			Password:      req.Password,
		}
	}

	result, err := repo.Pull(authConfig)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Pull failed: "+err.Error())
		return
	}

	// Return result and updated status
	status, _ := repo.Status()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"result": result,
			"status": status,
		},
	})
}

// handleGitFetch fetches updates from the remote without merging
func (s *Server) handleGitFetch(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req AuthRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Build auth config if provided
	var authConfig *git.AuthConfig
	if req.SSHKeyPath != "" || req.Username != "" {
		remoteURL := repo.GetRemoteURL()
		authType := git.DetectAuthType(remoteURL)
		authConfig = &git.AuthConfig{
			Type:          authType,
			SSHKeyPath:    req.SSHKeyPath,
			SSHPassphrase: req.SSHPassphrase,
			Username:      req.Username,
			Password:      req.Password,
		}
	}

	result, err := repo.Fetch(authConfig)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Fetch failed: "+err.Error())
		return
	}

	// Return result and updated status
	status, _ := repo.Status()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"result": result,
			"status": status,
		},
	})
}

// handleGitBranches lists all branches
func (s *Server) handleGitBranches(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	branches, err := repo.ListBranches()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to list branches: "+err.Error())
		return
	}

	currentBranch, _ := repo.CurrentBranch()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"branches": branches,
			"current":  currentBranch,
		},
	})
}

// BranchRequest represents a request for branch operations
type BranchRequest struct {
	Name    string `json:"name"`
	NewName string `json:"newName,omitempty"`
	Create  bool   `json:"create,omitempty"`
}

// handleGitCheckout switches to a branch
func (s *Server) handleGitCheckout(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req BranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Branch name is required")
		return
	}

	var err error
	if req.Create {
		err = repo.CheckoutCreate(req.Name)
	} else {
		err = repo.Checkout(req.Name)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Checkout failed: "+err.Error())
		return
	}

	// Return updated status
	status, _ := repo.Status()
	branches, _ := repo.ListBranches()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"status":   status,
			"branches": branches,
		},
	})
}

// handleGitCreateBranch creates a new branch
func (s *Server) handleGitCreateBranch(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req BranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Branch name is required")
		return
	}

	if err := repo.CreateBranch(req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create branch: "+err.Error())
		return
	}

	branches, _ := repo.ListBranches()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"branches": branches,
		},
	})
}

// handleGitDeleteBranch deletes a branch
func (s *Server) handleGitDeleteBranch(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req BranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Branch name is required")
		return
	}

	if err := repo.DeleteBranch(req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete branch: "+err.Error())
		return
	}

	branches, _ := repo.ListBranches()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"branches": branches,
		},
	})
}

// handleGitRenameBranch renames a branch
func (s *Server) handleGitRenameBranch(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req BranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Name == "" || req.NewName == "" {
		writeError(w, http.StatusBadRequest, "Both old and new branch names are required")
		return
	}

	if err := repo.RenameBranch(req.Name, req.NewName); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to rename branch: "+err.Error())
		return
	}

	branches, _ := repo.ListBranches()
	status, _ := repo.Status()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"branches": branches,
			"status":   status,
		},
	})
}

// handleGitHistory returns commit history
func (s *Server) handleGitHistory(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	// Parse query params
	query := r.URL.Query()
	limit := 50
	skip := 0
	filePath := query.Get("path")

	if l := query.Get("limit"); l != "" {
		if _, err := json.Number(l).Int64(); err == nil {
			n, _ := json.Number(l).Int64()
			limit = int(n)
		}
	}
	if s := query.Get("skip"); s != "" {
		if _, err := json.Number(s).Int64(); err == nil {
			n, _ := json.Number(s).Int64()
			skip = int(n)
		}
	}

	commits, err := repo.GetHistory(limit, skip, filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get history: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"commits": commits,
		},
	})
}

// handleGitCommitDetail returns details for a specific commit
func (s *Server) handleGitCommitDetail(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	hash := r.URL.Query().Get("hash")
	if hash == "" {
		writeError(w, http.StatusBadRequest, "Commit hash is required")
		return
	}

	detail, err := repo.GetCommit(hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get commit: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: detail,
	})
}

// DiffRequest represents a request to get a diff
type DiffRequest struct {
	FromHash string `json:"fromHash"`
	ToHash   string `json:"toHash"`
	FilePath string `json:"filePath,omitempty"`
}

// handleGitDiff returns the diff between two commits
func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	// Support both GET with query params and POST with body
	var fromHash, toHash, filePath string

	if r.Method == "GET" {
		query := r.URL.Query()
		fromHash = query.Get("from")
		toHash = query.Get("to")
		filePath = query.Get("path")
	} else {
		var req DiffRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
			return
		}
		fromHash = req.FromHash
		toHash = req.ToHash
		filePath = req.FilePath
	}

	if fromHash == "" || toHash == "" {
		writeError(w, http.StatusBadRequest, "Both from and to commit hashes are required")
		return
	}

	if filePath != "" {
		// Get diff for specific file
		fileDiff, err := repo.GetFileDiff(fromHash, toHash, filePath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to get file diff: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    fileDiff,
		})
		return
	}

	// Get full diff
	diff, err := repo.GetDiff(fromHash, toHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get diff: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    diff,
	})
}

// handleGitFileAtCommit returns file content at a specific commit
func (s *Server) handleGitFileAtCommit(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	hash := r.URL.Query().Get("hash")
	filePath := r.URL.Query().Get("path")

	if hash == "" || filePath == "" {
		writeError(w, http.StatusBadRequest, "Both hash and path are required")
		return
	}

	content, err := repo.GetFileAtCommit(hash, filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"content": content,
			"hash":    hash,
			"path":    filePath,
		},
	})
}

// QuickCommitRequest for staging and committing in one step
type QuickCommitRequest struct {
	Files   []string `json:"files"`
	Message string   `json:"message"`
	Push    bool     `json:"push,omitempty"`
}

// handleGitQuickCommit stages files, commits, and optionally pushes
func (s *Server) handleGitQuickCommit(w http.ResponseWriter, r *http.Request) {
	repo := s.git.CurrentRepository()
	if repo == nil {
		writeError(w, http.StatusBadRequest, "Not a git repository")
		return
	}

	var req QuickCommitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Message == "" {
		writeError(w, http.StatusBadRequest, "Commit message is required")
		return
	}

	// Stage files
	if len(req.Files) > 0 {
		if err := repo.Stage(req.Files); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to stage files: "+err.Error())
			return
		}
	} else {
		// Stage all modified files
		if err := repo.StageAll(); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to stage files: "+err.Error())
			return
		}
	}

	// Commit
	commit, err := repo.Commit(git.CommitOptions{
		Message: req.Message,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to commit: "+err.Error())
		return
	}

	response := map[string]interface{}{
		"commit": commit,
	}

	// Push if requested
	if req.Push {
		pushResult, err := repo.Push(nil)
		if err != nil {
			// Commit succeeded but push failed
			response["pushError"] = err.Error()
		} else {
			response["push"] = pushResult
		}
	}

	// Return updated status
	status, _ := repo.Status()
	response["status"] = status

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    response,
	})
}
