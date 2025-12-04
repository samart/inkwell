package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildTree(t *testing.T) {
	// Create temp directory structure
	tmpDir, err := os.MkdirTemp("", "inkwell-tree-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create directory structure:
	// tmpDir/
	//   readme.md
	//   notes/
	//     todo.md
	//     ideas.md
	//   empty/
	//   .hidden/
	//     secret.md
	//   other.txt

	files := map[string]string{
		"readme.md":         "# README",
		"notes/todo.md":     "# TODO",
		"notes/ideas.md":    "# Ideas",
		".hidden/secret.md": "# Secret",
		"other.txt":         "Not markdown",
	}

	for path, content := range files {
		fullPath := filepath.Join(tmpDir, path)
		dir := filepath.Dir(fullPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("Failed to create dir: %v", err)
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write file: %v", err)
		}
	}

	// Create empty directory
	if err := os.MkdirAll(filepath.Join(tmpDir, "empty"), 0755); err != nil {
		t.Fatalf("Failed to create empty dir: %v", err)
	}

	tree, err := BuildTree(tmpDir)
	if err != nil {
		t.Fatalf("BuildTree failed: %v", err)
	}

	t.Run("RootIsDirectory", func(t *testing.T) {
		if !tree.IsDir {
			t.Error("Root should be a directory")
		}
	})

	t.Run("HasMarkdownFiles", func(t *testing.T) {
		found := findNode(tree, "readme.md")
		if found == nil {
			t.Error("readme.md should be in tree")
		}
	})

	t.Run("HasSubdirectory", func(t *testing.T) {
		found := findNode(tree, "notes")
		if found == nil {
			t.Error("notes directory should be in tree")
		}
		if !found.IsDir {
			t.Error("notes should be a directory")
		}
	})

	t.Run("HasNestedFiles", func(t *testing.T) {
		notesDir := findNode(tree, "notes")
		if notesDir == nil {
			t.Fatal("notes directory not found")
		}

		todoFound := false
		ideasFound := false
		for _, child := range notesDir.Children {
			if child.Name == "todo.md" {
				todoFound = true
			}
			if child.Name == "ideas.md" {
				ideasFound = true
			}
		}

		if !todoFound {
			t.Error("todo.md should be in notes directory")
		}
		if !ideasFound {
			t.Error("ideas.md should be in notes directory")
		}
	})

	t.Run("ExcludesHiddenDirs", func(t *testing.T) {
		found := findNode(tree, ".hidden")
		if found != nil {
			t.Error(".hidden directory should not be in tree")
		}
	})

	t.Run("ExcludesNonMarkdown", func(t *testing.T) {
		found := findNode(tree, "other.txt")
		if found != nil {
			t.Error("other.txt should not be in tree")
		}
	})

	t.Run("ExcludesEmptyDirs", func(t *testing.T) {
		found := findNode(tree, "empty")
		if found != nil {
			t.Error("empty directory should not be in tree (no markdown files)")
		}
	})
}

func TestIsMarkdownFile(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"file.md", true},
		{"FILE.MD", true},
		{"file.markdown", true},
		{"FILE.MARKDOWN", true},
		{"file.txt", false},
		{"file.md.txt", false},
		{"readme", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMarkdownFile(tt.name)
			if got != tt.want {
				t.Errorf("isMarkdownFile(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

// Helper function to find a node by name in the tree
func findNode(node *FileNode, name string) *FileNode {
	if node.Name == name {
		return node
	}
	for _, child := range node.Children {
		if found := findNode(child, name); found != nil {
			return found
		}
	}
	return nil
}
