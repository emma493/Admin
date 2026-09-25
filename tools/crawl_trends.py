"""
Trend crawler (Beta) — pulls public caption/tag metadata from reference
aggregator sites into AI seed data. TEXT ONLY: post titles, tag lists,
upvote counts. Never downloads media, never logs in, never bypasses
paywalls/captchas. Polite: 2s+ delay between hits, normal UA, per-request
timeouts, stops per-domain on repeated blocks.

Usage:
    python tools/crawl_trends.py            # crawl all, write tools/trend-corpus.crawled.json
    python tools/crawl_trends.py --limit 2  # fewer pages per site (faster test)

Output matches Admin trend-corpus.json entry shape:
    {"caption": str, "hashtags": [str...], "weight": 1-3, "source": domain}
Split into girls/couples by keyword match. Review the file, then merge the
best entries into src/lib/trend-corpus.json (never auto-overwrites it).
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
OUT_FILE = HERE / "trend-corpus.crawled.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
DELAY_S = 2.0
REQ_TIMEOUT = 20

COUPLE_WORDS = re.compile(r"\b(couple|duo|straight|gf\b|bf\b|wife|husband|threesome|lesbian|gay)\b", re.I)
TAG_RE = re.compile(r"#(\w{2,30})")
WS_RE = re.compile(r"\s+")

# Reddit public JSON works without auth (proper UA required). Titles are the
# captions; flairs + sidebar tags become hashtags. Most reliable source here.
REDDIT_SUBS = [
    ("https://www.reddit.com/r/tiktoknsfw/hot/.json?limit=50", "reddit"),
    ("https://www.reddit.com/r/tiktokporn/hot/.json?limit=50", "reddit"),
]

# Generic HTML listing pages: best-effort extraction (og:title, JSON-LD,
# card headings, on-page #tags). Expect 403s on bot-walled domains — logged,
# not fatal. Add working CSS selectors here as you discover them per site.
HTML_PAGES = [
    "https://tik.porn/",
    "https://www.xfree.com/",
    "https://www.redgifs.com/",
    "https://www.sex.com/",
    "https://xxxtik.com/",
    "https://fikfap.com/",
    "https://fkbae.to/",
    "https://www.hornyleak.tv/",
    "https://fyptt.to/",
    "https://sharesome.com/",
    "https://www.xxxfollow.com/",
    "https://waptap.com/",
    "https://ogfap.com/",
    "https://onlytik.com/",
    "https://pin.porn/",
    "https://pornobae.com/",
    "https://saucesenpai.com/",
    "https://reddxxx.com/",
    "https://reelsmunkey.com/",
    "https://www.shorts.xxx/",
    "https://onlyscroll.com/",
    "https://tiktits.com/",
    "https://nuditok.com/",
]


def clean(text: str, limit: int = 120) -> str:
    text = WS_RE.sub(" ", (text or "")).strip(" -|•·")
    return text[:limit].strip()


def categorize(caption: str, tags: list) -> str:
    blob = caption + " " + " ".join(tags)
    return "couples" if COUPLE_WORDS.search(blob) else "girls"


def weight_for(score: int) -> int:
    if score >= 1000:
        return 3
    if score >= 100:
        return 2
    return 1


def fetch(session: requests.Session, url: str, accept_json: bool = False):
    headers = {"User-Agent": UA}
    if accept_json:
        headers["Accept"] = "application/json"
    r = session.get(url, headers=headers, timeout=REQ_TIMEOUT)
    r.raise_for_status()
    return r


def crawl_reddit(session: requests.Session, url: str, results: list, stats: dict):
    domain = "reddit.com"
    try:
        data = fetch(session, url, accept_json=True).json()
        posts = data.get("data", {}).get("children", [])
        for p in posts:
            d = p.get("data", {})
            title = clean(d.get("title", ""))
            if len(title) < 8:
                continue
            tags = ["#fyp"]
            flair = clean(d.get("link_flair_text", "") or "", 30)
            if flair:
                tags.append("#" + re.sub(r"\W+", "", flair.lower())[:24])
            sub = d.get("subreddit", "")
            if sub:
                tags.append("#" + re.sub(r"\W+", "", sub.lower())[:24])
            tags.append("#shortxx")
            results.append({
                "caption": title,
                "hashtags": sorted(set(tags))[:6],
                "weight": weight_for(int(d.get("score", 0) or 0)),
                "source": f"{domain}/r/{sub}",
            })
            stats["ok"] += 1
    except Exception as e:  # noqa: BLE001 - per-site errors must not kill the run
        stats["fail"] += 1
        stats["errors"].append(f"{url} -> {type(e).__name__}: {e}")
    time.sleep(DELAY_S)


def extract_html(session: requests.Session, url: str, results: list, stats: dict):
    domain = urlparse(url).netloc or url
    try:
        html = fetch(session, url).text
        soup = BeautifulSoup(html, "html.parser")
        seen = set()

        # 1) JSON-LD video objects (most structured where present)
        for tag in soup.find_all("script", type="application/ld+json"):
            try:
                ld = json.loads(tag.string or "")
            except Exception:  # noqa: BLE001
                continue
            items = ld if isinstance(ld, list) else [ld]
            for it in items:
                if not isinstance(it, dict):
                    continue
                name = clean(str(it.get("name", "")))
                if len(name) >= 8 and name not in seen:
                    seen.add(name)
                    kws = str(it.get("keywords", "") or "")
                    tags = ["#" + re.sub(r"\W+", "", k)[:24] for k in re.split(r"[,;]", kws) if k.strip()]
                    tags = [t for t in tags if len(t) > 2][:5] or ["#fyp"]
                    tags.append("#shortxx")
                    results.append({"caption": name, "hashtags": sorted(set(tags))[:6],
                                    "weight": 1, "source": domain})
                    stats["ok"] += 1

        # 2) Card headings / video links (generic, best-effort)
        for sel in ["a[title]", "h2", "h3", ".video-title", ".card-title", ".thumb-title"]:
            for el in soup.select(sel)[:60]:
                name = clean(el.get("title") or el.get_text())
                if len(name) < 12 or name in seen:
                    continue
                if len(name.split()) < 2:
                    continue
                seen.add(name)
                tags = ["#" + t.lower() for t in TAG_RE.findall(el.get_text())][:5] or ["#fyp"]
                tags.append("#shortxx")
                results.append({"caption": name, "hashtags": sorted(set(tags))[:6],
                                "weight": 1, "source": domain})
                stats["ok"] += 1
                if len(seen) >= 40:
                    break
        if not seen:
            stats["empty"] += 1
    except Exception as e:  # noqa: BLE001
        stats["fail"] += 1
        stats["errors"].append(f"{url} -> {type(e).__name__}: {e}")
    time.sleep(DELAY_S)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0,
                    help="only crawl first N HTML pages (0 = all)")
    args = ap.parse_args()

    session = requests.Session()
    results: list = []
    stats = {"ok": 0, "fail": 0, "empty": 0, "errors": []}

    print(f"[crawl] reddit subs: {len(REDDIT_SUBS)}", flush=True)
    for url, _ in REDDIT_SUBS:
        crawl_reddit(session, url, results, stats)

    pages = HTML_PAGES[: args.limit] if args.limit else HTML_PAGES
    print(f"[crawl] html pages: {len(pages)}", flush=True)
    for url in pages:
        print(f"[crawl] GET {url}", flush=True)
        extract_html(session, url, results, stats)

    # Dedup by caption, keep highest weight
    best: dict = {}
    for r in results:
        key = r["caption"].lower()
        if key not in best or r["weight"] > best[key]["weight"]:
            best[key] = r
    girls = [v for v in best.values() if categorize(v["caption"], v["hashtags"]) == "girls"]
    couples = [v for v in best.values() if categorize(v["caption"], v["hashtags"]) == "couples"]
    girls.sort(key=lambda r: -r["weight"])
    couples.sort(key=lambda r: -r["weight"])

    OUT_FILE.write_text(json.dumps({"girls": girls, "couples": couples}, indent=2), encoding="utf-8")
    print(f"[done] ok={stats['ok']} fail={stats['fail']} empty={stats['empty']} "
          f"girls={len(girls)} couples={len(couples)} -> {OUT_FILE}", flush=True)
    for err in stats["errors"][:20]:
        print(f"[warn] {err}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
