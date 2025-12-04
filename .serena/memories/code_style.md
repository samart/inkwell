# Code Style and Conventions

## Go Backend

### Naming
- Package names: lowercase, single word (e.g., `server`, `filesystem`, `config`)
- Exported types/functions: PascalCase (e.g., `Server`, `FileSystem`, `NewWatcher`)
- Unexported: camelCase (e.g., `handleGetTree`, `writeJSON`)

### Structure
- Each package in `internal/` has its own directory
- Test files named `*_test.go` alongside source files
- Main entry point in `cmd/inkwell/main.go`

### Error Handling
- Return errors, don't panic
- Wrap errors with context using `fmt.Errorf("context: %w", err)`

### HTTP Handlers
- Use gorilla/mux for routing
- JSON responses via `writeJSON()` helper
- Error responses via `writeError()` helper
- Response format: `{"success": bool, "data": ..., "error": "..."}`

## TypeScript Frontend

### Naming
- Classes: PascalCase (e.g., `InkwellApp`, `MarkdownEditor`, `FileTree`, `MermaidRenderer`)
- Functions/methods: camelCase (e.g., `openFile`, `handleEditorChange`, `renderDiagrams`)
- Interfaces: PascalCase (e.g., `FileNode`, `Tab`, `RecentLocation`)

### File Organization
- One main class per file
- Styles in `src/styles/main.css`
- Entry point in `src/main.ts`

### CSS
- CSS custom properties for theming (e.g., `--bg-app`, `--text-main`, `--accent-primary`)
- Light theme is default, dark theme via `body.dark` class or `[data-theme^="dark"]`
- BEM-ish naming for classes (e.g., `.file-tree`, `.file-tree-item`, `.mermaid-diagram-wrapper`)
- Use `!important` sparingly, mainly for Milkdown overrides
- Modern effects: gradients, layered box-shadows, backdrop-filter for glassmorphism
- Smooth transitions for interactive elements (0.2s-0.3s ease)

### Imports
- ES modules (`import`/`export`)
- Type-only imports when appropriate

## Mermaid Theming Pattern

When configuring Mermaid themes, use the `base` theme with custom `themeVariables`:

```typescript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#1e293b',
    // ... comprehensive color definitions
  }
});
```

This provides granular control over all diagram element colors.

## General

### No Type Annotations Unless Needed
- TypeScript infers types well; add annotations for complex cases

### Comments
- Minimal comments; prefer self-documenting code
- Go: doc comments on exported symbols
- TypeScript: JSDoc only when beneficial

### Theme Support
- Always test UI changes in both light and dark themes
- Use CSS custom properties for theme-aware colors
- Mermaid diagrams have separate light/dark theme configurations
