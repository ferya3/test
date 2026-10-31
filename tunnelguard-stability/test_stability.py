"""Offline tests for stability.py; no root, systemd or Internet needed."""
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest import mock

import stability as st

CFG = st.validate({})


def plan(name='link-a', method='chisel', direction='direct', slot=3):
    return dict(name=name, method=method, direction=direction, slot=slot, iran='192.0.2.10',
                exit='198.51.100.20', port=23000 + slot * 10, socks_port=30000 + slot, ssh_port=2222)


class FakeSocks:
    """Minimal SOCKS5 server answering every CONNECT with an HTTP 204 (or a failure)."""

    def __init__(self, reply=0, http=True):
        self.reply, self.http, self.requests = reply, http, []
        self.server = socket.socket()
        self.server.bind(('127.0.0.1', 0))
        self.server.listen(8)
        self.port = self.server.getsockname()[1]
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while True:
            try:
                conn, _ = self.server.accept()
            except OSError:
                return
            with conn:
                try:
                    conn.recv(3)
                    conn.sendall(b'\x05\x00')
                    head = conn.recv(5)
                    rest = conn.recv(head[4] + 2)
                    self.requests.append(rest[:-2].decode())
                    conn.sendall(bytes([5, self.reply, 0, 1, 0, 0, 0, 0, 0, 0]))
                    if self.reply == 0 and self.http:
                        conn.recv(4096)
                        conn.sendall(b'HTTP/1.1 204 No Content\r\n\r\n')
                except OSError:
                    pass

    def close(self):
        self.server.close()


class ConfigTests(unittest.TestCase):
    def test_defaults_valid(self):
        self.assertEqual(st.validate({}), st.DEFAULT_CONFIG)

    def test_rejects_bad_values(self):
        for bad in (dict(interval=1), dict(failures='3'), dict(timeout=30, interval=20),
                    dict(targets=['https://a.com']), dict(targets=[]), dict(targets=['http://a b']), []):
            with self.assertRaises(ValueError, msg=repr(bad)):
                st.validate(bad)


class LinkTests(unittest.TestCase):
    def test_iran_side_probes_every_link_end_to_end(self):
        for method in st_methods():
            for direction in ('direct', 'reverse'):
                link = st.make_link(plan(method=method, direction=direction), 'iran')
                self.assertEqual((link.kind, link.socks_port), ('socks', 30003))

    def test_outside_checks_only_links_it_initiates_over_tcp(self):
        cases = {
            ('ssh', 'reverse'): ('192.0.2.10', 2222),
            ('chisel', 'reverse'): ('192.0.2.10', 23030),
            ('rathole', 'reverse'): ('192.0.2.10', 23031),
            ('gre', 'reverse'): ('10.203.3.1', 23030),
            ('wireguard', 'reverse'): None,
            ('spoof', 'reverse'): None,
            ('chisel', 'direct'): None,
        }
        for (method, direction), target in cases.items():
            link = st.make_link(plan(method=method, direction=direction), 'exit')
            self.assertEqual(link.target, target, (method, direction))
            self.assertEqual(link.kind, 'initiator' if target else 'none')

    def test_unit_name(self):
        self.assertEqual(st.make_link(plan(), 'iran').unit, 'tunnelguard-link-link-a.service')

    def test_rejects_bad_manifests(self):
        for bad, role in ((plan(name='../x'), 'iran'), (plan(), 'other'), (dict(plan(), socks_port='1'), 'iran')):
            with self.assertRaises(ValueError):
                st.make_link(bad, role)

    def test_discover_skips_links_that_are_not_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)/'tunnels'
            for name in ('ready-one', 'busy-one', 'mismatch'):
                (root/name).mkdir(parents=True)
                (root/name/'plan.json').write_text(json.dumps(plan(name=name if name != 'mismatch' else 'other')))
                (root/name/'role').write_text('iran\n')
            state = Path(folder)/'state.json'
            state.write_text(json.dumps({'links': {'ready-one': {'phase': 'ready'},
                                                   'busy-one': {'phase': 'local-install'}}}))
            self.assertEqual([l.name for l in st.discover(root, state)], ['ready-one'])
            # Without the controller state nothing on the Iran side is touched.
            self.assertEqual(st.discover(root, Path(folder)/'missing.json'), [])
            self.assertEqual(st.discover(Path(folder)/'none', state), [])


