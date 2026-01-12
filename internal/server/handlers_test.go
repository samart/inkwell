package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"inkwell/internal/config"
	"inkwell/internal/filesystem"
)

// testServer creates a minimal server for testing handlers
func newTestServer(t *testing.T) (*Server, string) {
	t.Helper()

	// Create temp directory for tests
	tmpDir, err := os.MkdirTemp("", "inkwell-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	cfg := &config.Config{
		RootDir: tmpDir,
	}

	fs := filesystem.New(tmpDir)

	return &Server{
		config: cfg,
		fs:     fs,
	}, tmpDir
}

func TestHandleGetFile(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name           string
		setup          func() // Setup function to create test files
		queryPath      string
		expectedStatus int
		expectedError  string
		checkResponse  func(*testing.T, map[string]interface{})
	}{
		{
			name: "get existing file",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "test.md"), []byte("# Hello World"), 0644)
			},
			queryPath:      "test.md",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, data map[string]interface{}) {
				if data["path"] != "test.md" {
					t.Errorf("Expected path 'test.md', got %v", data["path"])
				}
				if data["content"] != "# Hello World" {
					t.Errorf("Expected content '# Hello World', got %v", data["content"])
				}
			},
		},
		{
			name:           "missing path parameter",
			setup:          func() {},
			queryPath:      "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Path parameter is required",
		},
		{
			name:           "non-existent file",
			setup:          func() {},
			queryPath:      "nonexistent.md",
			expectedStatus: http.StatusNotFound,
			expectedError:  "Failed to read file",
		},
		{
			name: "file in subdirectory",
			setup: func() {
				os.MkdirAll(filepath.Join(tmpDir, "subdir"), 0755)
				os.WriteFile(filepath.Join(tmpDir, "subdir", "nested.md"), []byte("Nested content"), 0644)
			},
			queryPath:      "subdir/nested.md",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, data map[string]interface{}) {
				if data["content"] != "Nested content" {
					t.Errorf("Expected 'Nested content', got %v", data["content"])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			url := "/api/files"
			if tt.queryPath != "" {
				url += "?path=" + tt.queryPath
			}

			req := httptest.NewRequest(http.MethodGet, url, nil)
			w := httptest.NewRecorder()

			s.handleGetFile(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var apiResp APIResponse
			if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
				t.Fatalf("Failed to decode response: %v", err)
			}

			if tt.expectedError != "" {
				if !strings.Contains(apiResp.Error, tt.expectedError) {
					t.Errorf("Expected error containing '%s', got '%s'", tt.expectedError, apiResp.Error)
				}
			}

			if tt.checkResponse != nil && apiResp.Data != nil {
				data, ok := apiResp.Data.(map[string]interface{})
				if !ok {
					t.Fatalf("Expected map response data")
				}
				tt.checkResponse(t, data)
			}
		})
	}
}

