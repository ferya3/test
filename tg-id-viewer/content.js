// Telegram ID Viewer
// آیدی عددی چت‌ها/کاربرها را از ویژگی data-peer-id عناصر دام استخراج کرده
// و به صورت یک برچسب کوچک کنار آن‌ها نمایش می‌دهد.

(function () {
  "use strict";

  const BADGE_CLASS = "tg-id-badge";
  const DONE_ATTR = "data-tg-id-done";

  // از روی عنصری که data-peer-id دارد، آیدی را برمی‌گرداند.
  function getPeerId(el) {
    const raw = el.getAttribute("data-peer-id");
    if (!raw) return null;
    const id = raw.trim();
    if (!id || id === "0") return null;
    return id;
  }

  // یک برچسب آیدی می‌سازد که با کلیک، مقدار را در کلیپ‌بورد کپی می‌کند.
  function makeBadge(id) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = "ID: " + id;
    badge.title = "برای کپی کلیک کنید";
    badge.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      navigator.clipboard
        .writeText(id)
        .then(function () {
          const prev = badge.textContent;
          badge.textContent = "کپی شد ✓";
          setTimeout(function () {
            badge.textContent = prev;
          }, 900);
        })
        .catch(function () {});
    });
    return badge;
  }

  // به یک عنصر دارای peer-id یک برچسب اضافه می‌کند (اگر قبلاً اضافه نشده باشد).
  function annotate(el) {
    if (el.getAttribute(DONE_ATTR) === "1") return;
    const id = getPeerId(el);
    if (!id) return;
    el.setAttribute(DONE_ATTR, "1");
    // موقعیت نسبی لازم است تا برچسب درست بچسبد.
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    el.appendChild(makeBadge(id));
  }

  // همهٔ عناصر دارای data-peer-id را پیدا و برچسب‌گذاری می‌کند.
  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll("[data-peer-id]");
    nodes.forEach(annotate);
    if (scope.hasAttribute && scope.hasAttribute("data-peer-id")) {
      annotate(scope);
    }
  }

  // اجرای اولیه
  scan(document);

  // تغییرات داینامیک تلگرام وب را دنبال می‌کند.
  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
