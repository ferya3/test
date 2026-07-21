#!/usr/bin/env bash
#
# نصب‌کننده‌ی تعاملی Instagram Username Watcher.
# موقع اجرا آیدی‌های اینستاگرام را از تو می‌پرسد، فایل را می‌سازد،
# وابستگی‌ها را نصب می‌کند و سرویس systemd را برای اجرای خودکار بعد از
# هر ری‌استارت راه می‌اندازد. نیازی به ویرایش دستی هیچ فایلی نیست.
#
# اجرا:  bash install.sh
#
set -euo pipefail

# کاربری که سرویس با آن اجرا می‌شود = همان کاربری که این اسکریپت را اجرا می‌کند
# (اگر با sudo اجرا شود، کاربر واقعی؛ وگرنه کاربر فعلی). این‌طور مشکل دسترسی
# به مسیر پروژه پیش نمی‌آید.
RUN_USER="${SUDO_USER:-$(whoami)}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USERNAMES_FILE="$PROJECT_DIR/usernames.txt"
SERVICE_NAME="instagram-watcher.service"
INTERVAL="600"

echo "=================================================="
echo "   نصب Instagram Username Watcher"
echo "=================================================="
echo

# ---------------------------------------------------------------------------
# ۱) گرفتن آیدی‌ها به‌صورت تعاملی
# ---------------------------------------------------------------------------
echo "آیدی‌های اینستاگرام را که می‌خواهی رصد شوند وارد کن."
echo "هر آیدی را بنویس و Enter بزن. برای پایان، یک خط خالی (فقط Enter) بزن."
echo

names=()
while true; do
    read -r -p "آیدی (یا Enter برای پایان): " name
    name="$(echo "$name" | tr -d '[:space:]')"   # حذف فاصله‌ها
    if [[ -z "$name" ]]; then
        break
    fi
    # اعتبارسنجی ساده: فقط حروف، عدد، نقطه و آندرلاین، حداکثر ۳۰ کاراکتر
    if [[ ! "$name" =~ ^[A-Za-z0-9._]{1,30}$ ]]; then
        echo "  ⚠️  آیدی نامعتبر است، رد شد: '$name'"
        continue
    fi
    names+=("$name")
    echo "  ✅ اضافه شد: @$name"
done