func TestHandleCreateFile(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name           string
		requestBody    FileRequest
		expectedStatus int
		expectedError  string
		checkFile      func(*testing.T)
	}{
		{
			name: "create new file",
			requestBody: FileRequest{
				Path:    "newfile.md",
				Content: "# New File",
			},
			expectedStatus: http.StatusCreated,
			checkFile: func(t *testing.T) {
				content, err := os.ReadFile(filepath.Join(tmpDir, "newfile.md"))
				if err != nil {
					t.Fatalf("File should exist: %v", err)
				}
				if string(content) != "# New File" {
					t.Errorf("Content mismatch: got %s", content)
				}
			},
		},
		{
			name: "create file without .md extension adds it",
			requestBody: FileRequest{
				Path:    "noextension",
				Content: "Content",
			},
			expectedStatus: http.StatusCreated,
			checkFile: func(t *testing.T) {
				_, err := os.Stat(filepath.Join(tmpDir, "noextension.md"))
				if err != nil {
					t.Errorf("File noextension.md should exist: %v", err)
				}
			},
		},
		{
			name: "create file in subdirectory",
			requestBody: FileRequest{
				Path:    "sub/dir/file.md",
				Content: "Nested",
			},
			expectedStatus: http.StatusCreated,
			checkFile: func(t *testing.T) {
				content, err := os.ReadFile(filepath.Join(tmpDir, "sub/dir/file.md"))
				if err != nil {
					t.Fatalf("File should exist: %v", err)
				}
				if string(content) != "Nested" {
					t.Errorf("Content mismatch")
				}
			},
		},
		{
			name: "missing path",
			requestBody: FileRequest{
				Path:    "",
				Content: "Content",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Path is required",
		},
		{
			name: "create duplicate file fails",
			requestBody: FileRequest{
				Path:    "duplicate.md",
				Content: "First",
			},
			expectedStatus: http.StatusCreated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest(http.MethodPost, "/api/files", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			s.handleCreateFile(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				bodyBytes, _ := io.ReadAll(resp.Body)
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, bodyBytes)
			}

			if tt.checkFile != nil {
				tt.checkFile(t)
			}
		})
	}

	// Test that creating a duplicate file fails
	t.Run("create duplicate file fails", func(t *testing.T) {
		// First create a file
		os.WriteFile(filepath.Join(tmpDir, "exists.md"), []byte("original"), 0644)

		body, _ := json.Marshal(FileRequest{Path: "exists.md", Content: "new content"})
		req := httptest.NewRequest(http.MethodPost, "/api/files", bytes.NewReader(body))
		w := httptest.NewRecorder()

		s.handleCreateFile(w, req)

		if w.Code != http.StatusConflict {
			t.Errorf("Expected 409 Conflict for duplicate file, got %d", w.Code)
		}

		// Verify original content unchanged
		content, _ := os.ReadFile(filepath.Join(tmpDir, "exists.md"))
		if string(content) != "original" {
			t.Errorf("Original file should not be modified")
		}
	})
}

func TestHandleUpdateFile(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name           string
		setup          func()
		requestBody    FileRequest
		queryPath      string // Path from query parameter (takes precedence)
		expectedStatus int
		expectedError  string
		checkFile      func(*testing.T)
	}{
		{
			name: "update existing file via body path",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "update.md"), []byte("old content"), 0644)
			},
			requestBody: FileRequest{
				Path:    "update.md",
				Content: "new content",
			},
			expectedStatus: http.StatusOK,
			checkFile: func(t *testing.T) {
				content, _ := os.ReadFile(filepath.Join(tmpDir, "update.md"))
				if string(content) != "new content" {
					t.Errorf("Expected 'new content', got '%s'", content)
				}
			},
		},
		{
			name: "update file via query path",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "query.md"), []byte("old"), 0644)
			},
			requestBody: FileRequest{
				Content: "updated via query",
			},
			queryPath:      "query.md",
			expectedStatus: http.StatusOK,
			checkFile: func(t *testing.T) {
				content, _ := os.ReadFile(filepath.Join(tmpDir, "query.md"))
				if string(content) != "updated via query" {
					t.Errorf("Content mismatch")
				}
			},
		},
		{
			name: "query path takes precedence over body path",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "target.md"), []byte("target"), 0644)
				os.WriteFile(filepath.Join(tmpDir, "other.md"), []byte("other"), 0644)
			},
			requestBody: FileRequest{
				Path:    "other.md",
				Content: "should go to target",
			},
			queryPath:      "target.md",
			expectedStatus: http.StatusOK,
			checkFile: func(t *testing.T) {
				content, _ := os.ReadFile(filepath.Join(tmpDir, "target.md"))
				if string(content) != "should go to target" {
					t.Errorf("Query path should take precedence")
				}
				// other.md should remain unchanged
				other, _ := os.ReadFile(filepath.Join(tmpDir, "other.md"))
				if string(other) != "other" {
					t.Errorf("other.md should not be modified")
				}
			},
		},
		{
			name:  "missing path",
			setup: func() {},
			requestBody: FileRequest{
				Content: "no path",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Path is required",
		},
		{
			name: "create file if not exists (WriteFile creates)",
			setup: func() {
				// Don't create the file
			},
			requestBody: FileRequest{
				Path:    "autocreate.md",
				Content: "auto created",
			},
			expectedStatus: http.StatusOK,
			checkFile: func(t *testing.T) {
				content, err := os.ReadFile(filepath.Join(tmpDir, "autocreate.md"))
				if err != nil {
					t.Fatalf("File should be auto-created: %v", err)
				}
				if string(content) != "auto created" {
					t.Errorf("Content mismatch")
				}
			},
		},
		{
			name: "empty content is allowed",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "toempty.md"), []byte("has content"), 0644)
			},
			requestBody: FileRequest{
				Path:    "toempty.md",
				Content: "",
			},
			expectedStatus: http.StatusOK,
			checkFile: func(t *testing.T) {
				content, _ := os.ReadFile(filepath.Join(tmpDir, "toempty.md"))
				if string(content) != "" {
					t.Errorf("File should be empty, got '%s'", content)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			body, _ := json.Marshal(tt.requestBody)
			url := "/api/files"
			if tt.queryPath != "" {
				url += "?path=" + tt.queryPath
			}

			req := httptest.NewRequest(http.MethodPut, url, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			s.handleUpdateFile(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				bodyBytes, _ := io.ReadAll(resp.Body)
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, bodyBytes)
			}

			if tt.checkFile != nil {
				tt.checkFile(t)
			}
		})
	}
}

