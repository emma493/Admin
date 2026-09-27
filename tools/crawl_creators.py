"""
Creator crawler (Beta) — girls-only creator discovery for Upload flow.

TEXT METADATA ONLY: creator usernames + avatar/profile-image URL strings.
Never downloads image bytes, never logs in, never touches paywalls/captchas.
Polite: >=2s delay between hits, 20s timeouts, rotated browser UAs,
per-site try/except so one block never kills the run.

What it does per site:
  1. Fetch listing homepage (the 18 URLs below).
  2. Collect candidate creator/profile links:
     /model/..., /creator/..., /profile/..., /user/..., /pornstar/...,
     /channel/..., /@username — same-domain only.
  3. Visit up to --max-profiles candidates per site (bounded).
  4. On each profile page extract:
     - username: from URL slug, og:title, <h1>, or profile heading.
     - avatarUrl: from og:image / twitter:image / <img class*=avatar|profile|photo>
       URL string only (never fetched). Must look like an image
       (.jpg/.jpeg/.png/.webp, or /profile-photos/ /avatar/ path).
  5. Girls-only filter: REJECT any candidate whose username, profile title,
     tags or URL contains male/couple/trans markers (see BLOCK_RE). Only
     survivors are written. Confidence = high when avatar path looks like a
     profile photo AND no block-word hit anywhere; else medium. There is no
     face-recognition here — final girl-check is human review in Admin
     (Creators page preview) before any import.

18+ ADULT SITES: all targets are 18+ adult aggregators. Output is
review-only raw data for an adult-project admin. Do NOT import minors —
every entry must be treated as unverified until a human confirms adult
creator in the Creators UI.

Usage:
    python tools/crawl_creators.py --dry-run
    python tools/crawl_creators.py --limit-sites 3 --max-profiles 5
    python tools/crawl_creators.py   # full run -> tools/creators.crawled.json

Output: tools/creators.crawled.json
    [{"username": str, "avatarUrl": str, "profileUrl": str,
      "source": domain, "confidence": "high|medium"}]
Raw + unverified. A later step (owner order) will curate into creators.
"""
import argparse
import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

# cp1252 console breaks on smart quotes/emoji — force utf-8 first.
sys.stdout.reconfigure(encoding="utf-8")

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "creators.crawled.json"

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

# The 18 targets from owner order (girls-category creator discovery).
SITES = [
    "https://nuditok.com/",
    "https://tiktits.com/",
    "https://onlyscroll.com/",
    "https://www.shorts.xxx/",
    "https://reelsmunkey.com/",
    "https://reddxxx.com/",
    "https://saucesenpai.com/",
    "https://pornobae.com/",
    "https://pin.porn/",
    "https://onlytik.com/",
    "https://ogfap.com/",
    "https://waptap.com/",
    "https://www.xxxfollow.com/",
    "https://sharesome.com/",
    "https://fyptt.to/",
    "https://www.hornyleak.tv/",
    "https://www.reddit.com/r/tiktokporn/",
    "https://www.reddit.com/r/tiktoknsfw/",
    # More similar aggregators (from TREND_SOURCES) — handle mining only,
    # expect blocks on several; per-site try/except keeps the run alive.
    "https://tik.porn/",
    "https://www.xfree.com/",
    "https://xxxtik.com/",
    "https://fikfap.com/",
    "https://fkbae.to/",
    "https://www.redgifs.com/",
    "https://www.sex.com/",
]

# Reject male / couple / trans / group markers — girls-only means solo
# female-presenting creators. Word-boundary matched against username +
# profile title + tags + URL blob (lowercased).
BLOCK_RE = re.compile(
    r"(boy|male|man\b|men\b|dude|bro|daddy|gay|straight|couple|duo|"
    r"wife|husband|threesome|foursome|orgy|gangbang|trans|transgender|"
    r"shemale|ladyboy|femboy|twink|bear\b|papa\b|mr\b|_m\b|\bm_)",
    re.I,
)

# Hints that this really is a creator identity (not a video/tag page).
PROFILE_HREF_RE = re.compile(
    r"/(model|models|creator|creators|profile|profiles|user|users|"
    r"pornstar|pornstars|channel|channels|member|members|girl|girls)/"
    r"[A-Za-z0-9_\-]{2,40}/?",
    re.I,
)
AT_HREF_RE = re.compile(r"/@([A-Za-z0-9_\.]{2,30})/?$")

