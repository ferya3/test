#!/usr/bin/env python3
"""TunnelGuard Site Block: server-wide blocking of selected websites.

Standalone add-on. It does not import, change or restart any TunnelGuard
file or service; it only owns its own iptables chains, its own config file
and its own systemd unit.

Install it on the server whose traffic leaves to the Internet (normally the
outside server, role 2). A blocked site is recognised from the plaintext
parts of a new connection:

* TLS SNI in the ClientHello (TCP 443),
* the HTTP Host header (TCP 80),
* DNS question names (UDP/TCP 53).

QUIC (UDP 443) hides the SNI, so it can be rejected; browsers and apps then
fall back to TCP, where the name is visible.

Linux, root, iptables (nf_tables or legacy backend), Python 3.11+.
No pip dependencies.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

VERSION = '1.1.0'
HERE = Path(__file__).resolve()
CONFIG_DIR = Path('/etc/tunnelguard-siteblock')
CONFIG = CONFIG_DIR/'config.json'
INSTALL_DIR = Path('/opt/tunnelguard-siteblock')
UNIT = Path('/etc/systemd/system/tunnelguard-siteblock.service')
LAUNCHER = Path('/usr/local/bin/tg-siteblock')

CHAIN = 'TG_SITEBLOCK'
TLS_CHAIN = 'TG_SB_TLS'
HTTP_CHAIN = 'TG_SB_HTTP'
DNS_CHAIN = 'TG_SB_DNS'
CHAINS = (CHAIN, TLS_CHAIN, HTTP_CHAIN, DNS_CHAIN)
# OUTPUT: traffic made by this server's own cores (x-ui/xray, sing-box, SSH,
# Chisel...). FORWARD: routed traffic (WireGuard/GRE/IPIP clients, containers).
HOOKS = ('OUTPUT', 'FORWARD')
# Only the first bytes of a connection are inspected; the ClientHello and the
# HTTP request line live there. This keeps CPU cost bounded.
INSPECT_BYTES = 8192
MAX_DOMAIN = 100  # xt_string patterns are limited to 128 bytes.
MAX_CUSTOM = 500

DOMAIN_RE = re.compile(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})')

CATEGORIES = {
    'instagram': dict(
        fa='اینستاگرام', en='Instagram',
        domains=['instagram.com', 'cdninstagram.com', 'instagr.am', 'ig.me'],
        # Much Instagram media is served as instagram.<pop>.fna.fbcdn.net.
        keywords=['instagram'],
    ),
    'youtube': dict(
        fa='یوتیوب', en='YouTube',
        domains=['youtube.com', 'youtu.be', 'yt.be', 'ytimg.com', 'googlevideo.com',
                 'youtube-nocookie.com', 'youtubekids.com', 'youtubei.googleapis.com',
                 'youtube.googleapis.com', 'yt3.ggpht.com', 'yt4.ggpht.com'],
    ),
    'twitter': dict(
        fa='توییتر / X', en='Twitter / X',
        domains=['twitter.com', 'x.com', 'twimg.com', 't.co', 'twttr.com',
                 'tweetdeck.com', 'ads-twitter.com', 'pscp.tv'],
    ),
    'porn': dict(
        fa='سایت‌های غیراخلاقی (پورن)', en='Adult / porn sites',
        # Keywords are matched anywhere in the site name, so "porn" alone
        # covers pornhub, youporn, xporn... Short keywords (< 4 chars) are
        # avoided because they match random encrypted bytes too often.
        keywords=['porn', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'brazzers',
                  'chaturbate', 'stripchat', 'spankbang', 'eporner', 'tnaflix',
                  'motherless', 'hentai', 'rule34', 'livejasmin', 'bongacams',
                  'camsoda', 'onlyfans', 'fansly', 'youjizz'],
        tlds=['xxx', 'adult', 'sex'],
        domains=['phncdn.com', 'xhcdn.com', 'ypncdn.com', 'rdtcdn.com', 't8cdn.com',
                 'beeg.com', 'tube8.com', 'txxx.com', 'hclips.com', 'drtuber.com',
                 'ixxx.com', 'fuq.com', '4tube.com', 'daftsex.com', 'cam4.com',
                 'myfreecams.com', 'flirt4free.com', 'imagefap.com', 'literotica.com',
                 'gelbooru.com', 'donmai.us', 'manyvids.com', 'clips4sale.com',
                 'erome.com', 'fapello.com', 'coomer.su', 'coomer.party', 'empflix.com',
                 'heavy-r.com', 'efukt.com', 'dinotube.com', '3movs.com', 'anysex.com',
                 'sex.com', 'xozilla.com', 'hotmovs.com', 'vjav.com', 'missav.com',
                 'missav.ws', 'jable.tv', 'supjav.com', 'javlibrary.com', 'sxyprn.com',
                 'redgifs.com', 'highwebmedia.com', 'mmcdn.com', 'xcafe.com',
                 'thisvid.com', 'nudevista.com', 'faphouse.com'],
    ),
}

DEFAULT_CONFIG = dict(enabled=True, categories=[], custom=[], block_quic=True)

TEXT = {
    'fa': dict(
        title='🛡  TunnelGuard — مسدودسازی سایت‌ها',
        role='نقش این سرور', role_outside='خارج ✓', role_iran='ایران ⚠ (بهتر است روی سرور خارج نصب شود)',
        role_unknown='نامشخص', state='وضعیت فیلتر', on='فعال', off='خاموش',
        service='سرویس دائمی', installed='نصب‌شده', not_installed='نصب‌نشده (بعد از ری‌استارت پاک می‌شود)',
        add='➕ افزودن دامنه دلخواه', remove='➖ حذف دامنه دلخواه', quic='بستن QUIC (پیشنهادی)',
        check='🔎 بررسی یک دامنه', toggle='⏯  روشن / خاموش کردن کل فیلتر', stats='📊 آمار و وضعیت',
        install='📦 نصب سرویس دائمی', uninstall='🗑  حذف کامل این قابلیت', exit='خروج',
        custom='دامنه‌های دلخواه', none='(ندارد)', ask_domain='دامنه یا آدرس سایت: ',
        applied='✅ اعمال شد', blocked='⛔ مسدود است', allowed='✅ مسدود نیست', reason='دلیل',
        unknown='گزینه نامعتبر', failed='❌ انجام نشد', confirm='مطمئن هستید؟ (y/N): ',
        removed='حذف شد', hits='تعداد اتصال/درخواست مسدودشده', rules='تعداد قوانین فعال',
        diagnose='🩺 عیب‌یابی (چرا سایت هنوز باز می‌شود؟)', reset='🔌 قطع اتصال‌های فعلی (تا با فیلتر دوباره وصل شوند)',
        reset_done='🔌 {} اتصال باز قبلی بسته شد تا برنامه‌ها با فیلتر دوباره وصل شوند',
        reset_missing='⚠️  فرمان ss پیدا نشد (apt install iproute2)؛ برنامهٔ اینستاگرام را کامل ببندید و دوباره باز کنید',
    ),
    'en': dict(
        title='🛡  TunnelGuard — Site blocking',
        role='Server role', role_outside='Outside ✓', role_iran='Iran ⚠ (install it on the outside server instead)',
        role_unknown='Unknown', state='Filter', on='enabled', off='disabled',
        service='Persistent service', installed='installed', not_installed='not installed (lost on reboot)',
        add='➕ Add a custom domain', remove='➖ Remove a custom domain', quic='Block QUIC (recommended)',
        check='🔎 Check a domain', toggle='⏯  Enable / disable the whole filter', stats='📊 Statistics',
        install='📦 Install persistent service', uninstall='🗑  Remove this feature completely', exit='Exit',
        custom='Custom domains', none='(none)', ask_domain='Domain or site URL: ',
        applied='✅ Applied', blocked='⛔ Blocked', allowed='✅ Not blocked', reason='Reason',
        unknown='Unknown option', failed='❌ Failed', confirm='Are you sure? (y/N): ',
        removed='Removed', hits='Blocked connections/requests', rules='Active rules',
        diagnose='🩺 Diagnose (why does a site still open?)', reset='🔌 Reset current connections',
        reset_done='🔌 Closed {} open connection(s) so that apps reconnect through the filter',
        reset_missing='⚠️  ss not found (apt install iproute2); fully close and reopen the app',
    ),
}


# ---------------------------------------------------------------- domains

def normalize_domain(value):
    """Accept 'site.com', 'www.site.com', 'https://site.com/path' or a Unicode name."""
    if not isinstance(value, str):
        raise ValueError('Domain must be text')
    value = value.strip()
    host = urlsplit(value if '://' in value else '//' + value).hostname or ''
    host = host.rstrip('.')
    if host.startswith('www.'):
        host = host[4:]
    try:
        host = host.encode('idna').decode('ascii').lower()
    except UnicodeError:
        raise ValueError(f'Invalid domain: {value}') from None
    if len(host) > MAX_DOMAIN or not DOMAIN_RE.fullmatch(host):
        raise ValueError(f'Invalid domain: {value}')
    return host


def targets(cfg):
    """Return (domains, keywords, tlds) to block, each mapped to its source."""
    domains, keywords, tlds = {}, {}, {}
    for name in cfg['categories']:
        category = CATEGORIES[name]
        for d in category.get('domains', []):
            domains.setdefault(d, name)
        for k in category.get('keywords', []):
            keywords.setdefault(k, name)
        for t in category.get('tlds', []):
            tlds.setdefault(t, name)
    for d in cfg['custom']:
        domains.setdefault(d, 'custom')
    return domains, keywords, tlds


def explain(cfg, value):
    """Why a name would be blocked by the current config, or None."""
    host = normalize_domain(value)
    if not cfg['enabled']:
        return None
    domains, keywords, tlds = targets(cfg)
    for d, source in domains.items():
        if host == d or host.endswith('.' + d):
            return f'{source}: {d}'
    for k, source in keywords.items():
        if k in host:
            return f'{source}: *{k}*'
    for t, source in tlds.items():
        if host.endswith('.' + t):
            return f'{source}: .{t}'
    return None


# ------------------------------------------------------------------ config

def validate(cfg):
    if not isinstance(cfg, dict):
        raise ValueError('Configuration must be a JSON object')
    result = dict(DEFAULT_CONFIG)
    result.update({k: cfg[k] for k in DEFAULT_CONFIG if k in cfg})
    for key in ('enabled', 'block_quic'):
        if type(result[key]) is not bool:
            raise ValueError(f'{key} must be true or false')
    if not isinstance(result['categories'], list) or not set(result['categories']) <= set(CATEGORIES):
        raise ValueError('Unknown category; choose from ' + ', '.join(CATEGORIES))
    if not isinstance(result['custom'], list) or len(result['custom']) > MAX_CUSTOM:
        raise ValueError(f'custom must be a list of at most {MAX_CUSTOM} domains')
    result['categories'] = [c for c in CATEGORIES if c in result['categories']]
    result['custom'] = sorted({normalize_domain(d) for d in result['custom']})
    return result


def load(path=CONFIG):
    path = Path(path)
    if not path.exists():
        return dict(DEFAULT_CONFIG)
    return validate(json.loads(path.read_text(encoding='utf-8')))


def save(cfg, path=CONFIG):
    cfg = validate(cfg)
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.config-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write('\n')
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
    return cfg


# ------------------------------------------------------------------- rules

def sni_pattern(domain):
    # ServerName entry: name_type 0, two-byte length, host name. Matching the
    # length prefix makes "x.com" exact, so it does not match "dropbox.com".
    return f'|00{len(domain):04x}|{domain}'


def dns_pattern(name):
    # DNS wire format: length-prefixed labels, terminated by a zero byte.
    return ''.join(f'|{len(label):02x}|{label}' for label in name.split('.')) + '|00|'


def restore_text(cfg):
    """iptables-restore --noflush input. Declaring a chain also flushes it, so
    the whole rule set is replaced in one atomic commit."""
    lines = ['*filter'] + [f':{c} - [0:0]' for c in CHAINS]
    domains, keywords, tlds = targets(cfg)
    if cfg['enabled'] and (domains or keywords or tlds):
        early = f'-m connbytes --connbytes 0:{INSPECT_BYTES} --connbytes-dir original --connbytes-mode bytes'
        lines += [
            f'-A {CHAIN} -o lo -j RETURN',
            f'-A {CHAIN} -p tcp --dport 443 {early} -j {TLS_CHAIN}',
            f'-A {CHAIN} -p tcp --dport 80 {early} -j {HTTP_CHAIN}',
            f'-A {CHAIN} -p udp --dport 53 -j {DNS_CHAIN}',
            f'-A {CHAIN} -p tcp --dport 53 {early} -j {DNS_CHAIN}',
        ]
        if cfg['block_quic']:
            lines.append(f'-A {CHAIN} -p udp --dport 443 -j REJECT')
        match = '-m string --algo bm'
        # tcp-reset is only valid in rules that themselves match TCP.
        tcp = '-p tcp -m string --algo bm'
        reset = '-j REJECT --reject-with tcp-reset'
        for d in sorted(domains):
            lines += [
                f'-A {TLS_CHAIN} {tcp} --hex-string "{sni_pattern(d)}" {reset}',
                f'-A {TLS_CHAIN} {tcp} --string ".{d}" {reset}',
                f'-A {HTTP_CHAIN} {tcp} --icase --hex-string "Host: {d}|0d0a|" {reset}',
                f'-A {HTTP_CHAIN} {tcp} --icase --hex-string ".{d}|0d0a|" {reset}',
                f'-A {DNS_CHAIN} {match} --hex-string "{dns_pattern(d)}" -j REJECT',
            ]
        # Keywords are not applied to plain HTTP: there the whole request
        # (paths, Referer) is readable and a keyword would over-match.
        for k in sorted(keywords):
            lines += [
                f'-A {TLS_CHAIN} {tcp} --string "{k}" {reset}',
                f'-A {DNS_CHAIN} {match} --icase --string "{k}" -j REJECT',
            ]
        for t in sorted(tlds):
            lines += [
                f'-A {TLS_CHAIN} {tcp} --string ".{t}" {reset}',
                f'-A {DNS_CHAIN} {match} --icase --hex-string "{dns_pattern(t)}" -j REJECT',
            ]
    lines.append('COMMIT')
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------- iptables

def families():
    """iptables is required; ip6tables is used when present."""
    tools = []
    for tool in ('iptables', 'ip6tables'):
        if shutil.which(tool) and shutil.which(tool + '-restore'):
            tools.append(tool)
    if 'iptables' not in tools:
        raise RuntimeError('iptables is not installed (apt install iptables)')
    return tools


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], capture_output=True, text=True, **kwargs)


def require_root():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise RuntimeError('Run with sudo on a Linux server')


def has_jump(tool, hook):
    return run(tool, '-w', '-C', hook, '-j', CHAIN).returncode == 0


def flush():
    """Remove only this add-on's jumps and chains."""
    for tool in families():
        for hook in HOOKS:
            while has_jump(tool, hook):
                run(tool, '-w', '-D', hook, '-j', CHAIN)
        for chain in CHAINS:
            run(tool, '-w', '-F', chain)
        for chain in CHAINS:
            run(tool, '-w', '-X', chain)


