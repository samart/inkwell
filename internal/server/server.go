package server

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"sync"
	"time"

	"inkwell/internal/config"
	"inkwell/internal/filesystem"
	"inkwell/internal/git"
	"inkwell/internal/recents"

	"github.com/gorilla/mux"
)

// Server represents the HTTP server
type Server struct {
	config     *config.Config
	fs         *filesystem.FileSystem
	watcher    *filesystem.Watcher
	watcherMu  sync.RWMutex // Protects watcher during directory changes
	router     *mux.Router
	httpServer *http.Server
	hub        *Hub
	webContent embed.FS
	recents    *recents.Manager
	git        *git.Manager
}

// New creates a new server instance
func New(cfg *config.Config, webContent embed.FS) (*Server, error) {
	fileSystem := filesystem.New(cfg.RootDir)

	watcher, err := filesystem.NewWatcher(cfg.RootDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	recentsManager, err := recents.New()
	if err != nil {
		log.Printf("Warning: Failed to initialize recents manager: %v", err)
	}

	gitManager, err := git.NewManager()
	if err != nil {
		log.Printf("Warning: Failed to initialize git manager: %v", err)
	}

	s := &Server{
		config:     cfg,
		fs:         fileSystem,
		watcher:    watcher,
		router:     mux.NewRouter(),
		webContent: webContent,
		recents:    recentsManager,
		git:        gitManager,
	}

	// Create WebSocket hub
	s.hub = NewHub(s)

	// Setup routes
	s.setupRoutes()

	// Add current directory to recents
	if s.recents != nil {
		s.recents.Add(cfg.RootDir)
	}

	// Try to open as git repository
	if s.git != nil {
		if _, err := s.git.OpenRepository(cfg.RootDir); err != nil {
			log.Printf("Note: %s is not a git repository", cfg.RootDir)
		} else if repo := s.git.CurrentRepository(); repo != nil {
			log.Printf("Git repository detected: %s (branch: %s)", cfg.RootDir, repo.Branch())
		}
	}

	return s, nil
}

// setupRoutes configures all HTTP routes
func (s *Server) setupRoutes() {
	// API routes
	api := s.router.PathPrefix("/api").Subrouter()
	api.Use(jsonContentType)

	// File operations
	api.HandleFunc("/tree", s.handleGetTree).Methods("GET")
	api.HandleFunc("/files", s.handleGetFile).Methods("GET")
	api.HandleFunc("/files", s.handleCreateFile).Methods("POST")
	api.HandleFunc("/files", s.handleUpdateFile).Methods("PUT")
	api.HandleFunc("/files", s.handleDeleteFile).Methods("DELETE")
	api.HandleFunc("/files/metadata", s.handleGetFileMetadata).Methods("GET")

	// Image operations
	api.HandleFunc("/images", s.handleUploadImage).Methods("POST")
	s.router.HandleFunc("/images/{filename}", s.handleServeImage).Methods("GET")

	// Config
	api.HandleFunc("/config", s.handleGetConfig).Methods("GET")

	// Directory operations
	api.HandleFunc("/directories", s.handleListDirectories).Methods("GET")
	api.HandleFunc("/directories", s.handleChangeDirectory).Methods("POST")

	// Recent locations
	api.HandleFunc("/recents", s.handleGetRecents).Methods("GET")

	// Git operations
	gitAPI := api.PathPrefix("/git").Subrouter()
	gitAPI.HandleFunc("/status", s.handleGitStatus).Methods("GET")
	gitAPI.HandleFunc("/init", s.handleGitInit).Methods("POST")
	gitAPI.HandleFunc("/clone", s.handleGitClone).Methods("POST")
	gitAPI.HandleFunc("/repos", s.handleGitListRepos).Methods("GET")
	gitAPI.HandleFunc("/validate-url", s.handleGitValidateURL).Methods("GET")
	gitAPI.HandleFunc("/stage", s.handleGitStage).Methods("POST")
	gitAPI.HandleFunc("/unstage", s.handleGitUnstage).Methods("POST")
	gitAPI.HandleFunc("/commit", s.handleGitCommit).Methods("POST")
	gitAPI.HandleFunc("/discard", s.handleGitDiscard).Methods("POST")
	gitAPI.HandleFunc("/push", s.handleGitPush).Methods("POST")
	gitAPI.HandleFunc("/pull", s.handleGitPull).Methods("POST")
	gitAPI.HandleFunc("/fetch", s.handleGitFetch).Methods("POST")
	gitAPI.HandleFunc("/branches", s.handleGitBranches).Methods("GET")
	gitAPI.HandleFunc("/checkout", s.handleGitCheckout).Methods("POST")
	gitAPI.HandleFunc("/branches/create", s.handleGitCreateBranch).Methods("POST")
	gitAPI.HandleFunc("/branches/delete", s.handleGitDeleteBranch).Methods("POST")
	gitAPI.HandleFunc("/branches/rename", s.handleGitRenameBranch).Methods("POST")
	gitAPI.HandleFunc("/history", s.handleGitHistory).Methods("GET")
	gitAPI.HandleFunc("/commit-detail", s.handleGitCommitDetail).Methods("GET")
	gitAPI.HandleFunc("/diff", s.handleGitDiff).Methods("GET", "POST")
	gitAPI.HandleFunc("/file-at-commit", s.handleGitFileAtCommit).Methods("GET")
	gitAPI.HandleFunc("/quick-commit", s.handleGitQuickCommit).Methods("POST")

	// WebSocket
	s.router.HandleFunc("/ws", s.hub.HandleWebSocket)

	// Serve static files (embedded web UI)
	s.router.PathPrefix("/").Handler(s.staticFileHandler())
}

// staticFileHandler returns a handler for serving the embedded web UI
func (s *Server) staticFileHandler() http.Handler {
	// Get the web subdirectory from the embedded filesystem
	webFS, err := fs.Sub(s.webContent, "web")
	if err != nil {
		log.Fatal("Failed to get web subdirectory:", err)
	}

	fileServer := http.FileServer(http.FS(webFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		// Check if file exists in embedded FS
		_, err := fs.Stat(webFS, path[1:]) // Remove leading /
		if err != nil {
			// Serve index.html for SPA routing
			r.URL.Path = "/"
		}

		fileServer.ServeHTTP(w, r)
	})
}

// jsonContentType middleware sets Content-Type to application/json
func jsonContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

// Start starts the HTTP server
func (s *Server) Start() error {
	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Port),
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start WebSocket hub
	go s.hub.Run()

	// Start file watcher events forwarding
	go s.forwardFileEvents()

	log.Printf("Server starting on http://localhost:%d", s.config.Port)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	s.watcher.Close()
	s.hub.Close()
	return s.httpServer.Shutdown(ctx)
}

// forwardFileEvents forwards file system events to WebSocket clients
func (s *Server) forwardFileEvents() {
	s.watcherMu.RLock()
	watcher := s.watcher
	s.watcherMu.RUnlock()

	if watcher == nil {
		return
	}

	events := watcher.Subscribe()
	for event := range events {
		s.hub.BroadcastFileEvent(event)
	}
	// Channel closed means watcher was closed, goroutine exits naturally
}
