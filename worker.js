/**
 * vitaQueen — سایت در حال بروزرسانی
 *
 * تک‌فایل. کل این فایل را کپی کنید و در ادیتور Cloudflare Workers
 * (Workers & Pages → Create → Start with Hello World → Edit code) جای‌گذاری و Deploy کنید.
 *
 * فقط بخش CONFIG زیر را تغییر دهید.
 */

const CONFIG = {
  SITE_NAME: "vitaQueen",

  HEADLINE: "سایت در حال بروزرسانی می‌باشد",
  CONTACT_TEXT: "جهت تماس با مدیر فروش با این شماره تماس بگیرید",

  // شماره‌ای که روی صفحه نمایش داده می‌شود. با یک لمس، تماس گرفته می‌شود.
  PHONE: "09149677100",
  // پیش‌شماره‌ی کشور برای لینک تماس. صفرِ اول شماره با این جایگزین می‌شود.
  COUNTRY_CODE: "+98",

  // عکس بک‌گراند دسکتاپ (افقی). باید https باشد. خالی = گرادیان آبی پیش‌فرض.
  BG_URL: "",
  // عکس بک‌گراند موبایل (ترجیحاً عمودی). خالی = همان عکس دسکتاپ استفاده می‌شود.
  BG_URL_MOBILE: "",

  DIR: "rtl", // "rtl" یا "ltr"
  LANG: "fa",
};

