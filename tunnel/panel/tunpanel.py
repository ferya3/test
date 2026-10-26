#!/usr/bin/env python3
"""Tunnel panel: a small web UI for the Xray users of the tunnel.

Runs on foreign server 1. The SQLite database is the source of truth: the
VLESS client list in the Xray config is rebuilt from it, and the config is
copied to every peer listed in /etc/tun-peers. A worker collects per-user
traffic from all servers once a minute and drops users who are expired, over
their data limit or disabled.

Standard library only, so it runs on a stock Ubuntu with python3.

    tunpanel.py init --port 2096 --password SECRET
    tunpanel.py passwd NEWPASSWORD
    tunpanel.py serve
"""

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import shlex
import sqlite3
import ssl
import subprocess
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote

XRAY_CFG = os.environ.get("TUNPANEL_XRAY_CONFIG", "/usr/local/etc/xray/config.json")
TUNNEL_ENV = os.environ.get("TUNPANEL_TUNNEL_ENV", "/root/tunnel.env")
PEERS_FILE = os.environ.get("TUNPANEL_PEERS", "/etc/tun-peers")
CONF_DIR = os.environ.get("TUNPANEL_CONF_DIR", "/etc/tunpanel")
DB_PATH = os.environ.get("TUNPANEL_DB", "/var/lib/tunpanel/panel.db")
CONF_FILE = os.path.join(CONF_DIR, "config.json")

API = "127.0.0.1:10085"
STATS_CMD = ["xray", "api", "statsquery", "--server=" + API, "-pattern", "user>>>", "-reset"]
COLLECT_EVERY = 60
SESSION_TTL = 12 * 3600
GB = 1024 ** 3
DAY = 86400
NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,32}$")
SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-o", "StrictHostKeyChecking=accept-new"]

# One lock for everything that touches the config, the database counters or
# the peers, so a click in the UI never interleaves with the worker.
lock = threading.RLock()
state = {"servers": [], "last_collect": 0, "peer_hash": {}, "last_error": ""}
sessions = {}
login_failures = []


def log(msg):
    print(msg, flush=True)


def run(cmd, timeout=30, input=None):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, input=input)


# --------------------------------------------------------------------------
# Settings and database

def load_conf():
    with open(CONF_FILE) as f:
        return json.load(f)


def save_conf(conf):
    os.makedirs(CONF_DIR, exist_ok=True)
    tmp = CONF_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(conf, f, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, CONF_FILE)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"pbkdf2${salt}${digest.hex()}"


def check_password(password, stored):
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt).split("$")[2], digest)


def tunnel_env():
    env = {}
    with open(TUNNEL_ENV) as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.strip().split("=", 1)
                env[key] = value.strip().strip("'\"")
    return env


