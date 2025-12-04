package filesystem

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// FileNode represents a file or directory in the tree
type FileNode struct {
	Name     string      `json:"name"`
	Path     string      `json:"path"`     // Relative path from root
	IsDir    bool        `json:"isDir"`
	Children []*FileNode `json:"children,omitempty"`
}

// BuildTree builds a file tree starting from the given root directory
// It only includes markdown files (.md) and directories that contain them
func BuildTree(rootDir string) (*FileNode, error) {
	return buildTreeRecursive(rootDir, rootDir, "")
}

func buildTreeRecursive(rootDir, currentDir, relativePath string) (*FileNode, error) {
	entries, err := os.ReadDir(currentDir)
	if err != nil {
		return nil, err
	}

	name := filepath.Base(currentDir)
	if relativePath == "" {
		name = filepath.Base(rootDir)
	}

	node := &FileNode{
		Name:  name,
		Path:  relativePath,
		IsDir: true,
	}

	var children []*FileNode

	for _, entry := range entries {
		entryName := entry.Name()

		// Skip hidden files and directories
		if strings.HasPrefix(entryName, ".") {
			continue
		}

		// Skip assets directory (where images are stored)
		if entryName == "assets" && entry.IsDir() {
			continue
		}

		entryPath := filepath.Join(currentDir, entryName)
		entryRelPath := filepath.Join(relativePath, entryName)

		if entry.IsDir() {
			// Recursively build subtree
			childNode, err := buildTreeRecursive(rootDir, entryPath, entryRelPath)
			if err != nil {
				continue // Skip directories we can't read
			}
			// Only include directories that have markdown files somewhere
			if hasMarkdownFiles(childNode) {
				children = append(children, childNode)
			}
		} else {
			// Only include markdown files
			if isMarkdownFile(entryName) {
				children = append(children, &FileNode{
					Name:  entryName,
					Path:  entryRelPath,
					IsDir: false,
				})
			}
		}
	}

	// Sort: directories first, then files, alphabetically
	sort.Slice(children, func(i, j int) bool {
		if children[i].IsDir != children[j].IsDir {
			return children[i].IsDir // Directories come first
		}
		return strings.ToLower(children[i].Name) < strings.ToLower(children[j].Name)
	})

	node.Children = children
	return node, nil
}

// isMarkdownFile checks if a filename is a markdown file
func isMarkdownFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".md") || strings.HasSuffix(lower, ".markdown")
}

// hasMarkdownFiles checks if a node or any of its children contain markdown files
func hasMarkdownFiles(node *FileNode) bool {
	if !node.IsDir {
		return isMarkdownFile(node.Name)
	}
	for _, child := range node.Children {
		if hasMarkdownFiles(child) {
			return true
		}
	}
	return false
}
