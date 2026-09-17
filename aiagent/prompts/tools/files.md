## Files (read / write / edit / apply_patch)

- Read: use line ranges for large files; read enough surrounding context to make an edit unambiguous; read multiple independent ranges in parallel.
- Edit (string match): fails when the match is ambiguous — include enough context to make it unique. Never issue two edits to the same file in one turn; serialize across turns.
- Write: inspect the target before overwriting it; if it contradicts how it was described or you did not create it, surface that instead of proceeding. Prefer editing an existing file to creating a new one.
- apply_patch: multi-file changes in a single call; keep diffs minimal and reviewable.
- Search: use scoped glob patterns and grep with result caps; run independent searches in parallel; prefer searching over reading many files.
