package filesystem

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// FileSystem handles all file operations within a root directory
type FileSystem struct {
	RootDir string
}

// New creates a new FileSystem with the given root directory
func New(rootDir string) *FileSystem {
	return &FileSystem{RootDir: rootDir}
}

// ReadFile reads a file and returns its content
func (fs *FileSystem) ReadFile(relativePath string) (string, error) {
	if err := fs.validatePath(relativePath); err != nil {
		return "", err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	return string(content), nil
}

// WriteFile writes content to a file
func (fs *FileSystem) WriteFile(relativePath, content string) error {
	if err := fs.validatePath(relativePath); err != nil {
		return err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// CreateFile creates a new file with optional initial content
func (fs *FileSystem) CreateFile(relativePath, content string) error {
	if err := fs.validatePath(relativePath); err != nil {
		return err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)

	// Check if file already exists
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("file already exists: %s", relativePath)
	}

	return fs.WriteFile(relativePath, content)
}

// DeleteFile deletes a file
func (fs *FileSystem) DeleteFile(relativePath string) error {
	if err := fs.validatePath(relativePath); err != nil {
		return err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)

	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// CreateDirectory creates a new directory
func (fs *FileSystem) CreateDirectory(relativePath string) error {
	if err := fs.validatePath(relativePath); err != nil {
		return err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return nil
}

// SaveImage saves an image to the assets directory and returns its relative path
func (fs *FileSystem) SaveImage(data []byte, extension string) (string, error) {
	// Ensure assets directory exists
	assetsDir := filepath.Join(fs.RootDir, "assets")
	if err := os.MkdirAll(assetsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create assets directory: %w", err)
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s%s", uuid.New().String(), extension)
	relativePath := filepath.Join("assets", filename)
	fullPath := filepath.Join(fs.RootDir, relativePath)

	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to save image: %w", err)
	}

	return relativePath, nil
}

// GetImagePath returns the full path to an image file
func (fs *FileSystem) GetImagePath(filename string) (string, error) {
	relativePath := filepath.Join("assets", filename)
	if err := fs.validatePath(relativePath); err != nil {
		return "", err
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)

	// Check if file exists
	if _, err := os.Stat(fullPath); err != nil {
		return "", fmt.Errorf("image not found: %s", filename)
	}

	return fullPath, nil
}

// validatePath ensures the path is safe and within the root directory
func (fs *FileSystem) validatePath(relativePath string) error {
	// Prevent path traversal attacks
	if strings.Contains(relativePath, "..") {
		return fmt.Errorf("invalid path: path traversal not allowed")
	}

	// Clean the path
	cleanPath := filepath.Clean(relativePath)

	// Ensure the path doesn't start with /
	if filepath.IsAbs(cleanPath) {
		return fmt.Errorf("invalid path: absolute paths not allowed")
	}

	return nil
}

// GetTree returns the file tree for the root directory
func (fs *FileSystem) GetTree() (*FileNode, error) {
	return BuildTree(fs.RootDir)
}

// FileExists checks if a file exists
func (fs *FileSystem) FileExists(relativePath string) bool {
	if err := fs.validatePath(relativePath); err != nil {
		return false
	}

	fullPath := filepath.Join(fs.RootDir, relativePath)
	_, err := os.Stat(fullPath)
	return err == nil
}

// RenameFile renames or moves a file
func (fs *FileSystem) RenameFile(oldPath, newPath string) error {
	if err := fs.validatePath(oldPath); err != nil {
		return err
	}
	if err := fs.validatePath(newPath); err != nil {
		return err
	}

	oldFullPath := filepath.Join(fs.RootDir, oldPath)
	newFullPath := filepath.Join(fs.RootDir, newPath)

	// Ensure parent directory of new path exists
	dir := filepath.Dir(newFullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.Rename(oldFullPath, newFullPath); err != nil {
		return fmt.Errorf("failed to rename file: %w", err)
	}

	return nil
}
