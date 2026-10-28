#!/usr/bin/env python3
"""Status 1 Debrief – zentrale Auswertung (Testserver).

Nur Python-Standardbibliothek. Speichert ausschließlich Monatssummen je Wache,
keine einzelnen Debriefs, keine Fahrzeuge, keine Geräte, keine IP-Adressen.
"""
import base64, hashlib, hmac, json, os, re, secrets, sqlite3, struct, threading, time
from datetime import date, datetime, timedelta
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

BASE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("S1_DATA", "/data" if Path("/data").is_dir() else str(BASE / "data")))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "status1.sqlite"
PORT = int(os.environ.get("S1_PORT", "8099"))


def load_options():
    opts = {"min_debriefs": 10, "keep_months": 24}
    f = DATA / "options.json"
    if f.exists():
        try:
            opts.update({k: v for k, v in json.loads(f.read_text()).items() if k in opts})
        except Exception:
            pass
    opts["min_debriefs"] = max(1, min(100, int(opts["min_debriefs"])))
    opts["keep_months"] = max(3, min(120, int(opts["keep_months"])))
    return opts


OPTS = load_options()

TAGS = {"kom", "fue", "spk", "anf", "lag", "mat", "med", "zei", "dok", "lst", "nef", "fwp", "kla", "zna", "rmt", "mue", "str", "eig"}
CATS = {"Internistisch", "Trauma", "Reanimation", "Kind", "Transport", "Sonstiges"}
CODE_ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
KEY_RE = re.compile(r"^(pos|neg)\|([a-z]{3})\|(.{1,120})$")

LOCK = threading.Lock()
con = sqlite3.connect(DB_PATH, check_same_thread=False)
con.execute("PRAGMA journal_mode=WAL")
con.executescript("""
CREATE TABLE IF NOT EXISTS wache(id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS benutzer(id INTEGER PRIMARY KEY, wache_id INTEGER NOT NULL, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL, totp TEXT, totp_pending TEXT);
CREATE TABLE IF NOT EXISTS summen(wache_id INTEGER, monat TEXT, schluessel TEXT, anzahl INTEGER NOT NULL, PRIMARY KEY(wache_id, monat, schluessel));
CREATE TABLE IF NOT EXISTS lehren(id INTEGER PRIMARY KEY, wache_id INTEGER, monat TEXT, text TEXT, sortierung REAL);
CREATE TABLE IF NOT EXISTS sitzung(token TEXT PRIMARY KEY, benutzer_id INTEGER, ablauf INTEGER);
""")
con.commit()


def q(sql, args=(), one=False):
    with LOCK:
        cur = con.execute(sql, args)
        rows = cur.fetchall()
        con.commit()
    return (rows[0] if rows else None) if one else rows


