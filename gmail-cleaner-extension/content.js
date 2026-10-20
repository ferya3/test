// Runs inside Gmail. Adds a small panel that searches by subject and deletes
// every match with Gmail's own buttons (select all → "select all conversations
// that match this search" → delete), so no Google Cloud / OAuth setup is needed.
(() => {
  if (window.__gmailSubjectCleaner) return;
  window.__gmailSubjectCleaner = true;

  const MAX_ROUNDS = 5000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const findVisible = (selector, root = document) =>
    root ? [...root.querySelectorAll(selector)].find(visible) : undefined;

  async function waitFor(check, timeout, interval = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = check();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  // Simulate a real click; some Gmail controls only react to mousedown/mouseup.
  function click(el) {
    for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  // ------------------------------------------------------------------ Gmail

  const cleanSubject = (s) => s.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  const buildQuery = (subject) => `subject:"${cleanSubject(subject)}"`;
  const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  const isOnSearch = (query) =>
    decodeURIComponent(location.hash.replace(/\+/g, ' ')) === '#search/' + query;
  const mainArea = () => findVisible('div[role="main"]');
  const toolbar = () => findVisible('div[gh="tm"]');
  const rows = () => {
    const main = mainArea();
    return main ? [...main.querySelectorAll('tr.zA')].filter(visible) : [];
  };

  // Safety net: never press delete unless every visible row really contains the
  // subject. This catches the case where Gmail still shows the inbox (or any
  // other list) instead of our search results.
  function rowsMatch(subject) {
    const words = normalize(subject).split(' ').filter(Boolean);
    const list = rows();
    return list.length > 0 && list.every((row) => {
      const text = normalize(row.textContent);
      return words.every((word) => text.includes(word));
    });
  }

  async function openSearch(query) {
    if (!isOnSearch(query)) location.hash = '#search/' + encodeURIComponent(query);
    await sleep(1500);
    await waitFor(() => isOnSearch(query) && mainArea(), 15000);
    await sleep(800); // let Gmail finish swapping in the result list
  }

  class StepError extends Error {}

  async function deleteAll(subject) {
    const query = buildQuery(subject);
    let pages = 0;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (stopRequested) return setStatus('متوقف شد.');
      setStatus(round === 1 ? 'در حال جستجو...' : 'در حال بررسی ایمیل‌های باقی‌مانده...');
      await openSearch(query);

      const list = rows();
      if (!list.length) {
        return setStatus(round === 1
          ? 'ایمیلی با این عنوان پیدا نشد.'
          : 'تمام شد ✓ همه‌ی ایمیل‌ها به سطل زباله رفتند.', round > 1 ? 'ok' : '');
      }
      if (!rowsMatch(subject)) {
        throw new StepError('ایمیل‌های نمایش‌داده‌شده با عنوان جور نیستند، برای اطمینان کاری انجام نشد. دوباره «حذف همه» را بزنید.');
      }

      const checkbox = findVisible('[role="checkbox"]', toolbar());
      if (!checkbox) throw new StepError('دکمه‌ی «انتخاب همه» پیدا نشد.');

      // The "select all N conversations" link only appears after ticking the
      // checkbox, so whatever link is new afterwards is that one.
      const linkSelector = '[role="link"], span[tabindex="0"]';
      const before = new Set(document.querySelectorAll(linkSelector));
      if (checkbox.getAttribute('aria-checked') !== 'true') click(checkbox);
      await waitFor(() => checkbox.getAttribute('aria-checked') === 'true', 2000);
      const selectAllLink = await waitFor(
        () => [...document.querySelectorAll(linkSelector)].find((el) => !before.has(el) && visible(el)),
        2500,
      );
      if (selectAllLink) {
        click(selectAllLink);
        await sleep(700);
      }

      const tb = toolbar();
      const deleteButton = findVisible('[act="10"]', tb) ||
        findVisible('[aria-label="Delete"], [data-tooltip="Delete"], [aria-label="حذف"], [data-tooltip="حذف"]', tb);
      if (!deleteButton) throw new StepError('دکمه‌ی حذف (سطل زباله) پیدا نشد.');
      click(deleteButton);

      // Gmail asks "Confirm bulk action" when deleting a whole search.
      const dialog = await waitFor(() => findVisible('[role="alertdialog"]'), 3000);
      if (dialog) {
        const ok = dialog.querySelector('button[name="ok"]') ||
          [...dialog.querySelectorAll('button')].find((b) => b.name !== 'cancel');
        if (ok) click(ok);
      }

      pages++;
      setStatus(selectAllLink
        ? 'جیمیل در حال حذف همه‌ی نتایج است؛ برای ایمیل‌های خیلی زیاد ممکن است چند دقیقه طول بکشد...'
        : `صفحه‌ی ${pages.toLocaleString('fa-IR')} حذف شد، ادامه...`);

      const first = list[0];
      await waitFor(() => !visible(first), selectAllLink ? 180000 : 15000);
    }
  }

  // ------------------------------------------------------------------ panel

  let stopRequested = false;
  let running = false;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .panel { width: 320px; max-width: calc(100vw - 32px); background: #fff; color: #1f2328;
        border: 1px solid #d8dee4; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
        padding: 14px; font: 14px/1.7 Vazirmatn, Tahoma, "Segoe UI", sans-serif; direction: rtl; }
      .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .head b { font-size: 15px; }
      .close { border: 0; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: #656d76; padding: 0 4px; }
      input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d8dee4;
        border-radius: 8px; font: inherit; margin-bottom: 10px; }
      .buttons { display: flex; gap: 8px; }
      button.act { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid #1a73e8;
        background: #fff; color: #1a73e8; font: inherit; cursor: pointer; }
      button.danger { background: #d93025; border-color: #d93025; color: #fff; }
      button:disabled { opacity: .5; cursor: not-allowed; }
      .status { margin-top: 10px; min-height: 1.7em; }
      .status.error { color: #d93025; }
      .status.ok { color: #137333; }
      .note { margin-top: 6px; color: #656d76; font-size: 12px; }
      @media (prefers-color-scheme: dark) {
        .panel { background: #1f2227; color: #e6e8eb; border-color: #353a42; }
        input { background: #16181c; color: #e6e8eb; border-color: #353a42; }
        button.act { background: transparent; color: #8ab4f8; border-color: #8ab4f8; }
        button.danger { background: #d93025; border-color: #d93025; color: #fff; }
        .note, .close { color: #9aa1a9; }
      }
    </style>
    <div class="panel">
      <div class="head"><b>پاک‌کن ایمیل با عنوان</b><button class="close" title="بستن">×</button></div>
      <input id="subject" type="text" placeholder="عنوان ایمیل را بنویسید">
      <div class="buttons">
        <button class="act" id="search">نمایش ایمیل‌ها</button>
        <button class="act danger" id="delete">حذف همه</button>
      </div>
      <div class="status" id="status"></div>
      <div class="note">ایمیل‌ها به سطل زباله می‌روند و تا ۳۰ روز قابل بازگشت‌اند. تا تمام شدن کار، این تب را نبندید.</div>
    </div>`;
  document.documentElement.append(host);

  const $ = (id) => shadow.getElementById(id);
  const input = $('subject');
  // Keep Gmail's keyboard shortcuts from firing while typing in the panel.
  for (const type of ['keydown', 'keypress', 'keyup']) input.addEventListener(type, (e) => e.stopPropagation());

  function setStatus(text, kind = '') {
    $('status').textContent = text;
    $('status').className = 'status ' + kind;
  }

  function setRunning(value) {
    running = value;
    stopRequested = false;
    $('search').disabled = value;
    input.disabled = value;
    $('delete').textContent = value ? 'توقف' : 'حذف همه';
  }

  function readSubject() {
    const subject = cleanSubject(input.value);
    if (!subject) setStatus('اول عنوان را بنویسید.', 'error');
    return subject;
  }

  $('search').addEventListener('click', async () => {
    const subject = readSubject();
    if (!subject) return;
    setStatus('در حال جستجو...');
    await openSearch(buildQuery(subject));
    const count = rows().length;
    setStatus(count
      ? 'نتایج در لیست جیمیل نمایش داده شد. اگر درست است «حذف همه» را بزنید.'
      : 'ایمیلی با این عنوان پیدا نشد.');
  });

  $('delete').addEventListener('click', async () => {
    if (running) {
      stopRequested = true;
      setStatus('در حال توقف...');
      return;
    }
    const subject = readSubject();
    if (!subject) return;
    if (!confirm(`همه‌ی ایمیل‌هایی که عنوانشان شامل «${subject}» است به سطل زباله منتقل شوند؟`)) return;

    setRunning(true);
    try {
      await deleteAll(subject);
    } catch (err) {
      const manual = 'جستجو در جیمیل باز است؛ می‌توانید دستی ادامه دهید: تیک بالای لیست ← «Select all conversations» ← سطل زباله.';
      setStatus(err instanceof StepError ? `${err.message} ${manual}` : `خطا: ${err.message}`, 'error');
    } finally {
      setRunning(false);
    }
  });

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('search').click(); });
  shadow.querySelector('.close').addEventListener('click', () => { host.style.display = 'none'; });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'toggle-panel') return;
    const show = host.style.display === 'none';
    host.style.display = show ? 'block' : 'none';
    if (show) input.focus();
  });
})();
