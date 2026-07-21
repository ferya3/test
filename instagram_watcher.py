#!/usr/bin/env python3
"""
Instagram username availability watcher.

این ابزار فقط «بررسی» می‌کند که آیا یک یا چند آیدی مشخص اینستاگرام آزاد شده‌اند یا نه،
و اگر آزاد شد فقط به شما «اطلاع» می‌دهد. هیچ اکانتی نمی‌سازد و هیچ کار خودکاری روی
اینستاگرام انجام نمی‌دهد. ساخت نهایی اکانت باید دستی و توسط خودتان انجام شود.

Notes on responsible use:
- این اسکریپت فقط صفحه‌ی عمومی پروفایل را می‌خواند (مثل باز کردن آدرس در مرورگر).
- فاصله‌ی زمانی بین چک‌ها عمداً بلند و همراه با jitter است تا فشار بی‌مورد به سرور
  وارد نشود و به rate-limit نخورید. لطفاً آن را خیلی کوتاه نکنید.
- تعداد آیدی‌های تحت نظر را کم نگه دارید (چند تا، نه انبوه).
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

PROFILE_URL = "https://www.instagram.com/{username}/"

# یک User-Agent شبیه مرورگر واقعی تا درخواست عادی به نظر برسد.
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
}

# مقادیر ممکن برای وضعیت هر آیدی
STATUS_AVAILABLE = "available"   # 404 → احتمالاً آزاد
STATUS_TAKEN = "taken"           # 200 → گرفته شده
STATUS_UNKNOWN = "unknown"       # نامشخص / خطای موقت / rate-limit


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def valid_username(name: str) -> bool:
    """قوانین ساده‌ی یوزرنیم اینستاگرام: حروف، اعداد، نقطه و آندرلاین، حداکثر ۳۰ کاراکتر."""
    name = name.strip()
    if not (1 <= len(name) <= 30):
        return False
    return all(c.isalnum() or c in "._" for c in name)


def check_username(session: requests.Session, username: str, timeout: int = 15) -> str:
    """
    وضعیت یک آیدی را برمی‌گرداند: available / taken / unknown

    منطق: صفحه‌ی عمومی پروفایل درخواست می‌شود.
      - 404  → پروفایلی وجود ندارد → احتمالاً آزاد
      - 200  → پروفایل وجود دارد → گرفته شده
      - 429  → rate-limit → نامشخص (باید صبر کرد)
      - سایر → نامشخص
    """
    url = PROFILE_URL.format(username=username)
    try:
        resp = session.get(url, headers=DEFAULT_HEADERS, timeout=timeout, allow_redirects=True)
    except requests.RequestException as exc:
        log(f"⚠️  خطای شبکه هنگام چک '{username}': {exc}")
        return STATUS_UNKNOWN

    if resp.status_code == 404:
        return STATUS_AVAILABLE
    if resp.status_code == 200:
        # گاهی اینستاگرام برای آیدی‌های حذف‌شده هم 200 با محتوای خطا می‌دهد؛
        # یک بررسی سبک روی محتوا انجام می‌دهیم.
        text = resp.text.lower()
        if "sorry, this page isn't available" in text or '"user":null' in text:
            return STATUS_AVAILABLE
        return STATUS_TAKEN
    if resp.status_code == 429:
        log(f"⏳ به rate-limit خوردیم (429) هنگام چک '{username}'. فاصله را بیشتر کنید.")
        return STATUS_UNKNOWN

    log(f"❔ کد وضعیت غیرمنتظره {resp.status_code} برای '{username}'.")
    return STATUS_UNKNOWN


# ---------------------------------------------------------------------------
# روش‌های اطلاع‌رسانی (Notification)
# ---------------------------------------------------------------------------

def notify_console(username: str) -> None:
    """اعلان در ترمینال + صدای بوق سیستم."""
    sys.stdout.write("\a")  # زنگ ترمینال
    sys.stdout.flush()
    log("=" * 60)
    log(f"🎉 آیدی آزاد شد: @{username}")
    log(f"   همین حالا دستی ثبتش کن: {PROFILE_URL.format(username=username)}")
    log("=" * 60)


def notify_desktop(username: str) -> None:
    """اعلان دسکتاپ (اختیاری) اگر کتابخانه‌ی plyer نصب باشد."""
    try:
        from plyer import notification  # type: ignore
        notification.notify(
            title="آیدی اینستاگرام آزاد شد!",
            message=f"@{username} حالا آزاده — سریع دستی بسازش.",
            timeout=20,
        )
    except Exception:
        pass  # اگر نصب نبود یا خطا داد، بی‌سروصدا رد شو


def notify_telegram(username: str) -> None:
    """
    اعلان تلگرام (اختیاری). اگر متغیرهای محیطی زیر ست شده باشند فعال می‌شود:
      TELEGRAM_BOT_TOKEN  و  TELEGRAM_CHAT_ID
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    text = (
        f"🎉 آیدی اینستاگرام آزاد شد: @{username}\n"
        f"سریع دستی بسازش: {PROFILE_URL.format(username=username)}"
    )
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data={"chat_id": chat_id, "text": text},
            timeout=15,
        )
    except requests.RequestException as exc:
        log(f"⚠️  ارسال تلگرام ناموفق بود: {exc}")


