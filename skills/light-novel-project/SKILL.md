---
name: light-novel-project
description: End-to-end system for planning, writing, and publishing Thai light novels (BL, sci-fi, romance, ReadaWrite)

use_when:
  - user wants to write a novel
  - user mentions: novel, story, episode, character, plot
  - user wants to create or manage a story project
  - user asks to write BL / romance / sci-fi / นิยาย content
  - user asks to generate episodes or chapters
  - user mentions ReadaWrite or publishing light novels
  - user says "write", "continue", "plan next episode"
  - user asks to set up auto-write or recurring writing

priority: high
---

# light-novel-project Skill

> End-to-end system for planning, writing, and publishing Thai light novels (BL, sci-fi, romance, ReadaWrite).
> Works with `light-novel-publisher` MCP server for ReadaWrite.com publishing.

---

## 🚨 AUTO-ACTIVATION (CRITICAL)

### If user intent matches ANY of these → ACTIVATE THIS SKILL:

- "write an episode / chapter"
- "continue the story"
- "plan the next episode"
- "create a novel / story / character"
- "generate chapter content"
- "I have an idea for a novel"
- "publish to ReadaWrite"
- "set up auto-write / recurring writing / cron"
- Any writing / storytelling / novel task

### When activated:

1. **You are NOT a chatbot.** You are a novel production system.
2. You MUST operate inside the folder structure defined here.
3. You MUST follow the writing workflow.
4. You MUST read existing context before producing content.
5. If the novel project doesn't exist yet → create it first.
6. If the novel exists → locate where the user is and continue from there.

---

## 🚀 Auto-Continue Writing (Cron Setup)

### What It Does

A recurring cron job that automatically:
1. Checks current writing progress
2. Identifies the next episode to write
3. Writes the next episode draft
4. Updates meta/progress.md + meta/todo.md

### Session Mode

Uses `session:novel-writer` — a **persistent named session** that maintains context across runs. Each cron run continues from where the last one left off.

### Cron Job Setup

```bash
# Schedule: every day at 9:00 AM and 9:00 PM (Bangkok time GMT+7)
# Session: persistent novel-writer
# Delivery: announce to webchat (current channel)

openclaw cron add \
  --name "Novel Auto-Write" \
  --cron "0 9,21 * * *" \
  --tz "Asia/Bangkok" \
  --session session:novel-writer \
  --message "CONTINUE NOVEL WRITING TASK

Project path: /Users/pongsathorn/.openclaw/workspace/novel-projects

Step 1: Read meta/progress.md to find the active novel and current episode status.
Step 2: Find the next unwritten episode plan in plot/episodes/.
Step 3: Read world/style.md + world/rules.md (writing rules).
Step 4: Read characters/{name}/ prompts.md for character voice.
Step 5: Read previous episode final.md or draft.md for continuity.
Step 6: Read the next episode plan in plot/episodes/episode-XX-plan.md.
Step 7: Write the episode draft to: writing/episode-XX/draft.md
Step 8: Update meta/progress.md (increment episode count, log date).
Step 9: Update meta/todo.md (check off completed, move next to Immediate).
Step 10: Reply with: episode written, word count estimate, next episode title.

Writing rules:
- Thai light novel, BL slow-burn romance
- Third person limited, alternating POV between main pair
- Use sound as a narrative device every chapter
- Follow world/style.md tone rules
- Do NOT overwrite final.md (only write draft.md)
- If all episodes complete, reply 'ALL EPISODES DONE'" \
  --announce
```

### Alternative: Light Mode (Faster, Less Context)

```bash
openclaw cron add \
  --name "Novel Auto-Write (Light)" \
  --cron "0 9,21 * * *" \
  --tz "Asia/Bangkok" \
  --session session:novel-writer \
  --light-context \
  --message "LIGHT NOVEL WRITE TASK

Project: /Users/pongsathorn/.openclaw/workspace/novel-projects
Read meta/progress.md, find next episode, write draft, update meta.
Reply with episode number + word count." \
  --announce
```

### Checking the Cron Job

```bash
# List all cron jobs
openclaw cron list

# View run history
openclaw cron runs --id <job-id> --limit 10

# Run immediately (test)
openclaw cron run <job-id>

# Remove auto-write job
openclaw cron remove <job-id>
```

---

## 🎯 FIRST RESPONSE BEHAVIOR

When this skill activates, determine user intent FIRST:

### Intent A: New Novel Request
```
→ Create novel folder structure
→ Ask: name, genre, core concept
→ Initialize: world/rules + characters + plot
→ Confirm before writing
```

### Intent B: Continue / Write Episode
```
→ Locate existing novel project
→ Read: meta/progress.md + meta/todo.md
→ Read: previous episode draft/final.md
→ Read: next episode plan
→ Write new episode
```

### Intent C: Auto-Write Setup
```
→ Check if novel project exists
→ Ask preferred schedule (default: 9AM + 9PM daily)
→ Create the cron job using the template above
→ Confirm job ID
```

### Intent D: Publishing
```
→ Read: writing/episode-XX/final.md
→ Call light-novel-publisher MCP tools
→ Publish chapter
```

---

## 📁 System Structure

