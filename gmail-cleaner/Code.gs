/**
 * پاک‌کن ایمیل جیمیل — Google Apps Script
 *
 * ایمیل‌ها را با عنوان جستجو می‌کند، تعداد دقیق را نشان می‌دهد و همه را به
 * سطل زباله می‌برد. مستقیم با جیمیل حساب خودتان کار می‌کند؛ نیازی به
 * Google Cloud یا Client ID نیست. راهنمای نصب در README.md است.
 */

var SEARCH_PAGE = 500;      // GmailApp.search returns at most 500 conversations per call
var TRASH_BATCH = 100;      // GmailApp.moveThreadsToTrash takes at most 100 conversations
var SCAN_PAGE = 250;        // conversations read per call while looking for repeats
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
  if (mode === 'from') return 'from:' + clean.replace(/\s/g, '');
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

// Repeated emails usually differ only in numbers and dates, and replies add
// "Re:", so those don't count when grouping by subject. One-letter pieces are
// dropped too: Gmail doesn't split words on half-spaces the way this does.
function subjectKey_(subject) {
  return String(subject || '')
    .replace(/^\s*((re|fwd?|aw|پاسخ|ارسال)\s*:\s*)+/i, '')
    .toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[^\p{L}]+/gu, ' ')
    .split(' ').filter(function (word) { return word.length > 1; })
    .slice(0, 10).join(' ');
}

function senderKey_(from) {
  var match = String(from || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(from || '')).trim().toLowerCase();
}

function tally_(map, key, label) {
  if (map[key]) map[key][0]++;
  else map[key] = [1, label];
}

