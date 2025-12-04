# Inkwell

**Write at the Speed of Thought**

A distraction-free markdown editor for coders, writers, and dreamers. Experience the flow of Digital Nature.

## Features

- **Digital Nature Theme** - Inspired by the intersection of biology and technology. Deep cyber blacks met with neon organic accents.
- **Markdown Native** - Write in pure markdown with live preview. Support for GFM, math, and code highlighting out of the box.
- **Distraction Free** - Minimalist interface that gets out of your way. Focus mode, typewriter scrolling, and clean typography.
- **Mermaid Diagrams** - Beautiful rendering of flowcharts, sequence diagrams, class diagrams, and more with modern styling.
- **Document Outline** - Navigate your documents easily with the headings outline in the sidebar.
- **Theme System** - Light and dark themes with smooth transitions and consistent styling throughout.
- **Real-time Sync** - Files sync automatically via WebSocket - edit externally and see changes instantly.

## Screenshots

The editor features a clean, modern interface with:
- File tree sidebar with document outline
- WYSIWYG markdown editing
- Text selection toolbar for quick formatting
- Sleek Mermaid diagram rendering

## Architecture

Inkwell is a local-first markdown IDE with a Go backend and TypeScript frontend:

- **Backend (Go)** - HTTP server with WebSocket support for real-time file synchronization
- **Frontend (TypeScript)** - Built with [Milkdown](https://milkdown.dev/), a plugin-driven WYSIWYG markdown editor

### Project Structure

```
inkwell/
├── cmd/inkwell/          # Main application entry point
│   ├── main.go           # Entry point, embeds web assets
│   └── web/              # Built frontend assets (embedded)
├── internal/
│   ├── config/           # Configuration management
│   ├── server/           # HTTP server, handlers, WebSocket hub
│   ├── filesystem/       # File operations, tree structure, watcher
│   └── recents/          # Recent locations persistence
├── frontend/             # TypeScript/Vite frontend
│   └── src/
│       ├── main.ts       # App entry point
│       ├── editor.ts     # Milkdown editor wrapper
│       ├── filetree.ts   # File tree component
│       ├── mermaid-renderer.ts  # Mermaid diagram rendering
│       ├── api.ts        # API client
│       ├── websocket.ts  # WebSocket client
│       └── styles/       # CSS styles
└── build/                # Compiled binaries
```

## Getting Started

### Prerequisites

- Go 1.21+
- Node.js & npm

### Build

```bash
# Build everything (frontend + backend)
make build

# Or build components separately
make frontend    # Build TypeScript frontend
make build-go    # Build Go binary only
```

### Run

```bash
# Run in current directory
make run

# Run with demo content
make run-demo

# Or run directly
./build/inkwell <directory>
```

### Development

```bash
# Frontend development server
cd frontend && npm run dev

# Backend with auto-reload (requires air)
make dev
```

## Commands

| Command | Description |
|---------|-------------|
| `make build` | Build the full application |
| `make run` | Build and run in current directory |
| `make run-demo` | Run with demo markdown files |
| `make test` | Run tests with race detection |
| `make test-coverage` | Run tests with coverage report |
| `make dev` | Development mode with auto-reload |
| `make fmt` | Format Go code |
| `make lint` | Run linter (requires golangci-lint) |
| `make clean` | Remove build artifacts |
| `make help` | Show all available commands |

## Cross-Platform Builds

```bash
make build-linux    # Linux amd64/arm64
make build-darwin   # macOS amd64/arm64
make build-windows  # Windows amd64
make build-all      # All platforms
```

## Dependencies

### Go
- `gorilla/mux` - HTTP router
- `gorilla/websocket` - WebSocket support
- `fsnotify` - File system notifications
- `pkg/browser` - Open browser automatically

### Frontend
- `@milkdown/*` - WYSIWYG markdown editor framework
- `mermaid` - Diagram and flowchart rendering
- `vite` - Build tool
- `typescript` - Type safety

## License

Crafted for the modern writer.