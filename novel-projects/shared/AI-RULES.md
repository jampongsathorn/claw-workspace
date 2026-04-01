# AI Execution Rules — Novel Project System

> These rules govern how AI agents must behave when writing for this project.

---

## 🚨 Critical Rules (Never Break)

### 1. ALWAYS Read Before Writing

Before writing ANY episode, the AI must read in this **exact order**:

```
1. world/rules.md          ← How the world works
2. world/style.md          ← Writing tone & style
3. characters/main-character.md  ← Character personalities
4. plot/overview.md       ← Story direction
5. plot/story-outline.md  ← Full story structure
6. plot/episodes/episode-XX-plan.md  ← This episode's plan
7. writing/episode-(XX-1)/final.md   ← Previous episode (if exists)
```

### 2. NEVER Break These Constraints

| Constraint | Why It Matters |
|------------|---------------|
| Don't break character personality | Consistency = reader trust |
| Don't contradict world rules | Breaks immersion, creates plotholes |
| Don't skip reading previous episode | Continuity errors destroy tension |
| Don't write in `draft.md` if `final.md` exists | Final = published quality |
| Don't overwrite `final.md` without explicit permission | Sacred once marked final |

---

## 📋 Writing Workflow

### Writing a New Episode

```
1. Read: world/rules.md + world/style.md
2. Read: characters/ (all relevant profiles)
3. Read: plot/overview.md + plot/story-outline.md
4. Read: plot/episodes/episode-XX-plan.md
5. Read: writing/episode-(XX-1)/final.md (if exists)
6. Write: writing/episode-XX/draft.md
7. Self-review against world rules + style
8. Move to: writing/episode-XX/final.md
9. Update: meta/progress.md
10. Update: meta/todo.md
```

### Editing an Existing Episode

```
1. Read: current writing/episode-XX/final.md
2. Read: world/rules.md + world/style.md (re-confirm)
3. Read: plot/episodes/episode-XX-plan.md
4. Check: What changed? Does this edit break continuity?
5. Edit: writing/episode-XX/draft.md
6. Get approval before moving to final
```

---

## 🔴 Priority Order (When Conflicts Arise)

If there's a conflict between files, resolve in this order:

```
1. world/rules.md        ← World logic is absolute
2. characters/           ← Character personality is sacred
3. plot/story-outline.md ← Major plot beats are fixed
4. plot/overview.md      ← Story direction is fixed
5. plot/episodes/        ← Episode plans are flexible
6. writing/              ← Final content is sacred (not editable without permission)
7. world/style.md         ← Style is guidance, not law
```

---

## ⚠️ Breaking Point Rules

### When to STOP and Ask

- If the user asks to break a world rule → STOP and explain the conflict
- If the user asks to contradict a character's personality → STOP and explain why
- If the user asks to overwrite a final.md → Confirm before proceeding
- If the requested change breaks continuity → STOP and suggest alternative

### When to Adapt Freely

- Dialogue word choice (as long as personality stays intact)
- Scene description details
- Pacing within episodes
- Adding additional side characters not in the plan
- Emotional beats that serve the characters

---

## 📁 File Naming Conventions

| Content | Filename Format | Example |
|---------|----------------|---------|
| Character profile | `{name}.md` | `mai.md`, `x.md` |
| Image prompts | `prompts.md` | inside character folder |
| Episode plan | `episode-XX-plan.md` | `episode-01-plan.md` |
| Episode draft | `draft.md` | inside `episode-XX/` |
| Episode final | `final.md` | inside `episode-XX/` |
| Episode notes | `notes.md` | inside `episode-XX/` |

---

## 🖼️ Image Generation Rules

When generating character images:

1. Read `characters/{name}/prompts.md` first
2. Use the Base Prompt as starting point
3. Add emotion + outfit variants for scene
4. Always include quality tags: `, highly detailed, cinematic lighting, 8k`
5. Save images to `characters/{name}/images/`
6. Name images: `{episode}-{scene}-{emotion}.png`
   - Example: `ep01-firstmeet-curious.png`

---

## 🎬 POV & Tone Enforcement

- **ใหม่ chapters:** Use warm, curious, slightly verbose narration
- **เอ็กซ์ chapters:** Use cold, minimal, internal-heavy narration
- **Sound motif:** Always reference hearing/audio in some way each chapter
- **No info-dumps:** Weave world-building into action, not separate paragraphs

---

## 📊 Progress Reporting

After every completed episode, update:

```
meta/progress.md:
  - Increment "Completed Episodes"
  - Add episode to table (title, word count, date)
  - Log recent activity

meta/todo.md:
  - Check off completed episode plan
  - Add next episode to "Immediate" section
```