WS_RE = re.compile(r"\s+")
IMG_OK_RE = re.compile(r"\.(jpg|jpeg|png|webp)(\?.*)?$", re.I)
IMG_PATH_HINT = re.compile(
    r"(profile-photo|profilepic|profile_pic|avatar|creator|model|photo)",
    re.I,
)
JUNK_SLUGS = {
    "login", "signup", "register", "upload", "search", "tag", "tags",
    "category", "categories", "videos", "video", "watch", "page",
    "about", "contact", "privacy", "terms", "dmca", "2257", "faq",
    "help", "blog", "home", "index", "trending", "popular", "top",
    "new", "hot",
}

# Category/tag slugs that LOOK like creators under /girls|models|tags /
# paths (tiktits.com/girls/african) but are listing pages, not people.
# Exact-match only — never filters a longer real handle.
CATEGORY_JUNK = {
    "african", "arab", "asian", "latina", "ebony", "white", "european",
    "blonde", "brunette", "redhead", "curly", "shy", "tattoo", "tattoos",
    "piercing", "piercings", "glasses", "lingerie", "bikini", "beach",
    "pool", "shower", "bedroom", "car", "gym", "dance", "dancing",
    "twerk", "yoga", "cosplay", "maid", "nurse", "secretary", "teacher",
    "milf", "mature", "granny", "teen", "teens", "18", "amateur",
    "amateurs", "homemade", "solo", "lesbian", "anal", "blowjob", "cum",
    "squirt", "big", "small", "huge", "tiny", "petite", "curvy", "thick",
    "skinny", "tits", "boobs", "ass", "pussy", "hot", "sexy", "nude",
    "naked", "porn", "sex", "xxx", "nsfw", "fyp", "viral", "girl",
    "girls", "boy", "boys", "model", "models", "creator", "creators",
    "user", "users", "channel", "channels", "video", "videos",
    "indian", "ukrainian", "latin", "russian", "brazilian", "colombian",
    "bdsm", "best", "hottest", "rated", "young", "grannies", "milfs",
    "vr", "stars", "pornstars", "studios",
}


def clean(text: str, limit: int = 80) -> str:
    text = WS_RE.sub(" ", (text or "")).strip(" -|•·")
    return text[:limit].strip()


def domain_of(url: str) -> str:
    return urlparse(url).netloc.lower() or url


def polite_get(session: requests.Session, url: str, delay: float,
               timeout: int) -> requests.Response:
    headers = {"User-Agent": random.choice(UA_POOL),
               "Accept": "text/html,application/xhtml+xml"}
    last: Exception = requests.RequestException("no attempt")
    for attempt in range(2):
        try:
            r = session.get(url, headers=headers, timeout=timeout)
            r.raise_for_status()
            time.sleep(delay)
            return r
        except Exception as e:  # noqa: BLE001 - retry once, then raise
            last = e
            time.sleep(delay + attempt * 2.0)
    time.sleep(delay)
    raise last


def slug_to_username(slug: str) -> str:
    slug = unquote(slug or "").strip().strip("/@")
    # nuditok-style: profile-photos/elissecinnamon.jpg -> elissecinnamon
    slug = re.sub(r"\.(jpg|jpeg|png|webp)$", "", slug, flags=re.I)
    slug = slug.split("/")[-1].split("?")[0]
    slug = re.sub(r"[^A-Za-z0-9_\.\-]", "", slug)
    return slug[:30]


def username_ok(name: str) -> bool:
    if not name or len(name) < 2:
        return False
    low = name.lower()
    if low in JUNK_SLUGS or low in CATEGORY_JUNK:
        return False
    if re.fullmatch(r"[0-9]+", name):
        return False  # numeric channel IDs (sex.com/en/channels/242)
    if BLOCK_RE.search(low):
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9_\.\-]{2,30}", name))


def page_blob_blocked(*parts: str) -> bool:
    blob = " ".join(p for p in parts if p).lower()
    return bool(BLOCK_RE.search(blob))


