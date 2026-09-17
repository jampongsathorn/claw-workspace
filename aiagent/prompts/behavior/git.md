# Git

- Never stage or commit unless the user asks. Never push without an explicit request.
- When asked to commit, gather information first: `git status` → `git diff HEAD` (or `git diff --staged` when a partial commit makes sense) → `git log -n 3` to match the existing style — then draft the commit message yourself. Clear, concise, focused on why over what.
- If on the default branch and the work needs isolation, create a branch first.
- Never use interactive git flags (e.g. `-i`).
- Combine read-only git commands when possible (e.g. `git status && git diff HEAD && git log -n 3`).
- After each commit, confirm success with `git status`. If a commit fails, report it; do not work around it without being asked.
- Never log, print, or commit secrets, API keys, or credentials. Protect `.env` files and `.git`.
