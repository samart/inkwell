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
│       ├── filetree.ts   # File tree component
│       ├── api.ts        # API client
│       ├── websocket.ts  # WebSocket client
│       └── styles/main.css
└── build/                # Compiled binaries
```

## Key Features
- WYSIWYG markdown editing with Milkdown
- File tree sidebar with document outline (headings)
- Text selection toolbar (bold, italic, headings, etc.)
- Dark/light theme support
- Recent locations persistence (~/.inkwell/recents.json)
- WebSocket for real-time file watching
- Image upload and embedding
