"""Make an Archify HTML open in light theme by default instead of following the OS.

Usage: python3 docs/archify/default-light.py <diagram.html>

A ?theme= URL parameter and the reader's saved toggle still win.
"""
import re
import sys

path = sys.argv[1]
html = open(path, encoding="utf-8").read()
html, count = re.subn(r'(<html lang="[^"]*" data-theme=)"dark"', r'\1"light"', html, count=1)
if not count and not re.search(r'<html lang="[^"]*" data-theme="light"', html):
    sys.exit("pattern not found, viewer changed: <html data-theme>")
patches = [
    (
        "return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';",
        "return 'light';",
    ),
    (
        "if (urlOverride() || saved === 'light' || saved === 'dark') return;",
        "return;",
    ),
]
for old, new in patches:
    if old not in html and new not in html:
        sys.exit(f"pattern not found, viewer changed: {old[:60]}")
    html = html.replace(old, new, 1)
open(path, "w", encoding="utf-8").write(html)
print(path)
