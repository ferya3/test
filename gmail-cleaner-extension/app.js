'use strict';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const LIST_PAGE_SIZE = 500;   // messages.list maximum
const BATCH_SIZE = 1000;      // batchModify / batchDelete maximum
const PREVIEW_SIZE = 50;
const PREVIEW_CONCURRENCY = 8;

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('fa-IR');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = {
  ids: [],
  includeSpamTrash: false,
  cancelled: false,
};

// ---------------------------------------------------------------- auth & API

async function getToken(interactive) {
  const result = await chrome.identity.getAuthToken({ interactive });
  // Older Chrome versions resolve with the token string, newer ones with { token }.
  return typeof result === 'string' ? result : result?.token;
}

async function api(path, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of [].concat(value)) url.searchParams.append(key, v);
  }

  for (let attempt = 0; ; attempt++) {
    const token = await getToken(true);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }

    let error = {};
    try { error = (await res.json()).error || {}; } catch { /* not JSON */ }
    const reason = error.errors?.[0]?.reason || '';

    if (res.status === 401 && attempt < 2) {
      await chrome.identity.removeCachedAuthToken({ token });
      continue;
    }
    const rateLimited = res.status === 429 || /rateLimit/i.test(reason);
    if ((rateLimited || res.status >= 500) && attempt < 6) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${res.status}: ${error.message || res.statusText}`);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length && !state.cancelled) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------- UI helpers

function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.hidden = !text;
}

function setBusy(busy, label = '') {
  state.cancelled = false;
  for (const id of ['searchBtn', 'trashBtn', 'deleteBtn', 'signIn', 'signOut']) $(id).disabled = busy;
  $('progressCard').hidden = !busy;
  $('cancelBtn').disabled = false;
  $('status').textContent = label;
  $('progress').removeAttribute('value');
}

function setProgress(label, done, total) {
  $('status').textContent = label;
  if (total) {
    $('progress').max = total;
    $('progress').value = done;
  }
}

function buildQuery() {
  // Gmail search has no escape for a double quote inside a phrase, so drop them.
  const subject = $('subject').value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  const from = $('from').value.trim();
  const olderThan = $('olderThan').value;
  if (!subject) return '';
  const parts = [`subject:"${subject}"`];
  if (from) parts.push(`from:(${from})`);
  if (olderThan) parts.push(`older_than:${olderThan}`);
  return parts.join(' ');
}

function header(message, name) {
  return message?.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function renderResults(previews) {
  const count = state.ids.length;
  $('results').hidden = false;
  $('resultCount').textContent = count ? `${fmt(count)} ایمیل پیدا شد` : 'ایمیلی پیدا نشد';
  $('trashBtn').hidden = $('deleteBtn').hidden = count === 0;
  $('previewNote').textContent = count > previews.length
    ? `پیش‌نمایش ${fmt(previews.length)} ایمیل اول. عملیات حذف روی همه‌ی ${fmt(count)} ایمیل انجام می‌شود.`
    : '';

  const body = $('previewBody');
  body.replaceChildren();
  for (const message of previews) {
    if (!message) continue;
    const row = document.createElement('tr');
    const date = new Date(header(message, 'Date'));
    const cells = [
      header(message, 'Subject') || '(بدون عنوان)',
      header(message, 'From'),
      isNaN(date) ? '' : date.toLocaleDateString('fa-IR'),
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      td.title = text;
      row.append(td);
    }
    body.append(row);
  }
}

// ---------------------------------------------------------------- account

async function refreshAccount(interactive) {
  try {
    const token = await getToken(interactive);
    if (!token) throw new Error('no token');
    const profile = await api('/profile');
    $('account').textContent = `${profile.emailAddress} — ${fmt(profile.messagesTotal)} ایمیل`;
    $('signIn').hidden = true;
    $('signOut').hidden = false;
  } catch (err) {
    $('account').textContent = 'وارد نشده‌اید';
    $('signIn').hidden = false;
    $('signOut').hidden = true;
    if (interactive) showMessage(`ورود ناموفق بود: ${err.message}`, true);
  }
}

async function signOut() {
  try {
    const token = await getToken(false);
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
      await chrome.identity.removeCachedAuthToken({ token });
    }
  } catch { /* already signed out */ }
  await chrome.identity.clearAllCachedAuthTokens();
  state.ids = [];
  $('results').hidden = true;
  await refreshAccount(false);
}

// ---------------------------------------------------------------- search

async function search(event) {
  event.preventDefault();
  const q = buildQuery();
  if (!q) return;

  showMessage('');
  $('results').hidden = true;
  state.ids = [];
  state.includeSpamTrash = $('includeSpamTrash').checked;
  setBusy(true, 'در حال جستجو...');

  try {
    let pageToken;
    do {
      const data = await api('/messages', {
        params: {
          q,
          maxResults: LIST_PAGE_SIZE,
          pageToken,
          includeSpamTrash: state.includeSpamTrash,
          fields: 'messages/id,nextPageToken',
        },
      });
      for (const m of data.messages || []) state.ids.push(m.id);
      pageToken = data.nextPageToken;
      setProgress(`در حال جستجو... ${fmt(state.ids.length)} ایمیل تا این لحظه`);
    } while (pageToken && !state.cancelled);

    const stoppedEarly = state.cancelled;
    state.cancelled = false;
    setProgress('در حال دریافت پیش‌نمایش...');
    const previews = await mapLimit(state.ids.slice(0, PREVIEW_SIZE), PREVIEW_CONCURRENCY, (id) =>
      api(`/messages/${id}`, {
        params: {
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
          fields: 'id,payload/headers',
        },
      }).catch(() => null),
    );
    renderResults(previews);
    if (stoppedEarly) {
      showMessage(`جستجو متوقف شد؛ فقط ${fmt(state.ids.length)} ایمیل اول پیدا شده و حذف فقط روی همین‌ها انجام می‌شود.`, true);
    }
  } catch (err) {
    showMessage(`خطا در جستجو: ${err.message}`, true);
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------- delete

async function removeAll(permanent) {
  const total = state.ids.length;
  if (!total) return;

  if (permanent) {
    const answer = prompt(
      `${fmt(total)} ایمیل برای همیشه حذف می‌شوند و قابل بازگشت نیستند.\n` +
      'برای تأیید، کلمه‌ی «حذف» را بنویسید:',
    );
    if (answer?.trim() !== 'حذف') return;
  } else if (!confirm(`${fmt(total)} ایمیل به سطل زباله منتقل شوند؟ (تا ۳۰ روز قابل بازگشت هستند)`)) {
    return;
  }

  showMessage('');
  const verb = permanent ? 'حذف دائمی' : 'انتقال به سطل زباله';
  setBusy(true, `${verb}...`);
  let done = 0;

  try {
    while (done < total && !state.cancelled) {
      const chunk = state.ids.slice(done, done + BATCH_SIZE);
      if (permanent) {
        await api('/messages/batchDelete', { method: 'POST', body: { ids: chunk } });
      } else {
        await api('/messages/batchModify', { method: 'POST', body: { ids: chunk, addLabelIds: ['TRASH'] } });
      }
      done += chunk.length;
      setProgress(`${verb}: ${fmt(done)} از ${fmt(total)}`, done, total);
    }
    showMessage(
      state.cancelled
        ? `متوقف شد. ${fmt(done)} از ${fmt(total)} ایمیل پردازش شد.`
        : `انجام شد. ${fmt(done)} ایمیل ${permanent ? 'برای همیشه حذف شد' : 'به سطل زباله رفت'}.`,
    );
  } catch (err) {
    showMessage(`خطا پس از پردازش ${fmt(done)} ایمیل: ${err.message}`, true);
  } finally {
    state.ids = state.ids.slice(done);
    setBusy(false);
    if (state.ids.length) {
      $('resultCount').textContent = `${fmt(state.ids.length)} ایمیل باقی مانده`;
    } else {
      $('results').hidden = true;
    }
    refreshAccount(false);
  }
}

// ---------------------------------------------------------------- init

function init() {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id || '';
  $('setupWarning').hidden = !clientId.startsWith('YOUR_');

  const updateQuery = () => { $('queryPreview').textContent = buildQuery(); };
  for (const id of ['subject', 'from', 'olderThan']) $(id).addEventListener('input', updateQuery);
  updateQuery();

  $('searchForm').addEventListener('submit', search);
  $('trashBtn').addEventListener('click', () => removeAll(false));
  $('deleteBtn').addEventListener('click', () => removeAll(true));
  $('cancelBtn').addEventListener('click', () => {
    state.cancelled = true;
    $('cancelBtn').disabled = true;
    $('status').textContent = 'در حال توقف...';
  });
  $('signIn').addEventListener('click', () => refreshAccount(true));
  $('signOut').addEventListener('click', signOut);

  refreshAccount(false);
}

init();