func TestHandleDeleteFile(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name           string
		setup          func()
		queryPath      string
		expectedStatus int
		expectedError  string
		checkDeleted   func(*testing.T)
	}{
		{
			name: "delete existing file",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "todelete.md"), []byte("content"), 0644)
			},
			queryPath:      "todelete.md",
			expectedStatus: http.StatusOK,
			checkDeleted: func(t *testing.T) {
				_, err := os.Stat(filepath.Join(tmpDir, "todelete.md"))
				if !os.IsNotExist(err) {
					t.Errorf("File should be deleted")
				}
			},
		},
		{
			name:           "missing path parameter",
			setup:          func() {},
			queryPath:      "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Path parameter is required",
		},
		{
			name:           "delete non-existent file",
			setup:          func() {},
			queryPath:      "nonexistent.md",
			expectedStatus: http.StatusInternalServerError,
			expectedError:  "Failed to delete file",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			url := "/api/files"
			if tt.queryPath != "" {
				url += "?path=" + tt.queryPath
			}

			req := httptest.NewRequest(http.MethodDelete, url, nil)
			w := httptest.NewRecorder()

			s.handleDeleteFile(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			if tt.checkDeleted != nil {
				tt.checkDeleted(t)
			}
		})
	}
}

func TestHandleGetFileMetadata(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	// Create test file
	testContent := "Test content for metadata"
	os.WriteFile(filepath.Join(tmpDir, "metadata.md"), []byte(testContent), 0644)
	os.MkdirAll(filepath.Join(tmpDir, "testdir"), 0755)

	tests := []struct {
		name           string
		queryPath      string
		expectedStatus int
		expectedError  string
		checkResponse  func(*testing.T, map[string]interface{})
	}{
		{
			name:           "get file metadata",
			queryPath:      "metadata.md",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, data map[string]interface{}) {
				if data["path"] != "metadata.md" {
					t.Errorf("Expected path 'metadata.md', got %v", data["path"])
				}
				size, ok := data["size"].(float64)
				if !ok || size != float64(len(testContent)) {
					t.Errorf("Expected size %d, got %v", len(testContent), data["size"])
				}
				if data["isDir"] != false {
					t.Errorf("Expected isDir=false")
				}
			},
		},
		{
			name:           "get directory metadata",
			queryPath:      "testdir",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, data map[string]interface{}) {
				if data["isDir"] != true {
					t.Errorf("Expected isDir=true for directory")
				}
			},
		},
		{
			name:           "missing path",
			queryPath:      "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Path parameter is required",
		},
		{
			name:           "non-existent file",
			queryPath:      "nonexistent.md",
			expectedStatus: http.StatusNotFound,
			expectedError:  "File not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/api/files/metadata"
			if tt.queryPath != "" {
				url += "?path=" + tt.queryPath
			}

			req := httptest.NewRequest(http.MethodGet, url, nil)
			w := httptest.NewRecorder()

			s.handleGetFileMetadata(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var apiResp APIResponse
			json.NewDecoder(resp.Body).Decode(&apiResp)

			if tt.expectedError != "" && !strings.Contains(apiResp.Error, tt.expectedError) {
				t.Errorf("Expected error '%s', got '%s'", tt.expectedError, apiResp.Error)
			}

			if tt.checkResponse != nil && apiResp.Data != nil {
				data, ok := apiResp.Data.(map[string]interface{})
				if !ok {
					t.Fatalf("Expected map response data")
				}
				tt.checkResponse(t, data)
			}
		})
	}
}

