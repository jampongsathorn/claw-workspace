# OpenClaw Automation Reference

> Source: Obsidian Vault / AI-Hub — OpenClaw Documentation

## Heartbeat vs Cron

| Use Case | Recommended | Why |
|----------|-------------|-----|
| Check inbox every 30 min | **Heartbeat** | Batches with other checks, context-aware |
| Send daily report at 9am sharp | **Cron (isolated)** | Exact timing needed |
| Monitor calendar for upcoming events | **Heartbeat** | Natural fit for periodic awareness |
| Run weekly deep analysis | **Cron (isolated)** | Standalone task, can use different model |
| Remind me in 20 minutes | **Cron (main, `--at`)** | One-shot with precise timing |
| Background project health check | **Heartbeat** | Piggybacks on existing cycle |

---

## Heartbeat: Periodic Awareness

Runs in **main session** at regular interval (default: 30 min). Good for batched checks.

### Configure Heartbeat

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "activeHours": { "start": "08:00", "end": "22:00" }
      }
    }
  }
}
```

### HEARTBEAT.md Template

```markdown
# Heartbeat checklist

- Check email for urgent messages
- Review calendar for events in next 2 hours
- If a background task finished, summarize results
- If idle for 8+ hours, send a brief check-in
```

---

## Cron: Precise Scheduling

Runs at **exact times** in isolated sessions. Good for standalone tasks.

### Cron Job Types

| Kind | Description |
|------|-------------|
| `at` | One-shot timestamp (ISO 8601) |
| `every` | Fixed interval in milliseconds |
| `cron` | 5/6-field cron expression + timezone |

### Session Types

| | Main Session | Isolated Session |
|---|---|---|
| `sessionTarget` | `"main"` | `"isolated"` |
| `payload.kind` | `"systemEvent"` | `"agentTurn"` |
| Best for | Tasks needing main context | Noisy/background chores |

---

## Cron CLI Examples

### Daily Morning Briefing (7 AM, WhatsApp)
```bash
openclaw cron add \
  --name "Morning brief" \
  --cron "0 7 * * *" \
  --tz "Asia/Bangkok" \
  --session isolated \
  --message "Summarize overnight updates, weather, calendar." \
  --announce \
  --channel whatsapp \
  --to "+运气number"
```

### Weekly Project Review (Monday 9 AM)
```bash
openclaw cron add \
  --name "Weekly review" \
  --cron "0 9 * * 1" \
  --tz "Asia/Bangkok" \
  --session isolated \
  --message "Weekly project status review." \
  --model "opus" \
  --thinking high \
  --announce
```

### One-Shot Reminder (20 min)
```bash
openclaw cron add \
  --name "Reminder" \
  --at "20m" \
  --session main \
  --system-event "Reminder: standup in 10 minutes" \
  --wake now \
  --delete-after-run
```

---

## Decision Flowchart

```
Does the task need to run at an EXACT time?
  YES → Use cron
  NO  → Continue...

Does the task need isolation from main session?
  YES → Use cron (isolated)
  NO  → Continue...

Can this task be batched with other periodic checks?
  YES → Use heartbeat (add to HEARTBEAT.md)
  NO  → Use cron

Is this a one-shot reminder?
  YES → Use cron with --at
```

---

## Cost Considerations

| Mechanism | Cost Profile |
|-----------|-------------|
| Heartbeat | One turn every N minutes; scales with HEARTBEAT.md size |
| Cron (main) | Adds event to next heartbeat — no isolated turn |
| Cron (isolated) | Full agent turn per job; can use cheaper model |

**Tips:**
- Keep `HEARTBEAT.md` small to minimize token overhead
- Batch similar checks into heartbeat vs multiple cron jobs
- Use `target: "none"` on heartbeat if only want internal processing
- Use isolated cron with cheaper model for routine tasks
