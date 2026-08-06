// پوستر افقی (نسبت ۳:۲)
const BG_DESKTOP = "https://REPLACE-ME/poster-landscape.jpg";
// نسخه عمودی برای موبایل. اگر نداری، همین را برابر BG_DESKTOP بگذار.
const BG_MOBILE = BG_DESKTOP;

// رنگ پس‌زمینه پوستر تا نوارهای بالا/پایین دیده نشوند
const BG_COLOR = "#0d0c10";

const html = `<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${BG_COLOR}">
<title>Coming Soon</title>
<link rel="preload" as="image" href="${BG_DESKTOP}" media="(min-width: 768px)">
<link rel="preload" as="image" href="${BG_MOBILE}" media="(max-width: 767px)">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: ${BG_COLOR};
  }
  body {
    height: 100vh;
    height: 100dvh;
  }
  .bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    /* contain یعنی کل پوستر همیشه دیده می‌شود و هیچ لبه‌ای بریده نمی‌شود */
    object-fit: contain;
    object-position: center;
  }
</style>
</head>
<body>
  <picture>
    <source media="(max-width: 767px)" srcset="${BG_MOBILE}">
    <img class="bg" src="${BG_DESKTOP}" alt="Arta Leca — به زودی راه‌اندازی می‌شود" decoding="async" fetchpriority="high">
  </picture>
</body>
</html>`;

export default {
  fetch(request) {
    if (new URL(request.url).pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  },
};
