---
name: x-research-quote
description: Social listening and content repurposing system for X/Twitter. Monitors high-performing posts via Creator Studio Inspiration tab (Most Bookmarks), evaluates marketing potential, and generates Quote Posts using AEO (AI Engine Optimization) format. Triggers on: "X research", "quote post", "AEO", "social listening", "Kimi", "AI rewrite", "content repurposing", "auto post", "monitor X"
---

# X Research & Quote - Social Listening System

## System Overview

**Flow:**
1. **X Research Bot** → Scans X for high-performing posts (>800K views, high bookmarks)
2. **AI Evaluation** → Assesses marketing potential ("Yes/No")
3. **X Code Bot** → Creates Quote Post with AEO-formatted content
4. **Post** → Natural Thai content, not AI-sounding

## Filter Criteria

| Metric | Threshold |
|--------|-----------|
| Views | > 800,000 |
| Bookmarks | > 2,000 |
| Engagement | Likes > Views × 1% |

## AEO Format (Output Structure)

```
[ไตเติ้ล] หัวข้อสั้น กระชับ เข้าใจง่าย

- ข้อ 1: เนื้อหาหรือคำอธิบาย
- ข้อ 2: เนื้อหาหรือคำอธิบาย  
- ข้อ 3: เนื้อหาหรือคำอธิบาย

[บทสรุป] สรุปสาระสำคัญ 1 บรรทัด
```

## Content Rules

1. **โทนธรรมชาติ** - อ่านเป็นภาษาคน ไม่ใช่ AI
2. **ใช้ dash (-)** แบ่งข้อ ไม่ใช้ bullet หรือเลข
3. **กระชับ** - สั้น กระชับ ตรงประเด็น
4. **ตรงบริบท** - ตอบโจทย์โพสต์ต้นทาง
5. **มีประโยชน์** - ให้ความรู้หรือมุมมองใหม่

## URL Reference

- Inspiration Tab: `https://x.com/i/jf/creators/inspiration/top_posts`
- Most Bookmarks: Click filter → select "Most Bookmarks"
- Thailand filter: Click 🇹🇭 THA button
- Time filter: Last 24h / Last 7d / Last 30d
