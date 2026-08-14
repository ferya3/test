# Forex News Analysis Agent

خواندن خبرهای مهم فارکس، تحلیل آن‌ها با Claude، و ارسال نتیجه به تلگرام —
همراه با **درصد تأثیر تخمینی روی طلا، دلار و جفت‌ارزهای اصلی**.

An agent that ingests forex news and the economic calendar, analyses each
event, estimates the expected percentage move per asset, scores its own
confidence, and publishes to Telegram and a JSON dashboard.

---

## معماری / Architecture

```
                         NEWS SOURCES
                              │
                              ▼
                      ┌──────────────┐
                      │ INGESTION    │  RSS + economic calendar, in parallel
                      └──────┬───────┘
                             ▼
                      ┌──────────────┐
                      │ NORMALIZER   │  clean, classify, tag currencies
                      └──────┬───────┘
                  ┌──────────┴──────────┐
                  ▼                     ▼
            ┌───────────┐         ┌────────────┐
            │ DEDUP     │         │ MACRO DATA │  actual/forecast/surprise
            └─────┬─────┘         └──────┬─────┘
                  └──────────┬───────────┘
                             ▼
                      ┌──────────────┐
                      │ AI ANALYZER  │  Claude, strict JSON contract
                      └──────┬───────┘
                             ▼
                      ┌──────────────┐
                      │ VALIDATOR    │  repair, clamp, reject
                      └──────┬───────┘
                  ┌──────────┴───────────┐
                  ▼                      ▼
           ┌─────────────┐       ┌──────────────┐
           │ MARKET DATA │       │ HISTORICAL   │  what happened last time
           │ ENGINE      │       │ ENGINE       │
           └──────┬──────┘       └──────┬───────┘
                  └──────────┬───────────┘
                             ▼
                      ┌──────────────┐
                      │ IMPACT ENGINE│  blend model + prior × volatility
                      └──────┬───────┘
                             ▼
                      ┌──────────────┐
                      │ CONFIDENCE   │  7 weighted signals
                      │ ENGINE       │
                      └──────┬───────┘
                             ▼
                      ┌──────────────┐
                      │ ALERT ENGINE │  route, rate-limit, render
                      └──────┬───────┘
                             ▼
                   Telegram / Dashboard
```

---

## نصب / Install

```bash
pip install -r requirements.txt
cp .env.example .env      # مقادیر را پر کنید
python -m forex_agent check
```

### متغیرهای محیطی