// Reads conversations from `start` on (newest first, up to `limit` in total) and
// counts them per subject and per sender; the page merges the chunks.
function scanChunk(start, limit) {
  var began = Date.now();
  var scanned = 0;
  var subjects = {};
  var senders = {};
  var done = false;
  while (Date.now() - began < TIME_BUDGET_MS) {
    var size = Math.min(SCAN_PAGE, limit - start - scanned);
    if (size <= 0) { done = true; break; }
    var threads = GmailApp.search('-in:chats', start + scanned, size);
    if (threads.length) {
      GmailApp.getMessagesForThreads(threads).forEach(function (messages) {
        var first = messages[0];
        if (!first) return;
        var subject = first.getSubject();
        var key = subjectKey_(subject);
        if (key) tally_(subjects, key, subject);
        var from = first.getFrom();
        tally_(senders, senderKey_(from), from);
      });
    }
    scanned += threads.length;
    if (threads.length < size) { done = true; break; }
  }
  return { scanned: scanned, done: done, subjects: subjects, senders: senders };
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
  .preview th:nth-child(1) { width:50%; } .preview th:nth-child(3) { width:90px; }
  .repeats th:nth-child(1) { width:80px; } .repeats th:nth-child(3) { width:110px; }
  .repeats td:nth-child(1) { font-weight:700; }
  h2 { font-size:17px; margin:0 0 4px; }
  select { padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg);
    color:var(--text); font:inherit; }
  button.small { padding:2px 12px; font-size:13px; }
  .tabs { display:flex; gap:16px; margin-top:12px; font-size:14px; }
  .tabs label { display:flex; gap:6px; align-items:center; cursor:pointer; }
  .muted { color:var(--muted); font-size:13px; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <h1>پاک‌کن ایمیل جیمیل</h1>

  <form class="card" id="form">
    <label class="field">عنوان ایمیل <small class="muted">(یا آدرس فرستنده)</small>
      <input type="text" id="text" placeholder="مثلاً: گزارش روزانه" autocomplete="off" required>
    </label>
    <div class="modes">
      <label><input type="radio" name="mode" value="words" checked> همه‌ی کلمه‌ها در عنوان باشند <small>(پیشنهادی، هر ترتیبی)</small></label>
      <label><input type="radio" name="mode" value="exact"> دقیقاً همین عبارت در عنوان باشد</label>
      <label><input type="radio" name="mode" value="anywhere"> مثل جستجوی خود جیمیل <small>(عنوان، متن و فرستنده)</small></label>
      <label><input type="radio" name="mode" value="from"> همه‌ی ایمیل‌های این فرستنده <small>(آدرس ایمیل را بنویسید)</small></label>
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
    <table class="preview">
      <thead><tr><th>عنوان</th><th>فرستنده</th><th>تاریخ</th></tr></thead>
      <tbody id="preview"></tbody>
    </table>
    <p class="muted" id="previewNote"></p>
  </section>

  <section class="card" id="repeatsCard">
    <h2>ایمیل‌های پرتکرار</h2>
    <p class="muted">ایمیل‌ها را می‌گردد و عنوان‌ها و فرستنده‌هایی را که بیشتر از همه تکرار شده‌اند نشان می‌دهد. عددهای داخل عنوان (تاریخ، شماره) نادیده گرفته می‌شوند.</p>
    <div class="row">
      <select id="scanLimit">
        <option value="1000000000" selected>همه‌ی ایمیل‌ها</option>
        <option value="100000">۱۰۰٬۰۰۰ ایمیل آخر</option>
        <option value="20000">۲۰٬۰۰۰ ایمیل آخر</option>
        <option value="5000">۵٬۰۰۰ ایمیل آخر</option>
      </select>
      <button type="button" id="scanBtn">پیدا کردن پرتکرارها</button>
      <button type="button" class="secondary" id="scanStopBtn" hidden>توقف</button>
    </div>
    <p class="muted" id="scanStatus"></p>
    <div class="tabs" id="groupTabs" hidden>
      <label><input type="radio" name="group" value="subjects" checked> بر اساس عنوان</label>
      <label><input type="radio" name="group" value="senders"> بر اساس فرستنده</label>
    </div>
    <table class="repeats" id="repeatTable" hidden>
      <thead><tr><th>تعداد</th><th id="repeatHead">عنوان</th><th></th></tr></thead>
      <tbody id="repeatBody"></tbody>
    </table>
  </section>
</main>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var fa = function (n) { return Number(n).toLocaleString('fa-IR'); };
  var state = { text: '', mode: 'words', total: 0, counting: false, busy: false, stop: false, armed: null, picked: null };
  var repeats = { subjects: {}, senders: {}, scanned: 0, scanning: false, stop: false };
  var REPEAT_ROWS = 50;

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
      : m === 'from' ? 'from:' + text.replace(/\\s/g, '')
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
          forgetPicked();
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

  // ---------------------------------------------------------------- repeats

  function group() { return document.querySelector('input[name=group]:checked').value; }

  function mergeCounts(into, from) {
    Object.keys(from).forEach(function (key) {
      if (into[key]) into[key][0] += from[key][0];
      else into[key] = from[key];
    });
  }

  function renderRepeats() {
    var kind = group();
    var map = repeats[kind];
    var keys = Object.keys(map)
      .filter(function (key) { return map[key][0] > 1; })
      .sort(function (a, b) { return map[b][0] - map[a][0]; })
      .slice(0, REPEAT_ROWS);
    $('repeatHead').textContent = kind === 'subjects' ? 'عنوان' : 'فرستنده';
    $('groupTabs').hidden = $('repeatTable').hidden = !repeats.scanned;
    var body = $('repeatBody');
    body.textContent = '';
    keys.forEach(function (key) {
      var tr = document.createElement('tr');
      var count = document.createElement('td');
      count.textContent = fa(map[key][0]);
      // Subjects show the shared words (numbers dropped), with one real subject on hover.
      var label = document.createElement('td');
      label.textContent = kind === 'subjects' ? key : map[key][1] || key;
      label.title = kind === 'subjects' ? 'مثلاً: ' + map[key][1] : key;
      var action = document.createElement('td');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'small secondary';
      button.textContent = 'نمایش و حذف';
      button.addEventListener('click', function () { pickRepeat(kind, key); });
      action.appendChild(button);
      tr.append(count, label, action);
      body.appendChild(tr);
    });
    if (!keys.length && repeats.scanned) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'هنوز موردی با بیش از یک تکرار پیدا نشده.';
      tr.appendChild(td);
      body.appendChild(tr);
    }
  }

  // Fill the search form with the group and run the search, so the count,
  // preview and delete button work exactly as for a typed subject.
  function pickRepeat(kind, key) {
    if (state.busy) return;
    $('text').value = key;
    document.querySelector('input[name=mode][value=' + (kind === 'subjects' ? 'words' : 'from') + ']').checked = true;
    previewQuery();
    state.picked = { kind: kind, key: key };
    window.scrollTo({ top: 0, behavior: 'smooth' });
    doSearch({ preventDefault: function () {} });
  }

  // After a group has been trashed, take it off the repeats list. A subject
  // search also took every subject containing all of its words, in any order.
  function forgetPicked() {
    var picked = state.picked;
    if (!picked) return;
    delete repeats[picked.kind][picked.key];
    if (picked.kind === 'subjects') {
      var words = picked.key.split(' ');
      Object.keys(repeats.subjects).forEach(function (key) {
        var have = key.split(' ');
        if (words.every(function (w) { return have.indexOf(w) >= 0; })) delete repeats.subjects[key];
      });
    }
    state.picked = null;
    renderRepeats();
    $('scanStatus').textContent = 'برای به‌روز شدن همه‌ی عددها، دوباره «پیدا کردن پرتکرارها» را بزنید.';
  }

  async function doScan() {
    var limit = Number($('scanLimit').value);
    repeats.subjects = {};
    repeats.senders = {};
    repeats.scanned = 0;
    repeats.scanning = true;
    repeats.stop = false;
    $('scanBtn').disabled = $('scanLimit').disabled = true;
    $('scanStopBtn').hidden = false;
    $('scanStopBtn').disabled = false;
    renderRepeats();
    try {
      for (;;) {
        $('scanStatus').textContent = 'در حال بررسی... ' + fa(repeats.scanned) + ' گفت‌وگو بررسی شد. (نتایج همین حالا هم قابل استفاده‌اند)';
        var chunk = await call('scanChunk', repeats.scanned, limit);
        repeats.scanned += chunk.scanned;
        mergeCounts(repeats.subjects, chunk.subjects);
        mergeCounts(repeats.senders, chunk.senders);
        renderRepeats();
        if (chunk.done || repeats.stop) break;
      }
      $('scanStatus').textContent = (repeats.stop ? 'متوقف شد. ' : 'تمام شد ✓ ') + fa(repeats.scanned) + ' گفت‌وگو بررسی شد.';
    } catch (err) {
      $('scanStatus').textContent = errorText(err) + ' (' + fa(repeats.scanned) + ' گفت‌وگو بررسی شده بود.)';
    } finally {
      repeats.scanning = false;
      $('scanBtn').disabled = $('scanLimit').disabled = false;
      $('scanStopBtn').hidden = true;
    }
  }

  $('scanBtn').addEventListener('click', doScan);
  $('scanStopBtn').addEventListener('click', function () {
    repeats.stop = true;
    $('scanStopBtn').disabled = true;
  });
  document.querySelectorAll('input[name=group]').forEach(function (radio) {
    radio.addEventListener('change', renderRepeats);
  });

  $('form').addEventListener('submit', doSearch);
  $('trashBtn').addEventListener('click', doTrash);
  $('stopBtn').addEventListener('click', function () {
    state.stop = true;
    $('stopBtn').disabled = true;
  });
  $('text').addEventListener('input', function () {
    state.picked = null;
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
