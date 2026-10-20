/**
 * پاک‌کن ایمیل جیمیل — Google Apps Script
 *
 * ایمیل‌ها را با عنوان جستجو می‌کند، تعداد دقیق را نشان می‌دهد و همه را به
 * سطل زباله می‌برد. مستقیم با جیمیل حساب خودتان کار می‌کند؛ نیازی به
 * Google Cloud یا Client ID نیست. راهنمای نصب در README.md است.
 */

var SEARCH_PAGE = 500;      // GmailApp.search returns at most 500 conversations per call
var TRASH_BATCH = 100;      // GmailApp.moveThreadsToTrash takes at most 100 conversations
var TIME_BUDGET_MS = 25000; // keep each call well under Apps Script's 6-minute limit

function doGet() {
  return HtmlService.createHtmlOutput(PAGE_HTML)
    .setTitle('پاک‌کن ایمیل جیمیل')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run this once from the editor so Google asks for permission to access Gmail.
function authorize() {
  Logger.log('دسترسی داده شد. ' + GmailApp.getInboxUnreadCount() + ' ایمیل خوانده‌نشده در اینباکس.');
}

function buildQuery_(text, mode) {
  // Quotes and brackets would break the query; a leading "-" would negate a word.
  var clean = String(text || '').replace(/["()]/g, ' ').replace(/(^|\s)-+/g, '$1').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('عنوان خالی است.');
  if (mode === 'exact') return 'subject:"' + clean + '"';
  if (mode === 'anywhere') return clean;
  return clean.split(' ').map(function (word) { return 'subject:' + word; }).join(' ');
}

// First 30 matching conversations, to check the search is the right one.
function search(text, mode) {
  var query = buildQuery_(text, mode);
  var threads = GmailApp.search(query, 0, 30);
  var messages = threads.length ? GmailApp.getMessagesForThreads(threads) : [];
  var zone = Session.getScriptTimeZone();
  return {
    query: query,
    items: threads.map(function (thread, i) {
      var first = messages[i] && messages[i][0];
      return {
        subject: thread.getFirstMessageSubject() || '(بدون عنوان)',
        from: first ? first.getFrom() : '',
        date: Utilities.formatDate(thread.getLastMessageDate(), zone, 'yyyy/MM/dd'),
      };
    }),
  };
}

// Counts matches from `start` on, as far as the time budget allows; the page
// keeps calling until done, so any number of emails can be counted.
function countChunk(text, mode, start) {
  var query = buildQuery_(text, mode);
  var began = Date.now();
  var counted = 0;
  while (Date.now() - began < TIME_BUDGET_MS) {
    var found = GmailApp.search(query, start + counted, SEARCH_PAGE).length;
    counted += found;
    if (found < SEARCH_PAGE) return { counted: counted, done: true };
  }
  return { counted: counted, done: false };
}

// Moves matches to the trash, 100 at a time, as far as the time budget allows.
// Trashed conversations drop out of the search, so it always takes the first page.
function trashChunk(text, mode) {
  var query = buildQuery_(text, mode);
  var began = Date.now();
  var trashed = 0;
  var seen = {};
  var stale = 0;
  while (Date.now() - began < TIME_BUDGET_MS) {
    var threads = GmailApp.search(query, 0, TRASH_BATCH);
    if (!threads.length) return { trashed: trashed, done: true };
    // Gmail's search index can lag a moment and still return what we just trashed.
    var fresh = threads.filter(function (t) { return !seen[t.getId()]; });
    if (!fresh.length) {
      if (++stale > 5) break;
      Utilities.sleep(2000);
      continue;
    }
    stale = 0;
    GmailApp.moveThreadsToTrash(fresh);
    fresh.forEach(function (t) { seen[t.getId()] = true; });
    trashed += fresh.length;
  }
  return { trashed: trashed, done: false };
}

var PAGE_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1f2328; --muted:#656d76; --border:#d8dee4;
    --primary:#1a73e8; --danger:#d93025; --danger-bg:#fce8e6; --ok:#137333; --ok-bg:#e6f4ea; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16181c; --card:#1f2227; --text:#e6e8eb; --muted:#9aa1a9; --border:#353a42;
      --primary:#8ab4f8; --danger:#f28b82; --danger-bg:#3c1f1d; --ok:#81c995; --ok-bg:#1e3326; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.8 Vazirmatn, Tahoma, "Segoe UI", sans-serif; }
  main { max-width:820px; margin:0 auto; padding:24px 16px 48px; }
  h1 { font-size:22px; margin:0 0 16px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:16px; }
  label.field { display:block; font-weight:600; margin-bottom:10px; }
  input[type=text] { display:block; width:100%; margin-top:4px; padding:10px 12px; border:1px solid var(--border);
    border-radius:8px; background:var(--bg); color:var(--text); font:inherit; }
  .modes { display:flex; flex-direction:column; gap:2px; margin-bottom:12px; font-size:14px; }
  .modes label { display:flex; gap:8px; align-items:center; cursor:pointer; }
  .modes small { color:var(--muted); }
  .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  button { padding:9px 18px; border:1px solid var(--primary); border-radius:8px; background:var(--primary);
    color:#fff; font:inherit; cursor:pointer; }
  button.secondary { background:transparent; color:var(--primary); }
  button.danger { background:var(--danger); border-color:var(--danger); }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .query { color:var(--muted); font-size:13px; }
  /* Not monospace: it breaks the joining of Persian letters. */
  code { display:inline-block; font-family:inherit; unicode-bidi:isolate; overflow-wrap:anywhere;
    background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:0 8px; }
  .msg { padding:12px 16px; border-radius:8px; margin-bottom:16px; background:var(--ok-bg); color:var(--ok); }
  .msg.error { background:var(--danger-bg); color:var(--danger); }
  .big { font-size:20px; font-weight:700; margin:0 0 8px; }
  progress { width:100%; height:10px; margin:8px 0; }
  table { width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; margin-top:12px; }
  th, td { text-align:start; padding:6px 8px; border-bottom:1px solid var(--border); overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; }
  th:nth-child(1) { width:50%; } th:nth-child(3) { width:90px; }
  .muted { color:var(--muted); font-size:13px; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <h1>پاک‌کن ایمیل جیمیل</h1>

  <form class="card" id="form">
    <label class="field">عنوان ایمیل
      <input type="text" id="text" placeholder="مثلاً: گزارش روزانه" autocomplete="off" required>
    </label>
    <div class="modes">
      <label><input type="radio" name="mode" value="words" checked> همه‌ی کلمه‌ها در عنوان باشند <small>(پیشنهادی، هر ترتیبی)</small></label>
      <label><input type="radio" name="mode" value="exact"> دقیقاً همین عبارت در عنوان باشد</label>
      <label><input type="radio" name="mode" value="anywhere"> مثل جستجوی خود جیمیل <small>(عنوان، متن و فرستنده)</small></label>
    </div>
    <div class="row">
      <button type="submit" id="searchBtn">جستجو</button>
      <span class="query">کوئری: <code id="query" dir="ltr"></code></span>
    </div>
  </form>

  <div id="msg" class="msg" hidden></div>

  <section class="card" id="results" hidden>
    <p class="big" id="count"></p>
    <progress id="progress" hidden></progress>
    <div class="row">
      <button type="button" class="danger" id="trashBtn">انتقال همه به سطل زباله</button>
      <button type="button" class="secondary" id="stopBtn" hidden>توقف</button>
    </div>
    <p class="muted">ایمیل‌ها به سطل زباله می‌روند و تا ۳۰ روز قابل بازگشت‌اند. تا تمام شدن کار، این صفحه را نبندید.</p>
    <table>
      <thead><tr><th>عنوان</th><th>فرستنده</th><th>تاریخ</th></tr></thead>
      <tbody id="preview"></tbody>
    </table>
    <p class="muted" id="previewNote"></p>
  </section>
</main>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var fa = function (n) { return Number(n).toLocaleString('fa-IR'); };
  var state = { text: '', mode: 'words', total: 0, counting: false, busy: false, stop: false, armed: null };

  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
      runner[name].apply(runner, args);
    });
  }

  function mode() { return document.querySelector('input[name=mode]:checked').value; }

  function showMsg(text, isError) {
    $('msg').textContent = text || '';
    $('msg').className = 'msg' + (isError ? ' error' : '');
    $('msg').hidden = !text;
  }

  function errorText(err) {
    var text = (err && err.message) || String(err);
    if (/too many times/i.test(text)) {
      return 'سهمیه‌ی روزانه‌ی گوگل برای این کار تمام شد. فردا دوباره «جستجو» و «انتقال همه» را بزنید تا از همان‌جا ادامه دهد.';
    }
    return 'خطا: ' + text;
  }

  function setBusy(busy) {
    state.busy = busy;
    state.stop = false;
    $('searchBtn').disabled = busy;
    $('text').disabled = busy;
    $('trashBtn').disabled = busy || state.counting || !state.total;
    $('stopBtn').hidden = !busy;
    $('stopBtn').disabled = false;
    $('progress').hidden = !busy;
  }

  function showQuery(query) {
    $('query').textContent = query;
    $('query').hidden = !query;
  }

  function previewQuery() {
    var text = $('text').value.replace(/["()]/g, ' ').replace(/\\s+/g, ' ').trim();
    if (!text) { showQuery(''); return; }
    var m = mode();
    showQuery(m === 'exact' ? 'subject:"' + text + '"'
      : m === 'anywhere' ? text
      : text.split(' ').map(function (w) { return 'subject:' + w; }).join(' '));
  }

  function renderPreview(items) {
    var body = $('preview');
    body.textContent = '';
    items.forEach(function (item) {
      var tr = document.createElement('tr');
      [item.subject, item.from, item.date].forEach(function (text) {
        var td = document.createElement('td');
        td.textContent = text;
        td.title = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  async function doSearch(event) {
    event.preventDefault();
    var text = $('text').value.trim();
    if (!text) return;
    state.text = text;
    state.mode = mode();
    state.total = 0;
    showMsg('');
    $('results').hidden = true;
    setBusy(true);
    $('progress').removeAttribute('value');

    try {
      var result = await call('search', state.text, state.mode);
      showQuery(result.query);
      if (!result.items.length) {
        setBusy(false);
        showMsg(state.mode === 'anywhere'
          ? 'ایمیلی پیدا نشد.'
          : 'ایمیلی پیدا نشد. گزینه‌ی «مثل جستجوی خود جیمیل» را امتحان کنید.', true);
        return;
      }
      renderPreview(result.items);
      $('previewNote').textContent = 'پیش‌نمایش ' + fa(result.items.length) + ' مورد اول.';
      $('results').hidden = false;

      state.counting = true;
      var total = 0;
      for (;;) {
        $('count').textContent = 'در حال شمارش... ' + fa(total);
        var chunk = await call('countChunk', state.text, state.mode, total);
        total += chunk.counted;
        if (chunk.done || state.stop) break;
      }
      state.total = total;
      state.counting = false;
      $('count').textContent = fa(total) + ' گفت‌وگو' + (state.stop ? ' (شمارش متوقف شد)' : '') + ' پیدا شد';
    } catch (err) {
      showMsg(errorText(err), true);
    } finally {
      state.counting = false;
      setBusy(false);
    }
  }

  async function doTrash() {
    if (!state.total) return;
    // Two clicks instead of a confirm() dialog, which the Apps Script frame may block.
    if (!state.armed) {
      $('trashBtn').textContent = 'مطمئنید؟ برای تأیید دوباره بزنید';
      state.armed = setTimeout(function () {
        state.armed = null;
        $('trashBtn').textContent = 'انتقال همه به سطل زباله';
      }, 5000);
      return;
    }
    clearTimeout(state.armed);
    state.armed = null;
    $('trashBtn').textContent = 'انتقال همه به سطل زباله';

    showMsg('');
    setBusy(true);
    var done = 0;
    var emptyRounds = 0;
    $('progress').max = state.total;
    $('progress').value = 0;
    try {
      for (;;) {
        $('count').textContent = 'در حال انتقال به سطل زباله... ' + fa(Math.min(done, state.total)) + ' از ' + fa(state.total);
        var chunk = await call('trashChunk', state.text, state.mode);
        done += chunk.trashed;
        $('progress').value = Math.min(done, state.total);
        if (chunk.done) {
          $('count').textContent = 'تمام شد ✓';
          // A lagging search index can hand back a conversation twice; never report more than were found.
          showMsg(fa(Math.min(done, state.total)) + ' گفت‌وگو به سطل زباله رفت.');
          state.total = 0;
          $('preview').textContent = '';
          $('previewNote').textContent = '';
          break;
        }
        emptyRounds = chunk.trashed ? 0 : emptyRounds + 1;
        if (emptyRounds >= 3) {
          showMsg('جیمیل جواب نمی‌دهد. چند دقیقه بعد دوباره «جستجو» و «انتقال همه» را بزنید.', true);
          break;
        }
        if (state.stop) {
          showMsg('متوقف شد. ' + fa(done) + ' گفت‌وگو به سطل زباله رفت.');
          state.total = Math.max(state.total - done, 0);
          $('count').textContent = 'حدود ' + fa(state.total) + ' گفت‌وگو باقی مانده';
          break;
        }
      }
    } catch (err) {
      showMsg(errorText(err) + ' (تا این لحظه ' + fa(done) + ' گفت‌وگو به سطل زباله رفت.)', true);
    } finally {
      setBusy(false);
    }
  }

  $('form').addEventListener('submit', doSearch);
  $('trashBtn').addEventListener('click', doTrash);
  $('stopBtn').addEventListener('click', function () {
    state.stop = true;
    $('stopBtn').disabled = true;
  });
  $('text').addEventListener('input', function () {
    previewQuery();
    // The delete button acts on the last search; typing something new needs a new search.
    state.total = 0;
    $('results').hidden = true;
  });
  document.querySelectorAll('input[name=mode]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      previewQuery();
      state.total = 0;
      $('results').hidden = true;
    });
  });
</script>
</body>
</html>`;
