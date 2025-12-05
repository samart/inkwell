package git

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Helper to create a temporary directory
func tempDir(t *testing.T) string {
	dir, err := os.MkdirTemp("", "git-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	return dir
}

// TestDetectAuthType tests authentication type detection from URLs
func TestDetectAuthType(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected AuthType
	}{
		{"SSH git@ URL", "git@github.com:user/repo.git", AuthTypeSSH},
		{"SSH ssh:// URL", "ssh://git@github.com/user/repo.git", AuthTypeSSH},
		{"HTTPS URL", "https://github.com/user/repo.git", AuthTypeHTTPS},
		{"HTTP URL", "http://github.com/user/repo.git", AuthTypeHTTPS},
		{"Local path", "/path/to/repo", AuthTypeNone},
		{"Relative path", "./repo", AuthTypeNone},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := DetectAuthType(tt.url)
			if result != tt.expected {
				t.Errorf("DetectAuthType(%q) = %v, want %v", tt.url, result, tt.expected)
			}
		})
	}
}

// TestValidateCloneURL tests URL validation
func TestValidateCloneURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"Valid HTTPS URL", "https://github.com/user/repo.git", false},
		{"Valid SSH URL", "git@github.com:user/repo.git", false},
		{"Valid SSH protocol URL", "ssh://git@github.com/user/repo.git", false},
		{"Valid git protocol", "git://github.com/user/repo.git", false},
		{"Empty URL", "", true},
		{"Invalid URL", "not-a-url", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCloneURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateCloneURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

// TestExtractRepoName tests repository name extraction from URLs
func TestExtractRepoName(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{"HTTPS URL", "https://github.com/user/my-repo.git", "my-repo"},
		{"HTTPS URL without .git", "https://github.com/user/my-repo", "my-repo"},
		{"SSH URL", "git@github.com:user/my-repo.git", "my-repo"},
		{"SSH URL without .git", "git@github.com:user/my-repo", "my-repo"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractRepoName(tt.url)
			if result != tt.expected {
				t.Errorf("extractRepoName(%q) = %v, want %v", tt.url, result, tt.expected)
			}
		})
	}
}

// TestIsGitRepository tests git repository detection
func TestIsGitRepository(t *testing.T) {
	// Create a temp directory without git
	nonGitDir := tempDir(t)
	defer os.RemoveAll(nonGitDir)

	if IsGitRepository(nonGitDir) {
		t.Error("IsGitRepository should return false for non-git directory")
	}

	// Initialize git repository
	gitDir := tempDir(t)
	defer os.RemoveAll(gitDir)

	_, err := Init(gitDir)
	if err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	if !IsGitRepository(gitDir) {
		t.Error("IsGitRepository should return true for git repository")
	}
}

// TestInit tests git repository initialization
func TestInit(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if repo == nil {
		t.Fatal("Init returned nil repository")
	}

	// Check .git directory exists
	gitDir := filepath.Join(dir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		t.Error(".git directory was not created")
	}
}

// TestRepositoryStatus tests getting status from a repository
func TestRepositoryStatus(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repository
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Get status of empty repo
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}

	if !status.IsClean {
		t.Error("Empty repo should be clean")
	}

	// Create a new file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Get status with untracked file
	status, err = repo.Status()
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}

	if status.IsClean {
		t.Error("Repo with untracked file should not be clean")
	}

	if len(status.Files) != 1 {
		t.Errorf("Expected 1 file in status, got %d", len(status.Files))
	}

	if len(status.Files) > 0 && status.Files[0].Status != "untracked" {
		t.Errorf("Expected file status 'untracked', got '%s'", status.Files[0].Status)
	}
}

