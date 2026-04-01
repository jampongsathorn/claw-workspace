"""
server.py - ReadAWrite MCP Server
==================================
FastMCP server exposing ReadAWrite novel-management automation as callable tools.
Designed for use with AI agents (e.g. OpenClaw / Claude).

Tools
-----
list_all_novels       – List every novel (published + drafts) from your profile
find_novel_id         – Search novels by name
get_chapters          – List all chapters of a novel
get_chapter_content   – Read the text content of a chapter
create_story          – Create a new novel (title, synopsis, category, tags)
add_chapter           – Add a chapter, publish it, and optionally set coin price
set_chapter_price     – Change the coin price of an existing chapter
publish_story         – Toggle the "published" switch ON for a novel
add_character         – Add a character to a novel
add_intro             – Add or edit the story introduction
extract_categories    – Return the live primary/secondary category map
"""

import json
import os
import re
from typing import Optional, Union

from fastmcp import FastMCP
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup


# ──────────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────────

COOKIES_FILE = os.getenv("RAW_COOKIES_FILE", "cookies.json")
USER_ID      = os.getenv("RAW_USER_ID", "14999966")
HEADLESS     = os.getenv("RAW_HEADLESS", "true").lower() != "false"

BASE_URL        = "https://www.readawrite.com"
CREATE_URL      = f"{BASE_URL}/?action=main_manage_article&create=1"
MANAGE_URL      = f"{BASE_URL}/?action=main_manage_article"
USER_PAGE_URL   = f"{BASE_URL}/?action=user_page&user_publisher_id={USER_ID}"

POPUP_SELECTORS = [
    "#modal_newsfeed",
    ".modal-backdrop",
    ".swal2-container",
    "#accept_cookie_banner",
]

