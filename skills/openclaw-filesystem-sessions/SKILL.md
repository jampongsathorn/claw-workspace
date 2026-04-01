# OpenClaw Filesystem & Sessions Reference

> Source: Obsidian Vault / AI-Hub — OpenClaw Documentation

---

## 📁 Workspace Files (The "Brain")

**Location:** `~/.openclaw/workspace/` (shared by ALL agents)

| File | Injected Every Run? | Purpose |
|------|---------------------|---------|
| `AGENTS.md` | ✅ Always | Team structure, routing, agent bindings |
| `SOUL.md` | ✅ Always | My personality, tone, boundaries |
| `TOOLS.md` | ✅ Always | Local tool conventions |
| `IDENTITY.md` | ✅ Always | My name, vibe, emoji |
| `USER.md` | ✅ Always | Who you are, preferences |
| `HEARTBEAT.md` | ✅ Always | Periodic task checklist |
| `MEMORY.md` | ✅ If present | Long-term curated memory |
| `memory/YYYY-MM-DD.md` | ❌ On-demand only | Daily logs — accessed via `memory_search` / `memory_get` |
| `BOOTSTRAP.md` | ✅ First-run only | One-time setup ritual |
| `skills/` | ❌ On-demand only | Loaded when needed via `read` tool |

---

## 🔄 When Files Are Read

### New Session (Fresh Bootstrap)
```
Agent starts new session
  → Reads SOUL.md, USER.md, AGENTS.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, MEMORY.md
  → Full context injected into model window
```

### Existing Session (Resumed)
```
Agent resumes existing session
  → Session transcript already has full history
  → Workspace files NOT re-injected (already in context from previous turns)
  → Only new messages added to conversation
```

### Sub-Agent Session
```
Sub-agent starts
  → Only AGENTS.md + TOOLS.md injected (MINIMAL mode)
  → NO SOUL.md, IDENTITY.md, USER.md, MEMORY.md, HEARTBEAT.md
  → Keeps sub-agent context small + cheap
```

### Important: `/new` Resets Everything
```
Existing session → workspace files already baked in from old bootstrap
  → agent does NOT see updated files

/new → fresh bootstrap → re-reads all workspace files
```

**Rule:** After updating any workspace file (SOUL.md, AGENTS.md, etc.), run `/new` in active sessions to pick up changes.

---

## 🧠 Context vs Memory

| Concept | What | Where |
|---------|------|-------|
| **Context** | Everything sent to model NOW | In model's window, transient |
| **Memory** | What's saved to disk | `MEMORY.md`, `memory/YYYY-MM-DD.md` |

> Context ≠ Memory. Memory is stored on disk and reloaded later. Context is what's in the model's head right now.

---

## 🏠 Session Types

### 1. Main Session (`agent:<agentId>:main`)
- Primary session for direct 1:1 chat
- Full bootstrap: ALL workspace files
- Full conversation history
- Uses `promptMode: "full"`

### 2. Sub-Agent Session (`agent:<agentId>:subagent:<uuid>`)
- Spawned by main agent for parallel tasks
- **Minimal context**: only AGENTS.md + TOOLS.md
- No memory of main conversation
- Fresh session per spawn
- Tool access: all tools EXCEPT session tools (`sessions_list`, `sessions_send`, `sessions_spawn`)
- Results announce back to requester

### 3. Isolated Session (`cron:<jobId>`, `hook:<uuid>`)
- Cron jobs and webhooks get fresh sessions
- No conversation history (starts clean)
- Can use different model
- Announce results back when done

---

## 🛠️ Session Tools (How Agents Communicate)

| Tool | What It Does |
|------|-------------|
| `sessions_list` | List all sessions (filtered by kind/channel/activity) |
| `sessions_history` | Fetch full transcript of any session |
| `sessions_send` | Send a message INTO another session (fires and returns, or waits for reply) |
| `sessions_spawn` | Spawn a NEW sub-agent in isolated session |

### Session Key Formats
```
agent:main:webchat              → Main session (me)
agent:main:subagent:abc123     → Sub-agent
cron:morning-brief             → Cron job
hook:xyz789                    → Webhook
```

### How `sessions_send` Works
```javascript
// Fire-and-forget (non-blocking)
sessions_send(sessionKey: "agent:main:subagent:abc123", message: "Stop", timeoutSeconds: 0)

// Wait for reply (blocking)
sessions_send(sessionKey: "agent:main:subagent:abc123", message: "Status?", timeoutSeconds: 30)
// Returns: { status: "ok", reply: "Task complete" }
```

### Ping-Pong Loop (Agent-to-Agent)
```
Agent A sends to Agent B
     ↓
Agent B processes + replies
     ↓
Agent A receives reply
     ↓
Can reply back (up to 5 turns)
```

Special replies:
- `REPLY_SKIP` → stop the ping-pong
- `ANNOUNCE_SKIP` → sub-agent stays silent after completion

---

## 📊 Prompt Modes

| Mode | Used For | Includes |
|------|----------|---------|
| `full` | Main sessions | Everything: tools, skills, memory recall, all bootstrap files |
| `minimal` | Sub-agents | Only: tooling, safety, workspace, sandbox, date/time, runtime |
| `none` | Bare identity | Just "you are an AI assistant" |

---

## ⚡ Key Rules

1. **Workspace files = shared knowledge layer** — all agents read the same files at bootstrap
2. **Sub-agents are minimal** — only AGENTS.md + TOOLS.md to keep context small
3. **After updating workspace files → run `/new`** to pick up changes
4. **Memory files NOT auto-injected** — only MEMORY.md (if present) goes into context; daily logs need `memory_search`
5. **Session tools = inter-agent communication** — list, read, send, spawn