// TestManagerOpenRepository tests opening a repository through the manager
func TestManagerOpenRepository(t *testing.T) {
	// Create temp dir for repos
	reposDir := tempDir(t)
	defer os.RemoveAll(reposDir)

	// Create a git repo
	gitDir := tempDir(t)
	defer os.RemoveAll(gitDir)

	_, err := Init(gitDir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create manager with custom repos dir
	manager := &Manager{
		reposDir: reposDir,
	}

	// Open the repository
	repo, err := manager.OpenRepository(gitDir)
	if err != nil {
		t.Fatalf("OpenRepository failed: %v", err)
	}

	if repo == nil {
		t.Fatal("OpenRepository returned nil")
	}

	// Verify current repository is set
	if manager.CurrentRepository() == nil {
		t.Error("CurrentRepository should not be nil after opening")
	}
}

// TestGetAuth tests authentication method creation
func TestGetAuth(t *testing.T) {
	// Test no auth
	auth, err := GetAuth(AuthConfig{Type: AuthTypeNone})
	if err != nil {
		t.Errorf("GetAuth(None) returned error: %v", err)
	}
	if auth != nil {
		t.Error("GetAuth(None) should return nil auth")
	}

	// Test HTTPS with no credentials
	auth, err = GetAuth(AuthConfig{Type: AuthTypeHTTPS})
	if err != nil {
		t.Errorf("GetAuth(HTTPS) returned error: %v", err)
	}
	if auth != nil {
		t.Error("GetAuth(HTTPS) with no credentials should return nil")
	}

	// Test HTTPS with credentials
	auth, err = GetAuth(AuthConfig{
		Type:     AuthTypeHTTPS,
		Username: "user",
		Password: "pass",
	})
	if err != nil {
		t.Errorf("GetAuth(HTTPS with creds) returned error: %v", err)
	}
	if auth == nil {
		t.Error("GetAuth(HTTPS with creds) should return auth method")
	}
}

// TestFindDefaultSSHKey tests SSH key discovery
func TestFindDefaultSSHKey(t *testing.T) {
	// This test just verifies the function runs without error
	// The actual result depends on the system configuration
	key := findDefaultSSHKey()
	// We don't assert the result since it depends on ~/.ssh contents
	_ = key
}

// TestCloneOptions tests clone options configuration
func TestCloneOptions(t *testing.T) {
	opts := CloneOptions{
		URL:      "https://github.com/user/repo.git",
		Branch:   "main",
		Depth:    1,
		DestPath: "/tmp/test-repo",
		AuthConfig: AuthConfig{
			Type:     AuthTypeHTTPS,
			Username: "user",
			Password: "token",
		},
	}

	if opts.URL != "https://github.com/user/repo.git" {
		t.Error("URL not set correctly")
	}
	if opts.Branch != "main" {
		t.Error("Branch not set correctly")
	}
	if opts.Depth != 1 {
		t.Error("Depth not set correctly")
	}
}

// TestEnsureUniquePath tests path uniqueness
func TestEnsureUniquePath(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// First path should be unchanged
	basePath := filepath.Join(dir, "repo")
	result := ensureUniquePath(basePath)
	if result != basePath {
		t.Errorf("First path should be unchanged, got %s", result)
	}

	// Create the directory
	if err := os.Mkdir(basePath, 0755); err != nil {
		t.Fatalf("Failed to create directory: %v", err)
	}

	// Now it should append -1
	result = ensureUniquePath(basePath)
	expected := basePath + "-1"
	if result != expected {
		t.Errorf("Expected %s, got %s", expected, result)
	}

	// Create that too
	if err := os.Mkdir(expected, 0755); err != nil {
		t.Fatalf("Failed to create directory: %v", err)
	}

	// Should now be -2
	result = ensureUniquePath(basePath)
	expected = basePath + "-2"
	if result != expected {
		t.Errorf("Expected %s, got %s", expected, result)
	}
}

// TestManagerListClonedRepos tests listing cloned repositories
func TestManagerListClonedRepos(t *testing.T) {
	// Create temp repos dir
	reposDir := tempDir(t)
	defer os.RemoveAll(reposDir)

	manager := &Manager{
		reposDir: reposDir,
	}

	// Initially should be empty
	repos, err := manager.ListClonedRepos()
	if err != nil {
		t.Fatalf("ListClonedRepos failed: %v", err)
	}
	if len(repos) != 0 {
		t.Errorf("Expected 0 repos, got %d", len(repos))
	}

	// Create a git repo in the repos dir
	repoPath := filepath.Join(reposDir, "test-repo")
	_, err = Init(repoPath)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Now should have one repo
	repos, err = manager.ListClonedRepos()
	if err != nil {
		t.Fatalf("ListClonedRepos failed: %v", err)
	}
	if len(repos) != 1 {
		t.Errorf("Expected 1 repo, got %d", len(repos))
	}
}

// TestNewManager tests manager creation
func TestNewManager(t *testing.T) {
	manager, err := NewManager()
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	if manager == nil {
		t.Fatal("NewManager returned nil")
	}

	// Verify repos dir is set
	if manager.reposDir == "" {
		t.Error("reposDir should not be empty")
	}
}

// TestGetReposDir tests repos directory retrieval
func TestGetReposDir(t *testing.T) {
	reposDir := tempDir(t)
	defer os.RemoveAll(reposDir)

	manager := &Manager{
		reposDir: reposDir,
	}

	if manager.GetReposDir() != reposDir {
		t.Errorf("GetReposDir returned wrong path: %s", manager.GetReposDir())
	}
}

// TestCloneTimeout tests that clone respects context timeout
func TestCloneTimeout(t *testing.T) {
	// Skip this test in short mode as it involves network
	if testing.Short() {
		t.Skip("Skipping network test in short mode")
	}

	reposDir := tempDir(t)
	defer os.RemoveAll(reposDir)

	manager := &Manager{
		reposDir: reposDir,
	}

	// Create a context with very short timeout
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	// Try to clone - should fail due to timeout
	_, err := manager.Clone(ctx, CloneOptions{
		URL: "https://github.com/go-git/go-git.git",
		AuthConfig: AuthConfig{
			Type: AuthTypeHTTPS,
		},
	})

	// We expect an error (context deadline exceeded)
	if err == nil {
		t.Error("Expected error due to timeout, got nil")
	}
}

// TestStage tests staging files
func TestStage(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create a test file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Stage the file
	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Verify file is staged
	staged, err := repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}

	if len(staged) != 1 || staged[0] != "test.txt" {
		t.Errorf("Expected staged file 'test.txt', got %v", staged)
	}
}