const BRAND = {
  blue: "#0b63b0",
  gold: "#f5b200",
  deep: "#0a4a7d",
};

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M18 68h64l8-40-22 16L50 20 32 44 10 28z' fill='%23f5b200'/%3E%3Crect x='18' y='74' width='64' height='10' rx='3' fill='%230b63b0'/%3E%3C/svg%3E";

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return text("ok");
    }

    if (url.pathname === "/robots.txt") {
      return text("User-agent: *\nDisallow:\n");
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    // مقادیر CONFIG با متغیرهای محیطی (در صورت وجود) قابل بازنویسی‌اند.
    const config = { ...CONFIG, ...(env || {}) };
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const body = render(config, nonce, url);

    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // صفحه در هر درخواست با nonce تازه ساخته می‌شود، پس کش نمی‌شود.
        "cache-control": "no-store",
        "content-security-policy": [
          "default-src 'none'",
          `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
          "font-src https://fonts.gstatic.com",
          "img-src https: data:",
          "base-uri 'none'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join("; "),
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  },
};

function text(value) {
  return new Response(value, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** فقط آدرس‌های https مجازند. */
function safeImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

/** شماره را به شکل بین‌المللی درمی‌آورد: 09149677100 → +989149677100 */
function telHref(phone, countryCode) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);

  const code = String(countryCode ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("0") && code) return code + digits.slice(1);
  return digits;
}

function render(config, nonce, url) {
  const siteName = escapeHtml(config.SITE_NAME);
  const headline = escapeHtml(config.HEADLINE);
  const contactText = escapeHtml(config.CONTACT_TEXT);
  const phone = escapeHtml(String(config.PHONE ?? "").trim());
  const tel = escapeHtml(telHref(config.PHONE, config.COUNTRY_CODE));
  const dir = config.DIR === "ltr" ? "ltr" : "rtl";
  const lang = escapeHtml(config.LANG || "fa");

  const background = safeImageUrl(config.BG_URL);
  const backgroundMobile = safeImageUrl(config.BG_URL_MOBILE) || background;

  // عکس با <picture> عوض می‌شود؛ همان شرطی که چیدمان با آن تغییر می‌کند.
  const backdrop = background
    ? `<div class="bg">
  <picture>
    <source media="(max-aspect-ratio: 1/1)" srcset="${escapeHtml(backgroundMobile)}">
    <img src="${escapeHtml(background)}" alt="" fetchpriority="high">
  </picture>
</div>`
    : "";

  const call = tel
    ? `<a class="call" href="tel:${tel}" aria-label="تماس با ${phone}">
    ${phoneSvg()}
    <span class="num">${phone}</span>
  </a>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<title>${siteName} — ${headline}</title>
<meta name="description" content="${headline} ${contactText} ${phone}">
<meta name="theme-color" content="${BRAND.blue}">
<meta property="og:type" content="website">
<meta property="og:title" content="${siteName} — ${headline}">
<meta property="og:description" content="${contactText} ${phone}">
<meta property="og:url" content="${escapeHtml(url.origin)}">
${background ? `<meta property="og:image" content="${escapeHtml(background)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style nonce="${nonce}">
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap');

:root {
  --gold: ${BRAND.gold};
  --blue: ${BRAND.blue};
  --deep: ${BRAND.deep};
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #fff;
  font-family: Vazirmatn, ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif;
  text-align: center;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  background: linear-gradient(180deg, #4aa8e8 0%, #1f7fc4 45%, #0b5a96 72%, var(--deep) 100%);
}

/* ————— صفحه‌ی افقی (دسکتاپ): عکس تمام‌صفحه، متن رویش ————— */

.bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.bg img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* لایه‌ی تیره تا متن روی عکس خوانا بماند. */
.bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, rgba(4, 22, 42, 0.32) 0%, rgba(4, 22, 42, 0.7) 100%),
    linear-gradient(180deg, rgba(4, 22, 42, 0.25) 0%, rgba(4, 22, 42, 0.55) 100%);
}

main {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 640px;
  padding: max(2rem, env(safe-area-inset-top)) 1.25rem max(2rem, env(safe-area-inset-bottom));
  animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ————— صفحه‌ی عمودی (گوشی): کل عکس بالای صفحه بدون کراپ، متن زیرش ————— */

@media (max-aspect-ratio: 1/1) {
  body { justify-content: flex-start; }

  .bg {
    position: relative;
    inset: auto;
    width: 100%;
    flex: none;
  }

  /* ارتفاع طبیعی عکس، ولی حداکثر تا نیمه‌ی صفحه تا شماره‌ی تماس همیشه بدون اسکرول دیده شود.
     اگر محدود شد، از بالای عکس نگه داشته می‌شود؛ پایینش زیر محوشدگی می‌رود. */
  .bg img {
    height: auto;
    max-height: 56svh;
    object-position: top;
  }

  /* به‌جای تیره‌کردن کل عکس، فقط پایینش در گرادیان صفحه محو می‌شود. */
  .bg::after {
    top: auto;
    height: 34%;
    background: linear-gradient(180deg, rgba(31, 127, 196, 0) 0%, #1f7fc4 92%);
  }

  main {
    margin-block: auto;
    padding-top: 1.75rem;
    padding-bottom: max(2.5rem, env(safe-area-inset-bottom));
  }

  body:has(.bg) {
    background: linear-gradient(180deg, #1f7fc4 0%, #0b5a96 40%, var(--deep) 100%);
  }
}

/* گوشی‌های کوچک: سهم عکس کمتر می‌شود تا متن و دکمه جا شوند. */
@media (max-aspect-ratio: 1/1) and (max-height: 680px) {
  .bg img { max-height: 40svh; }
  main { padding-top: 1.25rem; }
}

@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: none; }
}

h1 {
  margin: 0;
  font-size: clamp(1.45rem, 5.4vw, 2.6rem);
  font-weight: 900;
  line-height: 1.5;
  text-shadow: 0 6px 26px rgba(0, 20, 45, 0.55);
}

.rule {
  width: clamp(60px, 22vw, 120px);
  height: 3px;
  margin: 1.5rem auto;
  border: 0;
  border-radius: 3px;
  background: var(--gold);
}

p.lead {
  margin: 0 auto;
  max-width: 46ch;
  color: rgba(255, 255, 255, 0.94);
  font-size: clamp(0.95rem, 3.6vw, 1.2rem);
  line-height: 1.9;
  text-shadow: 0 2px 14px rgba(0, 20, 45, 0.5);
}

/* دکمه‌ی تماس: با یک لمس شماره‌گیری می‌شود. */
.call {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1.75rem;
  min-height: 60px;
  padding: 0.75rem clamp(1.25rem, 5vw, 2rem);
  border-radius: 999px;
  background: var(--gold);
  color: #10233a;
  text-decoration: none;
  box-shadow: 0 14px 34px rgba(0, 20, 45, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.call:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 40px rgba(0, 20, 45, 0.5);
}

.call:active { transform: translateY(1px); }

.call:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}

.call svg {
  flex: 0 0 auto;
  width: clamp(20px, 5vw, 26px);
  height: auto;
}

.num {
  font-size: clamp(1.35rem, 6.4vw, 2.1rem);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  /* شماره در متن راست‌به‌چپ هم باید چپ‌به‌راست خوانده شود. */
  direction: ltr;
  unicode-bidi: isolate;
}

/* گوشیِ خوابیده و پنجره‌های کوتاه: فاصله‌ها جمع می‌شوند تا صفحه اسکرول نخورد. */
@media (min-aspect-ratio: 1/1) and (max-height: 520px) {
  main { padding-block: 1.25rem; }
  h1 { font-size: clamp(1.2rem, 5vh, 1.9rem); line-height: 1.4; }
  .rule { margin-block: 0.9rem; }
  p.lead { font-size: clamp(0.85rem, 3.6vh, 1.05rem); line-height: 1.6; }
  .call { margin-top: 1rem; min-height: 52px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
</head>
<body>
${backdrop}
<main>
  <h1>${headline}</h1>
  <hr class="rule">
  <p class="lead">${contactText}</p>
  ${call}
</main>
</body>
</html>`;
}

function phoneSvg() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z"/>
    </svg>`;
}