@contextmanager
def tx():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with tx() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY,
                name        TEXT UNIQUE NOT NULL,
                uuid        TEXT NOT NULL,
                enabled     INTEGER NOT NULL DEFAULT 1,
                limit_bytes INTEGER NOT NULL DEFAULT 0,
                used_bytes  INTEGER NOT NULL DEFAULT 0,
                expires_at  INTEGER NOT NULL DEFAULT 0,
                created_at  INTEGER NOT NULL,
                last_seen   INTEGER NOT NULL DEFAULT 0,
                note        TEXT NOT NULL DEFAULT ''
            )""")
        columns = [row[1] for row in con.execute("PRAGMA table_info(users)")]
        if "blocked" not in columns:
            # Comma-separated SERVICES keys this user may not reach.
            con.execute("ALTER TABLE users ADD COLUMN blocked TEXT NOT NULL DEFAULT ''")
        if con.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return
        # First start: adopt the users already in the Xray config, unlimited.
        for client in vless_inbound(read_xray())["settings"].get("clients", []):
            name = client.get("email") or "user-" + client["id"][:8]
            if NAME_RE.match(name):
                con.execute("INSERT OR IGNORE INTO users(name, uuid, created_at) VALUES (?, ?, ?)",
                            (name, client["id"], int(time.time())))
                log(f"imported user {name}")


def all_users():
    with tx() as con:
        return con.execute("SELECT * FROM users ORDER BY name COLLATE NOCASE").fetchall()


def get_user(user_id):
    with tx() as con:
        return con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


# Services the admin can close per user: label, geosite domains, geoip ranges.
# Domains are matched on the sniffed TLS name, so they cover apps and sites;
# apps that connect to bare IPs are only caught where an IP list exists.
SERVICES = {
    "instagram": ("اینستاگرام", ["geosite:instagram"], []),
    "whatsapp": ("واتس‌اپ", ["geosite:whatsapp"], []),
    "telegram": ("تلگرام", ["geosite:telegram"], ["geoip:telegram"]),
    "youtube": ("یوتیوب", ["geosite:youtube"], []),
    "twitter": ("ایکس (توییتر)", ["geosite:twitter"], []),
    "tiktok": ("تیک‌تاک", ["geosite:tiktok"], []),
    "porn": ("سایت‌های پورن", ["geosite:category-porn"], []),
}


def blocked_of(user):
    return [key for key in user["blocked"].split(",") if key in SERVICES]


def status_of(user, now=None):
    now = now or time.time()
    if not user["enabled"]:
        return "disabled"
    if user["expires_at"] and user["expires_at"] <= now:
        return "expired"
    if user["limit_bytes"] and user["used_bytes"] >= user["limit_bytes"]:
        return "limited"
    return "active"


# --------------------------------------------------------------------------
# Xray config, local and on the peers

def read_xray():
    with open(XRAY_CFG) as f:
        return json.load(f)


def vless_inbound(cfg):
    for inbound in cfg.get("inbounds", []):
        if inbound.get("protocol") == "vless":
            return inbound
    raise RuntimeError("no vless inbound in " + XRAY_CFG)


def build_config(users):
    cfg = read_xray()
    cfg["stats"] = {}
    cfg["api"] = {"tag": "api", "listen": API, "services": ["StatsService"]}
    level = cfg.setdefault("policy", {}).setdefault("levels", {}).setdefault("0", {})
    level.update(statsUserUplink=True, statsUserDownlink=True)
    clients = [{"id": u["uuid"], "flow": "xtls-rprx-vision", "email": u["name"]}
               for u in users if status_of(u) == "active"]
    if not clients:
        # Never leave the inbound without a client; this one is derived from
        # the private key, so it is stable and nobody holds it.
        placeholder = uuid.uuid5(uuid.NAMESPACE_URL, "tunpanel:" + tunnel_env().get("PRIV", ""))
        clients = [{"id": str(placeholder), "flow": "xtls-rprx-vision", "email": "placeholder"}]
    vless_inbound(cfg)["settings"]["clients"] = clients

    # Per-user blocks go first, so they win over every other rule. Rules this
    # panel owns carry a "tunpanel-" ruleTag and are rebuilt on every call.
    # Conditions in one rule are ANDed, hence one rule for domains, one for IPs.
    routing = cfg.setdefault("routing", {})
    others = [r for r in routing.get("rules", []) if not str(r.get("ruleTag", "")).startswith("tunpanel-")]
    managed = []
    for key, (_, domains, ips) in SERVICES.items():
        names = [u["name"] for u in users if status_of(u) == "active" and key in blocked_of(u)]
        for field, values in (("domain", domains), ("ip", ips)):
            if names and values:
                managed.append({"type": "field", "ruleTag": f"tunpanel-{key}-{field}",
                                "user": names, field: values, "outboundTag": "block"})
    routing["rules"] = managed + others
    if not any(o.get("tag") == "block" for o in cfg.setdefault("outbounds", [])):
        cfg["outbounds"].append({"protocol": "blackhole", "tag": "block"})
    return json.dumps(cfg, indent=2) + "\n"


def temp_config_path():
    # Xray picks the parser from the extension, so the temp file keeps .json.
    return XRAY_CFG[:-len(".json")] + ".new.json"


def apply_config(reason):
    """Rebuild the config from the database; restart Xray only when it changed."""
    with lock:
        text = build_config(all_users())
        with open(XRAY_CFG) as f:
            current = f.read()
        if text != current:
            collect()  # restarting Xray zeroes its counters
            tmp = temp_config_path()
            with open(tmp, "w") as f:
                f.write(text)
            os.chmod(tmp, 0o644)
            test = run(["xray", "run", "-test", "-c", tmp])
            if test.returncode != 0:
                os.unlink(tmp)
                raise RuntimeError("Xray rejected the new config: " + (test.stdout + test.stderr)[-400:])
            os.replace(tmp, XRAY_CFG)
            run(["systemctl", "restart", "xray"])
            log(f"config applied ({reason})")
        sync_peers()


def peers():
    found = []
    try:
        with open(PEERS_FILE) as f:
            for line in f:
                parts = line.split()
                if parts and not parts[0].startswith("#"):
                    found.append((parts[0], parts[1] if len(parts) > 1 else "22"))
    except FileNotFoundError:
        pass
    return found


def ssh(ip, port, command, timeout=30, input=None):
    return run(["ssh", *SSH_OPTS, "-p", port, "root@" + ip, command], timeout=timeout, input=input)


def sync_peers():
    """Copy the local config to every peer whose copy differs from it."""
    with open(XRAY_CFG) as f:
        text = f.read()
    digest = hashlib.sha256(text.encode()).hexdigest()
    tmp = temp_config_path()
    for ip, port in peers():
        if state["peer_hash"].get(ip) == digest:
            continue
        command = (f"cat > {tmp} && xray run -test -c {tmp} >/dev/null"
                   f" && mv {tmp} {XRAY_CFG} && systemctl restart xray")
        try:
            ok = ssh(ip, port, command, timeout=40, input=text).returncode == 0
        except subprocess.TimeoutExpired:
            ok = False
        if ok:
            state["peer_hash"][ip] = digest
            log(f"synced config to {ip}")
        else:
            log(f"could not sync config to {ip}; retrying next round")


def parse_stats(text):
    totals = {}
    try:
        data = json.loads(text or "{}")
    except ValueError:
        return totals
    for stat in data.get("stat") or []:
        parts = stat.get("name", "").split(">>>")
        if len(parts) == 4 and parts[0] == "user":
            totals[parts[1]] = totals.get(parts[1], 0) + int(stat.get("value") or 0)
    return totals


def collect():
    """Add the traffic counted since the last round to each user."""
    with lock:
        totals, servers = {}, []

        def add(found):
            for name, used in found.items():
                totals[name] = totals.get(name, 0) + used

        alive = run(["systemctl", "is-active", "xray"]).stdout.strip() == "active"
        stats = run(STATS_CMD, timeout=15)
        add(parse_stats(stats.stdout) if stats.returncode == 0 else {})
        servers.append({"label": "خارج ۱ (همین سرور)", "reach": True, "xray": alive})

        remote = (f"systemctl is-active xray; sha256sum {XRAY_CFG} | cut -d' ' -f1; "
                  + " ".join(shlex.quote(a) for a in STATS_CMD))
        for n, (ip, port) in enumerate(peers(), start=2):
            label = f"خارج {n} ({ip})"
            try:
                out = ssh(ip, port, remote, timeout=20)
            except subprocess.TimeoutExpired:
                out = None
            if out is None or out.returncode == 255:
                servers.append({"label": label, "reach": False, "xray": False})
                continue
            lines = out.stdout.split("\n", 2) + ["", ""]
            state["peer_hash"][ip] = lines[1].strip()
            add(parse_stats(lines[2]))
            servers.append({"label": label, "reach": True, "xray": lines[0].strip() == "active"})

        now = int(time.time())
        with tx() as con:
            for name, used in totals.items():
                if used > 0:
                    con.execute("UPDATE users SET used_bytes = used_bytes + ?, last_seen = ? WHERE name = ?",
                                (used, now, name))
        state["servers"], state["last_collect"] = servers, now


def worker():
    while True:
        try:
            collect()
            apply_config("scheduled")
            state["last_error"] = ""
        except Exception as e:  # keep the loop alive whatever happens
            state["last_error"] = str(e)
            log(f"worker: {e}")
        time.sleep(COLLECT_EVERY)


# --------------------------------------------------------------------------
# Formatting

def jalali(ts):
    """Unix time to a Jalali date string (YYYY/MM/DD), Tehran time."""
    t = time.gmtime(ts + 3.5 * 3600)
    gy, gm, gd = t.tm_year, t.tm_mon, t.tm_mday
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100
            + (gy2 + 399) // 400 + gd + g_d_m[gm - 1])
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + days // 31, 1 + days % 31
    else:
        jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
    return f"{jy}/{jm:02d}/{jd:02d}"


def size(b):
    """HTML, isolated left-to-right so the unit stays after the number in RTL."""
    if b >= GB:
        return f'<span dir="ltr">{b / GB:.2f} GB</span>'
    return f'<span dir="ltr">{b / 1024 ** 2:.0f} MB</span>'


def ago(ts):
    if not ts:
        return "هرگز"
    s = int(time.time() - ts)
    if s < 120:
        return "همین الان"
    if s < 3600:
        return f"{s // 60} دقیقه پیش"
    if s < DAY:
        return f"{s // 3600} ساعت پیش"
    return f"{s // DAY} روز پیش"


def days_left(user):
    if not user["expires_at"]:
        return None
    return max(0, -(-(user["expires_at"] - int(time.time())) // DAY))


def user_link(user):
    env = tunnel_env()
    return (f"vless://{user['uuid']}@{env['IRAN_HOST']}:{env.get('IRAN_PORT', '443')}?encryption=none&flow=xtls-rprx-vision"
            f"&security=reality&sni={env['SNI']}&fp=chrome&pbk={env['PUB']}&sid={env['SID']}"
            f"&type=tcp#{quote(user['name'])}")


def qr_svg(text):
    out = run(["qrencode", "-t", "SVG", "-m", "1", "-o", "-", text])
    if out.returncode != 0:
        return ""
    svg = out.stdout
    return svg[svg.find("<svg"):]


STATUS_LABEL = {
    "active": ("فعال", "ok"),
    "disabled": ("غیرفعال", "off"),
    "expired": ("منقضی", "bad"),
    "limited": ("حجم تمام", "bad"),
}

CSS = """
:root{--bg:#f4f5f7;--card:#fff;--text:#1d2129;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;
--on-accent:#fff;--ok:#15803d;--ok-bg:#dcfce7;--bad:#b91c1c;--bad-bg:#fee2e2;--off:#4b5563;--off-bg:#e5e7eb;--bar:#e5e7eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--text:#e5e7eb;--muted:#9ca3af;
--line:#2a2f38;--accent:#60a5fa;--on-accent:#0b1220;--ok:#4ade80;--ok-bg:#14301f;--bad:#f87171;--bad-bg:#3a1717;--off:#d1d5db;
--off-bg:#2a2f38;--bar:#2a2f38}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 Vazirmatn,Tahoma,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 12px}
a{color:var(--accent);text-decoration:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat b{display:block;font-size:22px}.stat>span{color:var(--muted);font-size:13px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.user{display:block;color:inherit;padding:12px 0;border-top:1px solid var(--line)}
.user:first-of-type{border-top:0}
.user .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.user .meta{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:4px}
.badge{font-size:12px;padding:2px 10px;border-radius:999px;white-space:nowrap}
.ok{color:var(--ok);background:var(--ok-bg)}.bad{color:var(--bad);background:var(--bad-bg)}
.off{color:var(--off);background:var(--off-bg)}
.bar{height:6px;background:var(--bar);border-radius:3px;overflow:hidden;margin-top:8px}
.bar i{display:block;height:100%;background:var(--accent)}
form.inline{display:inline}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
input,textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);
color:var(--text);font:inherit}
textarea{direction:ltr;text-align:left;font:13px/1.5 monospace;resize:vertical}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px}
button,.btn{display:inline-block;padding:9px 16px;border:0;border-radius:8px;background:var(--accent);
color:var(--on-accent);font:inherit;cursor:pointer}
button.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
button.danger{background:var(--bad)}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.flash{padding:12px 16px;border-radius:8px;margin-bottom:16px}
.qr{background:#fff;padding:12px;border-radius:12px;width:min(280px,100%);margin:0 auto 12px}
.qr svg{display:block;width:100%;height:auto}
.muted{color:var(--muted);font-size:13px}
.login{max-width:340px;margin:12vh auto}
.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}
label.check{display:flex;align-items:center;gap:8px;margin:0;padding:10px;border:1px solid var(--line);
border-radius:8px;color:var(--text);font-size:15px;cursor:pointer}
label.check input{width:18px;height:18px;margin:0;accent-color:var(--bad)}
"""


def esc(value):
    return html.escape(str(value), quote=True)


def page(title, body, sess=None):
    top = ""
    if sess:
        top = (f'<header><h1><a href="/" style="color:inherit">پنل تانل</a></h1>'
               f'<form class="inline" method="post" action="/logout">{csrf_field(sess)}'
               f'<button class="ghost">خروج</button></form></header>')
        if sess.get("flash"):
            kind, text = sess.pop("flash")
            top += f'<div class="flash {kind}">{esc(text)}</div>'
    return (f'<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(title)}</title><style>{CSS}</style></head>'
            f'<body><main>{top}{body}</main></body></html>')


def csrf_field(sess):
    return f'<input type="hidden" name="csrf" value="{esc(sess["csrf"])}">'


def login_page(error=""):
    msg = f'<div class="flash bad">{esc(error)}</div>' if error else ""
    return page("ورود", f"""
