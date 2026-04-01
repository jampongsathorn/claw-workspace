# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS
- **Free (built-in):** `say "text"` — macOS system voices, no setup
- **Better quality:** `sherpa-onnx-tts` — on-device, no cloud, needs setup
- **Premium:** `sag` (ElevenLabs) — paid API

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## Agent Capabilities (What's Available)

| Capability | Status | Reference |
|-----------|--------|-----------|
| **Web Browser** | ✅ Ready (`openclaw` profile) | `skills/openclaw-browser.md` |
| **Tavily Search** | ✅ Connected | Built-in web search |
| **Obsidian MCP** | ✅ Connected (14 tools) | Vault at `/Users/pongsathorn/Documents/Obsidian/Obsidian AI` |
| **MCP Servers** | mcporter available | `mcporter list` to see all |
| **Sub-agents** | ✅ Available | `sessions_spawn` |
| **ACP (Claude Code)** | ⚙️ Configured, gateway restart pending | `skills/openclaw-multi-agent.md` |

## Discord Channels
- **welcome**: 1488792968616742993
- **morning-update**: 1488793778939760754

## Markdown Conventions
- Use **wikilinks** `[[filename]]` for linking between .md files
- Example: `[[2026-03-31]]` links to daily log, `[[USER]]` links to user profile

---

Add whatever helps you do your job. This is your cheat sheet.
