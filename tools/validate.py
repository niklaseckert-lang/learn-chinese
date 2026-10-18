#!/usr/bin/env python3
"""Validate the app's content files (see DATA_FORMAT.md).

Usage:
    python3 tools/validate.py                 # every file in app/js/data/
    python3 tools/validate.py path/to/x.js    # just these files
    python3 tools/validate.py --readings      # also list characters read in several ways

Exit code 1 if any error was found.
"""
import glob
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "app", "js", "data")

SECTIONS = {"nouns", "verbs", "adjectives", "proverbs", "sentences", "counting", "tones"}
REQUIRED = {
    "nouns": ["h", "p", "e", "img", "m", "x"],
    "verbs": ["h", "p", "e", "img", "m", "x"],
    "adjectives": ["h", "p", "e", "img", "m", "x"],
    "proverbs": ["h", "p", "e", "lit", "m"],
    "sentences": ["h", "p", "e"],
    "counting": ["h", "p", "e", "m"],
    "tones": ["h", "p", "e"],
}

MARKS = {
    "ā": ("a", 1), "á": ("a", 2), "ǎ": ("a", 3), "à": ("a", 4),
    "ē": ("e", 1), "é": ("e", 2), "ě": ("e", 3), "è": ("e", 4),
    "ī": ("i", 1), "í": ("i", 2), "ǐ": ("i", 3), "ì": ("i", 4),
    "ō": ("o", 1), "ó": ("o", 2), "ǒ": ("o", 3), "ò": ("o", 4),
    "ū": ("u", 1), "ú": ("u", 2), "ǔ": ("u", 3), "ù": ("u", 4),
    "ǖ": ("ü", 1), "ǘ": ("ü", 2), "ǚ": ("ü", 3), "ǜ": ("ü", 4),
}
SYLLABLE = re.compile(r"^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?([aeiouü]{1,3})(ng|n|r)?$")
CJK = re.compile(r"[㐀-鿿〇]")
PUNCT_P = re.compile(r"[,.?!;:\"'…—–\-()，。？！；：、“”‘’]")
PUNCT_H = re.compile(r"[，。？！；：、“”‘’…—\s]")
SANDHI_CHARS = {"一", "不"}

errors = []
warnings = []
readings = defaultdict(lambda: defaultdict(list))  # char -> reading -> [where]


def err(where, msg):
    errors.append(f"ERROR {where}: {msg}")


def warn(where, msg):
    warnings.append(f"warn  {where}: {msg}")


def syllables(p):
    return PUNCT_P.sub(" ", unicodedata.normalize("NFC", p)).lower().split()


def parse_syllable(s):
    """Return (toneless, tone) or None if it is not a plausible pinyin syllable."""
    base, tone, marks = "", 5, 0
    for ch in s:
        if ch in MARKS:
            b, tone = MARKS[ch]
            base += b
            marks += 1
        else:
            base += ch
    if marks > 1 or not SYLLABLE.match(base):
        return None
    return base, tone


def check_pair(where, h, p, record=True):
    """hanzi/pinyin alignment: one syllable per character."""
    if re.search(r"[0-9A-Za-z]", h):
        err(where, f"hanzi contains digits/latin letters: {h!r}")
    if "儿" in h and h.endswith("儿"):
        warn(where, f"possible erhua in {h!r}")
    if "v" in p.lower():
        err(where, f"use ü, not v: {p!r}")
    chars = CJK.findall(h)
    leftover = PUNCT_H.sub("", CJK.sub("", h))
    if leftover:
        err(where, f"unexpected characters in hanzi: {leftover!r}")
    syls = syllables(p)
    if len(chars) != len(syls):
        err(where, f"{len(chars)} hanzi but {len(syls)} pinyin syllables: {h!r} / {p!r}")
        return
    for c, s in zip(chars, syls):
        parsed = parse_syllable(s)
        if parsed is None:
            err(where, f"bad pinyin syllable {s!r} (for {c}) in {p!r}")
        elif record:
            readings[c][f"{parsed[0]}{parsed[1]}"].append(where)