<div class="login card"><h2>پنل تانل</h2>{msg}
<form method="post" action="/login">
<label>رمز عبور</label><input type="password" name="password" autofocus required>
<p><button style="width:100%">ورود</button></p></form></div>""")


def dashboard(sess):
    users = all_users()
    now = time.time()
    counts = {}
    for u in users:
        counts[status_of(u, now)] = counts.get(status_of(u, now), 0) + 1
    total = sum(u["used_bytes"] for u in users)

    servers = "".join(
        f'<div class="row"><span>{esc(s["label"])}</span>'
        + ('<span class="badge ok">فعال</span>' if s["xray"]
           else '<span class="badge bad">در دسترس نیست</span>' if not s["reach"]
           else '<span class="badge bad">Xray خاموش</span>')
        + "</div>"
        for s in state["servers"]) or '<p class="muted">در حال جمع‌آوری اطلاعات…</p>'
    error = (f'<p class="flash bad">{esc(state["last_error"])}</p>' if state["last_error"] else "")

    rows = []
    for u in users:
        label, kind = STATUS_LABEL[status_of(u, now)]
        limit = u["limit_bytes"]
        used = f'{size(u["used_bytes"])} از {size(limit)}' if limit else f'{size(u["used_bytes"])} (نامحدود)'
        left = days_left(u)
        expiry = "بدون انقضا" if left is None else f'تا {jalali(u["expires_at"])} ({left} روز)'
        bar = (f'<div class="bar"><i style="width:{min(100, u["used_bytes"] * 100 // limit)}%"></i></div>'
               if limit else "")
        blocked = "، ".join(SERVICES[k][0] for k in blocked_of(u))
        blocked = f"<span>بسته: {blocked}</span>" if blocked else ""
        rows.append(f"""
