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

RUN_USER="ubuntu"
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
# ۳) نصب وابستگی‌ها
# ---------------------------------------------------------------------------
echo "→ نصب وابستگی‌ها..."
pip3 install -r "$PROJECT_DIR/requirements.txt"
echo

# ---------------------------------------------------------------------------
# ۴) ساخت و فعال‌سازی سرویس systemd
# ---------------------------------------------------------------------------
PYTHON_BIN="$(command -v python3)"

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
