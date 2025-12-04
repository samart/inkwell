# Suggested Commands

## Build Commands

```bash
# Build everything (frontend + backend)
make build

# Build frontend only
make frontend
cd frontend && npm run build

# Build Go binary only (skip frontend)
make build-go

# Download/tidy Go dependencies
make deps
```

## Run Commands

```bash
# Run the application (builds first)
make run

# Run with demo content
make run-demo

# Run directly after building
./build/inkwell <directory>

# Frontend development server (hot reload)
cd frontend && npm run dev

# Backend with auto-reload (requires air)
make dev
```

## Testing Commands

```bash
# Run all Go tests with race detection
make test

# Run tests with coverage report
make test-coverage

# Run benchmarks
make bench
```

## Code Quality

```bash
# Format Go code
make fmt

# Run linter (requires golangci-lint)
make lint
```

## Cross-Platform Builds

```bash
make build-linux    # Linux amd64/arm64
make build-darwin   # macOS amd64/arm64
make build-windows  # Windows amd64
make build-all      # All platforms
```

## Cleanup

```bash
# Remove build artifacts
make clean
```

## System Commands (Darwin/macOS)
- `ls`, `cd`, `grep`, `find` - Standard Unix commands
- `git` - Version control
- `npm` - Node package manager (frontend)
- `go` - Go toolchain (backend)