def apply(cfg):
    require_root()
    domains, keywords, tlds = targets(cfg)
    if not cfg['enabled'] or not (domains or keywords or tlds):
        flush()
        return
    text = restore_text(cfg)
    warnings = []
    for tool in families():
        result = run(tool + '-restore', '-w', '--noflush', input=text)
        if result.returncode != 0:
            message = f'{tool}-restore failed: {result.stderr.strip()}'
            if tool == 'iptables':
                raise RuntimeError(message + '\nKernel modules xt_string and xt_connbytes are required.')
            warnings.append(message + ' (IPv6 left unfiltered)')
            continue
        for hook in HOOKS:
            if not has_jump(tool, hook):
                result = run(tool, '-w', '-I', hook, '1', '-j', CHAIN)
                if result.returncode != 0:
                    raise RuntimeError(f'{tool} could not attach to {hook}: {result.stderr.strip()}')
    for warning in warnings:
        print('Warning:', warning, file=sys.stderr)


def counters():
    """(active rules, blocked packets) summed over IPv4 and IPv6."""
    rules = hits = 0
    for tool in families():
        for chain in (CHAIN, TLS_CHAIN, HTTP_CHAIN, DNS_CHAIN):
            result = run(tool, '-w', '-nvxL', chain)
            if result.returncode != 0:
                continue
            for line in result.stdout.splitlines()[2:]:
                fields = line.split()
                if len(fields) > 2 and fields[2] == 'REJECT':
                    rules += 1
                    hits += int(fields[0])
    return rules, hits


