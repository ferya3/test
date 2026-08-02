# Coming Soon — Cloudflare Worker

یک لندینگ‌پیج «به‌زودی» که مستقیم از یک Cloudflare Worker سرو می‌شود.
بدون build، بدون فریم‌ورک، بدون asset خارجی — کل صفحه در لبه (edge) ساخته می‌شود.

- ریسپانسیو، با پشتیبانی RTL و دارک/لایت خودکار
- شمارش معکوس اختیاری تا لحظه‌ی راه‌اندازی
- تمام متن‌ها از طریق `vars` در `wrangler.jsonc` قابل تغییرند
- هدرهای امنیتی (CSP با nonce، nosniff، Referrer-Policy)
- مسیرهای `/health` و `/robots.txt`

## اجرای محلی

```bash
npm install
npm run dev          # http://localhost:8787
```

## شخصی‌سازی

فقط `vars` را در `wrangler.jsonc` ویرایش کنید:

| متغیر | توضیح |
| --- | --- |
| `SITE_NAME` | نام برند / تیتر اصلی |
| `TAGLINE` | متن نشان کوچک بالای تیتر |
| `DESCRIPTION` | توضیح یک‌خطی (در متا تگ‌ها هم استفاده می‌شود) |
| `LAUNCH_DATE` | تاریخ ISO مثل `2026-12-01T09:00:00Z` — خالی = بدون شمارش معکوس |
| `CONTACT_EMAIL` | خالی = بدون لینک تماس |
| `DIR` | `rtl` یا `ltr` |
| `LANG` | کد زبان، مثل `fa` یا `en` |

رنگ‌ها در بلوک `:root` داخل `src/index.js` تعریف شده‌اند (`--accent` رنگ اصلی).

## استقرار

```bash
npx wrangler login
npm run deploy
```

خروجی یک آدرس `*.workers.dev` می‌دهد تا نتیجه را ببینید.

## وصل‌کردن دامنه‌ی کلادفلر

دامنه باید قبلاً در همان اکانت کلادفلر اضافه شده باشد (nameserverها به کلادفلر اشاره کنند).
بعد بخش `routes` را در `wrangler.jsonc` از کامنت خارج و دامنه را جایگزین کنید:

```jsonc
"routes": [
  { "pattern": "example.com", "custom_domain": true },
  { "pattern": "www.example.com", "custom_domain": true }
]
```

سپس دوباره `npm run deploy`. رکوردهای DNS به‌صورت خودکار ساخته می‌شوند؛
نیازی به ساختن دستی رکورد A یا CNAME نیست.

جایگزین از داشبورد: **Workers & Pages → coming-soon → Settings → Domains & Routes → Add custom domain**.

## لاگ‌ها

```bash
npm run tail
```
