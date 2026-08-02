/**
 * vitaQueen — coming soon
 *
 * تک‌فایل. کل این فایل را کپی کنید و در ادیتور Cloudflare Workers
 * (Workers & Pages → Create → Start with Hello World → Edit code) جای‌گذاری و Deploy کنید.
 *
 * فقط بخش CONFIG زیر را تغییر دهید.
 */

const CONFIG = {
  SITE_NAME: "vitaQueen",
  SLOGAN: "PURE LIFE, NATURAL CHOICE",
  BADGE: "به‌زودی",
  DESCRIPTION: "آب معدنی طبیعی، از دل کوهستان. وب‌سایت ما به‌زودی در دسترس خواهد بود.",

  // آدرس عکس بک‌گراند (باید https باشد). خالی بگذارید تا گرادیان پیش‌فرض استفاده شود.
  // عکس را می‌توانید در R2 / Cloudflare Images / هر هاست دیگری بگذارید و لینکش را اینجا بزنید.
  BG_URL: "",

  // لوگو به‌صورت تصویر. خالی بگذارید تا لوگوی متنی (تاج + vitaQueen) نمایش داده شود.
  LOGO_URL: "",

  // تاریخ راه‌اندازی به فرمت ISO مثل "2026-12-01T09:00:00Z". خالی = بدون شمارش معکوس.
  LAUNCH_DATE: "",

  // خالی = بدون لینک تماس.
  CONTACT_EMAIL: "",

  DIR: "rtl", // "rtl" یا "ltr"
  LANG: "fa",
};

