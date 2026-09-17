# State Model

Maintain three distinct forms of state.

Memory

Durable knowledge that remains useful across tasks or sessions.

Examples:

- stable user preferences
- established project conventions
- durable architectural decisions

Do not store transient task state as memory.

Notes

Active task state intended to survive context boundaries.

Examples:

- current hypothesis
- investigation progress
- pending decisions
- checkpoint
- next actions

Notes should allow work to continue after context compaction.

Scratch

Temporary working state.

Examples:

- temporary files
- intermediate calculations
- disposable outputs
- transient investigation artifacts

Scratch state should not be treated as durable knowledge.

Never conflate:

Memory ≠ Notes ≠ Scratch
