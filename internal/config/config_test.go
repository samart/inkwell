package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindAvailablePort(t *testing.T) {
	port, err := findAvailablePort()
	if err != nil {
		t.Fatalf("findAvailablePort failed: %v", err)
	}

	if port <= 0 || port > 65535 {
		t.Errorf("Invalid port: %d", port)
	}
}

func TestConfigURL(t *testing.T) {
	tests := []struct {
		name        string
		cfg         Config
		expectedURL string
	}{
		{
			name: "BasicURL",
			cfg: Config{
				Port: 8080,
			},
			expectedURL: "http://localhost:8080",
		},
		{
			name: "URLWithInitialFile",
			cfg: Config{
				Port:        3000,
				InitialFile: "readme.md",
			},
			expectedURL: "http://localhost:3000?file=readme.md",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.URL()
			if got != tt.expectedURL {
				t.Errorf("URL() = %q, want %q", got, tt.expectedURL)
			}
		})
	}
}

func TestConfigParseWithDirectory(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "inkwell-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Save and restore os.Args
	oldArgs := os.Args
	defer func() { os.Args = oldArgs }()

	os.Args = []string{"inkwell", tmpDir}

	cfg, err := Parse()
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	absPath, _ := filepath.Abs(tmpDir)
	if cfg.RootDir != absPath {
		t.Errorf("RootDir = %q, want %q", cfg.RootDir, absPath)
	}

	if cfg.InitialFile != "" {
		t.Errorf("InitialFile should be empty for directory, got %q", cfg.InitialFile)
	}

	if cfg.Port <= 0 {
		t.Error("Port should be assigned")
	}
}

func TestConfigParseWithFile(t *testing.T) {
	// Create temp directory and file
	tmpDir, err := os.MkdirTemp("", "inkwell-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	testFile := filepath.Join(tmpDir, "test.md")
	if err := os.WriteFile(testFile, []byte("# Test"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Save and restore os.Args
	oldArgs := os.Args
	defer func() { os.Args = oldArgs }()

	os.Args = []string{"inkwell", testFile}

	cfg, err := Parse()
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if cfg.RootDir != tmpDir {
		t.Errorf("RootDir = %q, want %q", cfg.RootDir, tmpDir)
	}

	if cfg.InitialFile != "test.md" {
		t.Errorf("InitialFile = %q, want %q", cfg.InitialFile, "test.md")
	}
}
