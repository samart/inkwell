package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileSystem(t *testing.T) {
	// Create temp directory for tests
	tmpDir, err := os.MkdirTemp("", "inkwell-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	fs := New(tmpDir)

	t.Run("CreateFile", func(t *testing.T) {
		err := fs.CreateFile("test.md", "# Hello World")
		if err != nil {
			t.Fatalf("Failed to create file: %v", err)
		}

		// Check file exists
		fullPath := filepath.Join(tmpDir, "test.md")
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			t.Error("File was not created")
		}
	})

	t.Run("ReadFile", func(t *testing.T) {
		content, err := fs.ReadFile("test.md")
		if err != nil {
			t.Fatalf("Failed to read file: %v", err)
		}

		expected := "# Hello World"
		if content != expected {
			t.Errorf("Expected %q, got %q", expected, content)
		}
	})

	t.Run("WriteFile", func(t *testing.T) {
		err := fs.WriteFile("test.md", "# Updated Content")
		if err != nil {
			t.Fatalf("Failed to write file: %v", err)
		}

		content, _ := fs.ReadFile("test.md")
		if content != "# Updated Content" {
			t.Errorf("Content was not updated")
		}
	})

	t.Run("CreateFileInSubdir", func(t *testing.T) {
		err := fs.CreateFile("subdir/nested.md", "# Nested File")
		if err != nil {
			t.Fatalf("Failed to create nested file: %v", err)
		}

		content, err := fs.ReadFile("subdir/nested.md")
		if err != nil {
			t.Fatalf("Failed to read nested file: %v", err)
		}

		if content != "# Nested File" {
			t.Error("Nested file content mismatch")
		}
	})

	t.Run("FileExists", func(t *testing.T) {
		if !fs.FileExists("test.md") {
			t.Error("FileExists returned false for existing file")
		}

		if fs.FileExists("nonexistent.md") {
			t.Error("FileExists returned true for non-existent file")
		}
	})

	t.Run("DeleteFile", func(t *testing.T) {
		err := fs.DeleteFile("test.md")
		if err != nil {
			t.Fatalf("Failed to delete file: %v", err)
		}

		if fs.FileExists("test.md") {
			t.Error("File still exists after deletion")
		}
	})

	t.Run("PathTraversalPrevention", func(t *testing.T) {
		_, err := fs.ReadFile("../etc/passwd")
		if err == nil {
			t.Error("Path traversal should have been prevented")
		}
	})

	t.Run("SaveImage", func(t *testing.T) {
		imageData := []byte("fake image data")
		path, err := fs.SaveImage(imageData, ".png")
		if err != nil {
			t.Fatalf("Failed to save image: %v", err)
		}

		if !filepath.HasPrefix(path, "assets/") {
			t.Errorf("Image path should start with assets/, got %s", path)
		}

		fullPath := filepath.Join(tmpDir, path)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			t.Error("Image file was not created")
		}
	})
}

func TestValidatePath(t *testing.T) {
	fs := New("/tmp")

	tests := []struct {
		path    string
		wantErr bool
	}{
		{"file.md", false},
		{"subdir/file.md", false},
		{"a/b/c/file.md", false},
		{"../escape.md", true},
		{"subdir/../escape.md", true},
		{"/absolute/path.md", true},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			err := fs.validatePath(tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("validatePath(%q) error = %v, wantErr %v", tt.path, err, tt.wantErr)
			}
		})
	}
}
