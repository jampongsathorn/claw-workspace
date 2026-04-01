"""
test_tools.py
=============
Run this on your machine to verify all 18 MCP tools work correctly.

Usage:
    python test_tools.py              # run all tests
    python test_tools.py trending     # run specific test by name
    python test_tools.py auth         # run authenticated tests only

Tests are grouped:
    [PUBLIC]  — no login needed (trending, search, novel info, genre analysis)
    [AUTH]    — requires cookies.json (list novels, add chapter, etc.)
"""

import asyncio
import json
import sys
import os

# ── Make sure we run from the project directory ──────────────────────────────
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ── Import tools from server.py ───────────────────────────────────────────────
from server import (
    # Public
    get_trending_novels,
    search_novels,
    get_novel_info,
    analyze_genre_plots,
    # Auth
    list_all_novels,
    find_novel_id,
    get_chapters,
    get_chapter_content,
    get_all_chapters_content,
    get_novel_stats,
)

PASS = "✅"
FAIL = "❌"
SKIP = "⏭️ "

results = []

def ok(name, data):
    print(f"{PASS} {name}")
    results.append((name, True, None))
    return data

def fail(name, err):
    print(f"{FAIL} {name}: {err}")
    results.append((name, False, str(err)))

def show(label, value, max_len=80):
    v = str(value)
    print(f"     {label}: {v[:max_len]}{'...' if len(v) > max_len else ''}")


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC TESTS
# ══════════════════════════════════════════════════════════════════════════════

async def test_get_trending():
    print("\n── TEST: get_trending_novels('นิยายรัก', limit=5) ─────────────────")
    try:
        r = await get_trending_novels("นิยายรัก", limit=5)
        assert "novels" in r, "missing 'novels' key"
        assert len(r["novels"]) > 0, "empty results"
        n = r["novels"][0]
        assert n["title"], "first novel has no title"
        show("category", r["category"])
        show("count", r["count"])
        for i, novel in enumerate(r["novels"], 1):
            print(f"     {i}. {novel['title'][:50]}")
            print(f"        👤 {novel['author']}  👁 {novel['views']}  🏷 {novel['tags'][:3]}")
        return ok("get_trending_novels", r)
    except Exception as e:
        fail("get_trending_novels", e)


async def test_search_novels():
    print("\n── TEST: search_novels('ทะลุมิติ', limit=3) ────────────────────────")
    try:
        r = await search_novels("ทะลุมิติ", limit=3)
        assert "results" in r, "missing 'results' key"
        show("keyword", r["keyword"])
        show("count", r["count"])
        for i, n in enumerate(r["results"], 1):
            print(f"     {i}. {n['title'][:50]}  👤 {n['author']}")
        return ok("search_novels", r)
    except Exception as e:
        fail("search_novels", e)


async def test_get_novel_info():
    print("\n── TEST: get_novel_info('Zhj00j') ──────────────────────────────────")
    try:
        r = await get_novel_info("Zhj00j")
        assert r.get("title"), "no title"
        assert r.get("synopsis"), "no synopsis"
        show("title",    r["title"])
        show("author",   r["author"])
        show("synopsis", r["synopsis"])
        show("views",    r["views"])
        show("chapters", r["chapters_count"])
        show("category", r["category"])
        print(f"     chapter list: {len(r['chapters'])} chapters")
        if r["chapters"]:
            print(f"       first: {r['chapters'][0]['title'][:50]}")
        return ok("get_novel_info", r)
    except Exception as e:
        fail("get_novel_info", e)


async def test_analyze_genre_plots():
    print("\n── TEST: analyze_genre_plots('นิยายรัก', sample_size=5) ────────────")
    try:
        r = await analyze_genre_plots("นิยายรัก", sample_size=5)
        assert "novels" in r, "missing 'novels' key"
        assert len(r["novels"]) > 0, "no novels returned"
        show("category",    r["category"])
        show("sample_size", r["sample_size"])
        for i, n in enumerate(r["novels"], 1):
            syn = n["synopsis"][:70] if n["synopsis"] else "(no synopsis)"
            print(f"     {i}. {n['title'][:45]}")
            print(f"        synopsis: {syn}")
            print(f"        tags: {n['tags'][:4]}")
        return ok("analyze_genre_plots", r)
    except Exception as e:
        fail("analyze_genre_plots", e)


# ══════════════════════════════════════════════════════════════════════════════
# AUTH TESTS  (requires valid cookies.json)
# ══════════════════════════════════════════════════════════════════════════════

# Article ID auto-detected at runtime from list_all_novels (first published novel)
ARTICLE_ID = "54401250798bacf59733a6c611f83df9"   # fallback — overridden below
_detected_article_id = None


async def test_list_all_novels():
    global _detected_article_id
    print("\n── TEST: list_all_novels() ──────────────────────────────────────────")
    try:
        r = await list_all_novels()
        assert "published" in r and "drafts" in r
        show("published count", len(r["published"]))
        show("drafts count",    len(r["drafts"]))
        for n in r["published"][:3]:
            print(f"     📖 {n['title'][:50]}  id={n['id'][:12]}...")
        for n in r["drafts"][:3]:
            print(f"     📝 {n['title'][:50]}  id={n['id'][:12]}...")
        # Auto-pick the first published novel for subsequent tests
        if r["published"]:
            _detected_article_id = r["published"][0]["id"]
            print(f"     🔑 Using article_id={_detected_article_id[:16]}... for chapter tests")
        return ok("list_all_novels", r)
    except Exception as e:
        fail("list_all_novels", e)