```
novel-projects/
│
├── shared/
│   ├── character-profile-template.md
│   ├── ideas.md
│   ├── themes.md
│   ├── reusable-concepts.md
│   └── AI-RULES.md
│
├── {novel-name}/
│   ├── characters/
│   │   └── {name}/
│   │       ├── profile.md
│   │       ├── appearance.md
│   │       ├── prompts.md
│   │       └── images/
│   │
│   ├── plot/
│   │   ├── overview.md
│   │   ├── story-outline.md
│   │   └── episodes/
│   │       └── episode-XX-plan.md
│   │
│   ├── writing/
│   │   └── episode-XX/
│   │       ├── draft.md
│   │       ├── final.md
│   │       └── notes.md
│   │
│   ├── world/
│   │   ├── rules.md
│   │   ├── power-system.md
│   │   ├── locations.md
│   │   ├── timeline.md
│   │   └── style.md
│   │
│   └── meta/
│       ├── progress.md
│       └── todo.md
```

---

## 🔑 Critical Distinction

| Folder | Content | Overwritable? |
|--------|---------|---------------|
| `plot/` | Plans, outlines, what WILL happen | ✅ Yes |
| `writing/` | Final published episodes | ❌ NO (draft only) |

> `plot/` = blueprint. `writing/` = the built house.
> Never edit `final.md` without explicit permission.

---

## ✍️ Writing Workflow (MUST FOLLOW)

```
BEFORE WRITING — Read in this exact order:
1. world/style.md          ← Writing tone & rules
2. world/rules.md          ← World logic
3. characters/{name}/      ← Character profiles
4. plot/overview.md        ← Story direction
5. plot/story-outline.md   ← Full structure
6. plot/episodes/episode-XX-plan.md  ← This episode's plan
7. writing/episode-(XX-1)/draft.md  ← Previous episode

WRITING STEPS:
1. → Write to writing/episode-XX/draft.md
2. → Self-review against world rules + character voice
3. → (If approved) Move to writing/episode-XX/final.md
4. → Update meta/progress.md + meta/todo.md
```

---

## 🖼️ Image Prompt System

See `characters/{name}/prompts.md`:
- **Base prompt** — consistent starting point
- **Emotion variants** — curious, shy, flustered, vulnerable...
- **Outfit variants** — university, casual, formal, night scene...
- **Scene prompts** — pre-built full prompts for key moments

**Prompt format:**
```
{age} {gender}, {hair}, {eyes}, wearing {outfit}, {style keywords}, {vibe}, highly detailed, cinematic lighting
```

**Image naming:** `{episode}-{scene}-{emotion}.png`
**Save to:** `characters/{name}/images/`

---

## 🔴 AI Execution Rules

### Priority Order (When Files Conflict)
```
1. world/rules.md         ← World logic is absolute
2. characters/            ← Character personality is sacred
3. plot/story-outline.md  ← Major beats are fixed
4. plot/overview.md       ← Story direction is fixed
5. plot/episodes/         ← Episode plans are flexible
6. writing/final.md      ← Sacred once approved
7. world/style.md         ← Style guidance (not law)
```

### MUST DO
- Read all relevant context before writing anything
- Stay in character voice (ใหม่ = bright/talkative, เอ็กซ์ = cold/minimal)
- Use sound as a narrative device every episode
- Update meta/progress.md after each episode

### NEVER DO
- Contradict world rules
- Break character personality
- Skip reading previous episode
- Overwrite `final.md` without permission
- Rush the romance — earn every confession

---

## 📊 Progress Tracking

After finishing each episode:
1. Update `meta/progress.md` — increment count, log date
2. Update `meta/todo.md` — check off done, move next to Immediate

---

## 🔗 Publishing (light-novel-publisher MCP)

```bash
# Create new novel
mcporter call light-novel-publisher create_story \
  title="..." synopsis="..." category="นิยายรัก" tags="..."

# Publish episode
mcporter call light-novel-publisher add_chapter \
  article_id="..." title="บทที่ 1" content="$(cat writing/episode-01/final.md)"
```

---

## 💡 Quick Start Checklist

For a new novel project, create in this order:

```
□ 1. world/rules.md          ← How the world works
□ 2. world/power-system.md   ← Abilities & mechanics
□ 3. characters/{*}.md       ← Who's in the story
□ 4. world/locations.md      ← Where it happens
□ 5. plot/overview.md        ← Short summary
□ 6. plot/story-outline.md   ← Full story arc
□ 7. plot/episodes/          ← Episode plans
□ 8. writing/episode-XX/      ← Actual writing
```

---

## 📌 Example Reference Files

| File | Purpose |
|------|---------|
| `neural-bond/world/style.md` | Writing tone + POV rules |
| `neural-bond/world/power-system.md` | Neural Bond mechanics |
| `neural-bond/characters/mai/prompts.md` | Image prompts (character) |
| `shared/character-profile-template.md` | Blank character template |
| `shared/AI-RULES.md` | AI writing behavior rules |

---

## 🎬 Tone Defaults (BL Slow-Burn)

- **POV:** Third person limited, alternating main pair
- **Pacing:** Slow build → intense mid → emotional climax
- **Romance:** Earn every confession. No shortcuts.
- **Sound:** Every chapter — use hearing as a narrative device
- **Technology:** Visual + intuitive, NOT technobabble
- **Thai setting:** Natural references, casual university speech
