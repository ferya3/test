// The in-page panel: pick an Excel file, review the contacts it found, then
// add them to the account's address book and create a group with them.
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});
  if (RXG.togglePanel) {
    RXG.togglePanel();
    return;
  }

  const state = {
    client: null,
    me: null,
    contacts: [],
    busy: false,
  };

  // --- DOM helpers ---------------------------------------------------------
  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of [].concat(children)) {
      if (child) node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
  }

  const style = el('style', {
    textContent: `
    #rxg-root{position:fixed;top:0;inset-inline-end:0;z-index:2147483647;width:360px;max-width:100vw;
      height:100vh;background:#fff;color:#1b1b1b;box-shadow:-2px 0 16px rgba(0,0,0,.2);
      font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;display:flex;flex-direction:column;font-size:13px}
    #rxg-root *{box-sizing:border-box}
    #rxg-root header{display:flex;align-items:center;justify-content:space-between;
      padding:12px 14px;background:#7c4dff;color:#fff}
    #rxg-root header b{font-size:14px}
    #rxg-root .x{cursor:pointer;background:none;border:0;color:#fff;font-size:18px;line-height:1}
    #rxg-root .body{padding:14px;overflow:auto;flex:1}
    #rxg-root label{display:block;margin:10px 0 4px;font-weight:bold}
    #rxg-root input,#rxg-root textarea{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;
      font:inherit;direction:ltr;text-align:left}
    #rxg-root textarea{resize:vertical;min-height:70px}
    #rxg-root button.act{width:100%;margin-top:12px;padding:10px;border:0;border-radius:6px;
      background:#7c4dff;color:#fff;font:inherit;font-weight:bold;cursor:pointer}
    #rxg-root button.act:disabled{opacity:.5;cursor:default}
    #rxg-root .hint{color:#666;font-size:11px;margin-top:4px}
    #rxg-root .log{margin-top:12px;border-top:1px solid #eee;padding-top:8px;white-space:pre-wrap;
      direction:rtl;max-height:40vh;overflow:auto}
    #rxg-root .log .err{color:#c62828}
    #rxg-root .log .ok{color:#2e7d32}
    #rxg-root .list{margin-top:8px;max-height:160px;overflow:auto;border:1px solid #eee;border-radius:6px}
    #rxg-root .list div{padding:4px 8px;border-bottom:1px solid #f3f3f3;display:flex;justify-content:space-between}
    #rxg-root .list div span{direction:ltr}
    #rxg-root .step{display:none}
    #rxg-root .step.on{display:block}`,
  });

  const root = el('div', { id: 'rxg-root' });
  const shadowHost = el('div', { id: 'rxg-host' });
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  shadow.append(style, root);

  // --- login step ----------------------------------------------------------
  const authInput = el('input', { placeholder: 'auth (۳۲ کاراکتر)', autocomplete: 'off' });
  const keyInput = el('textarea', { placeholder: '-----BEGIN RSA PRIVATE KEY-----' });
  const loginBtn = el('button', { className: 'act', textContent: 'ورود و اتصال' });
  const loginStep = el('div', { className: 'step on' }, [
    el('div', { className: 'hint', textContent: 'auth و کلید خصوصی همین حساب روبیکا. از حافظهٔ مرورگر پیش‌پر می‌شود اگر موجود باشد.' }),
    el('label', { textContent: 'auth' }),
    authInput,
    el('label', { textContent: 'private key' }),
    keyInput,
    loginBtn,
  ]);

  // --- excel + group step --------------------------------------------------
  const who = el('div', { className: 'hint' });
  const fileInput = el('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
  const listBox = el('div', { className: 'list' });
  const titleInput = el('input', { placeholder: 'نام گروه', dir: 'rtl', style: 'text-align:right' });
  const createBtn = el('button', { className: 'act', textContent: 'ساخت گروه', disabled: true });
  const log = el('div', { className: 'log' });
  const workStep = el('div', { className: 'step' }, [
    who,
    el('label', { textContent: 'فایل اکسل مخاطبین' }),
    fileInput,
    el('div', { className: 'hint', textContent: 'ستون شماره و (اختیاری) نام. شماره‌های ایران پشتیبانی می‌شود.' }),
    listBox,
    el('label', { textContent: 'نام گروه' }),
    titleInput,
    createBtn,
    log,
  ]);

  root.append(
    el('header', {}, [el('b', { textContent: 'ساخت گروه از اکسل' }), el('button', { className: 'x', textContent: '×', onclick: () => remove() })]),
    el('div', { className: 'body' }, [loginStep, workStep]),
  );

  function show(step) {
    loginStep.classList.toggle('on', step === 'login');
    workStep.classList.toggle('on', step === 'work');
  }

  function write(message, cls = '') {
    log.append(el('div', { className: cls, textContent: message }));
    log.scrollTop = log.scrollHeight;
  }

  function remove() {
    shadowHost.remove();
    delete RXG.togglePanel;
  }

  RXG.togglePanel = () => {
    if (shadowHost.isConnected) remove();
    else document.documentElement.append(shadowHost);
  };

  // --- wiring --------------------------------------------------------------
  const prefill = RXG.session.readFromLocalStorage();
  authInput.value = prefill.auth;
  keyInput.value = prefill.privateKey;

  loginBtn.onclick = async () => {
    if (state.busy) return;
    state.busy = true;
    loginBtn.disabled = true;
    loginBtn.textContent = 'در حال اتصال…';
    try {
      const { client, me } = await RXG.session.build({ auth: authInput.value, privateKey: keyInput.value });
      state.client = client;
      state.me = me;
      const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || me.username || 'حساب شما';
      who.textContent = `وارد شدید: ${name}`;
      show('work');
    } catch (err) {
      alert(`ورود ناموفق: ${err.message || err}`);
    } finally {
      state.busy = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'ورود و اتصال';
    }
  };

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    listBox.textContent = '';
    try {
      const { contacts, skipped } = await RXG.excel.readFile(file);
      state.contacts = contacts;
      for (const c of contacts) {
        listBox.append(el('div', {}, [el('b', { textContent: `${c.firstName} ${c.lastName}`.trim() }), el('span', { textContent: c.phone })]));
      }
      createBtn.disabled = contacts.length === 0;
      write(`${contacts.length} مخاطب خوانده شد${skipped ? `، ${skipped} ردیف نامعتبر رد شد` : ''}.`, 'ok');
    } catch (err) {
      write(`خطا در خواندن فایل: ${err.message || err}`, 'err');
    }
  };

  createBtn.onclick = async () => {
    if (state.busy || !state.contacts.length) return;
    const title = titleInput.value.trim();
    if (!title) {
      alert('نام گروه را وارد کنید');
      return;
    }
    state.busy = true;
    createBtn.disabled = true;

    const guids = [];
    try {
      write(`افزودن ${state.contacts.length} مخاطب به دفترچه…`);
      for (const c of state.contacts) {
        try {
          const res = await state.client.call('addAddressBook', {
            phone: c.phone,
            first_name: c.firstName,
            last_name: c.lastName || '',
          });
          const guid = (res.user && res.user.user_guid) || res.user_guid;
          if (guid) {
            guids.push(guid);
          } else {
            write(`${c.phone}: کاربر روبیکا نیست، رد شد`, 'err');
          }
        } catch (err) {
          write(`${c.phone}: ${err.statusDet || err.message || err}`, 'err');
        }
        await RXG.sleep(400); // stay well under the rate limit
      }

      if (!guids.length) {
        write('هیچ مخاطب روبیکایی پیدا نشد؛ گروه ساخته نشد.', 'err');
        return;
      }

      write(`ساخت گروه «${title}» با ${guids.length} عضو…`);
      const group = await state.client.call('addGroup', { title, member_guids: guids });
      const g = group.group || group;
      write(`گروه ساخته شد ✓ (${g.group_guid || ''})`, 'ok');
    } catch (err) {
      write(`ساخت گروه ناموفق: ${err.statusDet || err.message || err}`, 'err');
    } finally {
      state.busy = false;
      createBtn.disabled = false;
    }
  };

  document.documentElement.append(shadowHost);
})();