def notify_all(username: str) -> None:
    notify_console(username)
    notify_desktop(username)
    notify_telegram(username)


# ---------------------------------------------------------------------------
# حلقه‌ی اصلی
# ---------------------------------------------------------------------------

def load_usernames(source: str) -> list[str]:
    """آیدی‌ها را از فایل (هر خط یک آیدی) یا از رشته‌ی جداشده با کاما می‌خواند."""
    p = Path(source)
    if p.exists():
        raw = p.read_text(encoding="utf-8").splitlines()
    else:
        raw = source.split(",")

    names: list[str] = []
    for line in raw:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not valid_username(line):
            log(f"⚠️  آیدی نامعتبر نادیده گرفته شد: '{line}'")
            continue
        names.append(line)
    return names


def watch(
    usernames: list[str],
    interval: float,
    jitter: float,
    once: bool = False,
) -> None:
    session = requests.Session()
    pending = list(dict.fromkeys(usernames))  # حذف تکراری‌ها با حفظ ترتیب
    log(f"شروع رصد {len(pending)} آیدی: {', '.join('@' + u for u in pending)}")
    log(f"فاصله‌ی هر دور: ~{interval:.0f} ثانیه (+ jitter تا {jitter:.0f}s)")

    while pending:
        still_pending: list[str] = []
        for username in pending:
            status = check_username(session, username)
            if status == STATUS_AVAILABLE:
                notify_all(username)
                # دیگر این آیدی را رصد نمی‌کنیم تا اسپم نشود.
            elif status == STATUS_TAKEN:
                log(f"🔒 @{username} هنوز گرفته شده.")
                still_pending.append(username)
            else:
                log(f"… @{username} نامشخص، دور بعد دوباره چک می‌شود.")
                still_pending.append(username)

            # فاصله‌ی کوتاه بین چک تک‌تک آیدی‌ها در یک دور
            time.sleep(random.uniform(2, 5))

        pending = still_pending

        if once:
            break
        if not pending:
            log("✅ همه‌ی آیدی‌های تحت نظر آزاد شدند. پایان.")
            break

        sleep_for = interval + random.uniform(0, jitter)
        log(f"💤 خواب تا دور بعد: {sleep_for:.0f} ثانیه.")
        time.sleep(sleep_for)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="فقط اطلاع می‌دهد آیدی اینستاگرام آزاد شده — اکانت نمی‌سازد."
    )
    parser.add_argument(
        "usernames",
        help="مسیر فایل آیدی‌ها (هر خط یکی) یا لیست جداشده با کاما، مثل: ali,reza.dev",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=600.0,
        help="فاصله‌ی بین دورها به ثانیه (پیش‌فرض ۶۰۰ = هر ۱۰ دقیقه). خیلی کوتاهش نکن.",
    )
    parser.add_argument(
        "--jitter",
        type=float,
        default=120.0,
        help="مقدار تصادفی اضافه به فاصله برای طبیعی‌تر شدن (پیش‌فرض ۱۲۰s).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="فقط یک بار چک کن و خارج شو (برای اجرا با cron مناسب است).",
    )
    parser.add_argument(
        "--test-notify",
        action="store_true",
        help="فقط یک اعلان تستی بفرست (کنسول/دسکتاپ/تلگرام) و خارج شو.",
    )
    args = parser.parse_args()

    if args.test_notify:
        log("→ ارسال اعلان تستی...")
        notify_all("TEST_USERNAME")
        tg_set = bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"))
        if tg_set:
            log("متغیرهای تلگرام تنظیم شده‌اند — اگر پیام روی تلگرامت آمد، همه‌چی درست است.")
        else:
            log("⚠️  متغیرهای TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID تنظیم نشده‌اند؛ تلگرام رد شد.")
        return 0

    usernames = load_usernames(args.usernames)
    if not usernames:
        log("هیچ آیدی معتبری برای رصد پیدا نشد.")
        return 1

    if args.interval < 120 and not args.once:
        log("⚠️  هشدار: فاصله‌ی کمتر از ۱۲۰ ثانیه ریسک بلاک/rate-limit را زیاد می‌کند.")

    try:
        watch(usernames, args.interval, args.jitter, once=args.once)
    except KeyboardInterrupt:
        log("متوقف شد توسط کاربر. خداحافظ.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
