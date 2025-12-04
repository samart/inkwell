package server

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"time"

	"inkwell/internal/config"
	"inkwell/internal/filesystem"
	"inkwell/internal/recents"

	"github.com/gorilla/mux"
)

// Server represents the HTTP server
type Server struct {
	config     *config.Config
	fs         *filesystem.FileSystem
	watcher    *filesystem.Watcher
	router     *mux.Router
	httpServer *http.Server
	hub        *Hub
	webContent embed.FS
	recents    *recents.Manager
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

	s := &Server{
		config:     cfg,
		fs:         fileSystem,
		watcher:    watcher,
		router:     mux.NewRouter(),
		webContent: webContent,
		recents:    recentsManager,
	}

	// Create WebSocket hub
	s.hub = NewHub(s)

	// Setup routes
	s.setupRoutes()

	// Add current directory to recents
	if s.recents != nil {
		s.recents.Add(cfg.RootDir)
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
	events := s.watcher.Subscribe()
	for event := range events {
		s.hub.BroadcastFileEvent(event)
	}
}
