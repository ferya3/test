# artavilcrown.com روی Cloudflare Workers

سایت استاتیک که مستقیم روی Cloudflare Worker اجرا می‌شود. سرور، PHP یا دیتابیس لازم ندارد.

```
cloudflare/
├── wrangler.jsonc     تنظیمات Worker و اتصال دامنه
├── src/index.js       ریدایرکت www، هدرهای امنیتی، کش
└── public/            فایل‌های سایت (index.html، styles.css، فونت‌ها، 404.html)
```

## پیش‌نیاز
- Node.js 20 یا بالاتر
- دامنهٔ `artavilcrown.com` در حساب Cloudflare اضافه شده و وضعیتش **Active** باشد
  (nameserverهای Cloudflare در پنل ثبت دامنه تنظیم شده باشند)
- اگر از قبل رکورد DNS از نوع A، AAAA یا CNAME برای `artavilcrown.com` یا `www` دارید، پاکش کنید.
  رکوردها را خود Worker می‌سازد.

## اجرا
```bash
cd cloudflare
npm install
npx wrangler login      # یک بار، برای ورود به حساب Cloudflare
npm run dev             # پیش‌نمایش محلی روی http://localhost:8787
npm run deploy          # انتشار روی artavilcrown.com
```

بعد از `deploy` چند دقیقه طول می‌کشد تا گواهی SSL صادر شود. بعد از آن
`https://artavilcrown.com` بالا می‌آید و `www` با 301 به دامنهٔ اصلی می‌رود.

## ویرایش محتوا
- متن صفحه: `public/index.html`. اطلاعات تماس (تلفن، ایمیل، نشانی) را با اطلاعات واقعی جایگزین کنید.
- رنگ و ظاهر: `public/styles.css`
- هر فایلی که در `public/` بگذارید (مثلاً `public/images/hero.webp`) با همان مسیر سرو می‌شود.
  برای اعمال تغییرات دوباره `npm run deploy` را اجرا کنید.
