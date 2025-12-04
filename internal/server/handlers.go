package server

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"inkwell/internal/filesystem"

	"github.com/gorilla/mux"
)

// APIResponse is a generic API response
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// FileRequest represents a file creation/update request
type FileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// handleGetTree returns the file tree
func (s *Server) handleGetTree(w http.ResponseWriter, r *http.Request) {
	tree, err := s.fs.GetTree()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get file tree: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    tree,
	})
}

// handleGetFile returns the content of a file
func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "Path parameter is required")
		return
	}

	content, err := s.fs.ReadFile(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "Failed to read file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]string{
			"path":    path,
			"content": content,
		},
	})
}

// handleCreateFile creates a new file
func (s *Server) handleCreateFile(w http.ResponseWriter, r *http.Request) {
	var req FileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "Path is required")
		return
	}

	// Ensure it's a markdown file
	if !strings.HasSuffix(strings.ToLower(req.Path), ".md") {
		req.Path += ".md"
	}

	if err := s.fs.CreateFile(req.Path, req.Content); err != nil {
		writeError(w, http.StatusConflict, "Failed to create file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, APIResponse{
		Success: true,
		Data: map[string]string{
			"path": req.Path,
		},
	})
}

// handleUpdateFile updates an existing file
func (s *Server) handleUpdateFile(w http.ResponseWriter, r *http.Request) {
	var req FileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = req.Path
	}

	if path == "" {
		writeError(w, http.StatusBadRequest, "Path is required")
		return
	}

	if err := s.fs.WriteFile(path, req.Content); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]string{
			"path": path,
		},
	})
}

// handleDeleteFile deletes a file
func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "Path parameter is required")
		return
	}

	if err := s.fs.DeleteFile(path); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete file: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
	})
}


// FileMetadata contains file information for tooltips
type FileMetadata struct {
	Path         string `json:"path"`
	Size         int64  `json:"size"`
	ModifiedTime string `json:"modifiedTime"`
	IsDir        bool   `json:"isDir"`
}

// handleGetFileMetadata returns metadata about a file
func (s *Server) handleGetFileMetadata(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "Path parameter is required")
		return
	}

	// Validate and get full path
	fullPath := filepath.Join(s.config.RootDir, path)
	if !strings.HasPrefix(fullPath, s.config.RootDir) {
		writeError(w, http.StatusBadRequest, "Invalid path")
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found: "+err.Error())
		return
	}

	metadata := FileMetadata{
		Path:         path,
		Size:         info.Size(),
		ModifiedTime: info.ModTime().Format("Jan 2, 2006 3:04 PM"),
		IsDir:        info.IsDir(),
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    metadata,
	})
}

// handleUploadImage handles image uploads
func (s *Server) handleUploadImage(w http.ResponseWriter, r *http.Request) {
	// Limit upload size to 10MB
	r.ParseMultipartForm(10 << 20)

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to get uploaded file: "+err.Error())
		return
	}
	defer file.Close()

	// Read file content
	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file: "+err.Error())
		return
	}

	// Get file extension
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".png" // Default to png
	}

	// Validate it's an image
	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		writeError(w, http.StatusBadRequest, "File is not an image")
		return
	}

	// Save image
	path, err := s.fs.SaveImage(data, ext)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save image: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, APIResponse{
		Success: true,
		Data: map[string]string{
			"path": path,
		},
	})
}

// handleServeImage serves images from the assets directory
func (s *Server) handleServeImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filename := vars["filename"]

	fullPath, err := s.fs.GetImagePath(filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, fullPath)
}

// handleGetConfig returns the current configuration
func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"theme":       s.config.Theme,
			"rootDir":     s.config.RootDir,
			"initialFile": s.config.InitialFile,
		},
	})
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, APIResponse{
		Success: false,
		Error:   message,
	})
}

// DirectoryRequest represents a directory change request
type DirectoryRequest struct {
	Path string `json:"path"`
}

// handleChangeDirectory changes the working directory
func (s *Server) handleChangeDirectory(w http.ResponseWriter, r *http.Request) {
	var req DirectoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "Path is required")
		return
	}

	// Expand ~ to home directory
	if strings.HasPrefix(req.Path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			req.Path = filepath.Join(home, req.Path[1:])
		}
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid path: "+err.Error())
		return
	}

	// Check if directory exists
	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "Directory does not exist")
		} else {
			writeError(w, http.StatusInternalServerError, "Failed to access directory: "+err.Error())
		}
		return
	}

	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "Path is not a directory")
		return
	}

	// Update the filesystem and config
	s.config.RootDir = absPath
	s.fs = filesystem.New(absPath)

	// Restart the watcher for the new directory
	s.watcher.Close()
	newWatcher, err := filesystem.NewWatcher(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to watch directory: "+err.Error())
		return
	}
	s.watcher = newWatcher

	// Start forwarding events from new watcher
	go s.forwardFileEvents()

	// Add to recents
	if s.recents != nil {
		s.recents.Add(absPath)
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]string{
			"path": absPath,
		},
	})
}

// handleGetRecents returns recent locations
func (s *Server) handleGetRecents(w http.ResponseWriter, r *http.Request) {
	if s.recents == nil {
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    []interface{}{},
		})
		return
	}

	locations := s.recents.GetAll()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    locations,
	})
}

// handleListDirectories lists subdirectories for navigation
func (s *Server) handleListDirectories(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")

	// Default to home directory if no path provided
	if path == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to get home directory")
			return
		}
		path = home
	}

	// Expand ~ to home directory
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, path[1:])
		}
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid path: "+err.Error())
		return
	}

	// Read directory
	entries, err := os.ReadDir(absPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "Failed to read directory: "+err.Error())
		return
	}

	type DirEntry struct {
		Name  string `json:"name"`
		Path  string `json:"path"`
		IsDir bool   `json:"isDir"`
	}

	dirs := []DirEntry{}
	for _, entry := range entries {
		// Skip hidden files/directories
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		if entry.IsDir() {
			dirs = append(dirs, DirEntry{
				Name:  entry.Name(),
				Path:  filepath.Join(absPath, entry.Name()),
				IsDir: true,
			})
		}
	}

	// Get parent directory
	parent := filepath.Dir(absPath)

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"current":     absPath,
			"parent":      parent,
			"directories": dirs,
		},
	})
}
