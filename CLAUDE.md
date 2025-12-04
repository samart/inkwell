## Issue Tracking with bd (Beads)

This project uses **bd (beads)** for persistent task tracking across sessions.

### Why bd?

Your memory resets when sessions end or context compacts. bd stores work items in `.beads/issues.jsonl` (git-tracked), so you can resume exactly where you left off.

### Essential Commands

```bash
# Find work
bd ready --json                    # What's ready to work on?
bd list --status in_progress       # What's already claimed?

# Create issues
bd create "Title" --description="Details" -t bug|feature|task -p 0-4 --json

# Work on issues
bd update <id> --status in_progress
bd update <id> --notes "COMPLETED: X\nIN PROGRESS: Y\nNEXT: Z"
bd close <id> --reason "Done"

# End of session (CRITICAL)
bd sync