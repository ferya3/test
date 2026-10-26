# پنل تانل

پنل وب برای مدیریت کاربرهای تانل (سرور ایران ← HAProxy ← Xray Reality روی سرورهای خارج).

- ساخت، ویرایش، غیرفعال کردن و حذف کاربر
- سقف حجم و تاریخ انقضا؛ کاربری که منقضی شود یا حجمش تمام شود خودکار قطع می‌شود
- مصرف هر کاربر از همه‌ی سرورهای خارج جمع می‌شود
- لینک اتصال و QR کد هر کاربر
- وضعیت Xray روی همه‌ی سرورهای خارج

پنل روی **خارج ۱** اجرا می‌شود. لیست کاربرها در دیتابیس پنل نگه داشته می‌شود، کانفیگ Xray از روی آن ساخته می‌شود و
روی سرورهای `/etc/tun-peers` کپی می‌شود. فقط با پایتون استاندارد کار می‌کند و چیزی برای نصب با pip ندارد.

## نصب روی خارج ۱

پیش‌نیاز: `/root/tunnel.env`، Xray و (برای چند سرور) `/etc/tun-peers` با دسترسی SSH بدون رمز به بقیه‌ی سرورها.

```bash
curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/great-tesla-sn3awj/tunnel/panel/install.sh -o /root/tunpanel-install.sh
bash /root/tunpanel-install.sh
```

آدرس و رمز پنل در انتهای خروجی چاپ می‌شود. اجرای دوباره‌ی همین دو خط، کد را به‌روز می‌کند و رمز و کاربرها دست نمی‌خورند.

## دسترسی از طریق سرور ایران

پنل روی پورت 2096 خارج ۱ فقط به IP سرور ایران باز است. روی سرور ایران:

```bash
F1=82.115.25.8   # IP خارج ۱
grep -q '^frontend panel' /etc/haproxy/haproxy.cfg || {
  awk -v f1="$F1" '/^frontend relay/ && !done {print "frontend panel\n    bind :2096\n    default_backend panel\n\nbackend panel\n    server f1 " f1 ":2096 check\n"; done=1} {print}' /etc/haproxy/haproxy.cfg > /etc/haproxy/haproxy.cfg.new &&
  haproxy -c -f /etc/haproxy/haproxy.cfg.new &&
  cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak &&
  mv /etc/haproxy/haproxy.cfg.new /etc/haproxy/haproxy.cfg &&
  systemctl reload haproxy
}
ufw allow 2096/tcp
```

بعد `https://IP-سرور-ایران:2096` را در مرورگر باز کنید. گواهی پنل خودامضاست، پس مرورگر یک بار هشدار می‌دهد.

## دستورها روی خارج ۱

| کار | دستور |
|---|---|
| تغییر رمز | `tunpanel passwd رمز-جدید` |
| وضعیت | `systemctl status tunpanel` |
| لاگ | `journalctl -u tunpanel -n 50` |