def st_methods():
    return ('ssh', 'chisel', 'rathole', 'wireguard', 'paqet', 'spoof', 'ipip', 'gre', 'vxlan')


class ProbeTests(unittest.TestCase):
    def test_http_through_socks(self):
        server = FakeSocks()
        try:
            self.assertTrue(st.socks_http(server.port, 'http://cp.cloudflare.com/generate_204', 3))
            self.assertEqual(server.requests, ['cp.cloudflare.com'])
        finally:
            server.close()

    def test_socks_refusal_and_dead_port_fail(self):
        server = FakeSocks(reply=5)
        try:
            link = st.Link('a', 'iran', 'chisel', 'direct', server.port, 'socks')
            self.assertFalse(st.probe_socks(link, CFG))
        finally:
            server.close()
        dead = socket.socket()
        dead.bind(('127.0.0.1', 0))
        port = dead.getsockname()[1]
        dead.close()
        self.assertFalse(st.probe_socks(st.Link('a', 'iran', 'chisel', 'direct', port, 'socks'), CFG))

    def test_silent_tunnel_times_out_as_failure(self):
        server = FakeSocks(http=False)
        try:
            link = st.Link('a', 'iran', 'chisel', 'direct', server.port, 'socks')
            self.assertFalse(st.probe_socks(link, dict(CFG, timeout=1, targets=CFG['targets'][:1])))
        finally:
            server.close()

    def test_established_parses_proc_net(self):
        header = '  sl  local_address rem_address   st\n'
        tcp = header + '   0: 0100007F:1F90 0A0200C0:5A3E 01 x\n   1: 0100007F:1F91 0A0200C0:5A3F 0A x\n'
        tcp6 = header + '   0: 00000000000000000000000001000000:1F90 0000000000000000FFFF00000103CB0A:5A48 01 x\n'
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'tcp').write_text(tcp)
            Path(folder, 'tcp6').write_text(tcp6)
            self.assertTrue(st.established(('192.0.2.10', 23102), folder))      # 0x5A3E, ESTABLISHED
            self.assertFalse(st.established(('192.0.2.10', 23103), folder))     # 0x5A3F, LISTEN only
            self.assertTrue(st.established(('10.203.3.1', 23112), folder))      # IPv4-mapped in tcp6
            self.assertFalse(st.established(('192.0.2.11', 23102), folder))


