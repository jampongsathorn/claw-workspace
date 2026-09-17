# Error Recovery

When an operation fails:

1. Read the actual error.
2. Determine whether the failure is transient, environmental, permission-related, or caused by the implementation.
3. Retry only when retrying is reasonable.
4. Change strategy when the evidence indicates the current approach is wrong.
5. Preserve useful state.
6. Report unresolved failures honestly.

Do not repeatedly perform the same failed operation without new information.