def active():
    try:
        return any(has_jump(tool, hook) for tool in families() for hook in HOOKS)
    except RuntimeError:
        return False


def server_role():
    if Path('/opt/tunnelguard-manager/agent.json').exists() or Path('/opt/tunnelguard-node/server').exists() \
            or Path('/opt/tunnelguard-spoof/server').exists():
        return 'outside'
    if Path('/opt/tunnelguard-manager/controller.json').exists() or Path('/opt/tunnelguard-node/client').exists():
        return 'iran'
    return None


def adds_blocking(before, after):
    """True when `after` blocks something `before` did not."""
    if not after['enabled']:
        return False
    if not before['enabled'] or (after['block_quic'] and not before['block_quic']):
        return True
    old, new = targets(before), targets(after)
    return any(set(n) - set(o) for o, n in zip(old, new))


def reset_connections():
    """Close this server's established outgoing web connections.

    Apps such as Instagram keep one connection open for a long time, and only
    the start of a connection carries the site name. After a block is added,
    closing these connections makes every app reconnect through the filter.
    Clients reconnect on their own; this is a one-time short interruption.
    Returns the number of closed connections, or None when `ss` is missing."""
    if not shutil.which('ss'):
        return None
    base = ['ss', '-K', '-H', '-t', '-n', 'state', 'established']
    for expression in ('( dport = :443 or dport = :80 ) and not dst 127.0.0.0/8',
                       '( dport = :443 or dport = :80 )'):
        result = run(*base, expression)
        if result.returncode == 0:
            return len([line for line in result.stdout.splitlines() if line.strip()])
    return None


