#!/usr/bin/env python3
"""Übernimmt die App und die Berichtsvorlage aus dem App-Repository (status1).

Aufruf:  python3 tools/sync_app.py ../status1
Kopiert die PWA nach status1_server/rootfs/srv/status1/app und erzeugt
portal/report.js und portal/report.css aus derselben Vorlage wie in der App.
"""
import re, shutil, sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "../status1").resolve()
root = Path(__file__).resolve().parent.parent / "status1_server" / "rootfs" / "srv" / "status1"
app_dst, portal = root / "app", root / "portal"

html = (src / "index.html").read_text(encoding="utf-8")

# --- PWA kopieren
if app_dst.exists():
    shutil.rmtree(app_dst)
app_dst.mkdir(parents=True)
for name in ["index.html", "sw.js", "manifest.webmanifest"]:
    shutil.copy2(src / name, app_dst / name)
for d in ["icons", "fonts", "lib"]:
    shutil.copytree(src / d, app_dst / d)

# --- Berichtsvorlage herauslösen
def between(text, start, end):
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]

css = between(html, "/* Bericht (A4)", "</style>")
consts = between(html, "const TAGS=[", "const MIN_NEG=3;") + "const MIN_NEG=3;\n"
esc = re.search(r"function esc\(s\)\{.*?\n", html).group(0)
fns = between(html, "function TODAY(){", "let reportDone=null;")
fns = "\n".join(l for l in fns.split("\n") if not l.startswith('window.addEventListener("resize"'))
js = ("/* Automatisch erzeugt aus der App (tools/sync_app.py). Nicht von Hand ändern. */\n"
      "var db=window.db||{settings:{station:\"\"}};\n" + consts + esc + fns)
(portal / "report.js").write_text(js, encoding="utf-8")
(portal / "report.css").write_text(":root{--display:\"Barlow Condensed\",\"Arial Narrow\",Arial,sans-serif;--body:\"Barlow\",system-ui,sans-serif}\n" + css, encoding="utf-8")
print("App und Berichtsvorlage übernommen aus", src)
