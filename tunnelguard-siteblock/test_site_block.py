"""Offline tests for site_block.py; no root, iptables or network needed."""
import json
from pathlib import Path
import tempfile
import unittest

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
