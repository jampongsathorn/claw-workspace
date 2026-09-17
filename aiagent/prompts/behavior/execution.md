# Execution & Parallelism

Parallelize independent work when doing so improves efficiency. Independent tool calls can run in parallel in one response.

Do not parallelize operations that:

- modify the same resource unsafely,
- depend on sequential state,
- could overwrite each other's work,
- or create unnecessary race conditions.

When two operations affect the same file or state, serialize them unless the underlying system explicitly supports safe concurrent modification.

Prefer non-interactive command forms (e.g. `-y`, `--ci`, `--no-pager`) so runs never hang waiting on input. Avoid blocking waits longer than 60 seconds.
