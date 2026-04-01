---
name: light-novel-image
description: Generate stunning Chinese light novel (国漫) style artwork and book covers. Use when creating: (1) Chinese light novel covers or插画 (illustrations), (2) Anime/manga-style characters with Chinese aesthetics, (3) Xianxia/玄幻 fantasy scenes, (4) Romance or action scene artwork, (5) Book covers with Chinese novel aesthetics. Triggers on: "light novel style", "Chinese anime art", "xianxia art", "国漫", "generate cover", "light novel cover", "Chinese fantasy art", "create illustration".
---

# Light Novel Image Generator

Generate breathtaking Chinese light novel style artwork using AI image generation.

## Style Characteristics

Chinese light novel / 国漫 style blends:
- **Anime foundation** with Chinese cultural aesthetics
- **Fantasy elements**: cultivation (修炼), immortal beings (仙人), spiritual qi (灵气)
- **Traditional-modern fusion**: hanfu elements, elaborate hairstyles, modern touches
- **Atmospheric lighting**: soft bokeh, moon glow, cherry blossoms, mystical fog
- **Color palettes**: jade greens, coral pinks, gold accents, ink wash blues

## Prompt Building Blocks

### 1. Subject & Character
```
beautiful young [gender] protagonist
flowing [hair color] hair with [hairstyle]
[clothing description: e.g., elegant snow-white xianxia robe with gold embroidery]
[intricate accessories: jade hairpin, silver crown, etc.]
[pose and expression]
```

### 2. Environment & Atmosphere
```
[setting: misty mountain peak, cherry blossom garden, ancient temple, moonlit lake]
[time: golden sunset, moonlit night, dawn light]
[atmospheric elements: floating petals, fireflies, spiritual energy wisps, fog]
```

### 3. Art Style Modifiers (append these)
```
chinese light novel style, guoman, xianxia aesthetic
anime art, high quality illustration
soft lighting, cinematic composition
delicate features, detailed hair
ethereal and dreamy atmosphere
```

### 4. Negative Prompts (for better results)
```
realistic, photograph, 3D render
ugly, deformed, bad anatomy
low quality, blurry, watermark
western cartoon, Disney style
```

## Quick Templates

### Template 1: Character Portrait Cover
```
[Character description] standing gracefully, [clothing in detail], 
holding [prop if any], [hair blowing in wind], 
[setting with Chinese elements], moonlit night,
cherry blossoms falling, soft golden rim light,
chinese light novel style, anime illustration,
high quality, detailed, ethereal atmosphere
```

### Template 2: Action/Fantasy Scene
```
[Character(s)] in dramatic [action/pose], 
[magnificent flowing robes with intricate patterns],
surrounded by [spiritual energy/cultivation effects],
[epic setting: mountain shattered, ocean of clouds, palace floating in sky],
dynamic composition, xianxia fantasy art,
cinematic lighting, anime style, highly detailed
```

### Template 3: Romance Scene
```
intimate moment between [characters], 
soft embrace, loving expressions,
[cozy or beautiful setting: rain, autumn leaves, lantern-lit garden],
warm romantic lighting, heart-flutter atmosphere,
dual protagonist chinese light novel style,
beautiful anime art, soft colors, dreamy
```

### Template 4: Book Cover (vertical 3:4 ratio)
```
[stunning character illustration centered],
elaborate [clothing and hairstyle details],
[majestic beast companion or spiritual tool if relevant],
[rich background with Chinese palace/mountain/garden],
title space at top (leave room),
professional light novel cover art,
3:4 aspect ratio, high quality anime illustration
```

## Generation Guidelines

### Aspect Ratios
- **Character portrait**: 2:3 or 3:4
- **Book cover**: 2:3 or 3:4 (vertical)
- **Scene illustration**: 16:9 or 3:2
- **Square**: 1:1 for icons/thumbnails

### Quality Settings
- Use **2K resolution** for detailed illustrations
- Enable **high resolution** for complex scenes
- Count: 1-2 images per generation

### Chinese Aesthetics Reference

**Clothing terms:**
- 仙侠袍 (xianxia robe) - flowing immortal robes
- 汉服 (hanfu) - traditional Han clothing
- 霓裳 (rainbow clothing) - colorful celestial garments
- 锦缎 (brocade) - embroidered silk

**Setting elements:**
- 桃花林 (peach blossom grove)
- 月光湖 (moonlit lake)
- 云海 (sea of clouds)
- 仙宫 (fairy palace)

**Atmosphere:**
- 灵气 (spiritual energy) - glowing wisps
- 樱花 (cherry blossoms) - falling petals
- 萤火虫 (fireflies) - floating lights

## Image Generation Tool

### How to Generate
Use the `image_generate` tool with these parameters:

| Parameter | Value |
|-----------|-------|
| **Model** | `minimax-portal/image-01` (MiniMax Image-01) |
| **Prompt** | Built from templates above (use the full prompt string) |
| **Aspect Ratio** | See Aspect Ratios section below |
| **Resolution** | `2K` recommended for detailed illustrations |
| **Count** | `1` (default), max `4` |

### Example Tool Call
```
image_generate(
  prompt="beautiful young woman, long flowing black hair with ornate jade hairpin, elegant snow-white xianxia robe with subtle gold embroidery, delicate ethereal beauty, standing on misty cliff overlooking sea of clouds at moonlight, cherry blossoms falling, soft golden rim light, chinese light novel style, anime illustration, high quality",
  aspectRatio="3:4",
  resolution="2K"
)
```

### Aspect Ratios
- **Character portrait / Book cover**: `3:4` or `2:3` (vertical)
- **Scene illustration**: `16:9` or `3:2`
- **Square**: `1:1`

## Workflow

1. **Identify the scene type** (character portrait, action, romance, cover)
2. **Choose appropriate template** above
3. **Customize with user's details** (character looks, clothing, setting)
4. **Add style modifiers** (chinese light novel, soft lighting, etc.)
5. **Generate with `image_generate` tool** — model: `minimax-portal/image-01`
6. **After generation completes**, find the latest image at:
   ```
   /Users/pongsathorn/.openclaw/media/tool-image-generation/
   ```
   Use `ls -lt` to find the most recent file (sorted by time).
7. **Report completion to user** with emoji and the output path, e.g.:
   > 🦀🦞 Your masterpiece is ready! 🖼️
   > Location: `~/.openclaw/media/tool-image-generation/image-1---xxx.png`
8. **Refine if needed** based on user's feedback

## Quick Start

When user asks for a Chinese light novel style image:

1. Ask for **character description** or use a fitting default
2. Ask for **scene type** (portrait/action/romance/cover)
3. Ask for **setting preference** or suggest one
4. Build the prompt using templates above
5. Generate with `image_generate`

### Default Character (if not specified)
```
beautiful young woman, long flowing black hair with ornate jade hairpin,
elegant snow-white xianxia robe with subtle gold embroidery,
delicate ethereal beauty, serene expression,
standing on cliff edge overlooking sea of clouds,
moonlit dusk, cherry blossoms drifting, spiritual energy wisps,
chinese light novel style, anime illustration, high quality
```

---

For prompt templates and examples, see [references/prompts.md](references/prompts.md)