if [[ ${#names[@]} -eq 0 ]]; then
    echo
    echo "❌ هیچ آیدی‌ای وارد نکردی. نصب لغو شد."
    exit 1
fi

# نوشتن در فایل usernames.txt
{
    echo "# این فایل به‌صورت خودکار توسط install.sh ساخته شد."
    for n in "${names[@]}"; do
        echo "$n"
    done
} > "$USERNAMES_FILE"

echo
echo "✅ ${#names[@]} آیدی در $USERNAMES_FILE ذخیره شد."
echo

# ---------------------------------------------------------------------------
# ۲) فاصله‌ی چک (اختیاری)
# ---------------------------------------------------------------------------
read -r -p "فاصله‌ی چک بین دورها به ثانیه [پیش‌فرض 600 = هر ۱۰ دقیقه]: " user_interval
if [[ -n "${user_interval:-}" ]]; then
    if [[ "$user_interval" =~ ^[0-9]+$ ]] && [[ "$user_interval" -ge 300 ]]; then
        INTERVAL="$user_interval"
    else
        echo "  ⚠️  مقدار نامعتبر یا کمتر از ۳۰۰. از پیش‌فرض 600 استفاده می‌شود."
    fi
fi
echo "فاصله‌ی چک: $INTERVAL ثانیه"
echo

# ---------------------------------------------------------------------------
# ۲.۵) تنظیم اعلان تلگرام (اختیاری) — نتایج را روی تلگرام می‌فرستد
# ---------------------------------------------------------------------------
TG_TOKEN=""
TG_CHAT=""
read -r -p "می‌خواهی اعلان‌ها روی تلگرام هم بیایند؟ (y/n) [n]: " want_tg
if [[ "${want_tg:-n}" =~ ^[Yy]$ ]]; then
    echo
    echo "راهنمای ساخت بات تلگرام:"
    echo "  1) در تلگرام به @BotFather پیام بده و /newbot را بزن."
    echo "  2) یک اسم و یک username برای بات بگذار."
    echo "  3) BotFather یک TOKEN می‌دهد (مثل 123456:ABC-DEF...). آن را کپی کن."
    echo
    read -r -p "TOKEN بات را اینجا بچسبان: " TG_TOKEN
    TG_TOKEN="$(echo "$TG_TOKEN" | tr -d '[:space:]')"

    if [[ -n "$TG_TOKEN" ]]; then
        echo
        echo "حالا در تلگرام، بات خودت را باز کن و دکمه‌ی Start را بزن (یا پیام /start بفرست)."
        read -r -p "بعد از فرستادن /start، اینجا Enter بزن تا chat id خودکار پیدا شود... " _

        # پیدا کردن chat id به‌صورت خودکار از getUpdates
        TG_CHAT="$(python3 - "$TG_TOKEN" <<'PYEOF'
import sys, json, urllib.request
token = sys.argv[1]
try:
    with urllib.request.urlopen(
        f"https://api.telegram.org/bot{token}/getUpdates", timeout=15
    ) as r:
        data = json.load(r)
    for upd in reversed(data.get("result", [])):
        msg = upd.get("message") or upd.get("edited_message") or {}
        chat = msg.get("chat") or {}
        if "id" in chat:
            print(chat["id"])
            break
except Exception:
    pass
PYEOF
)"
        TG_CHAT="$(echo "$TG_CHAT" | tr -d '[:space:]')"

        if [[ -n "$TG_CHAT" ]]; then
            echo "  ✅ chat id پیدا شد: $TG_CHAT"
            # ارسال پیام تست
            python3 - "$TG_TOKEN" "$TG_CHAT" <<'PYEOF'
import sys, urllib.request, urllib.parse
token, chat = sys.argv[1], sys.argv[2]
data = urllib.parse.urlencode({
    "chat_id": chat,
    "text": "✅ اتصال تلگرام برقرار شد. اعلان آیدی‌های اینستاگرام از این به بعد اینجا می‌آید.",
}).encode()
try:
    urllib.request.urlopen(
        f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=15
    )
    print("  ✅ پیام تست فرستاده شد — تلگرامت را چک کن.")
except Exception as e:
    print(f"  ⚠️  ارسال پیام تست ناموفق بود: {e}")
PYEOF
        else
            echo "  ⚠️  chat id پیدا نشد. مطمئن شو که به بات /start فرستادی."
            echo "     فعلاً بدون تلگرام ادامه می‌دهیم؛ می‌توانی بعداً دوباره اسکریپت را اجرا کنی."
            TG_TOKEN=""
        fi
    fi
fi
echo

# ---------------------------------------------------------------------------
# ۳) نصب وابستگی‌ها
# ---------------------------------------------------------------------------
echo "→ بررسی و نصب pip..."
# اگر pip موجود نبود، آن را با apt نصب کن (مخصوص Ubuntu/Debian)
if ! python3 -m pip --version >/dev/null 2>&1; then
    echo "  pip پیدا نشد؛ در حال نصب python3-pip ..."
    sudo apt-get update -y
    sudo apt-get install -y python3-pip
fi

echo "→ نصب وابستگی‌ها..."
# فقط requests روی سرور لازم است (plyer برای دسکتاپ است و روی سرور نادیده گرفته می‌شود).
# --break-system-packages برای نسخه‌های جدید Ubuntu که pip سیستمی را قفل می‌کنند.
python3 -m pip install requests --break-system-packages 2>/dev/null \
    || python3 -m pip install requests
echo

# ---------------------------------------------------------------------------
# ۴) ساخت و فعال‌سازی سرویس systemd
# ---------------------------------------------------------------------------
PYTHON_BIN="$(command -v python3)"

# اگر تلگرام تنظیم شده باشد، خطوط Environment را آماده کن
TG_ENV=""
if [[ -n "$TG_TOKEN" && -n "$TG_CHAT" ]]; then
    TG_ENV="Environment=TELEGRAM_BOT_TOKEN=$TG_TOKEN
Environment=TELEGRAM_CHAT_ID=$TG_CHAT"
fi

echo "→ ساخت سرویس systemd..."
sudo bash -c "cat > /etc/systemd/system/$SERVICE_NAME" <<EOF
[Unit]
Description=Instagram Username Watcher (notify-only)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
$TG_ENV
ExecStart=$PYTHON_BIN $PROJECT_DIR/instagram_watcher.py $USERNAMES_FILE --interval $INTERVAL
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo
echo "=================================================="
echo "✅ نصب کامل شد و سرویس در حال اجراست."
echo "   بعد از هر ری‌استارت سرور، خودکار اجرا می‌شود."
echo
echo "دیدن لاگ زنده:"
echo "   journalctl -u $SERVICE_NAME -f"
echo
echo "برای اضافه/حذف آیدی بعداً دوباره این اسکریپت را اجرا کن:"
echo "   bash install.sh"
echo "=================================================="