func TestHandleUpdateFile_InvalidJSON(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	req := httptest.NewRequest(http.MethodPut, "/api/files", strings.NewReader("not json"))
	w := httptest.NewRecorder()

	s.handleUpdateFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid JSON, got %d", w.Code)
	}

	var apiResp APIResponse
	json.NewDecoder(w.Body).Decode(&apiResp)
	if !strings.Contains(apiResp.Error, "Invalid request body") {
		t.Errorf("Expected 'Invalid request body' error, got '%s'", apiResp.Error)
	}
}

func TestHandleCreateFile_InvalidJSON(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	req := httptest.NewRequest(http.MethodPost, "/api/files", strings.NewReader("{invalid}"))
	w := httptest.NewRecorder()

	s.handleCreateFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid JSON, got %d", w.Code)
	}
}

// TestWriteJSON verifies JSON response formatting
func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()

	data := APIResponse{
		Success: true,
		Data:    map[string]string{"test": "value"},
	}

	writeJSON(w, http.StatusOK, data)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.Header.Get("Content-Type") != "application/json" {
		t.Errorf("Expected Content-Type application/json")
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var decoded APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		t.Fatalf("Failed to decode: %v", err)
	}

	if !decoded.Success {
		t.Errorf("Expected success=true")
	}
}

// TestWriteError verifies error response formatting
func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()

	writeError(w, http.StatusNotFound, "Not found")

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", resp.StatusCode)
	}

	var apiResp APIResponse
	json.NewDecoder(resp.Body).Decode(&apiResp)

	if apiResp.Success {
		t.Errorf("Expected success=false for error")
	}

	if apiResp.Error != "Not found" {
		t.Errorf("Expected error 'Not found', got '%s'", apiResp.Error)
	}
}

// TestConcurrentFileOperations tests concurrent file updates
func TestConcurrentFileOperations(t *testing.T) {
	s, tmpDir := newTestServer(t)
	defer os.RemoveAll(tmpDir)

	// Create initial file
	os.WriteFile(filepath.Join(tmpDir, "concurrent.md"), []byte("initial"), 0644)

	// Run multiple concurrent updates
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func(n int) {
			body, _ := json.Marshal(FileRequest{
				Path:    "concurrent.md",
				Content: "content " + string(rune('0'+n)),
			})
			req := httptest.NewRequest(http.MethodPut, "/api/files", bytes.NewReader(body))
			w := httptest.NewRecorder()
			s.handleUpdateFile(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Concurrent update %d failed with status %d", n, w.Code)
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify file exists and has valid content
	content, err := os.ReadFile(filepath.Join(tmpDir, "concurrent.md"))
	if err != nil {
		t.Fatalf("File should exist after concurrent updates: %v", err)
	}
	if len(content) == 0 {
		t.Errorf("File should have content")
	}
}