def pick_avatar(soup: BeautifulSoup, page_url: str) -> str:
    """First plausible avatar/profile image URL string (never fetched)."""
    cands: list[str] = []
    # 1) OG / Twitter meta image — most reliable avatar signal.
    for prop in ("og:image", "twitter:image"):
        el = soup.find("meta", attrs={"property": prop}) or \
            soup.find("meta", attrs={"name": prop})
        if el and el.get("content"):
            cands.append(el["content"].strip())
    # 2) <img> with avatar/profile/photo class or path hint.
    for img in soup.find_all("img", src=True):
        src = img["src"].strip()
        cls = " ".join(img.get("class", []))
        alt = img.get("alt", "")
        if IMG_PATH_HINT.search(src + " " + cls + " " + alt):
            cands.append(src)
    # 3) link rel=image_src fallback.
    link = soup.find("link", rel="image_src")
    if link and link.get("href"):
        cands.append(link["href"].strip())
    for raw in cands:
        if not raw or raw.startswith("data:"):
            continue
        full = urljoin(page_url, raw)
        if not full.startswith(("http://", "https://")):
            continue
        if IMG_OK_RE.search(full.split("?")[0]):
            return full
    return ""


def pick_username(soup: BeautifulSoup, profile_url: str) -> str:
    # 1) URL slug first (most stable across these aggregators).
    path = urlparse(profile_url).path
    slug = slug_to_username(path)
    if username_ok(slug):
        return slug
    # 2) @handle links on the page.
    for a in soup.find_all("a", href=True):
        m = AT_HREF_RE.search(a["href"])
        if m and username_ok(m.group(1)):
            return m.group(1)
    # 3) og:title / h1 headings ("Elisse Cinnamon (@elissecinnamon)").
    for src in (
        (soup.find("meta", attrs={"property": "og:title"}) or {}).get("content", "")
        if soup.find("meta", attrs={"property": "og:title"}) else "",
        soup.find("h1").get_text() if soup.find("h1") else "",
    ):
        m = re.search(r"@([A-Za-z0-9_\.]{2,30})", src or "")
        if m and username_ok(m.group(1)):
            return m.group(1)
        words = clean(src, 40)
        if words and username_ok(re.sub(r"\s+", "", words)[:30]):
            cand = re.sub(r"\s+", "", words)[:30]
            if username_ok(cand):
                return cand
    return ""


def collect_profile_links(soup: BeautifulSoup, base_url: str,
                          cap: int = 60) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].split("#")[0].strip()
        if not href or href.startswith(("javascript:", "mailto:")):
            continue
        full = urljoin(base_url, href)
        if domain_of(full) != domain_of(base_url):
            continue
        if PROFILE_HREF_RE.search(full) or AT_HREF_RE.search(full):
            if full not in seen:
                seen.add(full)
                out.append(full)
        if len(out) >= cap:
            break
    return out


def discover_feed_urls(soup: BeautifulSoup, base_url: str) -> list[str]:
    """RSS/Atom feed URLs: <link rel=alternate> first, else /feed.xml+/rss.xml
    probes (caller fetches at most 2 — bounded, polite)."""
    out: list[str] = []
    for link in soup.find_all("link", rel="alternate"):
        href = (link.get("href") or "").strip()
        typ = (link.get("type") or "").lower()
        if href and ("rss" in typ or "atom" in typ or "xml" in typ):
            full = urljoin(base_url, href)
            if domain_of(full) == domain_of(base_url) and full not in out:
                out.append(full)
    return out[:2]


def handles_from_feed_xml(text: str, base_url: str,
                          cap: int = 60) -> list[str]:
    """Creator profile URLs mined from Atom/RSS XML: /@handle entry links +
    <author><uri>https://domain/@handle</uri> elements. Nuditok-style SPAs
    expose zero links in homepage HTML but full handles here."""
    out: list[str] = []
    seen: set[str] = set()
    dom = domain_of(base_url)
    for m in re.finditer(r"https?://[^\"'<>\s]+?/@([A-Za-z0-9_\.]{2,30})",
                         text):
        handle = m.group(1)
        if not username_ok(handle):
            continue
        full = f"https://{dom}/@{handle}"
        if full not in seen:
            seen.add(full)
            out.append(full)
        if len(out) >= cap:
            break
    return out


