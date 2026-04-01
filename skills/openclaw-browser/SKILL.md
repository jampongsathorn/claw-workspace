# OpenClaw Browser Reference

> Source: Obsidian Vault / AI-Hub + Tavily Web Search

## What It Is

A **separate, isolated Chrome/Brave/Chromium browser** that I control. It's NOT your personal browser — it's a dedicated agent-controlled browser for automation.

**Profile:** `openclaw` (managed, isolated) vs `chrome` (your existing browser via extension relay)

---

## Quick Start

```bash
# Check status
openclaw browser status

# Start browser
openclaw browser start

# Open a page
openclaw browser open https://example.com

# Get page snapshot (AI-readable structure)
openclaw browser snapshot

# Screenshot
openclaw browser screenshot
```

---

## Key Capabilities

| Action | Command |
|--------|---------|
| **Navigate** | `openclaw browser navigate <url>` |
| **Click** | `openclaw browser click <ref>` |
| **Type** | `openclaw browser type <ref> "text"` |
| **Snapshot** | `openclaw browser snapshot` (gets interactive elements) |
| **Screenshot** | `openclaw browser screenshot [--full-page]` |
| **PDF** | `openclaw browser pdf` |
| **Wait** | `openclaw browser wait --url "**/dash"` |
| **Fill form** | `openclaw browser fill --fields '[{"ref":"1","type":"text","value":"Ada"}]'` |

---

## Browser Profiles

| Profile | Type | Description |
|---------|------|-------------|
| `openclaw` | Managed | Dedicated Chromium, isolated from your browser |
| `chrome` | Extension relay | Your existing Chrome via OpenClaw extension |
| `work` | Custom | You can add more (work, remote, etc.) |

---

## Configuration

```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "openclaw",
    "headless": false,
    "ssrfPolicy": {
      "dangerouslyAllowPrivateNetwork": true
    }
  }
}
```

---

## PM Use Cases

| Use Case | How Browser Helps |
|----------|------------------|
| **Research** | Browse sites, extract data, take screenshots |
| **Verification** | Screenshot confirmations of web actions |
| **Form filling** | Auto-fill web forms |
| **Price monitoring** | Scrape competitor prices |
| **Content scraping** | Extract structured data from pages |
| **Web testing** | Verify web apps work correctly |

---

## Security Notes

- Binds to **loopback only** (127.0.0.1)
- SSRF protection: block private network by default
- `browser.evaluateEnabled=false` disables JS execution if needed
- `openclaw browser evaluate` runs arbitrary JS — prompt injection risk

---

## As My PM Tool

The browser tool lets me:
- **Verify** things visually (screenshots)
- **Research** competitor websites, pricing, news
- **Automate** web tasks (form fills, scrapes)
- **Monitor** changes over time (cron + browser)
