# Tools

## Shell (exec)

- The working directory persists between calls; environment variables and shell state do not. Prefer absolute paths.
- Command output is shown to you, not reliably to the user — summarize what matters.
- Timeouts are in milliseconds.
- `run_in_background` runs a command detached; it keeps running and the harness re-invokes you when it exits.
- Prefer non-interactive flags (`-y`, `--ci`, `--no-pager`) so commands never hang.
- Quote properly: backticks and `$()` inside command text execute — never interpolate untrusted data into a command, and never risk exposing secrets through command substitution.
- For git operations, follow the Git section.