<a class="user" href="/u/{u['id']}"><div class="top"><b dir="ltr">{esc(u['name'])}</b>
<span class="badge {kind}">{label}</span></div>
<div class="meta"><span>{used}</span><span>{expiry}</span><span>آخرین استفاده: {ago(u['last_seen'])}</span>{blocked}</div>
{bar}</a>""")

    return page("پنل تانل", f"""
<div class="card grid">
<div class="stat"><b>{len(users)}</b><span>کل کاربرها</span></div>
<div class="stat"><b>{counts.get('active', 0)}</b><span>فعال</span></div>
<div class="stat"><b>{len(users) - counts.get('active', 0)}</b><span>غیرفعال / منقضی</span></div>
<div class="stat"><b>{size(total)}</b><span>مصرف کل</span></div>
</div>
<div class="card"><h2>سرورها</h2>{servers}
<p class="muted">آخرین بررسی: {ago(state['last_collect'])}</p>{error}</div>
<div class="card"><h2>کاربر جدید</h2>
<form method="post" action="/add">{csrf_field(sess)}<div class="fields">
<div><label>نام (انگلیسی، بدون فاصله)</label><input name="name" dir="ltr" required pattern="[A-Za-z0-9_.\\-]{{1,32}}"></div>
<div><label>حجم (گیگ، ۰ = نامحدود)</label><input name="gb" type="number" min="0" step="any" value="50"></div>
<div><label>مدت (روز، ۰ = نامحدود)</label><input name="days" type="number" min="0" value="30"></div>
</div><button>ساخت کاربر</button></form></div>
<div class="card"><h2>کاربرها</h2>{''.join(rows) or '<p class="muted">هنوز کاربری نیست.</p>'}</div>
""", sess)


def user_page(sess, u):
    label, kind = STATUS_LABEL[status_of(u)]
    link = user_link(u)
    left = days_left(u)
    limit_gb = f"{u['limit_bytes'] / GB:g}" if u["limit_bytes"] else "0"
    toggle = "غیرفعال کردن" if u["enabled"] else "فعال کردن"
    used = f'{size(u["used_bytes"])} از {size(u["limit_bytes"])}' if u["limit_bytes"] else f'{size(u["used_bytes"])} (نامحدود)'
    expiry = "بدون انقضا" if left is None else f'{jalali(u["expires_at"])} ({left} روز مانده)'
    form = lambda action, text, cls="ghost", confirm="": (
        f'<form class="inline" method="post" action="/u/{u["id"]}/{action}"'
        + (f' onsubmit="return confirm(\'{confirm}\')"' if confirm else "")
        + f'>{csrf_field(sess)}<button class="{cls}">{text}</button></form>')
    blocked = blocked_of(u)
    checks = "".join(
        f'<label class="check"><input type="checkbox" name="{key}"{" checked" if key in blocked else ""}>{name}</label>'
        for key, (name, _, _) in SERVICES.items())
    return page(u["name"], f"""