def handles_from_sitemap_xml(text: str, base_url: str,
                             cap: int = 100) -> list[str]:
    """Creator URLs mined from sitemap XML: video/page <loc> entries shaped
    like /@handle/... or /model|creator|girl(s)/slug. Static, no JS needed."""
    out: list[str] = []
    seen: set[str] = set()
    dom = domain_of(base_url)
    for m in re.finditer(r"<loc>\s*(https?://[^<\s]{4,220})\s*</loc>", text):
        loc = m.group(1).strip()
        if domain_of(loc) != dom:
            continue
        full = ""
        am = AT_HREF_RE.search(loc)
        pm = PROFILE_HREF_RE.search(loc)
        if am and username_ok(am.group(1)):
            full = f"https://{dom}/@{am.group(1)}"
        elif pm:
            slug = slug_to_username(urlparse(loc).path)
            if username_ok(slug):
                full = loc.split("?")[0]
        if full and full not in seen:
            seen.add(full)
            out.append(full)
        if len(out) >= cap:
            break
    return out


def fetch_sitemap_handles(session: requests.Session, base: str,
                          delay: float, timeout: int,
                          cap: int = 100) -> tuple[list, list]:
    """Bounded sitemap mining: /sitemap.xml, then ONE sub-sitemap whose URL
    hints video/model/content. Max 2 fetches per site."""
    found: list = []
    errors: list = []
    dom = domain_of(base)
    headers = {"User-Agent": random.choice(UA_POOL)}
    try:
        r = session.get(urljoin(base, "/sitemap.xml"), headers=headers,
                        timeout=timeout)
        r.raise_for_status()
        time.sleep(delay)
        index_xml = r.text
    except Exception as e:  # noqa: BLE001
        return found, [f"{base}sitemap.xml -> {type(e).__name__}: {e}"]
    found.extend(handles_from_sitemap_xml(index_xml, base, cap))
    cands = [u for u in re.findall(
        r"<loc>\s*(https?://[^<\s]{4,220})\s*</loc>", index_xml)
        if re.search(r"video|model|creator|content|sitemap", u, re.I)]
    if cands and len(found) < cap:
        try:
            r2 = session.get(cands[0], headers=headers, timeout=timeout)
            r2.raise_for_status()
            time.sleep(delay)
            found.extend(handles_from_sitemap_xml(r2.text, base, cap))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{cands[0]} -> {type(e).__name__}: {e}")
    seen: set[str] = set()
    uniq = [u for u in found if not (u in seen or seen.add(u))]
    return uniq[:cap], errors


def collect_reddit_authors(session: requests.Session,
                           subs: list[str], delay: float, timeout: int,
                           cap: int = 150) -> tuple[list, list]:
    """Dozens of poster usernames fast: sub JSON (+old.reddit RSS fallback
    when JSON 403s). No avatars — flagged source=reddit for the owner."""
    found: list = []
    errors: list = []
    seen: set[str] = set()
    for sub in subs:
        if len(found) >= cap:
            break
        for url in (f"https://www.reddit.com/r/{sub}/hot/.json?limit=100",
                    f"https://old.reddit.com/r/{sub}/hot/.rss?limit=100"):
            if len(found) >= cap:
                break
            try:
                headers = {"User-Agent": random.choice(UA_POOL),
                           "Accept": "application/json, application/rss+xml"}
                t = session.get(url, headers=headers, timeout=timeout).text
                time.sleep(delay)
                names: list[str] = []
                if url.endswith(".rss?limit=100"):
                    names = re.findall(r"<author>\s*<name>\s*/?u?/?([A-Za-z0-9_\-]{2,30})",
                                       t)
                else:
                    try:
                        data = json.loads(t)
                        posts = data.get("data", {}).get("children", [])
                        names = [p.get("data", {}).get("author", "")
                                 for p in posts]
                    except Exception:  # noqa: BLE001 - not JSON, try text
                        names = re.findall(r'"author"\s*:\s*"([A-Za-z0-9_\-]{2,30})"',
                                           t)
                hit = False
                for n in names:
                    n = (n or "").strip().lstrip("/").removeprefix("u/")
                    if n.lower() in ("automoderator", "none", ""):
                        continue
                    if not username_ok(n) or n.lower() in seen:
                        continue
                    seen.add(n.lower())
                    found.append({"username": n,
                                  "profileUrl": f"https://www.reddit.com/user/{n}/",
                                  "source": f"reddit r/{sub}"})
                    hit = True
                    if len(found) >= cap:
                        break
                if hit:
                    break  # JSON worked — skip RSS fallback for this sub
            except Exception as e:  # noqa: BLE001
                errors.append(f"{url} -> {type(e).__name__}: {e}")
                continue
    return found, errors