const BRAND = {
  blue: "#0b63b0",
  gold: "#f5b200",
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
          `script-src 'nonce-${nonce}'`,
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

/** فقط آدرس‌های https مجازند تا url() در CSS قابل تزریق نباشد. */
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

function render(config, nonce, url) {
  const siteName = escapeHtml(config.SITE_NAME);
  const slogan = escapeHtml(config.SLOGAN);
  const badge = escapeHtml(config.BADGE);
  const description = escapeHtml(config.DESCRIPTION);
  const dir = config.DIR === "ltr" ? "ltr" : "rtl";
  const lang = escapeHtml(config.LANG || "fa");

  const background = safeImageUrl(config.BG_URL);
  const logo = safeImageUrl(config.LOGO_URL);

  const launchTimestamp = Date.parse(config.LAUNCH_DATE);
  const hasCountdown = Number.isFinite(launchTimestamp) && launchTimestamp > Date.now();

  const email = String(config.CONTACT_EMAIL ?? "").trim();
  const contact = email
    ? `<a class="contact" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : "";

  const wordmark = logo
    ? `<img class="logo" src="${escapeHtml(logo)}" alt="${siteName}" width="420" height="140">`
    : `<div class="wordmark">${crownSvg()}<h1>${siteName}</h1></div>`;

  const countdown = hasCountdown
    ? `<div class="countdown" id="countdown" data-deadline="${launchTimestamp}" aria-live="polite">
      ${["days", "hours", "minutes", "seconds"]
        .map(
          (unit) => `<div class="unit">
        <span class="value" id="${unit}">--</span>
        <span class="label">${countdownLabel(unit, dir)}</span>
      </div>`,
        )
        .join("")}
    </div>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${siteName} — ${badge}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="${BRAND.blue}">
<meta property="og:type" content="website">
<meta property="og:title" content="${siteName} — ${badge}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(url.origin)}">
${background ? `<meta property="og:image" content="${escapeHtml(background)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${background ? `<link rel="preload" as="image" href="${escapeHtml(background)}">` : ""}
<style nonce="${nonce}">
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;700;900&display=swap');

:root {
  --gold: ${BRAND.gold};
  --blue: ${BRAND.blue};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  color: #fff;
  font-family: Vazirmatn, ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif;
  text-align: center;
  -webkit-font-smoothing: antialiased;
  /* اگر عکس ست نشده یا لود نشد، این گرادیان دیده می‌شود. */
  background:
    ${background ? `url("${escapeHtml(background)}") center / cover no-repeat fixed,` : ""}
    linear-gradient(180deg, #4aa8e8 0%, #1f7fc4 45%, #0b5a96 72%, #0a4a7d 100%);
}

/* لایه‌ی تیره تا متن روی هر عکسی خوانا بماند (بدون عکس، ملایم‌تر است). */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  background: ${
    background
      ? `radial-gradient(ellipse at center, rgba(4, 22, 42, 0.35) 0%, rgba(4, 22, 42, 0.72) 100%),
    linear-gradient(180deg, rgba(4, 22, 42, 0.3) 0%, rgba(4, 22, 42, 0.55) 100%)`
      : `radial-gradient(ellipse at 50% 40%, rgba(4, 22, 42, 0) 0%, rgba(4, 22, 42, 0.35) 100%)`
  };
}

main {
  position: relative;
  z-index: 1;
  width: min(720px, 100%);
  animation: rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: none; }
}

.logo {
  width: min(420px, 80%);
  height: auto;
  margin-inline: auto;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.45));
}

.wordmark { display: grid; justify-items: center; gap: 0.35rem; }

.crown {
  width: clamp(46px, 9vw, 72px);
  height: auto;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.5));
}

h1 {
  margin: 0;
  font-size: clamp(2.6rem, 11vw, 5.5rem);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.03em;
  text-shadow: 0 8px 34px rgba(0, 20, 45, 0.55);
}

.slogan {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  margin: 1.1rem 0 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(0.72rem, 2.4vw, 0.95rem);
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  direction: ltr;
}

.slogan::before,
.slogan::after {
  content: "";
  width: clamp(20px, 7vw, 54px);
  height: 2px;
  background: var(--gold);
  border-radius: 2px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 2.25rem;
  padding: 0.45rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 0.85rem;
  font-weight: 700;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gold);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.3; transform: scale(0.7); }
}

p.lead {
  margin: 1.25rem auto 0;
  max-width: 44ch;
  color: rgba(255, 255, 255, 0.88);
  font-size: clamp(0.95rem, 2.6vw, 1.1rem);
  line-height: 1.9;
  text-shadow: 0 2px 14px rgba(0, 20, 45, 0.5);
}

.countdown {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(0.5rem, 2.5vw, 1rem);
  margin-top: 2.5rem;
}

.unit {
  min-width: 84px;
  flex: 1 1 84px;
  max-width: 132px;
  padding: 1rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.value {
  display: block;
  font-size: clamp(1.6rem, 5.5vw, 2.3rem);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.label {
  display: block;
  margin-top: 0.35rem;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.78rem;
}

.contact {
  display: inline-block;
  margin-top: 2.25rem;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--gold);
  color: #fff;
  font-size: 0.95rem;
  text-decoration: none;
}

.contact:hover { color: var(--gold); }

footer {
  margin-top: 2.5rem;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.78rem;
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
<main>
  ${wordmark}
  <p class="slogan">${slogan}</p>
  <span class="badge"><span class="dot"></span>${badge}</span>
  <p class="lead">${description}</p>
  ${countdown}
  ${contact}
  <footer>&copy; ${new Date().getUTCFullYear()} ${siteName}</footer>
</main>
${hasCountdown ? countdownScript(nonce) : ""}
</body>
</html>`;
}

function crownSvg() {
  return `<svg class="crown" viewBox="0 0 100 60" fill="none" aria-hidden="true">
    <path d="M8 52 L2 14 L26 30 L50 4 L74 30 L98 14 L92 52 Z" fill="${BRAND.gold}"/>
  </svg>`;
}

function countdownLabel(unit, dir) {
  const fa = { days: "روز", hours: "ساعت", minutes: "دقیقه", seconds: "ثانیه" };
  const en = { days: "days", hours: "hours", minutes: "minutes", seconds: "seconds" };
  return (dir === "rtl" ? fa : en)[unit];
}

function countdownScript(nonce) {
  return `<script nonce="${nonce}">
(function () {
  var root = document.getElementById("countdown");
  var deadline = Number(root.dataset.deadline);
  var fields = ["days", "hours", "minutes", "seconds"].map(function (id) {
    return document.getElementById(id);
  });

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    var left = Math.max(0, deadline - Date.now());
    var seconds = Math.floor(left / 1000);
    var parts = [
      Math.floor(seconds / 86400),
      Math.floor(seconds / 3600) % 24,
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ];
    parts.forEach(function (value, i) {
      fields[i].textContent = i === 0 ? String(value) : pad(value);
    });
    if (left === 0) clearInterval(timer);
  }

  tick();
  var timer = setInterval(tick, 1000);
})();
</script>`;
}