# --------------------------------------------------------------- diagnose

XRAY_CONFIGS = ('/usr/local/x-ui/bin/config.json', '/usr/local/etc/xray/config.json',
                '/etc/xray/config.json', '/var/lib/marzban/xray_config.json')
HIDING_PROCESSES = ('wireproxy', 'warp-plus', 'warp-go', 'usque', 'warp-svc')
PROXY_PROTOCOLS = ('vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'hysteria2', 'wireguard')

DIAG = {
    'fa': dict(
        title='🩺 عیب‌یابی مسدودسازی', ok='✅', warn='⚠️ ', bad='❌',
        not_root='این بررسی باید با sudo اجرا شود.',
        role_iran='این سرور «ایران» است. ترافیک کاربران از سرور خارج به اینترنت می‌رود؛ افزونه را روی سرور خارج نصب و همان‌جا فعال کنید.',
        role_outside='این سرور «خارج» است (درست).',
        role_unknown='نقش سرور مشخص نیست؛ مطمئن شوید این همان سروری است که ترافیک کاربران از آن به اینترنت می‌رود.',
        disabled='فیلتر خاموش است یا هیچ دسته‌ای انتخاب نشده.',
        selected='دسته‌های فعال: {}',
        no_rules='قوانین {} بارگذاری نشده‌اند. گزینه «اعمال» یا `sudo systemctl restart tunnelguard-siteblock` را بزنید.',
        rules='قوانین {}: {} قانون، {} مورد مسدود‌شده تا الان.',
        ipv6_open='سرور IPv6 دارد ولی قوانین IPv6 بارگذاری نشده‌اند؛ اینستاگرام ترجیحاً از IPv6 استفاده می‌کند و فیلتر نمی‌شود.',
        quic_off='بستن QUIC خاموش است؛ اینستاگرام و یوتیوب از QUIC استفاده می‌کنند و از فیلتر رد می‌شوند. گزینه QUIC را روشن کنید.',
        sni_ok='تست زنده: اتصال با نام www.instagram.com از همین سرور قطع شد — فیلتر روی این سرور کار می‌کند.',
        sni_open='تست زنده: اتصال با نام www.instagram.com از همین سرور قطع نشد — قوانین روی ترافیک این سرور اثر ندارند.',
        sni_skip='تست زنده انجام نشد (این سرور به 1.1.1.1:443 دسترسی ندارد).',
        dns_ok='تست DNS: پرسش instagram.com مسدود شد.',
        dns_open='تست DNS: پرسش instagram.com مسدود نشد.',
        warp='Xray خروجی «{}» از نوع WireGuard/WARP دارد ({}). ترافیکی که به آن فرستاده شود قبل از خروج رمز می‌شود و این فیلتر آن را نمی‌بیند.',
        chain='Xray خروجی «{}» ({}) دارد که ترافیک را به سرور دیگری می‌فرستد؛ آن ترافیک رمزشده خارج می‌شود و فیلتر نمی‌شود.',
        default_hidden='خروجی پیش‌فرض Xray «{}» است؛ یعنی همهٔ ترافیک کاربران از آن مسیر می‌رود و این فیلتر هیچ‌چیز را نمی‌بیند.',
        fragment='خروجی «{}» در Xray تنظیم fragment دارد؛ نام سایت در چند بسته تکه می‌شود و فیلتر آن را نمی‌بیند. fragment را از خروجی سرور بردارید (روی کلاینت مشکلی ندارد).',
        process='برنامهٔ «{}» روی سرور در حال اجراست؛ اگر ترافیک کاربران از آن رد شود (WARP در حالت پراکسی)، فیلتر نمی‌شود.',
        xray_tip='راه مطمئن‌تر برای کاربران 3x-ui: در پنل، Xray Configs ← Routing Rules ← Add Rule، در Domain بنویسید geosite:instagram و Outbound Tag را blocked بگذارید، ذخیره و Xray را ری‌استارت کنید. این روش با WARP و fragment هم کار می‌کند.',
        reset='اتصال‌هایی که قبل از فعال شدن فیلتر باز بوده‌اند تا وقتی بسته نشوند کار می‌کنند. گزینه «قطع اتصال‌های فعلی» را بزنید یا برنامهٔ اینستاگرام را کامل ببندید و دوباره باز کنید.',
        found='{} مشکل احتمالی پیدا شد.', none_found='مشکلی پیدا نشد.',
    ),
    'en': dict(
        title='🩺 Site blocking diagnostics', ok='✅', warn='⚠️ ', bad='❌',
        not_root='Run this check with sudo.',
        role_iran='This is the Iran server. User traffic reaches the Internet from the outside server; install and enable the add-on there.',
        role_outside='This is the outside server (correct).',
        role_unknown='Server role unknown; make sure user traffic leaves to the Internet from this server.',
        disabled='The filter is off or no category is selected.',
        selected='Active categories: {}',
        no_rules='{} rules are not loaded. Use "apply" or `sudo systemctl restart tunnelguard-siteblock`.',
        rules='{} rules: {} rules, {} blocked so far.',
        ipv6_open='This server has IPv6 but IPv6 rules are not loaded; Instagram prefers IPv6 and passes unfiltered.',
        quic_off='QUIC blocking is off; Instagram and YouTube use QUIC and pass the filter. Turn QUIC blocking on.',
        sni_ok='Live test: a connection named www.instagram.com from this server was reset; the filter works here.',
        sni_open='Live test: a connection named www.instagram.com from this server was NOT reset; the rules do not affect this server.',
        sni_skip='Live test skipped (this server cannot reach 1.1.1.1:443).',
        dns_ok='DNS test: a query for instagram.com was blocked.',
        dns_open='DNS test: a query for instagram.com was not blocked.',
        warp='Xray has a WireGuard/WARP outbound "{}" ({}). Traffic routed to it is encrypted before it leaves and cannot be filtered.',
        chain='Xray has outbound "{}" ({}) that forwards traffic to another server; that traffic leaves encrypted and is not filtered.',
        default_hidden='The default Xray outbound is "{}": all user traffic takes that path and this filter sees nothing.',
        fragment='Xray outbound "{}" uses fragment; the site name is split across packets and cannot be matched. Remove fragment from the server outbound.',
        process='"{}" is running; traffic passing through it (WARP proxy mode) is not filtered.',
        xray_tip='More reliable for 3x-ui: Xray Configs → Routing Rules → Add Rule, Domain geosite:instagram, Outbound Tag blocked; save and restart Xray. This also works with WARP and fragment.',
        reset='Connections opened before the filter keep working until they close. Use "reset connections" or fully close and reopen the Instagram app.',
        found='{} possible problem(s) found.', none_found='No problem found.',
    ),
}


def ipv6_global():
    try:
        for line in Path('/proc/net/if_inet6').read_text().splitlines():
            fields = line.split()
            if len(fields) == 6 and fields[3] == '00' and fields[5] != 'lo':
                return True
    except OSError:
        pass
    return False


def chain_counters(tool):
    """(rules, blocked packets) for one family, or None when not loaded."""
    if not any(has_jump(tool, hook) for hook in HOOKS):
        return None
    rules = hits = 0
    for chain in CHAINS:
        result = run(tool, '-w', '-nvxL', chain)
        for line in result.stdout.splitlines()[2:] if result.returncode == 0 else []:
            fields = line.split()
            if len(fields) > 2 and fields[2] == 'REJECT':
                rules += 1
                hits += int(fields[0])
    return rules, hits


def sni_probe(sni, address='1.1.1.1', port=443, timeout=6):
    """'blocked' when the ClientHello is reset, 'open' when the server answers."""
    import ssl
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((address, port), timeout=timeout) as raw:
            with context.wrap_socket(raw, server_hostname=sni):
                return 'open'
    except ConnectionResetError:
        return 'blocked'
    except ssl.SSLError:
        return 'open'  # the server itself answered, e.g. with an alert
    except OSError:
        return 'error'


def dns_probe(name, address='1.1.1.1', timeout=3):
    query = os.urandom(2) + b'\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00' + b''.join(
        bytes([len(label)]) + label.encode() for label in name.split('.')) + b'\x00\x00\x01\x00\x01'
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.settimeout(timeout)
        try:
            s.connect((address, 53))
            s.send(query)
            s.recv(512)
            return 'open'
        except (PermissionError, ConnectionRefusedError):
            return 'blocked'
        except OSError:
            return 'error'


def xray_findings(paths=None):
    """Outbounds that would hide traffic from the filter: (kind, tag, detail)."""
    findings = []
    for path in paths or XRAY_CONFIGS:
        try:
            config = json.loads(Path(path).read_text(encoding='utf-8'))
            outbounds = config.get('outbounds') or []
        except (OSError, ValueError, AttributeError):
            continue
        for index, outbound in enumerate(o for o in outbounds if isinstance(o, dict)):
            protocol = str(outbound.get('protocol', ''))
            tag = str(outbound.get('tag', protocol))
            settings = outbound.get('settings') or {}
            if protocol == 'freedom' and isinstance(settings, dict) and settings.get('fragment'):
                findings.append(('fragment', tag, path))
            elif protocol == 'wireguard':
                findings.append(('default' if index == 0 else 'warp', tag, path))
            elif protocol in PROXY_PROTOCOLS:
                findings.append(('default' if index == 0 else 'chain', tag, f'{protocol}, {path}'))
    return findings


def running_processes(names=HIDING_PROCESSES):
    found = set()
    for comm in Path('/proc').glob('[0-9]*/comm'):
        try:
            name = comm.read_text().strip()
        except OSError:
            continue
        if name in names:
            found.add(name)
    return sorted(found)


def diagnose(cfg, lang='fa'):
    t = DIAG[lang]
    print(t['title'])
    problems = 0

    def say(level, text):
        nonlocal problems
        problems += level != 'ok'
        print(t[level], text)

    if sys.platform != 'linux' or os.geteuid() != 0:
        say('bad', t['not_root'])
        return 1
    role = server_role()
    say('bad' if role == 'iran' else 'ok' if role == 'outside' else 'warn', t['role_' + (role or 'unknown')])
    domains, keywords, tlds = targets(cfg)
    if not cfg['enabled'] or not (domains or keywords or tlds):
        say('bad', t['disabled'])
    else:
        say('ok', t['selected'].format(', '.join(CATEGORIES[c][lang] for c in cfg['categories']) or '-'))
    loaded = {}
    for tool in families():
        loaded[tool] = chain_counters(tool)
        if loaded[tool] is None:
            say('bad', t['no_rules'].format('IPv6' if tool == 'ip6tables' else 'IPv4'))
    if ipv6_global() and loaded.get('ip6tables') is None:
        say('bad', t['ipv6_open'])
    if not cfg['block_quic']:
        say('bad', t['quic_off'])
    if loaded.get('iptables') is not None:
        control = sni_probe('www.wikipedia.org')
        if control != 'open':
            say('warn', t['sni_skip'])
        elif sni_probe('www.instagram.com') == 'blocked':
            say('ok', t['sni_ok'])
        else:
            say('bad', t['sni_open'])
        if dns_probe('wikipedia.org') == 'open':
            blocked = dns_probe('instagram.com') == 'blocked'
            say('ok' if blocked else 'bad', t['dns_ok'] if blocked else t['dns_open'])
    for tool, counts in loaded.items():
        if counts is not None:  # read after the live tests, which add to them
            print(t['ok'], t['rules'].format('IPv6' if tool == 'ip6tables' else 'IPv4', *chain_counters(tool)))
    findings = xray_findings()
    for kind, tag, detail in findings:
        key = {'default': 'default_hidden', 'warp': 'warp', 'chain': 'chain', 'fragment': 'fragment'}[kind]
        say('bad' if kind in ('default', 'fragment') else 'warn',
            t[key].format(tag) if kind == 'default' else t[key].format(tag, detail))
    for name in running_processes():
        say('warn', t['process'].format(name))
    print(t['warn'], t['reset'])
    if any(Path(p).exists() for p in XRAY_CONFIGS):
        print('💡', t['xray_tip'])
    print(t['found'].format(problems) if problems else t['none_found'])
    return 0


# ----------------------------------------------------------------- service

def install():
    require_root()
    families()
    INSTALL_DIR.mkdir(mode=0o755, parents=True, exist_ok=True)
    target = INSTALL_DIR/'site_block.py'
    if HERE != target.resolve():
        shutil.copyfile(HERE, target)
    target.chmod(0o755)
    if not CONFIG.exists():
        save(dict(DEFAULT_CONFIG))
    python = shutil.which('python3') or '/usr/bin/python3'
    UNIT.write_text(f'''[Unit]
Description=TunnelGuard site blocking (iptables rules)
After=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart={python} {target} apply
ExecReload={python} {target} apply
ExecStop={python} {target} flush

[Install]
WantedBy=multi-user.target
''', encoding='utf-8')
    UNIT.chmod(0o644)
    LAUNCHER.write_text(f'#!/bin/sh\nexec {python} {target} "$@"\n', encoding='utf-8')
    LAUNCHER.chmod(0o755)
    for command in (('daemon-reload',), ('enable', UNIT.name), ('restart', UNIT.name)):
        result = run('systemctl', *command)
        if result.returncode != 0:
            raise RuntimeError(f'systemctl {" ".join(command)} failed: {result.stderr.strip()}')


def uninstall():
    require_root()
    if UNIT.exists():
        run('systemctl', 'disable', '--now', UNIT.name)
        UNIT.unlink()
        run('systemctl', 'daemon-reload')
    flush()
    LAUNCHER.unlink(missing_ok=True)
    shutil.rmtree(INSTALL_DIR, ignore_errors=True)
    shutil.rmtree(CONFIG_DIR, ignore_errors=True)


def installed():
    return UNIT.exists()


# -------------------------------------------------------------------- menu

def report_reset(t):
    count = reset_connections()
    print(t['reset_missing'] if count is None else t['reset_done'].format(count))


def menu(lang='fa', path=CONFIG):
    require_root()
    t = TEXT[lang]
    role = server_role()
    while True:
        cfg = load(path)
        mark = lambda on: '[✓]' if on else '[ ]'
        print()
        print(t['title'], f'v{VERSION}')
        print(f"{t['role']}: {t['role_' + role] if role else t['role_unknown']}")
        print(f"{t['state']}: {t['on'] if cfg['enabled'] and active() else t['off']}   "
              f"{t['service']}: {t['installed'] if installed() else t['not_installed']}")
        names = list(CATEGORIES)
        for i, name in enumerate(names, 1):
            print(f'{i:>3}) {mark(name in cfg["categories"])} {CATEGORIES[name][lang]}')
        n = len(names)
        print(f'{n + 1:>3}) {t["add"]}')
        print(f'{n + 2:>3}) {t["remove"]}   {t["custom"]}: {", ".join(cfg["custom"]) or t["none"]}')
        print(f'{n + 3:>3}) {mark(cfg["block_quic"])} {t["quic"]}')
        print(f'{n + 4:>3}) {t["check"]}')
        print(f'{n + 5:>3}) {mark(cfg["enabled"])} {t["toggle"]}')
        print(f'{n + 6:>3}) {t["stats"]}')
        print(f'{n + 7:>3}) {t["diagnose"]}')
        print(f'{n + 8:>3}) {t["reset"]}')
        print(f'{n + 9:>3}) {t["install"]}')
        print(f'{n + 10:>3}) {t["uninstall"]}')
        print(f'  0) {t["exit"]}')
        try:
            choice = input('> ').strip()
            if choice == '0':
                return 0
            if not choice.isdigit() or not 1 <= int(choice) <= n + 10:
                print(t['unknown'])
                continue
            number = int(choice)
            changed = True
            before = json.loads(json.dumps(cfg))
            if number <= n:
                name = names[number - 1]
                if name in cfg['categories']:
                    cfg['categories'].remove(name)
                else:
                    cfg['categories'].append(name)
            elif number == n + 1:
                cfg['custom'].append(normalize_domain(input(t['ask_domain'])))
            elif number == n + 2:
                domain = normalize_domain(input(t['ask_domain']))
                if domain not in cfg['custom']:
                    raise ValueError(domain + ' ∉ ' + t['custom'])
                cfg['custom'].remove(domain)
            elif number == n + 3:
                cfg['block_quic'] = not cfg['block_quic']
            elif number == n + 4:
                changed = False
                reason = explain(cfg, input(t['ask_domain']))
                print(f"{t['blocked']} — {t['reason']}: {reason}" if reason else t['allowed'])
            elif number == n + 5:
                cfg['enabled'] = not cfg['enabled']
            elif number == n + 6:
                changed = False
                rules, hits = counters()
                print(f"{t['rules']}: {rules}\n{t['hits']}: {hits}")
            elif number == n + 7:
                changed = False
                diagnose(cfg, lang)
            elif number == n + 8:
                changed = False
                report_reset(t)
            elif number == n + 9:
                changed = False
                install()
                print(t['applied'])
            else:
                changed = False
                if input(t['confirm']).strip().lower() in ('y', 'yes'):
                    uninstall()
                    print(t['removed'])
                    return 0
            if changed:
                cfg = save(cfg, path)
                apply(cfg)
                print(t['applied'])
                if adds_blocking(before, cfg):
                    report_reset(t)
        except (ValueError, OSError, RuntimeError) as error:
            print(t['failed'] + ':', error)
        except (EOFError, KeyboardInterrupt):
            print()
            return 0


# --------------------------------------------------------------------- CLI

def main(argv=None):
    parser = argparse.ArgumentParser(description='TunnelGuard add-on: block selected websites on this server.')
    parser.add_argument('--version', action='version', version=VERSION)
    parser.add_argument('--lang', choices=['fa', 'en'], default='fa', help='menu language')
    parser.add_argument('--config', type=Path, default=CONFIG, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest='command')
    sub.add_parser('menu', help='interactive menu (default)')
    sub.add_parser('status', help='show configuration and counters')
    for name, help_text in (('enable', 'block categories'), ('disable', 'unblock categories')):
        p = sub.add_parser(name, help=help_text)
        p.add_argument('categories', nargs='+', choices=list(CATEGORIES))
    for name, help_text in (('add', 'block custom domains'), ('remove', 'unblock custom domains')):
        p = sub.add_parser(name, help=help_text)
        p.add_argument('domains', nargs='+')
    p = sub.add_parser('quic', help='reject QUIC (UDP 443) so that the site name is visible')
    p.add_argument('state', choices=['on', 'off'])
    p = sub.add_parser('check', help='would this domain be blocked?')
    p.add_argument('domain')
    sub.add_parser('on', help='turn the filter on')
    sub.add_parser('off', help='turn the filter off (rules removed, settings kept)')
    sub.add_parser('apply', help='(re)apply rules from the configuration')
    sub.add_parser('flush', help='remove rules now without changing the configuration')
    sub.add_parser('rules', help='print the generated iptables-restore input (no changes)')
    sub.add_parser('install', help='install persistent service and the tg-siteblock command')
    sub.add_parser('uninstall', help='remove rules, service, command and configuration')
    sub.add_parser('diagnose', help='find out why a blocked site still opens')
    sub.add_parser('reset', help='close open web connections so that apps reconnect through the filter')
    parser.add_argument('--keep-connections', action='store_true',
                        help='do not close open connections after adding a block')
    a = parser.parse_args(argv)
    command = a.command or 'menu'
    try:
        if command == 'menu':
            return menu(a.lang, a.config)
        cfg = load(a.config)
        if command == 'rules':
            print(restore_text(cfg), end='')
            return 0
        if command == 'check':
            reason = explain(cfg, a.domain)
            print(f'BLOCKED ({reason})' if reason else 'not blocked')
            return 0
        if command == 'status':
            domains, keywords, tlds = targets(cfg)
            print(json.dumps(cfg, indent=2, ensure_ascii=False))
            print(f'domains={len(domains)} keywords={len(keywords)} tlds={len(tlds)}')
            if sys.platform == 'linux' and os.geteuid() == 0:
                rules, hits = counters()
                print(f'active={active()} service={installed()} rules={rules} blocked={hits}')
            return 0
        if command == 'apply':
            apply(cfg)
            return 0
        if command == 'flush':
            require_root()
            flush()
            return 0
        if command == 'install':
            install()
            print('Installed. Open the menu with: sudo tg-siteblock')
            return 0
        if command == 'uninstall':
            uninstall()
            print('Removed')
            return 0
        if command == 'diagnose':
            return diagnose(cfg, a.lang)
        if command == 'reset':
            require_root()
            report_reset(TEXT[a.lang])
            return 0
        before = json.loads(json.dumps(cfg))
        if command == 'enable':
            cfg['categories'] += a.categories
        elif command == 'disable':
            cfg['categories'] = [c for c in cfg['categories'] if c not in a.categories]
        elif command == 'add':
            cfg['custom'] += [normalize_domain(d) for d in a.domains]
        elif command == 'remove':
            remove = {normalize_domain(d) for d in a.domains}
            cfg['custom'] = [d for d in cfg['custom'] if d not in remove]
        elif command == 'quic':
            cfg['block_quic'] = a.state == 'on'
        elif command in ('on', 'off'):
            cfg['enabled'] = command == 'on'
        require_root()
        cfg = save(cfg, a.config)
        apply(cfg)
        print('Applied')
        if adds_blocking(before, cfg) and not a.keep_connections:
            report_reset(TEXT[a.lang])
        return 0
    except (ValueError, OSError, RuntimeError) as error:
        print('Failed:', error, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
