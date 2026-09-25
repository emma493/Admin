"""
Trend crawler BIG (Beta) — multi-source text-metadata harvester for AI seed data.

TEXT ONLY: post titles, tag lists, scores, sitemap/RSS metadata. Never downloads
media, never logs in, never touches paywalls/captchas. Polite: >=2s delay
between hits, 20s timeouts, rotated browser UAs, per-domain circuit breaker,
per-site try/except so one block never kills the run.

Sources per site (all bounded, all optional):
  1. Homepage HTML ......... JSON-LD video objects, OG/meta, card headings, #tags
  2. Pagination ............. SELF-DISCOVERED page-2 link from homepage (no blind
                              guessing); crawls --pages deep (default 2)
  3. RSS/Atom ............... discovered via <link rel=alternate> (one fetch)
  4. Sitemap ................ /sitemap.xml -> video sub-sitemap (two fetches max),
                              harvests <video:title> + tags, capped
  5. Tag pages ............... top --tag-pages internal /tag/ links from homepage
  6. Reddit .................. subs x sorts (hot/new/top:day) JSON, with
                              old.reddit RSS fallback when JSON 403s

Usage:
    python tools/trend_crawler.py                          # full bounded crawl
    python tools/trend_crawler.py --dry-run                # 1 homepage, no writes
    python tools/trend_crawler.py --limit-sites 3 --pages 1 --tag-pages 0
    python tools/trend_crawler.py --resume                 # continue from checkpoint
    python tools/trend_crawler.py --no-sitemap --no-reddit # HTML only

Output: tools/trend-corpus.crawled.json  {girls:[...], couples:[...]}
        (same shape merge_corpus.py reads) + tools/trend-crawler.stats.json.
Raw titles are keyword-mining input ONLY — never user-facing captions.
"""
import argparse
import json
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse

# cp1252 console breaks on smart quotes/emoji — force utf-8 first.
sys.stdout.reconfigure(encoding="utf-8")

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "trend-corpus.crawled.json"
STATS_FILE = HERE / "trend-crawler.stats.json"
CHECKPOINT_FILE = HERE / ".trend-crawler.checkpoint.json"

# ---------------------------------------------------------------- config ---

UA_POOL = [
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
     "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) "
     "Gecko/20100101 Firefox/127.0"),
    ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
     "(KHTML, like Gecko) Version/17.4 Safari/605.1.15"),
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
     "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"),
]

COUPLE_WORDS = re.compile(
    r"\b(couple|duo|straight|gf\b|bf\b|wife|husband|threesome|lesbian|gay|"
    r"pair|together|kiss|date night)\b", re.I)
TAG_RE = re.compile(r"#(\w{2,30})")
WS_RE = re.compile(r"\s+")
SLUG_JUNK = re.compile(
    r"^(home|index|page|video|videos|watch|tag|tags|category|categories|"
    r"search|login|signup|register|upload|contact|about|privacy|terms|dmca|"
    r"2257|faq|help|blog|news|members?|models?|pornstars?|channels?)$", re.I)

HOOK_WORDS = ("pov", "wait", "rate", "watch", "part", "reply", "duet", "try",
              "transition", "challenge", "trend")

REDDIT_SUBS = ["tiktoknsfw", "tiktokporn", "TikTokNsfw"]
REDDIT_SORTS = ["hot", "new"]

