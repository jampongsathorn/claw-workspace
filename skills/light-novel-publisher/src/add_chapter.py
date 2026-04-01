"""
add_chapter.py
--------------
Adds a new chapter to an existing novel on ReadAWrite.
Fills content in CKEditor, publishes, and sets the chapter price.
"""

import json
import asyncio
from playwright.async_api import async_playwright

# ============================================================
# ⚙️  CONFIG
# ============================================================

COOKIES_FILE     = "cookies.json"
ARTICLE_ID       = "54401250798bacf59733a6c611f83df9"
OUTPUT_HTML_FILE = "new_chapter.html"
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
# ✏️  CHAPTER SETTINGS — edit only this part
# ============================================================

CHAPTER_TITLE    = "บทที่ 1"
CHAPTER_SUBTITLE = "การเริ่มต้นของการเดินทาง"
CHAPTER_CONTENT  = """\
นี่คือเนื้อหาตอนที่ 1

ทดสอบการใส่เนื้อหาด้วย Playwright 🤖

ระบบควรจะสามารถเผยแพร่ได้แล้ว\
"""

WRITER_NOTE   = "ข้อความจากนักเขียน"
CHAPTER_PRICE = "5"  # เหรียญ (ใส่ "0" ถ้าอยากให้ฟรี)

# ============================================================


async def add_new_chapter():
    print("=" * 50)
    print("✏️  Entering Edit Mode — Add New Chapter")
    print("=" * 50)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()

        # Load cookies
        try:
            with open(COOKIES_FILE, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            await context.add_cookies(cookies)
            print("✅ Cookies loaded.")
        except FileNotFoundError:
            print("❌ ไม่เจอ cookies.json")
            return

        page = await context.new_page()

        # Navigate to edit page
        print(f"🔗 Navigating to: {EDIT_URL}")
        await page.goto(EDIT_URL, wait_until="load")
        await page.wait_for_timeout(3000)

        # Nuke popups
        print("💥 Nuking popups…")
        selectors_json = json.dumps(POPUP_SELECTORS)
        await page.evaluate(f"""() => {{
            const items = {selectors_json};
            items.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
            document.body.classList.remove('modal-open');
            document.body.style.overflow = 'auto';
        }}""")
        print("🛡️ Popups cleared.")

        # Open new chapter form
        await page.get_by_role("button", name="เพิ่มตอนใหม่").click()
        await page.wait_for_load_state("networkidle")

        # Fill chapter number & title
        await page.fill("#chapter_title",    CHAPTER_TITLE)
        await page.fill("#chapter_subtitle", CHAPTER_SUBTITLE)
        print("✅ Chapter title filled.")

        # Fill main content in CKEditor
        editor = page.locator("#contain_chapter_content .ck-editor__editable").first
        await editor.wait_for()
        await editor.click()
        await editor.fill(CHAPTER_CONTENT)
        print("✅ Chapter content inserted.")

        # Fill writer's note (second CKEditor)
        editor2 = page.locator(".ck-editor__editable").nth(1)
        await editor2.click()
        await editor2.fill(WRITER_NOTE)
        print("✅ Writer note inserted.")

        # Save draft → publish
        await page.click("#btnSaveDraft")
        await page.wait_for_selector("#btnSaveMaster", timeout=10000)
        await page.click("#btnSaveMaster")
        print("✅ Published successfully.")

        # Set chapter price
        await page.wait_for_selector("tr[chapter_guid]")
        chapter_guid = await page.locator("tr[chapter_guid]").first.get_attribute("chapter_guid")
        print(f"📖 Latest chapter GUID: {chapter_guid}")

        await page.evaluate(f"manageChapter.checkUserType('{chapter_guid}')")
        await page.wait_for_selector("#input_baht_price", timeout=10000)
        await page.fill("#input_baht_price", "")
        await page.fill("#input_baht_price", CHAPTER_PRICE)
        print(f"✅ Price set to {CHAPTER_PRICE} เหรียญ.")

        await page.click("#saveEditPrice")
        await page.wait_for_selector(".swal2-confirm", timeout=10000)
        await page.click(".swal2-confirm")
        print("✅ Price saved & popup closed.")

        # Save snapshot
        html = await page.content()
        with open(OUTPUT_HTML_FILE, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"✅ Saved {OUTPUT_HTML_FILE}")

        print("\n🟢 Browser will stay open…")
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(add_new_chapter())
