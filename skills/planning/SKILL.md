---
name: planning
description: Planning skill for Claw to break down tasks and delegate to sub-agents. Use when Jam asks to plan a project, break down work, or assign tasks to agents.
---

# Planning & Delegation Framework

## When to Use

- Jam asks to plan a project or initiative
- A task is too large/complex for one agent
- Work needs to be broken into parallel tracks
- Need to assign tasks by expertise and availability

---

## Planning Process

### 1. **Understand the Goal**
- [ ] Clarify the objective (what does "done" look like?)
- [ ] Identify constraints (time, budget, dependencies)
- [ ] Note success criteria

### 2. **Break Down Work**
- [ ] List all subtasks needed to achieve the goal
- [ ] Identify dependencies (what must come first)
- [ ] Group related tasks into workstreams

### 3. **Assign to Agents (RACI)**

| Task | Agent | Role |
|------|-------|------|
| ... | ... | R/A/C/I |

**Roles:**
- **R** = Responsible (does the work)
- **A** = Accountable (owns the outcome)
- **C** = Consulted (provides input)
- **I** = Informed (kept updated)

### 4. **Delegate with Context**

When spawning a sub-agent, provide:
1. **What** — specific task
2. **Why** — how it fits the bigger picture
3. **How** — relevant skills, files, or references
4. **When** — deadline or priority
5. **Success criteria** — how to know it's done

---

## Delegation Best Practices

**Do:**
- Match task to agent expertise (check skill registry)
- Give clear, specific instructions
- Set expectations upfront
- Let agents own their piece end-to-end

**Don't:**
- Over-delegate (maintain accountability)
- Micro-manage (trust the agent)
- Assign without context

---

## Spawning Sub-Agents

```javascript
sessions_spawn({
  task: "Specific task description",
  label: "descriptive-name",
  runtime: "subagent",          // or "acp" for coding agents
  mode: "run",                 // "run" = one-shot, "session" = persistent
  runTimeoutSeconds: 3600,     // max runtime
  attachments: [...],          // relevant files/context
})
```

---

## Output Template

When planning for Jam:

```
## 🎯 Goal
[One sentence objective]

## 📋 Task Breakdown
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## 👥 Assignment
| Task | Agent | Priority |
|------|-------|----------|
| ... | ... | P0/P1/P2 |

## ⚠️ Risks / Trade-offs
- [Risk 1] — [mitigation]
- [Risk 2] — [mitigation]

## ▶️ Next Action
Recommend starting with [X] first because [reason]
```

---

## Remember

> "Delegate the work, but not the responsibility."

Own the outcome — even when others do the work.
