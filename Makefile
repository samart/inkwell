# Inkwell - Local Markdown IDE
# Makefile for building, testing, and running

.PHONY: all build build-go frontend run test clean install dev help

# Binary name
BINARY_NAME=inkwell
BUILD_DIR=build

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
GOFMT=$(GOCMD) fmt

# Build flags
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS=-ldflags "-X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)"

# Default target
all: build

## frontend: Build the TypeScript frontend
frontend:
	@echo "Building frontend..."
	@cd frontend && npm install && npm run build

## help: Show this help message
help:
	@echo "Inkwell - Local Markdown IDE"
	@echo ""
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Targets:"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed -e 's/^/ /'

## build: Build the binary (including frontend)
build: frontend deps
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/inkwell

## build-go: Build only the Go binary (skip frontend)
build-go: deps
	@echo "Building $(BINARY_NAME) (Go only)..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/inkwell

## run: Run the application (in current directory)
run: build
	@echo "Starting Inkwell..."
	./$(BUILD_DIR)/$(BINARY_NAME) .

## run-demo: Run with a demo directory
run-demo: build
	@mkdir -p demo
	@echo "# Welcome to Inkwell\n\nA beautiful markdown editor.\n\n## Features\n\n- WYSIWYG editing\n- Drag & drop images\n- Dark/light themes" > demo/welcome.md
	@echo "# Notes\n\nYour notes here..." > demo/notes.md
	./$(BUILD_DIR)/$(BINARY_NAME) demo

## dev: Run in development mode with auto-reload (requires air)
dev:
	@which air > /dev/null || (echo "Installing air..." && go install github.com/air-verse/air@latest)
	air

## test: Run tests
test:
	@echo "Running tests..."
	$(GOTEST) -v -race -cover ./...

## test-coverage: Run tests with coverage report
test-coverage:
	@echo "Running tests with coverage..."
	$(GOTEST) -v -race -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

## bench: Run benchmarks
bench:
	$(GOTEST) -bench=. -benchmem ./...

## deps: Download dependencies
deps:
	@echo "Downloading dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

## fmt: Format code
fmt:
	@echo "Formatting code..."
	$(GOFMT) ./...

## lint: Run linter (requires golangci-lint)
lint:
	@which golangci-lint > /dev/null || (echo "Installing golangci-lint..." && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	golangci-lint run

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -f coverage.out coverage.html
	@rm -rf demo

## install: Install binary to $GOPATH/bin
install: build
	@echo "Installing $(BINARY_NAME)..."
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(GOPATH)/bin/

## uninstall: Remove binary from $GOPATH/bin
uninstall:
	@echo "Uninstalling $(BINARY_NAME)..."
	@rm -f $(GOPATH)/bin/$(BINARY_NAME)

# Cross-compilation targets
## build-all: Build for all platforms
build-all: build-linux build-darwin build-windows

## build-linux: Build for Linux
build-linux: deps
	@echo "Building for Linux..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/inkwell
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/inkwell

## build-darwin: Build for macOS
build-darwin: deps
	@echo "Building for macOS..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/inkwell
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 ./cmd/inkwell

## build-windows: Build for Windows
build-windows: deps
	@echo "Building for Windows..."
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe ./cmd/inkwell