// TestStageAll tests staging all files
func TestStageAll(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create multiple test files
	for _, name := range []string{"file1.txt", "file2.txt", "file3.txt"} {
		testFile := filepath.Join(dir, name)
		if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
			t.Fatalf("Failed to create test file: %v", err)
		}
	}

	// Stage all
	err = repo.StageAll()
	if err != nil {
		t.Fatalf("StageAll failed: %v", err)
	}

	// Verify all files are staged
	staged, err := repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}

	if len(staged) != 3 {
		t.Errorf("Expected 3 staged files, got %d", len(staged))
	}
}

// TestUnstage tests unstaging files
func TestUnstage(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create and stage a test file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Verify staged
	staged, err := repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}
	if len(staged) != 1 {
		t.Fatalf("Expected 1 staged file, got %d", len(staged))
	}

	// Unstage the file
	err = repo.Unstage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Unstage failed: %v", err)
	}

	// Verify unstaged
	staged, err = repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}
	if len(staged) != 0 {
		t.Errorf("Expected 0 staged files, got %d", len(staged))
	}
}

// TestCommit tests creating a commit
func TestCommit(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create and stage a test file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Commit
	commit, err := repo.Commit(CommitOptions{
		Message:     "Test commit",
		AuthorName:  "Test User",
		AuthorEmail: "test@example.com",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	if commit == nil {
		t.Fatal("Commit returned nil")
	}

	if commit.Message != "Test commit" && commit.Message != "Test commit\n" {
		t.Errorf("Expected message 'Test commit', got '%s'", commit.Message)
	}

	if commit.Author != "Test User" {
		t.Errorf("Expected author 'Test User', got '%s'", commit.Author)
	}

	if len(commit.Hash) != 40 {
		t.Errorf("Expected 40-char hash, got %d chars", len(commit.Hash))
	}

	if len(commit.ShortHash) != 7 {
		t.Errorf("Expected 7-char short hash, got %d chars", len(commit.ShortHash))
	}
}

// TestCommitEmptyMessage tests commit with empty message fails
func TestCommitEmptyMessage(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create and stage a test file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Try to commit with empty message
	_, err = repo.Commit(CommitOptions{
		Message: "",
	})
	if err == nil {
		t.Error("Expected error for empty commit message, got nil")
	}
}

// TestCommitNoStagedChanges tests commit with no staged changes fails
func TestCommitNoStagedChanges(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Try to commit with no staged changes
	_, err = repo.Commit(CommitOptions{
		Message: "Test commit",
	})
	if err == nil {
		t.Error("Expected error for no staged changes, got nil")
	}
}

// TestDiscard tests discarding changes to a file
func TestDiscard(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo and create initial commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create, stage, and commit a test file
	testFile := filepath.Join(dir, "test.txt")
	originalContent := "original content"
	if err := os.WriteFile(testFile, []byte(originalContent), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Modify the file
	modifiedContent := "modified content"
	if err := os.WriteFile(testFile, []byte(modifiedContent), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Verify file was modified
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Fatalf("Failed to read file: %v", err)
	}
	if string(content) != modifiedContent {
		t.Fatalf("File was not modified correctly")
	}

	// Discard changes
	err = repo.Discard([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Discard failed: %v", err)
	}

	// Verify file was restored
	content, err = os.ReadFile(testFile)
	if err != nil {
		t.Fatalf("Failed to read file after discard: %v", err)
	}
	if string(content) != originalContent {
		t.Errorf("Expected '%s', got '%s'", originalContent, string(content))
	}
}

// TestGetStagedFiles tests getting list of staged files
func TestGetStagedFiles(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Initially no staged files
	staged, err := repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}
	if len(staged) != 0 {
		t.Errorf("Expected 0 staged files initially, got %d", len(staged))
	}

	// Create and stage files
	for _, name := range []string{"a.txt", "b.txt"} {
		testFile := filepath.Join(dir, name)
		if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
			t.Fatalf("Failed to create test file: %v", err)
		}
	}

	err = repo.Stage([]string{"a.txt", "b.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Verify staged files
	staged, err = repo.GetStagedFiles()
	if err != nil {
		t.Fatalf("GetStagedFiles failed: %v", err)
	}
	if len(staged) != 2 {
		t.Errorf("Expected 2 staged files, got %d", len(staged))
	}
}

// TestGetUnstagedFiles tests getting list of unstaged modified files
func TestGetUnstagedFiles(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create, stage, and commit a file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("original"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Initially no unstaged changes
	unstaged, err := repo.GetUnstagedFiles()
	if err != nil {
		t.Fatalf("GetUnstagedFiles failed: %v", err)
	}
	if len(unstaged) != 0 {
		t.Errorf("Expected 0 unstaged files initially, got %d", len(unstaged))
	}

	// Modify the file
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Should now have one unstaged file
	unstaged, err = repo.GetUnstagedFiles()
	if err != nil {
		t.Fatalf("GetUnstagedFiles failed: %v", err)
	}
	if len(unstaged) != 1 {
		t.Errorf("Expected 1 unstaged file, got %d", len(unstaged))
	}
}

// TestListBranches tests listing branches
func TestListBranches(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit (needed to have a branch)
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	// Create and commit a file
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// List branches
	branches, err := repo.ListBranches()
	if err != nil {
		t.Fatalf("ListBranches failed: %v", err)
	}

	// Should have at least the main/master branch
	if len(branches) < 1 {
		t.Errorf("Expected at least 1 branch, got %d", len(branches))
	}

	// Find current branch
	found := false
	for _, b := range branches {
		if b.IsCurrent {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected to find a current branch")
	}
}

// TestCreateBranch tests creating a new branch
func TestCreateBranch(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Create a new branch
	err = repo.CreateBranch("feature")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	// Verify branch exists
	branches, err := repo.ListBranches()
	if err != nil {
		t.Fatalf("ListBranches failed: %v", err)
	}

	found := false
	for _, b := range branches {
		if b.Name == "feature" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected to find 'feature' branch")
	}
}

// TestCheckout tests switching branches
func TestCheckout(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Create and checkout a new branch
	err = repo.CreateBranch("feature")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	err = repo.Checkout("feature")
	if err != nil {
		t.Fatalf("Checkout failed: %v", err)
	}

	// Verify we're on the new branch
	currentBranch, err := repo.CurrentBranch()
	if err != nil {
		t.Fatalf("CurrentBranch failed: %v", err)
	}

	if currentBranch != "feature" {
		t.Errorf("Expected current branch 'feature', got '%s'", currentBranch)
	}
}

// TestCheckoutCreate tests creating and switching to a new branch
func TestCheckoutCreate(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Create and checkout in one step
	err = repo.CheckoutCreate("new-feature")
	if err != nil {
		t.Fatalf("CheckoutCreate failed: %v", err)
	}

	// Verify we're on the new branch
	currentBranch, err := repo.CurrentBranch()
	if err != nil {
		t.Fatalf("CurrentBranch failed: %v", err)
	}

	if currentBranch != "new-feature" {
		t.Errorf("Expected current branch 'new-feature', got '%s'", currentBranch)
	}
}

// TestDeleteBranch tests deleting a branch
func TestDeleteBranch(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Create a new branch
	err = repo.CreateBranch("to-delete")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	// Delete the branch
	err = repo.DeleteBranch("to-delete")
	if err != nil {
		t.Fatalf("DeleteBranch failed: %v", err)
	}

	// Verify branch no longer exists
	branches, err := repo.ListBranches()
	if err != nil {
		t.Fatalf("ListBranches failed: %v", err)
	}

	for _, b := range branches {
		if b.Name == "to-delete" {
			t.Error("Branch 'to-delete' should have been deleted")
		}
	}
}

// TestDeleteCurrentBranchFails tests that deleting current branch fails
func TestDeleteCurrentBranchFails(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Try to delete current branch
	currentBranch, _ := repo.CurrentBranch()
	err = repo.DeleteBranch(currentBranch)
	if err == nil {
		t.Error("Expected error when deleting current branch, got nil")
	}
}

// TestRenameBranch tests renaming a branch
func TestRenameBranch(t *testing.T) {
	dir := tempDir(t)
	defer os.RemoveAll(dir)

	// Initialize repo with a commit
	repo, err := Init(dir)
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	err = repo.Stage([]string{"test.txt"})
	if err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	_, err = repo.Commit(CommitOptions{
		Message: "Initial commit",
	})
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Create a new branch
	err = repo.CreateBranch("old-name")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	// Rename the branch
	err = repo.RenameBranch("old-name", "new-name")
	if err != nil {
		t.Fatalf("RenameBranch failed: %v", err)
	}

	// Verify old name doesn't exist and new name does
	branches, err := repo.ListBranches()
	if err != nil {
		t.Fatalf("ListBranches failed: %v", err)
	}

	foundOld := false
	foundNew := false
	for _, b := range branches {
		if b.Name == "old-name" {
			foundOld = true
		}
		if b.Name == "new-name" {
			foundNew = true
		}
	}

	if foundOld {
		t.Error("Branch 'old-name' should not exist")
	}
	if !foundNew {
		t.Error("Branch 'new-name' should exist")
	}
}
