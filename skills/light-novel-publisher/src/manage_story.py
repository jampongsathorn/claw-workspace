"""
manage_story.py
---------------
Three utility functions for managing an existing novel:
  1. publish_story()    — toggles publish status ON
  2. add_character()    — adds a character via the character modal
  3. add_intro()        — adds/edits the story introduction
"""

import json
import asyncio
from playwright.async_api import async_playwright

# ============================================================
# ⚙️  CONFIG
# ============================================================

COOKIES_FILE = "cookies.json"
ARTICLE_ID   = "54401250798bacf59733a6c611f83df9"
HEADLESS = True

EDIT_URL = (
    f"https://www.readawrite.com/"
    f"?action=manage_article&article_id={ARTICLE_ID}&tab=mainManageChapter"
)

POPUP_SELECTORS = [
    "#modal_newsfeed",
    ".modal-backdrop",
    ".swal2-container",
    "#accept_cookie_banner",
]

# ============================================================
# SHARED HELPERS
# ============================================================


async def _load_cookies(context):
    try:
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)
        print("✅ Cookies loaded.")
        return True
    except FileNotFoundError:
        print("❌ ไม่เจอ cookies.json")
        return False


async def _nuke_popups(page):
    selectors_json = json.dumps(POPUP_SELECTORS)
    await page.evaluate(f"""
    () => {{
        const items = {selectors_json};
        items.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
        document.body.classList.remove('modal-open');
        document.body.style.overflow = 'auto';
    }}
    """)
    print("🛡️ Popups cleared.")


# ============================================================
# 1️⃣  PUBLISH STORY
# ============================================================


async def publish_story():
    print("=" * 50)
    print("🟢 Publish Story")
    print("=" * 50)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()

        if not await _load_cookies(context):
            return

        page = await context.new_page()

        print(f"🔗 Navigating to: {EDIT_URL}")
        await page.goto(EDIT_URL, wait_until="load")
        await page.wait_for_timeout(3000)

        await _nuke_popups(page)

        # Toggle publish
        await page.wait_for_selector("#article_status")
        await page.locator("#article_status .slider").click()
        print("✅ Toggle publish clicked.")

        await page.wait_for_selector("button.swal2-confirm")
        await page.click("button.swal2-confirm")
        print("✅ Publish confirmed.")

        print("\n🟢 Browser will stay open…")
        await asyncio.Event().wait()


# ============================================================
# 2️⃣  ADD CHARACTER
# ============================================================

CHARACTER_NAME   = "John"
CHARACTER_STATUS = "พระเอกของเรื่อง"


async def add_character():
    print("=" * 50)
    print("👤 Add Character")
    print("=" * 50)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()

        if not await _load_cookies(context):
            return

        page = await context.new_page()
        await page.goto(EDIT_URL)
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        # Click add character button
        print("➕ Click เพิ่มตัวละคร")
        await page.locator("#btn_add_character").first.click()

        # Wait for modal
        print("⏳ Waiting for modal…")
        await page.wait_for_selector("#popup_create_character", state="visible")

        # Fill form
        print("✏️ Fill character info")
        await page.fill("#character_name",   CHARACTER_NAME)
        await page.fill("#character_status", CHARACTER_STATUS)

        # Save
        print("💾 Saving character…")
        await page.click("#saveCharacter")

        await page.wait_for_selector(".swal2-confirm", state="visible")
        print("✅ Save success popup detected")

        await page.click(".swal2-confirm")
        print("👍 Popup closed")

        await page.wait_for_timeout(3000)
        print("✅ Character created")

        await asyncio.Event().wait()


# ============================================================
# 3️⃣  ADD / EDIT INTRO
# ============================================================

INTRO_CONTENT = "นี่คือคำแนะนำเรื่องที่ถูกเพิ่มโดย Playwright bot 🤖"
INTRO_MODE    = "add"   # "add" = #btnaddintro | "edit" = #btneditaddintro


async def add_intro():
    print("=" * 50)
    print("📝 Add / Edit Intro")
    print("=" * 50)

    btn_selector = "#btnaddintro" if INTRO_MODE == "add" else "#btneditaddintro"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()

        if not await _load_cookies(context):
            return

        page = await context.new_page()

        print(f"🔗 Navigating to: {EDIT_URL}")
        await page.goto(EDIT_URL, wait_until="load")
        await page.wait_for_timeout(3000)

        await _nuke_popups(page)

        # Click intro button
        print("📝 Clicking intro button…")
        await page.wait_for_selector(btn_selector, timeout=20000)
        await page.click(btn_selector)
        print("✅ Intro button clicked")

        # Fill CKEditor
        await page.wait_for_selector(".ck-editor__editable", timeout=10000)
        editor = page.locator(".ck-editor__editable")
        await editor.click()
        await editor.fill(INTRO_CONTENT)
        print("✅ Intro content filled")

        # Save
        await page.wait_for_selector("#btnSaveContentArticle", timeout=10000)
        await page.click("#btnSaveContentArticle")
        print("✅ Intro saved")

        # Keep as draft
        await page.wait_for_selector("#btnUnpublished", timeout=10000)
        await page.click("#btnUnpublished")
        print("✅ Clicked 'เอาไว้ก่อนจ้า'")

        await page.wait_for_timeout(2000)

        html = await page.content()
        with open("intro_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("✅ Saved intro_page.html")

        print("\n🟢 Browser will stay open…")
        await asyncio.Event().wait()


# ============================================================
# ENTRY POINT — pick which function to run
# ============================================================

if __name__ == "__main__":
    import sys

    actions = {
        "publish":   publish_story,
        "character": add_character,
        "intro":     add_intro,
    }

    action = sys.argv[1] if len(sys.argv) > 1 else "publish"

    if action not in actions:
        print(f"Usage: python manage_story.py [{'|'.join(actions)}]")
        sys.exit(1)

    asyncio.run(actions[action]())