| متغیر | ضروری | توضیح |
|---|---|---|
| `ANTHROPIC_API_KEY` | بله | کلید Claude برای تحلیل |
| `TELEGRAM_BOT_TOKEN` | بله | توکن ربات از [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | بله | آیدی چت یا کانال مقصد |
| `FOREX_MODEL` | خیر | پیش‌فرض `claude-sonnet-5` |
| `FOREX_POLL_MIN` | خیر | فاصله چک کردن، پیش‌فرض ۱۵ دقیقه |
| `FOREX_INSTANT_IMPACT` | خیر | حداقل درصد تأثیر برای هشدار فوری |
| `FOREX_DRY_RUN` | خیر | چاپ در ترمینال به‌جای ارسال به تلگرام |

همه‌ی تنظیمات در `forex_agent/config.py` با مقدار پیش‌فرض مستند شده‌اند.

---

## اجرا / Usage

```bash
python -m forex_agent check              # بررسی تنظیمات و اتصال منابع
python -m forex_agent run                # یک بار اجرا، فقط هشدارهای فوری
python -m forex_agent run --no-send      # تحلیل بدون ارسال
python -m forex_agent digest             # یک بار اجرا + ارسال خلاصه
python -m forex_agent loop               # اجرای دائمی
python -m forex_agent loop --digest-at 6,15   # خلاصه در ساعت‌های ۶ و ۱۵ UTC
python -m forex_agent seed history.json  # بارگذاری داده تاریخی اولیه
```

### systemd

```ini
[Unit]
Description=Forex News Agent
After=network-online.target

[Service]
WorkingDirectory=/opt/forex-agent
EnvironmentFile=/opt/forex-agent/.env
ExecStart=/usr/bin/python3 -m forex_agent loop --digest-at 6,15
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### cron

```cron
*/15 * * * * cd /opt/forex-agent && python3 -m forex_agent run  >> logs/run.log 2>&1
0 6,15 * * * cd /opt/forex-agent && python3 -m forex_agent digest >> logs/digest.log 2>&1
```

---

## مراحل / Stages

### INGESTION
هشت فید RSS رایگان (ForexLive، FXStreet، Investing، DailyFX، Reuters، MarketWatch)
به‌علاوه‌ی تقویم اقتصادی هفتگی، همه به‌صورت موازی. خطای یک منبع کل اجرا را متوقف
نمی‌کند؛ هر منبع مستقل است.

### NORMALIZER
حذف HTML، یکسان‌سازی زمان به UTC، تشخیص نوع رویداد (بانک مرکزی / داده اقتصادی /
ژئوپلیتیک / تحلیل)، و برچسب‌گذاری ارزها از روی متن. برای تقویم، `actual`/`forecast`
پارس شده و **انحراف از انتظار** محاسبه می‌شود:

```
surprise   = actual − forecast
surprise_z = surprise / typical_revision_size(indicator)
```

مقیاس هر شاخص در `SURPRISE_SCALE` تعریف شده تا CPI با ۰.۳ واحد انحراف و NFP با
۶۰ هزار شغل انحراف، روی یک مقیاس قابل مقایسه بیایند.

### DEDUP
دو مرحله: تطبیق دقیق اثر انگشت در دیتابیس، سپس مقایسه‌ی هم‌پوشانی توکن‌ها
(Jaccard ≥ ۰.۷۲). یک خبر از سه خبرگزاری به **یک رویداد با سه منبع تأییدکننده**
تبدیل می‌شود؛ تعداد تأیید بعداً به موتور اطمینان می‌رود.

### MACRO DATA
ارقام تقویم را به خبرهای مرتبط می‌چسباند. وقتی خبری ارقام یک انتشار را برداشت،
ردیف خام تقویم حذف می‌شود تا پیام تکراری ساخته نشود.

### AI ANALYZER
رویدادها دسته‌ای به Claude می‌روند با قرارداد JSON سخت‌گیرانه. مدل برای هر دارایی
جهت و **درصد حرکت مطلق مورد انتظار** می‌دهد. بدون کلید API، یک تحلیل قاعده‌محور
جایگزین می‌شود تا خط لوله متوقف نشود (و خودش را برای موتور اطمینان علامت می‌زند).

### VALIDATOR
مدل گاهی نماد جعلی می‌سازد یا حرکت ۴۰٪ می‌دهد. این مرحله:
- نمادهای ناشناخته را حذف می‌کند
- درصدها را به سقف مجاز می‌چسباند
- تناقض دلار را اصلاح می‌کند (DXY و EURUSD نمی‌توانند هر دو صعودی باشند)
- تناقض طلا/دلار را **علامت می‌زند** ولی اجباری اصلاح نمی‌کند (رابطه‌شان همیشگی نیست)
- ناسازگاری اهمیت با بزرگی حرکت را بالا/پایین می‌برد

هر دخالت در `validation_flags` ثبت می‌شود.

### MARKET DATA ENGINE
قیمت و نوسان تحقق‌یافته‌ی ۲۰ روزه از Stooq (با fallback به Yahoo). رژیم نوسان
نسبت به میانگین بلندمدت هر دارایی سنجیده می‌شود:

| رژیم | شرط | ضریب |
|---|---|---|
| آرام | vol < ۰.۷× پایه | ۰.۷–۱.۰ |
| عادی | ۰.۷×–۱.۴× | ۱.۰ |
| پرنوسان | vol > ۱.۴× پایه | ۱.۰–۱.۶ |

### HISTORICAL ENGINE
حلقه‌ی یادگیری. هر رویداد ذخیره می‌شود؛ ۲۴ ساعت بعد حرکت واقعی قیمت اندازه‌گیری
و ثبت می‌شود. دفعه‌ی بعد که همان شاخص منتشر شود، میانه‌ی حرکت‌های گذشته به‌عنوان
**prior تجربی** برمی‌گردد، مقیاس‌شده با نسبت بزرگی این انحراف به انحرافات گذشته.

### IMPACT ENGINE
```
blended = (w_ai × ai_estimate + w_hist × prior) / (w_ai + w_hist)
final   = blended × volatility_multiplier × corroboration_bonus
```
وزن تاریخی با تعداد نمونه مقیاس می‌خورد: prior با ۳ مشاهده کم‌وزن است، با ۱۲
مشاهده تمام‌وزن. بدون داده تاریخی، تخمین مدل دست‌نخورده می‌ماند. سقف نهایی از
سطح اهمیت رویداد می‌آید.

### CONFIDENCE ENGINE
هفت سیگنال مستقل، هرکدام ۰..۱، با وزن:

| سیگنال | وزن | چه چیزی می‌سنجد |
|---|---|---|
| `data_completeness` | ۰.۲۰ | آیا actual/forecast/previous داریم |
| `historical_support` | ۰.۲۰ | حجم نمونه‌ی تاریخی |
| `source_quality` | ۰.۱۸ | رتبه‌ی منبع + تأیید مستقل |
| `model_agreement` | ۰.۱۷ | فاصله‌ی تخمین مدل از prior تاریخی |
| `freshness` | ۰.۱۰ | سن خبر |
| `market_context` | ۰.۱۰ | آیا قیمت زنده داشتیم |
| `validation_health` | ۰.۰۵ | تعداد دخالت‌های ولیدیتور |

اطمینان عمداً از تأثیر جداست: یک خبر می‌تواند حرکت بزرگی را نشان دهد که
مطمئن نیستیم، یا حرکت کوچکی که کاملاً مطمئنیم.

### ALERT ENGINE
سه دروازه برای هشدار فوری: اهمیت ≥ `high`، اطمینان ≥ ۵۵٪، تأثیر ≥ ۰.۳۵٪.
بقیه در خلاصه جمع می‌شوند. سقف ۱۲ هشدار در ساعت و cooldown ۴۵ دقیقه‌ای برای هر
رویداد از سیل پیام جلوگیری می‌کند.

---

## نمونه خروجی

```
🚨 خبر فوری فارکس | اهمیت: بحرانی

US core CPI m/m jumps to 0.6%, well above forecast

تورم هسته آمریکا بسیار بالاتر از انتظار درآمد و شرط‌بندی روی توقف
طولانی‌تر فدرال رزرو را احیا کرد.

📊 ارقام منتشرشده
   واقعی: 0.6% | پیش‌بینی: 0.3% | قبلی: 0.3%
   انحراف از انتظار: +1.50σ

💹 تأثیر بر بازارها
📉 طلا (XAUUSD): نزولی — تأثیر ≈ 0.67٪
📈 شاخص دلار (DXY): صعودی — تأثیر ≈ 0.48٪
📉 یورو/دلار (EURUSD): نزولی — تأثیر ≈ 0.40٪

🎯 اطمینان تحلیل: 78٪ | نمونه تاریخی: 14
🕒 12:32 UTC | منبع: Reuters-Business (+2 منبع دیگر)
```

---

## داشبورد

هر اجرا `data/dashboard.json` را می‌نویسد: قیمت‌ها، رویدادهای امتیازدهی‌شده،
تفکیک کامل اطمینان، و **جهت‌گیری خالص** هر دارایی. مناسب برای یک صفحه‌ی
استاتیک یا Grafana.

---

## تست

```bash
python -m pytest tests/ -q     # ۶۷ تست
```

`tests/test_pipeline.py` هر مرحله را جدا تست می‌کند؛ `tests/test_e2e.py` کل خط
لوله را با جایگزینی مرز شبکه اجرا می‌کند.

---

## محدودیت‌ها

- **تخمین است، نه پیش‌بینی.** درصدها انتظار آماری‌اند، نه تضمین. سیگنال معاملاتی نیست.
- تا وقتی HISTORICAL ENGINE داده جمع نکرده (چند هفته)، اعداد فقط از مدل می‌آیند
  و `historical_support` پایین می‌ماند. برای شروع سریع‌تر از `seed` استفاده کنید.
- منابع RSS رایگان‌اند و SLA ندارند؛ ساختارشان ممکن است تغییر کند.
- تقویم فقط هفته‌ی جاری را می‌دهد.