# ---------- Hilfsfunktionen ----------
def new_code():
    raw = "".join(secrets.choice(CODE_ALPHA) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def norm_code(c):
    c = re.sub(r"[^0-9A-Za-z]", "", str(c or "")).upper()
    return f"{c[:4]}-{c[4:8]}-{c[8:12]}" if len(c) == 12 else ""


def hash_pw(pw):
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_pw(pw, stored):
    try:
        s, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(s), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:
        return False


def totp_now(secret_b32, t=None, step=30):
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8))
    ctr = int((t or time.time()) // step)
    out = []
    for c in (ctr - 1, ctr, ctr + 1):
        mac = hmac.new(key, struct.pack(">Q", c), hashlib.sha1).digest()
        o = mac[-1] & 15
        out.append(str((struct.unpack(">I", mac[o:o + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6))
    return out


def month_iter(a, b):
    y, m = map(int, a.split("-"))
    y2, m2 = map(int, b.split("-"))
    while (y, m) <= (y2, m2):
        yield f"{y:04d}-{m:02d}"
        m += 1
        if m > 12:
            y, m = y + 1, 1


def month_shift(mo, k):
    y, m = map(int, mo.split("-"))
    i = y * 12 + (m - 1) + k
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def this_month():
    return date.today().strftime("%Y-%m")


def month_end(mo):
    y, m = map(int, mo.split("-"))
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    last = nxt - timedelta(days=1)
    return min(last, date.today()).isoformat()


# Ratenbegrenzung nur im Arbeitsspeicher (keine IP-Speicherung)
RATE = {}


def rate_ok(key, limit, window):
    now = time.time()
    with LOCK:
        lst = [t for t in RATE.get(key, []) if now - t < window]
        if len(lst) >= limit:
            RATE[key] = lst
            return False
        lst.append(now)
        RATE[key] = lst
        return True


def prune_old():
    cutoff = month_shift(this_month(), -OPTS["keep_months"])
    q("DELETE FROM summen WHERE monat < ?", (cutoff,))
    q("DELETE FROM lehren WHERE monat < ?", (month_shift(this_month(), -12),))
    q("DELETE FROM sitzung WHERE ablauf < ?", (int(time.time()),))


# ---------- Daten ----------
def add_packet(wid, p):
    mo = p.get("month")
    if not isinstance(mo, str) or not MONTH_RE.match(mo):
        raise ValueError("Monat ungültig")
    cur = this_month()
    if mo > cur or mo < month_shift(cur, -2):
        raise ValueError("Monat außerhalb des erlaubten Zeitraums")
    n = p.get("n")
    if not isinstance(n, int) or not (1 <= n <= 50):
        raise ValueError("Anzahl ungültig")
    inc = {"#debriefs": n}

    def num(v, hi=50):
        if not isinstance(v, int) or v < 0 or v > hi:
            raise ValueError("Zahl ungültig")
        return v
    for tag, c in (p.get("counts") or {}).items():
        if tag not in TAGS or not isinstance(c, dict):
            raise ValueError("Schlagwort ungültig")
        for mode in ("pos", "neg"):
            v = num(c.get(mode, 0))
            if v:
                inc[f"{mode}|{tag}"] = inc.get(f"{mode}|{tag}", 0) + v
    for field, prefix in (("place", "place"), ("asp", "asp")):
        d = p.get(field) or {}
        if not isinstance(d, dict) or len(d) > 200:
            raise ValueError("Details ungültig")
        for k, v in d.items():
            m = KEY_RE.match(str(k))
            if not m or m.group(2) not in TAGS:
                raise ValueError("Detail ungültig")
            v = num(v)
            if v:
                kk = f"{prefix}|{k}"
                inc[kk] = inc.get(kk, 0) + v
    for c, v in (p.get("cats") or {}).items():
        if c not in CATS:
            raise ValueError("Einsatzart ungültig")
        v = num(v)
        if v:
            inc[f"cat|{c}"] = inc.get(f"cat|{c}", 0) + v
    lessons = p.get("lessons") or []
    if not isinstance(lessons, list) or len(lessons) > 20:
        raise ValueError("Lehren ungültig")
    lessons = [str(t).strip()[:140] for t in lessons if str(t).strip()]
    with LOCK:
        for k, v in inc.items():
            con.execute("INSERT INTO summen(wache_id,monat,schluessel,anzahl) VALUES(?,?,?,?) "
                        "ON CONFLICT(wache_id,monat,schluessel) DO UPDATE SET anzahl=anzahl+excluded.anzahl",
                        (wid, mo, k, v))
        for t in lessons:
            con.execute("INSERT INTO lehren(wache_id,monat,text,sortierung) VALUES(?,?,?,?)",
                        (wid, mo, t, secrets.randbelow(10**9) / 1e9))
        con.commit()


def dataset(wid, a, b):
    rows = q("SELECT schluessel, SUM(anzahl) FROM summen WHERE wache_id=? AND monat BETWEEN ? AND ? GROUP BY schluessel", (wid, a, b))
    d = {"n": 0, "counts": {}, "place": {}, "asp": {}, "cats": {}, "lessons": [], "veh": 1,
         "from": f"{a}-01", "to": month_end(b)}
    for k, v in rows:
        if k == "#debriefs":
            d["n"] = v
            continue
        kind, rest = k.split("|", 1)
        if kind in ("pos", "neg"):
            d["counts"].setdefault(rest, {"pos": 0, "neg": 0})[kind] = v
        elif kind in ("place", "asp"):
            d[kind][rest] = v
        elif kind == "cat":
            d["cats"][rest] = v
    d["lessons"] = [r[0] for r in q("SELECT text FROM lehren WHERE wache_id=? AND monat BETWEEN ? AND ? ORDER BY sortierung LIMIT 200", (wid, a, b))]
    return d


def totals(d):
    return {k: [v.get("pos", 0), v.get("neg", 0)] for k, v in d["counts"].items()}


# ---------- HTTP ----------
STATIC = {
    "/portal/": BASE / "portal" / "index.html",
}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
        ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8"}


class H(BaseHTTPRequestHandler):
    server_version = "Status1"
    sys_version = ""

    def log_message(self, *a):  # bewusst keine Zugriffsprotokolle (keine IP-Adressen)
        pass

    # --- Antworten
    def send(self, code, body=b"", ctype="application/json", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        if self.path.startswith("/portal") or self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        if self.path.startswith("/portal"):
            self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def err(self, code, msg):
        self.send(code, {"error": msg})

    def body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64 * 1024:
            raise ValueError("zu groß")
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            raise ValueError("JSON ungültig")

    # --- Sitzung
    def user(self):
        c = cookies.SimpleCookie(self.headers.get("Cookie") or "")
        tok = c.get("s1") and c["s1"].value
        if not tok:
            return None
        r = q("SELECT b.id,b.email,b.wache_id,b.totp,w.name,w.code FROM sitzung s JOIN benutzer b ON b.id=s.benutzer_id JOIN wache w ON w.id=b.wache_id WHERE s.token=? AND s.ablauf>?",
              (hashlib.sha256(tok.encode()).hexdigest(), int(time.time())), one=True)
        if not r:
            return None
        return {"id": r[0], "email": r[1], "wid": r[2], "totp": bool(r[3]), "wache": r[4], "code": r[5]}

    def login_cookie(self, uid):
        tok = secrets.token_urlsafe(32)
        q("INSERT INTO sitzung(token,benutzer_id,ablauf) VALUES(?,?,?)", (hashlib.sha256(tok.encode()).hexdigest(), uid, int(time.time()) + 8 * 3600))
        return {"Set-Cookie": f"s1={tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800"}

    # --- Routing
    def do_OPTIONS(self):
        if self.path == "/api/submit":
            self.send(204, b"", extra={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST",
                                       "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400"})
        else:
            self.send(405, b"")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p in ("/", "/portal"):
            return self.send(302, b"", extra={"Location": "/portal/"})
        if p == "/app":
            return self.send(302, b"", extra={"Location": "/app/"})
        if p.startswith("/api/"):
            return self.api_get(p, parse_qs(u.query))
        root, rel = None, None
        if p.startswith("/portal/"):
            root, rel = BASE / "portal", p[len("/portal/"):] or "index.html"
        elif p.startswith("/app/"):
            root, rel = BASE / "app", p[len("/app/"):] or "index.html"
        if root is None:
            return self.err(404, "Nicht gefunden")
        f = (root / rel).resolve()
        if not str(f).startswith(str(root.resolve())) or not f.is_file():
            return self.err(404, "Nicht gefunden")
        self.send(200, f.read_bytes(), MIME.get(f.suffix, "application/octet-stream"))

    def do_POST(self):
        p = urlparse(self.path).path
        try:
            data = self.body_json()
        except ValueError as e:
            return self.err(400, str(e))
        if p == "/api/submit":
            return self.api_submit(data)
        # Schutz gegen Fremdseiten: eigener Header nötig (zusätzlich zu SameSite=Strict)
        if self.headers.get("X-S1") != "1":
            return self.err(403, "Nicht erlaubt")
        return self.api_post(p, data)

    # --- Annahme
    def api_submit(self, data):
        cors = {"Access-Control-Allow-Origin": "*"}
        code = norm_code(data.get("code"))
        if not code or not rate_ok("c:" + code, 60, 3600):
            return self.send(403, {"error": "Code ungültig oder zu viele Übertragungen"}, extra=cors)
        w = q("SELECT id FROM wache WHERE code=?", (code,), one=True)
        if not w:
            return self.send(403, {"error": "Code ungültig"}, extra=cors)
        packets = data.get("packets")
        if not isinstance(packets, list) or not (1 <= len(packets) <= 3):
            return self.send(400, {"error": "Pakete ungültig"}, extra=cors)
        try:
            for pk in packets:
                add_packet(w[0], pk)
        except ValueError as e:
            return self.send(400, {"error": str(e)}, extra=cors)
        return self.send(200, {"ok": True}, extra=cors)

    # --- Portal
    def api_get(self, p, qs):
        if p == "/api/status":
            has = q("SELECT COUNT(*) FROM benutzer", one=True)[0] > 0
            return self.send(200, {"setup": has, "min": OPTS["min_debriefs"]})
        me = self.user()
        if not me:
            return self.err(401, "Bitte anmelden")
        if p == "/api/me":
            return self.send(200, {"email": me["email"], "wache": me["wache"], "code": me["code"], "totp": me["totp"], "min": OPTS["min_debriefs"]})
        if p == "/api/months":
            rows = q("SELECT monat, anzahl FROM summen WHERE wache_id=? AND schluessel='#debriefs' ORDER BY monat", (me["wid"],))
            return self.send(200, {"months": [{"m": r[0], "n": r[1]} for r in rows], "now": this_month()})
        if p == "/api/data":
            a = (qs.get("from") or [this_month()])[0]
            b = (qs.get("to") or [a])[0]
            if not MONTH_RE.match(a) or not MONTH_RE.match(b) or a > b:
                return self.err(400, "Zeitraum ungültig")
            d = dataset(me["wid"], a, b)
            span = len(list(month_iter(a, b)))
            pa, pb = month_shift(a, -span), month_shift(a, -1)
            pd = dataset(me["wid"], pa, pb)
            prev = {"from": pd["from"], "to": pd["to"], "n": pd["n"], "t": totals(pd)} if pd["n"] >= OPTS["min_debriefs"] else None
            if d["n"] < OPTS["min_debriefs"]:
                return self.send(200, {"below": True, "n": d["n"], "min": OPTS["min_debriefs"], "from": d["from"], "to": d["to"]})
            return self.send(200, {"below": False, "data": d, "prev": prev})
        if p == "/api/trend":
            rows = q("SELECT monat, schluessel, anzahl FROM summen WHERE wache_id=? AND (schluessel='#debriefs' OR schluessel LIKE 'pos|%' OR schluessel LIKE 'neg|%') ORDER BY monat", (me["wid"],))
            out = {}
            for mo, k, v in rows:
                out.setdefault(mo, {})[k] = v
            return self.send(200, {"months": [{"m": m, "v": out[m]} for m in sorted(out)], "min": OPTS["min_debriefs"]})
        return self.err(404, "Nicht gefunden")

    def api_post(self, p, d):
        if p == "/api/setup":
            if q("SELECT COUNT(*) FROM benutzer", one=True)[0] > 0:
                return self.err(409, "Bereits eingerichtet")
            name = str(d.get("wache") or "").strip()[:60]
            email = str(d.get("email") or "").strip().lower()[:120]
            pw = str(d.get("password") or "")
            if not name or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                return self.err(400, "Bitte Name der Wache und eine gültige E-Mail-Adresse angeben.")
            if len(pw) < 10:
                return self.err(400, "Das Passwort muss mindestens 10 Zeichen haben.")
            with LOCK:
                cur = con.execute("INSERT INTO wache(name,code,created) VALUES(?,?,?)", (name, new_code(), date.today().isoformat()))
                wid = cur.lastrowid
                cur = con.execute("INSERT INTO benutzer(wache_id,email,pw) VALUES(?,?,?)", (wid, email, hash_pw(pw)))
                uid = cur.lastrowid
                con.commit()
            return self.send(200, {"ok": True}, extra=self.login_cookie(uid))
        if p == "/api/login":
            email = str(d.get("email") or "").strip().lower()
            if not rate_ok("l:" + email, 10, 900):
                return self.err(429, "Zu viele Versuche. Bitte 15 Minuten warten.")
            r = q("SELECT id,pw,totp FROM benutzer WHERE email=?", (email,), one=True)
            if not r or not check_pw(str(d.get("password") or ""), r[1]):
                return self.err(401, "E-Mail oder Passwort falsch.")
            if r[2]:
                code = re.sub(r"\D", "", str(d.get("totp") or ""))
                if not code:
                    return self.send(200, {"needTotp": True})
                if code not in totp_now(r[2]):
                    return self.err(401, "Der Bestätigungscode stimmt nicht.")
            return self.send(200, {"ok": True}, extra=self.login_cookie(r[0]))
        me = self.user()
        if not me:
            return self.err(401, "Bitte anmelden")
        if p == "/api/logout":
            c = cookies.SimpleCookie(self.headers.get("Cookie") or "")
            if c.get("s1"):
                q("DELETE FROM sitzung WHERE token=?", (hashlib.sha256(c["s1"].value.encode()).hexdigest(),))
            return self.send(200, {"ok": True}, extra={"Set-Cookie": "s1=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
        if p == "/api/rotate":
            code = new_code()
            q("UPDATE wache SET code=? WHERE id=?", (code, me["wid"]))
            return self.send(200, {"code": code})
        if p == "/api/rename":
            name = str(d.get("wache") or "").strip()[:60]
            if not name:
                return self.err(400, "Bitte einen Namen angeben.")
            q("UPDATE wache SET name=? WHERE id=?", (name, me["wid"]))
            return self.send(200, {"ok": True})
        if p == "/api/password":
            r = q("SELECT pw FROM benutzer WHERE id=?", (me["id"],), one=True)
            if not check_pw(str(d.get("old") or ""), r[0]):
                return self.err(401, "Das bisherige Passwort stimmt nicht.")
            new = str(d.get("new") or "")
            if len(new) < 10:
                return self.err(400, "Das neue Passwort muss mindestens 10 Zeichen haben.")
            q("UPDATE benutzer SET pw=? WHERE id=?", (hash_pw(new), me["id"]))
            return self.send(200, {"ok": True})
        if p == "/api/totp/start":
            sec = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
            q("UPDATE benutzer SET totp_pending=? WHERE id=?", (sec, me["id"]))
            uri = f"otpauth://totp/Status%201:{me['email']}?secret={sec}&issuer=Status%201"
            return self.send(200, {"secret": sec, "uri": uri})
        if p == "/api/totp/confirm":
            r = q("SELECT totp_pending FROM benutzer WHERE id=?", (me["id"],), one=True)
            code = re.sub(r"\D", "", str(d.get("code") or ""))
            if not r or not r[0] or code not in totp_now(r[0]):
                return self.err(400, "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.")
            q("UPDATE benutzer SET totp=totp_pending, totp_pending=NULL WHERE id=?", (me["id"],))
            return self.send(200, {"ok": True})
        if p == "/api/totp/disable":
            r = q("SELECT pw FROM benutzer WHERE id=?", (me["id"],), one=True)
            if not check_pw(str(d.get("password") or ""), r[0]):
                return self.err(401, "Das Passwort stimmt nicht.")
            q("UPDATE benutzer SET totp=NULL WHERE id=?", (me["id"],))
            return self.send(200, {"ok": True})
        if p == "/api/reset-data":
            r = q("SELECT pw FROM benutzer WHERE id=?", (me["id"],), one=True)
            if not check_pw(str(d.get("password") or ""), r[0]):
                return self.err(401, "Das Passwort stimmt nicht.")
            q("DELETE FROM summen WHERE wache_id=?", (me["wid"],))
            q("DELETE FROM lehren WHERE wache_id=?", (me["wid"],))
            return self.send(200, {"ok": True})
        return self.err(404, "Nicht gefunden")


def main():
    prune_old()

    def janitor():
        while True:
            time.sleep(3600)
            try:
                prune_old()
            except Exception:
                pass
    threading.Thread(target=janitor, daemon=True).start()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    print(f"Status 1 Server läuft auf Port {PORT}. Daten: {DATA}. Mindestzahl Debriefs: {OPTS['min_debriefs']}.", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
