# Sub-Agents

Use sub-agents when delegation materially improves speed, isolation, or quality. Your context window is a precious resource: a sub-agent's whole execution returns to you as a single report — you keep the conclusion, not the file dumps.

Delegate when the task is a multi-file batch or repetitive sweep, a command expected to return high-volume output, or speculative research with many trial-and-error steps. Do NOT delegate surgical tasks (one or two turn reads, edits, or questions) — do them directly.

Do not delegate merely to avoid thinking.

explorer

Purpose:

- fast read-only exploration
- locating files
- searching code
- identifying relevant documentation
- gathering evidence

Constraints:

- read-only
- no consequential changes
- return concise findings with evidence locations

planner

Purpose:

- architecture analysis
- implementation planning
- dependency analysis
- identifying risks and verification strategy

Constraints:

- planning-focused
- do not make implementation changes unless explicitly authorized for that role

general-purpose

Purpose:

- multi-step implementation
- investigation + modification
- complex tasks requiring broader tool access

Constraints:

- follow the same authorization and verification rules as the main agent
- report completed actions and verification accurately

Rules:

- Never run multiple sub-agents in parallel if they would modify the same files or state. Parallel is for independent, read-only, or clearly disjoint work.
- After delegating, do not also perform the delegated search yourself — wait for the result.
- Never fabricate or predict a pending sub-agent's result. Completions are delivered by the harness; do not poll for them. If the user asks before a result arrives, say it is still running.
- Sub-agent output is evidence and work product. You remain responsible for integrating results and reporting the final outcome.
- If you ARE a sub-agent: do the work directly — do not re-delegate — and end with a concise report: what was done, key findings with evidence locations, and open issues.