def crawl_profile(session: requests.Session, profile_url: str, domain: str,
                  delay: float, timeout: int) -> dict | None:
    """Fetch ONE profile page, return record or None (blocked / male / no data)."""
    try:
        html = polite_get(session, profile_url, delay, timeout).text
    except Exception as e:  # noqa: BLE001 - per-profile errors never kill run
        return {"_error": f"{profile_url} -> {type(e).__name__}: {e}"}
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:  # noqa: BLE001
        return {"_error": f"{profile_url} -> parse {e}"}

    username = pick_username(soup, profile_url)
    avatar = pick_avatar(soup, profile_url)
    title = clean(soup.title.string if soup.title and soup.title.string else "")
    h1 = clean(soup.find("h1").get_text() if soup.find("h1") else "")
    # on-page tags for the girls-only gate
    tags = " ".join(
        clean(a.get_text(), 24) for a in soup.find_all("a", href=True)
        if "/tag" in (a.get("href") or "").lower()
    )[:400]

    # Girls-only gate: username, title, h1, tags, URL must carry NO block word.
    if not username:
        return None
    if page_blob_blocked(username, title, h1, tags, profile_url):
        return None
    if not avatar:
        return None  # owner requires image+profile match; imageless skipped

    high = bool(IMG_PATH_HINT.search(avatar))
    return {
        "username": username,
        "avatarUrl": avatar,
        "profileUrl": profile_url,
        "source": domain,
        "confidence": "high" if high else "medium",
    }


def handle_from_profile_url(profile_url: str) -> str:
    """Username straight from a creator URL — no page visit needed."""
    m = AT_HREF_RE.search(profile_url)
    if m and username_ok(m.group(1)):
        return m.group(1)
    return slug_to_username(urlparse(profile_url).path) \
        if username_ok(slug_to_username(urlparse(profile_url).path)) else ""


def collect_site_usernames(session: requests.Session, base: str,
                           args) -> tuple[list, list]:
    """Fast pass: listing HTML + feeds only, zero profile-page visits."""
    found: list = []
    errors: list = []
    domain = domain_of(base)
    if domain == "reddit.com" or domain.endswith(".reddit.com"):
        errors.append(f"{base} -> skipped in usernames-only mode "
                      f"(no aggregator profile URLs)")
        return found, errors
    try:
        html = polite_get(session, base, args.delay, args.timeout).text
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:  # noqa: BLE001
        errors.append(f"{base} -> {type(e).__name__}: {e}")
        return found, errors

    links = collect_profile_links(soup, base, cap=args.max_profiles)
    feed_urls = discover_feed_urls(soup, base)
    if not feed_urls:
        feed_urls = [urljoin(base, "/feed.xml"), urljoin(base, "/rss.xml")]
    hcap = getattr(args, "handle_cap", 150)
    for furl in feed_urls[:2]:
        try:
            ftext = polite_get(session, furl, args.delay, args.timeout).text
        except Exception as e:  # noqa: BLE001 - missing feed, not fatal
            errors.append(f"{furl} -> {type(e).__name__}: {e}")
            continue
        for purl in handles_from_feed_xml(ftext, base, hcap):
            if purl not in links:
                links.append(purl)
            if len(links) >= hcap:
                break
    # Sitemap mining: static creator/video URLs, no JS needed (bounded).
    if len(links) < hcap:
        sm_links, sm_errors = fetch_sitemap_handles(
            session, base, args.delay, args.timeout, hcap - len(links))
        errors.extend(sm_errors)
        for purl in sm_links:
            if purl not in links:
                links.append(purl)
    for purl in links[:hcap]:
        name = handle_from_profile_url(purl)
        if not name:
            continue
        found.append({"username": name, "profileUrl": purl,
                      "source": domain})
    if not found:
        errors.append(f"{base} -> empty: no creator handles found")
    return found, errors