<div class="card"><div class="row"><h2 dir="ltr" style="margin:0">{esc(u['name'])}</h2>
<span class="badge {kind}">{label}</span></div>
<div class="row"><span>مصرف</span><span>{used}</span></div>
<div class="row"><span>انقضا</span><span>{expiry}</span></div>
<div class="row"><span>آخرین استفاده</span><span>{ago(u['last_seen'])}</span></div>
<div class="row"><span>ساخته شده</span><span>{jalali(u['created_at'])}</span></div></div>
<div class="card"><h2>لینک اتصال</h2><div class="qr">{qr_svg(link)}</div>
<textarea id="link" rows="4" readonly>{esc(link)}</textarea>
<p class="actions"><button type="button" onclick="copyLink()">کپی لینک</button></p></div>
<div class="card"><h2>ویرایش</h2>
<form method="post" action="/u/{u['id']}/edit">{csrf_field(sess)}<div class="fields">
<div><label>حجم (گیگ، ۰ = نامحدود)</label><input name="gb" type="number" min="0" step="any" value="{limit_gb}"></div>
<div><label>روزهای باقی‌مانده از امروز (۰ = نامحدود)</label><input name="days" type="number" min="0" value="{left or 0}"></div>
<div><label>یادداشت</label><input name="note" value="{esc(u['note'])}"></div>
</div><button>ذخیره</button></form></div>
<div class="card"><h2>محدودیت دسترسی</h2>
<form method="post" action="/u/{u['id']}/access">{csrf_field(sess)}
<p class="muted">سرویس‌هایی که تیک بزنید برای این کاربر بسته می‌شوند.</p>
<div class="checks">{checks}</div>
<p class="muted">اپ‌هایی که مستقیم به IP وصل می‌شوند ممکن است کامل بسته نشوند؛ برای مثال تماس صوتی واتس‌اپ.</p>
<button>ذخیره</button></form></div>
<div class="card actions">
{form('renew', 'تمدید ۳۰ روز')}
{form('reset', 'صفر کردن مصرف', confirm='مصرف این کاربر صفر شود؟')}
{form('toggle', toggle)}
{form('delete', 'حذف کاربر', 'danger', 'این کاربر برای همیشه حذف شود؟')}
</div>
<script>function copyLink(){{var t=document.getElementById('link');t.select();
(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).catch(function(){{document.execCommand('copy')}});}}</script>
""", sess)


# --------------------------------------------------------------------------
# HTTP

def number(form, key, default=0.0):
    try:
        return max(0.0, float(form.get(key, [default])[0] or 0))
    except ValueError:
        return default


class Handler(BaseHTTPRequestHandler):
    server_version = "panel"
    sys_version = ""
    timeout = 30

    def log_message(self, fmt, *args):
        pass

    def session(self):
        for part in self.headers.get("Cookie", "").split(";"):
            key, _, value = part.strip().partition("=")
            if key == "tp" and value in sessions:
                sess = sessions[value]
                if sess["exp"] > time.time():
                    return sess
                sessions.pop(value, None)
        return None

    def send(self, body, status=200, headers=()):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, location, headers=()):
        self.send("", 303, [("Location", location), *headers])

    def do_GET(self):
        sess = self.session()
        if self.path == "/login" or not sess:
            return self.send(login_page()) if not sess else self.redirect("/")
        if self.path == "/":
            return self.send(dashboard(sess))
        m = re.fullmatch(r"/u/(\d+)", self.path)
        if m and (u := get_user(int(m.group(1)))):
            return self.send(user_page(sess, u))
        self.redirect("/")

    def do_POST(self):
        length = min(int(self.headers.get("Content-Length") or 0), 65536)
        form = parse_qs(self.rfile.read(length).decode(errors="replace"))
        if self.path == "/login":
            return self.login(form.get("password", [""])[0])
        sess = self.session()
        if not sess or not hmac.compare_digest(form.get("csrf", [""])[0], sess["csrf"]):
            return self.redirect("/login")
        if self.path == "/logout":
            for token, s in list(sessions.items()):
                if s is sess:
                    sessions.pop(token)
            return self.redirect("/login", [("Set-Cookie", "tp=; Path=/; Max-Age=0; Secure; HttpOnly")])
        try:
            target = self.act(form)
            if target is None:
                return self.redirect("/")
            location, message = target
            sess["flash"] = ("ok", message)
        except ValueError as e:
            location, sess["flash"] = "/", ("bad", str(e))
        except Exception as e:
            log(f"action {self.path}: {e}")
            location, sess["flash"] = "/", ("bad", f"خطا: {e}")
        self.redirect(location if location.startswith("/") else "/")

    def login(self, password):
        now = time.time()
        login_failures[:] = [t for t in login_failures if now - t < 900]
        if len(login_failures) >= 10:
            return self.send(login_page("تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر دوباره امتحان کنید."), 429)
        if not check_password(password, load_conf()["password"]):
            login_failures.append(now)
            time.sleep(1.5)
            return self.send(login_page("رمز اشتباه است."), 401)
        token = secrets.token_urlsafe(32)
        sessions[token] = {"exp": now + SESSION_TTL, "csrf": secrets.token_urlsafe(24)}
        cookie = f"tp={token}; Path=/; Max-Age={SESSION_TTL}; Secure; HttpOnly; SameSite=Strict"
        self.redirect("/", [("Set-Cookie", cookie)])

    def act(self, form):
        now = int(time.time())
        if self.path == "/add":
            name = form.get("name", [""])[0].strip()
            if not NAME_RE.match(name):
                raise ValueError("نام فقط می‌تواند حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.")
            gb, days = number(form, "gb"), number(form, "days")
            with lock:
                with tx() as con:
                    if con.execute("SELECT 1 FROM users WHERE name = ?", (name,)).fetchone():
                        raise ValueError(f"کاربر {name} از قبل وجود دارد.")
                    cur = con.execute(
                        "INSERT INTO users(name, uuid, limit_bytes, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
                        (name, str(uuid.uuid4()), int(gb * GB), now + int(days * DAY) if days else 0, now))
                apply_config(f"add {name}")
            return f"/u/{cur.lastrowid}", f"کاربر {name} ساخته شد."

        m = re.fullmatch(r"/u/(\d+)/(edit|access|renew|reset|toggle|delete)", self.path)
        u = m and get_user(int(m.group(1)))
        if not u:
            return None
        action, where = m.group(2), f"/u/{u['id']}"
        with lock:
            with tx() as con:
                if action == "edit":
                    gb, days = number(form, "gb"), number(form, "days")
                    con.execute("UPDATE users SET limit_bytes = ?, expires_at = ?, note = ? WHERE id = ?",
                                (int(gb * GB), now + int(days * DAY) if days else 0,
                                 form.get("note", [""])[0][:200], u["id"]))
                    message = "تغییرات ذخیره شد."
                elif action == "access":
                    keys = [key for key in SERVICES if form.get(key)]
                    con.execute("UPDATE users SET blocked = ? WHERE id = ?", (",".join(keys), u["id"]))
                    message = "محدودیت‌ها ذخیره شد."
                elif action == "renew":
                    base = max(now, u["expires_at"]) if u["expires_at"] else now
                    con.execute("UPDATE users SET expires_at = ? WHERE id = ?", (base + 30 * DAY, u["id"]))
                    message = "۳۰ روز تمدید شد."
                elif action == "reset":
                    con.execute("UPDATE users SET used_bytes = 0 WHERE id = ?", (u["id"],))
                    message = "مصرف صفر شد."
                elif action == "toggle":
                    con.execute("UPDATE users SET enabled = 1 - enabled WHERE id = ?", (u["id"],))
                    message = "کاربر غیرفعال شد." if u["enabled"] else "کاربر فعال شد."
                else:
                    con.execute("DELETE FROM users WHERE id = ?", (u["id"],))
                    message, where = f"کاربر {u['name']} حذف شد.", "/"
            apply_config(f"{action} {u['name']}")
        return where, message


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # TLS noise from scanners and half-open connections


def serve():
    conf = load_conf()
    init_db()
    threading.Thread(target=worker, daemon=True).start()
    httpd = Server(("0.0.0.0", int(conf["port"])), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(os.path.join(CONF_DIR, "cert.pem"), os.path.join(CONF_DIR, "key.pem"))
    # Handshake in the request thread, so one slow client cannot stall accept().
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True, do_handshake_on_connect=False)
    log(f"tunpanel listening on :{conf['port']}")
    httpd.serve_forever()


def main():
    args = sys.argv[1:] or ["serve"]
    if args[0] == "serve":
        serve()
    elif args[0] == "init" and len(args) == 5 and args[1] == "--port" and args[3] == "--password":
        save_conf({"port": int(args[2]), "password": hash_password(args[4])})
    elif args[0] == "passwd" and len(args) == 2:
        conf = load_conf()
        conf["password"] = hash_password(args[1])
        save_conf(conf)
        print("password changed")
    else:
        print("\n".join(__doc__.strip().splitlines()[-3:]))
        sys.exit(2)


if __name__ == "__main__":
    main()
