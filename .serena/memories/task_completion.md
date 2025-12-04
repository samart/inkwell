# Task Completion Checklist

When a task is completed, perform the following steps:

## 1. Build Verification

```bash
# Build frontend
cd frontend && npm run build

# Build Go backend
make build-go
# OR
go build -o build/inkwell ./cmd/inkwell
```

## 2. Run Tests (if applicable)

```bash
# Run Go tests
make test
# OR
go test -v -race ./...
```

## 3. Verify Changes Work

```bash
# Run the application
./build/inkwell <test-directory>
```

## 4. Code Quality (optional but recommended)

```bash
# Format Go code
make fmt

# Lint (if golangci-lint installed)
make lint
```

## 5. Git (if requested)

```bash
git status
git add <files>
git commit -m "Description of changes"
```

## Notes

- Frontend changes require `npm run build` before they're embedded in the Go binary
- The `make build` command does both frontend and backend builds
- For quick Go-only changes, use `make build-go`
- Always test UI changes in both light and dark themes