SITES = [
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

MAX_SITEMAP_URLS = 300
MAX_TAG_LINKS_PER_PAGE = 60

# ------------------------------------------------------------ helpers ---


def clean(text: str, limit: int = 120) -> str:
    text = WS_RE.sub(" ", (text or "")).strip(" -|\u2022\u00b7")
    return text[:limit].strip()


def slug_to_tag(slug: str) -> str:
    tag = re.sub(r"\W+", "", slug.lower())[:24]
    return "#" + tag if len(tag) >= 2 and not SLUG_JUNK.match(tag) else ""


def categorize(caption: str, tags: list) -> str:
    blob = caption + " " + " ".join(tags)
    return "couples" if COUPLE_WORDS.search(blob) else "girls"


def weight_for(score: int) -> int:
    if score >= 1000:
        return 3
    if score >= 100:
        return 2
    return 1


def domain_of(url: str) -> str:
    return urlparse(url).netloc.lower() or url


def tags_from_text(text: str, cap: int = 5) -> list:
    return ["#" + t.lower() for t in TAG_RE.findall(text or "")][:cap]


class CrawlState:
    """Results + per-domain stats, circuit breaker, checkpoint support."""

    def __init__(self, delay: float, timeout: int):
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.results: list = []
        self.domain_hits: Counter = Counter()   # successful extracts
        self.domain_fails: Counter = Counter()  # consecutive failures
        self.skipped: list = []
        self.errors: list = []
        self.done_site_keys: set = set()

    def breaker_tripped(self, domain: str, limit: int = 4) -> bool:
        return self.domain_fails[domain] >= limit

    def note_ok(self, domain: str):
        self.domain_hits[domain] += 1
        self.domain_fails[domain] = 0

    def note_fail(self, url: str, err: Exception):
        domain = domain_of(url)
        self.domain_fails[domain] += 1
        self.errors.append(f"{url} -> {type(err).__name__}: {err}")

    def add(self, caption: str, tags: list, weight: int, source: str):
        caption = clean(caption)
        if len(caption) < 8:
            return
        tags = sorted({t for t in (tags or ["#fyp"]) if t.startswith("#")})[:6]
        if "#shortxx" not in tags:
            tags = (tags + ["#shortxx"])[:6]
        self.results.append({"caption": caption, "hashtags": tags,
                             "weight": weight, "source": source})

    def fetch(self, url: str, accept: str = "") -> requests.Response:
        """One polite GET with UA rotation + single retry on 5xx/timeout."""
        headers = {"User-Agent": random.choice(UA_POOL)}
        if accept:
            headers["Accept"] = accept
        last: Exception = requests.RequestException("no attempt")
        for attempt in range(2):
            try:
                r = self.session.get(url, headers=headers,
                                     timeout=self.timeout)
                r.raise_for_status()
                time.sleep(self.delay)
                return r
            except Exception as e:  # noqa: BLE001 - retry once, then raise
                last = e
                time.sleep(self.delay + attempt * 2.0)
        time.sleep(self.delay)
        raise last


# ------------------------------------------------------- extractors ---


def extract_json_ld(soup: BeautifulSoup, domain: str, st: CrawlState):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(tag.string or "")
        except Exception:  # noqa: BLE001 - malformed block, skip
            continue
        items = ld if isinstance(ld, list) else [ld]
        stack = list(items)
        while stack:
            it = stack.pop()
            if isinstance(it, list):
                stack.extend(it)
                continue
            if not isinstance(it, dict):
                continue
            for nest_key in ("itemListElement", "@graph", "hasPart"):
                nested = it.get(nest_key)
                if isinstance(nested, list):
                    stack.extend(nested)
            t = str(it.get("@type", "") or "")
            if "VideoObject" not in t and "Clip" not in t:
                continue
            name = clean(str(it.get("name", "")))
            if len(name) < 8:
                continue
            kws = it.get("keywords", "")
            if isinstance(kws, list):
                kws = ",".join(str(k) for k in kws)
            tags = [slug_to_tag(k) for k in re.split(r"[,;]", str(kws or ""))]
            tags = [t for t in tags if t][:5] or tags_from_text(
                str(it.get("description", ""))) or ["#fyp"]
            st.add(name, tags, 1, domain)
            st.note_ok(domain)


def extract_meta(soup: BeautifulSoup, domain: str, url: str, st: CrawlState):
    """OG/Twitter meta — usually one strong title per listing page."""
    got = 0
    for prop in ("og:title", "twitter:title"):
        el = soup.find("meta", attrs={"property": prop}) or \
            soup.find("meta", attrs={"name": prop})
        if el and el.get("content"):
            title = clean(el["content"])
            if len(title) >= 12 and len(title.split()) >= 2:
                kw_el = soup.find("meta", attrs={"name": "keywords"})
                kws = kw_el["content"] if kw_el and kw_el.get("content") else ""
                tags = [slug_to_tag(k) for k in re.split(r"[,;]", kws)]
                tags = [t for t in tags if t][:5] or ["#fyp"]
                st.add(title, tags, 1, domain + " (meta)")
                got += 1
    if got:
        st.note_ok(domain)
    return got


def extract_cards(soup: BeautifulSoup, domain: str, st: CrawlState,
                  cap: int = 40) -> int:
    seen = set()
    selectors = ["a[title]", "h2", "h3", ".video-title", ".card-title",
                 ".thumb-title", ".title", "[class*=video-title]",
                 "a.video-link", ".thumb a"]
    for sel in selectors:
        try:
            els = soup.select(sel)[:60]
        except Exception:  # noqa: BLE001 - bad selector on this page
            continue
        for el in els:
            name = clean(el.get("title") or el.get_text())
            if len(name) < 12 or len(name.split()) < 2 or name in seen:
                continue
            seen.add(name)
            tags = tags_from_text(el.get_text()) or ["#fyp"]
            st.add(name, tags, 1, domain)
            if len(seen) >= cap:
                break
        if len(seen) >= cap:
            break
    if seen:
        st.note_ok(domain)
    return len(seen)


def extract_tag_links(soup: BeautifulSoup, base_url: str,
                      cap: int = MAX_TAG_LINKS_PER_PAGE) -> list:
    """Internal /tag(s)/ links ranked by frequency — niche-tag goldmine."""
    counts: Counter = Counter()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not re.search(r"/tags?/", href, re.I):
            continue
        full = urljoin(base_url, href.split("#")[0])
        if domain_of(full) != domain_of(base_url):
            continue
        label = clean(a.get_text(), 30)
        if len(label) >= 2:
            counts[(full, label)] += 1
    return [(u, l) for (u, l), _ in counts.most_common(cap)]


def discover_feed(soup: BeautifulSoup, base_url: str) -> str:
    link = soup.find("link", rel="alternate",
                     type=re.compile(r"rss|atom", re.I))
    if link and link.get("href"):
        return urljoin(base_url, link["href"])
    return ""


def discover_page2(soup: BeautifulSoup, base_url: str) -> str:
    """Find a real page-2 link on the homepage — no blind URL guessing."""
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if re.search(r"(page[/=_-]?2|/2/?$|[?&]p=2\b|[?&]page=2\b)", href):
            full = urljoin(base_url, href)
            if domain_of(full) == domain_of(base_url):
                return full
    return ""


# ------------------------------------------------------------ sources ---


def crawl_html_page(st: CrawlState, url: str, tag: str = "") -> BeautifulSoup | None:
    domain = domain_of(url)
    if st.breaker_tripped(domain):
        st.skipped.append(f"{url} (circuit breaker)")
        return None
    try:
        html = st.fetch(url).text
    except Exception as e:  # noqa: BLE001
        st.note_fail(url, e)
        return None
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:  # noqa: BLE001
        st.note_fail(url, e)
        return None
    src = domain + (f" {tag}" if tag else "")
    before = len(st.results)
    extract_json_ld(soup, src, st)
    extract_meta(soup, src, url, st)
    n_cards = extract_cards(soup, src, st)
    if len(st.results) == before and n_cards == 0:
        st.domain_fails[domain] += 1  # empty page counts against domain
    else:
        st.note_ok(domain)
    return soup


def crawl_feed(st: CrawlState, feed_url: str):
    try:
        text = st.fetch(feed_url, accept="application/rss+xml").text
        root = ET.fromstring(text)
    except Exception as e:  # noqa: BLE001
        st.note_fail(feed_url, e)
        return
    domain = domain_of(feed_url)
    n = 0
    for item in list(root.iter("item"))[:50] + list(root.iter(
            "{http://www.w3.org/2005/Atom}entry"))[:50]:
        title = clean((item.findtext("title") or
                       item.findtext("{http://www.w3.org/2005/Atom}title") or ""))
        if len(title) < 8:
            continue
        tags = []
        for cat in item.findall("category"):
            t = slug_to_tag(cat.text or "")
            if t:
                tags.append(t)
        tags = tags[:5] or ["#fyp"]
        st.add(title, tags, 1, domain + " (rss)")
        n += 1
    if n:
        st.note_ok(domain)


def crawl_sitemap(st: CrawlState, base_url: str):
    """Sitemap index -> video sitemap -> <video:title> harvest. 2 hits max."""
    domain = domain_of(base_url)
    sm_url = urljoin(base_url, "/sitemap.xml")
    try:
        index_xml = st.fetch(sm_url).text
    except Exception as e:  # noqa: BLE001
        st.note_fail(sm_url, e)
        return
    cands = []
    try:
        root = ET.fromstring(index_xml)
        for loc in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
            u = (loc.text or "").strip()
            if re.search(r"video|sitemap.*\d+", u, re.I):
                cands.append(u)
    except Exception:  # noqa: BLE001 - not an index, treat as urlset below
        pass
    docs = [index_xml]
    if cands:
        try:
            docs.append(st.fetch(cands[0]).text)
        except Exception as e:  # noqa: BLE001
            st.note_fail(cands[0], e)
    n = 0
    for doc in docs:
        try:
            root = ET.fromstring(doc)
        except Exception:  # noqa: BLE001
            continue
        for v in root.iter():
            if not v.tag.endswith("}title") and v.tag != "title":
                continue
            if "video" not in v.tag and "news" not in v.tag:
                continue
            title = clean(v.text or "")
            if len(title) >= 8:
                st.add(title, ["#fyp"], 1, domain + " (sitemap)")
                n += 1
                if n >= MAX_SITEMAP_URLS:
                    break
        if n >= MAX_SITEMAP_URLS:
            break
    if n:
        st.note_ok(domain)


def crawl_reddit(st: CrawlState, subs: list, sorts: list):
    for sub in subs:
        for sort in sorts:
            if st.breaker_tripped("reddit.com"):
                st.skipped.append(f"r/{sub}/{sort} (circuit breaker)")
                continue
            url = (f"https://www.reddit.com/r/{sub}/{sort}/.json"
                   f"?limit=50" + ("&t=day" if sort == "top" else ""))
            try:
                data = st.fetch(url, accept="application/json").json()
                posts = data.get("data", {}).get("children", [])
                if not posts:
                    raise ValueError("empty listing")
                for p in posts:
                    d = p.get("data", {})
                    title = clean(d.get("title", ""))
                    if len(title) < 8:
                        continue
                    tags = ["#fyp"]
                    flair = clean(d.get("link_flair_text", "") or "", 30)
                    if flair:
                        t = slug_to_tag(flair)
                        if t:
                            tags.append(t)
                    tags.append("#" + re.sub(r"\W+", "", sub.lower())[:24])
                    tags.append("#shortxx")
                    st.add(title, tags,
                           weight_for(int(d.get("score", 0) or 0)),
                           f"reddit.com/r/{sub}")
                st.note_ok("reddit.com")
            except Exception as e:  # noqa: BLE001
                st.note_fail(url, e)
                # RSS fallback: old.reddit serves .rss with zero auth, often
                # alive when the JSON API 403s on default UAs.
                rss = f"https://old.reddit.com/r/{sub}/{sort}/.rss?limit=50"
                try:
                    crawl_feed(st, rss)
                except Exception:  # noqa: BLE001 - already logged inside
                    pass


def crawl_site(st: CrawlState, base: str, args) -> dict:
    domain = domain_of(base)
    site_stats = {"pages": 0, "tag_pages": 0, "titles": 0}
    before = len(st.results)

    soup = crawl_html_page(st, base)
    if soup is None:
        return site_stats
    site_stats["pages"] += 1

    # Pagination: follow the site's own page-2 link, up to --pages deep.
    seen_urls = {base}
    nxt = discover_page2(soup, base)
    depth = 1
    while nxt and depth < args.pages and nxt not in seen_urls:
        seen_urls.add(nxt)
        s2 = crawl_html_page(st, nxt, tag=f"(p{depth + 1})")
        site_stats["pages"] += 1
        depth += 1
        if s2 is None:
            break
        nxt = discover_page2(s2, base)
        soup = s2  # keep last good soup for tag/feed discovery

    # RSS (one extra hit max)
    feed = discover_feed(soup, base)
    if feed and domain_of(feed) == domain:
        crawl_feed(st, feed)

    # Sitemap (two hits max)
    if not args.no_sitemap:
        crawl_sitemap(st, base)

    # Tag pages: most-linked internal tags first (niche-tag mining)
    if args.tag_pages > 0:
        for tag_url, label in extract_tag_links(soup, base)[:args.tag_pages]:
            if st.breaker_tripped(domain):
                st.skipped.append(f"{tag_url} (circuit breaker)")
                break
            t = slug_to_tag(label)
            s3 = crawl_html_page(st, tag_url, tag="(tag)")
            site_stats["tag_pages"] += 1
            if s3 is not None and t:
                # stamp the tag itself onto nothing — titles carry it via
                # on-page #tags; the label feeds merge_corpus keyword mining
                pass

    site_stats["titles"] = len(st.results) - before
    return site_stats


# -------------------------------------------------------------- main ---


def save_checkpoint(st: CrawlState):
    try:
        CHECKPOINT_FILE.write_text(json.dumps(
            {"done": sorted(st.done_site_keys),
             "results": st.results}), encoding="utf-8")
    except Exception as e:  # noqa: BLE001 - checkpoint is best-effort
        print(f"[warn] checkpoint failed: {e}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Big multi-source trend crawler")
    ap.add_argument("--limit-sites", type=int, default=0)
    ap.add_argument("--pages", type=int, default=2,
                    help="pagination depth per site (1 = homepage only)")
    ap.add_argument("--tag-pages", type=int, default=5,
                    help="top internal tag pages to crawl per site (0 = off)")
    ap.add_argument("--no-sitemap", action="store_true")
    ap.add_argument("--no-reddit", action="store_true")
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="fetch first site homepage only, print + exit")
    args = ap.parse_args()

    st = CrawlState(delay=max(2.0, args.delay), timeout=args.timeout)

    if args.resume and CHECKPOINT_FILE.exists():
        try:
            cp = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
            st.done_site_keys = set(cp.get("done", []))
            st.results = cp.get("results", [])
            print(f"[resume] {len(st.done_site_keys)} sites, "
                  f"{len(st.results)} titles restored", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[warn] bad checkpoint, starting fresh: {e}", flush=True)

    if args.dry_run:
        print(f"[dry-run] GET {SITES[0]}", flush=True)
        soup = crawl_html_page(st, SITES[0])
        if soup is None:
            print("[dry-run] homepage blocked/failed", flush=True)
            return 1
        print(f"[dry-run] titles={len(st.results)} "
              f"tag_links={len(extract_tag_links(soup, SITES[0]))} "
              f"feed={bool(discover_feed(soup, SITES[0]))} "
              f"page2={bool(discover_page2(soup, SITES[0]))}", flush=True)
        for r in st.results[:5]:
            print(f"  - {r['caption'][:80]} | {' '.join(r['hashtags'])}",
                  flush=True)
        return 0

    if not args.no_reddit:
        print(f"[crawl] reddit: {len(REDDIT_SUBS)} subs x "
              f"{len(REDDIT_SORTS)} sorts", flush=True)
        crawl_reddit(st, REDDIT_SUBS, REDDIT_SORTS)

    sites = SITES[:args.limit_sites] if args.limit_sites else SITES
    print(f"[crawl] html sites: {len(sites)} "
          f"(pages<={args.pages}, tag_pages<={args.tag_pages}, "
          f"sitemap={not args.no_sitemap})", flush=True)
    per_site: dict = {}
    for i, base in enumerate(sites, 1):
        if base in st.done_site_keys:
            print(f"[skip] {base} (checkpoint)", flush=True)
            continue
        print(f"[crawl] ({i}/{len(sites)}) GET {base}", flush=True)
        per_site[base] = crawl_site(st, base, args)
        st.done_site_keys.add(base)
        if i % 3 == 0:
            save_checkpoint(st)

    # Dedup by caption, keep highest weight, split girls/couples
    best: dict = {}
    for r in st.results:
        key = r["caption"].lower()
        if key not in best or r["weight"] > best[key]["weight"]:
            best[key] = r
    girls = [v for v in best.values()
             if categorize(v["caption"], v["hashtags"]) == "girls"]
    couples = [v for v in best.values()
               if categorize(v["caption"], v["hashtags"]) == "couples"]
    girls.sort(key=lambda r: -r["weight"])
    couples.sort(key=lambda r: -r["weight"])

    out_path = Path(args.out)
    if out_path.exists() and (girls or couples):
        bak = out_path.with_suffix(".prev.json")
        bak.write_bytes(out_path.read_bytes())
        print(f"[save] previous output backed up -> {bak.name}", flush=True)
    out_path.write_text(json.dumps({"girls": girls, "couples": couples},
                                   indent=2, ensure_ascii=False),
                        encoding="utf-8")

    hook_hits = sum(1 for r in best.values()
                    if any(w in r["caption"].lower() for w in HOOK_WORDS))
    stats = {
        "titles_raw": len(st.results),
        "titles_unique": len(best),
        "girls": len(girls),
        "couples": len(couples),
        "hook_style": hook_hits,
        "domain_hits": dict(st.domain_hits),
        "domain_fails": {k: v for k, v in st.domain_fails.items() if v},
        "skipped": st.skipped,
        "per_site": per_site,
    }
    STATS_FILE.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    try:
        CHECKPOINT_FILE.unlink()
    except OSError:
        pass

    print(f"[done] raw={len(st.results)} unique={len(best)} "
          f"girls={len(girls)} couples={len(couples)} "
          f"hook_style={hook_hits} -> {out_path.name}", flush=True)
    print(f"[done] stats -> {STATS_FILE.name}", flush=True)
    for err in st.errors[:25]:
        print(f"[warn] {err}", flush=True)
    if len(st.errors) > 25:
        print(f"[warn] ... +{len(st.errors) - 25} more (see stats file)",
              flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
