"""
Merge step: turn raw crawl output into AI-ready corpus entries.

- Keeps only hook-style captions (brief, no explicit terms, not
  performer-name-only junk) -> appended into src/lib/trend-corpus.json
  (manual entries preserved, deduped).
- Mines frequent niche keywords from ALL crawled titles -> printed as
  suggested hashtag additions for captionAI.ts banks.
- Prints a merge report. Review output before relying on it.

Usage:  python tools/merge_corpus.py
"""
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CRAWLED = HERE / "trend-corpus.crawled.json"
CORPUS = HERE.parent / "src" / "lib" / "trend-corpus.json"

BLOCKED = re.compile(
    r"(puss(y|ies)|cock|dick|boob|tit\b|tits|titty|titties|nude|naked|\bporn\b|porno|xxx\b|"
    r"\bsex\b|striptease|\bstrip\b|masturbat|orgasm|cum\b|creampie|\banal\b|lesbian|"
    r"\bgay\b|strapon|dildo|vibrator|fuck|fck|slut|whore|doggy|cowgirl|rimjob|"
    r"scissor|tribb|milf|threesome|spit roast|pounded|blowjob|hentai|uncensored|"
    r"breedable)", re.I)

STOP = set(("with", "from", "that", "this", "have", "more", "free", "video",
            "videos", "movie", "movies", "scene", "scenes", "showing", "show",
            "watch", "best", "compilation", "gets", "after", "while", "into",
            "your", "young", "hot", "sexy", "big"))

SITE_JUNK = {"tik.porn", "xfree", "sex.com", "xxxtik", "fikfap"}


def hook_ok(caption: str) -> bool:
    if not (15 <= len(caption) <= 120):
        return False
    words = caption.split()
    if len(words) < 3:
        return False
    if BLOCKED.search(caption):
        return False
    low = caption.lower().strip()
    if low in SITE_JUNK:
        return False
    # performer-name-only: <=3 words, all title-cased, no hook signal
    if len(words) <= 3 and all(w[:1].isupper() for w in words):
        return False
    return True


def main() -> None:
    crawled = json.loads(CRAWLED.read_text(encoding="utf-8"))
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    have = {e["caption"].lower() for cat in ("girls", "couples") for e in corpus.get(cat, [])}

    added = {"girls": 0, "couples": 0}
    kw = {"girls": Counter(), "couples": Counter()}
    for cat in ("girls", "couples"):
        for e in crawled.get(cat, []):
            cap = e["caption"]
            for w in re.findall(r"[a-z]{4,}", cap.lower()):
                if w not in STOP and not BLOCKED.search(w):
                    kw[cat][w] += e.get("weight", 1)
            if hook_ok(cap) and cap.lower() not in have:
                have.add(cap.lower())
                tags = [t for t in e["hashtags"] if t != "#fyp"][:3] or []
                corpus.setdefault(cat, []).append({
                    "caption": cap,
                    "hashtags": ["#fyp", *tags, "#shortxx"][:5],
                    "weight": 2 if len(cap) <= 60 else 1,
                })
                added[cat] += 1

    CORPUS.write_text(json.dumps(corpus, indent=2), encoding="utf-8")
    print(f"[merge] added girls={added['girls']} couples={added['couples']}")
    print(f"[merge] corpus now girls={len(corpus['girls'])} couples={len(corpus['couples'])}")
    print("[tags] top mined keywords -> candidate hashtag additions:")
    for cat in ("girls", "couples"):
        top = [w for w, _ in kw[cat].most_common(25)]
        print(f"  {cat}: {', '.join('#' + w for w in top)}")


if __name__ == "__main__":
    main()
