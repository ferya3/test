#!/usr/bin/env python3
"""TunnelGuard Stability: automatic watchdog for panel-managed links plus
reversible network tuning.

Standalone add-on. It does not import or modify any TunnelGuard file. It only
reads the link manifests TunnelGuard already writes
(/opt/tunnelguard-manager/tunnels/<name>/plan.json) and restarts the existing
`tunnelguard-link-<name>` systemd units when a link is stuck.

Why: a link service is restarted by systemd only when its process exits.
A carrier that is alive but passes no traffic (NAT timeout, packet loss, DPI
resets, a client stuck in a long reconnect back-off) is never restarted.

* Iran side: every link is tested end to end through its local SOCKS port with
  a real HTTP request that leaves through the outside server.
* Outside side: for links the outside server initiates (reverse direction over
  a TCP carrier), the watchdog checks that the connection to Iran is
  established, and restarts the client so it reconnects at once instead of
  waiting for a long back-off.
* Restarts use an increasing cooldown, so a real outage never becomes a
  restart storm.

Linux, root, systemd, Python 3.11+. No pip dependencies.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

VERSION = '1.0.0'
HERE = Path(__file__).resolve()

MANAGER = Path('/opt/tunnelguard-manager')
LINKS = MANAGER/'tunnels'
MANAGER_STATE = MANAGER/'state.json'

CONFIG_DIR = Path('/etc/tunnelguard-stability')
CONFIG = CONFIG_DIR/'config.json'
STATE_DIR = Path('/var/lib/tunnelguard-stability')
STATE = STATE_DIR/'state.json'
SYSCTL_BACKUP = STATE_DIR/'sysctl-backup.json'
INSTALL_DIR = Path('/opt/tunnelguard-stability')
UNIT = Path('/etc/systemd/system/tunnelguard-stability.service')
LAUNCHER = Path('/usr/local/bin/tg-stability')
SYSCTL_FILE = Path('/etc/sysctl.d/90-tunnelguard-stability.conf')
MODULES_FILE = Path('/etc/modules-load.d/tunnelguard-stability.conf')

NAME_RE = re.compile(r'[a-z][a-z0-9-]{0,23}')

DEFAULT_CONFIG = dict(
    interval=20,          # seconds between rounds
    timeout=10,           # seconds per probe
    failures=3,           # consecutive failed rounds before a restart
    grace=60,             # ignore a link for this long after it (re)started
    cooldown=60,          # first wait after a restart; doubles each time
    max_cooldown=900,     # upper bound for the cooldown
    stable=600,           # healthy this long after a restart -> cooldown resets
    targets=['http://cp.cloudflare.com/generate_204',
             'http://connectivitycheck.gstatic.com/generate_204'],
)
BOUNDS = dict(interval=(5, 600), timeout=(2, 60), failures=(1, 20), grace=(0, 600),
              cooldown=(10, 3600), max_cooldown=(10, 86400), stable=(30, 86400))

# Values chosen for long-lived tunnels over lossy, high-latency paths.
# ip_local_port_range is deliberately not changed: TunnelGuard listens on
# fixed ports (23010-24990, 30001-30199) that must stay outside it.
SYSCTLS = {
    'net.core.default_qdisc': 'fq',
    'net.ipv4.tcp_congestion_control': 'bbr',
    'net.ipv4.tcp_mtu_probing': '1',
    'net.ipv4.tcp_slow_start_after_idle': '0',
    'net.ipv4.tcp_notsent_lowat': '16384',
    'net.ipv4.tcp_keepalive_time': '60',
    'net.ipv4.tcp_keepalive_intvl': '10',
    'net.ipv4.tcp_keepalive_probes': '6',
    'net.ipv4.tcp_fin_timeout': '15',
    'net.core.rmem_max': '16777216',
    'net.core.wmem_max': '16777216',
    'net.ipv4.tcp_rmem': '4096 131072 16777216',
    'net.ipv4.tcp_wmem': '4096 65536 16777216',
    'net.core.somaxconn': '4096',
    'net.ipv4.tcp_max_syn_backlog': '8192',
    'net.netfilter.nf_conntrack_max': '262144',
}

TEXT = {
    'fa': dict(
        title='🩺 TunnelGuard — پایداری تانل', role='نقش این سرور', iran='ایران', outside='خارج',
        unknown='نامشخص (TunnelGuard پیدا نشد)', watchdog='نگهبان خودکار', tuning='بهینه‌سازی شبکه',
        on='فعال', off='غیرفعال', applied='اعمال‌شده', not_applied='اعمال‌نشده', links='لینک‌ها',
        no_links='(لینکی ساخته نشده)', healthy='✅ سالم', broken='❌ قطع', waiting='⏳ در انتظار',
        not_watched='— بررسی در سمت مقابل', restarts='ری‌استارت', last='آخرین',
        check='🔎 تست همهٔ لینک‌ها همین حالا', install='📦 نصب / به‌روزرسانی نگهبان خودکار و بهینه‌سازی',
        tune='⚙️  فقط اعمال بهینه‌سازی شبکه', untune='↩️  برگرداندن تنظیمات شبکه به حالت قبل',
        uninstall='🗑  حذف کامل این قابلیت', exit='خروج', done='✅ انجام شد', failed='❌ انجام نشد',
        confirm='مطمئن هستید؟ (y/N): ', bad='گزینه نامعتبر',
    ),
    'en': dict(
        title='🩺 TunnelGuard — Tunnel stability', role='Server role', iran='Iran', outside='Outside',
        unknown='Unknown (TunnelGuard not found)', watchdog='Watchdog', tuning='Network tuning',
        on='running', off='stopped', applied='applied', not_applied='not applied', links='Links',
        no_links='(no links yet)', healthy='✅ healthy', broken='❌ down', waiting='⏳ pending',
        not_watched='— checked on the other side', restarts='restarts', last='last',
        check='🔎 Test all links now', install='📦 Install / update watchdog and tuning',
        tune='⚙️  Apply network tuning only', untune='↩️  Restore previous network settings',
        uninstall='🗑  Remove this feature completely', exit='Exit', done='✅ Done', failed='❌ Failed',
        confirm='Are you sure? (y/N): ', bad='Unknown option',
    ),
}


def log(*parts):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), *parts, flush=True)


def run(*args, timeout=60):
    return subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=timeout)


def require_root():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise RuntimeError('Run with sudo on a Linux server')


def write_private(path, data, mode=0o600):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.tmp-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(data if isinstance(data, str) else json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


# ------------------------------------------------------------------ config

def validate(cfg):
    if not isinstance(cfg, dict):
        raise ValueError('Configuration must be a JSON object')
    result = dict(DEFAULT_CONFIG)
    result.update({k: cfg[k] for k in DEFAULT_CONFIG if k in cfg})
    for key, (low, high) in BOUNDS.items():
        if type(result[key]) is not int or not low <= result[key] <= high:
            raise ValueError(f'{key} must be an integer in {low}..{high}')
    if result['timeout'] >= result['interval']:
        raise ValueError('timeout must be smaller than interval')
    targets = result['targets']
    if not isinstance(targets, list) or not 1 <= len(targets) <= 5:
        raise ValueError('targets must list 1..5 http:// URLs')
    for url in targets:
        parsed = urlsplit(url) if isinstance(url, str) else None
        if not parsed or parsed.scheme != 'http' or not parsed.hostname or len(parsed.hostname) > 253 \
                or any(ord(c) < 33 or ord(c) == 127 for c in url):
            raise ValueError(f'Invalid target {url!r}; plain http:// URLs only')
    return result


def load(path=CONFIG):
    path = Path(path)
    return validate(json.loads(path.read_text(encoding='utf-8'))) if path.exists() else dict(DEFAULT_CONFIG)


# ------------------------------------------------------------------- links

@dataclass
class Link:
    name: str
    role: str            # this server: 'iran' or 'exit'
    method: str
    direction: str
    socks_port: int
    kind: str            # 'socks' (end-to-end probe), 'initiator' (connection check), 'none'
    target: tuple | None = None

    @property
    def unit(self):
        return f'tunnelguard-link-{self.name}.service'


def initiator_target(plan):
    """Address the outside server's client connects to, for TCP carriers only.

    The outside server initiates the channel only in reverse direction. UDP and
    raw carriers (WireGuard, Paqet, Spoof) have no TCP connection to inspect;
    they are covered by the end-to-end probe on the Iran side."""
    if plan['direction'] != 'reverse':
        return None
    method, base = plan['method'], plan['port']
    if method == 'ssh':
        return plan['iran'], plan['ssh_port']
    if method == 'chisel':
        return plan['iran'], base
    if method == 'rathole':
        return plan['iran'], base + 1
    if method in ('ipip', 'gre', 'vxlan'):
        return f'10.203.{plan["slot"]}.1', base
    return None


def make_link(plan, role):
    name = plan.get('name')
    if not isinstance(name, str) or not NAME_RE.fullmatch(name) or role not in ('iran', 'exit'):
        raise ValueError('Invalid link manifest')
    socks = plan.get('socks_port')
    if type(socks) is not int or not 1 <= socks <= 65535:
        raise ValueError('Invalid SOCKS port')
    if role == 'iran':
        return Link(name, role, plan['method'], plan['direction'], socks, 'socks')
    target = initiator_target(plan)
    if target is not None:
        ipaddress.IPv4Address(target[0])
        if type(target[1]) is not int or not 1 <= target[1] <= 65535:
            raise ValueError('Invalid peer port')
    return Link(name, role, plan['method'], plan['direction'], socks,
                'initiator' if target else 'none', target)


def manager_phases(path=MANAGER_STATE):
    try:
        links = json.loads(Path(path).read_text(encoding='utf-8'))['links']
        return {name: item.get('phase') for name, item in links.items()}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def discover(root=LINKS, state_path=MANAGER_STATE):
    """Links installed on this server that are ready to be watched."""
    links = []
    root = Path(root)
    if not root.is_dir():
        return links
    phases = manager_phases(state_path)
    for folder in sorted(root.iterdir()):
        try:
            plan = json.loads((folder/'plan.json').read_text(encoding='utf-8'))
            role = (folder/'role').read_text(encoding='utf-8').strip()
            link = make_link(plan, role)
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if link.name != folder.name:
            continue
        # The Iran controller records each operation; never touch a link
        # while it is being installed or removed.
        if role == 'iran' and (phases is None or phases.get(link.name) != 'ready'):
            continue
        links.append(link)
    return links


def server_role():
    if (MANAGER/'controller.json').exists():
        return 'iran'
    if (MANAGER/'agent.json').exists():
        return 'outside'
    return None


# ------------------------------------------------------------------ probes

def recv_exact(sock, size):
    data = b''
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise OSError('Connection closed')
        data += chunk
    return data


def socks_http(port, url, timeout):
    """One HTTP request through a local SOCKS5 port. Any HTTP response proves
    that bytes crossed both servers and reached the Internet."""
    parsed = urlsplit(url)
    host = parsed.hostname.encode('idna')
    target_port = parsed.port or 80
    path = (parsed.path or '/') + (('?' + parsed.query) if parsed.query else '')
    with socket.create_connection(('127.0.0.1', port), timeout=timeout) as s:
        s.settimeout(timeout)
        s.sendall(b'\x05\x01\x00')
        if recv_exact(s, 2) != b'\x05\x00':
            return False
        s.sendall(b'\x05\x01\x00\x03' + bytes([len(host)]) + host + target_port.to_bytes(2, 'big'))
        head = recv_exact(s, 4)
        if head[1] != 0:
            return False
        address = {1: 4, 4: 16}.get(head[3])
        recv_exact(s, (address if address else recv_exact(s, 1)[0]) + 2)
        s.sendall(f'GET {path} HTTP/1.1\r\nHost: {parsed.hostname}\r\nUser-Agent: tunnelguard-stability\r\n'
                  'Connection: close\r\n\r\n'.encode())
        return recv_exact(s, 9).startswith(b'HTTP/1.')


def probe_socks(link, cfg):
    for url in cfg['targets']:
        try:
            if socks_http(link.socks_port, url, cfg['timeout']):
                return True
        except (OSError, ValueError):
            continue
    return False


def parse_address(text):
    """/proc/net/tcp{,6} 'ADDR:PORT' (little-endian 32-bit words) -> (ip, port)."""
    address, port = text.split(':')
    raw = b''.join(bytes.fromhex(address[i:i + 8])[::-1] for i in range(0, len(address), 8))
    ip = ipaddress.ip_address(raw)
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return str(ip), int(port, 16)


def established(target, proc=Path('/proc/net')):
    host, port = target
    for name in ('tcp', 'tcp6'):
        try:
            lines = (Path(proc)/name).read_text().splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            fields = line.split()
            if len(fields) > 3 and fields[3] == '01':  # TCP_ESTABLISHED
                try:
                    if parse_address(fields[2]) == (host, port):
                        return True
                except ValueError:
                    continue
    return False


def unit_uptime(unit):
    """Seconds since the unit became active, or None when it is not active."""
    result = run('systemctl', 'show', '-p', 'ActiveState', '-p', 'ActiveEnterTimestampMonotonic', unit, timeout=15)
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if values.get('ActiveState') != 'active':
        return None
    try:
        return max(0.0, time.monotonic() - int(values['ActiveEnterTimestampMonotonic']) / 1e6)
    except (KeyError, ValueError):
        return None


# ---------------------------------------------------------------- watchdog

@dataclass
class Health:
    ok: bool | None = None
    failures: int = 0
    restarts: int = 0
    backoff: int = 0
    next_allowed: float = 0.0
    last_restart: float | None = None
    last_ok_wall: float | None = None
    last_restart_wall: float | None = None
    checked_wall: float | None = None


def decide(health, ok, now, cfg):
    """Record one result; return True when the link must be restarted now."""
    health.ok = ok
    if not health.backoff:
        health.backoff = cfg['cooldown']
    if ok:
        health.failures = 0
        health.last_ok_wall = time.time()
        if health.last_restart is None or now - health.last_restart >= cfg['stable']:
            health.backoff = cfg['cooldown']
        return False
    health.failures += 1
    if health.failures < cfg['failures'] or now < health.next_allowed:
        return False
    health.failures = 0
    health.restarts += 1
    health.last_restart = now
    health.last_restart_wall = time.time()
    health.next_allowed = now + health.backoff
    health.backoff = min(health.backoff * 2, cfg['max_cooldown'])
    return True


def check(link, cfg):
    if link.kind == 'socks':
        return probe_socks(link, cfg)
    if link.kind == 'initiator':
        return established(link.target)
    return None


def round_once(links, healths, cfg, restart=True):
    with ThreadPoolExecutor(max_workers=min(16, max(1, len(links)))) as pool:
        results = dict(zip([l.name for l in links], pool.map(lambda l: check(l, cfg), links)))
    for link in links:
        ok = results[link.name]
        health = healths.setdefault(link.name, Health())
        health.checked_wall = time.time()
        if ok is None:
            continue
        if not restart:
            health.ok = ok
            continue
        uptime = unit_uptime(link.unit)
        if uptime is None or uptime < cfg['grace']:
            health.ok, health.failures = (ok if uptime is not None else None), 0
            continue
        if decide(health, ok, time.monotonic(), cfg):
            log(f'{link.name}: {cfg["failures"]} failed checks; restarting {link.unit} '
                f'(restart #{health.restarts}, next allowed in {health.next_allowed - time.monotonic():.0f}s)')
            result = run('systemctl', 'restart', link.unit)
            if result.returncode != 0:
                log(f'{link.name}: restart failed: {result.stderr.strip()}')
        elif not ok:
            log(f'{link.name}: check failed ({health.failures}/{cfg["failures"]})')
    for name in list(healths):
        if name not in results:
            del healths[name]
    return results


def save_state(links, healths):
    data = {link.name: dict(method=link.method, direction=link.direction, kind=link.kind,
                            **asdict(healths.get(link.name, Health()))) for link in links}
    write_private(STATE, data)


def watch(config_path=CONFIG):
    require_root()
    cfg = load(config_path)
    healths = {}
    log(f'TunnelGuard stability watchdog {VERSION}: interval={cfg["interval"]}s failures={cfg["failures"]}')
    while True:
        started = time.monotonic()
        try:
            links = discover()
            round_once(links, healths, cfg)
            save_state(links, healths)
        except Exception as error:  # keep watching; one bad round must not stop the service
            log('round failed:', type(error).__name__, error)
        time.sleep(max(1.0, cfg['interval'] - (time.monotonic() - started)))


# ------------------------------------------------------------------ tuning

def sysctl_path(key):
    return Path('/proc/sys')/key.replace('.', '/')


def read_sysctl(key):
    try:
        return ' '.join(sysctl_path(key).read_text().split())
    except OSError:
        return None


def bbr_available():
    if 'bbr' not in (read_sysctl('net.ipv4.tcp_available_congestion_control') or '').split():
        run('modprobe', 'tcp_bbr', timeout=15)
    return 'bbr' in (read_sysctl('net.ipv4.tcp_available_congestion_control') or '').split()


def tune():
    """Apply SYSCTLS that exist on this kernel; keep the original values once."""
    require_root()
    wanted = dict(SYSCTLS)
    if not bbr_available():
        wanted.pop('net.ipv4.tcp_congestion_control')
    backup = json.loads(SYSCTL_BACKUP.read_text()) if SYSCTL_BACKUP.exists() else {}
    applied, skipped = {}, []
    for key, value in wanted.items():
        current = read_sysctl(key)
        if current is None:
            skipped.append(key)
            continue
        backup.setdefault(key, current)
        try:
            sysctl_path(key).write_text(value)
            applied[key] = value
        except OSError:
            skipped.append(key)
    write_private(SYSCTL_BACKUP, backup)
    lines = ['# Managed by TunnelGuard stability add-on; removed by "tg-stability untune".']
    lines += [f'{key} = {value}' for key, value in applied.items()]
    write_private(SYSCTL_FILE, '\n'.join(lines) + '\n', 0o644)
    if 'net.ipv4.tcp_congestion_control' in applied:
        write_private(MODULES_FILE, 'tcp_bbr\n', 0o644)
    return applied, skipped


def untune():
    require_root()
    restored = []
    if SYSCTL_BACKUP.exists():
        for key, value in json.loads(SYSCTL_BACKUP.read_text()).items():
            try:
                sysctl_path(key).write_text(value)
                restored.append(key)
            except OSError:
                pass
        SYSCTL_BACKUP.unlink()
    SYSCTL_FILE.unlink(missing_ok=True)
    MODULES_FILE.unlink(missing_ok=True)
    return restored


def tuned():
    return SYSCTL_FILE.exists()


# ----------------------------------------------------------------- service

def install(with_tuning=True):
    require_root()
    INSTALL_DIR.mkdir(mode=0o755, parents=True, exist_ok=True)
    target = INSTALL_DIR/'stability.py'
    if HERE != target.resolve():
        shutil.copyfile(HERE, target)
    target.chmod(0o755)
    if not CONFIG.exists():
        write_private(CONFIG, DEFAULT_CONFIG)
    python = shutil.which('python3') or '/usr/bin/python3'
    UNIT.write_text(f'''[Unit]
Description=TunnelGuard stability watchdog
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
ExecStart={python} {target} watch
Restart=always
RestartSec=10
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
StateDirectory=tunnelguard-stability
StateDirectoryMode=0700

[Install]
WantedBy=multi-user.target
''', encoding='utf-8')
    UNIT.chmod(0o644)
    LAUNCHER.write_text(f'#!/bin/sh\nexec {python} {target} "$@"\n', encoding='utf-8')
    LAUNCHER.chmod(0o755)
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    for command in (('daemon-reload',), ('enable', UNIT.name), ('restart', UNIT.name)):
        result = run('systemctl', *command)
        if result.returncode != 0:
            raise RuntimeError(f'systemctl {" ".join(command)} failed: {result.stderr.strip()}')
    return tune() if with_tuning else None


def uninstall():
    require_root()
    if UNIT.exists():
        run('systemctl', 'disable', '--now', UNIT.name)
        UNIT.unlink()
        run('systemctl', 'daemon-reload')
    untune()
    LAUNCHER.unlink(missing_ok=True)
    shutil.rmtree(INSTALL_DIR, ignore_errors=True)
    shutil.rmtree(CONFIG_DIR, ignore_errors=True)
    shutil.rmtree(STATE_DIR, ignore_errors=True)


def watchdog_running():
    return run('systemctl', 'is-active', '--quiet', UNIT.name, timeout=15).returncode == 0


# ------------------------------------------------------------------ report

def report(lang, live=False, config_path=CONFIG):
    t = TEXT[lang]
    links = discover()
    if live:
        healths = {}
        round_once(links, healths, load(config_path), restart=False)
    else:
        try:
            stored = json.loads(STATE.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            stored = {}
        healths = {name: Health(**{k: v for k, v in item.items() if k in Health.__dataclass_fields__})
                   for name, item in stored.items()}
    if not links:
        print('  ' + t['no_links'])
    for link in links:
        h = healths.get(link.name, Health())
        if link.kind == 'none':
            state = t['not_watched']
        else:
            state = t['waiting'] if h.ok is None else t['healthy'] if h.ok else t['broken']
        last = time.strftime('%m-%d %H:%M', time.localtime(h.last_restart_wall)) if h.last_restart_wall else '-'
        print(f'  {link.name:<24} {link.method + "/" + link.direction:<18} {state}   '
              f'{t["restarts"]}: {h.restarts}  {t["last"]}: {last}')


def menu(lang='fa', config_path=CONFIG):
    require_root()
    t = TEXT[lang]
    while True:
        role = server_role()
        print()
        print(t['title'], f'v{VERSION}')
        print(f"{t['role']}: {t[role] if role else t['unknown']}")
        print(f"{t['watchdog']}: {t['on'] if watchdog_running() else t['off']}   "
              f"{t['tuning']}: {t['applied'] if tuned() else t['not_applied']}")
        print(t['links'] + ':')
        report(lang, config_path=config_path)
        for number, key in enumerate(('check', 'install', 'tune', 'untune', 'uninstall'), 1):
            print(f'  {number}) {t[key]}')
        print(f'  0) {t["exit"]}')
        try:
            choice = input('> ').strip()
            if choice == '0':
                return 0
            if choice == '1':
                report(lang, live=True, config_path=config_path)
            elif choice == '2':
                install()
                print(t['done'])
            elif choice == '3':
                tune()
                print(t['done'])
            elif choice == '4':
                untune()
                print(t['done'])
            elif choice == '5':
                if input(t['confirm']).strip().lower() in ('y', 'yes'):
                    uninstall()
                    print(t['done'])
                    return 0
            else:
                print(t['bad'])
        except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
            print(t['failed'] + ':', error)
        except (EOFError, KeyboardInterrupt):
            print()
            return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description='TunnelGuard add-on: link watchdog and network tuning.')
    parser.add_argument('--version', action='version', version=VERSION)
    parser.add_argument('--lang', choices=['fa', 'en'], default='fa')
    parser.add_argument('--config', type=Path, default=CONFIG, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest='command')
    sub.add_parser('menu', help='interactive menu (default)')
    sub.add_parser('status', help='links, restarts, watchdog and tuning state')
    sub.add_parser('check', help='test every link now; restarts nothing')
    sub.add_parser('watch', help='run the watchdog in the foreground (used by the service)')
    p = sub.add_parser('install', help='install the watchdog service and the tg-stability command')
    p.add_argument('--no-tune', action='store_true', help='do not change kernel network settings')
    sub.add_parser('tune', help='apply network tuning')
    sub.add_parser('untune', help='restore the network settings saved before tuning')
    sub.add_parser('uninstall', help='remove service, command, tuning and state')
    a = parser.parse_args(argv)
    command = a.command or 'menu'
    try:
        if command == 'menu':
            return menu(a.lang, a.config)
        if command == 'watch':
            watch(a.config)
        elif command in ('status', 'check'):
            require_root()
            print(f'role={server_role()} watchdog={watchdog_running()} tuning={tuned()}')
            report(a.lang, live=command == 'check', config_path=a.config)
        elif command == 'install':
            result = install(not a.no_tune)
            print('Installed. Open the menu with: sudo tg-stability')
            if result:
                print('Tuned:', ', '.join(result[0]) or '-')
                if result[1]:
                    print('Not available on this kernel:', ', '.join(result[1]))
        elif command == 'tune':
            applied, skipped = tune()
            print('Tuned:', ', '.join(applied) or '-')
            if skipped:
                print('Not available on this kernel:', ', '.join(skipped))
        elif command == 'untune':
            print('Restored:', ', '.join(untune()) or '-')
        elif command == 'uninstall':
            uninstall()
            print('Removed')
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        print('Failed:', error, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
