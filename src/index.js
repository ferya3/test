// عکس افقی برای دسکتاپ/تبلت
const BG_DESKTOP = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2400&q=80";
// عکس عمودی برای موبایل. اگر عکس جدا نداری، همین را برابر BG_DESKTOP بگذار.
const BG_MOBILE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&h=2000&q=80";

const html = `<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>Coming Soon</title>
<link rel="preload" as="image" href="${BG_DESKTOP}" media="(min-width: 768px)">
<link rel="preload" as="image" href="${BG_MOBILE}" media="(max-width: 767px)">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #000;
    overflow: hidden;
  }
  body {
    /* dvh با نوار آدرس موبایل جمع/باز می‌شود؛ vh برای مرورگرهای قدیمی */
    height: 100vh;
    height: 100dvh;
  }
  .bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
</style>
</head>
<body>
  <picture>
    <source media="(max-width: 767px)" srcset="${BG_MOBILE}">
    <img class="bg" src="${BG_DESKTOP}" alt="" decoding="async" fetchpriority="high">
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
