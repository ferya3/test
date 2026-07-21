# Instagram Username Watcher 👀

ابزار ساده‌ای که **فقط اطلاع می‌دهد** یک یا چند آیدی اینستاگرام آزاد شده‌اند.
**هیچ اکانتی نمی‌سازد** و هیچ کار خودکاری روی اینستاگرام انجام نمی‌دهد —
ساخت نهایی اکانت را باید خودت دستی انجام دهی.

> ⚠️ **مسئولانه استفاده کن:** فاصله‌ی بین چک‌ها را کوتاه نکن و تعداد آیدی‌های
> تحت نظر را کم نگه دار. چک بیش از حد ممکن است باعث بلاک شدن IP یا rate-limit شود.
> این ابزار فقط صفحه‌ی عمومی پروفایل را می‌خواند (مثل باز کردن آدرس در مرورگر).

## نصب

```bash
pip install -r requirements.txt
```

## استفاده

### با فایل آیدی‌ها
آیدی‌ها را در `usernames.txt` بنویس (هر خط یکی)، بعد:

```bash
python instagram_watcher.py usernames.txt
```

### با لیست مستقیم

```bash
python instagram_watcher.py "ali,reza.dev,my_handle"
```

### گزینه‌ها

| گزینه | توضیح | پیش‌فرض |
|-------|-------|---------|
| `--interval` | فاصله‌ی بین دورها (ثانیه) | `600` (هر ۱۰ دقیقه) |
| `--jitter` | مقدار تصادفی اضافه به فاصله | `120` |
| `--once` | فقط یک بار چک کن و خارج شو (مناسب cron) | خاموش |

مثال با فاصله‌ی ۱۵ دقیقه:

```bash
python instagram_watcher.py usernames.txt --interval 900
```

## اطلاع‌رسانی (Notification)

وقتی آیدی آزاد شود، از این راه‌ها خبر می‌گیری:

1. **ترمینال + بوق سیستم** — همیشه فعال.
2. **اعلان دسکتاپ** — اگر `plyer` نصب باشد، خودکار فعال می‌شود.
3. **تلگرام** — اگر این دو متغیر محیطی ست شده باشند:
   ```bash
   export TELEGRAM_BOT_TOKEN="توکن_بات_تو"
   export TELEGRAM_CHAT_ID="آیدی_عددی_چت_تو"
   ```

## اجرای مداوم در پس‌زمینه

اجرای همیشگی (حالت پیش‌فرض خودش حلقه می‌زند):

```bash
nohup python instagram_watcher.py usernames.txt > watcher.log 2>&1 &
```

یا با `cron` هر ۱۵ دقیقه یک بار (حالت `--once`):

```cron
*/15 * * * * cd /path/to/repo && python instagram_watcher.py usernames.txt --once >> watcher.log 2>&1
```

## اجرای خودکار بعد از هر ری‌استارت سرور (Ubuntu + systemd)

فایل `instagram-watcher.service` آماده است. مراحل نصب روی سرور اوبونتو:

```bash
# ۱) پروژه را روی سرور بگذار (مثلاً در مسیر زیر) و وارد پوشه شو
cd /home/ubuntu/instagram-watcher

# ۲) وابستگی‌ها را نصب کن
pip3 install -r requirements.txt

# ۳) آیدی‌هایت را در usernames.txt بنویس
nano usernames.txt

# ۴) فایل سرویس را ویرایش کن: مقدار User, WorkingDirectory و ExecStart را
#    مطابق مسیر و کاربر خودت درست کن
nano instagram-watcher.service

# ۵) فایل را در مسیر systemd کپی کن
sudo cp instagram-watcher.service /etc/systemd/system/

# ۶) سرویس را فعال و اجرا کن
sudo systemctl daemon-reload
sudo systemctl enable instagram-watcher.service   # اجرای خودکار بعد از هر ری‌استارت
sudo systemctl start instagram-watcher.service
```

بررسی وضعیت و دیدن لاگ‌ها:

```bash
sudo systemctl status instagram-watcher.service     # وضعیت فعلی
journalctl -u instagram-watcher.service -f          # لاگ زنده
```

دستورهای مفید:

```bash
sudo systemctl restart instagram-watcher.service    # ری‌استارت سرویس
sudo systemctl stop instagram-watcher.service       # توقف
sudo systemctl disable instagram-watcher.service    # غیرفعال کردن اجرای خودکار
```

بعد از `enable` کردن، سرویس **بعد از هر بار ری‌استارت شدن سرور به‌صورت خودکار اجرا می‌شود**.
اگر آیدی‌ها را عوض کردی، فقط `usernames.txt` را ویرایش کن و سرویس را `restart` کن.

## چطور کار می‌کند؟

- کد وضعیت `404` از صفحه‌ی پروفایل → آیدی احتمالاً **آزاد** است.
- کد وضعیت `200` → آیدی **گرفته** شده.
- کد `429` → به rate-limit خورده‌ای؛ فاصله را بیشتر کن.

به محض آزاد شدن یک آیدی، به تو اطلاع می‌دهد و دیگر آن را رصد نمی‌کند (تا اسپم نشود).

## مسئولیت قانونی

این ابزار فقط بررسی عمومی و اطلاع‌رسانی است. ساخت اکانت را خودت دستی و مطابق
[قوانین اینستاگرام](https://help.instagram.com/581066165581870) انجام بده.
از این ابزار برای ساخت انبوه یا خودکار اکانت استفاده نکن.
