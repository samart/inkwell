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
