/**
 * Coming soon landing page, rendered at the edge.
 *
 * All copy comes from `vars` in wrangler.jsonc, so the page can be re-branded
 * without touching this file.
 */

const DEFAULTS = {
  SITE_NAME: "Coming Soon",
  TAGLINE: "به‌زودی",
  DESCRIPTION: "داریم روی چیز تازه‌ای کار می‌کنیم. خیلی زود اینجا می‌بینیمتون.",
  LAUNCH_DATE: "",
  CONTACT_EMAIL: "",
  DIR: "rtl",
  LANG: "fa",
};

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='42' fill='none' stroke='%237c5cff' stroke-width='10'/%3E%3Ccircle cx='50' cy='50' r='10' fill='%237c5cff'/%3E%3C/svg%3E";

export default {
  /**
   * @param {Request} request
   * @param {Record<string, string>} env
   */
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow:\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const config = { ...DEFAULTS, ...env };
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const body = render(config, nonce, url);

    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // The page is generated per request (unique nonce), so don't cache it.
        "cache-control": "no-store",
        "content-security-policy": [
          "default-src 'none'",
          `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
          `script-src 'nonce-${nonce}'`,
          "font-src https://fonts.gstatic.com",
          "img-src data:",
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

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {Record<string, string>} config
 * @param {string} nonce
 * @param {URL} url
 */
function render(config, nonce, url) {
  const siteName = escapeHtml(config.SITE_NAME);
  const tagline = escapeHtml(config.TAGLINE);
  const description = escapeHtml(config.DESCRIPTION);
  const dir = config.DIR === "ltr" ? "ltr" : "rtl";
  const lang = escapeHtml(config.LANG || "fa");

  const launchTimestamp = Date.parse(config.LAUNCH_DATE);
  const hasCountdown = Number.isFinite(launchTimestamp) && launchTimestamp > Date.now();

  const email = config.CONTACT_EMAIL.trim();
  const contact = email
    ? `<a class="contact" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : "";

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
<title>${siteName} — ${tagline}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${siteName} — ${tagline}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(url.origin)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style nonce="${nonce}">
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap');

:root {
  --bg: #06060b;
  --fg: #f4f4f8;
  --muted: #a0a0b4;
  --accent: #7c5cff;
  --accent-soft: rgba(124, 92, 255, 0.16);
  --line: rgba(255, 255, 255, 0.09);
  --card: rgba(255, 255, 255, 0.03);
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f7fb;
    --fg: #14141f;
    --muted: #5a5a72;
    --accent-soft: rgba(124, 92, 255, 0.1);
    --line: rgba(0, 0, 0, 0.09);
    --card: rgba(255, 255, 255, 0.7);
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  background: var(--bg);
  color: var(--fg);
  font-family: Vazirmatn, ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* Two slow-drifting glows behind the card. */
body::before,
body::after {
  content: "";
  position: fixed;
  z-index: -1;
  width: min(70vw, 620px);
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.55;
  animation: drift 22s ease-in-out infinite alternate;
}
body::before { background: var(--accent); top: -18%; inset-inline-start: -12%; }
body::after  { background: #2ad4c1; bottom: -22%; inset-inline-end: -14%; animation-delay: -11s; }

@keyframes drift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to   { transform: translate3d(4%, 8%, 0) scale(1.15); }
}

main {
  width: min(680px, 100%);
  text-align: center;
  padding: clamp(2rem, 6vw, 3.5rem) clamp(1.25rem, 5vw, 3rem);
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
  animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: none; }
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(0.75); }
}

h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(2rem, 7vw, 3.4rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

p.lead {
  margin: 0 auto;
  max-width: 46ch;
  color: var(--muted);
  font-size: clamp(1rem, 2.6vw, 1.125rem);
  line-height: 1.85;
}

.countdown {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(0.5rem, 2.5vw, 1rem);
  margin-top: 2.5rem;
}

.unit {
  min-width: 82px;
  flex: 1 1 82px;
  max-width: 130px;
  padding: 0.9rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--accent-soft);
}

.value {
  display: block;
  font-size: clamp(1.5rem, 5vw, 2.1rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.label {
  display: block;
  margin-top: 0.3rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.contact {
  display: inline-block;
  margin-top: 2.25rem;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--accent);
  color: var(--accent);
  font-size: 0.95rem;
  text-decoration: none;
}

.contact:hover { opacity: 0.75; }

footer {
  margin-top: 2.5rem;
  color: var(--muted);
  font-size: 0.78rem;
  opacity: 0.75;
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
  <span class="badge"><span class="dot"></span>${tagline}</span>
  <h1>${siteName}</h1>
  <p class="lead">${description}</p>
  ${countdown}
  ${contact}
  <footer>&copy; ${new Date().getUTCFullYear()} ${siteName}</footer>
</main>
${hasCountdown ? countdownScript(nonce) : ""}
</body>
</html>`;
}

/**
 * @param {string} unit
 * @param {string} dir
 */
function countdownLabel(unit, dir) {
  const fa = { days: "روز", hours: "ساعت", minutes: "دقیقه", seconds: "ثانیه" };
  const en = { days: "days", hours: "hours", minutes: "minutes", seconds: "seconds" };
  return (dir === "rtl" ? fa : en)[unit];
}

/** @param {string} nonce */
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