def check_file(path):
    name = os.path.relpath(path, ROOT)
    with open(path, encoding="utf-8") as f:
        text = f.read()
    lines = text.strip().splitlines()
    if not lines or lines[0].strip() != "ZH.add({" or lines[-1].strip() != "});":
        err(name, "first line must be 'ZH.add({' and last line '});'")
        return
    body = text.strip()[len("ZH.add("):-len(");")]
    try:
        sec = json.loads(body)
    except json.JSONDecodeError as e:
        err(name, f"not strict JSON: {e}")
        return

    sid = sec.get("id")
    if sid not in SECTIONS:
        err(name, f"unknown section id {sid!r}")
        return
    for k in ["title", "zh", "py", "icon", "desc", "chapters"]:
        if not sec.get(k):
            err(name, f"section missing {k!r}")
    if sec.get("zh") and sec.get("py"):
        check_pair(f"{sid}", sec["zh"], sec["py"], record=False)

    seen_ch, seen_items, total = set(), {}, 0
    for ci, ch in enumerate(sec.get("chapters", [])):
        cid = ch.get("id", f"#{ci}")
        cw = f"{sid}/{cid}"
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", str(cid)):
            err(cw, "chapter id must be kebab-case")
        if cid in seen_ch:
            err(cw, "duplicate chapter id")
        seen_ch.add(cid)
        for k in ["title", "zh", "items"]:
            if not ch.get(k):
                err(cw, f"chapter missing {k!r}")
        n = len(ch.get("items", []))
        lo = 6 if sid == "proverbs" else 8
        if n and not (lo <= n <= 12):
            warn(cw, f"{n} items (expected {lo}-10)")
        for ii, it in enumerate(ch.get("items", [])):
            total += 1
            iw = f"{cw}[{ii}] {it.get('h', '?')}"
            for k in REQUIRED[sid]:
                if not it.get(k):
                    err(iw, f"missing {k!r}")
            h, p = it.get("h", ""), it.get("p", "")
            if not h or not p:
                continue
            if sid != "sentences" and " " in h:
                err(iw, "hanzi must not contain spaces outside the sentences section")
            if sid == "sentences" and "  " in h:
                err(iw, "double space in hanzi")
            check_pair(iw, h, p)
            key = h.replace(" ", "")
            if key in seen_items:
                err(iw, f"duplicate item (also in {seen_items[key]})")
            seen_items[key] = cw
            if "x" in it:
                x = it["x"]
                if not (isinstance(x, list) and len(x) == 3 and all(isinstance(s, str) and s for s in x)):
                    err(iw, "x must be [hanzi, pinyin, english]")
                else:
                    if " " in x[0]:
                        err(iw, "example hanzi must not contain spaces")
                    if len(CJK.findall(x[0])) > 16:
                        warn(iw, "example sentence is long")
                    if key not in x[0]:
                        warn(iw, f"example does not contain the word {key}")
                    check_pair(iw + " (example)", x[0], x[1])
            if "mw" in it:
                mw = it["mw"]
                if not (isinstance(mw, list) and len(mw) == 2):
                    err(iw, "mw must be [hanzi, pinyin]")
                else:
                    check_pair(iw + " (mw)", mw[0], mw[1])
            if it.get("m") and len(it["m"]) > (340 if sid == "proverbs" else 240):
                warn(iw, f"memory hook is {len(it['m'])} chars")
            if it.get("img") and len(it["img"]) > 8:
                warn(iw, "img looks longer than 1-2 emoji")
    return sid, len(seen_ch), total


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    files = args or sorted(glob.glob(os.path.join(DATA_DIR, "*.js")))
    summary = []
    for path in files:
        res = check_file(path)
        if res:
            summary.append(res)

    if "--readings" in sys.argv:
        for c, rs in sorted(readings.items()):
            if c in SANDHI_CHARS:
                continue
            toned = {r for r in rs if not r.endswith("5")}
            bases = {r.rstrip("12345") for r in rs}
            if len(toned) > 1 or len(bases) > 1:
                detail = "; ".join(f"{r}: {', '.join(w[:2])}{'…' if len(w) > 2 else ''}" for r, w in rs.items())
                warn(f"reading {c}", detail)

    for w in warnings:
        print(w)
    for e in errors:
        print(e)
    for sid, nch, nit in summary:
        print(f"{sid}: {nch} chapters, {nit} items")
    if errors:
        print(f"\n{len(errors)} error(s)")
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