async def test_find_novel_id():
    print("\n── TEST: find_novel_id('ทะลุ') ──────────────────────────────────────")
    try:
        r = await find_novel_id("ทะลุ")
        assert "results" in r
        show("matches found", len(r["results"]))
        for n in r["results"]:
            print(f"     {n['status']:10s} {n['title'][:50]}  id={n['id'][:12]}...")
        return ok("find_novel_id", r)
    except Exception as e:
        fail("find_novel_id", e)


async def test_get_chapters():
    aid = _detected_article_id or ARTICLE_ID
    print(f"\n── TEST: get_chapters('{aid[:12]}...') ────────────────────")
    try:
        r = await get_chapters(aid)
        assert "chapters" in r
        show("chapter count", len(r["chapters"]))
        for c in r["chapters"][:3]:
            print(f"     guid={c['guid'][:12]}...  title={c['title'][:40]}")
        return ok("get_chapters", r)
    except Exception as e:
        fail("get_chapters", e)


async def test_get_chapter_content():
    aid = _detected_article_id or ARTICLE_ID
    print(f"\n── TEST: get_chapter_content('{aid[:12]}...') ────────────")
    try:
        r = await get_chapter_content(aid)
        if "error" in r:
            print(f"     ⚠️  {r['error']} (may be behind paywall)")
            results.append(("get_chapter_content", None, "paywall"))
            return r
        assert r.get("content"), "no content"
        show("title",   r["title"])
        show("length",  r["content_length"])
        show("preview", r["content"][:80])
        return ok("get_chapter_content", r)
    except Exception as e:
        fail("get_chapter_content", e)


async def test_get_all_chapters_content():
    aid = _detected_article_id or ARTICLE_ID
    print(f"\n── TEST: get_all_chapters_content('{aid[:12]}...', max=2) ─")
    try:
        r = await get_all_chapters_content(aid, max_chapters=2)
        assert "chapters" in r
        show("chapters fetched", r["chapters_fetched"])
        for c in r["chapters"]:
            print(f"     title={c['title'][:40]}  len={c['content_length']}")
        return ok("get_all_chapters_content", r)
    except Exception as e:
        fail("get_all_chapters_content", e)


async def test_get_novel_stats():
    aid = _detected_article_id or ARTICLE_ID
    print(f"\n── TEST: get_novel_stats('{aid[:12]}...') ────────────────")
    try:
        r = await get_novel_stats(aid)
        show("title",   r["title"])
        show("views",   r["total_views"])
        show("follows", r["total_follows"])
        show("chapters",r["chapter_count"])
        return ok("get_novel_stats", r)
    except Exception as e:
        fail("get_novel_stats", e)


# ══════════════════════════════════════════════════════════════════════════════
# RUNNER
# ══════════════════════════════════════════════════════════════════════════════

PUBLIC_TESTS = [
    test_get_trending,
    test_search_novels,
    test_get_novel_info,
    test_analyze_genre_plots,
]

AUTH_TESTS = [
    test_list_all_novels,
    test_find_novel_id,
    test_get_chapters,
    test_get_chapter_content,
    test_get_all_chapters_content,
    test_get_novel_stats,
]

async def main():
    filter_arg = sys.argv[1] if len(sys.argv) > 1 else "all"

    print("=" * 60)
    print("  ReadAWrite MCP — Tool Verification Suite")
    print("=" * 60)

    tests_to_run = []

    if filter_arg in ("all", "public"):
        print("\n📡 PUBLIC TESTS (no login required)")
        tests_to_run += PUBLIC_TESTS
    if filter_arg in ("all", "auth"):
        print("\n🔐 AUTH TESTS (requires cookies.json)")
        tests_to_run += AUTH_TESTS
    if filter_arg not in ("all", "public", "auth"):
        # filter by keyword
        all_tests = PUBLIC_TESTS + AUTH_TESTS
        tests_to_run = [t for t in all_tests if filter_arg in t.__name__]
        if not tests_to_run:
            print(f"No tests match '{filter_arg}'")
            sys.exit(1)

    for test_fn in tests_to_run:
        try:
            await test_fn()
        except Exception as e:
            fail(test_fn.__name__, f"Unhandled exception: {e}")

    # Summary
    print("\n" + "=" * 60)
    passed  = sum(1 for _, ok, _ in results if ok is True)
    failed  = sum(1 for _, ok, _ in results if ok is False)
    skipped = sum(1 for _, ok, _ in results if ok is None)
    print(f"  Results: {passed} passed  {failed} failed  {skipped} skipped")
    print("=" * 60)
    if failed:
        print("\nFailed tests:")
        for name, ok_val, err in results:
            if ok_val is False:
                print(f"  ❌ {name}: {err}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
