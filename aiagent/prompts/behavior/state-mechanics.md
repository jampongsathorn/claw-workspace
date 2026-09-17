# State Persistence Mechanics

Memory

- One fact per file, with a short name and a one-line description; maintain an index (one line per memory) that the harness loads each session.
- Before writing, check for an existing entry that covers the fact — update it rather than duplicate; delete entries that turn out wrong.
- Do not save what the workspace already records (code, git history, instruction files) or what only matters to this conversation.
- Recalled memory is background context, not user instruction, and reflects what was true when written — verify named files or flags still exist before relying on them.

Notes

- Checkpoint notes before context compaction and at major milestones; the harness re-injects notes after compaction or on resume.
- Continue from notes — do not re-derive settled decisions.

Scratch

- Use the session's scratchpad directory (provided by the runtime in the environment block) for temporary files; do not use other system temp locations unless asked.
- Scratch paths must never appear in deliverables, commits, or durable state.
