"""
Add-creator helper (Beta) — creates ONE creator doc in Firestore from a
username + avatar image URL pasted by the owner into
`Admins/profile creators.txt`.

Writes via the Firestore REST API with the public web apiKey (rules for
`creators` are open: allow read, write). Same fields as the dashboard's
`saveCreatorDoc`: username / avatarUrl / is_active=true / created_at=now.
Never writes test/seed data — only the exact pair the owner pasted.

Usage:
    python tools/add_creator.py --dry-run "someuser https://.../pic.jpg"
    python tools/add_creator.py "someuser https://.../pic.jpg"
    python tools/add_creator.py --file "..\\Admins\\profile creators.txt"
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# cp1252 console breaks on non-ASCII — force utf-8 first.
sys.stdout.reconfigure(encoding="utf-8")

import requests  # noqa: E402

HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "firebase-applet-config.json" \
    if (HERE.parent / "firebase-applet-config.json").exists() \
    else HERE / "firebase-applet-config.json"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_\.\-]{2,30}$")


def parse_line(line: str) -> tuple[str, str]:
    parts = line.strip().split()
    if len(parts) < 2:
        raise ValueError(f"need 'username image-link', got: {line.strip()!r}")
    username, url = parts[0], parts[-1]
    if not USERNAME_RE.match(username):
        raise ValueError(f"bad username (2-30 chars, A-Z 0-9 _ . -): {username!r}")
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"bad image link (must be http(s)): {url!r}")
    return username, url


def create_creator(username: str, avatar_url: str, dry_run: bool = False) -> str:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    project = cfg["projectId"]
    key = cfg["apiKey"]
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "fields": {
            "username": {"stringValue": username},
            "avatarUrl": {"stringValue": avatar_url},
            "is_active": {"booleanValue": True},
            "created_at": {"timestampValue": now},
        }
    }
    if dry_run:
        print(f"[dry-run] POST creators {username} {avatar_url}", flush=True)
        return "(dry-run)"
    url = (f"https://firestore.googleapis.com/v1/projects/{project}"
           f"/databases/(default)/documents/creators?key={key}")
    r = requests.post(url, json=payload, timeout=20)
    r.raise_for_status()
    doc_id = r.json().get("name", "").split("/")[-1]
    print(f"[ok] creator @{username} -> creators/{doc_id}", flush=True)
    return doc_id


def main() -> int:
    ap = argparse.ArgumentParser(description="Create a creator from pasted pair")
    ap.add_argument("pair", nargs="?",
                    help="'username https://...image-link' (or use --file)")
    ap.add_argument("--file", type=str, default="",
                    help="read pairs from Admins/profile creators.txt "
                    "(skips # comments/blank lines)")
    ap.add_argument("--dry-run", action="store_true",
                    help="validate + print, write nothing")
    args = ap.parse_args()

    pairs: list[str] = []
    if args.file:
        for line in Path(args.file).read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.strip().startswith("#"):
                pairs.append(line)
    elif args.pair:
        pairs.append(args.pair)
    else:
        print("give a 'username image-link' pair or --file", flush=True)
        return 1

    failed = 0
    for line in pairs:
        try:
            username, avatar = parse_line(line)
            create_creator(username, avatar, dry_run=args.dry_run)
        except Exception as e:  # noqa: BLE001 - report per-line, continue
            print(f"[fail] {line.strip()!r} -> {e}", flush=True)
            failed += 1
    print(f"[done] {len(pairs) - failed}/{len(pairs)} created"
          + (" (dry-run)" if args.dry_run else ""), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
