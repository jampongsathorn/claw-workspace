# OpenClaw Multi-Agent Reference

> Source: Obsidian Vault / AI-Hub — OpenClaw Documentation

## Key Concepts

| Term | Definition |
|------|-----------|
| `agentId` | One "brain" — workspace, per-agent auth, per-agent session store |
| `accountId` | One channel account instance (e.g. WhatsApp "personal" vs "biz") |
| `binding` | Routes inbound messages to an `agentId` by `(channel, accountId, peer)` |
| `sessions_spawn` | Spawn a sub-agent run in an isolated session |

---

## Sub-Agents Architecture

```
Main Agent (depth 0)
   ├─ Sub-Agent A  (depth 1, parallel)
   ├─ Sub-Agent B  (depth 1, parallel)
   └─ Sub-Agent C  (depth 1, parallel)
```

**Key spawn params:**
```json
{
  "task": "Research Thailand food delivery market",
  "agentId": "researcher",
  "model": "gpt-4o-mini",
  "runTimeoutSeconds": 900,
  "mode": "run",
  "cleanup": "keep"
}
```

**Tool access by depth:**
| Depth | Role | Session Tools Available |
|-------|------|------------------------|
| 0 | Main | All tools |
| 1 (leaf) | Sub-agent | All tools **except** `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn` |
| 1 (orchestrator, `maxSpawnDepth >= 2`) | Orchestrator | Above + gets `sessions_spawn`, `subagents`, `sessions_list`, `sessions_history` |
| 2 | Leaf worker | No session tools |

---

## Session Tools

| Tool | Purpose |
|------|---------|
| `sessions_list` | List sessions as array of rows |
| `sessions_history` | Fetch transcript for one session |
| `sessions_send` | Send a message into another session |
| `sessions_spawn` | Spawn sub-agent in isolated session |

**Session key formats:**
- Main: `agent:<agentId>:main`
- Sub-agent: `agent:<agentId>:subagent:<uuid>`
- Cron: `cron:<job.id>`

---

## Concurrency Settings

| Setting | Default | Range |
|---------|---------|-------|
| `maxConcurrent` | `8` | — |
| `maxChildrenPerAgent` | `5` | 1–20 |
| `maxSpawnDepth` | `1` | 1–5 |

**Orchestrator pattern (depth 2):**
```json
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxSpawnDepth": 2,
        "maxChildrenPerAgent": 5,
        "maxConcurrent": 8
      }
    }
  }
}
```

---

## Announce Chain

Results flow upward:
```
Depth-2 Worker finishes → announces to
Depth-1 Orchestrator (synthesizes, finishes) → announces to
Main Agent → announces to
User
```

**Special replies during announce:**
- `ANNOUNCE_SKIP` → stay silent
- Any other reply → posted to requester channel

---

## Cost Management Best Practice

```
Main Agent   → strong/expensive model (Claude Opus, GPT-4.1)
Sub-Agents   → cheaper model (GPT-4o-mini, Sonnet-4)
```

---

## Routing Priority (highest → lowest)

1. `peer` match (exact DM/group/ID)
2. `parentPeer` match (thread inheritance)
3. `guildId + roles` (Discord)
4. `guildId` (Discord)
5. `teamId` (Slack)
6. `accountId` match
7. Channel-level (`accountId: "*"`)
8. Fallback to default agent

---

## Tool: sessions_spawn (detailed)

```json
{
  "task": "string (required)",
  "label": "string (optional)",
  "agentId": "string",
  "model": "string",
  "thinking": "string",
  "runTimeoutSeconds": 900,
  "thread": false,
  "mode": "run | session",
  "cleanup": "delete | keep",
  "sandbox": "inherit | require"
}
```

**Always non-blocking** — returns `{ status: "accepted", runId, childSessionKey }` immediately.

---

## Multi-Agent Setup CLI

```bash
# Add new isolated agent
openclaw agents add coding

# Verify agents + bindings
openclaw agents list --bindings

# Restart gateway
openclaw gateway restart
```

---

## Per-Agent Config Example

```json
{
  "agents": {
    "list": [
      {
        "id": "alex",
        "workspace": "~/.openclaw/workspace-alex",
        "sandbox": { "mode": "off" }
      },
      {
        "id": "family",
        "workspace": "~/.openclaw/workspace-family",
        "tools": {
          "allow": ["read"],
          "deny": ["exec", "write", "edit"]
        }
      }
    ]
  }
}
```
