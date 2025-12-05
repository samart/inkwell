# Git Integration for Inkwell

## Overview

Add Git integration to Inkwell for:
1. **Local history** - Track changes to local markdown files via git
2. **Remote repos** - Clone git repos, edit markdown, commit and push back
3. **Source selection** - UI to choose between local directories and git repo URLs

## User Requirements

- Clone remote repos to `~/.inkwell/repos/`
- Full git operations: commit, push, pull, history, diff, branch switching, merge conflicts
- Support both SSH and HTTPS authentication (auto-detect from URL)
- Paste git repo URL in UI to clone and open

## Architecture

### New Backend Package: `internal/git/`

```
internal/git/
├── manager.go      # GitManager - main entry point
├── repository.go   # Repository wrapper around go-git
├── auth.go         # SSH/HTTPS authentication
├── clone.go        # Clone with progress tracking
├── operations.go   # commit, push, pull, fetch
├── branch.go       # Branch operations
├── diff.go         # Diff generation
├── history.go      # Commit log
└── conflicts.go    # Merge conflict handling
```

### New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/git/clone` | Clone repo (returns path) |
| `GET` | `/api/git/status` | Current status, branch, files |
| `POST` | `/api/git/init` | Init git in current dir |
| `GET` | `/api/git/branches` | List branches |
| `POST` | `/api/git/checkout` | Switch branch |
| `GET` | `/api/git/history` | Commit log (paginated) |
| `GET` | `/api/git/diff?path=X` | File diff |
| `POST` | `/api/git/stage` | Stage files |
| `POST` | `/api/git/unstage` | Unstage files |
| `POST` | `/api/git/commit` | Create commit |
| `POST` | `/api/git/push` | Push to remote |
| `POST` | `/api/git/pull` | Pull from remote |
| `GET` | `/api/git/conflicts` | List conflicts |
| `POST` | `/api/git/resolve` | Resolve conflict |

### Frontend Components

```
frontend/src/
├── git-status.ts    # Branch indicator in header
├── git-panel.ts     # Sidebar for git ops (changes/history/branches tabs)
├── git-clone.ts     # Clone dialog with URL input + auth
└── git-conflicts.ts # Merge conflict resolution UI
```

### Key Types

**Backend (Go):**
```go
type GitStatus struct {
    Branch       string       `json:"branch"`
    Ahead        int          `json:"ahead"`
    Behind       int          `json:"behind"`
    Files        []FileStatus `json:"files"`
    HasConflicts bool         `json:"hasConflicts"`
}

type FileStatus struct {
    Path   string `json:"path"`
    Status string `json:"status"` // modified, added, deleted, untracked, conflicted
    Staged bool   `json:"staged"`
}
```

**Frontend (TypeScript):**
```typescript
interface CloneRequest {
  url: string;
  sshKeyPath?: string;
  username?: string;
  password?: string;
}
```

### Extend Existing Types

**`internal/recents/recents.go`** - Location struct:
```go
type Location struct {
    Path       string    `json:"path"`
    Name       string    `json:"name"`
    LastOpened time.Time `json:"lastOpened"`
    Type       string    `json:"type"`     // "local" or "git"
    RemoteURL  string    `json:"remoteUrl,omitempty"`
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `go.mod` | Add `github.com/go-git/go-git/v5` |
| `internal/server/server.go` | Add GitManager, git routes |
| `internal/server/handlers.go` | Add git handler functions |
| `internal/recents/recents.go` | Extend Location type |
| `frontend/src/api.ts` | Add git API methods |
| `frontend/src/main.ts` | Integrate git components |
| `frontend/src/filetree.ts` | Add git status icons |
| `frontend/src/styles/main.css` | Git UI styles |

## Files to Create

| File | Purpose |
|------|---------|
| `internal/git/manager.go` | GitManager struct, init/detection |
| `internal/git/repository.go` | Repository wrapper |
| `internal/git/auth.go` | SSH/HTTPS auth handling |
| `internal/git/clone.go` | Clone operations |
| `internal/git/operations.go` | commit/push/pull/fetch |
| `internal/git/branch.go` | Branch CRUD |
| `internal/git/diff.go` | Diff generation |
| `internal/git/history.go` | Commit log retrieval |
| `internal/git/conflicts.go` | Conflict detection/resolution |
| `frontend/src/git-status.ts` | Header status component |
| `frontend/src/git-panel.ts` | Git operations sidebar |
| `frontend/src/git-clone.ts` | Clone dialog |
| `frontend/src/git-conflicts.ts` | Conflict resolver UI |

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add go-git dependency
2. Create `internal/git/manager.go` with repo detection
3. Create `internal/git/repository.go` with status
4. Add `/api/git/status` endpoint
5. Add basic frontend status display

### Phase 2: Clone & Auth
1. Implement SSH key loading (`~/.ssh/id_rsa`, `id_ed25519`)
2. Implement HTTPS auth with username/password
3. Auto-detect auth type from URL
4. Create clone dialog UI
5. Add `/api/git/clone` endpoint
6. Store cloned repos in `~/.inkwell/repos/`

### Phase 3: Basic Operations
1. Implement stage/unstage
2. Implement commit
3. Create git panel UI with changes view
4. Add file status icons to file tree
5. WebSocket events for status updates

### Phase 4: Push/Pull/Branches
1. Implement push with auth
2. Implement pull with merge
3. Implement branch list/create/switch/delete
4. Add branches tab to git panel

### Phase 5: History & Diff
1. Implement commit history (paginated)
2. Implement diff generation
3. Create history tab
4. Create diff viewer component

### Phase 6: Conflicts
1. Detect merge conflicts
2. Parse conflict markers
3. Create 3-way merge UI
4. Implement resolution strategies

## Authentication Flow

```
User pastes URL → Detect auth type from URL
├── git@... or ssh:// → SSH
│   └── Try keys: ~/.ssh/id_ed25519, ~/.ssh/id_rsa
│       └── If passphrase needed → Prompt user
└── https://... → HTTPS
    └── Prompt for username + password/token
```

## Error Handling

- **Auth failures**: Clear message, retry option
- **Network errors**: Offline indicator, queue ops
- **Merge conflicts**: Block commits, show resolver
- **Large repos**: Shallow clone option, pagination

## Config Additions

```go
type GitConfig struct {
    ReposDir   string `json:"reposDir"`   // ~/.inkwell/repos/
    SSHKeyPath string `json:"sshKeyPath"` // Optional override
}
```
