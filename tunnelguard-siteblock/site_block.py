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
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

VERSION = '1.0.0'
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
        print(f'{n + 7:>3}) {t["install"]}')
        print(f'{n + 8:>3}) {t["uninstall"]}')
        print(f'  0) {t["exit"]}')
        try:
            choice = input('> ').strip()
            if choice == '0':
                return 0
            if not choice.isdigit() or not 1 <= int(choice) <= n + 8:
                print(t['unknown'])
                continue
            number = int(choice)
            changed = True
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
                install()
                print(t['applied'])
            else:
                changed = False
                if input(t['confirm']).strip().lower() in ('y', 'yes'):
                    uninstall()
                    print(t['removed'])
                    return 0
            if changed:
                apply(save(cfg, path))
                print(t['applied'])
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
        apply(save(cfg, a.config))
        print('Applied')
        return 0
    except (ValueError, OSError, RuntimeError) as error:
        print('Failed:', error, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
