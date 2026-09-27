"""
Creator watcher (Beta) — continuous autopilot for the owner workflow.

Every --interval seconds it:
  1. Reads `Admins/profile creators.txt`, creates Firestore creator docs
     for NEW `username image-link` lines only (state file remembers what
     was already processed — never double-creates).
  2. Re-scrapes the nuditok Atom feed for NEW @handles and appends them
     to `Admins/nuditok-usernames.txt` (username block-word gate only).

Owner flow: paste a line, wait <=1 cycle, account exists. Nothing else
to run. Polite: 1 feed fetch per cycle + 1 REST call per new creator.

Safety: only the exact pairs the owner pasted are ever written. No seeds,
no test data. Girls-only + 18+ confirmation stays human (pasting the
image URL = owner checked the profile is an adult woman).

Usage:
    python tools/creator_watch.py                      # foreground
    python tools/creator_watch.py --interval 120        # 2-min cycles
    python tools/creator_watch.py --once                # single cycle + exit
State: tools/.creator_watch.state.json
Log: stdout (redirect to file when launched in background).
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

# cp1252 console breaks on non-ASCII — force utf-8 first.
sys.stdout.reconfigure(encoding="utf-8")

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crawl_creators import (  # noqa: E402
    UA_POOL,
    handles_from_feed_xml,
    username_ok,
)
from add_creator import CONFIG, parse_line  # noqa: E402

import random

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PASTE_FILE = ROOT.parent / "Admins" / "profile creators.txt"
KEEP_FILE = ROOT.parent / "Admins" / "nuditok-usernames.txt"
STATE_FILE = HERE / ".creator_watch.state.json"
NUDI_FEED = "https://nuditok.com/feed.xml"


def log(msg: str):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}",
          flush=True)


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - first run, no state yet
        return {"processed_lines": [], "created": [], "known_handles": []}


def save_state(st: dict):
    STATE_FILE.write_text(json.dumps(st, indent=1), encoding="utf-8")


def rest_create(username: str, avatar_url: str) -> str:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {"fields": {
        "username": {"stringValue": username},
        "avatarUrl": {"stringValue": avatar_url},
        "is_active": {"booleanValue": True},
        "created_at": {"timestampValue": now},
    }}
    url = (f"https://firestore.googleapis.com/v1/projects/{cfg['projectId']}"
           f"/databases/(default)/documents/creators?key={cfg['apiKey']}")
    r = requests.post(url, json=payload, timeout=20)
    r.raise_for_status()
    return r.json().get("name", "").split("/")[-1]


def cycle(st: dict, session: requests.Session, delay: float) -> dict:
    # 1) New pasted pairs -> creators.
    if PASTE_FILE.exists():
        fresh: list[str] = []
        for line in PASTE_FILE.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s and not s.startswith("#") and s not in st["processed_lines"]:
                fresh.append(s)
        for line in fresh:
            try:
                username, avatar = parse_line(line)
                if username.lower() in {c.lower() for c in st["created"]}:
                    log(f"[skip] @{username} already created")
                else:
                    doc_id = rest_create(username, avatar)
                    st["created"].append(username)
                    log(f"[ok] creator @{username} -> creators/{doc_id}")
            except Exception as e:  # noqa: BLE001 - per-line, continue
                log(f"[fail] {line!r} -> {e}")
            st["processed_lines"].append(line)
    else:
        log(f"[warn] paste file missing: {PASTE_FILE}")

    # 2) Nuditok feed -> new handles appended to keep list.
    try:
        headers = {"User-Agent": random.choice(UA_POOL)}
        text = session.get(NUDI_FEED, headers=headers, timeout=20).text
        time.sleep(delay)
        known = set(st["known_handles"])
        if KEEP_FILE.exists():
            for line in KEEP_FILE.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    known.add(line.split()[0].lower())
        new = 0
        with open(KEEP_FILE, "a", encoding="utf-8") as f:
            for purl in handles_from_feed_xml(text, "https://nuditok.com/",
                                              cap=60):
                m = re.search(r"/@([A-Za-z0-9_\.]{2,30})/?$", purl)
                name = m.group(1) if m else ""
                if name and username_ok(name) and name.lower() not in known:
                    f.write(f"{name} {purl} nuditok.com\n")
                    known.add(name.lower())
                    new += 1
        st["known_handles"] = sorted(known)
        log(f"[scrape] nuditok feed: +{new} new handles "
            f"({len(known)} kept)")
    except Exception as e:  # noqa: BLE001 - feed miss, next cycle retries
        log(f"[warn] feed -> {type(e).__name__}: {e}")
    save_state(st)
    return st


def main() -> int:
    ap = argparse.ArgumentParser(description="Continuous creator watcher")
    ap.add_argument("--interval", type=int, default=120,
                    help="seconds between cycles (default 120)")
    ap.add_argument("--once", action="store_true",
                    help="single cycle + exit")
    ap.add_argument("--delay", type=float, default=2.0)
    args = ap.parse_args()

    st = load_state()
    session = requests.Session()
    log(f"watching {PASTE_FILE} every {args.interval}s "
        f"(created so far: {len(st['created'])})")
    st = cycle(st, session, max(2.0, args.delay))
    while not args.once:
        time.sleep(max(30, args.interval))
        st = cycle(st, session, max(2.0, args.delay))
    return 0


if __name__ == "__main__":
    sys.exit(main())
