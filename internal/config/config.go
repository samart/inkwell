package config

import (
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
)

// Config holds the application configuration
type Config struct {
	RootDir     string // Directory to serve markdown files from
	Port        int    // HTTP server port
	Theme       string // Initial theme (light/dark)
	NoBrowser   bool   // Don't auto-open browser
	InitialFile string // Initial file to open (if specified)
}

var (
	flagsInitialized bool
	portFlag         int
	themeFlag        string
	noBrowserFlag    bool
)

func initFlags() {
	if flagsInitialized {
		return
	}
	flag.IntVar(&portFlag, "port", 0, "HTTP server port (default: random available)")
	flag.StringVar(&themeFlag, "theme", "light", "Initial theme (light/dark)")
	flag.BoolVar(&noBrowserFlag, "no-browser", false, "Don't auto-open browser")
	flagsInitialized = true
}

// Parse parses command line arguments and returns a Config
func Parse() (*Config, error) {
	initFlags()
	cfg := &Config{}

	flag.Parse()

	cfg.Port = portFlag
	cfg.Theme = themeFlag
	cfg.NoBrowser = noBrowserFlag

	// Get the directory/file argument
	args := flag.Args()
	var targetPath string
	if len(args) > 0 {
		targetPath = args[0]
	} else {
		targetPath = "."
	}

	// Resolve to absolute path
	absPath, err := filepath.Abs(targetPath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve path: %w", err)
	}

	// Check if path exists
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, fmt.Errorf("path does not exist: %w", err)
	}

	// If it's a file, set the root to parent dir and remember the file
	if info.IsDir() {
		cfg.RootDir = absPath
	} else {
		cfg.RootDir = filepath.Dir(absPath)
		cfg.InitialFile = filepath.Base(absPath)
	}

	// If no port specified, find an available one
	if cfg.Port == 0 {
		port, err := findAvailablePort()
		if err != nil {
			return nil, fmt.Errorf("failed to find available port: %w", err)
		}
		cfg.Port = port
	}

	return cfg, nil
}

// findAvailablePort finds an available port to listen on
func findAvailablePort() (int, error) {
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

// URL returns the full URL to access the application
func (c *Config) URL() string {
	url := fmt.Sprintf("http://localhost:%d", c.Port)
	if c.InitialFile != "" {
		url += fmt.Sprintf("?file=%s", c.InitialFile)
	}
	return url
}
