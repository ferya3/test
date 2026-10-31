# Tunnel stability — TunnelGuard add-on

[فارسی](README.fa.md)

The add-on does two things:

1. **Watchdog:** finds stuck links and restarts them automatically.
2. **Network tuning:** reversible kernel settings for long-lived tunnels over lossy paths.

It changes no TunnelGuard file. It only reads the link manifests and restarts the existing `tunnelguard-link-*` units.

## Why

systemd restarts a link only when its process exits. A carrier that stays alive but passes no traffic is never restarted. Typical causes are NAT timeouts, packet loss, DPI resets, or a Chisel client waiting in a back-off of up to 5 minutes. The panel tests a link only when someone presses "Test".

## Watchdog

- **Iran side:** every 20 s, a real HTTP request goes through each link's SOCKS port, the tunnel and the outside server. This covers every method and both directions.
- **Outside side:** for links the outside server initiates (reverse direction over SSH, Chisel, Rathole, IPIP, GRE or VXLAN), it checks that the connection to Iran is `ESTABLISHED`.
- **Restarts:** after 3 consecutive failures the unit is restarted. The cooldown doubles on repeated restarts (1 → 2 → 4 … ≤ 15 min) and resets after 10 healthy minutes.
- **Skipped:** links that started less than 60 s ago, and links being installed or removed by the panel.

Install it on **both** servers.

## Tuning

- BBR + fq.
- `tcp_mtu_probing=1`.
- 60 s TCP keepalive.
- No slow start after idle.
- Larger buffers and backlogs, and `nf_conntrack_max`.

Previous values are saved and restored exactly by `untune`. `ip_local_port_range` is deliberately left alone, because TunnelGuard listens on fixed ports inside the wider ranges.

## Install

```bash
sudo python3 stability.py install
```

```bash
sudo tg-stability
```

Use `install --no-tune` to skip kernel settings.

Other commands:

| Command | Purpose |
|---|---|
| `status` | Links, restart counts, watchdog state |
| `check` | Test all links now (no restarts) |
| `tune` / `untune` | Apply or revert network tuning |
| `uninstall` | Remove everything, including tuning |

Logs:

```bash
sudo journalctl -u tunnelguard-stability -f
```

Settings live in `/etc/tunnelguard-stability/config.json`: `interval`, `timeout`, `failures`, `grace`, `cooldown`, `max_cooldown`, `stable`, `targets`.

## Limitations

- Restarting cannot fix a blocked path; it only makes recovery fast. Keep more than one link so TunnelGuard can fail over.
- On the outside server, WireGuard, Paqet and Spoof links have no connection check. The Iran-side end-to-end probe covers them.
- A restart drops in-flight sessions on that link.
- Legacy `deploy.py` routes are not watched.

## Tests

```bash
python3 -m unittest -v test_stability
```

The tests need no root, systemd or Internet.
