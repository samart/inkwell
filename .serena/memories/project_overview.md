# Inkwell - Project Overview

## Purpose
Inkwell is a local-first, distraction-free markdown editor/IDE. It provides a WYSIWYG editing experience for markdown files with real-time file synchronization.

## Tech Stack

### Backend (Go 1.21+)
- **Framework**: gorilla/mux (HTTP router), gorilla/websocket
- **File watching**: fsnotify
- **Browser opening**: pkg/browser
- **Module**: `inkwell`

### Frontend (TypeScript)
- **Build tool**: Vite 5.x
- **Editor framework**: Milkdown 7.x (plugin-driven WYSIWYG markdown editor)
- **Diagram rendering**: Mermaid.js (flowcharts, sequence diagrams, etc.)
- **Language**: TypeScript 5.x

## Project Structure
```
inkwell/
├── cmd/inkwell/          # Main Go application entry point
│   ├── main.go           # Entry point, embeds web assets
│   └── web/              # Built frontend assets (embedded)
├── internal/
│   ├── config/           # Configuration management
│   ├── server/           # HTTP server, handlers, WebSocket hub
│   ├── filesystem/       # File operations, tree, watcher
│   └── recents/          # Recent locations persistence
├── frontend/             # TypeScript/Vite frontend source
│   └── src/
│       ├── main.ts       # App entry point
│       ├── editor.ts     # Milkdown editor wrapper
│       ├── filetree.ts   # File tree component with document outline
│       ├── mermaid-renderer.ts  # Mermaid diagram rendering with theming
│       ├── api.ts        # API client
│       ├── websocket.ts  # WebSocket client
│       └── styles/main.css  # All CSS styles including theme variables
└── build/                # Compiled binaries
```

## Key Features
- WYSIWYG markdown editing with Milkdown
- File tree sidebar with document outline (headings navigation)
- Text selection toolbar (bold, italic, headings, etc.)
- Dark/light theme support with smooth transitions
- Recent locations persistence (~/.inkwell/recents.json)
- WebSocket for real-time file watching
- Image upload and embedding
- **Mermaid diagram rendering** with modern, sleek styling:
  - Supports flowcharts, sequence, class, state, gantt, ER diagrams, and more
  - Custom theming with gradient backgrounds and glassmorphism effects
  - Zoom controls and fullscreen mode for diagrams
  - Theme-aware colors (light/dark mode support)

## Key Files for Features

### Theming
- `frontend/src/styles/main.css` - CSS custom properties for themes (`--bg-app`, `--text-main`, etc.)
- Theme toggle in header, persisted to localStorage

### Mermaid Diagrams
- `frontend/src/mermaid-renderer.ts` - MermaidRenderer class
  - `updateMermaidTheme()` - Configures Mermaid with custom themeVariables
  - `renderDiagrams()` - Finds and renders mermaid code blocks
- CSS styles in `main.css` (lines ~1866-2108) for diagram wrapper styling

### File Tree & Outline
- `frontend/src/filetree.ts` - FileTree class with document outline support
- Outline shows headings (H1-H6) with click-to-navigate functionality