def crawl_site(session: requests.Session, base: str, args) -> tuple[list, list]:
    found: list = []
    errors: list = []
    domain = domain_of(base)
    if domain == "reddit.com" or domain.endswith(".reddit.com"):
        errors.append(f"{base} -> skipped: reddit has no avatar profiles "
                      f"(use post authors separately)")
        return found, errors
    try:
        html = polite_get(session, base, args.delay, args.timeout).text
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:  # noqa: BLE001
        errors.append(f"{base} -> {type(e).__name__}: {e}")
        return found, errors

    # Homepage-level girls-only context (skip male-labeled listing pages).
    if page_blob_blocked(soup.title.string if soup.title else "", base):
        errors.append(f"{base} -> skipped: listing looks non-girls")
        return found, errors

    links = collect_profile_links(soup, base)[:args.max_profiles]
    # Feed fallback: SPA homepages (nuditok-style) carry zero HTML links
    # but publish /@handle creators in Atom/RSS. Max 2 extra hits.
    if len(links) < args.max_profiles:
        feed_urls = discover_feed_urls(soup, base)
        if not feed_urls:
            feed_urls = [urljoin(base, "/feed.xml"), urljoin(base, "/rss.xml")]
        for furl in feed_urls[:2]:
            try:
                ftext = polite_get(session, furl, args.delay,
                                   args.timeout).text
            except Exception as e:  # noqa: BLE001 - missing feed, not fatal
                errors.append(f"{furl} -> {type(e).__name__}: {e}")
                continue
            for purl in handles_from_feed_xml(
                    ftext, base, args.max_profiles - len(links)):
                if purl not in links:
                    links.append(purl)
            if len(links) >= args.max_profiles:
                break
    if not links:
        errors.append(f"{base} -> empty: no /model|creator|profile|@ links found "
                      f"(JS-rendered or changed markup?)")
    for url in links:
        rec = crawl_profile(session, url, domain, args.delay, args.timeout)
        if rec is None:
            continue
        if "_error" in rec:
            errors.append(rec["_error"])
            continue
        found.append(rec)
    return found, errors


