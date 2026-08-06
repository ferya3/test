// ---------------------------------------------------------------------------
// تنظیمات
// ---------------------------------------------------------------------------

const POSTER = "https://REPLACE-ME/poster-landscape.jpg";

// تاریخ رونمایی به وقت تهران (‎+03:30). این را حتماً عوض کن.
const LAUNCH_AT = "2026-08-29T00:00:00+03:30";

// رنگ پس‌زمینه پوستر
const BG_COLOR = "#0d0c10";

// نسبت ابعاد پوستر (عرض تقسیم بر ارتفاع). برای ۱۵۳۶×۱۰۲۴ می‌شود ۱.۵
const ASPECT = 1.5;

// جای شمارنده روی پوستر، به درصدِ ابعاد خودِ پوستر.
// اگر جعبه‌ها دقیق روی هم نیفتادند، همین چهار عدد را کم/زیاد کن.
const CD = { left: 8.27, top: 68.6, width: 27.3, height: 8.4 };

// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${BG_COLOR}">
<title>Coming Soon</title>
<link rel="preload" as="image" href="${POSTER}">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: ${BG_COLOR};
  }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }

  /* استیج دقیقاً هم‌نسبتِ پوستر است، پس هر چیزی که با درصد داخلش بگذاریم
     روی همان نقطه از عکس می‌نشیند، در هر اندازه‌ای از صفحه */
  .stage {
    position: relative;
    width: min(100vw, calc(100dvh * ${ASPECT}));
    aspect-ratio: ${ASPECT};
    container-type: size;
  }

  .poster {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* شمارنده‌ی چاپ‌شده روی عکس را می‌پوشاند */
  .patch {
    position: absolute;
    left: ${CD.left - 1.2}%;
    top: ${CD.top - 1.6}%;
    width: ${CD.width + 2.4}%;
    height: ${CD.height + 3.2}%;
    background: ${BG_COLOR};
  }

  .countdown {
    position: absolute;
    left: ${CD.left}%;
    top: ${CD.top}%;
    width: ${CD.width}%;
    height: ${CD.height}%;
    display: flex;
    gap: 1.1cqw;
    direction: ltr;
  }

  .cell {
    flex: 1;
    border: 1px solid rgba(240, 115, 34, 0.38);
    border-radius: 0.55cqw;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15cqw;
  }

  .num {
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 2.9cqw;
    font-weight: 700;
    line-height: 1;
    color: #f07322;
    font-variant-numeric: tabular-nums;
  }

  .lbl {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 1.05cqw;
    line-height: 1;
    color: #e8e8e8;
  }
</style>
</head>
<body>
  <div class="stage">
    <img class="poster" src="${POSTER}" alt="Arta Leca — به زودی راه‌اندازی می‌شود" fetchpriority="high">
    <div class="patch"></div>
    <div class="countdown">
      <div class="cell"><span class="num" id="d">--</span><span class="lbl">روز</span></div>
      <div class="cell"><span class="num" id="h">--</span><span class="lbl">ساعت</span></div>
      <div class="cell"><span class="num" id="m">--</span><span class="lbl">دقیقه</span></div>
      <div class="cell"><span class="num" id="s">--</span><span class="lbl">ثانیه</span></div>
    </div>
  </div>

<script>
  var target = new Date("${LAUNCH_AT}").getTime();
  var el = { d: document.getElementById("d"), h: document.getElementById("h"),
             m: document.getElementById("m"), s: document.getElementById("s") };

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function tick() {
    var left = Math.max(0, target - Date.now());
    var sec = Math.floor(left / 1000);
    el.d.textContent = pad(Math.floor(sec / 86400));
    el.h.textContent = pad(Math.floor(sec / 3600) % 24);
    el.m.textContent = pad(Math.floor(sec / 60) % 60);
    el.s.textContent = pad(sec % 60);
  }

  tick();
  setInterval(tick, 1000);
</script>
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
