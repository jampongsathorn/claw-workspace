---
name: openclaw-most-bookmark
description: Monitor X/Twitter trending content by bookmark count using the Creator Studio Inspiration tab. Use for social listening, content research, trend analysis, and competitive intelligence on what Thai (or global) users find valuable enough to save. Triggers on: "social listening", "X bookmarks", "twitter trending", "most bookmarked", "inspiration tab", "X analytics", "track bookmarks", "monitor X", "twitter insights"
---

# OpenClaw Most Bookmark - Social Listening Skill

Monitor X/Twitter trending content by bookmark count using the Creator Studio Inspiration tab.

## Navigation

1. Navigate to Creator Studio Inspiration:
   ```
   https://x.com/i/jf/creators/inspiration/top_posts
   ```

2. Or navigate to Creator Studio first, then click "Inspiration":
   ```
   https://x.com/i/jf/creators/studio
   ```

## Key Filters

| Filter | Usage |
|--------|-------|
| **Region** | Click 🇹🇭 THA for Thailand, or use global |
| **Time** | Last 24h / Last 7d / Last 30d |
| **Metric** | Most Likes, Most Replies, Most Quotes, **Most Bookmarks**, Most Shares, Most Video Views |

## What to Look For

**Most Bookmarks** = content users find valuable enough to save for later

High-engagement patterns:
- Practical tips (saving money, electricity, taxes)
- Checklists and guides
- Entertainment with shareability
- Controversial/opinionated takes
- Student/exam related content (DEK70)

## Example Workflow

1. `openclaw browser navigate https://x.com/i/jf/creators/inspiration/top_posts`
2. Click "Most Bookmarks" filter
3. Take snapshot to see top posts
4. Analyze: bookmarks count, views, engagement ratios
5. Report key insights

## Session Persistence

Browser session persists with user login. User-data-dir stores cookies at:
```
~/.openclaw/browser/openclaw/user-data
```

## Key URLs

- Inspiration: `https://x.com/i/jf/creators/inspiration/top_posts`
- Creator Studio: `https://x.com/i/jf/creators/studio`
- Analytics: `https://x.com/[username]/status/[post_id]/analytics`