def main() -> int:
    ap = argparse.ArgumentParser(description="Girls-only creator crawler")
    ap.add_argument("--limit-sites", type=int, default=0)
    ap.add_argument("--max-profiles", type=int, default=20,
                    help="profile pages visited per site (bounded)")
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    ap.add_argument("--dry-run", action="store_true",
                    help="fetch first site homepage, list links, no writes")
    ap.add_argument("--usernames-only", action="store_true",
                    help="fast pass: collect usernames + profile URLs from "
                    "listings/feeds WITHOUT visiting profile pages "
                    "(no avatar check). Writes profile-url.txt: "
                    "'username profileUrl source' per line.")
    ap.add_argument("--handle-cap", type=int, default=150,
                    help="max handles collected per site in usernames-only "
                    "mode (default 150)")
    args = ap.parse_args()
    args.delay = max(2.0, args.delay)

    session = requests.Session()
    sites = SITES[:args.limit_sites] if args.limit_sites else SITES

    if args.dry_run:
        print(f"[dry-run] GET {sites[0]}", flush=True)
        try:
            html = polite_get(session, sites[0], args.delay, args.timeout).text
            soup = BeautifulSoup(html, "html.parser")
            links = collect_profile_links(soup, sites[0])
            print(f"[dry-run] profile_links={len(links)}", flush=True)
            for u in links[:10]:
                print(f"  - {u}", flush=True)
            feeds = discover_feed_urls(soup, sites[0]) or \
                [urljoin(sites[0], "/feed.xml")]
            try:
                ftext = polite_get(session, feeds[0], args.delay,
                                   args.timeout).text
                flinks = handles_from_feed_xml(ftext, sites[0])
                print(f"[dry-run] feed={feeds[0]} handles={len(flinks)}",
                      flush=True)
                for u in flinks[:10]:
                    print(f"  @ {u}", flush=True)
                links = links or flinks
            except Exception as e:  # noqa: BLE001
                print(f"[dry-run] feed failed: {e}", flush=True)
            if links:
                rec = crawl_profile(session, links[0], domain_of(sites[0]),
                                    args.delay, args.timeout)
                print(f"[dry-run] sample={json.dumps(rec, ensure_ascii=False)}",
                      flush=True)
            return 0
        except Exception as e:  # noqa: BLE001
            print(f"[dry-run] failed: {type(e).__name__}: {e}", flush=True)
            return 1

    all_found: list = []
    all_errors: list = []
    mode = "usernames-only (no profile visits)" if args.usernames_only \
        else f"max_profiles={args.max_profiles}"
    print(f"[crawl] sites={len(sites)} {mode}", flush=True)
    for i, base in enumerate(sites, 1):
        print(f"[crawl] ({i}/{len(sites)}) GET {base}", flush=True)
        try:
            if args.usernames_only:
                found, errors = collect_site_usernames(session, base, args)
            else:
                found, errors = crawl_site(session, base, args)
        except Exception as e:  # noqa: BLE001 - one site never kills run
            all_errors.append(f"{base} -> {type(e).__name__}: {e}")
            continue
        all_found.extend(found)
        all_errors.extend(errors)
        print(f"[crawl] -> {len(found)} creators ({domain_of(base)})",
              flush=True)

    if args.usernames_only:
        best: dict = {}
        for r in all_found:
            key = r["username"].lower()
            if key not in best:
                best[key] = r
        # Reddit poster mining: dozens of extra usernames, 2-4 fetches.
        rd_found, rd_errors = collect_reddit_authors(
            session, ["tiktoknsfw", "tiktokporn"], args.delay, args.timeout)
        all_errors.extend(rd_errors)
        for r in rd_found:
            if r["username"].lower() not in best:
                best[r["username"].lower()] = r
        print(f"[crawl] reddit -> {len(rd_found)} authors", flush=True)
        final = sorted(best.values(), key=lambda r: r["username"].lower())
        out_path = Path(args.out) if args.out != str(DEFAULT_OUT) \
            else HERE / "profile-url.txt"
        out_path.write_text(
            "\n".join(f"{r['username']} {r['profileUrl']} {r['source']}"
                      for r in final) + ("\n" if final else ""),
            encoding="utf-8")
        print(f"[done] usernames={len(final)} errors={len(all_errors)} "
              f"-> {out_path.name}", flush=True)
        for err in all_errors[:25]:
            print(f"[warn] {err}", flush=True)
        if len(all_errors) > 25:
            print(f"[warn] ... +{len(all_errors) - 25} more", flush=True)
        print("[note] usernames-only: NO avatar check, NO page-level "
              "girls-only gate (username block-words only). Owner adds "
              "images + confirms each is an adult woman before import.",
              flush=True)
        return 0

    # Dedup by lowercase username, prefer high confidence + nuditok-style
    # profile-photo paths (owner example: cdn2.nuditok.com/profile-photos/*.jpg).
    best: dict = {}
    for r in all_found:
        key = r["username"].lower()
        cur = best.get(key)
        score = (1 if r["confidence"] == "high" else 0) + \
                (1 if "profile-photo" in r["avatarUrl"] else 0)
        cur_score = -1 if cur is None else (
            (1 if cur["confidence"] == "high" else 0) +
            (1 if "profile-photo" in cur["avatarUrl"] else 0))
        if cur is None or score > cur_score:
            best[key] = r
    final = sorted(best.values(), key=lambda r: r["username"].lower())

    out_path = Path(args.out)
    out_path.write_text(json.dumps(final, indent=2, ensure_ascii=False),
                        encoding="utf-8")
    print(f"[done] creators={len(final)} errors={len(all_errors)} "
          f"-> {out_path.name}", flush=True)
    for err in all_errors[:25]:
        print(f"[warn] {err}", flush=True)
    if len(all_errors) > 25:
        print(f"[warn] ... +{len(all_errors) - 25} more", flush=True)
    print("[note] girls-only is heuristic (block-word gate). Human must "
          "confirm each avatar/profile is an adult woman before any import.",
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