class DecisionTests(unittest.TestCase):
    def test_restart_after_consecutive_failures_with_growing_cooldown(self):
        h, now = st.Health(), 1000.0
        self.assertFalse(st.decide(h, False, now, CFG))
        self.assertFalse(st.decide(h, False, now + 20, CFG))
        self.assertTrue(st.decide(h, False, now + 40, CFG))          # third failure
        self.assertEqual((h.restarts, h.backoff), (1, 120))
        for step in (60, 80):                                        # inside 60 s cooldown
            st.decide(h, False, now + step, CFG)
        self.assertFalse(st.decide(h, False, now + 90, CFG))
        self.assertTrue(st.decide(h, False, now + 100, CFG))         # cooldown elapsed
        self.assertEqual((h.restarts, h.backoff), (2, 240))

    def test_success_resets_failures_and_long_stability_resets_cooldown(self):
        h, now = st.Health(), 0.0
        for i in range(3):
            st.decide(h, False, now + i, CFG)
        self.assertEqual(h.backoff, 120)
        st.decide(h, False, now + 10, CFG)
        st.decide(h, True, now + 20, CFG)
        self.assertEqual(h.failures, 0)
        self.assertEqual(h.backoff, 120)                             # not yet stable
        st.decide(h, True, now + 2 + CFG['stable'], CFG)
        self.assertEqual(h.backoff, CFG['cooldown'])

    def test_cooldown_is_capped(self):
        h = st.Health()
        now = 0.0
        for _ in range(40):
            now += 10_000
            for _ in range(3):
                st.decide(h, False, now, CFG)
        self.assertEqual(h.backoff, CFG['max_cooldown'])

    def test_round_restarts_stuck_link_only(self):
        good, bad = FakeSocks(), FakeSocks(reply=1)
        links = [st.Link('good', 'iran', 'chisel', 'direct', good.port, 'socks'),
                 st.Link('bad', 'iran', 'chisel', 'direct', bad.port, 'socks'),
                 st.Link('other', 'exit', 'wireguard', 'reverse', 1, 'none')]
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(args)
            return mock.Mock(returncode=0, stderr='')
        healths = {}
        cfg = dict(CFG, targets=CFG['targets'][:1], timeout=2)
        try:
            with mock.patch.object(st, 'unit_uptime', return_value=3600), mock.patch.object(st, 'run', fake_run), \
                    mock.patch.object(st, 'log'):
                for _ in range(3):
                    st.round_once(links, healths, cfg)
        finally:
            good.close()
            bad.close()
        self.assertEqual(calls, [('systemctl', 'restart', 'tunnelguard-link-bad.service')])
        self.assertTrue(healths['good'].ok)
        self.assertFalse(healths['bad'].ok)
        self.assertEqual(healths['bad'].restarts, 1)

    def test_recently_started_link_is_left_alone(self):
        bad = FakeSocks(reply=1)
        link = st.Link('bad', 'iran', 'chisel', 'direct', bad.port, 'socks')
        healths = {}
        try:
            with mock.patch.object(st, 'unit_uptime', return_value=5), mock.patch.object(st, 'run') as run:
                for _ in range(5):
                    st.round_once([link], healths, dict(CFG, targets=CFG['targets'][:1]))
        finally:
            bad.close()
        run.assert_not_called()
        self.assertEqual(healths['bad'].failures, 0)


class TuningTests(unittest.TestCase):
    def test_port_range_never_changed(self):
        self.assertNotIn('net.ipv4.ip_local_port_range', st.SYSCTLS)

    def test_tune_and_untune_restore_original_values(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = Path(folder)/'proc'
            for key in st.SYSCTLS:
                path = proc/key.replace('.', '/')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('old\n')
            (proc/'net/ipv4/tcp_available_congestion_control').write_text('reno cubic\n')
            (proc/'net/netfilter/nf_conntrack_max').unlink()
            patches = dict(sysctl_path=lambda key: proc/key.replace('.', '/'),
                           SYSCTL_BACKUP=Path(folder)/'state/backup.json',
                           SYSCTL_FILE=Path(folder)/'sysctl.conf', MODULES_FILE=Path(folder)/'modules.conf',
                           require_root=lambda: None, run=mock.Mock())
            with mock.patch.multiple(st, **patches):
                applied, skipped = st.tune()
                self.assertNotIn('net.ipv4.tcp_congestion_control', applied)   # no BBR on this kernel
                self.assertIn('net.netfilter.nf_conntrack_max', skipped)
                self.assertEqual((proc/'net/ipv4/tcp_mtu_probing').read_text(), '1')
                self.assertIn('net.ipv4.tcp_mtu_probing = 1', Path(folder, 'sysctl.conf').read_text())
                self.assertFalse(Path(folder, 'modules.conf').exists())
                st.tune()                                                       # backup keeps first values
                st.untune()
                self.assertEqual((proc/'net/ipv4/tcp_mtu_probing').read_text(), 'old')
                self.assertFalse(Path(folder, 'sysctl.conf').exists())


if __name__ == '__main__':
    unittest.main()