# Hard-coded category map (use extract_categories() to refresh from live site)
CATEGORY_MAP = {
    "primary": {
        "นิยายรัก":               {"id": 13, "group_id": 83},
        "นิยายโรมานซ์":            {"id": 27, "group_id": 83},
        "นิยายรักจีนโบราณ":        {"id": 43, "group_id": 83},
        "นิยายรักวัยรุ่น":          {"id":  7, "group_id": 83},
        "นิยายรักวัยว้าวุ่น":        {"id": 39, "group_id": 83},
        "นิยายรักสำหรับผู้ใหญ่":    {"id":  5, "group_id": 83},
        "นิยาย Boy Love Lovely Room": {"id": 32, "group_id": 84},
        "นิยาย Boy Love Party Room":  {"id": 55, "group_id": 84},
        "นิยาย Boy Love Secret Room": {"id": 54, "group_id": 84},
        "นิยาย Girl Love/Yuri":       {"id": 31, "group_id": 85},
        "นิยาย Girl Love Party Room": {"id": 56, "group_id": 85},
        "นิยาย Girl Love Secret Room":{"id": 57, "group_id": 85},
        "แฟนตาซี เกมออนไลน์ ต่างโลก":{"id": 58, "group_id": 86},
        "Sci-fi":                     {"id": 59, "group_id": 86},
        "ผจญภัย แอคชั่น กำลังภายใน": {"id": 60, "group_id": 86},
        "สืบสวน":                     {"id": 61, "group_id": 86},
        "ลึกลับ":                     {"id": 62, "group_id": 86},
        "สยองขวัญ":                   {"id": 63, "group_id": 86},
        "สะท้อนสังคม":                {"id": 64, "group_id": 86},
        "แนวทางเลือก":               {"id": 65, "group_id": 86},
        "วรรณกรรมเยาวชน":            {"id":  6, "group_id": 86},
    },
    "secondary": {
        "สืบสวน":         {"id": 61, "group_id": 87},
        "ลึกลับ":         {"id": 62, "group_id": 87},
        "สยองขวัญ":       {"id": 63, "group_id": 87},
        "สะท้อนสังคม":    {"id": 64, "group_id": 87},
        "แนวทางเลือก":   {"id": 65, "group_id": 87},
        "วรรณกรรมเยาวชน":{"id":  6, "group_id": 87},
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def _parse_list(value: Union[list, str]) -> list:
    """Accept a Python list or JSON/comma-separated string → always return list."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        value = value.strip()
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
        if value.startswith("[") and value.endswith("]"):
            value = value[1:-1]
        if "," in value:
            return [x.strip() for x in value.split(",") if x.strip()]
        return [value] if value else []
    return []


def _resolve_primary(name: str):
    cat = CATEGORY_MAP["primary"].get(name)
    if not cat:
        raise ValueError(
            f"Unknown primary category: '{name}'. "
            f"Valid options: {list(CATEGORY_MAP['primary'].keys())}"
        )
    return name, str(cat["id"]), str(cat["group_id"])


def _resolve_secondary(names: list):
    if len(names) > 2:
        raise ValueError("Max 2 secondary categories allowed.")
    if len(names) != len(set(names)):
        raise ValueError("Secondary categories must be unique.")
    result = []
    for i, name in enumerate(names, start=1):
        cat = CATEGORY_MAP["secondary"].get(name)
        if not cat:
            raise ValueError(
                f"Unknown secondary category: '{name}'. "
                f"Valid options: {list(CATEGORY_MAP['secondary'].keys())}"
            )
        result.append({
            "order": i, "id": cat["id"], "group_id": cat["group_id"],
            "name": name, "description": name,
        })
    return result


def _edit_url(article_id: str, tab: str = "") -> str:
    url = f"{BASE_URL}/?action=manage_article&article_id={article_id}"
    if tab:
        url += f"&tab={tab}"
    return url


async def _make_page(playwright):
    """Launch headless browser, inject cookies, return (browser, page)."""
    browser = await playwright.chromium.launch(headless=HEADLESS)
    context = await browser.new_context()
    try:
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)
    except FileNotFoundError:
        await browser.close()
        raise FileNotFoundError(f"Cookies file not found: {COOKIES_FILE}")
    page = await context.new_page()
    return browser, page


async def _nuke_popups(page):
    """Remove modal overlays that block interaction."""
    sel_json = json.dumps(POPUP_SELECTORS)
    await page.evaluate(f"""() => {{
        {sel_json}.forEach(s =>
            document.querySelectorAll(s).forEach(el => el.remove())
        );
        document.body.classList.remove('modal-open');
        document.body.style.overflow = 'auto';
    }}""")


async def _confirm_swal(page, timeout: int = 8000):
    """Click the green SweetAlert2 confirm button if it appears."""
    try:
        await page.wait_for_selector(".swal2-confirm", state="visible", timeout=timeout)
        await page.click(".swal2-confirm")
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# MCP SERVER
# ──────────────────────────────────────────────────────────────────────────────

mcp = FastMCP("readawrite")


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 1 – LIST ALL NOVELS (published + drafts)
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_all_novels() -> dict:
    """
    Return every novel on your account (published and drafts).

    Returns:
        {
          "published": [{"id": "...", "title": "..."}],
          "drafts":    [{"id": "...", "title": "..."}]
        }
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        # ── Published novels from the author's public profile page ────────
        await page.goto(USER_PAGE_URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        # Scroll to load all lazy-loaded cards
        for _ in range(4):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(800)

        soup = BeautifulSoup(await page.content(), "html.parser")

        published, drafts = [], []
        seen = set()

        # Published novels live inside #articleListResult
        container = soup.select_one("#articleListResult") or soup
        for item in container.select(".listArticleItem"):
            try:
                link = item.select_one("a[href*='/a/'], a[href*='article_id=']")
                if not link:
                    continue
                href = link.get("href", "")
                m = re.search(r"/a/([A-Za-z0-9_\-]+)", href) or \
                    re.search(r"article_id=([a-zA-Z0-9]+)", href)
                if not m:
                    continue
                article_id = m.group(1)
                if article_id in seen:
                    continue
                seen.add(article_id)

                title_el = item.select_one(".listArticleName, .height2Line")
                title = title_el.get_text(strip=True) if title_el else link.get_text(strip=True) or "Untitled"
                published.append({"id": article_id, "title": title})
            except Exception:
                continue

        # ── Draft novels from the manage page ─────────────────────────────
        await page.goto(MANAGE_URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        for _ in range(3):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(800)

        soup2 = BeautifulSoup(await page.content(), "html.parser")
        for item in soup2.select(".listArticleItem"):
            try:
                link = item.select_one("a[href*='/a/'], a[href*='article_id=']")
                if not link:
                    continue
                href = link.get("href", "")
                m = re.search(r"/a/([A-Za-z0-9_\-]+)", href) or \
                    re.search(r"article_id=([a-zA-Z0-9]+)", href)
                if not m:
                    continue
                article_id = m.group(1)
                if article_id in seen:
                    continue  # already counted as published

                title_el = item.select_one(".listArticleName, .height2Line")
                title = title_el.get_text(strip=True) if title_el else link.get_text(strip=True) or "Untitled"

                is_draft = "ฉบับร่าง" in item.get_text() or \
                           bool(item.select_one("[class*='draft'], .label-draft"))
                if is_draft:
                    seen.add(article_id)
                    drafts.append({"id": article_id, "title": title})
            except Exception:
                continue

        await browser.close()
        return {"published": published, "drafts": drafts}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 2 – FIND NOVEL BY NAME
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def find_novel_id(novel_name: str) -> dict:
    """
    Search your novels by title keyword (case-insensitive, partial match).

    Args:
        novel_name: Partial or full title to search for.

    Returns:
        {"results": [{"id": "...", "title": "...", "status": "published|draft"}]}
    """
    all_novels = await list_all_novels()
    results = []
    keyword = novel_name.lower()
    for status, items in [("published", all_novels["published"]), ("draft", all_novels["drafts"])]:
        for item in items:
            if keyword in item["title"].lower():
                results.append({**item, "status": status})
    return {"results": results}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 3 – GET CHAPTERS
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def get_chapters(article_id: str) -> dict:
    """
    List all chapters of a novel.

    Args:
        article_id: The novel's article ID (32-char hex string).

    Returns:
        {"chapters": [{"guid": "...", "title": "...", "status": "..."}]}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)
        url = _edit_url(article_id, "mainManageChapter")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await _nuke_popups(page)

        # Scroll down to trigger any lazy-loading of chapter rows
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(1500)

        # Wait explicitly for AJAX-rendered chapter rows (up to 15s)
        try:
            await page.wait_for_selector("tr[chapter_guid]", timeout=15000)
        except Exception:
            # If still not found, try clicking the chapter tab explicitly
            try:
                await page.click('a[href*="mainManageChapter"], a:has-text("จัดการตอน")', timeout=5000)
                await page.wait_for_timeout(3000)
                await page.wait_for_selector("tr[chapter_guid]", timeout=10000)
            except Exception:
                pass
        await page.wait_for_timeout(500)

        soup = BeautifulSoup(await page.content(), "html.parser")
        rows = soup.select("tr[chapter_guid]")

        chapters = []
        for row in rows:
            guid = row.get("chapter_guid", "")
            # Title text is usually in .chapter-list-title or the first td
            title_el = row.select_one(".chapter-list-title, td:first-child")
            title = title_el.get_text(strip=True) if title_el else ""
            # Status
            status_el = row.select_one(".chapter-status, .status-label, [class*='status']")
            status = status_el.get_text(strip=True) if status_el else "unknown"
            chapters.append({"guid": guid, "title": title, "status": status})

        await browser.close()

        if chapters:
            return {"article_id": article_id, "chapters": chapters}
        return {"article_id": article_id, "chapters": [], "note": "No chapters found"}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 4 – GET CHAPTER CONTENT
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def get_chapter_content(article_id: str, chapter_id: str = "") -> dict:
    """
    Read the published text content of a chapter.

    Args:
        article_id: The novel's article ID.
        chapter_id: Chapter GUID or leave empty for the first chapter.

    Returns:
        {"title": "...", "content": "...", "content_length": N}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = f"{BASE_URL}/a/{article_id}"
        if chapter_id:
            url += f"/{chapter_id}"

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)

        soup = BeautifulSoup(await page.content(), "html.parser")

        # Chapter title — try multiple selectors (ReadAWrite may use .chapterTitleAndSubTitle)
        title_el = (
            soup.select_one(".chapterTitleAndSubTitle")
            or soup.select_one("#chapter_title_area")
            or soup.select_one("h1.chapter-title")
            or soup.select_one(".chapter-name")
            or soup.select_one("h1")
        )
        title = title_el.get_text(strip=True) if title_el else ""

        # Try known content containers
        content = ""
        for sel in ["#chapter_content", ".chapter-content", "#content_story", ".content-story", ".readContent"]:
            el = soup.select_one(sel)
            if el and len(el.get_text(strip=True)) > 50:
                content = el.get_text(separator="\n", strip=True)
                break

        # Fallback: paragraphs
        if not content:
            content = "\n\n".join(
                p.get_text(strip=True)
                for p in soup.select("p")
                if len(p.get_text(strip=True)) > 10
            )

        await browser.close()

        if content:
            return {
                "article_id": article_id,
                "chapter_id": chapter_id,
                "title": title,
                "content": content[:10000],
                "content_length": len(content),
            }
        return {"error": "No content found", "article_id": article_id}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 5 – CREATE STORY
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def create_story(
    title: str,
    synopsis: str,
    main_category: str,
    secondary_categories: Union[list, str] = [],
    tags: Union[list, str] = [],
    content_rating: str = "4",
) -> dict:
    """
    Create a new novel on ReadAWrite.

    Args:
        title:                Novel title.
        synopsis:             Short description shown to readers.
        main_category:        Primary category name (Thai). Use extract_categories() to list options.
        secondary_categories: Up to 2 secondary categories (list or comma-separated string).
        tags:                 List of tags (list or comma-separated string).
        content_rating:       "4"=ทั่วไป, "3"=13+, "2"=15+, "1"=18+

    Returns:
        {"success": true, "article_id": "...", "title": "..."}
    """
    sec_cats_list = _parse_list(secondary_categories)
    tags_list = _parse_list(tags)
    main_name, main_id, main_group = _resolve_primary(main_category)
    sec_cats = _resolve_secondary(sec_cats_list)

    async with async_playwright() as p:
        browser, page = await _make_page(p)

        await page.goto(CREATE_URL, wait_until="load")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        # Step 1: Choose type (original novel, narrative, multi-chapter)
        try:
            await page.click('label:has-text("นิยายออริจินอล")', force=True)
            await page.click('label:has-text("บรรยาย")', force=True)
            await page.click('label:has-text("มีหลายตอน")', force=True)
            await page.click("#btn_create_article")
            await page.wait_for_timeout(2000)
        except Exception:
            pass

        await page.wait_for_selector("#article_name", timeout=30000)

        # Extract article_id from URL immediately after form loads
        article_id = None
        m = re.search(r"article_id=([a-zA-Z0-9]+)", page.url)
        if m:
            article_id = m.group(1)
        if not article_id:
            # Try hidden input fields
            article_id = await page.evaluate("""() => {
                const el = document.querySelector('input[name="article_id"], #article_id, [data-article-id], [data-id]');
                return el ? el.value || el.getAttribute('data-article-id') || el.getAttribute('data-id') : null;
            }""")
        if not article_id:
            html = await page.content()
            m = re.search(r'article_id[="\']+([a-zA-Z0-9]{32,})', html)
            if m:
                article_id = m.group(1)

        # Step 2: Fill basic info
        await page.fill("#article_name", title)
        await page.fill("#article_synopsis", synopsis)
        await page.select_option("#content_rating", content_rating)

        # Step 3: Set primary category
        await page.evaluate(f"setCategory('{main_name}', '{main_id}', '{main_group}')")

        # Step 4: Set secondary categories
        if sec_cats:
            sec_json = json.dumps(sec_cats)
            await page.evaluate(f"""() => {{
                const cats = {sec_json};
                cats.forEach(cat => {{
                    article.setDataSecondaryCategory(
                        cat.order, cat.id, cat.group_id, cat.name, cat.description
                    );
                }});
                cats.forEach(cat => {{
                    const el = document.querySelector('.secondary_category_name' + cat.order);
                    if (el) el.innerText = cat.name;
                }});
                document.querySelectorAll('.secondary_category')
                    .forEach(el => el.classList.remove('color-invalid'));
            }}""")

        # Step 5: Add tags
        tag_input = page.locator(".tagit-new input")
        for tag in tags_list:
            await tag_input.fill(tag)
            await tag_input.press("Enter")
            await page.wait_for_timeout(300)

        # Step 6: Select AI cover = No
        await page.evaluate(
            """() => {
                const el = document.querySelector('input[name="is_ai_cover"][value="0"]');
                if (el) el.click();
            }"""
        )

        await _nuke_popups(page)

        # Step 7: Save — wait for network response to confirm article was saved
        await page.wait_for_selector("#btnSaveArticle", state="visible", timeout=10000)
        save_promise = page.expect_response(
            lambda resp: "/article" in resp.url and resp.status in (200, 201, 302),
            timeout=30000
        )
        await page.click("#btnSaveArticle")
        try:
            await save_promise
        except Exception:
            pass
        await page.wait_for_timeout(5000)
        await _nuke_popups(page)

        # Extract article_id from URL, hidden fields, or JavaScript state
        article_id = None
        current_url = page.url
        m = re.search(r"article_id=([a-zA-Z0-9]{20,40})", current_url)
        if m:
            article_id = m.group(1)
        if not article_id:
            article_id = await page.evaluate("""() => {
                // Try hidden form field
                const hidden = document.querySelector('input[type="hidden"][name="article_id"], #article_id_input');
                if (hidden) return hidden.value;
                // Try URL hash
                const hashMatch = location.href.match(/article_id[=&#]([a-zA-Z0-9]{20,40})/);
                if (hashMatch) return hashMatch[1];
                // Try global JS variable
                const keys = Object.keys(window).filter(k => k.includes('article') || k.includes('story') || k.includes('novel'));
                for (const k of keys) {
                    const v = window[k];
                    if (typeof v === 'object' && v !== null && v.id) return v.id;
                }
                // Try data attributes
                const dataEl = document.querySelector('[data-article-id], [data-id]');
                if (dataEl) return dataEl.getAttribute('data-article-id') || dataEl.getAttribute('data-id');
                return null;
            }""")
        if not article_id:
            html = await page.content()
            m = re.search(r'article_id[="\']+([a-zA-Z0-9]{32,})', html)
            if m:
                article_id = m.group(1)

        await browser.close()

        if article_id:
            return {"success": True, "article_id": article_id, "title": title}
        return {"success": True, "article_id": None, "title": title,
                "note": "Story created but could not extract article_id from URL"}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 6 – ADD CHAPTER  (publish + optional coin price)
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def add_chapter(
    article_id: str,
    chapter_title: str,
    chapter_subtitle: str,
    chapter_content: str,
    writer_note: str = "",
    chapter_price: str = "0",
) -> dict:
    """
    Add a new chapter to a novel, publish it, and optionally set a coin price.

    Args:
        article_id:       The novel's article ID.
        chapter_title:    Chapter number label, e.g. "บทที่ 1".
        chapter_subtitle: Chapter subtitle / episode name.
        chapter_content:  Full body text of the chapter.
        writer_note:      Optional author's note shown at the bottom.
        chapter_price:    Coin price as a string: "0" = free, "5" = 5 coins, etc.

    Returns:
        {"success": true, "chapter_guid": "...", "title": "..."}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = _edit_url(article_id, "mainManageChapter")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        await _nuke_popups(page)

        # ── Open new-chapter form ──────────────────────────────────────────
        try:
            await page.locator("button:has-text('เพิ่มตอนใหม่')").first.click(timeout=3000)
        except Exception:
            await page.evaluate("document.querySelector('#btn_add_chapter')?.click()")
        await page.wait_for_timeout(2000)
        await _nuke_popups(page)

        # ── Fill title & subtitle ──────────────────────────────────────────
        await page.fill("#chapter_title",    chapter_title)
        await page.fill("#chapter_subtitle", chapter_subtitle)

        # ── Fill body content in CKEditor (first instance) ──────────────
        editor1 = page.locator("#contain_chapter_content .ck-editor__editable").first
        try:
            await editor1.wait_for(timeout=8000)
        except Exception:
            editor1 = page.locator(".ck-editor__editable").first
        await editor1.click()
        await editor1.fill(chapter_content)

        # ── Fill writer note (second CKEditor) ────────────────────────────
        if writer_note:
            editor2 = page.locator(".ck-editor__editable").nth(1)
            await editor2.click()
            await editor2.fill(writer_note)

        # ── Save as draft first ───────────────────────────────────────────
        await _nuke_popups(page)
        await page.wait_for_selector("#btnSaveDraft", state="visible", timeout=10000)
        await page.click("#btnSaveDraft")

        # ── Publish ───────────────────────────────────────────────────────
        await page.wait_for_selector("#btnSaveMaster", state="visible", timeout=15000)
        await page.click("#btnSaveMaster")
        await page.wait_for_timeout(3000)

        # ── Get the new chapter's GUID ────────────────────────────────────
        await page.wait_for_selector("tr[chapter_guid]", timeout=10000)
        chapter_guid = await page.locator("tr[chapter_guid]").first.get_attribute("chapter_guid")

        # ── Set coin price (skip if 0) ────────────────────────────────────
        if chapter_guid and str(chapter_price) != "0":
            try:
                await page.evaluate(f"manageChapter.checkUserType('{chapter_guid}')")
                await page.wait_for_selector("#input_baht_price", state="visible", timeout=10000)
                await page.fill("#input_baht_price", "")
                await page.fill("#input_baht_price", str(chapter_price))
                await page.click("#saveEditPrice")
                await _confirm_swal(page)
            except Exception as e:
                # Price not set is non-fatal
                pass

        await browser.close()
        return {
            "success": True,
            "article_id": article_id,
            "chapter_guid": chapter_guid or "",
            "title": f"{chapter_title} — {chapter_subtitle}",
            "price": chapter_price,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 7 – SET CHAPTER PRICE
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def set_chapter_price(article_id: str, chapter_guid: str, price: str = "0") -> dict:
    """
    Update the coin price for an existing chapter.

    Args:
        article_id:   The novel's article ID.
        chapter_guid: The chapter GUID (from get_chapters).
        price:        Coin price as string: "0" = free, "5" = 5 coins.

    Returns:
        {"success": true, "chapter_guid": "...", "price": "..."}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = _edit_url(article_id, "mainManageChapter")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        await page.evaluate(f"manageChapter.checkUserType('{chapter_guid}')")
        await page.wait_for_selector("#input_baht_price", state="visible", timeout=10000)
        await page.fill("#input_baht_price", "")
        await page.fill("#input_baht_price", str(price))
        await page.click("#saveEditPrice")
        await _confirm_swal(page)

        await browser.close()
        return {"success": True, "chapter_guid": chapter_guid, "price": str(price)}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 8 – PUBLISH STORY
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def publish_story(article_id: str) -> dict:
    """
    Toggle the "Published" switch ON for a novel (makes it visible to readers).
    Safe to call even if the novel is already published.

    Args:
        article_id: The novel's article ID.

    Returns:
        {"success": true, "article_id": "..."}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = _edit_url(article_id)
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(4000)
        await _nuke_popups(page)

        # Click the slider (toggle) inside #article_status
        await page.wait_for_selector("#article_status .slider", timeout=10000)
        await page.locator("#article_status .slider").click()
        await page.wait_for_timeout(1000)

        # Confirm the SweetAlert2 popup
        await _confirm_swal(page)
        await page.wait_for_timeout(2000)

        await browser.close()
        return {"success": True, "article_id": article_id}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 9 – ADD CHARACTER
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def add_character(
    article_id: str,
    character_name: str,
    character_status: str,
) -> dict:
    """
    Add a character entry to a novel.

    Args:
        article_id:       The novel's article ID.
        character_name:   Character's name.
        character_status: Character's role, e.g. "พระเอกของเรื่อง".

    Returns:
        {"success": true, "character_name": "..."}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = _edit_url(article_id, "mainManageCharacter")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3500)
        await _nuke_popups(page)

        # Open add-character modal
        await page.wait_for_selector("#btn_add_character", timeout=10000)
        await page.locator("#btn_add_character").first.click()

        # Wait for modal
        await page.wait_for_selector("#popup_create_character", state="visible", timeout=10000)

        # Fill form
        await page.fill("#character_name",   character_name)
        await page.fill("#character_status", character_status)

        # Save
        await page.click("#saveCharacter")
        await _confirm_swal(page)
        await page.wait_for_timeout(2000)

        await browser.close()
        return {"success": True, "article_id": article_id, "character_name": character_name}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 10 – ADD / EDIT INTRO
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def add_intro(
    article_id: str,
    intro_content: str,
    mode: str = "add",
) -> dict:
    """
    Add or edit the story introduction paragraph.

    Args:
        article_id:    The novel's article ID.
        intro_content: The intro text to set.
        mode:          "add" (new intro) or "edit" (update existing intro).

    Returns:
        {"success": true, "article_id": "..."}
    """
    btn_selector = "#btnaddintro" if mode == "add" else "#btneditaddintro"

    async with async_playwright() as p:
        browser, page = await _make_page(p)

        await page.goto(_edit_url(article_id), wait_until="load")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        # Make sure the "ข้อมูลนิยาย" tab is active
        try:
            await page.click('a:has-text("ข้อมูลนิยาย")', timeout=5000)
            await page.wait_for_timeout(2000)
        except Exception:
            pass

        await page.wait_for_selector(btn_selector, state="visible", timeout=20000)
        await page.evaluate(f"document.querySelector('{btn_selector}')?.scrollIntoView()")
        await page.wait_for_timeout(500)
        await _nuke_popups(page)
        await page.click(btn_selector, force=True)

        # Fill CKEditor
        await page.wait_for_selector(".ck-editor__editable", timeout=10000)
        editor = page.locator(".ck-editor__editable").first
        await editor.click()
        await editor.fill(intro_content)

        # Save
        await page.wait_for_selector("#btnSaveContentArticle", timeout=10000)
        await page.click("#btnSaveContentArticle")

        # Keep as draft ("เอาไว้ก่อนจ้า")
        try:
            await page.wait_for_selector("#btnUnpublished", timeout=8000)
            await page.click("#btnUnpublished")
        except Exception:
            pass

        await page.wait_for_timeout(2000)
        await browser.close()
        return {"success": True, "article_id": article_id, "mode": mode}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 11 – EXTRACT CATEGORIES (live)
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def extract_categories() -> dict:
    """
    Scrape the current primary and secondary category list from the live site.
    Use this to refresh CATEGORY_MAP when new categories are added.

    Returns:
        {"primary": {"ชื่อหมวด": {"id": N, "group_id": N}}, "secondary": {...}}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        await page.goto(CREATE_URL, wait_until="networkidle")
        await page.wait_for_timeout(3000)

        categories = await page.evaluate("""() => {
            const result = { primary: {}, secondary: {} };

            document.querySelectorAll("[onclick*='setCategory']").forEach(el => {
                const m = el.getAttribute("onclick").match(
                    /setCategory\\(['"](.*?)['"]\\s*,\\s*['"]?(\\d+)['"]?\\s*,\\s*['"]?(\\d+)/
                );
                if (m) result.primary[m[1]] = { id: +m[2], group_id: +m[3] };
            });

            document.querySelectorAll("[onclick*='setDataSecondaryCategory']").forEach(el => {
                const m = el.getAttribute("onclick").match(
                    /setDataSecondaryCategory\\(\\s*\\d+\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*['"](.*?)['"]/
                );
                if (m) result.secondary[m[3]] = { id: +m[1], group_id: +m[2] };
            });

            return result;
        }""")

        await browser.close()

        # Fall back to hardcoded map if live scrape returns empty
        if not categories.get("primary"):
            categories = CATEGORY_MAP.copy()

        return categories


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 12 – GET NOVEL INFO  (public page — works on any novel, not just yours)
# ──────────────────────────────────────────────────────────────────────────────

def _parse_article_id_from_url(url: str) -> str:
    """Extract short slug or full ID from a readawrite /a/ URL."""
    m = re.search(r"/a/([A-Za-z0-9_\-]+)", url)
    return m.group(1) if m else ""


def _parse_novel_card(el) -> dict:
    """Parse a .listArticleItem element into a structured dict."""
    title_el  = el.select_one(".listArticleName, .height2Line.listVertArticleNameSmall")
    author_el = el.select_one(".listAuthorName a, .listVertArticleAuthorNameSmall a")
    desc_el   = el.select_one(".listArticleDescription")
    view_el   = el.select_one(".view")
    link_el   = el.select_one("a[href*='/a/']")
    tags      = [t.get_text(strip=True) for t in el.select(".tagListInHoriArtileList_1Line, .zoneTag span") if t.get_text(strip=True)]
    href      = link_el["href"] if link_el else ""
    slug      = _parse_article_id_from_url(href)
    return {
        "slug":        slug,
        "url":         href,
        "title":       title_el.get_text(strip=True) if title_el else "",
        "author":      author_el.get_text(strip=True) if author_el else "",
        "description": desc_el.get_text(strip=True) if desc_el else "",
        "views":       view_el.get_text(strip=True) if view_el else "",
        "tags":        tags[:8],
    }


@mcp.tool()
async def get_novel_info(article_id: str) -> dict:
    """
    Get public information about any novel by its article ID or short slug.

    Args:
        article_id: The novel's article ID (hex) or short slug (e.g. "Zhj00j").

    Returns:
        {
          "title": "...", "author": "...", "synopsis": "...",
          "category": "...", "views": "...", "chapters_count": "...",
          "tags": [...], "url": "..."
        }
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = f"{BASE_URL}/a/{article_id}"
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        soup = BeautifulSoup(await page.content(), "html.parser")

        # Title: ReadAWrite uses p.txtSize36 or #articleNameInFixed (NOT h1)
        title_el    = soup.select_one("p.txtSize36, #articleNameInFixed, h1.article-title, h1")
        # Author: try multiple known selectors for author name
        author_el   = (
            soup.select_one(".author_in_main_cover a")
            or soup.select_one(".author_in_main_cover")
            or soup.select_one(".authorName a")
            or soup.select_one(".authorName")
            or soup.select_one("[class*='author'] a")
            or soup.select_one("[class*='author']")
        )
        synopsis_el = soup.select_one(".articleSynopsis, [class*='articleSynopsis']")
        views_el    = soup.select_one(".viewCount.viewCountAbs, .viewCount")
        chapters_el = soup.select_one(".chapter_amount")
        # Category link contains category_id in its href
        category_el = soup.select_one("a[href*='category_id']")

        # Chapter list from public page
        chapter_rows = []
        for row in soup.select(".chapter_list")[:30]:
            title_span = row.select_one(".chapterTitleAndSubTitle, .purchase_chapter")
            price_span = row.select_one("[class*='price'], .btn-buy, [class*='coin']")
            link_a     = row.select_one("a[href*='/a/']")
            chapter_rows.append({
                "title": title_span.get_text(" ", strip=True) if title_span else "",
                "price": price_span.get_text(strip=True) if price_span else "free",
                "url":   link_a["href"] if link_a else "",
            })

        await browser.close()
        return {
            "article_id":     article_id,
            "url":            url,
            "title":          title_el.get_text(strip=True) if title_el else "",
            "author":         author_el.get_text(strip=True) if author_el else "",
            "synopsis":       synopsis_el.get_text(strip=True) if synopsis_el else "",
            "category":       category_el.get_text(strip=True) if category_el else "",
            "views":          views_el.get_text(strip=True) if views_el else "",
            "chapters_count": chapters_el.get_text(strip=True) if chapters_el else "",
            "chapters":       chapter_rows,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 13 – GET TRENDING NOVELS
# ──────────────────────────────────────────────────────────────────────────────

# Category ID map for convenience
CATEGORY_ID_MAP = {
    "นิยายรัก":                  {"id": 13, "group_id": 83},
    "นิยายโรมานซ์":               {"id": 27, "group_id": 83},
    "นิยายรักจีนโบราณ":           {"id": 43, "group_id": 83},
    "นิยายรักวัยรุ่น":             {"id":  7, "group_id": 83},
    "นิยายรักสำหรับผู้ใหญ่":       {"id":  5, "group_id": 83},
    "นิยาย Boy Love Lovely Room":  {"id": 32, "group_id": 84},
    "นิยาย Boy Love Party Room":   {"id": 55, "group_id": 84},
    "นิยาย Girl Love/Yuri":        {"id": 31, "group_id": 85},
    "แฟนตาซี เกมออนไลน์ ต่างโลก": {"id": 58, "group_id": 86},
    "Sci-fi":                      {"id": 59, "group_id": 86},
    "ผจญภัย แอคชั่น กำลังภายใน":  {"id": 60, "group_id": 86},
    "สืบสวน":                      {"id": 61, "group_id": 86},
    "ลึกลับ":                      {"id": 62, "group_id": 86},
    "สยองขวัญ":                    {"id": 63, "group_id": 86},
    "สะท้อนสังคม":                 {"id": 64, "group_id": 86},
}


@mcp.tool()
async def get_trending_novels(
    category_name: str = "",
    limit: int = 20,
) -> dict:
    """
    Get trending / popular novels sitewide or filtered by category.

    Args:
        category_name: Thai category name (e.g. "นิยายรัก"). Leave empty for homepage mix.
        limit:         Max number of novels to return (default 20).

    Returns:
        {"category": "...", "novels": [{"title","author","views","tags","url",...}]}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        if category_name and category_name in CATEGORY_ID_MAP:
            cat = CATEGORY_ID_MAP[category_name]
            url = (
                f"{BASE_URL}/?action=index_sub_category&view=PopularNew"
                f"&category_group_id={cat['group_id']}"
                f"&article_species=FICTION&page_type=ORIGINAL"
                f"&category_id={cat['id']}"
                f"&category_name={category_name}"
            )
        else:
            url = BASE_URL  # Homepage — has all category zones

        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await _nuke_popups(page)   # dismiss news-feed modal on first load

        # Wait for article cards to render
        try:
            await page.wait_for_selector(".listArticleItem", timeout=8000)
        except Exception:
            pass
        await page.wait_for_timeout(1000)

        soup = BeautifulSoup(await page.content(), "html.parser")
        cards = soup.select(".listArticleItem")

        novels = []
        seen = set()
        for card in cards:
            entry = _parse_novel_card(card)
            if entry["slug"] and entry["slug"] not in seen and entry["title"]:
                seen.add(entry["slug"])
                novels.append(entry)
            if len(novels) >= limit:
                break

        await browser.close()
        return {
            "category": category_name or "homepage",
            "count":    len(novels),
            "novels":   novels,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 14 – SEARCH NOVELS
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def search_novels(keyword: str, limit: int = 20) -> dict:
    """
    Search for novels on ReadAWrite by title/author/tag keyword.

    Args:
        keyword: Search term (Thai or English).
        limit:   Max results (default 20).

    Returns:
        {"keyword": "...", "results": [{"title","author","views","tags","url",...}]}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        # ReadAWrite search is form-POST based (not GET querystring)
        search_page_url = f"{BASE_URL}/?action=search_article"
        await page.goto(search_page_url, wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await _nuke_popups(page)

        # Fill search input then submit form via JS (most reliable)
        try:
            await page.wait_for_selector("#search_key", timeout=8000)
            await page.fill("#search_key", keyword)
            # Submit form via JS — triggers POST and page reload
            async with page.expect_navigation(timeout=12000, wait_until="networkidle"):
                await page.evaluate(
                    "document.querySelector('#frmSearch')?.submit() "
                    "|| document.querySelector('#Search_button')?.click()"
                )
        except Exception:
            # Fallback: results may load in-place via AJAX
            try:
                await page.wait_for_function(
                    "document.querySelector('#list_all')?.children?.length > 0"
                    " || document.querySelector('#list_name_only')?.children?.length > 0",
                    timeout=10000,
                )
            except Exception:
                pass

        await page.wait_for_timeout(2000)

        soup = BeautifulSoup(await page.content(), "html.parser")

        # Results can be in #list_all, #list_name_only, or directly .listArticleItem
        container = soup.select_one("#list_all") or soup.select_one("#list_name_only")
        cards = container.select(".listArticleItem") if container else soup.select(".listArticleItem")

        results = []
        seen = set()
        for card in cards:
            entry = _parse_novel_card(card)
            if entry["slug"] and entry["slug"] not in seen and entry["title"]:
                seen.add(entry["slug"])
                results.append(entry)
            if len(results) >= limit:
                break

        await browser.close()
        return {
            "keyword": keyword,
            "count":   len(results),
            "results": results,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 15 – GET ALL CHAPTERS CONTENT  (for AI story context)
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def get_all_chapters_content(
    article_id: str,
    max_chapters: int = 5,
    latest_first: bool = True,
) -> dict:
    """
    Read the text content of multiple chapters from a novel in one call.
    Use this to give the AI the full story context before writing the next chapter.

    Args:
        article_id:    The novel's article ID.
        max_chapters:  How many chapters to fetch (default 5, max 20).
        latest_first:  If True, fetch the most recent chapters first.

    Returns:
        {
          "article_id": "...",
          "chapters_fetched": N,
          "chapters": [{"title": "...", "content": "...", "url": "..."}]
        }
    """
    max_chapters = min(max_chapters, 20)

    async with async_playwright() as p:
        browser, page = await _make_page(p)

        # Step 1: Get chapter list from the public novel page
        novel_url = f"{BASE_URL}/a/{article_id}"
        await page.goto(novel_url, wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await _nuke_popups(page)

        # Scroll down to trigger lazy-loaded chapter list
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(1500)

        # Wait for chapter list items
        try:
            await page.wait_for_selector(".chapter_list, .chapterList, [class*='chapter']", timeout=8000)
        except Exception:
            pass

        soup = BeautifulSoup(await page.content(), "html.parser")
        chapter_links = []
        for row in soup.select(".chapter_list, li.chapter_list, .chapterList li"):
            link = row.select_one("a[href*='/a/']")
            title_el = row.select_one(".chapterTitleAndSubTitle, .purchase_chapter, .chapter-title")
            if link:
                chapter_links.append({
                    "url":   link["href"] if link["href"].startswith("http") else BASE_URL + link["href"],
                    "title": title_el.get_text(" ", strip=True) if title_el else "",
                })

        if latest_first:
            chapter_links = list(reversed(chapter_links))
        chapter_links = chapter_links[:max_chapters]

        # Step 2: Fetch each chapter's content
        results = []
        for ch in chapter_links:
            try:
                await page.goto(ch["url"], wait_until="networkidle")
                await page.wait_for_timeout(1500)
                ch_soup = BeautifulSoup(await page.content(), "html.parser")

                content = ""
                for sel in ["#chapter_content", ".chapter-content", "#content_story", ".content-story", ".readContent"]:
                    el = ch_soup.select_one(sel)
                    if el and len(el.get_text(strip=True)) > 50:
                        content = el.get_text(separator="\n", strip=True)
                        break

                if not content:
                    content = "\n\n".join(
                        p_el.get_text(strip=True)
                        for p_el in ch_soup.select("p")
                        if len(p_el.get_text(strip=True)) > 20
                    )

                results.append({
                    "title":          ch["title"],
                    "url":            ch["url"],
                    "content":        content[:8000],
                    "content_length": len(content),
                })
            except Exception:
                results.append({"title": ch["title"], "url": ch["url"], "content": "", "error": "fetch failed"})

        await browser.close()
        return {
            "article_id":      article_id,
            "chapters_fetched": len(results),
            "latest_first":    latest_first,
            "chapters":        results,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 16 – EDIT CHAPTER
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def edit_chapter(
    article_id: str,
    chapter_guid: str,
    new_content: str,
    new_title: str = "",
    new_subtitle: str = "",
    new_writer_note: str = "",
) -> dict:
    """
    Edit the content of an existing published chapter.

    Args:
        article_id:       The novel's article ID.
        chapter_guid:     The chapter's GUID (from get_chapters).
        new_content:      New body text for the chapter.
        new_title:        New chapter title (leave empty to keep existing).
        new_subtitle:     New chapter subtitle (leave empty to keep existing).
        new_writer_note:  New writer's note (leave empty to keep existing).

    Returns:
        {"success": true, "chapter_guid": "..."}
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        url = _edit_url(article_id, "mainManageChapter")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        # Click the edit button for this specific chapter
        # The edit icon is usually inside tr[chapter_guid='{guid}']
        try:
            row = page.locator(f"tr[chapter_guid='{chapter_guid}']")
            edit_btn = row.locator("a[href*='edit'], button[class*='edit'], .btn-edit, [onclick*='edit']").first
            await edit_btn.click(timeout=5000)
        except Exception:
            # Fallback: navigate directly to chapter edit URL
            edit_url = f"{BASE_URL}/?action=manage_chapter&article_id={article_id}&chapter_guid={chapter_guid}"
            await page.goto(edit_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(2000)

        await page.wait_for_timeout(2000)
        await _nuke_popups(page)

        # Update title if provided
        if new_title:
            try:
                await page.fill("#chapter_title", new_title, timeout=5000)
            except Exception:
                pass

        if new_subtitle:
            try:
                await page.fill("#chapter_subtitle", new_subtitle, timeout=5000)
            except Exception:
                pass

        # Update main content
        try:
            editor = page.locator("#contain_chapter_content .ck-editor__editable").first
            await editor.wait_for(timeout=8000)
            await editor.click()
            # Select all and replace
            await editor.press("Control+a")
            await editor.fill(new_content)
        except Exception:
            try:
                editor = page.locator(".ck-editor__editable").first
                await editor.click()
                await editor.press("Control+a")
                await editor.fill(new_content)
            except Exception:
                pass

        # Update writer note if provided
        if new_writer_note:
            try:
                editor2 = page.locator(".ck-editor__editable").nth(1)
                await editor2.click()
                await editor2.press("Control+a")
                await editor2.fill(new_writer_note)
            except Exception:
                pass

        # Save as draft then publish
        await _nuke_popups(page)
        try:
            await page.click("#btnSaveDraft", timeout=5000)
            await page.wait_for_selector("#btnSaveMaster", state="visible", timeout=10000)
            await page.click("#btnSaveMaster")
            await page.wait_for_timeout(2000)
        except Exception:
            pass

        await browser.close()
        return {"success": True, "article_id": article_id, "chapter_guid": chapter_guid}


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 17 – GET MY NOVEL STATS
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def get_novel_stats(article_id: str) -> dict:
    """
    Get detailed statistics for one of your own novels (views, follows, comments per chapter).

    Args:
        article_id: The novel's article ID.

    Returns:
        {
          "title": "...", "total_views": "...", "total_follows": "...",
          "total_comments": "...", "chapters": [{"title","views","comments"}]
        }
    """
    async with async_playwright() as p:
        browser, page = await _make_page(p)

        # Stats are on the manage page
        url = _edit_url(article_id, "mainManageChapter")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3000)
        await _nuke_popups(page)

        soup = BeautifulSoup(await page.content(), "html.parser")

        # Overall stats — title is in the manage page header (same p.txtSize36 pattern)
        title_el    = (
            soup.select_one("p.txtSize36")
            or soup.select_one("#articleNameInFixed")
            or soup.select_one(".articleName")
            or soup.select_one("h1")
        )
        # Views/follows are typically shown as numbers in a stats bar
        views_el    = soup.select_one(".viewCount, [class*='totalView'], [class*='total-view']")
        follows_el  = soup.select_one(".bookmarkCount, [class*='totalBookmark'], [class*='totalFollow'], [class*='follow']")
        comments_el = soup.select_one(".commentCount, [class*='totalComment'], [class*='comment']")

        # Per-chapter stats from chapter rows
        chapter_stats = []
        for row in soup.select("tr[chapter_guid]"):
            ch_title_el   = row.select_one(".chapter-list-title, td:first-child")
            ch_views_el   = row.select_one("[class*='view']")
            ch_comment_el = row.select_one("[class*='comment']")
            chapter_stats.append({
                "guid":     row.get("chapter_guid", ""),
                "title":    ch_title_el.get_text(strip=True) if ch_title_el else "",
                "views":    ch_views_el.get_text(strip=True) if ch_views_el else "",
                "comments": ch_comment_el.get_text(strip=True) if ch_comment_el else "",
            })

        await browser.close()
        return {
            "article_id":      article_id,
            "title":           title_el.get_text(strip=True) if title_el else "",
            "total_views":     views_el.get_text(strip=True) if views_el else "",
            "total_follows":   follows_el.get_text(strip=True) if follows_el else "",
            "total_comments":  comments_el.get_text(strip=True) if comments_el else "",
            "chapter_count":   len(chapter_stats),
            "chapters":        chapter_stats,
        }


# ──────────────────────────────────────────────────────────────────────────────
# TOOL 18 – ANALYZE GENRE PLOTS
# ──────────────────────────────────────────────────────────────────────────────

@mcp.tool()
async def analyze_genre_plots(
    category_name: str,
    sample_size: int = 15,
) -> dict:
    """
    Collect full synopses + tags from the top novels in a category so an AI
    can identify common plot patterns, tropes, and story structures in that genre.

    How to use the result:
        Pass the returned data to the AI and ask:
        "Based on these synopses, what are the most common plot patterns in this genre?"

    Args:
        category_name: Thai category name, e.g. "นิยายรัก", "แฟนตาซี เกมออนไลน์ ต่างโลก".
        sample_size:   Number of novels to sample (default 15, max 30).

    Returns:
        {
          "category": "...",
          "sample_size": N,
          "novels": [
            {
              "title": "...", "author": "...", "synopsis": "...",
              "tags": [...], "views": "...", "chapters_count": "...", "url": "..."
            }
          ]
        }
    """
    sample_size = min(sample_size, 30)

    async with async_playwright() as p:
        browser, page = await _make_page(p)

        # Step 1 — get the trending list for this category
        if category_name in CATEGORY_ID_MAP:
            cat = CATEGORY_ID_MAP[category_name]
            list_url = (
                f"{BASE_URL}/?action=index_sub_category&view=PopularNew"
                f"&category_group_id={cat['group_id']}"
                f"&article_species=FICTION&page_type=ORIGINAL"
                f"&category_id={cat['id']}"
                f"&category_name={category_name}"
            )
        else:
            list_url = BASE_URL

        await page.goto(list_url, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        soup = BeautifulSoup(await page.content(), "html.parser")
        cards = soup.select(".listArticleItem")[:sample_size]

        # Collect slugs and basic info from listing page
        stubs = []
        seen = set()
        for card in cards:
            link = card.select_one("a[href*='/a/']")
            if not link:
                continue
            href = link["href"]
            slug = _parse_article_id_from_url(href)
            if not slug or slug in seen:
                continue
            seen.add(slug)

            title_el  = card.select_one(".listArticleName")
            author_el = card.select_one(".listAuthorName a")
            view_el   = card.select_one(".view")
            tags      = [t.get_text(strip=True) for t in card.select(".tagListInHoriArtileList_1Line") if t.get_text(strip=True)]

            stubs.append({
                "slug":   slug,
                "url":    href if href.startswith("http") else BASE_URL + href,
                "title":  title_el.get_text(strip=True) if title_el else "",
                "author": author_el.get_text(strip=True) if author_el else "",
                "views":  view_el.get_text(strip=True) if view_el else "",
                "tags":   tags[:8],
            })

        # Step 2 — visit each novel's detail page for full synopsis
        novels = []
        for stub in stubs:
            try:
                await page.goto(stub["url"], wait_until="networkidle")
                await page.wait_for_timeout(1200)

                detail = BeautifulSoup(await page.content(), "html.parser")

                synopsis_el = detail.select_one(".articleSynopsis, [class*='articleSynopsis']")
                chapters_el = detail.select_one(".chapter_amount")
                category_el = detail.select_one("[class*='categoryName']")

                # Merge tags from listing + detail page
                extra_tags = [
                    t.get_text(strip=True)
                    for t in detail.select(".tagName, [class*='tagName']")
                    if t.get_text(strip=True)
                ]
                all_tags = list(dict.fromkeys(stub["tags"] + extra_tags))[:10]

                novels.append({
                    "title":          stub["title"],
                    "author":         stub["author"],
                    "synopsis":       synopsis_el.get_text(" ", strip=True) if synopsis_el else "",
                    "tags":           all_tags,
                    "views":          stub["views"],
                    "chapters_count": chapters_el.get_text(strip=True) if chapters_el else "",
                    "category":       category_el.get_text(strip=True) if category_el else category_name,
                    "url":            stub["url"],
                })
            except Exception:
                novels.append({**stub, "synopsis": "", "chapters_count": ""})

        await browser.close()
        return {
            "category":    category_name,
            "sample_size": len(novels),
            "novels":      novels,
        }


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
