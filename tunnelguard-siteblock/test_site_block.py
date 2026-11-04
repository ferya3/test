"""Offline tests for site_block.py; no root, iptables or network needed."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import site_block as sb


def config(**changes):
    cfg = dict(sb.DEFAULT_CONFIG, categories=list(sb.CATEGORIES))
    cfg.update(changes)
    return sb.validate(cfg)


class DomainTests(unittest.TestCase):
    def test_normalizes_urls_www_case_and_ports(self):
        for value in ('Example.ORG', 'www.example.org', 'https://www.example.org/a?b',
                      'example.org:8443', 'example.org.'):
            self.assertEqual(sb.normalize_domain(value), 'example.org')

    def test_unicode_domain_becomes_punycode(self):
        self.assertEqual(sb.normalize_domain('ایران.ir'), 'xn--mgba3a4f16a.ir')

    def test_rejects_invalid_names(self):
        for value in ('', 'localhost', 'a..b.com', '-a.com', 'a b.com', '1.2.3.4',
                      'x' * 120 + '.com', 'site.com"; rm -rf /'):
            with self.assertRaises(ValueError, msg=value):
                sb.normalize_domain(value)


class ExplainTests(unittest.TestCase):
    def test_categories_block_domains_and_subdomains(self):
        cfg = config()
        for host in ('instagram.com', 'i.instagram.com', 'scontent.cdninstagram.com',
                     'x.com', 'api.x.com', 't.co', 'youtu.be', 'rr1.googlevideo.com',
                     'www.pornhub.com', 'xvideos.com', 'beeg.com', 'site.xxx'):
            self.assertIsNotNone(sb.explain(cfg, host), host)

    def test_similar_names_are_not_blocked(self):
        cfg = config()
        for host in ('dropbox.com', 'netflix.com', 'microsoft.com', 'google.com',
                     'wikipedia.org', 'essex.ac.uk', 'max.com', 'ex.com'):
            self.assertIsNone(sb.explain(cfg, host), host)

    def test_only_selected_categories_and_custom(self):
        cfg = config(categories=['instagram'], custom=['example.org'])
        self.assertIsNotNone(sb.explain(cfg, 'www.instagram.com'))
        self.assertIsNotNone(sb.explain(cfg, 'a.example.org'))
        self.assertIsNone(sb.explain(cfg, 'youtube.com'))
        self.assertIsNone(sb.explain(cfg, 'pornhub.com'))

    def test_disabled_blocks_nothing(self):
        self.assertIsNone(sb.explain(config(enabled=False), 'instagram.com'))


class RuleTests(unittest.TestCase):
    def test_wire_patterns(self):
        self.assertEqual(sb.sni_pattern('x.com'), '|000005|x.com')
        self.assertEqual(sb.dns_pattern('x.com'), '|01|x|03|com|00|')

    def test_rules_cover_tls_http_dns_and_quic(self):
        text = sb.restore_text(config(categories=['twitter']))
        self.assertTrue(text.startswith('*filter\n') and text.endswith('COMMIT\n'))
        for chain in sb.CHAINS:
            self.assertIn(f':{chain} - [0:0]', text)
        self.assertIn('--hex-string "|000005|x.com"', text)
        self.assertIn('--string ".x.com"', text)
        self.assertIn('--hex-string "Host: x.com|0d0a|"', text)
        self.assertIn('--hex-string "|01|x|03|com|00|"', text)
        self.assertIn('-p udp --dport 443 -j REJECT', text)
        self.assertIn('-o lo -j RETURN', text)
        # tcp-reset is only accepted by iptables in rules that match TCP.
        for line in text.splitlines():
            if 'tcp-reset' in line:
                self.assertIn('-p tcp', line)

    def test_quic_can_stay_open(self):
        self.assertNotIn('--dport 443 -j REJECT', sb.restore_text(config(block_quic=False)))

    def test_empty_or_disabled_has_no_rules(self):
        for cfg in (config(categories=[]), config(enabled=False)):
            text = sb.restore_text(cfg)
            self.assertNotIn('-A ', text)

    def test_patterns_fit_kernel_limit(self):
        # xt_string accepts at most 128 pattern bytes; the longest pattern is
        # the HTTP one: "Host: " + domain + CRLF.
        longest = 'a' * 60 + '.' + 'b' * 35 + '.com'
        self.assertEqual(len(sb.normalize_domain(longest)), sb.MAX_DOMAIN)
        self.assertLessEqual(len('Host: ' + longest + '\r\n'), 128)
        with self.assertRaises(ValueError):
            sb.normalize_domain('a' + longest)


class DiagnoseTests(unittest.TestCase):
    def test_instagram_media_on_fbcdn_is_blocked_but_facebook_media_is_not(self):
        cfg = config(categories=['instagram'])
        self.assertIsNotNone(sb.explain(cfg, 'instagram.fist1-1.fna.fbcdn.net'))
        self.assertIsNone(sb.explain(cfg, 'scontent.xx.fbcdn.net'))
        self.assertIsNone(sb.explain(cfg, 'media.whatsapp.net'))

    def test_adds_blocking(self):
        off = config(categories=[])
        insta = config(categories=['instagram'])
        self.assertTrue(sb.adds_blocking(off, insta))
        self.assertFalse(sb.adds_blocking(insta, insta))
        self.assertFalse(sb.adds_blocking(insta, off))
        self.assertTrue(sb.adds_blocking(insta, config(categories=['instagram'], custom=['a.com'])))
        self.assertTrue(sb.adds_blocking(config(categories=['instagram'], block_quic=False), insta))
        self.assertTrue(sb.adds_blocking(config(categories=['instagram'], enabled=False), insta))
        self.assertFalse(sb.adds_blocking(insta, config(categories=['instagram'], enabled=False)))

    def test_xray_outbounds_that_hide_traffic(self):
        with tempfile.TemporaryDirectory() as folder:
            first = Path(folder)/'a.json'
            first.write_text(json.dumps({'outbounds': [
                {'protocol': 'freedom', 'tag': 'direct', 'settings': {'fragment': {'packets': 'tlshello'}}},
                {'protocol': 'wireguard', 'tag': 'warp'},
                {'protocol': 'vless', 'tag': 'next-hop'},
                {'protocol': 'blackhole', 'tag': 'blocked'}]}))
            second = Path(folder)/'b.json'
            second.write_text(json.dumps({'outbounds': [{'protocol': 'wireguard', 'tag': 'all-warp'}]}))
            broken = Path(folder)/'c.json'
            broken.write_text('{not json')
            kinds = [(k, tag) for k, tag, _ in sb.xray_findings([str(first), str(second), str(broken),
                                                                 str(Path(folder)/'missing.json')])]
            self.assertEqual(kinds, [('fragment', 'direct'), ('warp', 'warp'), ('chain', 'next-hop'),
                                     ('default', 'all-warp')])

    def test_plain_xray_config_has_no_findings(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'x.json'
            path.write_text(json.dumps({'outbounds': [{'protocol': 'freedom', 'tag': 'direct'},
                                                      {'protocol': 'blackhole', 'tag': 'blocked'}]}))
            self.assertEqual(sb.xray_findings([str(path)]), [])

    def test_reset_without_ss_reports_none(self):
        with mock.patch.object(sb.shutil, 'which', return_value=None):
            self.assertIsNone(sb.reset_connections())

    def test_reset_falls_back_and_counts(self):
        results = [mock.Mock(returncode=1, stdout=''), mock.Mock(returncode=0, stdout='a\nb\n\n')]
        with mock.patch.object(sb.shutil, 'which', return_value='/usr/bin/ss'), \
                mock.patch.object(sb, 'run', side_effect=results) as run:
            self.assertEqual(sb.reset_connections(), 2)
        self.assertIn('not dst 127.0.0.0/8', run.call_args_list[0].args[-1])
        self.assertEqual(run.call_args_list[1].args[-1], '( dport = :443 or dport = :80 )')


class ConfigTests(unittest.TestCase):
    def test_round_trip_is_private_and_normalized(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'sub'/'config.json'
            self.assertEqual(sb.load(path), sb.DEFAULT_CONFIG)
            saved = sb.save(dict(categories=['porn', 'instagram'], custom=['WWW.A.com', 'a.com']), path)
            self.assertEqual(saved['categories'], ['instagram', 'porn'])
            self.assertEqual(saved['custom'], ['a.com'])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(sb.load(path), saved)

    def test_rejects_bad_values(self):
        for bad in (dict(categories=['facebook']), dict(enabled='yes'), dict(custom='a.com'),
                    dict(custom=['not a domain']), []):
            with self.assertRaises(ValueError, msg=json.dumps(bad)):
                sb.validate(bad)


if __name__ == '__main__':
    unittest.main()
