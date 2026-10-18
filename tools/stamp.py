#!/usr/bin/env python3
"""Refresh app/sw.js after changing app files: lists every file in ASSETS and sets
VERSION to a hash of their contents, so installed copies pick up the update.

Usage: python3 tools/stamp.py
"""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
SKIP = {"sw.js", ".DS_Store"}

files = []
for dirpath, _, names in os.walk(APP):
    for n in names:
        if n in SKIP or n.startswith("."):
            continue
        files.append(os.path.relpath(os.path.join(dirpath, n), APP).replace(os.sep, "/"))
files.sort(key=lambda f: (f != "index.html", f))

h = hashlib.sha256()
for f in files:
    h.update(f.encode())
    with open(os.path.join(APP, f), "rb") as fh:
        h.update(fh.read())
version = h.hexdigest()[:10]

sw_path = os.path.join(APP, "sw.js")
with open(sw_path, encoding="utf-8") as fh:
    sw = fh.read()
assets = "const ASSETS = [\n  './',\n" + "".join(f"  '{f}',\n" for f in files) + "];"
sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", sw)
sw = re.sub(r"const ASSETS = \[.*?\];", lambda _: assets, sw, flags=re.S)
with open(sw_path, "w", encoding="utf-8") as fh:
    fh.write(sw)
print(f"sw.js: VERSION {version}, {len(files)} files")
