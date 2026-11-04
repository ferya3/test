# Site blocking on the server — TunnelGuard add-on

[فارسی](README.fa.md)

Block **Instagram, YouTube, Twitter/X, adult sites** and any custom domain on a server. The add-on is fully standalone:

- It does not import, change or restart any TunnelGuard file or service.
- It owns only its own iptables chains (`TG_SITEBLOCK`, `TG_SB_*`), one config file and one systemd unit.
- Uninstalling it leaves nothing behind.

## Which server?

**The outside server (role 2).** That is where user traffic leaves to the Internet. The Iran server only sees encrypted tunnel traffic. The menu detects the role and warns when it runs on the Iran side.

## Install

Requirements: Ubuntu with systemd, root, Python 3.11+, iptables. Copy `site_block.py` to the outside server, then run:

```bash
sudo python3 site_block.py install
```

```bash
sudo tg-siteblock
```

`install` copies the program to `/opt/tunnelguard-siteblock`, adds the `tunnelguard-siteblock` service (rules survive reboots), and creates the `tg-siteblock` command. Running `tg-siteblock` without arguments opens the menu (`--lang en` for English). Each toggle applies immediately.

## Commands

| Command | Purpose |
|---|---|
| `enable instagram youtube twitter porn` | Block categories |
| `disable youtube` | Unblock a category |
| `add tiktok.com` / `remove tiktok.com` | Custom domains (subdomains included) |
| `quic on` / `quic off` | Reject QUIC (UDP 443) so that the site name is visible |
| `on` / `off` | Enable / disable the filter; `off` keeps the settings |
| `status` | Settings, active rules and blocked counters |
| `check DOMAIN` | Show whether and why a name is blocked |
| `rules` | Print the generated `iptables-restore` input; changes nothing |
| `diagnose` | Explain why a blocked site still opens (role, IPv4/IPv6 rules, QUIC, live SNI and DNS test, Xray WARP/chain/fragment outbounds) |
| `reset` | Close open web connections so that apps reconnect through the filter |
| `uninstall` | Remove rules, service, command and configuration |

## How it works

Only the first 8 KiB of each new connection are inspected:

- **TLS SNI** on TCP 443 → TCP reset.
- **HTTP `Host`** on TCP 80 → TCP reset.
- **DNS question names** on port 53 → rejected.
- **QUIC** (UDP 443), whose name is not readable → optionally rejected, so clients fall back to TCP.

Rules hook `OUTPUT` (local cores: x-ui/Xray, sing-box, SSH, Chisel) and `FORWARD` (routed WireGuard/GRE traffic), for IPv4 and IPv6. Loopback is skipped. Rules are replaced atomically with `iptables-restore --noflush`.

## A blocked site still opens?

Run `sudo tg-siteblock diagnose` on the outside server.

Apps such as Instagram keep one connection open for a long time, and only new connections carry the site name. Since 1.1, adding a block closes the server's open web connections (`ss -K`), so apps reconnect through the filter. Run `reset` to do this manually, or pass `--keep-connections` to skip it.

If Xray sends traffic through WARP, another server or a `fragment` outbound, the name is hidden. In that case block it in Xray instead: in 3x-ui, open Routing Rules, then add Domain `geosite:instagram` → Outbound `blocked`.

## Limitations

- **Blocking QUIC disables HTTP/3 for every site.** Sites fall back to HTTP/2. Turn it off if this server reaches a Hysteria2 endpoint on UDP 443.
- **It can be bypassed.** ECH, a VPN inside your service, or a fragmented ClientHello can get around the filter.
- **The adult list is keyword-based** (`porn`, `xvideos`, `hentai`, …), plus about 50 domains and the `.xxx`, `.adult` and `.sex` TLDs. Add missing sites as custom domains.
- **Only Instagram's `fbcdn.net` hosts are blocked.** Names that contain `instagram` (for example `instagram.fist1-1.fna.fbcdn.net`) are blocked; the rest of `fbcdn.net` stays open for Facebook and WhatsApp.
- **Reapply after a firewall rebuild.** If another tool rebuilds `OUTPUT`, run:

```bash
sudo systemctl reload tunnelguard-siteblock
```

## Tests

```bash
python3 -m unittest -v test_site_block
```

The tests need no root, iptables or network.
